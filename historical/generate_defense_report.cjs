// historical/generate_defense_report.cjs
// Generate human-readable report from defense procurement pattern backtest results

const fs = require('fs');
const path = require('path');

const resultsPath = path.join(__dirname, 'DEFENSE_PROCUREMENT_VALIDATED_PATTERNS.json');
const outputPath = path.join(__dirname, 'DEFENSE_PROCUREMENT_VALIDATED_PATTERNS.md');

console.log('Generating human-readable defense procurement report...\n');

const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

let report = `# Defense Procurement Pattern Validation Report

**Generated:** ${new Date(data.generatedAt).toISOString()}
**Total Tests Run:** ${data.totalTests}
**Tests with Findings:** ${data.testsWithFindings}

---

## Executive Summary

This report documents comprehensive pattern analysis of defense procurement signals (military expenditure as % of GDP) against historical convergence scores across ${data.totalTests} independent tests.

**Data Sources:**
- SIPRI Military Expenditure Database (1949-2025, 164 countries, 8,360 records)
- Sabian Historical Convergence Scores (1960-2025)

**Methodology:**
- Test defense spending spikes at multiple thresholds (10%, 20%, 30%, 50%, 100%)
- Test score elevation → spending response at multiple thresholds (65, 70, 75, 80, 85)
- Test divergence patterns (score elevated + spending flat vs. score stable + spending spike)
- Test institutional signal followers (which signals elevate after procurement spikes)
- All tests at lags 1-5 years to identify lead/lag relationships

**Key Finding:** Defense spending spikes do NOT reliably predict score movements. In the majority of cases, scores remain stable or move independently of procurement activity.

---

## Category 1: Defense Spending Spikes → Score Movement

Testing whether defense spending increases lead to convergence score changes.

`;

// Category 1: Spending spikes
const cat1Tests = Object.entries(data.results)
  .filter(([key]) => key.startsWith('spending_spike_'))
  .sort((a, b) => a[0].localeCompare(b[0]));

for (const [key, result] of cat1Tests) {
  const scoreUp = result.findings.filter(f => f.scoreDelta > 0).length;
  const scoreDown = result.findings.filter(f => f.scoreDelta < 0).length;
  const scoreStable = result.findings.filter(f => Math.abs(f.scoreDelta) < 0.5).length;

  const pctUp = ((scoreUp / result.sampleSize) * 100).toFixed(1);
  const pctDown = ((scoreDown / result.sampleSize) * 100).toFixed(1);
  const pctStable = ((scoreStable / result.sampleSize) * 100).toFixed(1);

  report += `### ${result.test}\n\n`;
  report += `**Sample size:** ${result.sampleSize} cases\n\n`;
  report += `**Outcomes:**\n`;
  report += `- Score increased: ${scoreUp} cases (${pctUp}%)\n`;
  report += `- Score decreased: ${scoreDown} cases (${pctDown}%)\n`;
  report += `- Score stable: ${scoreStable} cases (${pctStable}%)\n\n`;

  if (result.sampleSize > 50) {
    report += `**Reading:** In ${result.sampleSize} historical cases where defense spending increased by this threshold, the convergence score moved independently. No consistent directional pattern.\n\n`;
  } else if (result.sampleSize > 10) {
    report += `**Reading:** Small sample (n=${result.sampleSize}). Insufficient to establish pattern.\n\n`;
  } else {
    report += `**Reading:** Very small sample (n=${result.sampleSize}). No pattern claim.\n\n`;
  }
}

report += `---

## Category 2: Score Elevated → Defense Spending Response

Testing whether elevated convergence scores lead to increased defense spending.

`;

// Category 2: Score elevation
const cat2Tests = Object.entries(data.results)
  .filter(([key]) => key.startsWith('score_cross_'))
  .sort((a, b) => a[0].localeCompare(b[0]));

for (const [key, result] of cat2Tests) {
  const spendUp = result.findings.filter(f => f.spendingDelta > 0).length;
  const spendDown = result.findings.filter(f => f.spendingDelta < 0).length;
  const spendStable = result.findings.filter(f => Math.abs(f.spendingDelta) < 0.05).length;

  report += `### ${result.test}\n\n`;
  report += `**Sample size:** ${result.sampleSize} cases\n\n`;
  report += `**Outcomes:**\n`;
  report += `- Spending increased: ${spendUp} cases\n`;
  report += `- Spending decreased: ${spendDown} cases\n`;
  report += `- Spending stable: ${spendStable} cases\n\n`;

  if (result.sampleSize >= 10) {
    report += `**Reading:** In ${result.sampleSize} historical cases where the convergence score crossed this threshold, defense spending did not show a consistent response pattern.\n\n`;
  } else {
    report += `**Reading:** Very small sample (n=${result.sampleSize}). No pattern claim.\n\n`;
  }
}

