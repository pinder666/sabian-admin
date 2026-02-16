// /intake/test_csv_local.cjs

const { exec } = require('child_process');

const csvUrl = 'https://example.com/test.csv'; // Replace with actual CSV URL
const companyId = 'test_company';
const userId = 'test_user';

const cmd = `node csv_intake.cjs "${csvUrl}" "${companyId}" "${userId}"`;

exec(cmd, (err, stdout, stderr) => {
  if (err) {
    console.error('❌ Error running CSV intake:', err);
    return;
  }

  console.log('✅ CSV Intake Output:\n', stdout);
  if (stderr) console.error('⚠️ Stderr:\n', stderr);
});
