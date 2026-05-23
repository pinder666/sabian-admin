// sabian_api.cjs
// Sabian Unified Intelligence API — single server replacing api_server.cjs, hive_backend.cjs, sabian_command_api.cjs
// Serves convergence data from Supabase + triggers scans + delivers briefings
// Auth: Bearer token (SMART_SABIAN_API_KEY in .env)
// Port: 5000

require('dotenv').config({ path: './.env' });
const express = require('express');
const path    = require('path');
const { logToHive } = require('./logger.cjs');
const { getLatestScores, getHistory, getSignalPatterns, testConnection } = require('./sabian_persistence.cjs');
const { getCountryLedger, getOpenObservations, getLedgerStats } = require('./observation_ledger.cjs');
const runConvergence = require('./convergence_engine.cjs');
const runBriefing = require('./government_briefing.cjs');

const app = express();
// Railway injects PORT; fallback to API_PORT or 5000 for local dev
const PORT    = process.env.PORT || process.env.API_PORT || 5000;
const API_KEY = process.env.SMART_SABIAN_API_KEY || 'sabian_key';

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

// Auth middleware — skip for /health and all /public-api/* routes
function auth(req, res, next) {
  if (req.path === '/health') return next();
  if (req.path.startsWith('/public-api')) return next();
  const header = req.headers.authorization;
  if (!header || header !== `Bearer ${API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use(auth);

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'online', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

// ── Latest global threat table ─────────────────────────────────────────────────
// Returns all countries sorted by score descending
app.get('/api/threats', async (req, res) => {
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
app.get('/api/country/:name', async (req, res) => {
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
app.get('/api/score/:name', async (req, res) => {
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

// ── Signal pattern query — which countries show a specific signal at threshold ──
app.get('/api/patterns/:signal', async (req, res) => {
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
app.get('/api/theater/:name', async (req, res) => {
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
app.get('/api/summary', async (req, res) => {
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

// ── Trigger forward briefing for any country (responds immediately, generates async) ──
app.post('/api/brief/:country', async (req, res) => {
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
app.get('/api/observations/:country', async (req, res) => {
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
app.get('/api/observations/stats', async (req, res) => {
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
    const scores = await getLatestScores();
    if (!Array.isArray(scores)) return res.status(503).json({ error: 'Database unavailable' });
    const level   = req.query.level;
    const theater = req.query.theater;
    const limit   = parseInt(req.query.limit || '200');
    let filtered  = scores;
    if (level)   filtered = filtered.filter(s => s.risk_level === level.toUpperCase());
    if (theater) filtered = filtered.filter(s => s.theater   === theater.toUpperCase());
    res.json({ count: filtered.slice(0, limit).length, scan_date: filtered[0]?.scan_date || null, countries: filtered.slice(0, limit) });
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

app.get('/public-api/observations/:country', async (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const limit   = parseInt(req.query.limit || '100');
  try {
    const [ledger, open] = await Promise.all([getCountryLedger(country, limit), getOpenObservations(country)]);
    res.json({ country, total: ledger.observations.length, open_count: open.open.length, observations: ledger.observations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DB health ──────────────────────────────────────────────────────────────────
app.get('/api/db/status', async (req, res) => {
  const result = await testConnection();
  res.json(result);
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
  console.log(`\n  Auth: Bearer ${API_KEY}\n`);

  logToHive({
    source: 'sabian_api',
    level: 'intel',
    event: 'api_started',
    data: { port: PORT },
    tags: ['api', 'server']
  });
});

module.exports = app;
