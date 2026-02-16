require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function parseCSVFromURL(url) {
  const response = await axios.get(url, { responseType: 'stream' });
  return new Promise((resolve, reject) => {
    const rows = [];
    response.data
      .pipe(csvParser())
      .on('data', (data) => rows.push(data))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function parseJSONFromAPI(url) {
  const response = await axios.get(url);
  return response.data;
}

async function insertData(rows, company_id, user_id) {
  const companies = [], departments = [], users = [];

  rows.forEach(row => {
    companies.push({
      id: row.company_id,
      name: row.company_name,
      industry: row.industry,
      annual_revenue: row.annual_revenue,
      size: row.size,
      region: row.region,
    });

    departments.push({
      id: row.department_id,
      company_id: row.company_id,
      name: row.department_name,
      function: row.function,
    });

    users.push({
      id: row.user_id,
      name: row.name,
      email: row.email,
      title: row.title,
      department_id: row.department_id,
      company_id: row.company_id,
    });
  });

  await supabase.from('companies').upsert(companies);
  await supabase.from('departments').upsert(departments);
  await supabase.from('company_users').upsert(users);

  await supabase.from('data_sources').upsert([{
    user_id,
    company_id,
    type: currentSource.type,
    source_path: currentSource.source_path,
    status: 'connected',
    fields_mapped: true,
    last_synced: new Date().toISOString()
  }]);
}

let currentSource = {
  type: process.argv[2], // 'csv' or 'api'
  source_path: process.argv[3], // file URL or API endpoint
  company_id: process.argv[4],
  user_id: process.argv[5]
};

(async () => {
  let rows = [];

  if (currentSource.type === 'csv') {
    rows = await parseCSVFromURL(currentSource.source_path);
  } else if (currentSource.type === 'api') {
    rows = await parseJSONFromAPI(currentSource.source_path);
  } else {
    console.error("Unsupported source type.");
    process.exit(1);
  }

  if (!rows.length) {
    console.error("No data found.");
    process.exit(1);
  }

  await insertData(rows, currentSource.company_id, currentSource.user_id);
  console.log("✅ Data inserted into Supabase.");
})();
