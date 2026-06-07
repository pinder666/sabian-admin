// historical/ingest_ties_xls.cjs
// Ingests TIES (Threat and Imposition of Economic Sanctions) v4.1 into historical_signal_readings.
// Source: TIESv4-1 (1).xls
// Coverage: 1945–2005, ~1,400 sanctions cases
// Signal key: sanctions_pressure (0-100 risk score, higher = more sanction pressure)
//
// Scoring (confirmed 2026-05-28):
//   costs=1 (Low) → +10
//   costs=2 (Medium) → +25
//   costs=3 (High) → +50
//   Multilateral sanctions → ×1.5 multiplier
//   Cap at 100
//
// Note: TIES ends 2005. OFAC/EU/UN needed for 2006+ (post-V1).
//
// Usage: node historical/ingest_ties_xls.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const { guardClient, upsertReadings } = require('./db_guard.cjs');

const sb = guardClient(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

const XLS_PATH = path.join(__dirname, '../TIESv4-1 (1).xls');
const BATCH_SIZE = 500;
const SIGNAL_KEY = 'sanctions_pressure';
const SIGNAL_NAME = 'Sanctions Pressure';

// Cost level to base score
const COST_SCORES = {
  1: 10,   // Low
  2: 25,   // Medium
  3: 50,   // High
};

// Country code/name → Sabian canonical name
// Includes COW (Correlates of War) numeric codes
const COUNTRY_MAP = {
  // COW codes (TIES uses these in targetstate column)
  '2': 'United States', '20': 'Canada', '31': 'Bahamas', '40': 'Cuba', '41': 'Haiti',
  '42': 'Dominican Republic', '52': 'Trinidad and Tobago', '53': 'Barbados', '54': 'Dominica',
  '55': 'Grenada', '56': 'St. Lucia', '57': 'St. Vincent', '58': 'Antigua & Barbuda',
  '60': 'St. Kitts and Nevis', '70': 'Mexico', '80': 'Belize', '90': 'Guatemala',
  '91': 'Honduras', '92': 'El Salvador', '93': 'Nicaragua',
  '94': 'Costa Rica', '95': 'Panama', '100': 'Colombia', '101': 'Venezuela', '130': 'Ecuador',
  '135': 'Peru', '140': 'Brazil', '145': 'Bolivia', '150': 'Paraguay', '155': 'Chile',
  '160': 'Argentina', '165': 'Uruguay', '200': 'UK', '205': 'Ireland', '210': 'Netherlands',
  '211': 'Belgium', '212': 'Luxembourg', '220': 'France', '225': 'Switzerland', '230': 'Spain',
  '235': 'Portugal', '255': 'Germany', '260': 'Germany', '265': 'Germany', '290': 'Poland',
  '305': 'Austria', '310': 'Hungary', '315': 'Czech Republic', '316': 'Czech Republic',
  '317': 'Slovakia', '325': 'Italy', '339': 'Albania', '343': 'North Macedonia', '344': 'Croatia',
  '345': 'Serbia', '346': 'Bosnia', '349': 'Slovenia', '350': 'Greece', '352': 'Cyprus',
  '355': 'Bulgaria', '359': 'Moldova', '360': 'Romania', '365': 'Russia', '366': 'Estonia',
  '367': 'Latvia', '368': 'Lithuania', '369': 'Ukraine', '370': 'Belarus', '371': 'Armenia',
  '372': 'Georgia', '373': 'Azerbaijan', '375': 'Finland', '380': 'Sweden', '385': 'Norway',
  '221': 'Monaco', '223': 'Liechtenstein', '232': 'Andorra', '331': 'San Marino', '338': 'Malta',
  '390': 'Denmark', '395': 'Iceland', '420': 'Gambia', '432': 'Mali', '433': 'Senegal',
  '434': 'Benin', '435': 'Mauritania',
  '436': 'Niger', '437': 'Ivory Coast', '438': 'Guinea', '439': 'Burkina Faso', '450': 'Liberia',
  '451': 'Sierra Leone', '452': 'Ghana', '461': 'Togo', '471': 'Cameroon', '475': 'Nigeria',
  '481': 'Gabon', '482': 'CAR', '483': 'Chad', '484': 'Congo', '490': 'DRC',
  '500': 'Uganda', '501': 'Kenya', '510': 'Tanzania', '516': 'Burundi', '517': 'Rwanda',
  '520': 'Somalia', '522': 'Djibouti', '530': 'Ethiopia', '531': 'Eritrea', '540': 'Angola',
  '541': 'Mozambique', '551': 'Zambia', '552': 'Zimbabwe', '553': 'Malawi', '560': 'South Africa',
  '565': 'Namibia', '570': 'Lesotho', '571': 'Botswana', '580': 'Madagascar', '600': 'Morocco',
  '615': 'Algeria', '616': 'Tunisia', '620': 'Libya', '625': 'Sudan', '626': 'South Sudan',
  '630': 'Iran', '640': 'Turkey', '645': 'Iraq', '651': 'Egypt', '652': 'Syria',
  '660': 'Lebanon', '663': 'Jordan', '666': 'Israel', '670': 'Saudi Arabia', '678': 'Yemen',
  '679': 'Yemen', '680': 'Yemen', '690': 'Kuwait', '692': 'Bahrain', '694': 'Qatar',
  '696': 'UAE', '698': 'Oman', '700': 'Afghanistan', '701': 'Turkmenistan', '702': 'Tajikistan',
  '703': 'Kyrgyzstan', '704': 'Uzbekistan', '705': 'Kazakhstan', '710': 'China', '712': 'Mongolia',
  '713': 'Taiwan', '730': 'South Korea', '731': 'North Korea', '732': 'South Korea', '740': 'Japan',
  '750': 'India', '760': 'Bhutan', '770': 'Pakistan', '771': 'Bangladesh', '775': 'Myanmar',
  '780': 'Sri Lanka', '790': 'Nepal', '800': 'Thailand', '811': 'Cambodia', '812': 'Laos',
  '816': 'Vietnam', '817': 'Vietnam', '820': 'Malaysia', '830': 'Singapore', '840': 'Philippines',
  '850': 'Indonesia', '860': 'Timor-Leste', '900': 'Australia', '910': 'Papua New Guinea',
  '920': 'New Zealand', '935': 'Vanuatu', '950': 'Fiji', '955': 'Tonga', '970': 'Nauru',
  '983': 'Marshall Islands', '990': 'Samoa', '1000': 'Tuvalu',
  // Island nations and remaining
  '590': 'Mauritius', '591': 'Seychelles', '781': 'Maldives',
  // Name variations
  'United States': 'United States', 'United States of America': 'United States',
  'USA': 'United States', 'US': 'United States',
  'United Kingdom': 'UK', 'Great Britain': 'UK', 'UK': 'UK',
  'Russian Federation': 'Russia', 'Russia': 'Russia', 'USSR': 'Russia', 'Soviet Union': 'Russia',
  'Korea, South': 'South Korea', 'Korea, North': 'North Korea',
  'South Korea': 'South Korea', 'North Korea': 'North Korea',
  'Republic of Korea': 'South Korea', 'DPRK': 'North Korea', 'ROK': 'South Korea',
  'Democratic Republic of Congo': 'DRC', 'Congo, Democratic Republic': 'DRC',
  'Congo, Dem. Rep.': 'DRC', 'Zaire': 'DRC', 'Congo': 'Congo',
  'Central African Republic': 'CAR', 'CAR': 'CAR',
  'Czech Republic': 'Czech Republic', 'Czechoslovakia': 'Czech Republic',
  'Bosnia-Herzegovina': 'Bosnia', 'Bosnia and Herzegovina': 'Bosnia',
  'UAE': 'UAE', 'United Arab Emirates': 'UAE',
  'Taiwan': 'Taiwan', 'Burma': 'Myanmar', 'Myanmar': 'Myanmar',
  'Ivory Coast': 'Ivory Coast', "Cote d'Ivoire": 'Ivory Coast',
  'East Timor': 'Timor-Leste', 'Timor-Leste': 'Timor-Leste',
  'Macedonia': 'North Macedonia', 'North Macedonia': 'North Macedonia',
  'Serbia and Montenegro': 'Serbia', 'Yugoslavia': 'Serbia', 'Serbia': 'Serbia', 'FRY': 'Serbia',
  'GDR': 'Germany', 'East Germany': 'Germany', 'West Germany': 'Germany', 'Germany': 'Germany',
  'Iran': 'Iran', 'Iraq': 'Iraq', 'Libya': 'Libya', 'Syria': 'Syria',
  'Cuba': 'Cuba', 'Venezuela': 'Venezuela', 'Sudan': 'Sudan', 'South Sudan': 'South Sudan',
  'Zimbabwe': 'Zimbabwe', 'Belarus': 'Belarus', 'China': 'China', 'PRC': 'China',
};

function normalizeCountry(name) {
  if (!name) return null;
  const trimmed = String(name).trim();
  return COUNTRY_MAP[trimmed] || trimmed;
}

function computeSanctionScore(costs, isMultilateral) {
  let base = COST_SCORES[costs] || 0;
  if (isMultilateral) {
    base = base * 1.5;
  }
  return Math.min(Math.round(base), 100);
}

async function checkExisting() {
  const { count } = await sb.from('historical_signal_readings')
    .select('*', { count: 'exact', head: true })
    .eq('signal_key', SIGNAL_KEY);
  console.log(`  Existing ${SIGNAL_KEY} rows: ${count || 0} (will upsert, not delete)`);
  return count || 0;
}

async function main() {
  if (!fs.existsSync(XLS_PATH)) {
    console.error(`XLS not found: ${XLS_PATH}`);
    console.error('Download TIES v4.1 from: https://sanctions.web.unc.edu/');
    process.exit(1);
  }

  const stat = fs.statSync(XLS_PATH);
  console.log(`\n📜 TIES v4.1 Sanctions Data Ingestion`);
  console.log(`   File: ${path.basename(XLS_PATH)} (${(stat.size / 1024).toFixed(0)} KB)`);
  console.log(`   Signal: ${SIGNAL_KEY}`);
  console.log(`   Scoring: Cost-based (Low=10, Med=25, High=50) × 1.5 if multilateral`);
  console.log('');

  await checkExisting();

  // Parse XLS
  const workbook = XLSX.readFile(XLS_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  console.log(`  Parsed ${rows.length} sanction case rows from sheet "${sheetName}"`);

  // Find relevant columns
  const sampleRow = rows[0] || {};
  const cols = Object.keys(sampleRow);
  console.log(`  Columns: ${cols.slice(0, 10).join(', ')}...`);

  // Track cumulative sanctions per target country-year
  const countryYearSanctions = new Map();

  let totalSkipped = 0;
  let countriesSeen = new Set();
  let yearMin = 9999, yearMax = 0;

  for (const row of rows) {
    // TIES columns: targetstate, startyear, endyear, institutionid, targetcosts, anticipatedtargetcosts
    // Target country is under sanction
    const targetRaw = row.targetstate || row.target || row.Target || row.targetcountry;
    const startYear = parseInt(row.startyear || row.StartYear || row.start_year);
    const endYear = parseInt(row.endyear || row.EndYear || row.end_year) || new Date().getFullYear();
    const costs = parseInt(row.targetcosts || row.anticipatedtargetcosts);
    const institutionId = row.institutionid || row.institution || row.InstitutionID;

    if (!targetRaw || isNaN(startYear)) {
      totalSkipped++;
      continue;
    }

    const country = normalizeCountry(targetRaw);
    if (!country) {
      totalSkipped++;
      continue;
    }

    // Multilateral if institution is involved (UN, EU, OAS, etc.)
    const isMultilateral = institutionId && institutionId !== 0 && institutionId !== '0';
    const score = computeSanctionScore(costs, isMultilateral);

    // Record for each year sanction was active
    const effectiveEnd = Math.min(endYear, 2005); // TIES only goes to 2005
    for (let year = startYear; year <= effectiveEnd; year++) {
      const key = `${country}|${year}`;
      const existing = countryYearSanctions.get(key) || { score: 0, cases: [] };
      existing.score = Math.min(existing.score + score, 100); // Cumulative, capped
      existing.cases.push({
        start: startYear,
        end: endYear,
        costs,
        multilateral: isMultilateral,
        contributedScore: score
      });
      countryYearSanctions.set(key, existing);
    }

    countriesSeen.add(country);
    if (startYear < yearMin) yearMin = startYear;
    if (effectiveEnd > yearMax) yearMax = effectiveEnd;
  }

  console.log(`  Computed ${countryYearSanctions.size} country-year sanction scores`);

  // Convert to rows for upsert
  const allRows = [];
  for (const [key, data] of countryYearSanctions) {
    const [country, yearStr] = key.split('|');
    const year = parseInt(yearStr);

    allRows.push({
      country,
      signal_key: SIGNAL_KEY,
      signal_name: SIGNAL_NAME,
      date: `${year}-01-01`,
      raw_value: data.score / 100, // Normalize to 0-1
      raw_metadata: {
        score_0_100: data.score,
        active_cases: data.cases.length,
        cases: data.cases.slice(0, 5), // Keep first 5 for reference
        source: 'TIES v4.1',
        weights: COST_SCORES
      },
      source: 'TIES v4.1',
      gap: false
    });
  }

  // Upsert (insert or update, never delete)
  const result = await upsertReadings(sb, allRows, {
    batchSize: BATCH_SIZE,
    onProgress: ({ processed, total }) => {
      process.stdout.write(`\r  Upserted: ${processed.toLocaleString()}/${total.toLocaleString()} rows   `);
    }
  });
  const totalInserted = result.inserted;
  if (result.errors.length > 0) {
    console.log(`\n  Errors: ${result.errors.length}`);
  }

  console.log(`\n\n  ✅ TIES ingest complete`);
  console.log(`     Rows inserted: ${totalInserted.toLocaleString()}`);
  console.log(`     Rows skipped:  ${totalSkipped.toLocaleString()} (missing data or unmapped country)`);
  console.log(`     Countries:     ${countriesSeen.size}`);
  console.log(`     Year range:    ${yearMin}–${yearMax}`);
  console.log('');
  console.log('  ⚠️  Note: TIES ends 2005. OFAC/EU/UN needed for 2006+ (post-V1).');
  console.log('');
  console.log('  Next: run post_backfill_chain.cjs to rebuild baselines and re-score all country-years.');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
