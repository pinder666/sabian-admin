// Basic field-level scoring
function analyzeFieldData(rows) {
  const fields = Object.keys(rows[0] || {});
  const currentTotals = {};
  const historyMax = {};
  const counts = {};

  rows.forEach(row => {
    fields.forEach(field => {
      const val = parseFloat(row[field]);
      if (!isNaN(val)) {
        currentTotals[field] = (currentTotals[field] || 0) + val;
        historyMax[field] = Math.max(historyMax[field] || 0, val);
        counts[field] = (counts[field] || 0) + 1;
      }
    });
  });

  const summaries = [];
  let weightedScoreTotal = 0;
  let weightSum = 0;

  fields.forEach(field => {
    const currentAvg = (currentTotals[field] || 0) / (counts[field] || 1);
    const maxValue = historyMax[field] || 1;
    const score = Math.min((currentAvg / maxValue) * 100, 100);

    weightedScoreTotal += score;
    weightSum++;

    let status = 'yellow';
    if (score >= 80) status = 'green';
    else if (score < 50) status = 'red';

    summaries.push({
      field,
      score: parseFloat(score.toFixed(1)),
      status,
      summary: `${field} score is ${score.toFixed(1)} (${status})`
    });
  });

  const insightScore = weightSum ? Math.round(weightedScoreTotal / weightSum) : 0;
  const businessHealth = insightScore >= 80 ? 'green' : insightScore >= 50 ? 'yellow' : 'red';

  return {
    insightScore,
    businessHealth,
    departmentSummaries: summaries
  };
}

// Enhanced version with department breakdowns
function analyzeDepartmentData(rows) {
  const fields = Object.keys(rows[0] || {});
  const currentTotals = {};
  const historyMax = {};
  const counts = {};

  const departmentScores = {};
  const departmentSummaries = {};

  rows.forEach(row => {
    fields.forEach(field => {
      const val = parseFloat(row[field]);
      if (!isNaN(val)) {
        currentTotals[field] = (currentTotals[field] || 0) + val;
        historyMax[field] = Math.max(historyMax[field] || 0, val);
        counts[field] = (counts[field] || 0) + 1;

        const dept = row.department || 'General';
        departmentScores[dept] = departmentScores[dept] || { total: 0, count: 0 };
        departmentScores[dept].total += val;
        departmentScores[dept].count++;
      }
    });
  });

  const summaries = [];
  let weightedScoreTotal = 0;
  let weightSum = 0;

  fields.forEach(field => {
    const currentAvg = (currentTotals[field] || 0) / (counts[field] || 1);
    const maxValue = historyMax[field] || 1;
    const score = Math.min((currentAvg / maxValue) * 100, 100);

    weightedScoreTotal += score;
    weightSum++;

    let status = 'yellow';
    if (score >= 80) status = 'green';
    else if (score < 50) status = 'red';

    summaries.push({
      field,
      score: parseFloat(score.toFixed(1)),
      status,
      summary: `${field} score is ${score.toFixed(1)} (${status})`
    });
  });

  const insightScore = weightSum ? Math.round(weightedScoreTotal / weightSum) : 0;
  const businessHealth = insightScore >= 80 ? 'green' : insightScore >= 50 ? 'yellow' : 'red';

  Object.entries(departmentScores).forEach(([dept, val]) => {
    const avg = val.total / val.count;
    const maxValue = historyMax[dept] || avg;
    const score = Math.min((avg / maxValue) * 100, 100);

    let status = 'yellow';
    if (score >= 80) status = 'green';
    else if (score < 50) status = 'red';

    departmentSummaries[dept] = {
      score: parseFloat(score.toFixed(1)),
      status,
      summary: `${dept} running at ${score.toFixed(1)}% (${status})`
    };
  });

  return {
    insightScore,
    businessHealth,
    departmentSummaries: Object.values(departmentSummaries),
    fieldSummaries: summaries
  };
}

module.exports = { analyzeFieldData, analyzeDepartmentData };
