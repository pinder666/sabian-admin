require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testInsert() {
  const { data, error } = await supabase.from('users').insert([
    {
      name: 'Test User',
      email: 'test@example.com',
      Business_name: 'Test Business',
      experience_type: 'Conversational',
      subscription_status: 'active',
      stripe_customer_id: 'test_123',
      country: 'US',
      minutes_remaining: 42,
      reset_date: new Date().toISOString(),
      created_at: new Date().toISOString()
    }
  ]);

  if (error) {
    console.error('❌ Insert failed:', error.message);
  } else {
    console.log('✅ Test insert successful:', data);
  }
}

testInsert();
