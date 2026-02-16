const express = require('express');
const axios = require('axios'); // Add axios to send data
const app = express();
app.use(express.json());

app.post('/agent', async (req, res) => {
  console.log('🚀 Received Smart Agent:', req.body);
  
  try {
    await axios.post('http://localhost:5000/master-loop', req.body); // Forward to Master Loop
    res.send('Agent deployed and sent to Master Loop!');
  } catch (error) {
    console.error('❌ Failed to forward to Master Loop:', error.message);
    res.status(500).send('Forwarding failed.');
  }
});

app.listen(5001, () => console.log('Agent receiver running on port 5001'));
