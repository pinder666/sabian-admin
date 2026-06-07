// structural_pressure_feed.cjs
// Reads the most recent structural_pressure value from historical_signal_readings.
// structural_pressure = MDC composite of 5 behavioral/predictive signals.
// Computed annually by historical/fetchers/structural_pressure_historical.cjs.
// Validated: precision=92.2%, recall=74.6%, F1=0.825, 2yr early warning confirmed.

require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchStructuralPressureData(country) {
  try {
    const { data, error } = await sb
      .from('historical_signal_readings')
      .select('raw_value,date,raw_metadata')
      .eq('country', country)
      .eq('signal_key', 'structural_pressure')
      .eq('gap', false)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return { score: null, reason: 'No structural pressure data' };
    }

    const mdcZ = parseFloat(data.raw_value);
    // MDC z-score → 0-100 risk score: 50 + z*25, clamped [0,100]
    const score = Math.max(0, Math.min(100, Math.round(50 + mdcZ * 25)));
    const dims = data.raw_metadata?.dims || 0;
    const year = new Date(data.date).getFullYear();

    return {
      score,
      mdc_z:  mdcZ,
      dims,
      year,
      trend:  mdcZ > 0.5 ? 'elevated' : mdcZ > 0 ? 'rising' : 'stable',
      source: 'MDC_composite'
    };
  } catch (err) {
    return { score: null, reason: err.message };
  }
}

module.exports = { fetchStructuralPressureData };
