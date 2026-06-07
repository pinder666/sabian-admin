// ucdp_historical.cjs
// Downloads UCDP GED + UCDP/PRIO ACD CSV zip files and ingests conflict data.
// Signals: conflict (armed conflict events/intensity), social_unrest (one-sided violence)
// Source: UCDP GED v24.1 + UCDP/PRIO ACD — free downloads, no auth required
// Coverage: 1989–2024 (GED), 1946–2024 (ACD)
// Strategy: PowerShell download + Expand-Archive (Windows), parse with csv-parser

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TMP = path.join(__dirname, '../.ucdp_tmp');

// Map UCDP country names → our canonical names
const COUNTRY_MAP = {
  'Afghanistan': 'Afghanistan', 'Algeria': 'Algeria', 'Angola': 'Angola',
  'Argentina': 'Argentina', 'Armenia': 'Armenia', 'Azerbaijan': 'Azerbaijan',
  'Bangladesh': 'Bangladesh', 'Belarus': 'Belarus', 'Benin': 'Benin',
  'Bolivia': 'Bolivia', 'Bosnia-Herzegovina': 'Bosnia', 'Brazil': 'Brazil',
  'Burkina Faso': 'Burkina Faso', 'Burundi': 'Burundi', 'Cambodia': 'Cambodia',
  'Cameroon': 'Cameroon', 'Central African Republic': 'CAR', 'Chad': 'Chad',
  'Chile': 'Chile', 'China': 'China', 'Colombia': 'Colombia',
  'Congo': 'Congo', 'Cuba': 'Cuba',
  'Democratic Republic of Congo': 'DRC', 'Djibouti': 'Djibouti',
  'Ecuador': 'Ecuador', 'Egypt': 'Egypt', 'El Salvador': 'El Salvador',
  'Eritrea': 'Eritrea', 'Ethiopia': 'Ethiopia', 'Georgia': 'Georgia',
  'Ghana': 'Ghana', 'Guatemala': 'Guatemala', 'Guinea': 'Guinea',
  'Guinea-Bissau': 'Guinea-Bissau', 'Haiti': 'Haiti', 'Honduras': 'Honduras',
  'India': 'India', 'Indonesia': 'Indonesia', 'Iran': 'Iran', 'Iraq': 'Iraq',
  'Israel': 'Israel', 'Jordan': 'Jordan', 'Kazakhstan': 'Kazakhstan',
  'Kenya': 'Kenya', 'Kosovo': 'Kosovo', 'Kyrgyzstan': 'Kyrgyzstan',
  'Laos': 'Laos', 'Lebanon': 'Lebanon', 'Liberia': 'Liberia', 'Libya': 'Libya',
  'Madagascar': 'Madagascar', 'Malawi': 'Malawi', 'Malaysia': 'Malaysia',
  'Mali': 'Mali', 'Mauritania': 'Mauritania', 'Mexico': 'Mexico',
  'Moldova': 'Moldova', 'Mongolia': 'Mongolia', 'Morocco': 'Morocco',
  'Mozambique': 'Mozambique', 'Myanmar (Burma)': 'Myanmar', 'Myanmar': 'Myanmar',
  'Nepal': 'Nepal', 'Nicaragua': 'Nicaragua', 'Niger': 'Niger',
  'Nigeria': 'Nigeria', 'North Korea': 'North Korea', 'Oman': 'Oman',
  'Pakistan': 'Pakistan', 'Papua New Guinea': 'Papua New Guinea',
  'Peru': 'Peru', 'Philippines': 'Philippines',
  'Russia (Soviet Union)': 'Russia', 'Russia': 'Russia',
  'Rwanda': 'Rwanda', 'Saudi Arabia': 'Saudi Arabia', 'Senegal': 'Senegal',
  'Sierra Leone': 'Sierra Leone', 'Solomon Islands': 'Solomon Islands',
  'Somalia': 'Somalia', 'South Africa': 'South Africa', 'South Sudan': 'South Sudan',
  'Sri Lanka': 'Sri Lanka', 'Sudan': 'Sudan', 'Syria': 'Syria',
  'Tajikistan': 'Tajikistan', 'Tanzania': 'Tanzania', 'Thailand': 'Thailand',
  'Timor-Leste': 'Timor-Leste', 'Togo': 'Togo', 'Tunisia': 'Tunisia',
  'Turkey (Ottoman Empire)': 'Turkey', 'Turkey': 'Turkey',
  'Turkmenistan': 'Turkmenistan', 'Uganda': 'Uganda', 'Ukraine': 'Ukraine',
  'United Arab Emirates': 'UAE', 'United States of America': 'United States',
  'Uzbekistan': 'Uzbekistan', 'Venezuela': 'Venezuela', 'Vietnam': 'Vietnam',
  'Vietnam (North Vietnam)': 'Vietnam', 'Yemen (North Yemen)': 'Yemen',
  'Yemen': 'Yemen', 'Zambia': 'Zambia', 'Zimbabwe': 'Zimbabwe',
};

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (e) => { file.close(); reject(e); });
  });
}

function extractZip(zipPath, destDir) {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, { timeout: 120000 });
}

function findCSV(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv'));
  if (files.length === 0) throw new Error('No CSV found in ' + dir);
  return path.join(dir, files[0]);
}

