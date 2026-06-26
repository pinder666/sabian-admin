// sabian_api.cjs
// Sabian Unified Intelligence API — single server replacing api_server.cjs, hive_backend.cjs, sabian_command_api.cjs
// Serves convergence data from Supabase + triggers scans + delivers briefings
// Auth: Bearer token (SMART_SABIAN_API_KEY in .env)
// Port: 5000

require('dotenv').config({ path: './.env' });
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { logToHive } = require('./logger.cjs');
const { getLatestScores, getHistory, getSignalPatterns, testConnection } = require('./sabian_persistence.cjs');
const { getCountryLedger, getOpenObservations, getLedgerStats } = require('./observation_ledger.cjs');
const runConvergence = require('./convergence_engine.cjs');
const runBriefing = require('./government_briefing.cjs');

const app = express();
// Railway injects PORT; fallback to API_PORT or 5000 for local dev
const PORT             = process.env.PORT || process.env.API_PORT || 5000;
const INTERNAL_API_KEY = process.env.SMART_SABIAN_API_KEY || 'sabian_key';
const BUYER_API_KEY    = process.env.BUYER_API_KEY || 'test_key';
const USER_API_KEY     = process.env.USER_API_KEY || 'sabian_user_2026';

// ── Access tier system ────────────────────────────────────────────────────────
// public   — no auth. Scores and risk bands only.
// buyer    — BUYER_API_KEY or USER_API_KEY. Full signal breakdown, history, ledger, briefings.
// internal — SMART_SABIAN_API_KEY. Everything: hive, admin, scan triggers.
const TIER_RANK = { public: 0, buyer: 1, internal: 2 };

function resolveTier(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token === INTERNAL_API_KEY)                           req.tier = 'internal';
  else if (BUYER_API_KEY && token === BUYER_API_KEY)        req.tier = 'buyer';
  else if (USER_API_KEY && token === USER_API_KEY)          req.tier = 'buyer';
  else                                                      req.tier = 'public';
  next();
}

function requireTier(minTier) {
  return (req, res, next) => {
    if (TIER_RANK[req.tier] >= TIER_RANK[minTier]) return next();
    if (req.tier === 'public') return res.status(401).json({ error: 'Authentication required', tier_required: minTier });
    return res.status(403).json({ error: 'Insufficient access tier', your_tier: req.tier, tier_required: minTier });
  };
}

app.use(express.json());

// Open MCT assets and dashboard
app.use('/openmct', express.static(path.join(__dirname, 'node_modules', 'openmct', 'dist')));
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));
// Sabian.ai marketing landing page at root
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'landing.html')));
// Open MCT intelligence terminal
app.get('/terminal', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'index.html')));

// CORS for dashboard
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(resolveTier);

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'online', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

// ── Tier identity — lets a caller verify what their key grants ─────────────────
app.get('/api/tier', (req, res) => {
  const tiers = {
    public:   'Scores and risk bands only. No authentication required.',
    buyer:    'Full signal breakdown, 90-day history, observation ledger, historical briefings.',
    internal: 'Full access including hive patterns, scan triggers, and admin endpoints.',
  };
  res.json({ tier: req.tier, description: tiers[req.tier] });
});

