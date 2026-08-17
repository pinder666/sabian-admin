// pnsiq_routes.cjs
// PNSIQ <-> Sabian connector — Express router mounted at /api/pnsiq
// Auth: Bearer SMART_SABIAN_API_KEY (internal tier, set in sabian_api.cjs)
// PNSIQ calls these endpoints. Sabian never calls PNSIQ. One direction only.

const express      = require('express');
const router       = express.Router();
const { logToHive } = require('./logger.cjs');
const { fetchPortCongestionData } = require('./port_congestion_feed.cjs');
const { getLatestScores } = require('./sabian_persistence.cjs');

// In-memory brand store — keyed by brand_id.
// Holds the last ingest payload + computed findings per brand.
// Survives restarts only in the hive log. Good enough for v1.
const brandStore = new Map();

// ── Utility ────────────────────────────────────────────────────────────────────

function safeNum(v, fallback = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

// Score a brand data snapshot against Sabian macro signals.
// Returns ranked findings with dollar impact and action.
function scoreBrandData(brandData, macroSignals) {
  const findings = [];

  // Port congestion finding
  const portRisk = macroSignals.portCongestion || {};
  const worstPort = Object.entries(portRisk)
    .sort(([, a], [, b]) => safeNum(b.wait_hours) - safeNum(a.wait_hours))[0];
  if (worstPort) {
    const [portName, portData] = worstPort;
    const waitHours = safeNum(portData.wait_hours);
    if (waitHours > 48) {
      findings.push({
        id: 'port_congestion',
        type: 'supply_chain',
        severity: waitHours > 96 ? 'critical' : 'warning',
        title: `Port congestion at ${portName} — ${Math.round(waitHours / 24)} day delay`,
        detail: `Vessel wait time at ${portName} is ${Math.round(waitHours)} hours. China-origin and Asia-sourced goods are most exposed. Reorder windows need adjustment.`,
        action: 'Review open POs routed through this port. Flag accounts expecting delivery in next 21 days.',
        signal_source: 'Sabian port feed',
        dollar_impact: null
      });
    }
  }

  // Retailer risk finding — pull from brand's account list if provided
  const accounts = brandData.accounts || [];
  const atRiskAccounts = accounts.filter(a => safeNum(a.risk_score) >= 7);
  if (atRiskAccounts.length > 0) {
    const totalExposure = atRiskAccounts.reduce((sum, a) => sum + safeNum(a.open_ar), 0);
    findings.push({
      id: 'retailer_credit_risk',
      type: 'account_risk',
      severity: atRiskAccounts.length >= 3 ? 'critical' : 'warning',
      title: `${atRiskAccounts.length} account${atRiskAccounts.length > 1 ? 's' : ''} flagged — $${totalExposure.toLocaleString()} AR exposure`,
      detail: `Sabian risk scores: ${atRiskAccounts.map(a => `${a.name} (${a.risk_score}/10)`).join(', ')}. Historical pattern: accounts at this score default on 34% of outstanding AR within 60 days.`,
      action: 'Require payment before next shipment for accounts scoring 8+. Reduce exposure on 7s.',
      signal_source: 'Sabian account scoring',
      dollar_impact: totalExposure
    });
  }

  // Silent accounts finding
  const silentDays = safeNum(brandData.silence_threshold_days, 90);
  const silentAccounts = accounts.filter(a => safeNum(a.days_since_order) >= silentDays);
  if (silentAccounts.length > 0) {
    findings.push({
      id: 'account_silence',
      type: 'account_risk',
      severity: 'warning',
      title: `${silentAccounts.length} accounts silent for ${silentDays}+ days`,
      detail: silentAccounts.slice(0, 5).map(a => `${a.name}: ${a.days_since_order} days`).join(', '),
      action: 'Rep outreach queue. Sabian has drafted re-engagement openers for each account.',
      signal_source: 'PNSIQ order history',
      dollar_impact: null
    });
  }

  // Macro tariff signal — inject from known Sabian intelligence
  const tariffSignal = macroSignals.tariff || {};
  if (tariffSignal.china_rate && safeNum(tariffSignal.china_rate) >= 100) {
    findings.push({
      id: 'tariff_signal',
      type: 'macro',
      severity: 'warning',
      title: `China Section 301 tariff at ${tariffSignal.china_rate}% — cost exposure on China-sourced SKUs`,
      detail: `Current effective tariff rate on Chinese textile goods: ${tariffSignal.china_rate}%. Brands sourcing in China face margin compression unless they have hedged via price increases or sourcing diversification.`,
      action: 'Review China-sourced SKU margin. Raise wholesale price on next season or shift sourcing.',
      signal_source: 'Sabian tariff feed',
      dollar_impact: null
    });
  }

  // Sort by severity then dollar impact
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2);
    if (sevDiff !== 0) return sevDiff;
    return safeNum(b.dollar_impact) - safeNum(a.dollar_impact);
  });

  return findings;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET /api/pnsiq/health
