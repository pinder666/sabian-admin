const express = require('express');
const app = express();
const port = 5000;

app.get('/api/status', (req, res) => {
  res.json({
    agents: [
      { id: 'agent1', status: 'online', version: '1.0.0' },
      { id: 'agent2', status: 'updating', version: '1.0.1' },
      { id: 'agent3', status: 'offline', version: '1.0.0' }
    ]
  });
});

app.listen(port, () => {
  console.log(`Mock server running on http://localhost:${port}`);
});
