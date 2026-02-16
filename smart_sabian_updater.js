const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SMART_SABIAN_URL = process.env.SMART_SABIAN_URL || 'https://fleet.sabian-core.com/api/update';
const UPDATE_FILE = path.join(__dirname, 'global_update.json');

async function pushSmartSabianUpdate() {
  try {
    if (!fs.existsSync(UPDATE_FILE)) {
      console.log('[SMART SABIAN UPDATER] No global_update.json found. Skipping push.');
      return;
    }

    const updateData = JSON.parse(fs.readFileSync(UPDATE_FILE, 'utf8'));

    const response = await axios.post(SMART_SABIAN_URL, updateData, {
      headers: { Authorization: `Bearer ${process.env.SMART_SABIAN_API_KEY}` }
    });

    if (response.status === 200) {
      console.log('[SMART SABIAN UPDATER] Update pushed to Smart Sabians successfully.');
    } else {
      console.log(`[SMART SABIAN UPDATER] Failed. Status: ${response.status}`);
    }
  } catch (err) {
    console.error('[SMART SABIAN UPDATER] Error:', err.message);
  }
}

if (require.main === module) {
  pushSmartSabianUpdate();
}

module.exports = { pushSmartSabianUpdate };