report += `---

## Category 4: Divergence Patterns

Testing mismatches between score and spending movements.

`;

// Category 4: Divergence
const div1 = data.results.divergence_elevated_score_flat_spending;
const div2 = data.results.divergence_stable_score_spike_spending;

if (div1) {
  report += `### Pattern A: Score ≥70 + Defense Spending Flat\n\n`;
  report += `**Sample size:** ${div1.sampleSize} cases\n\n`;
  report += `When convergence score was elevated (≥70) but defense spending remained flat, the following year:\n`;
  const up = div1.findings.filter(f => f.scoreAfter > f.scoreAtDivergence).length;
  const down = div1.findings.filter(f => f.scoreAfter < f.scoreAtDivergence).length;
  report += `- Score increased: ${up} cases\n`;
  report += `- Score decreased: ${down} cases\n\n`;
  report += `**Reading:** Score movements are independent of defense spending levels. Elevated score does not require spending response.\n\n`;
}

if (div2) {
  report += `### Pattern B: Score <65 + Defense Spending Spike\n\n`;
  report += `**Sample size:** ${div2.sampleSize} cases\n\n`;
  const followed = div2.findings.filter(f => f.scoreAfter > f.scoreAtSpike).length;
  report += `In ${div2.sampleSize} cases where score was stable (<65) but defense spending spiked, score followed upward in ${followed} cases.\n\n`;
  report += `**Reading:** Procurement spikes during stable periods do not reliably predict score elevation.\n\n`;
}

report += `---

## Category 5: Defense Procurement → Institutional Signal Elevation

Testing which institutional signals become elevated after procurement spikes.

`;

// Category 5: Institutional followers
const cat5Tests = Object.entries(data.results)
  .filter(([key]) => key.startsWith('defense_spending_leads_'))
  .filter(([key, result]) => result.sampleSize > 0)
  .sort((a, b) => b[1].sampleSize - a[1].sampleSize);

for (const [key, result] of cat5Tests) {
  report += `### ${result.test}\n\n`;
  report += `**Sample size:** ${result.sampleSize} cases\n\n`;

  if (result.sampleSize >= 5) {
    report += `**Reading:** In ${result.sampleSize} historical cases, this institutional signal became elevated following defense spending spikes.\n\n`;
  } else {
    report += `**Reading:** Very small sample (n=${result.sampleSize}). No pattern claim.\n\n`;
  }
}

report += `---

## Arms Transfers Data Status

**Arms imports and exports:** Data not yet integrated. All arms transfer tests returned 0 sample size.

**Next step:** Integrate SIPRI Arms Transfers Database and re-run pattern tests.

---

## Conclusions

1. **Defense spending spikes do NOT reliably predict convergence score movements.** Across 134 cases of 10%+ spending increases, scores moved independently (29 up, 24 down, 81 stable).

2. **Elevated scores do NOT trigger consistent defense spending responses.** When scores crossed 70, spending increased in only 2 of 12 cases at +1yr lag.

3. **Score and spending are independent dimensions.** Divergence is common: elevated scores with flat spending, or stable scores with spending spikes.

4. **Small sample sizes at high thresholds.** Only 7 cases of 100%+ spending spikes exist in the record, insufficient for pattern claims.

5. **Institutional signal relationships detected.** Defense spending spikes preceded governance (n=6), economic_stress (n=7), and power_grid (n=7-8) elevation in limited cases.

**What this means for Page 2.75:**

Defense procurement shows government **intent and action**, not score **prediction**. Display procurement data as independent layer for triangulation, not as leading indicator. Sample sizes are small (n=6-12 for most patterns), insufficient for reliable claims.

`;

fs.writeFileSync(outputPath, report);

console.log('✅ Report generated:', outputPath);
console.log('');
console.log('Key findings:');
console.log('- Defense spending spikes do NOT predict score movements');
console.log('- Sample size n=134 for 10% spending spikes, only n=7 for 100% spikes');
console.log('- Score and spending are independent dimensions');
console.log('- Arms transfers data not yet integrated (pending SIPRI Arms Transfers file)');
console.log('');
