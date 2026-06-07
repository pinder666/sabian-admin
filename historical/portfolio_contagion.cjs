// historical/portfolio_contagion.cjs
// Portfolio Contagion Analysis — Correlated exposures and contagion pathways
// Answers: "If Country A falls, who follows? What's my total exposure?"
//
// Key concepts:
// - Correlated exposures: Which portfolio countries move together
// - Contagion pathways: Historical lag from A to B when A entered CRITICAL
// - Aggregate exposure: Portfolio-weighted exposure to active patterns

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CRITICAL = 85;
const ELEVATED = 75;

// ── Load all historical scores ────────────────────────────────────────────────

let _scoresCache = null;

async function loadAllScores() {
  if (_scoresCache) return _scoresCache;

  const all = [];
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('historical_convergence_scores')
      .select('country,year,score')
      .order('country').order('year')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) all.push(r);
    if (data.length < 1000) break;
    page++;
  }
  _scoresCache = all;
  return all;
}

function buildCountryTimelines(scores) {
  const timelines = {};
  for (const r of scores) {
    if (!timelines[r.country]) timelines[r.country] = {};
    timelines[r.country][r.year] = r.score;
  }
  return timelines;
}

// ── Calculate pairwise correlation ────────────────────────────────────────────

function calculateCorrelation(series1, series2) {
  // Find overlapping years
  const years = Object.keys(series1).filter(y => series2[y] !== undefined);
  if (years.length < 5) return null;

  const vals1 = years.map(y => series1[y]);
  const vals2 = years.map(y => series2[y]);

  const mean1 = vals1.reduce((a, b) => a + b, 0) / vals1.length;
  const mean2 = vals2.reduce((a, b) => a + b, 0) / vals2.length;

  let cov = 0, var1 = 0, var2 = 0;
  for (let i = 0; i < vals1.length; i++) {
    const d1 = vals1[i] - mean1;
    const d2 = vals2[i] - mean2;
    cov += d1 * d2;
    var1 += d1 * d1;
    var2 += d2 * d2;
  }

  if (var1 === 0 || var2 === 0) return null;
  return cov / Math.sqrt(var1 * var2);
}

// ── Calculate contagion lag ───────────────────────────────────────────────────
// When country A entered CRITICAL, how long until country B followed?

function calculateContagionLag(timelineA, timelineB) {
  const yearsA = Object.keys(timelineA).map(Number).sort((a, b) => a - b);
  const yearsB = Object.keys(timelineB).map(Number).sort((a, b) => a - b);

  const lags = [];

  // Find years when A entered CRITICAL
  for (let i = 1; i < yearsA.length; i++) {
    const prevScore = timelineA[yearsA[i - 1]];
    const currScore = timelineA[yearsA[i]];

    if (prevScore < CRITICAL && currScore >= CRITICAL) {
      // A entered CRITICAL in year yearsA[i]
      const aCrisisYear = yearsA[i];

      // Find when B entered CRITICAL after this
      for (let j = 0; j < yearsB.length; j++) {
        if (yearsB[j] <= aCrisisYear) continue;

        const bPrevScore = j > 0 ? timelineB[yearsB[j - 1]] : 0;
        const bCurrScore = timelineB[yearsB[j]];

        if (bPrevScore < CRITICAL && bCurrScore >= CRITICAL) {
          const bCrisisYear = yearsB[j];
          const lag = bCrisisYear - aCrisisYear;
          if (lag <= 10) { // Only count if within 10 years
            lags.push({
              aCrisisYear,
              bCrisisYear,
              lagYears: lag
            });
          }
          break; // Only count first B crisis after each A crisis
        }
      }
    }
  }

  if (lags.length === 0) return null;

  const avgLag = lags.reduce((a, b) => a + b.lagYears, 0) / lags.length;
  return {
    instances: lags.length,
    averageLagYears: avgLag.toFixed(1),
    averageLagMonths: Math.round(avgLag * 12),
    details: lags
  };
}

// ── Portfolio correlation matrix ──────────────────────────────────────────────

