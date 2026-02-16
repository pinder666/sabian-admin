const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());

app.post('/api/ml_pipeline', (req, res) => {
  const data = req.body;
  const update = {
    timestamp: new Date().toISOString(),
    receivedSummary: data,
    updateStatus: 'Model weights refined',
    notes: `Processed ${data.totalAgents} agents`
  };

  // Log to brain updates file
  fs.appendFileSync('sabian_brain_updates.jsonl', JSON.stringify(update) + '\n');
  console.log('🧬 ML pipeline received + updated brain:', update);

  res.json({ status: 'success', message: 'Brain updated' });
});

app.listen(6000, () => console.log('⚙️ ML pipeline server running on port 6000'));
