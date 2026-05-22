// sabian_alert.cjs
// Threshold crossing detection and alert delivery
// Fires when a country crosses from ELEVATED → WARNING or WARNING → CRITICAL
// Sends email notification + optionally triggers government briefing
//
// Env vars:
//   SABIAN_EMAIL_USER    — from address (support@sabian.ai)
//   SABIAN_EMAIL_PASSWORD — SMTP password
//   EMAIL_HOST           — smtp.privateemail.com
//   EMAIL_PORT           — 465
//   ALERT_TO_EMAIL       — recipient (defaults to SABIAN_EMAIL_USER)
//   BRIEFING_ON_ALERT    — set to 'true' to auto-generate audio briefing on alert

require('dotenv').config({ path: './.env' });
const nodemailer = require('nodemailer');
const { logToHive } = require('./logger.cjs');

// ── Risk level numeric for comparison ─────────────────────────────────────────
const RISK_RANK = { STABLE: 0, ELEVATED: 1, WARNING: 2, CRITICAL: 3 };

function getRiskLevel(score) {
  if (score >= 81) return 'CRITICAL';
  if (score >= 66) return 'WARNING';
  if (score >= 41) return 'ELEVATED';
  return 'STABLE';
}

// ── Determine if an alert should fire ─────────────────────────────────────────
// Fires on:
//   - New WARNING crossing  (previous < 66, current >= 66)
//   - New CRITICAL crossing (previous < 81, current >= 81)
//   - First scan for country at WARNING+  (no previous score)
// Does NOT fire if country was already at the same or higher risk level

function shouldAlert(currentScore, previousScore) {
  const currentLevel = getRiskLevel(currentScore);

  if (currentScore < 66) return { alert: false };

  if (previousScore === null || previousScore === undefined) {
    return { alert: true, reason: `First recorded score: ${currentLevel} (${currentScore}/100)` };
  }

  const previousLevel = getRiskLevel(previousScore);
  const currentRank = RISK_RANK[currentLevel];
  const previousRank = RISK_RANK[previousLevel];

  if (currentRank > previousRank) {
    return {
      alert: true,
      reason: `Threshold crossed: ${previousLevel} (${previousScore}) → ${currentLevel} (${currentScore})`
    };
  }

  return { alert: false };
}

// ── Build HTML email body ──────────────────────────────────────────────────────

