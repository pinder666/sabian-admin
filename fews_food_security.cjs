// fews_food_security.cjs
// FEWS NET food security IPC phase data by country
// Open API — no key required
// Follows fred_macro_data.cjs pattern

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

const IPC_LABELS = {
  1: 'Minimal',
  2: 'Stressed',
  3: 'Crisis',
  4: 'Emergency',
  5: 'Famine'
};

async function fetchFoodSecurity(country_code, date_from, date_to) {
  const params = new URLSearchParams({
    format: 'json',
    country: country_code,
    limit: '50'
  });

  if (date_from) params.set('valid_from', date_from);
  if (date_to) params.set('valid_to', date_to);

  const url = `https://fdw.fews.net/api/ipcphase/?${params.toString()}`;

  try {
    const raw = await fetchJson(url);
    const results = raw.results || raw || [];

    if (!results.length) {
      return { source: 'FEWS_NET', country: country_code, data: [], warning: 'No IPC data returned for this country/date range' };
    }

    // Find the highest IPC phase and total affected population
    const phases = results.map(r => ({
      region: r.geographic_unit_full_name || r.geographic_unit_name || r.fnid || 'Unknown',
      ipc_phase: r.value ? Math.round(r.value) : null,
      ipc_label: IPC_LABELS[r.value ? Math.round(r.value) : null] || r.description || 'Unknown',
      population_affected: r.population || r.affected_population || null,
      valid_from: r.projection_start || r.valid_from || null,
      valid_to: r.projection_end || r.valid_to || null,
      source: 'FEWS_NET'
    })).filter(r => r.ipc_phase !== null);

    const worst_phase = phases.reduce((max, r) => r.ipc_phase > max ? r.ipc_phase : max, 0);
    const total_affected = phases.reduce((sum, r) => sum + (r.population_affected || 0), 0);
    const emergency_or_worse = phases.filter(r => r.ipc_phase >= 4);

    logToHive({
      source: 'fews_food_security',
      level: 'intel',
      event: 'food_security_fetched',
      data: { country: country_code, worst_phase, total_affected, regions_at_emergency: emergency_or_worse.length },
      tags: ['fews', 'food_security', 'ipc', country_code]
    });

    return {
      source: 'FEWS_NET',
      country: country_code,
      worst_phase,
      worst_phase_label: IPC_LABELS[worst_phase] || 'Unknown',
      total_affected_population: total_affected,
      emergency_regions: emergency_or_worse.length,
      regions: phases,
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'fews_food_security',
      level: 'error',
      event: 'fetch_failed',
      data: { country: country_code, message: err.message },
      tags: ['fews', 'error']
    });
    return { source: 'FEWS_NET', country: country_code, error: err.message };
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`FEWS NET parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

module.exports = fetchFoodSecurity;

// Standalone test: node fews_food_security.cjs
if (require.main === module) {
  fetchFoodSecurity('ML').then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(console.error);
}
