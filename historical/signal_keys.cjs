// historical/signal_keys.cjs
// Central signal key registry — all pipeline scripts import from here
// Updated 2026-05-25: Added behavioral signals (night_lights, diaspora_remittance, food_stress)

// Original 12 signals (institutional/structural)
const INSTITUTIONAL_SIGNALS = [
  'displacement',
  'gdelt_conflict',
  'gdelt_tone',
  'seismic_risk',
  'fire_hotspot',
  'governance',
  'economic_stress',
  'capital_flows',
  'trade_collapse',
  'power_grid',
  'imf_fiscal',
  'vdem_governance'
];

// New behavioral signals (unengineered human behavior)
const BEHAVIORAL_SIGNALS = [
  'night_lights',        // Satellite luminosity — economic activity from space
  'diaspora_remittance', // Remittance flows — diaspora behavior
  'food_stress'          // Food prices — survival economics
];

// Combined 15-signal set
const SIGNAL_KEYS = [...INSTITUTIONAL_SIGNALS, ...BEHAVIORAL_SIGNALS];

// Signal metadata for interpretation
const SIGNAL_META = {
  displacement:        { tier: 1, category: 'humanitarian', invert: false },
  gdelt_conflict:      { tier: 1, category: 'conflict', invert: false },
  gdelt_tone:          { tier: 2, category: 'sentiment', invert: true }, // Lower tone = worse
  seismic_risk:        { tier: 2, category: 'natural', invert: false },
  fire_hotspot:        { tier: 2, category: 'natural', invert: false },
  governance:          { tier: 1, category: 'institutional', invert: true }, // Higher = better
  economic_stress:     { tier: 1, category: 'economic', invert: false },
  capital_flows:       { tier: 1, category: 'economic', invert: false },
  trade_collapse:      { tier: 2, category: 'economic', invert: false },
  power_grid:          { tier: 2, category: 'infrastructure', invert: false },
  imf_fiscal:          { tier: 1, category: 'economic', invert: false },
  vdem_governance:     { tier: 2, category: 'institutional', invert: true }, // Higher = better
  night_lights:        { tier: 1, category: 'behavioral', invert: true }, // Lower lights = worse
  diaspora_remittance: { tier: 1, category: 'behavioral', invert: false }, // Complex — spike or drop both signals
  food_stress:         { tier: 1, category: 'behavioral', invert: false }
};

// Tier weights for convergence scoring
const TIER_WEIGHTS = {
  1: 1.0,  // Primary signals
  2: 0.6   // Secondary signals
};

module.exports = {
  SIGNAL_KEYS,
  INSTITUTIONAL_SIGNALS,
  BEHAVIORAL_SIGNALS,
  SIGNAL_META,
  TIER_WEIGHTS
};
