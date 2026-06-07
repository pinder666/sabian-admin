// usda_food_feed.cjs
// Food supply signal — WFP/FAO static baseline
// Score 0–100: higher = structural food supply deficit or import dependency

require('dotenv').config({ path: './.env' });
const { logToHive } = require('./logger.cjs');

const FOOD_BASELINE = {
  'Somalia': 88, 'South Sudan': 90, 'Yemen': 85, 'Haiti': 82,
  'CAR': 80, 'Afghanistan': 78, 'DRC': 75, 'Syria': 72,
  'Burkina Faso': 70, 'Niger': 72, 'Mali': 68, 'Chad': 68,
  'Eritrea': 65, 'Sudan': 65, 'Ethiopia': 58, 'Liberia': 58,
  'Sierra Leone': 55, 'Malawi': 55, 'Mozambique': 52,
  'Burundi': 60, 'Rwanda': 45, 'Uganda': 42, 'Tanzania': 40,
  'Zimbabwe': 52, 'Zambia': 45, 'Lebanon': 62, 'Egypt': 45,
  'Jordan': 42, 'Bangladesh': 38, 'Pakistan': 42, 'Myanmar': 38,
  'Cambodia': 35, 'Laos': 35, 'Nepal': 40, 'Nigeria': 48,
  'Kenya': 42, 'Madagascar': 55, 'Mauritania': 55, 'Senegal': 42,
  'Ghana': 35, 'Cameroon': 38, 'Angola': 42,
  'Venezuela': 55, 'Bolivia': 35, 'Honduras': 42, 'Guatemala': 40,
  'Nicaragua': 38, 'Cuba': 45, 'Iraq': 38, 'Iran': 30,
  'Libya': 40, 'Tunisia': 30, 'Morocco': 30, 'Algeria': 28,
  'Russia': 15, 'Ukraine': 12, 'India': 35, 'China': 20,
  'Brazil': 15, 'Argentina': 10, 'Australia': 5, 'Thailand': 18,
  'Vietnam': 20, 'Indonesia': 28, 'Philippines': 32, 'Sri Lanka': 35,
  'Tajikistan': 45, 'Uzbekistan': 35, 'Kyrgyzstan': 38, 'Turkmenistan': 30,
  'Kazakhstan': 18, 'Turkey': 20, 'Mexico': 25, 'Colombia': 22,
  'Peru': 28, 'Ecuador': 25, 'South Africa': 28,
  'Saudi Arabia': 38, 'Ivory Coast': 32,
};

async function fetchUsdaFoodData(country) {
  try {
    const score = FOOD_BASELINE[country] ?? 20;
    return {
      score,
      source: 'WFP_FAO_baseline',
      trend: score >= 65 ? 'acute_food_risk' : score >= 40 ? 'stressed' : 'adequate',
    };
  } catch (err) {
    logToHive({ source: 'usda_food_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { score: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchUsdaFoodData };
