const fs = require('fs');
const path = require('path');

// Configuration
const audioDir = path.resolve('C:/Users/user/Desktop/sabian.ai/sabian_core/my_audio');
const transcriptDir = path.resolve('C:/Users/user/Desktop/sabian.ai/sabian_core/podcast');
const now = Date.now();
const audioRetentionMs = 28 * 24 * 60 * 60 * 1000;      // 28 days
const transcriptRetentionMs = 365 * 24 * 60 * 60 * 1000; // 365 days

function cleanDir(dir, retentionMs) {
  fs.readdir(dir, (err, files) => {
    if (err) return console.error(`Read error (${dir}): ${err}`);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return console.error(`Stat error (${file}): ${err}`);
        const ageMs = now - stats.mtimeMs;
        const ageDays = (ageMs / (1000 * 60 * 60 * 24)).toFixed(1);
        const action = ageMs > retentionMs ? 'DELETE' : 'KEEP';
        console.log(`${action}: ${file} (age: ${ageDays}d)`);
        if (action === 'DELETE') {
          fs.unlink(filePath, err => {
            if (err) console.error(`Delete error (${file}): ${err}`);
          });
        }
      });
    });
  });
}

console.log('Starting cleanup...');
cleanDir(audioDir, audioRetentionMs);
cleanDir(transcriptDir, transcriptRetentionMs);
console.log('Cleanup complete.');
