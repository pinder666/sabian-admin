// sabian_backup.cjs
// Sabian Supabase history backup — exports all tables to a dated JSON file
// Run on-demand or via PM2 weekly cron
// Output: backups/sabian_backup_YYYY-MM-DD.json
//
// Usage:
//   node sabian_backup.cjs               -- backup today's date
//   node sabian_backup.cjs --verify      -- verify last backup is readable
//   node sabian_backup.cjs --stats       -- print row counts only, no file written

require('dotenv').config({ path: './.env' });
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('./logger.cjs');

const BACKUP_DIR = path.join(__dirname, 'backups');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Pull all rows from a table in paginated chunks (Supabase returns max 1000/page)
async function pullAll(supabase, table) {
  const rows = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1)
      .order('id', { ascending: true });
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function runBackup(options = {}) {
  const supabase = getClient();
  const today = new Date().toISOString().slice(0, 10);
  const startTime = Date.now();

  console.log(`\nSabian Backup — ${today}`);
  console.log('─'.repeat(50));

  const tables = ['convergence_scores', 'signal_readings', 'global_scans', 'observations'];
  const backup = {
    backup_date: today,
    generated_at: new Date().toISOString(),
    source: process.env.SUPABASE_URL,
    tables: {}
  };

  let totalRows = 0;
  for (const table of tables) {
    process.stdout.write(`  Pulling ${table}...`);
    const rows = await pullAll(supabase, table);
    backup.tables[table] = rows;
    totalRows += rows.length;
    console.log(` ${rows.length} rows`);
  }

  if (options.statsOnly) {
    console.log(`\nTotal: ${totalRows} rows across ${tables.length} tables`);
    return;
  }

  // Write backup file
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const filename = `sabian_backup_${today}.json`;
  const filepath = path.join(BACKUP_DIR, filename);
  const json = JSON.stringify(backup, null, 2);
  fs.writeFileSync(filepath, json, 'utf8');

  const fileSizeKb = Math.round(fs.statSync(filepath).size / 1024);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\nBackup written: backups/${filename}`);
  console.log(`Size: ${fileSizeKb}KB | Rows: ${totalRows} | Time: ${elapsed}s`);

  // Write/update a latest.json symlink-equivalent (always points to most recent backup)
  const latestPath = path.join(BACKUP_DIR, 'latest.json');
  fs.writeFileSync(latestPath, json, 'utf8');
  console.log('Latest: backups/latest.json updated');

  logToHive({
    source: 'sabian_backup',
    level: 'intel',
    event: 'backup_complete',
    data: { backup_date: today, total_rows: totalRows, file_size_kb: fileSizeKb, elapsed_s: parseFloat(elapsed) },
    tags: ['backup', 'supabase']
  });

  return { backup_date: today, total_rows: totalRows, file_size_kb: fileSizeKb, file: filename };
}

async function verifyBackup() {
  const latestPath = path.join(BACKUP_DIR, 'latest.json');
  if (!fs.existsSync(latestPath)) {
    console.log('No backup found at backups/latest.json — run without --verify first');
    return;
  }
  const raw = fs.readFileSync(latestPath, 'utf8');
  const data = JSON.parse(raw);
  console.log(`\nBackup verification:`);
  console.log(`  Date: ${data.backup_date}`);
  console.log(`  Generated: ${data.generated_at}`);
  for (const [table, rows] of Object.entries(data.tables || {})) {
    console.log(`  ${table}: ${rows.length} rows`);
  }
  console.log('\nBackup readable and intact.');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--verify')) {
    verifyBackup().catch(console.error);
  } else if (args.includes('--stats')) {
    runBackup({ statsOnly: true }).catch(console.error);
  } else {
    runBackup().catch(console.error);
  }
}

module.exports = { runBackup, verifyBackup };
