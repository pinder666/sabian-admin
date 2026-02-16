const supabase = require('./supabase_client.cjs');

await supabase.from('users').insert([{
  name: user_name,
  email: user_email,
  business_name: business_name,
  problem: business_problem
}]);
