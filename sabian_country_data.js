const fs = require('fs');
const path = require('path');

// SADC Countries
const sadcCountries = [
  'Angola', 'Botswana', 'Comoros', 'Democratic Republic of the Congo', 'Eswatini',
  'Lesotho', 'Madagascar', 'Malawi', 'Mauritius', 'Mozambique', 'Namibia',
  'Seychelles', 'South Africa', 'Tanzania', 'Zambia', 'Zimbabwe'
];

// Real data simulation (this will eventually pull from real APIs or databases)
const countryData = {
  Angola: {
    mining: 'High', finance: 'Developing', energy: 'Low', education: 'Low', infrastructure: 'Medium'
  },
  Botswana: {
    mining: 'High', finance: 'Medium', energy: 'Medium', education: 'High', infrastructure: 'High'
  },
  Comoros: {
    mining: 'Low', finance: 'Low', energy: 'Low', education: 'Low', infrastructure: 'Low'
  },
  'Democratic Republic of the Congo': {
    mining: 'High', finance: 'Low', energy: 'Low', education: 'Low', infrastructure: 'Low'
  },
  Eswatini: {
    mining: 'Low', finance: 'Medium', energy: 'Medium', education: 'Medium', infrastructure: 'Medium'
  },
  Lesotho: {
    mining: 'Low', finance: 'Low', energy: 'Low', education: 'High', infrastructure: 'Low'
  },
  Madagascar: {
    mining: 'Medium', finance: 'Low', energy: 'Low', education: 'Low', infrastructure: 'Low'
  },
  Malawi: {
    mining: 'Low', finance: 'Low', energy: 'Low', education: 'Medium', infrastructure: 'Low'
  },
  Mauritius: {
    mining: 'Low', finance: 'High', energy: 'Medium', education: 'High', infrastructure: 'High'
  },
  Mozambique: {
    mining: 'Medium', finance: 'Low', energy: 'Medium', education: 'Low', infrastructure: 'Medium'
  },
  Namibia: {
    mining: 'High', finance: 'Medium', energy: 'High', education: 'High', infrastructure: 'Medium'
  },
  Seychelles: {
    mining: 'Low', finance: 'High', energy: 'Low', education: 'High', infrastructure: 'High'
  },
  'South Africa': {
    mining: 'High', finance: 'High', energy: 'High', education: 'Medium', infrastructure: 'High'
  },
  Tanzania: {
    mining: 'Medium', finance: 'Low', energy: 'Low', education: 'Medium', infrastructure: 'Low'
  },
  Zambia: {
    mining: 'High', finance: 'Medium', energy: 'Medium', education: 'Low', infrastructure: 'Medium'
  },
  Zimbabwe: {
    mining: 'High', finance: 'Low', energy: 'Low', education: 'Low', infrastructure: 'Low'
  }
};

// Write country data to nodes
const nodesDir = path.join(__dirname, 'SADC_nodes');
const countryFiles = fs.readdirSync(nodesDir)
  .filter(file => file.endsWith('.json'));

countryFiles.forEach(file => {
  const filePath = path.join(nodesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Add real resource data for each country
  const countryName = data.country;
  if (countryData[countryName]) {
    data.realData = countryData[countryName];
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
});

console.log('✅ Country resource data added to all SADC country nodes.');
