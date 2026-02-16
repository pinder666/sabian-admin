const mockData = {
  insightScore: 85,
  previousInsight: 'Revenue up 10% last quarter',
  departmentFocus: ['Sales', 'Marketing'],
  businessHealth: 'Stable',
  latestBriefing: 'Q2 results published',
  integrationSetup: ['CRM', 'ERP']
};

const visibilityRules = {
  boardroom: ['insightScore', 'previousInsight', 'departmentFocus', 'businessHealth', 'latestBriefing', 'integrationSetup'],
  conversational: ['previousInsight', 'businessHealth', 'latestBriefing', 'integrationSetup']
};

function applyVisibility(data, tier) {
  const allowedFields = visibilityRules[tier] || [];
  const result = {};
  allowedFields.forEach(field => {
    result[field] = data[field];
  });
  return result;
}

// Testing console outputs
console.log('Boardroom user data:', applyVisibility(mockData, 'boardroom'));
console.log('Conversational user data:', applyVisibility(mockData, 'conversational'));
