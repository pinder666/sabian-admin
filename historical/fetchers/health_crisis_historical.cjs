// health_crisis_historical.cjs
// Health crisis / system collapse signal
// Signal: health_crisis
// Source: WHO Global Health Observatory API (GHO) — free, no key
//         Indicators: under-5 mortality, measles immunization, hospital beds
//         Also: World Bank health expenditure + maternal mortality
// Coverage: 1990–present
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const { guardClient } = require('../db_guard.cjs');

const sb = guardClient(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }));

// WHO GHO OData API — completely free, no authentication
const WHO_BASE = 'https://ghoapi.azureedge.net/api';

// Key GHO indicators for health crisis risk
const WHO_INDICATORS = [
  { code: 'MDG_0000000007', name: 'under5_mortality', direction: +1 },
];

// World Bank fallback indicators
const WB_INDICATORS = [
  { id: 'SH.DYN.MORT',       weight: +1.5 },
  { id: 'SH.MED.BEDS.ZS',    weight: -1.0 },
  { id: 'SH.XPD.CHEX.GD.ZS', weight: -0.8 },
  { id: 'SH.DYN.MMRT',       weight: +1.0 },
];

// ISO3 codes for WHO GHO API
const ISO3 = {
  'Afghanistan':'AFG','Albania':'ALB','Algeria':'DZA','Angola':'AGO','Argentina':'ARG',
  'Armenia':'ARM','Australia':'AUS','Austria':'AUT','Azerbaijan':'AZE','Bangladesh':'BGD',
  'Belarus':'BLR','Belgium':'BEL','Benin':'BEN','Bolivia':'BOL','Bosnia':'BIH',
  'Botswana':'BWA','Brazil':'BRA','Bulgaria':'BGR','Burkina Faso':'BFA','Burundi':'BDI',
  'Cambodia':'KHM','Cameroon':'CMR','Canada':'CAN','CAR':'CAF','Chad':'TCD',
  'Chile':'CHL','China':'CHN','Colombia':'COL','Congo':'COG','Costa Rica':'CRI',
  'Croatia':'HRV','Cuba':'CUB','Cyprus':'CYP','Czech Republic':'CZE','DRC':'COD',
  'Denmark':'DNK','Djibouti':'DJI','Dominican Republic':'DOM','Ecuador':'ECU','Egypt':'EGY',
  'El Salvador':'SLV','Eritrea':'ERI','Estonia':'EST','Eswatini':'SWZ','Ethiopia':'ETH',
  'Finland':'FIN','France':'FRA','Georgia':'GEO','Germany':'DEU','Ghana':'GHA',
  'Greece':'GRC','Guatemala':'GTM','Guinea':'GIN','Guinea-Bissau':'GNB','Guyana':'GUY',
  'Haiti':'HTI','Honduras':'HND','Hungary':'HUN','India':'IND','Indonesia':'IDN',
  'Iran':'IRN','Iraq':'IRQ','Ireland':'IRL','Israel':'ISR','Italy':'ITA',
  'Ivory Coast':'CIV','Jamaica':'JAM','Japan':'JPN','Jordan':'JOR','Kazakhstan':'KAZ',
  'Kenya':'KEN','North Korea':'PRK','South Korea':'KOR','Kuwait':'KWT','Kyrgyzstan':'KGZ',
  'Laos':'LAO','Latvia':'LVA','Lebanon':'LBN','Lesotho':'LSO','Liberia':'LBR',
  'Libya':'LBY','Lithuania':'LTU','Luxembourg':'LUX','Madagascar':'MDG','Malawi':'MWI',
  'Malaysia':'MYS','Mali':'MLI','Mauritania':'MRT','Mauritius':'MUS','Mexico':'MEX',
  'Moldova':'MDA','Mongolia':'MNG','Montenegro':'MNE','Morocco':'MAR','Mozambique':'MOZ',
  'Myanmar':'MMR','Namibia':'NAM','Nepal':'NPL','Netherlands':'NLD','New Zealand':'NZL',
  'Nicaragua':'NIC','Niger':'NER','Nigeria':'NGA','Norway':'NOR','Oman':'OMN',
  'Pakistan':'PAK','Panama':'PAN','Papua New Guinea':'PNG','Paraguay':'PRY','Peru':'PER',
  'Philippines':'PHL','Poland':'POL','Portugal':'PRT','Qatar':'QAT','Romania':'ROU',
  'Russia':'RUS','Rwanda':'RWA','Saudi Arabia':'SAU','Senegal':'SEN','Serbia':'SRB',
  'Sierra Leone':'SLE','Singapore':'SGP','Slovakia':'SVK','Slovenia':'SVN','Somalia':'SOM',
  'South Africa':'ZAF','South Sudan':'SSD','Spain':'ESP','Sri Lanka':'LKA','Sudan':'SDN',
  'Suriname':'SUR','Sweden':'SWE','Switzerland':'CHE','Syria':'SYR','Taiwan':'TWN',
  'Tajikistan':'TJK','Tanzania':'TZA','Thailand':'THA','Timor-Leste':'TLS','Togo':'TGO',
  'Trinidad and Tobago':'TTO','Tunisia':'TUN','Turkey':'TUR','Turkmenistan':'TKM',
  'Uganda':'UGA','Ukraine':'UKR','UAE':'ARE','UK':'GBR','United States':'USA',
  'Uruguay':'URY','Uzbekistan':'UZB','Venezuela':'VEN','Vietnam':'VNM','Yemen':'YEM',
  'Zambia':'ZMB','Zimbabwe':'ZWE',
};

