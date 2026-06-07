// fao_historical.cjs
// FAO Food Balance Sheet — bulk zip download from bulks-faostat.fao.org
// Old /faostat/api/v1/en/data/ endpoint is dead (S3 NoSuchKey).
// New source: bulk zips via fenixservices redirect → bulks-faostat.fao.org
// Downloads FoodBalanceSheetsHistoric_E_All_Data.zip (~29MB), unzips in memory, parses CSV.
// Signal: fao_food (Import Dependency Ratio, element 5142)
// Returns array of { signal_key, date, raw_value, raw_metadata, source, gap, gap_reason }

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const ZIP_URL = 'https://bulks-faostat.fao.org/production/FoodBalanceSheetsHistoric_E_All_Data.zip';
const ELEMENT_CODE = '5142'; // Import Dependency Ratio

const COUNTRY_MAP = {
  'Mali':'Mali','Sudan':'Sudan','Ethiopia':'Ethiopia','DRC':'Democratic Republic of the Congo',
  'Nigeria':'Nigeria','Afghanistan':'Afghanistan','Myanmar':'Myanmar','Yemen':'Yemen',
  'South Sudan':'South Sudan','Somalia':'Somalia','CAR':'Central African Republic',
  'Chad':'Chad','Mozambique':'Mozambique','Libya':'Libya','Burkina Faso':'Burkina Faso',
  'Niger':'Niger','Colombia':'Colombia','Venezuela':'Venezuela','Ukraine':'Ukraine',
  'Syria':'Syrian Arab Republic','Iraq':'Iraq','Pakistan':'Pakistan',
  'Bangladesh':'Bangladesh','Kenya':'Kenya','Uganda':'Uganda',
  'Tanzania':'United Republic of Tanzania','Zimbabwe':'Zimbabwe',
  'Cameroon':'Cameroon','Angola':'Angola','Zambia':'Zambia',
  'Brazil':'Brazil','Indonesia':'Indonesia','India':'India','China':'China, mainland',
  'Russia':'Russian Federation','Australia':'Australia','Mexico':'Mexico',
  'Bolivia':'Bolivia (Plurinational State of)','Peru':'Peru',
  'Paraguay':'Paraguay','Argentina':'Argentina',
};

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const get = (u) => {
      https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        res.on('data', d => chunks.push(d));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    get(url);
  });
}

function unzipToCSV(buf) {
  return new Promise((resolve, reject) => {
    const tmpZip = path.join(os.tmpdir(), 'fao_bulk_' + Date.now() + '.zip');
    const tmpDir = path.join(os.tmpdir(), 'fao_unzip_' + Date.now());
    try {
      fs.writeFileSync(tmpZip, buf);
      fs.mkdirSync(tmpDir, { recursive: true });
      const { execSync } = require('child_process');
      execSync(`unzip -o "${tmpZip}" -d "${tmpDir}"`, { timeout: 120000 });
      const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.csv') && !f.includes('_normalized'));
      if (!files.length) return reject(new Error('No CSV in zip'));
      const csv = fs.readFileSync(path.join(tmpDir, files[0]), 'utf8');
      resolve(csv);
    } catch (e) {
      reject(e);
    } finally {
      try { fs.unlinkSync(tmpZip); } catch {}
    }
  });
}

function parseFaoCSV(csvText, targetCountry) {
  const lines = csvText.split('\n');
  if (!lines.length) return [];

  const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const areaIdx = header.findIndex(h => /^area$/i.test(h));
  const elemIdx = header.findIndex(h => /element code/i.test(h));
  const yearCols = header.reduce((acc, h, i) => {
    const m = h.match(/^Y(\d{4})$/);
    if (m) acc.push({ year: m[1], idx: i });
    return acc;
  }, []);

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    if ((cols[areaIdx] || '').toLowerCase() !== targetCountry.toLowerCase()) continue;
    if ((cols[elemIdx] || '') !== ELEMENT_CODE) continue;
    for (const { year, idx } of yearCols) {
      const raw = (cols[idx] || '').trim();
      if (!raw) continue;
      const val = parseFloat(raw);
      if (!isNaN(val)) results.push({ year: parseInt(year), value: val });
    }
  }
  return results;
}

async function fetchFAO(country) {
  const faoCountry = COUNTRY_MAP[country];
  if (!faoCountry) {
    return [{ signal_key: 'fao_food', signal_name: 'FAO Food Import', date: '1961-01-01',
      raw_value: null, raw_metadata: { country, error: 'no_country_mapping' },
      source: 'faostat_bulk', gap: true, gap_reason: 'no_country_mapping' }];
  }

  console.log(`Downloading FAO bulk zip (~29MB)...`);
  const buf = await downloadBuffer(ZIP_URL);
  console.log(`  Downloaded ${buf.length} bytes`);

  const csvText = await unzipToCSV(buf);
  console.log(`  CSV extracted: ${csvText.length} chars`);

  const rows = parseFaoCSV(csvText, faoCountry);
  console.log(`  Rows found for ${faoCountry}: ${rows.length}`);

  if (!rows.length) {
    return [{ signal_key: 'fao_food', signal_name: 'FAO Food Import', date: '1961-01-01',
      raw_value: null, raw_metadata: { country, fao_country: faoCountry, element: ELEMENT_CODE },
      source: 'faostat_bulk', gap: true, gap_reason: 'no_data_in_csv' }];
  }

  return rows.map(r => ({
    signal_key: 'fao_food', signal_name: 'FAO Food Import',
    date: `${r.year}-01-01`, raw_value: r.value,
    raw_metadata: { country, fao_country: faoCountry, element_code: ELEMENT_CODE, year: r.year },
    source: 'faostat_bulk', gap: false, gap_reason: null,
  }));
}

module.exports = { fetchFAO };
