// crm_connect.cjs

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const [providerArg, companyId, userId] = process.argv.slice(2);

if (!providerArg || !companyId || !userId) {
  console.error("❌ Usage: node crm_connect.cjs <provider> <company_id> <user_id>");
  process.exit(1);
}

async function connectToCRM() {
  const provider = providerArg.toLowerCase();
  const mockToken = `fake_${provider}_access_token_${Date.now()}`;

  const payload = {
    owner_user_id: userId,
    source: provider.toUpperCase(),
    crm_provider: provider,
    crm_access_token: mockToken,
    crm_refresh_token: null,
    raw_data_json: { mock: true, provider }, // for trace/debug
  };

  console.log("🧪 Insert into connected_users:", payload);

  const { error } = await supabase.from('connected_users').upsert([payload]);

  if (error) {
    console.error("❌ Insert failed:", error.message);
  } else {
    console.log("✅ CRM connection written to Supabase.");
    console.log("🎯 CRM Connect complete.");
  }
}

connectToCRM();
