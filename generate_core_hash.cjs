const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const coreFiles = [
  'insight_engine.cjs',
  'voice_generator.cjs',
  'user_data.json',
  'config.json',
  '.env',
  'rebirth_engine.py',
  'revenue_intelligence_core.cjs',
  'earnings_loop_runner.cjs',
  'revenue_ml_model.cjs',
  'learned_insights.json'
];

const hashes = {};

coreFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    hashes[file] = hashSum.digest('hex');
    console.log(`✅ Hashed: ${file}`);
  } else {
    console.log(`⚠ Skipped (missing): ${file}`);
  }
});

fs.writeFileSync('core_hash.json', JSON.stringify(hashes, null, 2));
console.log('✅ core_hash.json generated successfully.');
