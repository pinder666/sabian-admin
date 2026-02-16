// === Sabian Insight Score Calculation Function ===

function calculateInsightScore({
  performanceVariance,
  adaptability,
  forecastEfficiency,
  strategicAlignment,
  revenueFriction,
  marketConditions,
  resilienceIndex
}) {
  if (revenueFriction <= 0) revenueFriction = 1; // Prevent division by zero

  const baseScore = (performanceVariance * adaptability * forecastEfficiency * strategicAlignment) / revenueFriction;
  const adjustedScore = baseScore * marketConditions * resilienceIndex;

  return Math.round(adjustedScore);
}
// === Example Test Data ===

const testData = {
  performanceVariance: 85,     // e.g., 85% near ideal
  adaptability: 1.2,           // higher than 1 means quick response
  forecastEfficiency: 0.9,     // prediction accuracy
  strategicAlignment: 1.1,     // alignment to goals
  revenueFriction: 1.3,        // inefficiencies present
  marketConditions: 0.95,      // slightly tough market
  resilienceIndex: 1.05        // good resilience
};

const insightScore = calculateInsightScore(testData);
console.log(`Sabian Insight Score: ${insightScore}`);
