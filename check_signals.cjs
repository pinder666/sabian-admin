require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await sb.from('historical_signal_readings').select('signal').limit(10000);
  if (error) { console.log('ERROR', error.message); return; }
  const names = [...new Set((data||[]).map(r => r.signal))].sort();
  console.log('SIGNAL NAMES:', names);
  console.log('COUNT:', names.length);
})();
