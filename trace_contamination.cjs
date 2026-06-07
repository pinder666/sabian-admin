#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SABIAN_ROOT = __dirname;
const FETCHERS_DIR = path.join(SABIAN_ROOT, 'historical', 'fetchers');
const LOG_DIR = path.join(SABIAN_ROOT, 'shepherd_logs');
const OUTPUT_FILE = path.join(LOG_DIR, 'contamination_trace.txt');
const SIGNAL_CENSUS = path.join(SABIAN_ROOT, 'signal_census.cjs');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const NEEDLE_SUDAN = 'Sudan civil war RSF';
const NEEDLE_IODA = 'ioda.inetintel';

const out = [];
const log = (...args) => out.push(args.join(' '));

log('CONTAMINATION TRACE');
log('Generated:', new Date().toISOString());
log('═'.repeat(80));
log('');

// ─── HELPER: grep file for needles ─────────────────────────────────────────
function grepFile(filePath, needles) {
  const results = [];
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const needle of needles) {
        if (line.includes(needle)) {
          results.push({ file: filePath, line: i + 1, needle, content: line.trimEnd() });
        }
      }
    });
  } catch (e) {}
  return results;
}

// ─── HELPER: extract local require() paths from source ────────────────────
function extractLocalRequires(src, baseDir) {
  const requires = [];
  const re = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const reqPath = m[1];
    if (reqPath.startsWith('.') || reqPath.startsWith('/')) {
      let resolved;
      try {
        resolved = require.resolve(path.resolve(baseDir, reqPath));
      } catch (e) {
        const tryPath = path.resolve(baseDir, reqPath);
        if (fs.existsSync(tryPath)) resolved = tryPath;
        else if (fs.existsSync(tryPath + '.js')) resolved = tryPath + '.js';
        else if (fs.existsSync(tryPath + '.cjs')) resolved = tryPath + '.cjs';
      }
      if (resolved && !requires.includes(resolved)) requires.push(resolved);
    }
  }
  return requires;
}

// ─── SHARED-IMPORT TRACE ───────────────────────────────────────────────────
log('SHARED-IMPORT TRACE');
log('-'.repeat(80));
log('');

const fetcherFiles = fs.readdirSync(FETCHERS_DIR)
  .filter(f => f.endsWith('.cjs'))
  .map(f => path.join(FETCHERS_DIR, f));

const needles = [NEEDLE_SUDAN, NEEDLE_IODA];
const contaminatedFetchers = [];
const sharedModuleHits = {};
const allModuleContamination = [];

for (const fetcherPath of fetcherFiles) {
  const fetcherName = path.basename(fetcherPath);
  let src;
  try { src = fs.readFileSync(fetcherPath, 'utf8'); } catch (e) { continue; }

  const directHits = grepFile(fetcherPath, needles);
  const localRequires = extractLocalRequires(src, path.dirname(fetcherPath));
  const moduleHits = [];

  for (const modPath of localRequires) {
    const hits = grepFile(modPath, needles);
    moduleHits.push(...hits);
    if (hits.length > 0) {
      const relPath = path.relative(SABIAN_ROOT, modPath);
      if (!sharedModuleHits[relPath]) sharedModuleHits[relPath] = { fetchers: [], hits: [] };
      if (!sharedModuleHits[relPath].fetchers.includes(fetcherName)) {
        sharedModuleHits[relPath].fetchers.push(fetcherName);
      }
      sharedModuleHits[relPath].hits.push(...hits);
    }
  }

  const allHits = [...directHits, ...moduleHits];
  if (allHits.length > 0) {
    contaminatedFetchers.push({ name: fetcherName, localRequires, hits: allHits });
    allModuleContamination.push(...allHits);

    log(`[${fetcherName}]`);
    for (const hit of allHits) {
      const relPath = path.relative(SABIAN_ROOT, hit.file);
      log(`  ${relPath}:${hit.line}  [${hit.needle}]`);
      log(`    ${hit.content.slice(0, 200)}`);
    }
    log('');
  }
}

if (contaminatedFetchers.length === 0) {
  log('  (no fetchers contain either needle directly or in local requires)');
  log('');
}

// ─── SHARED MODULES WITH GDELT/IODA CALLS ──────────────────────────────────
log('');
log('SHARED MODULES (require()d by 2+ contaminated fetchers with gdelt/ioda call)');
log('-'.repeat(80));

const sharedWithCalls = [];
for (const [modPath, data] of Object.entries(sharedModuleHits)) {
  if (data.fetchers.length < 2) continue;

  const fullPath = path.join(SABIAN_ROOT, modPath);
  let modSrc;
  try { modSrc = fs.readFileSync(fullPath, 'utf8'); } catch (e) { continue; }

  const gdeltLines = [];
  const iodaLines = [];
  const lines = modSrc.split('\n');

  lines.forEach((line, i) => {
    if (/gdelt/i.test(line) && (line.includes('http') || line.includes('url') || line.includes('fetch') || line.includes('api.gdeltproject'))) {
      gdeltLines.push({ line: i + 1, content: line.trimEnd() });
    }
    if (/ioda/i.test(line) && (line.includes('http') || line.includes('url') || line.includes('fetch') || line.includes('inetintel'))) {
      iodaLines.push({ line: i + 1, content: line.trimEnd() });
    }
  });

  if (gdeltLines.length > 0 || iodaLines.length > 0) {
    sharedWithCalls.push({ modPath, fetchers: data.fetchers, gdeltLines, iodaLines });
    log(`[${modPath}]`);
    log(`  Required by: ${data.fetchers.join(', ')}`);
    for (const g of gdeltLines) {
      log(`  GDELT ${modPath}:${g.line}`);
      log(`    ${g.content.slice(0, 200)}`);
    }
    for (const i of iodaLines) {
      log(`  IODA ${modPath}:${i.line}`);
      log(`    ${i.content.slice(0, 200)}`);
    }
    log('');
  }
}

