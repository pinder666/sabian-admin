require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const csvParser = require('csv-parser');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function insertMappedData(rows, companyId, userId, sourcePath) {
  for (const row of rows) {
    const payload = {
      owner_user_id: userId,
      name: row.name,
      email: row.email,
      source: "CSV",
      experience_type: row.experience_type || null,
      business_name: row.business_name || null,
      revenue_estimate: row.revenue_estimate || null,
      last_activity_date: row.last_activity_date || null,
      subscription_status: row.subscription_status || null,
      stripe_customer_id: row.stripe_customer_id || null,
      country: row.country || null,
      total_minutes_allowed: row.total_minutes_allowed || 0,
      minutes_used: row.minutes_used || 0,
      minutes_remaining: row.minutes_remaining || 0,
      raw_data_json: row
    };

    console.log("🧪 Insert into connected_users:", payload);

    const { error } = await supabase.from('connected_users').upsert([payload]);

    if (error) {
      console.error("❌ Insert failed:", error.message);
    } else {
      console.log("✅ Insert succeeded.");
    }
  }

  // Log the source
  await supabase.from('data_sources').upsert([{
    user_id: userId,
    company_id: companyId,
    type: "CSV",
    source_path: sourcePath,
    status: "connected",
    fields_mapped: true,
    last_synced: new Date().toISOString()
  }]);

  // Log the intake run
  await supabase.from('intake_runs').insert([{
    user_id: userId,
    company_id: companyId,
    source: "CSV",
    status: "success",
    timestamp: new Date().toISOString()
  }]);

  console.log("✅ Data written to Supabase.");
}

(async () => {
  const sourcePath = process.argv[2]; // CSV path
  const companyId = process.argv[3];  // Company ID
  const userId = process.argv[4];     // User ID

  if (!sourcePath || !companyId || !userId) {
    console.error("❌ Usage: node csv_intake.cjs <csv_path> <company_id> <user_id>");
    process.exit(1);
  }

  try {
    const rows = await parseCSV(sourcePath);
    if (!rows.length) throw new Error("CSV was empty or unreadable.");
    await insertMappedData(rows, companyId, userId, sourcePath);
    console.log("🎯 Intake complete.");
  } catch (err) {
    console.error("❌ Intake failed:", err.message);
    process.exit(1);
  }
})();
