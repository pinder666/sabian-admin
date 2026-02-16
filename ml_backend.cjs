const fs = require('fs');
const axios = require('axios');

async function sendToMLBackend() {
  const repairLog = JSON.parse(fs.readFileSync('./repair_log.json', 'utf8'));
  const failureCounter = JSON.parse(fs.readFileSync('./failure_counter.json', 'utf8'));

  try {
    const response = await axios.post('https://ml-backend.example.com/api/repair', {
      repairLog,
      failureCounter
    });

    console.log('ML Response:', response.data);

    if (response.data.patch) {
      applyPatch(response.data.patch);
    } else {
      console.log('No patch needed from ML.');
    }
  } catch (error) {
    console.error('ML backend error:', error.message);
    alertOwner('ML backend failed to process repair data.');
  }
}

function applyPatch(patch) {
  console.log('Applying patch:', patch);
  try {
    fs.writeFileSync('./applied_patch.json', JSON.stringify(patch));
    console.log('Patch applied successfully.');
  } catch (err) {
    console.error('Patch application failed:', err.message);
    alertOwner('Patch application failed.');
  }
}

function alertOwner(message) {
  console.log(`ALERT to owner: ${message}`);
}

// Uncomment below to run immediately
// sendToMLBackend();
