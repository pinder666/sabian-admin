const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://YOUR_PROJECT.supabase.co';
const supabaseKey = 'YOUR_SUPABASE_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

const queuePath = path.join(__dirname, '.log_queue');
let lastFetchTime = null;

function logSupabaseActivity(message) {
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp} — SUPABASE: ${message}\n`;
  fs.appendFileSync(queuePath, logLine);
}

async function fetchAndLogAudit() {
  const query = supabase
    .from('audit_logs')
    .select('*')
    .order('event_time', { ascending: true });

  if (lastFetchTime) query.gte('event_time', lastFetchTime);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching audit logs:', error);
    return;
  }

  if (data && data.length > 0) {
    for (const log of data) {
      const logLine = `${log.event_time} — SUPABASE AUDIT: Table=${log.table_name} Operation=${log.operation} User=${log.user_id} Details=${JSON.stringify(log.details)}`;
      fs.appendFileSync(queuePath, logLine + '\n');
      lastFetchTime = log.event_time;
    }
  }
}

async function insertRecord(table, record) {
  const { data, error } = await supabase.from(table).insert([record]);
  logSupabaseActivity(`Insert into ${table}: ${error ? 'ERROR' : 'SUCCESS'}`);
  return { data, error };
}

async function getRecord(table, filter) {
  const { data, error } = await supabase.from(table).select('*').match(filter);
  logSupabaseActivity(`Select from ${table} where ${JSON.stringify(filter)}: ${error ? 'ERROR' : 'SUCCESS'}`);
  return { data, error };
}

// Call fetchAndLogAudit() manually before running your build logger to pull audit logs into .log_queue

module.exports = {
  insertRecord,
  getRecord,
  fetchAndLogAudit,
};
