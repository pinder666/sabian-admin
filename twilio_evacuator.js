// twilio_evacuator.js
// Sabian SMS alert system — reads live convergence scores from Supabase
// Fires SMS when any country crosses CRITICAL threshold (score >= 81)
// Previously read static threat_scan.json — now reads live Supabase data
// Called by sabian_alert.cjs or run standalone

require('dotenv').config({ path: './.env' });
const twilio = require('twilio');
const { getLatestScores } = require('./sabian_persistence.cjs');
const { logToHive } = require('./logger.cjs');

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// Alert recipients — update with real numbers
// Format: E.164 international format (+1XXXXXXXXXX)
const ALERT_RECIPIENTS = (process.env.SMS_ALERT_NUMBERS || '')
  .split(',')
  .map(n => n.trim())
  .filter(n => n.length > 0);

async function sendSMS(to, body) {
  try {
    const msg = await client.messages.create({
      body,
      from: process.env.TWILIO_FROM,
      to
    });
    console.log(`  SMS sent to ${to}: ${msg.sid}`);
    return { sent: true, sid: msg.sid, to };
  } catch (err) {
    console.error(`  SMS failed to ${to}: ${err.message}`);
    return { sent: false, to, error: err.message };
  }
}

function buildSMSText(country, score, level, threshold_window, topSignal) {
  const top = topSignal ? ` | ${topSignal.name}: ${topSignal.score}/100` : '';
  return `SABIAN ALERT — ${level}: ${country}\nScore: ${score}/100\nWindow: ${threshold_window}${top}\nSabian Intelligence System`;
}

async function checkAndSendSMSAlerts(criticalOnly = true) {
  if (!ALERT_RECIPIENTS.length) {
    console.log('  No SMS_ALERT_NUMBERS configured in .env — skipping SMS alerts');
    console.log('  Add: SMS_ALERT_NUMBERS=+1XXXXXXXXXX,+1XXXXXXXXXX');
    return { skipped: true, reason: 'no recipients configured' };
  }

  if (!process.env.TWILIO_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log('  Twilio credentials not configured');
    return { skipped: true, reason: 'twilio not configured' };
  }

  try {
    const scores = await getLatestScores();
    if (!Array.isArray(scores)) {
      return { skipped: true, reason: 'Supabase not reachable or no scores stored' };
    }

    const threshold = criticalOnly ? 81 : 66;
    const alerts = scores.filter(s => (s.convergence_score || 0) >= threshold);

    console.log(`  Checking ${scores.length} countries — ${alerts.length} at ${criticalOnly ? 'CRITICAL' : 'WARNING+'}`);

    const results = [];
    for (const country of alerts) {
      const topSignal = country.top_3_signals?.[0] || null;
      const body = buildSMSText(
        country.country,
        country.convergence_score,
        country.risk_level,
        'Action window closing',
        topSignal
      );

      logToHive({
        source: 'twilio_evacuator',
        level: 'intel',
        event: 'sms_alert_firing',
        data: { country: country.country, score: country.convergence_score, level: country.risk_level, recipients: ALERT_RECIPIENTS.length },
        tags: ['sms', 'alert', country.country, country.risk_level?.toLowerCase()]
      });

      for (const number of ALERT_RECIPIENTS) {
        const result = await sendSMS(number, body);
        results.push({ country: country.country, ...result });
      }
    }

    return { alerts_sent: results.filter(r => r.sent).length, results };

  } catch (err) {
    logToHive({
      source: 'twilio_evacuator',
      level: 'error',
      event: 'sms_check_failed',
      data: { message: err.message },
      tags: ['sms', 'error']
    });
    return { error: err.message };
  }
}

module.exports = { checkAndSendSMSAlerts };

// Standalone: node twilio_evacuator.js
// Reads live Supabase scores and sends SMS to all CRITICAL countries
if (require.main === module) {
  const criticalOnly = !process.argv.includes('--warning');
  console.log(`\nSabian SMS Alert Check — ${criticalOnly ? 'CRITICAL only' : 'WARNING+'}`);
  checkAndSendSMSAlerts(criticalOnly)
    .then(r => console.log('\nResult:', JSON.stringify(r, null, 2)))
    .catch(console.error);
}
