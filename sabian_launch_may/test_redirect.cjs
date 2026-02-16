const fetch = require('node-fetch');

// Example target – change this later to real agent targets
const sabian = { target: 'https://www.google.com' };

(async () => {
  console.log('🛰️ Smart Sabian attempting connection to:', sabian.target);
  try {
    const response = await fetch(sabian.target);
    if (response.redirected) {
      console.log('🚦 Redirect followed to:', response.url);
    } else {
      console.log('🛑 No redirect – direct hit.');
    }
    console.log('✅ Connected with status:', response.status);
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
})();