function buildEmailHTML(result, previousScore, alertReason) {
  const { country, convergence_score, risk_level, threshold_window, signals, top_3_signals, theater, date } = result;

  const prevText = previousScore !== null && previousScore !== undefined
    ? ` (↑ from ${previousScore} — ${getRiskLevel(previousScore)})`
    : ' (first scan)';

  const levelColors = { CRITICAL: '#cc0000', WARNING: '#cc7700', ELEVATED: '#0077cc', STABLE: '#009933' };
  const color = levelColors[risk_level] || '#333';

  const signalRows = (signals || [])
    .filter(s => s.score !== null)
    .sort((a, b) => b.score - a.score)
    .map(s => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #2a2a2a;">${s.name}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #2a2a2a;text-align:center;font-weight:bold;color:${s.score >= 80 ? '#cc0000' : s.score >= 60 ? '#cc7700' : '#ccc'};">${s.score}/100</td>
        <td style="padding:6px 12px;border-bottom:1px solid #2a2a2a;color:#999;">${s.label || ''}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #2a2a2a;color:#999;text-transform:uppercase;font-size:11px;">${s.trend || ''}</td>
      </tr>`)
    .join('');

  const failedSignals = (signals || []).filter(s => s.score === null);
  const failedText = failedSignals.length
    ? `<p style="color:#666;font-size:12px;margin-top:8px;">Signals offline (excluded from score): ${failedSignals.map(s => s.name).join(', ')}</p>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0f;color:#e0e0e0;font-family:'Courier New',monospace;padding:0;margin:0;">
  <div style="max-width:700px;margin:0 auto;padding:32px 24px;">

    <div style="border-left:4px solid ${color};padding-left:16px;margin-bottom:28px;">
      <div style="font-size:11px;color:#666;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">
        SABIAN GLOBAL INTELLIGENCE — THRESHOLD ALERT
      </div>
      <div style="font-size:28px;font-weight:bold;color:${color};letter-spacing:1px;">
        ${risk_level}: ${country}
      </div>
      <div style="font-size:13px;color:#999;margin-top:4px;">
        ${theater || 'Unknown theater'} · Score: <strong style="color:#e0e0e0;">${convergence_score}/100</strong>${prevText}
      </div>
    </div>

    <div style="background:#111118;border:1px solid #222;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:11px;color:#666;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">DECISION WINDOW</div>
      <div style="font-size:16px;color:${color};font-weight:bold;">${threshold_window}</div>
    </div>

    <div style="background:#111118;border:1px solid #222;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:11px;color:#666;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">ALERT TRIGGER</div>
      <div style="font-size:14px;color:#e0e0e0;">${alertReason}</div>
    </div>

    <div style="margin-bottom:24px;">
      <div style="font-size:11px;color:#666;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">SIGNAL BREAKDOWN</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#1a1a24;">
            <th style="padding:8px 12px;text-align:left;color:#666;font-weight:normal;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Signal</th>
            <th style="padding:8px 12px;text-align:center;color:#666;font-weight:normal;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Score</th>
            <th style="padding:8px 12px;text-align:left;color:#666;font-weight:normal;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Reading</th>
            <th style="padding:8px 12px;text-align:left;color:#666;font-weight:normal;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Trend</th>
          </tr>
        </thead>
        <tbody>${signalRows}</tbody>
      </table>
      ${failedText}
    </div>

    <div style="border-top:1px solid #1a1a24;padding-top:16px;font-size:11px;color:#444;line-height:1.6;">
      Scan date: ${date || new Date().toISOString().slice(0, 10)} ·
      Generated: ${new Date().toISOString()} ·
      Source: Sabian Convergence Engine v1 — Open-source signals only
    </div>

  </div>
</body>
</html>`;
}

// ── Send alert email ───────────────────────────────────────────────────────────

async function sendAlertEmail(result, previousScore, alertReason) {
  const user = process.env.SABIAN_EMAIL_USER;
  const pass = process.env.SABIAN_EMAIL_PASSWORD;
  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT || '465');

  if (!user || !pass || !host) {
    logToHive({
      source: 'sabian_alert',
      level: 'warn',
      event: 'email_skipped',
      data: { reason: 'Missing SABIAN_EMAIL_USER / SABIAN_EMAIL_PASSWORD / EMAIL_HOST in .env' },
      tags: ['alert', 'email']
    });
    return { sent: false, reason: 'email not configured' };
  }

  const recipient = process.env.ALERT_TO_EMAIL || user;
  const { country, convergence_score, risk_level } = result;

  const subject = `SABIAN ALERT — ${risk_level}: ${country} — ${convergence_score}/100 — ${result.threshold_window?.split(' — ')[0] || 'threshold crossed'}`;
  const html = buildEmailHTML(result, previousScore, alertReason);

  // Try SSL (465) first, fall back to STARTTLS (587) if auth fails
  const configs = [
    { host, port, secure: true,  auth: { user, pass } },
    { host, port: 587, secure: false, requireTLS: true, auth: { user, pass } }
  ];

  let lastErr;
  for (const cfg of configs) {
    const transporter = nodemailer.createTransport(cfg);
    try {
        await transporter.sendMail({
        from: `"Sabian Intelligence" <${user}>`,
        to: recipient,
        subject,
        html
      });

      logToHive({
        source: 'sabian_alert',
        level: 'intel',
        event: 'alert_sent',
        data: { country, convergence_score, risk_level, recipient, reason: alertReason, port: cfg.port },
        tags: ['alert', 'email', country, risk_level.toLowerCase()]
      });

      console.log(`  📡 ALERT SENT: ${country} (${risk_level} — ${convergence_score}/100) → ${recipient}`);
      return { sent: true, recipient, subject };

    } catch (err) {
      lastErr = err;
    }
  }

  logToHive({
    source: 'sabian_alert',
    level: 'error',
    event: 'alert_send_failed',
    data: { country, message: lastErr.message },
    tags: ['alert', 'email', 'error']
  });
  console.error(`  Alert email failed for ${country}: ${lastErr.message}`);
  return { sent: false, error: lastErr.message };
}

// ── Main export: check a result and fire alert if warranted ───────────────────
// previousScore: number or null (from Supabase previous scan)
// Returns: { alerted: bool, ... }

async function checkAndAlert(result, previousScore) {
  const { country, convergence_score } = result;

  if (!convergence_score && convergence_score !== 0) {
    return { alerted: false, reason: 'no score' };
  }

  const { alert, reason } = shouldAlert(convergence_score, previousScore);

  if (!alert) {
    return { alerted: false, country, score: convergence_score, reason: 'no threshold crossing' };
  }

  console.log(`\n  ⚠️  THRESHOLD CROSSING: ${country} — ${reason}`);

  const emailResult = await sendAlertEmail(result, previousScore, reason);

  // Optional: trigger briefing audio if BRIEFING_ON_ALERT=true
  if (process.env.BRIEFING_ON_ALERT === 'true') {
    try {
      const runBriefing = require('./government_briefing.cjs');
      const scanDate = result.date || new Date().toISOString().slice(0, 10);
      console.log(`  Generating government briefing for ${country}...`);
      const briefing = await runBriefing(country, 'forward', scanDate);
      logToHive({
        source: 'sabian_alert',
        level: 'intel',
        event: 'briefing_triggered',
        data: { country, convergence_score: result.convergence_score, briefing_status: briefing.status },
        tags: ['alert', 'briefing', country]
      });
    } catch (err) {
      console.error(`  Briefing generation failed for ${country}: ${err.message}`);
    }
  }

  return {
    alerted: true,
    country,
    score: convergence_score,
    level: result.risk_level,
    reason,
    email: emailResult
  };
}

module.exports = { checkAndAlert, shouldAlert };

// Standalone test: node sabian_alert.cjs
// Sends a test alert email using Sudan T-5 data
if (require.main === module) {
  const testResult = {
    country: 'Sudan',
    date: '2023-04-10',
    convergence_score: 82,
    risk_level: 'CRITICAL',
    threshold_window: '0-30 days — action window closing',
    theater: 'AFRICOM',
    signals: [
      { name: 'Food Security', score: 100, label: 'IPC Phase 5 — Famine', trend: 'critical', weight: 0.20 },
      { name: 'Satellite Fire', score: 100, label: '30,609 hotspots, 9.4 MW mean FRP (sustained)', trend: 'sustained', weight: 0.10 },
      { name: 'Economic Stress', score: 100, label: 'GDP growth -14.0%, inflation 138.8%', trend: 'contracting', weight: 0.02 },
      { name: 'Governance', score: 78, label: 'Weakest: Government Effectiveness (score 16/100)', trend: 'critical', weight: 0.17 },
      { name: 'Climate Stress', score: 70, label: '0.0mm/14d precip, 37.5°C mean max temp', trend: 'severe drought', weight: 0.10 },
      { name: 'Trade Collapse', score: 7, label: 'Imports +13% YoY quarterly (2022)', trend: 'growing', weight: 0.05 },
      { name: 'Conflict Events', score: null, label: 'GDELT offline', trend: 'unknown', weight: 0.22 },
      { name: 'Displacement', score: null, label: 'No data returned', trend: 'unknown', weight: 0.14 }
    ],
    top_3_signals: [
      { name: 'Food Security', score: 100, label: 'IPC Phase 5 — Famine', trend: 'critical' },
      { name: 'Satellite Fire', score: 100, label: '30,609 hotspots, 9.4 MW mean FRP', trend: 'sustained' },
      { name: 'Economic Stress', score: 100, label: 'GDP -14.0%, inflation 138.8%', trend: 'contracting' }
    ]
  };

  checkAndAlert(testResult, 62)
    .then(r => console.log('\nAlert result:', JSON.stringify(r, null, 2)))
    .catch(console.error);
}