if (sharedWithCalls.length === 0) {
  log('  (no shared modules found with gdelt/ioda URL construction)');
}

// ─── HARNESS ISOLATION TRACE ───────────────────────────────────────────────
log('');
log('');
log('HARNESS ISOLATION TRACE');
log('-'.repeat(80));
log('');

let censusSrc;
try { censusSrc = fs.readFileSync(SIGNAL_CENSUS, 'utf8'); } catch (e) {
  log('ERROR: Could not read signal_census.cjs');
  censusSrc = '';
}

const censusLines = censusSrc.split('\n');

// Find enableIntercept function
log('enableIntercept function:');
let enableStart = -1, enableEnd = -1;
for (let i = 0; i < censusLines.length; i++) {
  if (/^function\s+enableIntercept\s*\(/.test(censusLines[i])) {
    enableStart = i;
    let braceCount = 0;
    for (let j = i; j < censusLines.length; j++) {
      braceCount += (censusLines[j].match(/{/g) || []).length;
      braceCount -= (censusLines[j].match(/}/g) || []).length;
      if (braceCount === 0 && j > i) {
        enableEnd = j;
        break;
      }
    }
    break;
  }
}

let interceptCallsReset = false;
if (enableStart >= 0 && enableEnd >= 0) {
  for (let i = enableStart; i <= enableEnd; i++) {
    const line = censusLines[i];
    log(`  ${i + 1}: ${line}`);
    if (/_interceptedCalls\s*=\s*\[\]/.test(line)) {
      interceptCallsReset = true;
    }
  }
} else {
  log('  (function not found)');
}
log('');
log(`  _interceptedCalls reset to []: ${interceptCallsReset ? 'YES' : 'NO'}`);

// Find disableIntercept + waitForResponses usage in runProducer
log('');
log('disableIntercept + waitForResponses in runProducer:');

let runProducerStart = -1, runProducerEnd = -1;
for (let i = 0; i < censusLines.length; i++) {
  if (/^async\s+function\s+runProducer\s*\(/.test(censusLines[i])) {
    runProducerStart = i;
    let braceCount = 0;
    for (let j = i; j < censusLines.length; j++) {
      braceCount += (censusLines[j].match(/{/g) || []).length;
      braceCount -= (censusLines[j].match(/}/g) || []).length;
      if (braceCount === 0 && j > i) {
        runProducerEnd = j;
        break;
      }
    }
    break;
  }
}

let hasDisableIntercept = false;
let hasAwaitWaitForResponses = false;
let disableBeforeNextEnable = false;

if (runProducerStart >= 0 && runProducerEnd >= 0) {
  let disableLineNum = -1;
  let waitLineNum = -1;
  let enableAfterDisable = false;

  for (let i = runProducerStart; i <= runProducerEnd; i++) {
    const line = censusLines[i];

    if (/disableIntercept\s*\(/.test(line)) {
      hasDisableIntercept = true;
      disableLineNum = i;
      log(`  ${i + 1}: ${line}`);
    }

    if (/await\s+waitForResponses\s*\(/.test(line)) {
      hasAwaitWaitForResponses = true;
      waitLineNum = i;
      log(`  ${i + 1}: ${line}`);
    }

    if (/enableIntercept\s*\(/.test(line) && disableLineNum > 0 && i > disableLineNum) {
      enableAfterDisable = true;
    }
  }

  disableBeforeNextEnable = hasDisableIntercept && (!enableAfterDisable || (hasAwaitWaitForResponses && waitLineNum < runProducerEnd));
} else {
  log('  (runProducer not found)');
}

log('');
log(`  disableIntercept called: ${hasDisableIntercept ? 'YES' : 'NO'}`);
log(`  await waitForResponses called: ${hasAwaitWaitForResponses ? 'YES' : 'NO'}`);

// ─── VERDICT ───────────────────────────────────────────────────────────────
log('');
log('');
log('VERDICT');
log('-'.repeat(80));
log(`  _interceptedCalls reset before each fetcher: ${interceptCallsReset ? 'YES' : 'NO'}`);
log(`  await on in-flight responses before next enableIntercept: ${hasAwaitWaitForResponses ? 'YES' : 'NO'}`);

// ─── FINAL LINE ────────────────────────────────────────────────────────────
log('');
log('');
log('═'.repeat(80));

let source = 'UNDETERMINED';
if (sharedWithCalls.length > 0) {
  const modNames = sharedWithCalls.map(s => s.modPath).join(', ');
  source = `SHARED_IMPORT ${modNames}`;
} else if (!interceptCallsReset || !hasAwaitWaitForResponses) {
  source = 'HARNESS_LEAK';
}

log(`SOURCE: ${source}`);

// Write output
fs.writeFileSync(OUTPUT_FILE, out.join('\n') + '\n');
console.log(OUTPUT_FILE);
