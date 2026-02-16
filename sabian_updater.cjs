const https = require('https');
const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'insight_engine.js',
  'voice_generator.js',
  'user_data.json',
  'sabian_wizard.cjs'
];

const UPDATE_SERVER = 'https://YOUR_SERVER_URL/sabian_updates/'; // replace with your server or S3 bucket

function downloadFile(file) {
  const fileUrl = `${UPDATE_SERVER}${file}`;
  const localPath = path.join(__dirname, file);

  https.get(fileUrl, res => {
    if (res.statusCode === 200) {
      const fileStream = fs.createWriteStream(localPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`✅ Updated ${file}`);
      });
    } else {
      console.log(`❌ Failed to update ${file}: Server responded with ${res.statusCode}`);
    }
  }).on('error', err => {
    console.log(`❌ Error downloading ${file}: ${err.message}`);
  });
}

filesToUpdate.forEach(downloadFile);
