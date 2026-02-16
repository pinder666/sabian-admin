const axios = require('axios');
const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, '../BUILD_LOG.md');
const n8nWebhookURL = 'https://your-n8n-instance.com/webhook/your-flow-id';

function logAction(stage, detail, status) {
  const timestamp = new Date().toISOString();
  const logEntry = `\n🔗 ${timestamp} — n8n ${stage} (${status}): ${detail}\n`;
  fs.appendFileSync(logPath, logEntry);
}

async function callN8n(data) {
  logAction('CALL', JSON.stringify(data).slice(0, 60), 'started');
  try {
    const response = await axios.post(n8nWebhookURL, data);
    logAction('CALL', 'n8n webhook response received', 'success');
    return response.data;
  } catch (error) {
    logAction('CALL', `n8n error: ${error.message}`, 'failed');
    return null;
  }
}

module.exports = {
  callN8n
};
