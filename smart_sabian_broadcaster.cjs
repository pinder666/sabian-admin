const axios = require('axios');

const SMART_SABIAN_STATUS_URL = process.env.SMART_SABIAN_STATUS_URL || 'http://localhost:5000/api/status';


async function broadcastSmartSabianStatus() {
  try {
    const response = await axios.get(SMART_SABIAN_STATUS_URL, {
      headers: { Authorization: `Bearer ${process.env.SMART_SABIAN_API_KEY}` }
    });

    if (response.status === 200) {
      const fleetStatus = response.data;
      console.log('[SMART SABIAN BROADCASTER] Fleet status:');
      console.table(fleetStatus.agents);
    } else {
      console.log(`[SMART SABIAN BROADCASTER] Failed to fetch status. Status: ${response.status}`);
    }
  } catch (err) {
    console.error('[SMART SABIAN BROADCASTER] Error:', err.message);
  }
}

if (require.main === module) {
  broadcastSmartSabianStatus();
}

module.exports = { broadcastSmartSabianStatus };