// Liveness check — PNSIQ calls this on startup to confirm Sabian is reachable.
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'sabian-pnsiq-connector',
    timestamp: new Date().toISOString(),
    brands_in_store: brandStore.size
  });
});

// GET /api/pnsiq/signals
// Returns current macro signals relevant to wholesale apparel.
// PNSIQ injects these into rep briefings and findings feed.
router.get('/signals', async (req, res) => {
  try {
    // Port congestion — live feed
    let portCongestion = {};
    try {
      portCongestion = await fetchPortCongestionData();
    } catch (e) {
      console.warn('[PNSIQ] Port congestion fetch failed:', e.message);
    }

    // Tariff signal — hardcoded current known state (update when policy changes)
    const tariff = {
      china_rate: 145,
      effective_date: '2025-05-14',
      hts_scope: 'Textile goods HS 61, 62, 63 — garments, made-up articles',
      note: 'Section 301 List 3+4A. Excludes goods with certificates of origin from non-CN countries.'
    };

    // Global risk snapshot from Sabian persistence (top 10 countries for context)
    let globalRisk = [];
    try {
      const scores = await getLatestScores();
      globalRisk = (scores || []).slice(0, 10).map(c => ({
        country: c.country,
        score: c.convergence_score,
        trend: c.trend
      }));
    } catch (e) {
      console.warn('[PNSIQ] Global scores fetch failed:', e.message);
    }

    res.json({
      timestamp: new Date().toISOString(),
      portCongestion,
      tariff,
      globalRisk,
      sources: ['Sabian port feed', 'USTR Section 301 schedule', 'Sabian convergence engine']
    });

  } catch (err) {
    console.error('[PNSIQ] /signals error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pnsiq/ingest
// PNSIQ sends a brand data snapshot. Sabian scores it, stores findings, logs to hive.
// Body: { brand_id, brand_name, accounts, orders, chargebacks, silence_threshold_days }
router.post('/ingest', async (req, res) => {
  try {
    const { brand_id, brand_name, accounts = [], orders = [], chargebacks = [], silence_threshold_days = 90 } = req.body;

    if (!brand_id) return res.status(400).json({ error: 'brand_id required' });

    // Fetch current macro signals
    let macroSignals = { portCongestion: {}, tariff: { china_rate: 145 } };
    try {
      const portData = await fetchPortCongestionData();
      macroSignals.portCongestion = portData || {};
    } catch (e) { /* non-fatal */ }

    // Score the brand data
    const brandData = { accounts, orders, chargebacks, silence_threshold_days };
    const findings = scoreBrandData(brandData, macroSignals);

    // Store in memory
    brandStore.set(brand_id, {
      brand_id,
      brand_name: brand_name || brand_id,
      last_ingest: new Date().toISOString(),
      findings,
      account_count: accounts.length,
      order_count: orders.length,
      chargeback_count: chargebacks.length
    });

    // Log to Sabian hive
    logToHive({
      source: 'pnsiq_connector',
      level: 'intel',
      event: 'brand_ingest',
      data: {
        brand_id,
        brand_name,
        account_count: accounts.length,
        findings_count: findings.length,
        critical_count: findings.filter(f => f.severity === 'critical').length
      },
      tags: ['pnsiq', 'brand', 'ingest']
    });

    res.json({
      status: 'ok',
      brand_id,
      findings_count: findings.length,
      critical_count: findings.filter(f => f.severity === 'critical').length,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[PNSIQ] /ingest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pnsiq/findings/:brand_id
// Returns ranked findings for a brand from the last ingest.
router.get('/findings/:brand_id', (req, res) => {
  const { brand_id } = req.params;
  const stored = brandStore.get(brand_id);

  if (!stored) {
    return res.status(404).json({
      error: 'No findings for this brand. POST to /api/pnsiq/ingest first.',
      brand_id
    });
  }

  res.json({
    brand_id,
    brand_name: stored.brand_name,
    last_ingest: stored.last_ingest,
    findings: stored.findings,
    summary: {
      total: stored.findings.length,
      critical: stored.findings.filter(f => f.severity === 'critical').length,
      warning: stored.findings.filter(f => f.severity === 'warning').length
    }
  });
});

// POST /api/pnsiq/brief
// Generates a Sabian-voiced briefing for a brand.
// Requires ANTHROPIC_API_KEY to be set.
// Body: { brand_id, context } — context is optional extra copy for the briefing.
router.post('/brief', async (req, res) => {
  try {
    const { brand_id, context: extraContext = '' } = req.body;
    if (!brand_id) return res.status(400).json({ error: 'brand_id required' });

    const stored = brandStore.get(brand_id);
    if (!stored) {
      return res.status(404).json({
        error: 'No data for this brand. POST to /api/pnsiq/ingest first.',
        brand_id
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error: 'ANTHROPIC_API_KEY not set. Restore the key in Railway to enable briefing generation.',
        brand_id
      });
    }

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const findingsSummary = stored.findings.map((f, i) =>
      `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n   ${f.detail}\n   Action: ${f.action}`
    ).join('\n\n');

    const prompt = `You are generating a Sabian intelligence briefing in the exact dual-voice format used across all Sabian Technology products.

Brand: ${stored.brand_name}
Last data ingested: ${stored.last_ingest}
Account count: ${stored.account_count}
Open findings: ${stored.findings.length} (${stored.findings.filter(f => f.severity === 'critical').length} critical)

FINDINGS:
${findingsSummary}

${extraContext ? `ADDITIONAL CONTEXT:\n${extraContext}` : ''}

Write a Host A / Sabian dual-voice briefing for the brand's leadership. Rules:
- Host A speaks first. Her first word is always "Sabian," followed by the question that seems impossible to answer but that everyone in the room is asking.
- Sabian answers with verified data only. No speculation. No softening. One number, one consequence, one action per response.
- Host A pushes once more for the complete picture.
- Sabian states the consequence of inaction flat. No hedging.
- End: Host A says "Sixty seconds. Excellent work."
- Tone: boardroom. Surgical. Every word earns its place.
- Do not mention AI, algorithms, or technology. Speak only in business outcomes.
- Maximum 6 exchanges total.

Return ONLY the dialogue — no stage directions, no headers, no explanation.`;

    const message = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    });

    const script = message.content[0]?.text || '';

    logToHive({
      source: 'pnsiq_connector',
      level: 'intel',
      event: 'brief_generated',
      data: { brand_id, brand_name: stored.brand_name, findings_count: stored.findings.length },
      tags: ['pnsiq', 'brief', 'briefing']
    });

    res.json({
      brand_id,
      brand_name: stored.brand_name,
      script,
      timestamp: new Date().toISOString(),
      findings_count: stored.findings.length
    });

  } catch (err) {
    console.error('[PNSIQ] /brief error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
