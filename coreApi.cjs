// /sabian-core/api/index.js
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

app.get('/api/status', (req, res) => {
  res.json({ status: 'Sabian Core API is running.' });
});

app.listen(PORT, () => {
  console.log(`Sabian API running on port ${PORT}`);
});
