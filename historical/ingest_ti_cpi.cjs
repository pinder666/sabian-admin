// historical/ingest_ti_cpi.cjs
// Ingests Transparency International CPI (1995–2025) into historical_signal_readings.
// Signal key: corruption_risk  (0-100, higher = more corrupt)
// Scale: pre-2012 raw is 0-10 → ×10; 2012+ raw is 0-100. Inverted: risk = 100 - cpi
// 2012 skipped: XLS file is password-protected
// Usage: node historical/ingest_ti_cpi.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const readline = require('readline');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const { guardClient, upsertReadings } = require('./db_guard.cjs');

const sb = guardClient(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));
const ARCHIVE = path.join(__dirname, '../CPI-Archive');
const SIGNAL_KEY  = 'corruption_risk';
const SIGNAL_NAME = 'Corruption Risk';
const BATCH = 100;

// year → file config
// csv: 0-10 scale pre-2012, columns: country(0), iso(1), region(2), score(3)
// xlsx: 0-100 scale; dataStart = first data row index; nameCol/isoCol/scoreCol by array index
const CONFIGS = [
  { year:1995, file:'CPI-Archive-1995.csv',  type:'csv' },
  { year:1996, file:'CPI-Archive-1996.csv',  type:'csv' },
  { year:1997, file:'CPI-Archive-1997.csv',  type:'csv' },
  { year:1998, file:'CPI-Archive-1998_.csv', type:'csv' },
  { year:1999, file:'CPI-Archive-1999.csv',  type:'csv' },
  { year:2000, file:'CPI-Archive-2000.csv',  type:'csv' },
  { year:2001, file:'CPI-2001.csv',          type:'csv' },
  { year:2002, file:'CPI-2002.csv',          type:'csv' },
  { year:2003, file:'CPI-2003.csv',          type:'csv' },
  { year:2004, file:'CPI-2004.csv',          type:'csv' },
  { year:2005, file:'CPI-2005.csv',          type:'csv' },
  { year:2006, file:'CPI-2006.csv',          type:'csv' },
  { year:2007, file:'CPI-2007.csv',          type:'csv' },
  { year:2008, file:'CPI-Archive-2008-2.csv',type:'csv' },
  { year:2009, file:'CPI-2009.csv',          type:'csv' },
  { year:2010, file:'CPI-2010.csv',          type:'csv' },
  { year:2011, file:'CPI-2011.csv',          type:'csv' },
  // 2012: XLS is password-protected — skipped
  { year:2013, file:'CPI-2013.xlsx', type:'xlsx', sheet:'CPI 2013',         dataStart:2, nameCol:1, isoCol:2, scoreCol:6 },
  { year:2014, file:'CPI-2014.xlsx', type:'xlsx', sheet:'CPI 2014',         dataStart:1, nameCol:1, isoCol:2, scoreCol:4 },
  { year:2015, file:'CPI-2015.xlsx', type:'xlsx', sheet:'CPI 2015',         dataStart:1, nameCol:1, isoCol:2, scoreCol:4 },
  { year:2016, file:'CPI-2016.xlsx', type:'xlsx', sheet:null,               dataStart:1, nameCol:0, isoCol:4, scoreCol:1 },
  { year:2017, file:'CPI-2017.xlsx', type:'xlsx', sheet:'CPI 2017',         dataStart:3, nameCol:0, isoCol:1, scoreCol:3 },
  { year:2018, file:'CPI-2018.xlsx', type:'xlsx', sheet:'CPI2018',          dataStart:3, nameCol:0, isoCol:1, scoreCol:3 },
  { year:2019, file:'CPI-2019.xlsx', type:'xlsx', sheet:'CPI2019',          dataStart:3, nameCol:0, isoCol:1, scoreCol:3 },
  { year:2020, file:'CPI-2020b.xlsx',type:'xlsx', sheet:'CPI2020',          dataStart:3, nameCol:0, isoCol:1, scoreCol:3 },
  { year:2021, file:'CPI-2021a.xlsx',type:'xlsx', sheet:'CPI 2021',         dataStart:3, nameCol:0, isoCol:1, scoreCol:3 },
  { year:2022, file:'CPI-2022.xlsx', type:'xlsx', sheet:'CPI 2022 (final)', dataStart:3, nameCol:0, isoCol:1, scoreCol:3 },
  { year:2023, file:'CPI-2023.xlsx', type:'xlsx', sheet:'CPI 2023',         dataStart:4, nameCol:0, isoCol:1, scoreCol:3 },
  { year:2024, file:'CPI-2024.xlsx', type:'xlsx', sheet:'CPI 2024',         dataStart:3, nameCol:0, isoCol:1, scoreCol:3 },
  { year:2025, file:'CPI-2025.xlsx', type:'xlsx', sheet:'CPI2025',          dataStart:4, nameCol:0, isoCol:1, scoreCol:3 },
];

const COUNTRY_MAP = {
  'United States of America':'United States','United States':'United States','USA':'United States',
  'United Kingdom':'UK','Great Britain':'UK','UK':'UK',
  'Russian Federation':'Russia','Russia':'Russia',
  'Korea, South':'South Korea','South Korea':'South Korea','Korea (South)':'South Korea',
  'Korea, Republic of':'South Korea','Kribati':'Kiribati',
  'Korea, North':'North Korea','North Korea':'North Korea',
  "Korea, Democratic People's Republic of":'North Korea',
  'Democratic Republic of the Congo':'DRC','Congo, Democratic Republic':'DRC',
  'DR Congo':'DRC','Congo Democratic Republic':'DRC',"Congo, Dem. Rep.":'DRC','Congo-Kinshasa':'DRC',
  'Congo':'Congo','Congo, Republic of':'Congo','Republic of the Congo':'Congo','Congo-Brazzaville':'Congo',
  "Congo, Republic of":'Congo',
  'Central African Republic':'CAR',
  'Czech Republic':'Czech Republic','Czechia':'Czech Republic',
  'Bosnia and Herzegovina':'Bosnia and Herzegovina','Bosnia-Herzegovina':'Bosnia and Herzegovina','Bosnia':'Bosnia and Herzegovina',
  'United Arab Emirates':'UAE','UAE':'UAE',
  'Taiwan':'Taiwan','Chinese Taipei':'Taiwan',
  'Burma':'Myanmar','Myanmar':'Myanmar',
  "Côte d'Ivoire":'Ivory Coast',"Cote d'Ivoire":'Ivory Coast',"Cote d´Ivoire":'Ivory Coast','Ivory Coast':'Ivory Coast',
  'Timor-Leste':'Timor-Leste','East Timor':'Timor-Leste',
  'North Macedonia':'North Macedonia','Macedonia':'North Macedonia','Macedonia, FYR':'North Macedonia',
  'Eswatini':'Eswatini','Swaziland':'Eswatini',
  'Cabo Verde':'Cabo Verde','Cape Verde':'Cabo Verde',
  'Gambia':'Gambia','The Gambia':'Gambia','Gambia, The':'Gambia',
  'Serbia and Montenegro':'Serbia',
  'Dominican Rep':'Dominican Republic',
  'Korea (South)':'South Korea',
  'Palestine':'Palestine','West Bank and Gaza':'Palestine',
  'Macao':'Macao','Macau':'Macao',
};

function normalizeCountry(name) {
  if (!name) return null;
  const t = String(name).trim();
  return COUNTRY_MAP[t] || t;
}

function normalizeCPI(score, year) {
  const parsed = parseFloat(String(score).replace(',', '.'));
  if (isNaN(parsed) || parsed <= 0) return null;
  const normalized = year < 2012 ? parsed * 10 : parsed;
  if (normalized > 100) return null;
  return Math.max(0, Math.min(100, 100 - normalized));
}

async function parseCSV(filePath, year) {
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    // handle quoted commas in interval column (e.g. "2.9 - 4.4" is fine, but score is col 3)
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 4) continue;
    const country = normalizeCountry(cols[0]);
    if (!country) continue;
    const risk = normalizeCPI(cols[3], year);
    if (risk === null) continue;
    rows.push({ country, year, risk, original: parseFloat(cols[3]) });
  }
  return rows;
}

function parseXLSX(cfg) {
  const wb = XLSX.readFile(path.join(ARCHIVE, cfg.file));
  const sheetName = cfg.sheet || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in ${cfg.file}`);
  const all = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const rows = [];
  for (let i = cfg.dataStart; i < all.length; i++) {
    const row = all[i];
    if (!row || !row[cfg.nameCol]) continue;
    const country = normalizeCountry(row[cfg.nameCol]);
    if (!country) continue;
    const risk = normalizeCPI(row[cfg.scoreCol], cfg.year);
    if (risk === null) continue;
    rows.push({ country, year: cfg.year, risk, original: parseFloat(row[cfg.scoreCol]) });
  }
  return rows;
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function insertBatch(batch) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const { error } = await sb.from('historical_signal_readings').insert(batch);
      if (error) throw error;
      return;
    } catch (err) {
      if (attempt >= 5) throw err;
      await delay(1000 * attempt);
    }
  }
}

async function main() {
  console.log('\n  TI CPI Ingest — 1995–2025 (31 years, 2012 skipped)\n');

  // Check existing count (for reporting, no delete)
  const { count } = await sb.from('historical_signal_readings')
    .select('*', { count: 'exact', head: true }).eq('signal_key', SIGNAL_KEY);
  console.log(`  Existing ${SIGNAL_KEY} rows: ${count || 0} (will upsert, not delete)`);

  const allRows = [];
  const skipped = [];

  for (const cfg of CONFIGS) {
    const filePath = path.join(ARCHIVE, cfg.file);
    if (!fs.existsSync(filePath)) {
      skipped.push(`${cfg.year} (${cfg.file} not found)`);
      continue;
    }
    try {
      let parsed;
      if (cfg.type === 'csv') {
        parsed = await parseCSV(filePath, cfg.year);
      } else {
        parsed = parseXLSX(cfg);
      }
      allRows.push(...parsed);
      process.stdout.write(`\r  ${cfg.year}: ${parsed.length} countries   `);
    } catch (err) {
      skipped.push(`${cfg.year} (${err.message})`);
    }
  }
  console.log('\n');

  if (allRows.length === 0) {
    console.error('  No data parsed. Check CPI-Archive/ folder.');
    process.exit(1);
  }

  // Build insert payload
  const toInsert = allRows.map(({ country, year, risk, original }) => ({
    country,
    signal_key: SIGNAL_KEY,
    signal_name: SIGNAL_NAME,
    date: `${year}-01-01`,
    raw_value: risk / 100,
    raw_metadata: {
      score_0_100: risk,
      original_cpi: original,
      scale: year < 2012 ? '0-10' : '0-100',
      inverted: true,
      source: 'Transparency International CPI'
    },
    source: 'Transparency International CPI',
    gap: false
  }));

  // Upsert (insert or update, never delete)
  const result = await upsertReadings(sb, toInsert, {
    batchSize: BATCH,
    onProgress: ({ processed, total }) => {
      process.stdout.write(`\r  Upserted: ${processed.toLocaleString()}/${total.toLocaleString()}   `);
    }
  });
  console.log('\n');
  const inserted = result.inserted;
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
    result.errors.slice(0, 3).forEach(e => console.log(`    ${e.error}`));
  }

  const countries = new Set(allRows.map(r => r.country));
  const years     = [...new Set(allRows.map(r => r.year))].sort((a,b)=>a-b);

  console.log(`  Rows inserted:  ${inserted.toLocaleString()}`);
  console.log(`  Countries:      ${countries.size}`);
  console.log(`  Years covered:  ${years[0]}–${years[years.length-1]} (${years.length} years)`);
  if (skipped.length) console.log(`  Skipped:        ${skipped.join(', ')}`);
  console.log('\n  Next: node historical/post_backfill_chain.cjs');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
