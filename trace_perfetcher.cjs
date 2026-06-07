#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SABIAN_ROOT = __dirname;
const FETCHERS_DIR = path.join(SABIAN_ROOT, 'historical', 'fetchers');
const LOG_DIR = path.join(SABIAN_ROOT, 'shepherd_logs');
const OUTPUT_FILE = path.join(LOG_DIR, 'perfetcher_calls.txt');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const TARGET_FETCHERS = [
  'military_proximity',
  'pipeline_risk',
  'port_congestion',
  'rail_corridor',
  'resource_conflict',
  'prediction_market',
  'seismic',
  'gps_jamming',
  'health_crisis',
  'maritime_trade',
  'iom_displacement',
  'ooni'
];

const out = [];
const log = (...args) => out.push(args.join(' '));

log('PER-FETCHER CALL TRACE');
log('Generated:', new Date().toISOString());
log('═'.repeat(80));
log('');

for (const fetcherName of TARGET_FETCHERS) {
  const filePath = path.join(FETCHERS_DIR, `${fetcherName}_historical.cjs`);

  log(`[${fetcherName}_historical.cjs]`);
  log('-'.repeat(60));

  let src;
  try {
    src = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    log(`  ERROR: Could not read file - ${e.message}`);
    log('');
    continue;
  }

  const lines = src.split('\n');
  const urlPatterns = [
    // Direct URL strings
    /https?:\/\/[^\s'"`,)}\]]+/gi,
    // Template literals with URLs
    /`[^`]*https?:\/\/[^`]+`/gi,
    // fetch() calls
    /fetch\s*\([^)]+\)/gi,
    // axios calls
    /axios\.(get|post|put|delete)\s*\([^)]+\)/gi,
    // http/https.request or .get
    /https?\.(request|get)\s*\(/gi,
  ];

  const hostPattern = /https?:\/\/([^\/\s'"`:${}]+)/i;
  const callEntries = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // Look for URL-building patterns
    let hosts = [];

    // Extract hosts from URLs in the line
    const urlMatches = line.match(/https?:\/\/[^\s'"`,)}\]${}]+/gi) || [];
    for (const url of urlMatches) {
      const hostMatch = url.match(hostPattern);
      if (hostMatch) {
        hosts.push(hostMatch[1].replace(/['"`,)}\]]+$/, ''));
      }
    }

    // Check for template literal URL construction
    if (/\$\{.*\}.*https?:\/\/|https?:\/\/.*\$\{/.test(line)) {
      const hostMatch = line.match(hostPattern);
      if (hostMatch) {
        hosts.push(hostMatch[1].replace(/['"`,)}\]]+$/, ''));
      }
    }

    // Check for variable-based URL construction (like baseUrl + path)
    if (/(?:url|endpoint|api|host|base)\s*[+=]/i.test(line) && /['"`]/.test(line)) {
      // Try to extract host from partial URL
      const partialMatch = line.match(/['"`](https?:\/\/[^'"`\s]+)['"`]/i);
      if (partialMatch) {
        const hm = partialMatch[1].match(hostPattern);
        if (hm) hosts.push(hm[1]);
      }
    }

    // Check for fetch/request with URL
    if (/fetch\s*\(|\.request\s*\(|\.get\s*\(|axios\./i.test(line)) {
      // Already captured hosts above, but flag the line as a call site
      if (hosts.length === 0) {
        // Variable reference - look for the variable definition nearby
        const varMatch = line.match(/(?:fetch|request|get)\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (varMatch) {
          hosts.push(`[var:${varMatch[1]}]`);
        }
      }
    }

    // Dedupe hosts for this line
    hosts = [...new Set(hosts)];

    if (hosts.length > 0) {
      callEntries.push({ lineNum, hosts, content: line.trim().slice(0, 120) });
    }
  }

  // Also scan for const/let URL definitions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Look for URL constant definitions
    if (/(?:const|let|var)\s+\w*(?:url|endpoint|api|base|host)\w*\s*=/i.test(line)) {
      const hostMatch = line.match(hostPattern);
      if (hostMatch) {
        const host = hostMatch[1].replace(/['"`,)}\]]+$/, '');
        const existing = callEntries.find(e => e.lineNum === lineNum);
        if (!existing) {
          callEntries.push({ lineNum, hosts: [host], content: line.trim().slice(0, 120) });
        }
      }
    }
  }

  // Sort by line number
  callEntries.sort((a, b) => a.lineNum - b.lineNum);

  // Dedupe by line number
  const seen = new Set();
  const uniqueEntries = callEntries.filter(e => {
    if (seen.has(e.lineNum)) return false;
    seen.add(e.lineNum);
    return true;
  });

  // Categorize
  const gdeltCalls = [];
  const iodaCalls = [];
  const otherCalls = [];

  for (const entry of uniqueEntries) {
    const hostsLower = entry.hosts.map(h => h.toLowerCase()).join(' ');
    if (hostsLower.includes('gdelt')) {
      gdeltCalls.push(entry);
    } else if (hostsLower.includes('ioda') || hostsLower.includes('inetintel')) {
      iodaCalls.push(entry);
    } else {
      otherCalls.push(entry);
    }
  }

  if (otherCalls.length > 0) {
    log('  PRIMARY SIGNAL CALLS:');
    for (const e of otherCalls) {
      log(`    L${e.lineNum}: ${e.hosts.join(', ')}`);
      log(`      ${e.content}`);
    }
  } else {
    log('  PRIMARY SIGNAL CALLS: (none found)');
  }

  if (gdeltCalls.length > 0) {
    log('');
    log('  GDELT CALLS:');
    for (const e of gdeltCalls) {
      log(`    L${e.lineNum}: ${e.hosts.join(', ')}`);
      log(`      ${e.content}`);
    }
  }

  if (iodaCalls.length > 0) {
    log('');
    log('  IODA CALLS:');
    for (const e of iodaCalls) {
      log(`    L${e.lineNum}: ${e.hosts.join(', ')}`);
      log(`      ${e.content}`);
    }
  }

  if (gdeltCalls.length === 0 && iodaCalls.length === 0) {
    log('');
    log('  GDELT/IODA CALLS: (none)');
  }

  log('');
  log(`  SUMMARY: ${otherCalls.length} primary, ${gdeltCalls.length} GDELT, ${iodaCalls.length} IODA`);
  log('');
  log('');
}

log('═'.repeat(80));
log('TOTALS');
log('-'.repeat(40));

let totalPrimary = 0, totalGdelt = 0, totalIoda = 0;
for (const fetcherName of TARGET_FETCHERS) {
  const filePath = path.join(FETCHERS_DIR, `${fetcherName}_historical.cjs`);
  let src;
  try { src = fs.readFileSync(filePath, 'utf8'); } catch (e) { continue; }

  const hasGdelt = /gdelt/i.test(src);
  const hasIoda = /ioda|inetintel/i.test(src);

  if (hasGdelt) totalGdelt++;
  if (hasIoda) totalIoda++;
}

log(`Fetchers analyzed: ${TARGET_FETCHERS.length}`);
log(`Fetchers with GDELT references: ${totalGdelt}`);
log(`Fetchers with IODA references: ${totalIoda}`);

fs.writeFileSync(OUTPUT_FILE, out.join('\n') + '\n');
console.log(OUTPUT_FILE);
