const fs = require('fs');
const path = require('path');

const folders = [
  'sabian_private_dashboard',
  'sabian_core-cec'
];

console.log('[SABIAN CHECK]');
folders.forEach(folder => {
  const fullPath = path.join(__dirname, folder);
  if (!fs.existsSync(fullPath)) {
    console.log(`- ${folder} → MISSING or untracked`);
  } else if (fs.readdirSync(fullPath).length === 0) {
    console.log(`- ${folder} → EMPTY, consider excluding`);
  } else {
    console.log(`- ${folder} → PRESENT, check .git status`);
  }
});
console.log('- All other folders → check with git status');
