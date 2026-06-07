// climate_historical.cjs
// Fetches climate stress data from Open-Meteo ERA5 reanalysis
// Signal: climate_stress (Climate Stress)
// Source: Open-Meteo ERA5 API (free, no key needed)
// Coverage: 1980-present, fetched in 10-year chunks to avoid rate limits

require('dotenv').config({ path: '../../.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const CHECKPOINT_FILE = path.join(__dirname, '../.climate_checkpoint.json');

const COUNTRIES = {
  'Afghanistan': { lat: 33.93, lon: 67.71 },
  'Albania': { lat: 41.15, lon: 20.17 },
  'Algeria': { lat: 28.03, lon: 1.66 },
  'Angola': { lat: -11.20, lon: 17.87 },
  'Argentina': { lat: -38.42, lon: -63.62 },
  'Bangladesh': { lat: 23.68, lon: 90.36 },
  'Bolivia': { lat: -16.29, lon: -63.59 },
  'Brazil': { lat: -14.24, lon: -51.93 },
  'Burkina Faso': { lat: 12.24, lon: -1.56 },
  'Burundi': { lat: -3.37, lon: 29.92 },
  'Cambodia': { lat: 12.57, lon: 104.99 },
  'Cameroon': { lat: 7.37, lon: 12.35 },
  'CAR': { lat: 6.61, lon: 20.94 },
  'Chad': { lat: 15.45, lon: 18.73 },
  'China': { lat: 35.86, lon: 104.20 },
  'Colombia': { lat: 4.57, lon: -74.30 },
  'DRC': { lat: -4.04, lon: 21.76 },
  'Egypt': { lat: 26.82, lon: 30.80 },
  'Eritrea': { lat: 15.18, lon: 39.78 },
  'Ethiopia': { lat: 9.15, lon: 40.49 },
  'Guatemala': { lat: 15.78, lon: -90.23 },
  'Haiti': { lat: 18.97, lon: -72.29 },
  'Honduras': { lat: 15.20, lon: -86.24 },
  'India': { lat: 20.59, lon: 78.96 },
  'Indonesia': { lat: -0.79, lon: 113.92 },
  'Iran': { lat: 32.43, lon: 53.69 },
  'Iraq': { lat: 33.22, lon: 43.68 },
  'Kenya': { lat: -0.02, lon: 37.91 },
  'Libya': { lat: 26.34, lon: 17.23 },
  'Madagascar': { lat: -18.77, lon: 46.87 },
  'Malawi': { lat: -13.25, lon: 34.30 },
  'Mali': { lat: 17.57, lon: -4.00 },
  'Mauritania': { lat: 21.01, lon: -10.94 },
  'Mexico': { lat: 23.63, lon: -102.55 },
  'Morocco': { lat: 31.79, lon: -7.09 },
  'Mozambique': { lat: -18.67, lon: 35.53 },
  'Myanmar': { lat: 21.91, lon: 95.96 },
  'Nepal': { lat: 28.39, lon: 84.12 },
  'Niger': { lat: 17.61, lon: 8.08 },
  'Nigeria': { lat: 9.08, lon: 8.68 },
  'North Korea': { lat: 40.34, lon: 127.51 },
  'Pakistan': { lat: 30.38, lon: 69.35 },
  'Peru': { lat: -9.19, lon: -75.02 },
  'Philippines': { lat: 12.88, lon: 121.77 },
  'Russia': { lat: 61.52, lon: 105.32 },
  'Rwanda': { lat: -1.94, lon: 29.87 },
  'Senegal': { lat: 14.50, lon: -14.45 },
  'Sierra Leone': { lat: 8.46, lon: -11.78 },
  'Somalia': { lat: 5.15, lon: 46.20 },
  'South Africa': { lat: -30.56, lon: 22.94 },
  'South Sudan': { lat: 6.88, lon: 31.31 },
  'Sudan': { lat: 12.86, lon: 30.22 },
  'Syria': { lat: 34.80, lon: 39.00 },
  'Tanzania': { lat: -6.37, lon: 34.89 },
  'Thailand': { lat: 15.87, lon: 100.99 },
  'Tunisia': { lat: 33.89, lon: 9.54 },
  'Turkey': { lat: 38.96, lon: 35.24 },
  'Uganda': { lat: 1.37, lon: 32.29 },
  'Ukraine': { lat: 48.38, lon: 31.17 },
  'Venezuela': { lat: 6.42, lon: -66.59 },
  'Vietnam': { lat: 14.06, lon: 108.28 },
  'Yemen': { lat: 15.55, lon: 48.52 },
  'Zambia': { lat: -13.13, lon: 27.85 },
  'Zimbabwe': { lat: -19.02, lon: 29.15 }
};

function loadCheckpoint() {
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')); } catch { return {}; }
}

function saveCheckpoint(data) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
}

async function fetchWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        if (attempt < retries) {
          console.log('    Rate limited — waiting 60s...');
          await new Promise(r => setTimeout(r, 60000));
          continue;
        }
        return null;
      }
      if (!response.ok) return null;
      return response;
    } catch (e) {
      if (attempt === retries) return null;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return null;
}

