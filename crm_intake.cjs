require("dotenv").config();
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const userId = process.argv[2];
  if (!userId) {
    console.error("❌ Usage: node crm_intake.cjs <user_id>");
    process.exit(1);
  }

  let crmData;
  try {
    crmData = JSON.parse(fs.readFileSync("test_crm_payload.json", "utf-8"));
  } catch (err) {
    console.error("❌ Failed to read CRM JSON file:", err.message);
    process.exit(1);
  }

  const payload = {
    owner_user_id: userId,
    name: crmData.name || null,
    email: crmData.email || null,
    business_name: crmData.business_name || null,
    country: crmData.country || null,
    source: "CRM",
    experience_type: crmData.experience_type || null,
    subscription_status: crmData.subscription_status || null,
    stripe_customer_id: crmData.stripe_customer_id || null,
    total_minutes_allowed: crmData.total_minutes_allowed || 0,
    minutes_used: crmData.minutes_used || 0,
    minutes_remaining: crmData.minutes_remaining || 0,
    reset_date: crmData.reset_date || null,
    raw_data_json: crmData,
  };

  console.log("🧪 Insert into connected_users:", payload);

  const { error } = await supabase.from("connected_users").upsert([payload]);

  if (error) {
    console.error("❌ Insert failed:", error.message);
  } else {
    console.log("✅ CRM data inserted to Supabase.");
  }
})();
