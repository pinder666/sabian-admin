// vdem_governance_feed.cjs
// V-Dem Governance Signal — democratic backsliding and institutional fragility
// Source: Varieties of Democracy (V-Dem) project — annual dataset, University of Gothenburg
// Score 0–100: higher = more authoritarian / greater institutional fragility
// Logic: V-Dem's Liberal Democracy Index (LDI) and Electoral Democracy Index (EDI)
//   are the most academically validated measures of governance quality.
//   Backsliding (declining scores over 3 years) is a stronger predictor of
//   instability than current authoritarianism level.
// Cadence: annual — V-Dem releases in March/April each year
// Note: V-Dem does not have a public JSON API — we use the latest published dataset

require('dotenv').config({ path: './.env' });
const { logToHive } = require('./logger.cjs');

async function fetchVdemGovernanceData(country) {
  try {
    const { sb } = require('./historical/db.cjs');
    const { data, error } = await sb
      .from('historical_signal_readings')
      .select('raw_value, date')
      .eq('country', country)
      .eq('signal_key', 'vdem_governance')
      .eq('gap', false)
      .order('date', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return { raw_value: null, reason: 'no_vdem_data' };
    return {
      raw_value: data[0].raw_value,
      date: data[0].date,
      source: 'vdem_v16_csv'
    };
  } catch (err) {
    logToHive({ source: 'vdem_governance_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { raw_value: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchVdemGovernanceData };
