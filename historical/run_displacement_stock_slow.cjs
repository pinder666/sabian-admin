// run_displacement_stock_slow.cjs
// Slow UNHCR API crawl writing to signal_key='displacement_stock'.
// Concurrency=1, 2s between year-calls — avoids the quota hit from the fast refetch.
// Runs ~6-7 hours for 153 countries × 76 years.
//
// This is the stock signal: cumulative refugees + IDPs + asylum seekers FROM each country.
// Stores raw counts (not normalized) — z-scoring happens in the composite builder.
//
// Usage: node historical/run_displacement_stock_slow.cjs
//        node historical/run_displacement_stock_slow.cjs --resume   (skips countries already done)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const axios = require('axios');
const { sb, upsertReadings } = require('./db.cjs');

const RESUME = process.argv.includes('--resume');

const ALL_COUNTRIES = [
  'Mali','Burkina Faso','Niger','Sudan','Ethiopia','Myanmar','Venezuela','Somalia',
  'DRC','CAR','Chad','Nigeria','Mozambique','Libya','Haiti','Yemen','Afghanistan',
  'Syria','Iraq','South Sudan','Israel','Palestine','Ukraine','Colombia','Lebanon',
  'Pakistan','Cameroon','Armenia','Georgia','Russia','Philippines','Indonesia','Mexico',
  'Iran','Zimbabwe','Bangladesh','Sri Lanka','Kenya','Uganda','Tanzania','Zambia',
  'Senegal','Guinea','Ecuador','Bolivia','Eritrea','Djibouti','Kosovo','Bosnia',
  'Taiwan','North Korea','Belarus','Moldova','Serbia','Azerbaijan','Kyrgyzstan',
  'Tajikistan','Turkmenistan','Uzbekistan','Kazakhstan','Peru','Brazil','Nicaragua',
  'Honduras','Guatemala','El Salvador','Cuba','Angola','Rwanda','Burundi','Malawi',
  'Guinea-Bissau','Sierra Leone','Liberia','Togo','Benin','Mauritania','Tunisia',
  'Algeria','Morocco','Egypt','Jordan','Saudi Arabia','Oman','Kuwait','Vietnam',
  'Cambodia','Laos','Nepal','India','Timor-Leste','Papua New Guinea','Solomon Islands','Fiji',
  'Turkey','Greece','Bulgaria','Romania','Hungary','Poland','Slovakia','Croatia',
  'North Macedonia','Montenegro','Albania','China','South Korea','Japan','Mongolia',
  'Thailand','Malaysia','Singapore','Australia','New Zealand','South Africa','Ghana',
  'Ivory Coast','Gabon','Congo','Equatorial Guinea','Namibia','Botswana',
  'Argentina','Chile','Paraguay','Uruguay','Guyana','Suriname','Trinidad and Tobago',
  'Panama','Costa Rica','Dominican Republic','Jamaica','Belize',
  'UAE','Qatar','Bahrain','UK','France','Germany','Spain','Italy','Portugal',
  'Sweden','Finland','Norway','Denmark','Netherlands','Belgium','Austria','Switzerland',
  'Cyprus','United States',
];

const ISO3_MAP = {
  'Mali':'MLI','Burkina Faso':'BFA','Niger':'NER','Sudan':'SDN','Ethiopia':'ETH',
  'Myanmar':'MMR','Venezuela':'VEN','Somalia':'SOM','DRC':'COD','CAR':'CAF',
  'Chad':'TCD','Nigeria':'NGA','Mozambique':'MOZ','Libya':'LBY','Haiti':'HTI',
  'Yemen':'YEM','Afghanistan':'AFG','Syria':'SYR','Iraq':'IRQ','South Sudan':'SSD',
  'Israel':'ISR','Palestine':'PSE','Ukraine':'UKR','Colombia':'COL','Lebanon':'LBN',
  'Pakistan':'PAK','Cameroon':'CMR','Armenia':'ARM','Georgia':'GEO','Russia':'RUS',
  'Philippines':'PHL','Indonesia':'IDN','Mexico':'MEX','Iran':'IRN','Zimbabwe':'ZWE',
  'Bangladesh':'BGD','Sri Lanka':'LKA','Kenya':'KEN','Uganda':'UGA','Tanzania':'TZA',
  'Zambia':'ZMB','Senegal':'SEN','Guinea':'GIN','Ecuador':'ECU','Bolivia':'BOL',
  'Eritrea':'ERI','Djibouti':'DJI','Kosovo':'XKX','Bosnia':'BIH','Taiwan':'TWN',
  'North Korea':'PRK','Belarus':'BLR','Moldova':'MDA','Serbia':'SRB','Azerbaijan':'AZE',
  'Kyrgyzstan':'KGZ','Tajikistan':'TJK','Turkmenistan':'TKM','Uzbekistan':'UZB',
  'Kazakhstan':'KAZ','Peru':'PER','Brazil':'BRA','Nicaragua':'NIC','Honduras':'HND',
  'Guatemala':'GTM','El Salvador':'SLV','Cuba':'CUB','Angola':'AGO','Rwanda':'RWA',
  'Burundi':'BDI','Malawi':'MWI','Guinea-Bissau':'GNB','Sierra Leone':'SLE',
  'Liberia':'LBR','Togo':'TGO','Benin':'BEN','Mauritania':'MRT','Tunisia':'TUN',
  'Algeria':'DZA','Morocco':'MAR','Egypt':'EGY','Jordan':'JOR','Saudi Arabia':'SAU',
  'Oman':'OMN','Kuwait':'KWT','Vietnam':'VNM','Cambodia':'KHM','Laos':'LAO',
  'Nepal':'NPL','India':'IND','Timor-Leste':'TLS','Papua New Guinea':'PNG',
  'Solomon Islands':'SLB','Fiji':'FJI','Turkey':'TUR','Greece':'GRC','Bulgaria':'BGR',
  'Romania':'ROU','Hungary':'HUN','Poland':'POL','Slovakia':'SVK','Croatia':'HRV',
  'North Macedonia':'MKD','Montenegro':'MNE','Albania':'ALB','China':'CHN',
  'South Korea':'KOR','Japan':'JPN','Mongolia':'MNG','Thailand':'THA','Malaysia':'MYS',
  'Singapore':'SGP','Australia':'AUS','New Zealand':'NZL','South Africa':'ZAF',
  'Ghana':'GHA','Ivory Coast':'CIV','Gabon':'GAB','Congo':'COG',
  'Equatorial Guinea':'GNQ','Namibia':'NAM','Botswana':'BWA','Argentina':'ARG',
  'Chile':'CHL','Paraguay':'PRY','Uruguay':'URY','Guyana':'GUY','Suriname':'SUR',
  'Trinidad and Tobago':'TTO','Panama':'PAN','Costa Rica':'CRI',
  'Dominican Republic':'DOM','Jamaica':'JAM','Belize':'BLZ','UAE':'ARE',
  'Qatar':'QAT','Bahrain':'BHR','UK':'GBR','France':'FRA','Germany':'DEU',
  'Spain':'ESP','Italy':'ITA','Portugal':'PRT','Sweden':'SWE','Finland':'FIN',
  'Norway':'NOR','Denmark':'DNK','Netherlands':'NLD','Belgium':'BEL','Austria':'AUT',
  'Switzerland':'CHE','Cyprus':'CYP','United States':'USA',
};

async function httpsGet(url) {
  const res = await axios.get(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Sabian-Intelligence/1.0' },
    timeout: 20000,
  });
  return res.data;
}

async function fetchCountryStock(country) {
  const iso3 = ISO3_MAP[country];
  if (!iso3) return [];

  const readings = [];
  const currentYear = new Date().getFullYear();

  for (let year = 1951; year <= currentYear; year++) {
    const url = `https://api.unhcr.org/population/v1/population/?coo=${iso3}&year=${year}&limit=10`;
    try {
      const json = await httpsGet(url);
      const items = json.items || [];

      if (items.length === 0) {
        readings.push({
          country,
          signal_key:   'displacement_stock',
          signal_name:  'Displacement Stock',
          date:         `${year}-01-01`,
          raw_value:    null,
          raw_metadata: { iso3, year },
          source:       'UNHCR API stock',
          gap:          true,
          gap_reason:   'no_data_this_year',
          ingested_at:  new Date().toISOString(),
        });
      } else {
        let refugees = 0, idps = 0, asylum_seekers = 0, stateless = 0;
        for (const d of items) {
          refugees       += parseInt(d.refugees)       || 0;
          idps           += parseInt(d.idps)           || 0;
          asylum_seekers += parseInt(d.asylum_seekers) || 0;
          stateless      += parseInt(d.stateless)      || 0;
        }
        const total = refugees + idps + asylum_seekers;
        readings.push({
          country,
          signal_key:   'displacement_stock',
          signal_name:  'Displacement Stock',
          date:         `${year}-01-01`,
          raw_value:    total || null,
          raw_metadata: { iso3, year, refugees, idps, asylum_seekers, stateless, n_destinations: items.length },
          source:       'UNHCR API stock',
          gap:          !total,
          gap_reason:   total === 0 ? 'zero_displacement_reported' : null,
          ingested_at:  new Date().toISOString(),
        });
      }
    } catch (err) {
      readings.push({
        country,
        signal_key:   'displacement_stock',
        signal_name:  'Displacement Stock',
        date:         `${year}-01-01`,
        raw_value:    null,
        raw_metadata: { iso3, year, error: err.message },
        source:       'UNHCR API stock',
        gap:          true,
        gap_reason:   'fetch_error',
        ingested_at:  new Date().toISOString(),
      });
    }
    // 2 second gap per year-call — slow and steady to avoid quota
    await new Promise(r => setTimeout(r, 2000));
  }

  return readings;
}

async function getAlreadyDone() {
  if (!RESUME) return new Set();
  const { data } = await sb
    .from('historical_signal_readings')
    .select('country')
    .eq('signal_key', 'displacement_stock')
    .not('raw_value', 'is', null);
  const done = new Set((data || []).map(r => r.country));
  console.log(`  Resume mode: ${done.size} countries already have displacement_stock data`);
  return done;
}

async function main() {
  console.log('UNHCR Displacement Stock — Slow Crawl');
  console.log('═'.repeat(63));
  console.log(`Countries: ${ALL_COUNTRIES.length}`);
  console.log('Concurrency: 1 | Rate: 2s/year/country');
  console.log(`Estimated runtime: ~${Math.round(ALL_COUNTRIES.length * 76 * 2 / 3600)} hours`);
  console.log('Signal: displacement_stock | Source: UNHCR API stock');
  console.log('');

  const alreadyDone = await getAlreadyDone();
  const countries = RESUME
    ? ALL_COUNTRIES.filter(c => !alreadyDone.has(c))
    : ALL_COUNTRIES;

  console.log(`Processing ${countries.length} countries sequentially...\n`);

  let totalWritten = 0;
  let num = 0;
  const startTime = Date.now();

  for (const country of countries) {
    num++;
    try {
      const readings = await fetchCountryStock(country);
      if (readings.length === 0) {
        console.log(`  [${num}/${countries.length}] ${country}: no ISO3 mapping`);
        continue;
      }
      const { inserted, errors } = await upsertReadings(sb, readings, { batchSize: 200 });
      if (errors.length > 0) errors.forEach(e => console.log(`  ⚠ ${country}: ${e.error}`));
      totalWritten += inserted;
      const elapsed = Math.round((Date.now() - startTime) / 60000);
      console.log(`  ✅ [${num}/${countries.length}] ${country}: ${inserted} rows | ${elapsed}m elapsed`);
    } catch (err) {
      console.error(`  ❌ [${num}/${countries.length}] ${country}: ${err.message}`);
    }
  }

  console.log('');
  console.log('═'.repeat(63));
  console.log(`✅ Stock crawl complete. Total rows written: ${totalWritten}`);
  console.log('');
  console.log('Next step: run load_displacement_flow_xlsx.cjs, then build composite.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
