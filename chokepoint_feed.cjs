// chokepoint_feed.cjs
// Chokepoint Proximity Signal — geographic risk multiplier for maritime chokepoints
// Score 0–100: higher = country controls or sits astride a critical global chokepoint
// Logic: instability in a chokepoint country amplifies global supply chain risk.
//   A score of 0 means no chokepoint relevance.
//   A score of 100 means the country IS the chokepoint (e.g. Egypt = Suez Canal).
// This signal does NOT measure instability itself — it measures STRATEGIC LEVERAGE.
// Combined with a high convergence score, a high chokepoint score = global emergency.
// Cadence: static (geographic reality doesn't change) — 8760h window (annual review)

// Major global maritime chokepoints with controlling/proximate countries
// proximity_score: how much leverage the country has over this chokepoint
// 100 = sole controller, 60 = shared access, 30 = proximate/flanking
const CHOKEPOINTS = [
  {
    name: 'Strait of Hormuz',
    lat: 26.6, lon: 56.3,
    description: '20% of global oil supply. Iran + UAE + Oman control access.',
    countries: { 'Iran': 95, 'UAE': 75, 'Oman': 70, 'Qatar': 45, 'Saudi Arabia': 35 }
  },
  {
    name: 'Suez Canal',
    lat: 30.5, lon: 32.3,
    description: '12% of global trade. Egypt controls entirely.',
    countries: { 'Egypt': 100, 'Israel': 35, 'Libya': 20, 'Jordan': 15 }
  },
  {
    name: 'Strait of Malacca',
    lat: 2.5, lon: 101.0,
    description: '40% of global trade. Singapore/Malaysia/Indonesia share control.',
    countries: { 'Singapore': 85, 'Malaysia': 80, 'Indonesia': 75, 'Thailand': 25, 'Myanmar': 20 }
  },
  {
    name: 'Bab-el-Mandeb',
    lat: 12.5, lon: 43.4,
    description: 'Red Sea access. Yemen/Djibouti/Eritrea control. Houthi threat active.',
    countries: { 'Yemen': 90, 'Djibouti': 80, 'Eritrea': 65, 'Somalia': 30, 'Ethiopia': 20 }
  },
  {
    name: 'Turkish Straits (Bosphorus/Dardanelles)',
    lat: 41.1, lon: 29.0,
    description: 'Black Sea access. Turkey controls entirely under Montreux Convention.',
    countries: { 'Turkey': 100, 'Bulgaria': 20, 'Romania': 15, 'Ukraine': 30, 'Russia': 40 }
  },
  {
    name: 'Strait of Gibraltar',
    lat: 35.9, lon: -5.4,
    description: 'Atlantic–Mediterranean gateway. Morocco + Spain flank.',
    countries: { 'Morocco': 65, 'Spain': 60, 'Algeria': 20, 'Portugal': 15 }
  },
  {
    name: 'Panama Canal',
    lat: 9.1, lon: -79.7,
    description: '5% of global trade. Panama controls entirely.',
    countries: { 'Panama': 100, 'Colombia': 25, 'Costa Rica': 15 }
  },
  {
    name: 'Luzon Strait',
    lat: 20.0, lon: 121.5,
    description: 'South China Sea access. Taiwan/Philippines flank.',
    countries: { 'Taiwan': 80, 'Philippines': 75, 'China': 55 }
  },
  {
    name: 'Lombok Strait',
    lat: -8.7, lon: 115.7,
    description: 'Alternative to Malacca for deep-draft vessels.',
    countries: { 'Indonesia': 90 }
  },
  {
    name: 'Danish Straits',
    lat: 56.0, lon: 10.5,
    description: 'Baltic Sea access. Denmark controls.',
    countries: { 'Denmark': 90, 'Sweden': 60, 'Norway': 30 }
  }
];

async function fetchChokepointData(country) {
  let maxScore = 0;
  const relevant = [];

  for (const cp of CHOKEPOINTS) {
    const score = cp.countries[country];
    if (score !== undefined) {
      relevant.push({ chokepoint: cp.name, score, description: cp.description });
      if (score > maxScore) maxScore = score;
    }
  }

  if (relevant.length === 0) {
    return { score: 0, chokepoints: [], reason: 'no_chokepoint_relevance' };
  }

  // If country controls multiple chokepoints, add bonus (rare — Indonesia, Turkey)
  const multiBonus = relevant.length >= 2 ? 10 : 0;
  const score = Math.min(100, maxScore + multiBonus);

  return {
    score,
    chokepoints: relevant,
    primary: relevant.sort((a, b) => b.score - a.score)[0].chokepoint,
    chokepoint_count: relevant.length
  };
}

module.exports = { fetchChokepointData };