function parseCSVFile(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function fetchGED() {
  console.log('  Downloading UCDP GED v24.1 CSV zip...');
  const zipPath = path.join(TMP, 'ged241.zip');
  const extractDir = path.join(TMP, 'ged241');

  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

  try {
    await downloadFile('https://ucdp.uu.se/downloads/ged/ged241-csv.zip', zipPath);
    console.log('  Extracting...');
    extractZip(zipPath, extractDir);
    const csvFile = findCSV(extractDir);
    console.log(`  Parsing ${path.basename(csvFile)}...`);
    const rows = await parseCSVFile(csvFile);
    console.log(`  ${rows.length} GED events loaded`);
    return rows;
  } catch (e) {
    console.log(`  GED download failed: ${e.message}`);
    return [];
  }
}

async function fetchACD() {
  console.log('  Downloading UCDP/PRIO ACD v23.1 CSV zip (1946–2023)...');
  const zipPath = path.join(TMP, 'acd231.zip');
  const extractDir = path.join(TMP, 'acd231');

  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

  try {
    await downloadFile('https://ucdp.uu.se/downloads/ucdpprio/ucdp-prio-acd-231-csv.zip', zipPath);
    console.log('  Extracting...');
    extractZip(zipPath, extractDir);
    const csvFile = findCSV(extractDir);
    console.log(`  Parsing ${path.basename(csvFile)}...`);
    const rows = await parseCSVFile(csvFile);
    console.log(`  ${rows.length} ACD conflict-years loaded`);
    return rows;
  } catch (e) {
    console.log(`  ACD download failed: ${e.message}`);
    return [];
  }
}

async function fetchUCDP() {
  const readings = [];

  // Phase 1: GED events → conflict + social_unrest, 1989–2024
  const gedRows = await fetchGED();
  const byCountryYear = {};

  for (const row of gedRows) {
    const ucdpCountry = row.country || row.Country;
    const canonical = COUNTRY_MAP[ucdpCountry];
    if (!canonical) continue;

    const year = parseInt(row.year || row.Year);
    const deaths = parseInt(row.best || row.Best || 0) || 0;
    const vType = parseInt(row.type_of_violence || row.TypeOfViolence || 0);

    if (!byCountryYear[canonical]) byCountryYear[canonical] = {};
    if (!byCountryYear[canonical][year]) byCountryYear[canonical][year] = { events: 0, deaths: 0, unrest: 0 };

    if (vType === 1 || vType === 2) {
      byCountryYear[canonical][year].events++;
      byCountryYear[canonical][year].deaths += deaths;
    } else if (vType === 3) {
      byCountryYear[canonical][year].unrest++;
    }
  }

  for (const [country, years] of Object.entries(byCountryYear)) {
    for (const [year, stats] of Object.entries(years)) {
      const ts = `${year}-01-01`;
      readings.push({ country, signal_key: 'conflict', signal_name: 'Conflict Events', date: ts,
        raw_value: stats.events, raw_metadata: { deaths: stats.deaths, year: parseInt(year) },
        source: 'UCDP GED', gap: false, ingested_at: new Date().toISOString() });
      readings.push({ country, signal_key: 'social_unrest', signal_name: 'Social Unrest', date: ts,
        raw_value: stats.unrest, raw_metadata: { one_sided_events: stats.unrest, year: parseInt(year) },
        source: 'UCDP GED', gap: false, ingested_at: new Date().toISOString() });
    }
  }

  // Phase 2: ACD → extend conflict back to 1946 with intensity data
  const acdRows = await fetchACD();
  const acdSeen = new Set(Object.keys(byCountryYear).flatMap(c =>
    Object.keys(byCountryYear[c]).map(y => `${c}|${y}`)
  ));

  for (const row of acdRows) {
    const location = row.location || row.Location;
    if (!location) continue;
    const year = parseInt(row.year || row.Year);
    const intensity = parseInt(row.intensity_level || row.IntensityLevel || 1);

    // ACD can have multiple countries in location field (comma-separated)
    const parts = location.split(',').map(s => s.trim());
    for (const part of parts) {
      const canonical = COUNTRY_MAP[part] || (Object.values(COUNTRY_MAP).includes(part) ? part : null);
      if (!canonical) continue;
      const key = `${canonical}|${year}`;
      if (acdSeen.has(key)) continue; // GED already has it
      acdSeen.add(key);

      readings.push({ country: canonical, signal_key: 'conflict', signal_name: 'Conflict Events',
        date: `${year}-01-01`, raw_value: intensity, raw_metadata: { intensity_level: intensity, year, source: 'ACD' },
        source: 'UCDP/PRIO ACD', gap: false, ingested_at: new Date().toISOString() });
    }
  }

  // Cleanup
  try {
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  } catch (e) {}

  console.log(`Fetched ${readings.length} UCDP readings`);
  return readings;
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
  console.log(`Deduped: ${readings.length} -> ${unique.length}`);
  let saved = 0;
  for (let i = 0; i < unique.length; i += 500) {
    const { error } = await sb.from('historical_signal_readings').upsert(unique.slice(i, i + 500), { onConflict: 'country,signal_key,date' });
    if (error) console.log('Upsert error:', error.message);
    else saved += Math.min(500, unique.length - i);
  }
  return saved;
}

async function run() {
  console.log('UCDP Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchUCDP();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchUCDP, saveReadings };
