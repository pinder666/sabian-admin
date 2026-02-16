const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());

const statusFile = 'smart_sabian_status.json';

app.post('/api/status', (req, res) => {
  const data = req.body;
  let logs = [];

  if (fs.existsSync(statusFile)) {
    logs = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  }

  data.timestamp = new Date().toISOString();
  logs.push(data);
  fs.writeFileSync(statusFile, JSON.stringify(logs, null, 2));
  
  console.log('📡 Smart Sabian reported:', data);
  res.send('Status received');
});

app.listen(5002, () => console.log('🚀 Telemetry Receiver running on port 5002'));