// ── Latest global threat table ─────────────────────────────────────────────────
// Returns all countries sorted by score descending
app.get('/api/threats', requireTier('buyer'), async (req, res) => {
  try {
    const scores = await getLatestScores();
    if (!Array.isArray(scores)) return res.status(503).json({ error: 'Database unavailable' });

    const level = req.query.level; // ?level=CRITICAL or WARNING
    const theater = req.query.theater; // ?theater=AFRICOM
    const limit = parseInt(req.query.limit || '100');

    let filtered = scores;
    if (level) filtered = filtered.filter(s => s.risk_level === level.toUpperCase());
    if (theater) filtered = filtered.filter(s => s.theater === theater.toUpperCase());

    res.json({
      count: filtered.slice(0, limit).length,
      scan_date: filtered[0]?.scan_date || null,
      countries: filtered.slice(0, limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Single country — current score + signal breakdown + history ────────────────
app.get('/api/country/:name', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.name);
  const days = parseInt(req.query.days || '90');

  try {
    const [scores, history] = await Promise.all([
      getLatestScores(),
      getHistory(country, days)
    ]);

    const current = Array.isArray(scores)
      ? scores.find(s => s.country.toLowerCase() === country.toLowerCase())
      : null;

    res.json({
      country,
      current: current || null,
      history: history.history || [],
      days_of_data: history.history?.length || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Run a fresh convergence score for one country (live, not cached) ───────────
app.get('/api/score/:name', requireTier('internal'), async (req, res) => {
  const country = decodeURIComponent(req.params.name);
  const date = req.query.date || null;

  try {
    console.log(`[API] Live score request: ${country}${date ? ` @ ${date}` : ''}`);
    const result = await runConvergence(country, date);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pattern library — serves pre-computed findings from miner ──────────────────
app.get('/api/patterns/library', requireTier('buyer'), (req, res) => {
  try {
    const findingsPath = path.join(__dirname, 'historical', 'deep_pattern_findings_v2.json');
    if (!fs.existsSync(findingsPath)) {
      return res.status(404).json({ error: 'Pattern library not yet generated' });
    }
    const raw = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));

    const findings = [];

    // LEAD with score shifts — real events
    for (const s of (raw.scoreShifts || [])) {
      findings.push({ category: 'score_shift', payload: s, hasCountry: true });
    }

    // Going dark events — filter out noise (darkYears > 50)
    for (const e of (raw.goingDark?.events || [])) {
      if ((e.darkYears || 0) <= 50) {
        findings.push({ category: 'going_dark_event', payload: e, hasCountry: true });
      }
    }
    for (const d of (raw.darkestCountries || [])) {
      findings.push({ category: 'darkest_country', payload: d, hasCountry: true });
    }
    for (const p of (raw.conditionalProb || [])) {
      findings.push({ category: 'conditional_probability', payload: p, hasCountry: false });
    }
    for (const [signal, data] of Object.entries(raw.recoveryCurves || {})) {
      findings.push({ category: 'recovery_curve', payload: { signal, ...data }, hasCountry: false });
    }
    for (const fm of (raw.firstMover?.firstMovers || [])) {
      findings.push({ category: 'first_mover', payload: fm, hasCountry: false });
    }
    for (const s of (raw.goingDarkSequences || [])) {
      findings.push({ category: 'going_dark_sequence', payload: s, hasCountry: false });
    }
    for (const r of (raw.regionalDivergence || [])) {
      findings.push({ category: 'regional_divergence', payload: r, hasCountry: false, hasRegion: true });
    }

    res.json({
      findings,
      meta: raw.meta || {},
      generatedAt: raw.meta?.generatedAt || null,
      totalFindings: findings.length
    });
  } catch (err) {
    console.error('Pattern library error:', err);
    res.status(500).json({ error: 'Failed to load pattern library' });
  }
});

// ── Collapse patterns — returns signal pairs with lift, countries, timing ──────
app.get('/api/collapse/patterns', requireTier('buyer'), (req, res) => {
  try {
    const findingsPath = path.join(__dirname, 'historical', 'deep_pattern_findings_v2.json');
    if (!fs.existsSync(findingsPath)) {
      return res.status(404).json({ error: 'Collapse patterns not computed. Run miner first.' });
    }
    const raw = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
    const cp = raw.collapsePatterns;
    if (!cp) {
      return res.status(404).json({ error: 'Collapse patterns not computed. Run miner first.' });
    }

    // Return signal pairs with evidence (strength > 0), sorted by strength
    const patterns = (cp.signalPairs || [])
      .filter(p => p.lift && p.lift.strength && p.lift.strength > 0)
      .map(p => ({
        fingerprint: p.fingerprint,
        signalPair: p.signalPair,
        domainPair: p.domainPair,
        lift: p.lift,
        leadTimeDistribution: p.leadTimeDistribution,
        countries: p.countries,
        countryCount: p.countryCount,
        instances: p.instances
      }));

    // Extractive watchlist
    const extractiveWatchlist = cp.extractiveWatchlist || [];

    res.json({
      patterns,
      extractiveWatchlist,
      filters: cp.filters || {},
      totalShiftsAnalyzed: cp.totalShiftsAnalyzed,
      shiftsWithData: cp.shiftsWithData,
      generatedAt: raw.meta?.generatedAt || null
    });
  } catch (err) {
    console.error('Collapse patterns error:', err);
    res.status(500).json({ error: 'Failed to load collapse patterns' });
  }
});

// ── Signal pattern query — which countries show a specific signal at threshold ──
app.get('/api/patterns/:signal', requireTier('buyer'), async (req, res) => {
  const signal = decodeURIComponent(req.params.signal);
  const threshold = parseInt(req.query.threshold || '70');
  const days = parseInt(req.query.days || '90');

  try {
    const result = await getSignalPatterns(signal, threshold, days);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AFRICOM / theater rollup ────────────────────────────────────────────────────
app.get('/api/theater/:name', requireTier('buyer'), async (req, res) => {
  const theater = req.params.name.toUpperCase();
  try {
    const scores = await getLatestScores();
    if (!Array.isArray(scores)) return res.status(503).json({ error: 'Database unavailable' });

    const countries = scores.filter(s => s.theater === theater);
    const critical = countries.filter(s => s.risk_level === 'CRITICAL');
    const warning  = countries.filter(s => s.risk_level === 'WARNING');
    const avg = countries.length
      ? Math.round(countries.reduce((s, c) => s + (c.convergence_score || 0), 0) / countries.length)
      : null;

    res.json({
      theater,
      country_count: countries.length,
      average_score: avg,
      critical_count: critical.length,
      warning_count: warning.length,
      critical_countries: critical.map(c => c.country),
      warning_countries: warning.map(c => c.country),
      all: countries
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Summary dashboard data ─────────────────────────────────────────────────────
app.get('/api/summary', requireTier('buyer'), async (req, res) => {
  try {
    const scores = await getLatestScores();
    if (!Array.isArray(scores)) return res.status(503).json({ error: 'Database unavailable' });

    const byLevel = { CRITICAL: [], WARNING: [], ELEVATED: [], STABLE: [] };
    const byTheater = {};
    for (const s of scores) {
      (byLevel[s.risk_level] || byLevel.STABLE).push(s.country);
      if (s.theater) {
        byTheater[s.theater] = byTheater[s.theater] || { countries: 0, critical: 0, warning: 0 };
        byTheater[s.theater].countries++;
        if (s.risk_level === 'CRITICAL') byTheater[s.theater].critical++;
        if (s.risk_level === 'WARNING')  byTheater[s.theater].warning++;
      }
    }

    res.json({
      total_countries: scores.length,
      scan_date: scores[0]?.scan_date || null,
      by_level: {
        CRITICAL: { count: byLevel.CRITICAL.length, countries: byLevel.CRITICAL },
        WARNING:  { count: byLevel.WARNING.length,  countries: byLevel.WARNING  },
        ELEVATED: { count: byLevel.ELEVATED.length, countries: byLevel.ELEVATED },
        STABLE:   { count: byLevel.STABLE.length,   countries: byLevel.STABLE   }
      },
      by_theater: byTheater,
      top_5: scores.slice(0, 5).map(s => ({ country: s.country, score: s.convergence_score, level: s.risk_level, theater: s.theater }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Trigger full global scan manually (responds immediately, runs async) ──────
app.post('/api/scan/trigger', requireTier('internal'), (req, res) => {
  const scanDate = req.body?.date || null;
  res.json({ status: 'started', message: 'Global scan running in background — check /public-api/summary for results', scan_date: scanDate || new Date().toISOString().slice(0, 10) });
  logToHive({ source: 'sabian_api', level: 'intel', event: 'manual_scan_triggered', data: { scan_date: scanDate, ip: req.ip }, tags: ['scan', 'manual'] });
  runGlobalScan(scanDate, { save: true }).then(r => {
    logToHive({ source: 'sabian_api', level: 'intel', event: 'manual_scan_complete', data: { countries: r?.results?.length || 0 }, tags: ['scan'] });
  }).catch(err => {
    logToHive({ source: 'sabian_api', level: 'error', event: 'manual_scan_failed', data: { error: err.message }, tags: ['scan', 'error'] });
  });
});

// ── Trigger forward briefing for any country (responds immediately, generates async) ──
app.post('/api/brief/:country', requireTier('internal'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const mode = req.body?.mode || 'forward';
  const date = req.body?.date || null;

  res.json({ status: 'queued', country, mode, message: 'Briefing generating — check audio_sessions/gov/' });

  runBriefing(country, mode, date)
    .then(result => logToHive({ source: 'sabian_api', level: 'intel', event: 'briefing_complete', data: result, tags: ['gov', 'api'] }))
    .catch(err => logToHive({ source: 'sabian_api', level: 'error', event: 'briefing_failed', data: { country, error: err.message }, tags: ['gov', 'error'] }));
});

// ── Observation ledger — full history for a country ───────────────────────────
// GET /api/observations/:country?limit=100
app.get('/api/observations/:country', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const limit   = parseInt(req.query.limit || '100');
  try {
    const [ledger, open] = await Promise.all([
      getCountryLedger(country, limit),
      getOpenObservations(country)
    ]);
    res.json({
      country,
      total:        ledger.observations.length,
      open_count:   open.open.length,
      observations: ledger.observations
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Observation ledger — global stats (hit rate, dossier summary) ─────────────
// GET /api/observations/stats
app.get('/public-api/observations/stats', async (req, res) => {
  try {
    const stats = await getLedgerStats();
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/observations/stats', requireTier('buyer'), async (req, res) => {
  try {
    const stats = await getLedgerStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public read-only API — no auth, safe for dashboard and buyer demos ────────
// These mirror the authenticated /api/* routes but skip Bearer requirement.
// Key is never exposed to the browser. Only GET/read operations allowed.

app.get('/public-api/threats', async (req, res) => {
  try {
    const result = await getLatestScores();
    const scores = result.countries;
    const meta   = result.meta || {};
    if (!Array.isArray(scores)) return res.status(503).json({ error: 'Database unavailable' });
    const level   = req.query.level;
    const theater = req.query.theater;
    const limit   = parseInt(req.query.limit || '500');
    let filtered  = scores;
    if (level)   filtered = filtered.filter(s => s.risk_level === level.toUpperCase());
    if (theater) filtered = filtered.filter(s => s.theater   === theater.toUpperCase());
    res.json({
      count: filtered.slice(0, limit).length,
      total_countries: meta.total_countries || null,
      scanned_today: meta.scanned_today || 0,
      last_scan_timestamp: meta.last_scan_timestamp || null,
      countries: filtered.slice(0, limit)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/country/:name', async (req, res) => {
  const country = decodeURIComponent(req.params.name);
  const days    = parseInt(req.query.days || '90');
  try {
    const [scores, history] = await Promise.all([getLatestScores(), getHistory(country, days)]);
    const current = Array.isArray(scores) ? scores.find(s => s.country.toLowerCase() === country.toLowerCase()) : null;
    res.json({ country, current: current || null, history: history.history || [], days_of_data: history.history?.length || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fetch the 5 live signal labels from signal_readings for a country
app.get('/public-api/live-signals/:country', async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const LIVE_SIGNALS = ['Displacement', 'Economic Stress', 'Food Security', 'Satellite Fire', 'Climate Stress'];
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabase
      .from('signal_readings')
      .select('signal_name, label, scan_date')
      .eq('country', country)
      .in('signal_name', LIVE_SIGNALS)
      .order('scan_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Take most recent per signal
    const latest = {};
    for (const row of (data || [])) {
      if (!latest[row.signal_name]) {
        latest[row.signal_name] = row;
      }
    }

    res.json({ country, signals: Object.values(latest) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FAMINE RISK: IPC phase map (public, no auth) ───────────────────────────
app.get('/public-api/famine-risk', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabase
      .from('signal_readings')
      .select('country, label, scan_date')
      .eq('signal_name', 'Food Security')
      .order('scan_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Dedupe to latest per country, parse IPC phase from label
    const latest = {};
    for (const row of (data || [])) {
      if (latest[row.country]) continue;
      const match = (row.label || '').match(/phase\s+(\d)/i);
      if (!match) continue; // No parseable phase — skip
      const phase = parseInt(match[1], 10);
      if (phase < 1 || phase > 5) continue; // Invalid phase
      latest[row.country] = {
        country: row.country,
        phase,
        label: row.label,
        scan_date: row.scan_date
      };
    }

    // Sort by phase descending (worst first), then country name
    const sorted = Object.values(latest).sort((a, b) => {
      if (b.phase !== a.phase) return b.phase - a.phase;
      return a.country.localeCompare(b.country);
    });

    res.json({ total: sorted.length, countries: sorted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/public-api/famine-why/:country', async (req, res) => {
  try {
    const country = decodeURIComponent(req.params.country);
    const ISO2_MAP = {
      'Sudan': 'SD', 'Somalia': 'SO', 'South Sudan': 'SS', 'Afghanistan': 'AF',
      'Burkina Faso': 'BF', 'DRC': 'CD', 'Ethiopia': 'ET', 'Haiti': 'HT',
      'Kenya': 'KE', 'Madagascar': 'MG', 'Malawi': 'MW', 'Mali': 'ML',
      'Nigeria': 'NG', 'Yemen': 'YE', 'Zimbabwe': 'ZW', 'Angola': 'AO',
      'Burundi': 'BI', 'Cameroon': 'CM', 'Central African Republic': 'CF',
      'Chad': 'TD', 'Djibouti': 'DJ', 'El Salvador': 'SV', 'Guatemala': 'GT',
      'Honduras': 'HN', 'Lebanon': 'LB', 'Lesotho': 'LS', 'Mauritania': 'MR',
      'Mozambique': 'MZ', 'Nicaragua': 'NI', 'Niger': 'NE', 'Syria': 'SY',
      'Togo': 'TG', 'Uganda': 'UG', 'Zambia': 'ZM', 'Rwanda': 'RW',
      'Sierra Leone': 'SL', 'Venezuela': 'VE', 'Liberia': 'LR'
    };

    const iso2 = ISO2_MAP[country];
    if (!iso2) return res.status(404).json({ error: 'No IPC mapping for ' + country });

    const fdwRes = await fetch(`https://fdw.fews.net/api/ipcphase/?country_code=${iso2}&format=json`);
    const fdwData = await fdwRes.json();

    if (!Array.isArray(fdwData) || fdwData.length === 0) {
      return res.json({ country, iso2, reporting_date: null, worst_regions: [] });
    }

    const publicRows = fdwData.filter(r => r.data_usage_policy === 'Public');
    if (publicRows.length === 0) {
      return res.json({ country, iso2, reporting_date: null, worst_regions: [] });
    }

    const latestDate = publicRows.reduce((max, r) => r.reporting_date > max ? r.reporting_date : max, '');
    const latestRows = publicRows.filter(r => r.reporting_date === latestDate);

    // Dedupe by region, keep highest phase
    const regionMap = {};
    for (const r of latestRows.filter(r => r.unit_type !== 'national')) {
      const key = r.geographic_unit_name;
      if (!regionMap[key] || r.value > regionMap[key].value) {
        regionMap[key] = r;
      }
    }

    const worst_regions = Object.values(regionMap)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(r => ({
        region: r.geographic_unit_name,
        phase: r.value,
        classification: r.description
      }));

    const anyRow = latestRows[0] || {};

    res.json({
      country,
      iso2,
      reporting_date: latestDate,
      worst_regions,
      source_document: anyRow.source_document || null,
      source_organization: anyRow.source_organization || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/public-api/summary', async (req, res) => {
  try {
    const scores = await getLatestScores();
    if (!Array.isArray(scores)) return res.status(503).json({ error: 'Database unavailable' });
    const byLevel = { CRITICAL: [], WARNING: [], ELEVATED: [], STABLE: [] };
    const byTheater = {};
    for (const s of scores) {
      (byLevel[s.risk_level] || byLevel.STABLE).push(s.country);
      if (s.theater) {
        byTheater[s.theater] = byTheater[s.theater] || { countries: 0, critical: 0, warning: 0 };
        byTheater[s.theater].countries++;
        if (s.risk_level === 'CRITICAL') byTheater[s.theater].critical++;
        if (s.risk_level === 'WARNING')  byTheater[s.theater].warning++;
      }
    }
    res.json({
      total_countries: scores.length,
      scan_date:       scores[0]?.scan_date || null,
      by_level: {
        CRITICAL: { count: byLevel.CRITICAL.length, countries: byLevel.CRITICAL },
        WARNING:  { count: byLevel.WARNING.length,  countries: byLevel.WARNING  },
        ELEVATED: { count: byLevel.ELEVATED.length, countries: byLevel.ELEVATED },
        STABLE:   { count: byLevel.STABLE.length,   countries: byLevel.STABLE   }
      },
      by_theater: byTheater,
      top_5: scores.slice(0, 5).map(s => ({ country: s.country, score: s.convergence_score, level: s.risk_level, theater: s.theater }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/theater/:name', async (req, res) => {
  const theater = req.params.name.toUpperCase();
  try {
    const scores    = await getLatestScores();
    if (!Array.isArray(scores)) return res.status(503).json({ error: 'Database unavailable' });
    const countries = scores.filter(s => s.theater === theater);
    const critical  = countries.filter(s => s.risk_level === 'CRITICAL');
    const warning   = countries.filter(s => s.risk_level === 'WARNING');
    const avg       = countries.length ? Math.round(countries.reduce((s, c) => s + (c.convergence_score || 0), 0) / countries.length) : null;
    res.json({ theater, country_count: countries.length, average_score: avg, critical_count: critical.length, warning_count: warning.length, critical_countries: critical.map(c => c.country), warning_countries: warning.map(c => c.country), all: countries });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/findings', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('latent_findings')
      .select('*')
      .gte('n', 30)
      .order('n', { ascending: false });
    if (error) throw error;
    const gated = (data || []).filter(f =>
      f.ci_low !== null && f.ci_high !== null &&
      !(f.ci_low <= 0 && f.ci_high >= 0)
    );
    res.json({ count: gated.length, findings: gated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/observations/:country', async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const limit   = parseInt(req.query.limit || '100');
  try {
    const [ledger, open] = await Promise.all([getCountryLedger(country, limit), getOpenObservations(country)]);
    const observations   = ledger.observations || [];

    // Attach checkpoint timeline (recorded + upcoming) to each observation
    if (observations.length) {
      const { createClient } = require('@supabase/supabase-js');
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const obsIds = observations.map(o => o.id).filter(Boolean);
      const { data: cpRows } = await sb
        .from('observation_checkpoints')
        .select('observation_id,checkpoint_day,checkpoint_date,score_at_checkpoint,level_at_checkpoint,score_delta,top_signals,summary')
        .in('observation_id', obsIds);

      const cpMap = {};
      for (const cp of (cpRows || [])) {
        if (!cpMap[cp.observation_id]) cpMap[cp.observation_id] = [];
        cpMap[cp.observation_id].push(cp);
      }

      const CHECKPOINT_DAYS = [30, 42, 56, 70, 84, 183, 365];
      for (const obs of observations) {
        const recorded     = cpMap[obs.id] || [];
        const recordedDays = new Set(recorded.map(cp => cp.checkpoint_day));
        const upcoming     = CHECKPOINT_DAYS
          .filter(d => !recordedDays.has(d))
          .map(d => {
            const dt = new Date(obs.scan_date);
            dt.setDate(dt.getDate() + d);
            return { checkpoint_day: d, checkpoint_date: dt.toISOString().slice(0, 10), status: 'PENDING', is_grade_day: d === 84 };
          });
        obs.checkpoints = [
          ...recorded.map(cp => ({ ...cp, status: 'RECORDED', is_grade_day: cp.checkpoint_day === 84 })),
          ...upcoming
        ].sort((a, b) => a.checkpoint_day - b.checkpoint_day);
      }
    }

    res.json({ country, total: observations.length, open_count: open.open.length, observations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Historical intelligence — Paperclip briefings ─────────────────────────────
// GET /api/briefing/historical/:country   — full formatted brief from country_briefings (buyer+)
// GET /api/hive/patterns                  — all hive observations surfaced by hive_reader (internal)

app.get('/api/briefing/historical/:country', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('country_briefings')
      .select('*')
      .ilike('country', country)
      .order('as_of_year', { ascending: false })
      .limit(1);
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: `No briefing found for ${country}` });
    res.json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Time machine — query synthesis state for any past year ────────────────────
// GET /api/timemachine/:country/:year  (buyer+) — full synthesis + script + briefing
// GET /public-api/timemachine/:country/:year     — score and risk band only

app.get('/api/timemachine/:country/:year', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const year    = parseInt(req.params.year);
  if (!year || year < 1789 || year > new Date().getFullYear()) {
    return res.status(400).json({ error: `Year must be between 1789 and ${new Date().getFullYear()}` });
  }
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const [synthRes, scriptRes, briefRes] = await Promise.all([
      sb.from('synthesis_records').select('*').ilike('country', country).eq('as_of_year', year).limit(1),
      sb.from('synthesis_scripts').select('*').ilike('country', country).eq('as_of_year', year).limit(1),
      sb.from('country_briefings').select('*').ilike('country', country).eq('as_of_year', year).eq('vertical', 'sabian').limit(1),
    ]);
    if (synthRes.error) return res.status(500).json({ error: synthRes.error.message });
    if (!synthRes.data || synthRes.data.length === 0) {
      return res.status(404).json({ error: `No synthesis record found for ${country} in ${year}` });
    }
    res.json({
      country,
      year,
      synthesis:  synthRes.data[0],
      script:     scriptRes.data?.[0]  || null,
      briefing:   briefRes.data?.[0]   || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/timemachine/:country/:year', async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const year    = parseInt(req.params.year);
  if (!year || year < 1789 || year > new Date().getFullYear()) {
    return res.status(400).json({ error: `Year must be between 1789 and ${new Date().getFullYear()}` });
  }
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('synthesis_records')
      .select('country,as_of_year,current_score,baseline_score,score_delta,trajectory,signals_active')
      .ilike('country', country)
      .eq('as_of_year', year)
      .limit(1);
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: `No record for ${country} in ${year}` });
    res.json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Country clustering ─────────────────────────────────────────────────────────
// GET /api/clusters              (buyer+) — all cluster assignments for current year
// GET /api/cluster/:country      (buyer+) — which cluster is this country in + peers
// GET /public-api/cluster/:country        — cluster id and label only

app.get('/api/clusters', requireTier('buyer'), async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const year = parseInt(req.query.year || new Date().getFullYear());
    const { data, error } = await sb
      .from('country_clusters')
      .select('country,cluster_id,cluster_label,dominant_signal,centroid_dist,as_of_year')
      .eq('as_of_year', year)
      .order('cluster_id')
      .order('centroid_dist');
    if (error) return res.status(500).json({ error: error.message });
    // Group by cluster
    const grouped = {};
    for (const r of (data || [])) {
      if (!grouped[r.cluster_id]) grouped[r.cluster_id] = { cluster_id: r.cluster_id, label: r.cluster_label, dominant_signal: r.dominant_signal, countries: [] };
      grouped[r.cluster_id].countries.push({ country: r.country, centroid_dist: r.centroid_dist });
    }
    res.json({ year, cluster_count: Object.keys(grouped).length, clusters: Object.values(grouped) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/cluster/:country', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('country_clusters')
      .select('*')
      .ilike('country', country)
      .order('as_of_year', { ascending: false })
      .limit(1);
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: `No cluster found for ${country}` });
    res.json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/cluster/:country', async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('country_clusters')
      .select('country,cluster_id,cluster_label,dominant_signal,as_of_year')
      .ilike('country', country)
      .order('as_of_year', { ascending: false })
      .limit(1);
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: `No cluster for ${country}` });
    res.json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Alert subscriptions ────────────────────────────────────────────────────────
// POST /api/alerts/subscribe   (buyer+) — create a subscription
// GET  /api/alerts             (buyer+) — list subscriptions for this key
// DELETE /api/alerts/:id       (buyer+) — cancel a subscription
// GET  /api/alerts/events      (buyer+) — recent alert events
// GET  /api/alerts/events/all  (internal) — all events across all subscribers

app.post('/api/alerts/subscribe', requireTier('buyer'), async (req, res) => {
  const { country, alert_type, threshold_value, webhook_url, label } = req.body || {};
  const VALID_TYPES = ['score_above','score_below','trajectory_change','lead_signal_active','cluster_change'];
  if (!country)                        return res.status(400).json({ error: 'country required' });
  if (!alert_type)                     return res.status(400).json({ error: 'alert_type required' });
  if (!VALID_TYPES.includes(alert_type)) return res.status(400).json({ error: `alert_type must be one of: ${VALID_TYPES.join(', ')}` });
  if (['score_above','score_below'].includes(alert_type) && threshold_value === undefined) {
    return res.status(400).json({ error: 'threshold_value required for score_above / score_below' });
  }
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    // Use the bearer token as subscriber_id so subscriptions are scoped to the caller
    const subscriber_id = (req.headers.authorization || '').replace('Bearer ', '').slice(0, 64);
    const { data, error } = await sb
      .from('alert_subscriptions')
      .upsert({ subscriber_id, country, alert_type, threshold_value: threshold_value ?? null, webhook_url: webhook_url || null, label: label || null, active: true },
               { onConflict: 'subscriber_id,country,alert_type' })
      .select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ subscribed: true, subscription: data?.[0] || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/alerts', requireTier('buyer'), async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const subscriber_id = (req.headers.authorization || '').replace('Bearer ', '').slice(0, 64);
    const { data, error } = await sb
      .from('alert_subscriptions')
      .select('*')
      .eq('subscriber_id', subscriber_id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ count: (data || []).length, subscriptions: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/alerts/:id', requireTier('buyer'), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const subscriber_id = (req.headers.authorization || '').replace('Bearer ', '').slice(0, 64);
    const { error } = await sb
      .from('alert_subscriptions')
      .update({ active: false })
      .eq('id', id)
      .eq('subscriber_id', subscriber_id); // scoped to caller — buyers can't cancel others' subs
    if (error) return res.status(500).json({ error: error.message });
    res.json({ cancelled: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/alerts/events', requireTier('buyer'), async (req, res) => {
  const limit = parseInt(req.query.limit || '50');
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const subscriber_id = (req.headers.authorization || '').replace('Bearer ', '').slice(0, 64);
    // Only return events for this subscriber's subscriptions
    const { data: subs } = await sb.from('alert_subscriptions').select('id').eq('subscriber_id', subscriber_id);
    const subIds = (subs || []).map(s => s.id);
    if (subIds.length === 0) return res.json({ count: 0, events: [] });
    const { data, error } = await sb
      .from('alert_events')
      .select('*')
      .in('subscription_id', subIds)
      .order('fired_at', { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ count: (data || []).length, events: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/alerts/events/all', requireTier('internal'), async (req, res) => {
  const limit = parseInt(req.query.limit || '100');
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('alert_events')
      .select('*')
      .order('fired_at', { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ count: (data || []).length, events: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/hive/patterns', requireTier('internal'), async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('hive_observations')
      .select('*')
      .order('severity', { ascending: false })
      .order('surfaced_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ count: (data || []).length, patterns: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DB health ──────────────────────────────────────────────────────────────────
app.get('/api/db/status', requireTier('internal'), async (req, res) => {
  const result = await testConnection();
  res.json(result);
});

// ── Historical Analogue Engine — Intelligence Dossiers ─────────────────────────
// GET /api/intelligence/:country         (buyer+) — full country dossier
// GET /api/intelligence/:country/pdf     (buyer+) — downloadable PDF dossier
// GET /api/intelligence/:country/audio   (buyer+) — audio generation status / trigger
// GET /api/intelligence/precrisis        (buyer+) — all countries in pre-crisis signature
// GET /api/intelligence/patterns/report  (buyer+) — latest daily pattern report

const { generateDossier, generateDossierPDF } = require('./historical/dossier_generator.cjs');
const { generateDossierAudio, getLatestAudio } = require('./historical/dossier_audio.cjs');

app.get('/api/intelligence/:country', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  try {
    const dossier = await generateDossier(country);
    res.json(dossier);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/intelligence/:country/pdf', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  try {
    const timestamp = Date.now();
    const countrySlug = country.toLowerCase().replace(/\s+/g, '_');
    const outputDir = path.join(__dirname, 'data', 'dossiers');
    if (!require('fs').existsSync(outputDir)) require('fs').mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${countrySlug}_${timestamp}.pdf`);
    const { dossier } = await generateDossierPDF(country, outputPath);
    res.download(outputPath, `Sabian_Intelligence_Dossier_${country}.pdf`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/intelligence/:country/audio', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  try {
    const existing = getLatestAudio(country);
    if (existing.available) {
      return res.json({ status: 'available', audio: existing });
    }
    // Generate audio from fresh dossier
    const dossier = await generateDossier(country);
    const audioResult = await generateDossierAudio(country, dossier.insight.audioScript);
    res.json({ status: 'generated', audio: audioResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/intelligence/precrisis', requireTier('buyer'), async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    // Get all countries with elevated scores and certain signal patterns
    const { data, error } = await sb
      .from('historical_convergence_scores')
      .select('country,year,score,breakdown')
      .gte('score', 65)
      .order('year', { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });

    // Filter to most recent year per country and check pre-crisis signatures
    const latestByCountry = {};
    for (const r of (data || [])) {
      if (!latestByCountry[r.country] || r.year > latestByCountry[r.country].year) {
        latestByCountry[r.country] = r;
      }
    }

    const preCrisis = [];
    for (const [country, r] of Object.entries(latestByCountry)) {
      const bd = r.breakdown || {};
      const economicStress = bd.economic_stress?.stress_z || 0;
      const capitalFlows = bd.capital_flows?.stress_z || 0;

      if (economicStress > 0.5 || (capitalFlows > 1.0 && r.score >= 75)) {
        preCrisis.push({
          country,
          year: r.year,
          score: r.score,
          signatures: []
            .concat(economicStress > 0.5 ? ['economic_stress elevated'] : [])
            .concat(capitalFlows > 1.0 ? ['capital_flows elevated'] : [])
            .concat(r.score >= 85 ? ['CRITICAL band'] : [])
        });
      }
    }

    res.json({ count: preCrisis.length, countries: preCrisis.sort((a, b) => b.score - a.score) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/intelligence/patterns/report', requireTier('buyer'), async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('pattern_daily_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(1);
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: 'No pattern reports available yet' });
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pattern Findings — live queryable table ───────────────────────────────────
// GET /api/intelligence/finding/:id/matches  (buyer+) — which countries match a finding right now
// GET /api/intelligence/findings             (buyer+) — all findings sorted by match count
// GET /api/intelligence/:country/findings    (buyer+) — all findings currently active for a country

app.get('/api/intelligence/finding/:id/matches', requireTier('buyer'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid finding id' });
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('pattern_findings')
      .select('id,category,title,match_count,matched_countries,last_run_date')
      .eq('id', id)
      .single();
    if (error && error.code === 'PGRST116') return res.status(404).json({ error: 'Finding not found' });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/intelligence/findings', requireTier('buyer'), async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('pattern_findings')
      .select('id,category,title,match_count,matched_countries,last_run_date')
      .order('match_count', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ findings: data || [], count: (data || []).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/intelligence/:country/findings', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('pattern_findings')
      .select('id,category,title,match_count,matched_countries,last_run_date')
      .filter('matched_countries', 'cs', JSON.stringify([country]))
      .order('match_count', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ country, findings: data || [], count: (data || []).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Crisis Mode Trigger — Phase 5 ────────────────────────────────────────────
// GET /api/intelligence/crisis  (buyer+) — all countries currently in crisis mode
// Conditions: score ≥ 75 AND trajectory RISING/SHARP_RISE AND 2+ active lead signals

const { buildCrisisReport } = require('./historical/crisis_mode_trigger.cjs');

app.get('/api/intelligence/crisis', requireTier('buyer'), async (req, res) => {
  try {
    const report = await buildCrisisReport();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Snapshot / Audit Layer — Step 6 ──────────────────────────────────────────
// GET /api/intelligence/:country/history           (buyer+) — all snapshots newest-first
// GET /api/intelligence/:country/snapshot/:date    (buyer+) — specific date's snapshot

app.get('/api/intelligence/:country/history', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const limit   = Math.min(parseInt(req.query.limit || '90'), 365);
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sbLocal = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sbLocal
      .from('dossier_snapshots')
      .select('country, snapshot_date, generated_at, score, band, trajectory, summary_text, checksum, changed_from_prior, signals_count, active_lead_count')
      .eq('country', country)
      .order('snapshot_date', { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ error: error.message });
    res.json({
      country,
      snapshot_count: (data || []).length,
      snapshots: data || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/intelligence/:country/snapshot/:date', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const date    = req.params.date; // YYYY-MM-DD
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sbLocal = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sbLocal
      .from('dossier_snapshots')
      .select('*')
      .eq('country', country)
      .eq('snapshot_date', date)
      .limit(1)
      .single();
    if (error || !data) return res.status(404).json({ error: `No snapshot for ${country} on ${date}` });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Temporal Intelligence ─────────────────────────────────────────────────────
// GET /api/intelligence/:country/temporal  (buyer+) — lead times, velocity, decision triggers

const { analyzeTemporalIntelligence } = require('./historical/temporal_intelligence.cjs');

app.get('/api/intelligence/:country/temporal', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  try {
    const temporal = await analyzeTemporalIntelligence(country);
    res.json(temporal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Portfolio Contagion ───────────────────────────────────────────────────────
// POST /api/intelligence/portfolio        (buyer+) — submit portfolio, get aggregate analysis
// GET  /api/intelligence/contagion/:country (buyer+) — contagion pathways for single country

const { analyzePortfolio, identifyContagionPathways } = require('./historical/portfolio_contagion.cjs');

app.post('/api/intelligence/portfolio', requireTier('buyer'), async (req, res) => {
  const { countries } = req.body || {};
  if (!countries || !Array.isArray(countries) || countries.length === 0) {
    return res.status(400).json({ error: 'countries array required in request body' });
  }
  if (countries.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 countries per portfolio analysis' });
  }
  try {
    const portfolio = await analyzePortfolio(countries);
    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/intelligence/contagion/:country', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  try {
    const contagion = await identifyContagionPathways(country);
    res.json(contagion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public signal timeseries — all signals from convergence breakdown ────────
// Signal list is derived dynamically from the breakdown column of the most
// recent scored year. Returns stress_z timeseries for every signal present.
// No auth required — feeds the terminal sidebar sparklines.
app.get('/public-api/signals/:country', async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Get all scored years for this country (breakdown column has per-signal stress_z)
    const { data, error } = await sb
      .from('historical_convergence_scores')
      .select('year,score,breakdown')
      .ilike('country', country)
      .order('year')
      .limit(70);
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: `No data for ${country}` });

    // Discover signal list from most recent year's breakdown (data-driven, not hardcoded)
    const latestWithBreakdown = [...data].reverse().find(r => r.breakdown && Object.keys(r.breakdown).length > 0);
    const signalKeys = latestWithBreakdown ? Object.keys(latestWithBreakdown.breakdown) : [];

    // Build per-signal stress_z timeseries across all years
    const signals = {};
    for (const sig of signalKeys) signals[sig] = [];

    for (const row of data) {
      const bd = row.breakdown || {};
      for (const sig of signalKeys) {
        const vals = bd[sig];
        if (vals && vals.stress_z !== undefined && vals.stress_z !== null) {
          signals[sig].push({ year: row.year, stress_z: +Number(vals.stress_z).toFixed(3) });
        }
      }
    }

    res.json({
      country,
      signalCount: signalKeys.length,
      scoreHistory: data.map(r => ({ year: r.year, score: r.score })),
      signals: signalKeys.map(signal => ({
        signal,
        dataPoints: signals[signal].length,
        years: signals[signal]
      })).sort((a, b) => b.dataPoints - a.dataPoints) // most data first
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Public individual signal timeseries — one signal for one country ─────────
// Used by OpenMCT signal telemetry objects. Reads from historical_signal_readings.
app.get('/public-api/signal/:country/:signal', async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const signal  = decodeURIComponent(req.params.signal);
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('historical_signal_readings')
      .select('year,value,source')
      .ilike('country', country)
      .eq('signal', signal)
      .order('year')
      .limit(70);
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: `No data for ${country}/${signal}` });

    res.json({
      country, signal,
      readings: data
        .filter(r => r.value !== null && r.value !== undefined)
        .map(r => ({
          year:  r.year,
          value: r.value,
          utc:   new Date(`${r.year}-07-01`).getTime() // mid-year timestamp for OpenMCT
        }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public intelligence endpoint — summary only
app.get('/public-api/intelligence/:country', async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  try {
    const dossier = await generateDossier(country);
    // Return only executive summary, not full dossier
    res.json({
      country,
      generatedAt: dossier.generatedAt,
      executiveSummary: dossier.pages[2]?.content || dossier.pages[1]?.content,
      insight: dossier.insight.narrative,
      temporalSummary: dossier.temporalIntelligence?.summary || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Interaction Layer — Sabian Q&A ────────────────────────────────────────────
// POST /api/intelligence/:country/qa      (buyer+) — typed question → Sabian answer
// POST /api/intelligence/:country/drill   (buyer+) — drill into a named pattern
// POST /api/intelligence/:country/session (buyer+) — full Host A session with optional questions

const { runQA, runDrill, runFullSession } = require('./historical/dossier_qa.cjs');

app.post('/api/intelligence/:country/qa', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const { question } = req.body || {};
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'question required in request body' });
  }
  try {
    const result = await runQA(country, question.trim());
    if (!result) return res.status(404).json({ error: `No intelligence data found for ${country}` });
    res.json({
      country,
      question: question.trim(),
      hostAQuestion: result.hostAQuestion || question.trim(),
      sabianAnswer: result.sabianAnswer,
      score: result.dossierData?.pages?.find(p => p.pageNumber === 1)?.content?.score || null,
      band: result.dossierData?.pages?.find(p => p.pageNumber === 1)?.content?.riskBand || null,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/intelligence/:country/drill', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const { finding } = req.body || {};
  if (!finding || typeof finding !== 'string' || !finding.trim()) {
    return res.status(400).json({ error: 'finding required in request body — describe the pattern to drill into' });
  }
  try {
    const result = await runDrill(country, finding.trim());
    if (!result) return res.status(404).json({ error: `No intelligence data found for ${country}` });
    res.json({
      country,
      finding: finding.trim(),
      drillDown: result.sabianDrillDown,
      score: result.dossierData?.pages?.find(p => p.pageNumber === 1)?.content?.score || null,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/intelligence/:country/session', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const { questions } = req.body || {};
  const buyerQuestions = Array.isArray(questions) ? questions.filter(q => typeof q === 'string' && q.trim()) : [];
  try {
    const result = await runFullSession(country, buyerQuestions);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Layer 1 — Raw signal data ─────────────────────────────────────────────────
// GET /api/data/:country/signals (buyer+) — raw signal readings for a country

app.get('/api/data/:country/signals', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const signal  = req.query.signal || null;   // ?signal=governance to filter
  const from    = parseInt(req.query.from || '1789');
  const to      = parseInt(req.query.to   || new Date().getFullYear());
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    let query = sb
      .from('historical_signal_readings')
      .select('country,signal,year,value,source,reliability')
      .ilike('country', country)
      .gte('year', from)
      .lte('year', to)
      .order('signal')
      .order('year');
    if (signal) query = query.eq('signal', signal);
    const { data, error } = await query.limit(5000);
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: `No signal data found for ${country}` });

    // Group by signal for clean response
    const bySignal = {};
    for (const r of data) {
      if (!bySignal[r.signal]) bySignal[r.signal] = { signal: r.signal, source: r.source, years: [] };
      bySignal[r.signal].years.push({ year: r.year, value: r.value, reliability: r.reliability });
    }
    res.json({
      country,
      from, to,
      signal_count: Object.keys(bySignal).length,
      total_rows: data.length,
      signals: Object.values(bySignal)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Layer 2 — Analysis layer ──────────────────────────────────────────────────
// GET /api/analysis/:country (buyer+) — signal correlations, going-dark status, first movers, contagion risk, cluster

app.get('/api/analysis/:country', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const [corrRes, darkRes, leadRes, clusterRes, scoreRes] = await Promise.all([
      // Signal correlations for this country's signals vs others
      sb.from('signal_correlation_map')
        .select('signal_a,signal_b,lag_years,spearman_r,p_value,n_pairs')
        .gte('spearman_r', 0.6)
        .order('spearman_r', { ascending: false })
        .limit(20),
      // Going-dark patterns involving this country
      sb.from('going_dark_patterns')
        .select('*')
        .ilike('country', country)
        .order('dark_year', { ascending: false })
        .limit(20),
      // Lead indicators active for this country
      sb.from('signal_lead_indicators')
        .select('*')
        .ilike('country', country)
        .limit(10),
      // Cluster membership
      sb.from('country_clusters')
        .select('cluster_id,cluster_label,dominant_signal,centroid_dist,as_of_year')
        .ilike('country', country)
        .order('as_of_year', { ascending: false })
        .limit(1),
      // Current convergence score
      sb.from('historical_convergence_scores')
        .select('country,year,score')
        .ilike('country', country)
        .order('year', { ascending: false })
        .limit(5)
    ]);

    const goingDark = (darkRes.data || []);
    const activeDark = goingDark.filter(d => {
      const yearsAgo = new Date().getFullYear() - d.dark_year;
      return yearsAgo <= 5;
    });

    res.json({
      country,
      generatedAt: new Date().toISOString(),
      currentScore: scoreRes.data?.[0] || null,
      recentScores: scoreRes.data || [],
      cluster: clusterRes.data?.[0] || null,
      goingDark: {
        total: goingDark.length,
        activeWithin5yr: activeDark.length,
        signals: goingDark
      },
      leadIndicators: leadRes.data || [],
      topCorrelations: corrRes.data || [],
      notes: {
        correlations: 'Top 20 strongest signal-pair correlations across the historical record (not country-specific — system-wide patterns)',
        goingDark: 'Signals that disappeared from this country\'s data — silence is itself a signal',
        leadIndicators: 'Signals that historically lead score movements for this country'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Immutable Audit Chain ─────────────────────────────────────────────────────
// GET /api/verify/chain        (internal) — validate entire hash chain
// GET /api/verify/:hash        (buyer+)   — return record for a specific hash
// GET /api/audit/:country      (buyer+)   — full audit trail for a country

const { verifyChain, getAuditTrail, getEventByHash, getChainStats } = require('./historical/audit_chain.cjs');

app.get('/api/verify/chain', requireTier('internal'), async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit || '10000');
    const result = await verifyChain({ limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/verify/stats', requireTier('buyer'), async (req, res) => {
  try {
    const stats = await getChainStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/verify/:hash', requireTier('buyer'), async (req, res) => {
  const hash = req.params.hash;
  if (!hash || hash.length < 16) return res.status(400).json({ error: 'Invalid hash' });
  try {
    const record = await getEventByHash(hash);
    if (!record) return res.status(404).json({ error: 'No record found for this hash' });
    res.json({
      found:         true,
      id:            record.id,
      event_type:    record.event_type,
      logged_at:     record.logged_at,
      country:       record.country,
      payload_hash:  record.payload_hash,
      previous_hash: record.previous_hash,
      payload:       record.payload,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audit/:country', requireTier('buyer'), async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const limit   = Math.min(parseInt(req.query.limit || '100'), 1000);
  try {
    const trail = await getAuditTrail(country, { limit });
    res.json({
      country,
      record_count: trail.length,
      events: trail.map(r => ({
        id:           r.id,
        event_type:   r.event_type,
        logged_at:    r.logged_at,
        payload_hash: r.payload_hash,
        payload:      r.payload,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/verify/data-chain  (buyer+) — verify row-level hash chain on convergence_scores + observations
app.get('/api/verify/data-chain', requireTier('buyer'), async (req, res) => {
  const crypto = require('crypto');
  function rowHash(fields, prev) {
    return crypto.createHash('sha256')
      .update(JSON.stringify(fields, Object.keys(fields).sort()) + prev)
      .digest('hex');
  }

  const results = {};

  // Verify convergence_scores chain
  try {
    const { data: rows, error } = await supabase
      .from('convergence_scores')
      .select('id,country,scan_date,convergence_score,risk_level,trajectory,signals_available,freshness_pct,row_hash,prev_hash')
      .order('id', { ascending: true });
    if (error) throw error;

    const total = rows.length;
    const unsealed = rows.filter(r => !r.row_hash).length;
    let prev = 'genesis';
    let broken_at = null;
    for (const r of rows) {
      if (!r.row_hash) continue;
      if (r.prev_hash !== prev) { broken_at = r.id; break; }
      const fields = {
        country: r.country, convergence_score: r.convergence_score,
        freshness_pct: r.freshness_pct ?? null, risk_level: r.risk_level,
        scan_date: r.scan_date, signals_available: r.signals_available,
        trajectory: r.trajectory || 'STABLE',
      };
      const expected = rowHash(fields, r.prev_hash);
      if (expected !== r.row_hash) { broken_at = r.id; break; }
      prev = r.row_hash;
    }
    results.convergence_scores = {
      total_rows: total, unsealed, valid: broken_at === null,
      broken_at: broken_at || undefined,
      chain_head: prev === 'genesis' ? null : prev.slice(0, 16) + '...',
    };
  } catch (err) {
    results.convergence_scores = { error: err.message };
  }

  // Verify observations chain
  try {
    const { data: rows, error } = await supabase
      .from('observations')
      .select('id,country,scan_date,convergence_score,risk_level,previous_risk_level,direction,window_days,window_closes_at,row_hash,prev_hash')
      .order('id', { ascending: true });
    if (error) throw error;

    const total = rows.length;
    const unsealed = rows.filter(r => !r.row_hash).length;
    let prev = 'genesis';
    let broken_at = null;
    for (const r of rows) {
      if (!r.row_hash) continue;
      if (r.prev_hash !== prev) { broken_at = r.id; break; }
      const fields = {
        convergence_score: r.convergence_score, country: r.country,
        direction: r.direction, previous_risk_level: r.previous_risk_level || null,
        risk_level: r.risk_level, scan_date: r.scan_date,
        window_closes_at: r.window_closes_at, window_days: r.window_days,
      };
      const expected = rowHash(fields, r.prev_hash);
      if (expected !== r.row_hash) { broken_at = r.id; break; }
      prev = r.row_hash;
    }
    results.observations = {
      total_rows: total, unsealed, valid: broken_at === null,
      broken_at: broken_at || undefined,
      chain_head: prev === 'genesis' ? null : prev.slice(0, 16) + '...',
    };
  } catch (err) {
    results.observations = { error: err.message };
  }

  const allValid = Object.values(results).every(r => r.valid === true);
  res.json({
    verified_at: new Date().toISOString(),
    all_valid: allValid,
    tables: results,
  });
});

// ── Chain anchor endpoints ────────────────────────────────────────────────────
// GET /api/verify/anchors          (buyer+) — all anchor records
// GET /api/verify/anchor/:date     (buyer+) — specific anchor metadata
// GET /api/verify/anchor/:date/tsr (buyer+) — RFC 3161 TSR binary download
// GET /api/verify/anchor/:date/ots (buyer+) — OTS proof binary download

app.get('/api/verify/anchors', requireTier('buyer'), async (req, res) => {
  const { data, error } = await supabase
    .from('chain_anchors')
    .select('id,anchor_date,anchor_hash,cs_chain_head,obs_chain_head,audit_chain_head,cs_row_count,obs_row_count,audit_row_count,rfc3161_status,rfc3161_submitted_at,ots_status,ots_submitted_at,ots_confirmed,created_at')
    .order('anchor_date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    anchor_count: data.length,
    anchors: data,
    verification_guide: {
      rfc3161: 'openssl ts -verify -in tsr.der -digest <anchor_hash> -CAfile freetsa.crt',
      ots:     'ots verify proof.ots (requires OpenTimestamps CLI) — or use https://opentimestamps.org',
      freetsa_cert: 'https://www.freetsa.org/files/tsa.crt',
    },
  });
});

app.get('/api/verify/anchor/:date', requireTier('buyer'), async (req, res) => {
  const { data, error } = await supabase
    .from('chain_anchors')
    .select('*')
    .eq('anchor_date', req.params.date)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'No anchor for this date' });
  const { rfc3161_tsr_b64, ots_proof_b64, ...meta } = data;
  res.json({
    ...meta,
    rfc3161_tsr_available: !!rfc3161_tsr_b64,
    ots_proof_available:   !!ots_proof_b64,
    download_tsr: rfc3161_tsr_b64 ? `/api/verify/anchor/${req.params.date}/tsr` : null,
    download_ots: ots_proof_b64   ? `/api/verify/anchor/${req.params.date}/ots` : null,
    verification_guide: {
      rfc3161: 'openssl ts -verify -in tsr.der -digest <anchor_hash> -CAfile freetsa.crt',
      ots:     'ots verify proof.ots — or use https://opentimestamps.org',
      freetsa_cert: 'https://www.freetsa.org/files/tsa.crt',
    },
  });
});

app.get('/api/verify/anchor/:date/tsr', requireTier('buyer'), async (req, res) => {
  const { data, error } = await supabase
    .from('chain_anchors')
    .select('rfc3161_tsr_b64,anchor_hash')
    .eq('anchor_date', req.params.date)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data?.rfc3161_tsr_b64) return res.status(404).json({ error: 'TSR not available for this date' });
  const buf = Buffer.from(data.rfc3161_tsr_b64, 'base64');
  res.setHeader('Content-Type', 'application/timestamp-reply');
  res.setHeader('Content-Disposition', `attachment; filename="sabian-anchor-${req.params.date}.tsr"`);
  res.setHeader('X-Anchor-Hash', data.anchor_hash);
  res.send(buf);
});

app.get('/api/verify/anchor/:date/ots', requireTier('buyer'), async (req, res) => {
  const { data, error } = await supabase
    .from('chain_anchors')
    .select('ots_proof_b64,anchor_hash')
    .eq('anchor_date', req.params.date)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data?.ots_proof_b64) return res.status(404).json({ error: 'OTS proof not available for this date' });
  const buf = Buffer.from(data.ots_proof_b64, 'base64');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="sabian-anchor-${req.params.date}.ots"`);
  res.setHeader('X-Anchor-Hash', data.anchor_hash);
  res.send(buf);
});

// ── Autonomous scan scheduler (runs inside the API process — no PM2 required) ──
// Railway runs `node sabian_api.cjs` — PM2 cron never fires on Railway.
// node-cron schedules are in UTC to match Railway's container timezone.
try {
  const cron = require('node-cron');
  const runGlobalScan      = require('./global_scan.cjs');
  const runGradingPass     = require('./grading_pass.cjs');
  const { runBackup }      = require('./sabian_backup.cjs');

  // Daily scan — 0600 UTC every day
  
// ═══ MINED PATTERNS ENDPOINTS (added by patch_dashboard.cjs) ════════════════
app.get('/public-api/patterns/unknown-unknowns', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('miner_findings')
      .select('id, category, payload, run_id, created_at')
      .in('category', ['unknown_unknown', 'signal_correlation'])
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const filtered = (data || []).filter(row => {
      const p = row.payload || {};
      const r = p.r ?? p.spearman_r ?? p.correlation ?? null;
      const n = p.n ?? p.n_pairs ?? 0;
      return r !== null && Math.abs(r) >= 0.5 && n >= 30;
    }).sort((a, b) => {
      const ra = Math.abs(a.payload?.r ?? a.payload?.spearman_r ?? 0);
      const rb = Math.abs(b.payload?.r ?? b.payload?.spearman_r ?? 0);
      return rb - ra;
    }).slice(0, 50);
    res.json({ count: filtered.length, findings: filtered });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/patterns/going-dark', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('miner_findings')
      .select('id, category, payload, run_id, created_at')
      .in('category', ['going_dark_event', 'going_dark_by_signal', 'going_dark_sequence', 'darkest_country', 'absence_as_signal'])
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    res.json({ count: (data || []).length, findings: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/patterns/lead-indicators', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('miner_findings')
      .select('id, category, payload, run_id, created_at')
      .in('category', ['lead_indicator', 'signal_to_score', 'compound_amplification', 'first_mover', 'conditional_probability'])
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const filtered = (data || []).filter(row => {
      const p = row.payload || {};
      const r = p.r ?? p.spearman_r ?? p.correlation ?? null;
      const n = p.n ?? p.n_pairs ?? 0;
      return r === null || (Math.abs(r) >= 0.4 && n >= 30);
    }).slice(0, 200);
    res.json({ count: filtered.length, findings: filtered });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/patterns/summary', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const all = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from('miner_findings')
        .select('category, run_id, created_at')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || !data.length) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    const counts = {};
    let latestRun = null;
    let latestRunId = null;
    for (const row of all) {
      counts[row.category] = (counts[row.category] || 0) + 1;
      if (!latestRun || row.created_at > latestRun) {
        latestRun = row.created_at;
        latestRunId = row.run_id;
      }
    }
    res.json({ total: all.length, latest_run: latestRun, latest_run_id: latestRunId, by_category: counts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/proof-seal', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('chain_anchors')
      .select('id, anchor_date, anchor_hash, rfc3161_status, ots_status, ots_confirmed, created_at')
      .order('anchor_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.json({ sealed: false, message: 'No anchor sealed yet' });
    const ageDays = Math.floor((Date.now() - new Date(data.anchor_date).getTime()) / 86400000);
    let status = 'GREEN';
    if (ageDays > 14) status = 'RED';
    else if (ageDays > 7) status = 'YELLOW';
    res.json({
      sealed: true,
      anchor_id: data.id,
      anchor_date: data.anchor_date,
      anchor_hash: data.anchor_hash,
      age_days: ageDays,
      status,
      rfc3161_status: data.rfc3161_status,
      ots_status: data.ots_status,
      ots_confirmed: data.ots_confirmed
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ═══ END MINED PATTERNS ENDPOINTS ════════════════════════════════════════════


// ═══ PORTFOLIO MINE ENDPOINTS (V2 - currently unused) ═════════════════════════

// Check if re-mine needed
app.post('/api/mine/portfolio/check', requireTier('buyer'), async (req, res) => {
  try {
    const { countries } = req.body;
    if (!countries || !Array.isArray(countries) || countries.length === 0) {
      return res.status(400).json({ error: 'countries array required' });
    }

    const countriesKey = countries.slice().sort().join(',');
    const buyerId = req.headers['x-buyer-id'] || 'default';

    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Get last mine for this buyer
    const { data: lastMine } = await sb
      .from('portfolio_mine_results')
      .select('id, countries, mined_at')
      .eq('buyer_id', buyerId)
      .order('mined_at', { ascending: false })
      .limit(1);

    if (!lastMine || lastMine.length === 0) {
      return res.json({ needsMine: true, reason: 'no_previous_mine' });
    }

    const last = lastMine[0];
    const lastCountriesKey = (last.countries || []).slice().sort().join(',');

    // Check if countries changed
    if (lastCountriesKey !== countriesKey) {
      return res.json({ needsMine: true, reason: 'countries_changed' });
    }

    // Check if underlying data changed since last mine
    const { data: latestData } = await sb
      .from('historical_convergence_scores')
      .select('computed_at')
      .in('country', countries)
      .order('computed_at', { ascending: false })
      .limit(1);

    const latestDataTime = latestData?.[0]?.computed_at;
    if (latestDataTime && new Date(latestDataTime) > new Date(last.mined_at)) {
      return res.json({ needsMine: true, reason: 'new_data_available' });
    }

    // No change — return cached
    res.json({
      needsMine: false,
      lastMineId: last.id,
      minedAt: last.mined_at,
      reason: 'no_change'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get cached mine results
app.get('/api/mine/portfolio/:id', requireTier('buyer'), async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await sb
      .from('portfolio_mine_results')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) return res.status(404).json({ error: 'Mine result not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run live portfolio mine with SSE streaming
app.post('/api/mine/portfolio', requireTier('buyer'), async (req, res) => {
  const { countries } = req.body;
  if (!countries || !Array.isArray(countries) || countries.length === 0) {
    return res.status(400).json({ error: 'countries array required' });
  }

  const buyerId = req.headers['x-buyer-id'] || 'default';

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Spawn scoped miner
  const { spawn } = require('child_process');
  const minerPath = require('path').join(__dirname, 'historical', 'deep_pattern_analysis_v2.cjs');
  const miner = spawn('node', [minerPath, `--countries=${countries.join(',')}`, '--stream'], {
    cwd: __dirname,
    env: process.env
  });

  let allFindings = [];
  let stdoutBuffer = '';

  miner.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        sendEvent(event);
        if (event.type === 'complete') {
          allFindings = event.findings || [];
        }
      } catch {}
    }
  });

  miner.stderr.on('data', (data) => {
    sendEvent({ type: 'error', msg: data.toString() });
  });

  miner.on('close', async (code) => {
    // Persist findings
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: inserted } = await sb.from('portfolio_mine_results').insert({
      buyer_id: buyerId,
      countries,
      findings: allFindings,
      finding_count: allFindings.length,
      mined_at: new Date().toISOString()
    }).select('id').single();

    sendEvent({ type: 'saved', mineId: inserted?.id });
    sendEvent({ type: 'done', code });
    res.end();
  });

  req.on('close', () => {
    miner.kill();
  });
});

// Explain a finding using Claude
app.post('/api/mine/explain', requireTier('buyer'), async (req, res) => {
  const { finding } = req.body;
  if (!finding || !finding.category || !finding.payload) {
    return res.status(400).json({ error: 'finding with category and payload required' });
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const prompt = `You are Sabian, a sovereign risk intelligence system. A pattern miner found the following pattern. Explain what it means in 2-3 sentences of plain English. Do not use jargon. Do not mention signal names, statistical notation, or technical terms. Only describe what changed, when, and why it matters to someone monitoring country risk.

Category: ${finding.category}
Payload: ${JSON.stringify(finding.payload)}

Write only the explanation, nothing else.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }]
    });

    const explanation = message.content[0]?.text || 'Pattern detected.';
    res.json({ explanation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ END PORTFOLIO MINE ENDPOINTS ═════════════════════════════════════════════


// ═══ COLLAPSE INTELLIGENCE ANALYZER ═════════════════════════════════════════════
// The V1 deliverable: buyer submits country, receives full intelligence package

app.post('/api/collapse/analyze', requireTier('buyer'), async (req, res) => {
  const { country } = req.body;
  if (!country) {
    return res.status(400).json({ error: 'country required' });
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const findingsPath = path.join(__dirname, 'historical/deep_pattern_findings_v2.json');

    if (!fs.existsSync(findingsPath)) {
      return res.status(500).json({ error: 'Collapse patterns not computed. Run miner first.' });
    }

    const findings = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
    const cp = findings.collapsePatterns;
    if (!cp) {
      return res.status(500).json({ error: 'Collapse patterns not computed. Run miner first.' });
    }

    // Build payload for this country
    const payload = {
      country,
      generatedAt: new Date().toISOString(),
      filters: cp.filters || null,
      patternMatches: [],
      historicalAnalogues: [],
      extractiveActors: null,
      tripwires: [],
      chronicle: null,
      matchDates: null
    };

    // Find pattern matches for this country
    for (const pair of cp.signalPairs || []) {
      if (pair.countries && pair.countries.includes(country)) {
        const countryInstances = pair.instances.filter(i => i.country === country);
        payload.patternMatches.push({
          fingerprint: pair.fingerprint,
          signalPair: pair.signalPair,
          domainPair: pair.domainPair,
          lift: pair.lift || null,
          leadTimeDistribution: pair.leadTimeDistribution || null,
          countryInstances
        });

        // Historical analogues = other countries with same pattern
        const analogues = pair.instances
          .filter(i => i.country !== country)
          .map(i => ({ country: i.country, shiftYear: i.shiftYear, delta: i.delta }));
        payload.historicalAnalogues.push({
          pattern: pair.fingerprint,
          analogues: analogues.slice(0, 10)
        });
      }
    }

    // Match dates for this country
    const matchDates = (cp.matchDatesByCountry || []).find(m => m.country === country);
    if (matchDates) {
      payload.matchDates = matchDates.matches;
    }

    // Extractive actors for this country
    const extractive = (cp.extractiveWatchlist || []).find(e => e.country === country);
    if (extractive) {
      payload.extractiveActors = extractive;
    }

    // Chronicle for this country (most recent shift)
    const countryChronicles = (cp.chronicles || [])
      .filter(c => c.country === country)
      .sort((a, b) => b.shiftYear - a.shiftYear);
    if (countryChronicles.length > 0) {
      payload.chronicle = countryChronicles[0];
    }

    // Tripwires: signals that went dark just before shift in historical cases
    for (const chron of cp.chronicles || []) {
      const darkEvents = (chron.chronicle || []).filter(e => e.event === 'dark' && e.yearsBefore <= 2);
      for (const dark of darkEvents) {
        payload.tripwires.push({
          signal: dark.signal,
          domain: dark.domain,
          country: chron.country,
          shiftYear: chron.shiftYear,
          yearsBefore: dark.yearsBefore
        });
      }
    }
    // Aggregate tripwires by signal
    const tripwireCounts = {};
    for (const tw of payload.tripwires) {
      const key = tw.signal;
      if (!tripwireCounts[key]) tripwireCounts[key] = { signal: tw.signal, domain: tw.domain, count: 0, cases: [] };
      tripwireCounts[key].count++;
      tripwireCounts[key].cases.push({ country: tw.country, shiftYear: tw.shiftYear });
    }
    payload.tripwireSummary = Object.values(tripwireCounts).sort((a, b) => b.count - a.count).slice(0, 5);

    // Now call Claude to generate the intelligence read
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const analyzerPrompt = `You are Sabian, a sovereign risk intelligence system. You have received computed data for ${country}. Write a complete intelligence read that answers every question a buyer would ask, BEFORE they ask it.

COMPUTED PAYLOAD:
${JSON.stringify(payload, null, 2)}

YOUR TASK:
Write a complete intelligence briefing for ${country}. Cover ONLY what the payload contains — never invent facts, numbers, cases, or dates not in the data.

STRUCTURE YOUR RESPONSE:
1. PATTERN MATCH — What pattern does this country match? Describe in plain terms (e.g., "institutional integrity combined with population displacement pressures") NOT signal names.
2. HISTORICAL PRECEDENT — Which prior cases matched this pattern? What happened to them? Use the actual countries and years from historicalAnalogues.
3. CONFIDENCE — The computed LIFT. Lift measures how much MORE often this pattern appears before collapse vs. baseline. If lift is present in payload: state "This pattern appears X times more often in the years before a crisis than during normal periods" where X is the lift value. Lift > 2 is predictive. Lift near 1 is noise. If lift is null, say data is insufficient.
4. TIMING — The lead-time distribution. Describe BOTH the structural horizon (8-10 year signals) AND tactical window (2-3 year signals) if both are present in the buckets. Use actual numbers from leadTimeDistribution.
5. ENTRY DATE — When did ${country} first match this pattern? Use matchDates if present.
6. EXTRACTIVE INDICATORS — Are corruption or investigative journalism signals elevated? Use extractiveActors if present.
7. TRIPWIRE — What signal historically moved last before collapse? Which signals should the buyer watch? Use tripwireSummary.

RULES:
- Never expose signal names (corruption_risk, occrp, etc.) — translate to plain language
- Never tell the buyer what to do (buy, sell, hedge) — present the picture, decision is theirs
- If a field is empty or null, say so honestly: "Data not available for this dimension"
- Every claim must trace to the payload — no padding, no illustrative examples
- Write in direct, professional intelligence language — no marketing, no hedging

Write the briefing now.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: analyzerPrompt }]
    });

    const briefing = message.content[0]?.text || 'Unable to generate briefing.';

    res.json({
      country,
      payload,
      briefing
    });

  } catch (err) {
    console.error('Collapse analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Portfolio batch analysis
app.post('/api/collapse/analyze-portfolio', requireTier('buyer'), async (req, res) => {
  const { countries } = req.body;
  if (!countries || !Array.isArray(countries) || countries.length === 0) {
    return res.status(400).json({ error: 'countries array required' });
  }

  // Limit to 10 countries per request
  const toAnalyze = countries.slice(0, 10);
  const results = [];

  for (const country of toAnalyze) {
    try {
      const fs = require('fs');
      const path = require('path');
      const findingsPath = path.join(__dirname, 'historical/deep_pattern_findings_v2.json');

      if (!fs.existsSync(findingsPath)) {
        results.push({ country, error: 'Collapse patterns not computed' });
        continue;
      }

      const findings = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
      const cp = findings.collapsePatterns;

      // Build minimal payload for batch
      const payload = {
        country,
        patternMatches: [],
        extractiveActors: null,
        matchDates: null
      };

      for (const pair of cp.signalPairs || []) {
        if (pair.countries && pair.countries.includes(country)) {
          payload.patternMatches.push({
            fingerprint: pair.fingerprint,
            lift: pair.lift || null
          });
        }
      }

      const matchDates = (cp.matchDatesByCountry || []).find(m => m.country === country);
      if (matchDates) payload.matchDates = matchDates.matches;

      const extractive = (cp.extractiveWatchlist || []).find(e => e.country === country);
      if (extractive) payload.extractiveActors = extractive;

      results.push(payload);
    } catch (err) {
      results.push({ country, error: err.message });
    }
  }

  res.json({ analyzed: results.length, results });
});

// ═══ END COLLAPSE INTELLIGENCE ANALYZER ═════════════════════════════════════════


// ═══ EXTRACTION SIGNATURES ENDPOINT ════════════════════════════════════════
app.get('/public-api/extraction/signatures', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const country    = req.query.country    || null;
    const pattern_id = req.query.pattern_id || null;
    const confidence = req.query.confidence || null;

    let q = sb
      .from('extraction_signatures')
      .select('id, country, event_date, event_type, date_range_start, date_range_end, pattern_id, actor_count, recurring_count, primary_window, confidence, detected_at')
      .order('confidence', { ascending: true })
      .order('detected_at', { ascending: false });

    if (country)    q = q.eq('country', country);
    if (pattern_id) q = q.eq('pattern_id', pattern_id);
    if (confidence) q = q.eq('confidence', confidence);

    const { data, error } = await q;
    if (error) throw error;

    // Summary counts
    const counts = { VULTURE_PLAY: 0, INSIDER_EXIT: 0, ACTIVE_POSITIONING: 0 };
    const conf   = { HIGH: 0, MEDIUM: 0, REVIEW: 0 };
    for (const r of (data || [])) {
      if (counts[r.pattern_id] !== undefined) counts[r.pattern_id]++;
      if (conf[r.confidence]   !== undefined) conf[r.confidence]++;
    }

    res.json({
      total: (data || []).length,
      by_pattern: counts,
      by_confidence: conf,
      signatures: data || []
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ═══ END EXTRACTION SIGNATURES ENDPOINT ════════════════════════════════════

cron.schedule('0 6 * * *', () => {
    console.log('[CRON] Daily global scan starting — 0600 UTC');
    logToHive({ source: 'sabian_api', level: 'intel', event: 'cron_scan_start', data: { time: new Date().toISOString() }, tags: ['cron'] });
    runGlobalScan(null, { save: true }).catch(err =>
      logToHive({ source: 'sabian_api', level: 'error', event: 'cron_scan_failed', data: { error: err.message }, tags: ['cron', 'error'] })
    );
  }, { timezone: 'UTC' });

  // Grading pass — 0630 UTC every day (30 min after scan completes)
  cron.schedule('30 6 * * *', () => {
    console.log('[CRON] Grading pass starting — 0630 UTC');
    runGradingPass().catch(err =>
      logToHive({ source: 'sabian_api', level: 'error', event: 'cron_grade_failed', data: { error: err.message }, tags: ['cron', 'error'] })
    );
  }, { timezone: 'UTC' });

  // Live stream — 0700 UTC every day (bridges live scan into historical record, refreshes synthesis)
  cron.schedule('0 7 * * *', () => {
    console.log('[CRON] Live stream starting — 0700 UTC');
    logToHive({ source: 'sabian_api', level: 'intel', event: 'cron_stream_start', data: { time: new Date().toISOString() }, tags: ['cron'] });
    const { execSync } = require('child_process');
    try {
      execSync('node historical/live_stream.cjs', { cwd: __dirname, stdio: 'pipe' });
      logToHive({ source: 'sabian_api', level: 'intel', event: 'cron_stream_complete', data: { time: new Date().toISOString() }, tags: ['cron'] });
    } catch (err) {
      logToHive({ source: 'sabian_api', level: 'error', event: 'cron_stream_failed', data: { error: err.message }, tags: ['cron', 'error'] });
    }
  }, { timezone: 'UTC' });

  // Weekly backup — every Sunday 0200 UTC
  cron.schedule('0 2 * * 0', () => {
    console.log('[CRON] Weekly Supabase backup — 0200 UTC Sunday');
    runBackup().catch(err =>
      logToHive({ source: 'sabian_api', level: 'error', event: 'cron_backup_failed', data: { error: err.message }, tags: ['cron', 'error'] })
    );
  }, { timezone: 'UTC' });

  // Weekly chain anchor — every Sunday 0300 UTC (after backup)
  cron.schedule('0 3 * * 0', async () => {
    console.log('[CRON] Weekly chain anchor starting — 0300 UTC Sunday');
    try {
      const { runAnchor } = require('./historical/chain_anchor.cjs');
      const result = await runAnchor();
      logToHive({ source: 'sabian_api', level: 'intel', event: 'cron_anchor_complete', data: result, tags: ['cron', 'anchor'] });
    } catch (err) {
      logToHive({ source: 'sabian_api', level: 'error', event: 'cron_anchor_failed', data: { error: err.message }, tags: ['cron', 'error'] });
    }
  }, { timezone: 'UTC' });

  // Alert engine — 0730 UTC every day (after live_stream refreshes synthesis)
  cron.schedule('30 7 * * *', () => {
    console.log('[CRON] Alert engine starting — 0730 UTC');
    const { execSync } = require('child_process');
    try {
      execSync('node historical/alert_engine.cjs', { cwd: __dirname, stdio: 'pipe' });
      logToHive({ source: 'sabian_api', level: 'intel', event: 'cron_alerts_complete', data: { time: new Date().toISOString() }, tags: ['cron'] });
    } catch (err) {
      logToHive({ source: 'sabian_api', level: 'error', event: 'cron_alerts_failed', data: { error: err.message }, tags: ['cron', 'error'] });
    }
  }, { timezone: 'UTC' });

  // Pattern matcher — 0800 UTC every day (after live_stream, tests findings against current profiles)
  cron.schedule('0 8 * * *', () => {
    console.log('[CRON] Pattern matcher starting — 0800 UTC');
    const { execSync } = require('child_process');
    try {
      execSync('node historical/pattern_matcher_nightly.cjs', { cwd: __dirname, stdio: 'pipe' });
      logToHive({ source: 'sabian_api', level: 'intel', event: 'cron_patterns_complete', data: { time: new Date().toISOString() }, tags: ['cron'] });
    } catch (err) {
      logToHive({ source: 'sabian_api', level: 'error', event: 'cron_patterns_failed', data: { error: err.message }, tags: ['cron', 'error'] });
    }
  }, { timezone: 'UTC' });

  // Snapshot nightly — 0830 UTC every day (after pattern matcher, full audit trail with dedup)
  cron.schedule('30 8 * * *', () => {
    console.log('[CRON] Snapshot nightly starting — 0830 UTC');
    const { execSync } = require('child_process');
    try {
      execSync('node historical/snapshot_nightly.cjs', { cwd: __dirname, stdio: 'pipe' });
      logToHive({ source: 'sabian_api', level: 'intel', event: 'cron_snapshots_complete', data: { time: new Date().toISOString() }, tags: ['cron', 'snapshots'] });
    } catch (err) {
      logToHive({ source: 'sabian_api', level: 'error', event: 'cron_snapshots_failed', data: { error: err.message }, tags: ['cron', 'error'] });
    }
  }, { timezone: 'UTC' });

  console.log('[CRON] Scheduler active — scan 0600 | grade 0630 | stream 0700 | alerts 0730 | patterns 0800 | snapshots 0830 | backup Sun 0200 | anchor Sun 0300 (all UTC)');
} catch (cronErr) {
  console.warn('[CRON] Scheduler not loaded:', cronErr.message);
}

// ── Global Aggregate — Phase 6 ────────────────────────────────────────────────
// GET /api/global              (buyer+) — full global snapshot: all countries, top 10, crossings, regional rollup
// GET /api/regional/:region    (buyer+) — single theater deep view
// GET /public-api/global       (public) — top 10 + band counts + recent crossings (no auth — feeds terminal landing)

const {
  buildGlobalResponse,
  getRegionalSnapshot,
  getThresholdCrossings,
  getRegionalRollup,
  getTheater: getGlobalTheater
} = require('./historical/global_aggregate.cjs');

app.get('/api/global', requireTier('buyer'), async (req, res) => {
  try {
    const response = await buildGlobalResponse();
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/regional/:region', requireTier('buyer'), async (req, res) => {
  const region = req.params.region.toUpperCase();
  try {
    const [countries, crossings, rollup] = await Promise.all([
      getRegionalSnapshot(region),
      getThresholdCrossings(30),
      getRegionalRollup()
    ]);
    const regionalCrossings = crossings.filter(c => getGlobalTheater(c.country) === region);
    res.json({
      region,
      generated_at:    new Date().toISOString(),
      country_count:   countries.length,
      rollup:          rollup[region] || null,
      countries,
      crossings_30d:   regionalCrossings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Extraction Intelligence (buyer tier) ─────────────────────────────────
app.get('/api/extraction/events', requireTier('buyer'), async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('extraction_events')
      .select('id,country,year,pattern_type,confidence,signal_snapshot,outcome_description,detected_at')
      .order('year', { ascending: false });
    if (error) throw error;
    res.json({ events: data, count: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public landing — stripped version (no full country list, no breakdown)
app.get('/public-api/global', async (req, res) => {
  try {
    const response = await buildGlobalResponse();
    res.json({
      generated_at:    response.generated_at,
      country_count:   response.country_count,
      global_avg_score: response.global_avg_score,
      band_counts:     response.band_counts,
      top_10:          response.top_10,
      recent_crossings: response.recent_crossings,
      regional_rollup: response.regional_rollup
      // all_countries omitted from public endpoint
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nSabian Intelligence Terminal — Port ${PORT}`);
  console.log(`\n  DASHBOARD (public, no auth)`);
  console.log(`  GET /                           — Open MCT dashboard (redirect)`);
  console.log(`  GET /dashboard/                 — Open MCT intelligence terminal`);
  console.log(`  GET /public-api/threats         — all countries, no auth`);
  console.log(`  GET /public-api/country/:name   — country detail, no auth`);
  console.log(`  GET /public-api/summary         — global summary, no auth`);
  console.log(`  GET /public-api/theater/:name   — theater rollup, no auth`);
  console.log(`  GET /public-api/observations/:c — ledger, no auth`);
  console.log(`  GET /public-api/global          — global landing: top 10, crossings, rollup (no auth)`);
  console.log(`\n  API (Bearer auth required)`);
  console.log(`  GET /health                     — liveness check (no auth)`);
  console.log(`  GET /api/summary                — global threat summary`);
  console.log(`  GET /api/threats                — all countries ranked`);
  console.log(`  GET /api/country/:name          — country detail + 90-day history`);
  console.log(`  GET /api/score/:name            — live convergence score (fresh fetch)`);
  console.log(`  GET /api/theater/:name          — theater rollup`);
  console.log(`  GET /api/patterns/:signal       — signal pattern query`);
  console.log(`  POST /api/brief/:country        — trigger forward briefing`);
  console.log(`  GET /api/observations/:country  — observation ledger`);
  console.log(`  GET /api/observations/stats     — global ledger stats + hit rate`);
  console.log(`  GET /api/db/status              — Supabase connection check`);
  console.log(`\n  INTELLIGENCE (buyer+)`);
  console.log(`  GET /api/intelligence/:country          — full 12-page dossier`);
  console.log(`  GET /api/intelligence/:country/pdf      — PDF download`);
  console.log(`  GET /api/intelligence/:country/audio    — audio insight status/trigger`);
  console.log(`  GET /api/intelligence/:country/temporal — lead times + decision triggers`);
  console.log(`  GET /api/intelligence/precrisis         — countries in pre-crisis signature`);
  console.log(`  GET /api/intelligence/crisis            — Phase 5: countries in crisis mode (score≥75 + RISING + 2+ leads)`);
  console.log(`  GET /api/intelligence/:country/history  — Step 6: all daily snapshots for country (audit trail)`);
  console.log(`  GET /api/intelligence/:country/snapshot/:date — Step 6: specific date snapshot`);
  console.log(`  GET /api/intelligence/contagion/:c      — contagion pathways`);
  console.log(`  POST /api/intelligence/portfolio        — portfolio exposure analysis`);
  console.log(`  GET /api/intelligence/findings              — all findings sorted by match count`);
  console.log(`  GET /api/intelligence/finding/:id/matches   — countries currently matching a finding`);
  console.log(`  GET /api/intelligence/:country/findings     — all findings currently active for a country`);
  console.log(`\n  INTERACTION (buyer+)`);
  console.log(`  POST /api/intelligence/:country/qa      — typed question → Sabian answers`);
  console.log(`  POST /api/intelligence/:country/drill   — drill into a named pattern`);
  console.log(`  POST /api/intelligence/:country/session — full Host A briefing session`);
  console.log(`\n  DATA LAYERS (buyer+)`);
  console.log(`  GET /api/data/:country/signals          — Layer 1: raw signal readings`);
  console.log(`  GET /api/analysis/:country              — Layer 2: correlations, going-dark, leads`);
  console.log(`\n  GLOBAL AGGREGATE (buyer+)`);
  console.log(`  GET /api/global                         — all countries, top 10, crossings, regional rollup`);
  console.log(`  GET /api/regional/:region               — single theater deep view (AFRICOM/CENTCOM/etc)`);
  console.log(`\n  Auth: Bearer ${INTERNAL_API_KEY}\n`);

  logToHive({
    source: 'sabian_api',
    level: 'intel',
    event: 'api_started',
    data: { port: PORT },
    tags: ['api', 'server']
  });
});

module.exports = app;