async function calculatePortfolioCorrelations(countries) {
  const scores = await loadAllScores();
  const timelines = buildCountryTimelines(scores);

  const matrix = {};
  const pairs = [];

  for (let i = 0; i < countries.length; i++) {
    const countryA = countries[i];
    matrix[countryA] = {};

    for (let j = 0; j < countries.length; j++) {
      const countryB = countries[j];

      if (i === j) {
        matrix[countryA][countryB] = 1.0;
        continue;
      }

      const timelineA = timelines[countryA];
      const timelineB = timelines[countryB];

      if (!timelineA || !timelineB) {
        matrix[countryA][countryB] = null;
        continue;
      }

      const corr = calculateCorrelation(timelineA, timelineB);
      matrix[countryA][countryB] = corr ? parseFloat(corr.toFixed(3)) : null;

      if (i < j && corr !== null) {
        pairs.push({
          countryA,
          countryB,
          correlation: parseFloat(corr.toFixed(3))
        });
      }
    }
  }

  // Sort pairs by absolute correlation
  pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  return {
    countries,
    matrix,
    highlyCorrelated: pairs.filter(p => Math.abs(p.correlation) >= 0.7),
    antiCorrelated: pairs.filter(p => p.correlation <= -0.5),
    uncorrelated: pairs.filter(p => Math.abs(p.correlation) < 0.3)
  };
}

// ── Contagion pathways ────────────────────────────────────────────────────────

async function identifyContagionPathways(sourceCountry, targetCountries = null) {
  const scores = await loadAllScores();
  const timelines = buildCountryTimelines(scores);
  const sourceTimeline = timelines[sourceCountry];

  if (!sourceTimeline) {
    throw new Error(`No data for source country: ${sourceCountry}`);
  }

  const targets = targetCountries || Object.keys(timelines).filter(c => c !== sourceCountry);
  const pathways = [];

  for (const target of targets) {
    if (target === sourceCountry) continue;

    const targetTimeline = timelines[target];
    if (!targetTimeline) continue;

    const lag = calculateContagionLag(sourceTimeline, targetTimeline);
    if (lag) {
      pathways.push({
        from: sourceCountry,
        to: target,
        ...lag
      });
    }
  }

  // Sort by average lag (shortest first = most immediate contagion risk)
  pathways.sort((a, b) => parseFloat(a.averageLagYears) - parseFloat(b.averageLagYears));

  return {
    sourceCountry,
    contagionPathways: pathways,
    immediateRisk: pathways.filter(p => parseFloat(p.averageLagYears) <= 2),
    mediumTermRisk: pathways.filter(p => parseFloat(p.averageLagYears) > 2 && parseFloat(p.averageLagYears) <= 5),
    totalTargetsAtRisk: pathways.length
  };
}

// ── Build full contagion matrix ───────────────────────────────────────────────
// Pre-compute all country-pair lag times

async function buildContagionMatrix() {
  const scores = await loadAllScores();
  const timelines = buildCountryTimelines(scores);
  const countries = Object.keys(timelines);

  console.log(`[CONTAGION] Building matrix for ${countries.length} countries...`);

  const matrix = [];
  let processed = 0;

  for (const countryA of countries) {
    for (const countryB of countries) {
      if (countryA === countryB) continue;

      const lag = calculateContagionLag(timelines[countryA], timelines[countryB]);
      if (lag) {
        matrix.push({
          source_country: countryA,
          target_country: countryB,
          instances: lag.instances,
          avg_lag_years: parseFloat(lag.averageLagYears),
          avg_lag_months: lag.averageLagMonths
        });
      }

      processed++;
      if (processed % 1000 === 0) {
        console.log(`[CONTAGION] Processed ${processed} pairs...`);
      }
    }
  }

  console.log(`[CONTAGION] Found ${matrix.length} contagion pathways`);
  return matrix;
}

// ── Aggregate portfolio exposure ──────────────────────────────────────────────