async function saveReadings(readings) {
  if (readings.length === 0) return 0;

  const seen = new Set();
  const unique = readings.filter(r => {
    const key = `${r.country}|${r.signal_key}|${r.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const chunks = [];
  for (let i = 0; i < unique.length; i += 500) {
    chunks.push(unique.slice(i, i + 500));
  }

  let saved = 0;
  for (const chunk of chunks) {
    const { error } = await sb.from('historical_signal_readings').upsert(chunk, {
      onConflict: 'country,signal_key,date'
    });
    if (!error) saved += chunk.length;
  }
  return saved;
}

async function fetchClimate() {
  const checkpoint = loadCheckpoint();
  const startYear = 1980;
  const endYear = new Date().getFullYear() - 1;
  let totalSaved = 0;

  // Build decade-width chunks to avoid rate limits
  const decades = [];
  for (let y = startYear; y <= endYear; y += 10) {
    decades.push({ from: y, to: Math.min(y + 9, endYear) });
  }

  console.log('Fetching Open-Meteo ERA5 climate data...');

  for (const [country, coords] of Object.entries(COUNTRIES)) {
    if (checkpoint[country] === 'done') {
      console.log(`  ${country}: checkpointed, skipping`);
      continue;
    }

    const countryReadings = [];
    let failed = false;

    for (const { from, to } of decades) {
      try {
        const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${coords.lat}&longitude=${coords.lon}&start_date=${from}-01-01&end_date=${to}-12-31&daily=temperature_2m_max,precipitation_sum&timezone=UTC`;

        const response = await fetchWithRetry(url);
        if (!response) {
          console.log(`  ${country} ${from}-${to}: failed, skipping decade`);
          continue;
        }

        const data = await response.json();

        if (data && data.daily && data.daily.time) {
          const byYear = {};
          for (let i = 0; i < data.daily.time.length; i++) {
            const year = data.daily.time[i].substring(0, 4);
            const temp = data.daily.temperature_2m_max[i];
            const precip = data.daily.precipitation_sum[i];

            if (!byYear[year]) byYear[year] = { temps: [], precips: [] };
            if (temp !== null) byYear[year].temps.push(temp);
            if (precip !== null) byYear[year].precips.push(precip);
          }

          for (const [year, stats] of Object.entries(byYear)) {
            if (stats.temps.length < 300) continue;

            const avgTemp = stats.temps.reduce((a, b) => a + b, 0) / stats.temps.length;
            const totalPrecip = stats.precips.reduce((a, b) => a + b, 0);

            const tempScore = Math.min(100, (avgTemp / 50) * 100);
            const precipScore = Math.max(0, 100 - (totalPrecip / 20));
            const stressScore = (tempScore + precipScore) / 2;

            countryReadings.push({
              country,
              signal_key: 'climate_stress',
              signal_name: 'Climate Stress',
              date: `${year}-01-01`,
              raw_value: Math.round(stressScore * 100) / 100,
              raw_metadata: {
                avg_temp_c: Math.round(avgTemp * 10) / 10,
                total_precip_mm: Math.round(totalPrecip),
                lat: coords.lat,
                lon: coords.lon
              },
              source: 'Open-Meteo ERA5',
              gap: false,
              ingested_at: new Date().toISOString()
            });
          }
        }
      } catch (e) {
        console.log(`  ${country} ${from}-${to}: Error - ${e.message}, skipping decade`);
        continue;
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    if (countryReadings.length > 0) {
      const saved = await saveReadings(countryReadings);
      totalSaved += saved;
      checkpoint[country] = 'done';
      saveCheckpoint(checkpoint);
      console.log(`  ${country}: ${countryReadings.length} years, saved ${saved}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`Total saved: ${totalSaved} climate readings`);
  return totalSaved;
}

async function run() {
  console.log('Climate Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');

  const saved = await fetchClimate();
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { fetchClimate, saveReadings };
