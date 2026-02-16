const axios = require('axios');

module.exports = async function deploySmartAgent(targetUrl, agentConfig) {
  try {
    const response = await axios.post(targetUrl, agentConfig);
    console.log(`✅ Agent deployed to ${targetUrl}`, response.data);
  } catch (err) {
    console.error(`❌ Deploy failed:`, err.message);
  }
};