async function calculateAggregateExposure(countries) {
  const scores = await loadAllScores();
  const timelines = buildCountryTimelines(scores);

  // Get current state for each country
  const currentStates = [];
  for (const country of countries) {
    const timeline = timelines[country];
    if (!timeline) continue;

    const years = Object.keys(timeline).map(Number).sort((a, b) => b - a);
    const currentYear = years[0];
    const currentScore = timeline[currentYear];

    currentStates.push({
      country,
      year: currentYear,
      score: currentScore,
      band: currentScore >= CRITICAL ? 'CRITICAL' :
            currentScore >= ELEVATED ? 'ELEVATED' :
            currentScore >= 65 ? 'STRESSED' : 'STABLE'
    });
  }

  // Calculate exposure metrics
  const criticalCount = currentStates.filter(s => s.band === 'CRITICAL').length;
  const elevatedCount = currentStates.filter(s => s.band === 'ELEVATED').length;
  const avgScore = currentStates.reduce((a, b) => a + b.score, 0) / currentStates.length;

  // Get correlations to identify clustered risk
  const correlations = await calculatePortfolioCorrelations(countries);
  const highlyCorrelatedPairs = correlations.highlyCorrelated.length;

  // Risk assessment
  let riskLevel = 'LOW';
  let riskFactors = [];

  if (criticalCount > 0) {
    riskLevel = 'CRITICAL';
    riskFactors.push(`${criticalCount} country(s) in CRITICAL band`);
  } else if (elevatedCount > 0) {
    riskLevel = 'ELEVATED';
    riskFactors.push(`${elevatedCount} country(s) in ELEVATED band`);
  }

  if (highlyCorrelatedPairs >= countries.length * 0.3) {
    if (riskLevel !== 'CRITICAL') riskLevel = 'ELEVATED';
    riskFactors.push(`${highlyCorrelatedPairs} highly correlated pairs — clustered risk`);
  }

  if (avgScore >= 70) {
    if (riskLevel === 'LOW') riskLevel = 'MODERATE';
    riskFactors.push(`Average score ${avgScore.toFixed(1)} — portfolio-wide stress`);
  }

  return {
    portfolioSize: countries.length,
    countries: currentStates,
    aggregateMetrics: {
      averageScore: avgScore.toFixed(1),
      criticalCount,
      elevatedCount,
      highlyCorrelatedPairs
    },
    riskAssessment: {
      level: riskLevel,
      factors: riskFactors
    },
    correlationSummary: {
      highlyCorrelated: correlations.highlyCorrelated.slice(0, 5),
      antiCorrelated: correlations.antiCorrelated.slice(0, 3)
    }
  };
}

// ── Full portfolio analysis ───────────────────────────────────────────────────

async function analyzePortfolio(countries) {
  console.log(`[PORTFOLIO] Analyzing ${countries.length} countries...`);

  const [correlations, exposure] = await Promise.all([
    calculatePortfolioCorrelations(countries),
    calculateAggregateExposure(countries)
  ]);

  // Get contagion pathways for critical/elevated countries
  const atRiskCountries = exposure.countries.filter(c => c.band === 'CRITICAL' || c.band === 'ELEVATED');
  const contagionRisks = [];

  for (const country of atRiskCountries) {
    const pathways = await identifyContagionPathways(country.country, countries);
    if (pathways.immediateRisk.length > 0) {
      contagionRisks.push({
        source: country.country,
        sourceBand: country.band,
        immediateTargets: pathways.immediateRisk.map(p => ({
          country: p.to,
          lagMonths: p.averageLagMonths
        }))
      });
    }
  }

  return {
    asOfDate: new Date().toISOString(),
    portfolioSize: countries.length,
    exposure,
    correlations: {
      highlyCorrelated: correlations.highlyCorrelated,
      antiCorrelated: correlations.antiCorrelated
    },
    contagionRisks,
    recommendations: generatePortfolioRecommendations(exposure, correlations, contagionRisks)
  };
}

function generatePortfolioRecommendations(exposure, correlations, contagionRisks) {
  const recommendations = [];

  if (exposure.riskAssessment.level === 'CRITICAL') {
    recommendations.push({
      priority: 'CRITICAL',
      action: 'Immediate review required',
      detail: `${exposure.aggregateMetrics.criticalCount} portfolio country(s) in CRITICAL band`
    });
  }

  if (contagionRisks.length > 0) {
    const immediateTargets = contagionRisks.flatMap(r => r.immediateTargets);
    recommendations.push({
      priority: 'HIGH',
      action: 'Monitor contagion pathway',
      detail: `${immediateTargets.length} countries at immediate contagion risk from CRITICAL/ELEVATED positions`
    });
  }

  if (correlations.highlyCorrelated.length >= 3) {
    recommendations.push({
      priority: 'MEDIUM',
      action: 'Diversification review',
      detail: `${correlations.highlyCorrelated.length} highly correlated pairs — concentrated risk`
    });
  }

  if (correlations.antiCorrelated.length > 0) {
    recommendations.push({
      priority: 'INFO',
      action: 'Natural hedge identified',
      detail: `${correlations.antiCorrelated.length} anti-correlated pair(s) provide portfolio diversification`
    });
  }

  return recommendations;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  calculatePortfolioCorrelations,
  identifyContagionPathways,
  buildContagionMatrix,
  calculateAggregateExposure,
  analyzePortfolio
};

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const countries = process.argv.slice(2);
  if (countries.length === 0) {
    console.log('Usage: node portfolio_contagion.cjs Country1 Country2 Country3 ...');
    console.log('Example: node portfolio_contagion.cjs Turkey Brazil Argentina Mexico');
    process.exit(1);
  }

  analyzePortfolio(countries)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('ERROR:', err.message);
      process.exit(1);
    });
}
