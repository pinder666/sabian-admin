const fs = require('fs');
const path = require('path');

// Simulation config
const sectors = ['Mining', 'Education', 'Finance', 'Energy', 'Infrastructure'];
const sadcCountries = [
  'Angola', 'Botswana', 'Comoros', 'Democratic Republic of the Congo', 'Eswatini',
  'Lesotho', 'Madagascar', 'Malawi', 'Mauritius', 'Mozambique', 'Namibia',
  'Seychelles', 'South Africa', 'Tanzania', 'Zambia', 'Zimbabwe'
];

// Helper function: random % growth
const randomGrowth = () => (Math.random() * 5).toFixed(2); // between 0% and 5%

// Start simulation
const simulateGrowth = () => {
  console.log('🧠 Running Sabian Growth Simulation...');
  const simulationResults = [];

  sadcCountries.forEach(country => {
    const countryResult = { country, sectors: {} };
    sectors.forEach(sector => {
      countryResult.sectors[sector] = `${randomGrowth()}% growth`;
    });
    simulationResults.push(countryResult);
  });

  // Save results
  const outputPath = path.join(__dirname, 'simulations', `simulation_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(simulationResults, null, 2));
  console.log(`✅ Simulation saved: ${outputPath}`);
};

simulateGrowth();