async function fetchWHOIndicator(indicatorCode, iso3) {
  try {
    // $filter and $select must be percent-encoded — unencoded $ is ignored by the GHO API
    // causing it to return the full global dataset instead of the filtered country rows.
    const url = `${WHO_BASE}/${indicatorCode}?%24filter=SpatialDim%20eq%20'${iso3}'&%24select=TimeDim,NumericValue,SpatialDim&%24orderby=TimeDim%20asc`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Sabian-Intelligence/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.value || null;
  } catch (e) {
    return null;
  }
}

// ISO2 codes for World Bank API
const ISO2 = {
  'Afghanistan':'AF','Albania':'AL','Algeria':'DZ','Angola':'AO','Argentina':'AR',
  'Armenia':'AM','Australia':'AU','Austria':'AT','Azerbaijan':'AZ','Bangladesh':'BD',
  'Belarus':'BY','Belgium':'BE','Benin':'BJ','Bolivia':'BO','Bosnia':'BA',
  'Botswana':'BW','Brazil':'BR','Bulgaria':'BG','Burkina Faso':'BF','Burundi':'BI',
  'Cambodia':'KH','Cameroon':'CM','Canada':'CA','CAR':'CF','Chad':'TD',
  'Chile':'CL','China':'CN','Colombia':'CO','Congo':'CG','Costa Rica':'CR',
  'Croatia':'HR','Cuba':'CU','Cyprus':'CY','Czech Republic':'CZ','DRC':'CD',
  'Denmark':'DK','Djibouti':'DJ','Dominican Republic':'DO','Ecuador':'EC','Egypt':'EG',
  'El Salvador':'SV','Eritrea':'ER','Estonia':'EE','Eswatini':'SZ','Ethiopia':'ET',
  'Finland':'FI','France':'FR','Georgia':'GE','Germany':'DE','Ghana':'GH',
  'Greece':'GR','Guatemala':'GT','Guinea':'GN','Guinea-Bissau':'GW','Guyana':'GY',
  'Haiti':'HT','Honduras':'HN','Hungary':'HU','India':'IN','Indonesia':'ID',
  'Iran':'IR','Iraq':'IQ','Ireland':'IE','Israel':'IL','Italy':'IT',
  'Ivory Coast':'CI','Jamaica':'JM','Japan':'JP','Jordan':'JO','Kazakhstan':'KZ',
  'Kenya':'KE','North Korea':'KP','South Korea':'KR','Kuwait':'KW','Kyrgyzstan':'KG',
  'Laos':'LA','Latvia':'LV','Lebanon':'LB','Lesotho':'LS','Liberia':'LR',
  'Libya':'LY','Lithuania':'LT','Luxembourg':'LU','Madagascar':'MG','Malawi':'MW',
  'Malaysia':'MY','Mali':'ML','Mauritania':'MR','Mauritius':'MU','Mexico':'MX',
  'Moldova':'MD','Mongolia':'MN','Montenegro':'ME','Morocco':'MA','Mozambique':'MZ',
  'Myanmar':'MM','Namibia':'NA','Nepal':'NP','Netherlands':'NL','New Zealand':'NZ',
  'Nicaragua':'NI','Niger':'NE','Nigeria':'NG','Norway':'NO','Oman':'OM',
  'Pakistan':'PK','Panama':'PA','Papua New Guinea':'PG','Paraguay':'PY','Peru':'PE',
  'Philippines':'PH','Poland':'PL','Portugal':'PT','Qatar':'QA','Romania':'RO',
  'Russia':'RU','Rwanda':'RW','Saudi Arabia':'SA','Senegal':'SN','Serbia':'RS',
  'Sierra Leone':'SL','Singapore':'SG','Slovakia':'SK','Slovenia':'SI','Somalia':'SO',
  'South Africa':'ZA','South Sudan':'SS','Spain':'ES','Sri Lanka':'LK','Sudan':'SD',
  'Suriname':'SR','Sweden':'SE','Switzerland':'CH','Syria':'SY','Taiwan':'TW',
  'Tajikistan':'TJ','Tanzania':'TZ','Thailand':'TH','Timor-Leste':'TL','Togo':'TG',
  'Trinidad and Tobago':'TT','Tunisia':'TN','Turkey':'TR','Turkmenistan':'TM',
  'Uganda':'UG','Ukraine':'UA','UAE':'AE','UK':'GB','United States':'US',
  'Uruguay':'UY','Uzbekistan':'UZ','Venezuela':'VE','Vietnam':'VN','Yemen':'YE',
  'Zambia':'ZM','Zimbabwe':'ZW',
};

async function fetchWBFallback() {
  const readings = [];
  const byCountryYear = {};
  console.log('  Fetching World Bank health indicators...');

  for (const [country, iso2] of Object.entries(ISO2)) {
    for (const { id, weight } of WB_INDICATORS) {
      try {
        const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${id}?date=1990:2024&format=json&per_page=40`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data) || !data[1]) continue;

        for (const row of data[1]) {
          if (row.value === null || row.value === undefined) continue;
          const year = parseInt(row.date);
          let value = parseFloat(row.value);
          if (isNaN(value)) continue;

          let normalized;
          if (id === 'SH.DYN.MORT') normalized = Math.min(100, (value / 200) * 100);
          else if (id === 'SH.MED.BEDS.ZS') normalized = Math.min(100, (value / 15) * 100);
          else if (id === 'SH.XPD.CHEX.GD.ZS') normalized = Math.min(100, (value / 15) * 100);
          else if (id === 'SH.DYN.MMRT') normalized = Math.min(100, (value / 1000) * 100);
          else normalized = value;

          const key = `${country}|${year}`;
          if (!byCountryYear[key]) byCountryYear[key] = { country, year, score: 0, n: 0, iso2 };
          byCountryYear[key].score += normalized * weight;
          byCountryYear[key].n++;
        }
      } catch (e) { /* silent */ }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  for (const { country, year, score, iso2, n } of Object.values(byCountryYear)) {
    if (n === 0) continue;
    const riskScore = Math.max(0, Math.min(100, score / n));
    readings.push({
      country, signal_key: 'health_crisis', signal_name: 'Health Crisis',
      date: `${year}-01-01`, raw_value: parseFloat(riskScore.toFixed(3)),
      raw_metadata: { composite_score: score, n_indicators: n, iso2, year },
      source: 'World Bank WDI (health)', gap: false, ingested_at: new Date().toISOString(),
    });
  }
  return readings;
}

async function fetchHealthCrisis() {
  console.log('Fetching health crisis data (WHO GHO + World Bank)...');
  const whoReadings = [];
  const byCountryYear = {};

  console.log('  Querying WHO GHO API...');
  let whoCount = 0;

  for (const [country, iso3] of Object.entries(ISO3)) {
    for (const { code, name, direction } of WHO_INDICATORS) {
      const rows = await fetchWHOIndicator(code, iso3);
      if (!rows) { await new Promise(r => setTimeout(r, 200)); continue; }

      for (const row of rows) {
        if (!row.NumericValue || !row.TimeDim) continue;
        const year = parseInt(row.TimeDim);
        const value = parseFloat(row.NumericValue);
        if (isNaN(year) || isNaN(value)) continue;

        const key = `${country}|${year}`;
        if (!byCountryYear[key]) byCountryYear[key] = { country, year, scores: [], iso3 };

        const normalized = Math.min(100, (value / 300) * 100);
        byCountryYear[key].scores.push(normalized * direction);
      }
      whoCount++;
      await new Promise(r => setTimeout(r, 200));
    }
  }

  for (const { country, year, scores, iso3 } of Object.values(byCountryYear)) {
    if (scores.length === 0) continue;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    whoReadings.push({
      country, signal_key: 'health_crisis', signal_name: 'Health Crisis',
      date: `${year}-01-01`, raw_value: avg,
      raw_metadata: { iso3, unit: '0-100 risk score (normalized from per-1000 live-births, ceiling=300)', indicator: 'Under-5 mortality rate', year },
      source: 'WHO GHO', gap: false, ingested_at: new Date().toISOString(),
    });
  }
  console.log(`  WHO GHO: ${whoReadings.length} readings`);

  const wbReadings = await fetchWBFallback();

  const readings = [...whoReadings, ...wbReadings];
  console.log(`Fetched ${readings.length} health_crisis readings total (WHO: ${whoReadings.length}, WB: ${wbReadings.length})`);
  return readings;
}

async function saveReadings(readings) {
  if (readings.length === 0) return 0;
  const seen = new Set();
  const unique = readings.filter(r => {
    const key = `${r.country}|${r.signal_key}|${r.date}|${r.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  let saved = 0;
  for (let i = 0; i < unique.length; i += 500) {
    const { error } = await sb.from('historical_signal_readings').upsert(unique.slice(i, i + 500), { onConflict: 'country,signal_key,date,source' });
    if (!error) saved += Math.min(500, unique.length - i);
    else console.log(`  Batch ${i} error: ${error.message}`);
  }
  return saved;
}

async function run() {
  console.log('Health Crisis Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchHealthCrisis();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchHealthCrisis, saveReadings };