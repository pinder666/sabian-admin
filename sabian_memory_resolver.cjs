const fs = require('fs');
const path = require('path');

// Folder where simulations are saved
const simulationsDir = path.join(__dirname, 'simulations');

// Read all simulation files
const simulationFiles = fs.readdirSync(simulationsDir)
  .filter(file => file.startsWith('simulation_') && file.endsWith('.json'))
  .sort((a, b) => fs.statSync(path.join(simulationsDir, b)).mtime - fs.statSync(path.join(simulationsDir, a)).mtime);

// Need at least 2 simulations to compare
if (simulationFiles.length < 2) {
  console.error('❌ Not enough simulations to compare.');
  process.exit(1);
}

// Read latest two simulations
const latestSimulation = JSON.parse(fs.readFileSync(path.join(simulationsDir, simulationFiles[0]), 'utf-8'));
const previousSimulation = JSON.parse(fs.readFileSync(path.join(simulationsDir, simulationFiles[1]), 'utf-8'));

// Compare growth sectors
const comparison = [];

latestSimulation.forEach((latestCountry, index) => {
  const previousCountry = previousSimulation[index];
  const countryComparison = {
    country: latestCountry.country,
    sector_changes: {}
  };

  for (let sector in latestCountry.sectors) {
    const latestGrowth = parseFloat(latestCountry.sectors[sector]);
    const previousGrowth = parseFloat(previousCountry.sectors[sector]);
    const change = (latestGrowth - previousGrowth).toFixed(2);
    countryComparison.sector_changes[sector] = `${change}%`;
  }

  comparison.push(countryComparison);
});

// Save comparison
const memoryPath = path.join(__dirname, 'simulations', `memory_comparison_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(memoryPath, JSON.stringify(comparison, null, 2));

console.log(`✅ Memory comparison saved: ${memoryPath}`);
