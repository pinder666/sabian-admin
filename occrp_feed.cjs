// occrp_feed.cjs
// Corruption & Illicit Finance Signal — state capture, kleptocracy, sanctions evasion
// Source: OCCRP Aleph (public search API) + Transparency International CPI
// Score 0–100: higher = greater corruption risk / illicit finance exposure
// Logic: Corruption is a structural multiplier — it weakens institutions, erodes
//   food/health/security delivery, and creates conditions for state capture.
//   TI CPI is the most cited corruption index. OCCRP Aleph adds entity-level
//   exposure (oligarchs, shell companies, sanctioned entities by country).
// Cadence: annual (TI CPI, January) + Aleph checks on-demand

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// Transparency International CPI 2024 (scale: 0=most corrupt, 100=least corrupt)
// We invert to 0–100 risk score: corruption_risk = 100 - CPI
// Source: TI CPI 2024 report (January 2025 release)
const TI_CPI_2024 = {
  // Clean (CPI 70-100) — low corruption risk
  'Denmark': 90, 'Finland': 87, 'New Zealand': 87, 'Norway': 84,
  'Sweden': 82, 'Singapore': 84, 'Switzerland': 82, 'Netherlands': 79,
  'Luxembourg': 78, 'Germany': 75, 'Ireland': 77, 'Australia': 75,
  'Canada': 74, 'UK': 71, 'Austria': 71, 'Belgium': 72,
  'Iceland': 72, 'Japan': 73, 'Estonia': 76, 'France': 68,
  'Uruguay': 73, 'Chile': 66, 'Qatar': 58, 'UAE': 68,
  'Israel': 62, 'Bhutan': 68, 'Taiwan': 67, 'South Korea': 63,
  // Moderate (CPI 40–70)
  'Portugal': 62, 'Spain': 60, 'Italy': 56, 'Poland': 54,
  'Czech Republic': 54, 'Lithuania': 60, 'Latvia': 55, 'Slovakia': 50,
  'Hungary': 42, 'Bulgaria': 45, 'Romania': 46, 'Croatia': 50,
  'Greece': 49, 'Cyprus': 56, 'Malta': 51, 'North Macedonia': 39,
  'Serbia': 38, 'Montenegro': 45, 'Albania': 38, 'Bosnia': 35,
  'Kosovo': 38, 'Moldova': 38, 'Georgia': 54, 'Armenia': 46,
  'Kazakhstan': 38, 'Uzbekistan': 33, 'Belarus': 42,
  'Saudi Arabia': 57, 'Jordan': 48, 'Kuwait': 47, 'Bahrain': 46,
  'Oman': 52, 'Morocco': 38, 'Tunisia': 40, 'Algeria': 36,
  'Egypt': 35, 'South Africa': 41, 'Namibia': 49, 'Botswana': 59,
  'Ghana': 41, 'Senegal': 42, 'Ivory Coast': 40, 'Rwanda': 54,
  'Tanzania': 37, 'Kenya': 35, 'Ethiopia': 38, 'Zambia': 34,
  'Argentina': 38, 'Brazil': 36, 'Colombia': 37, 'Ecuador': 34,
  'Peru': 36, 'Bolivia': 31, 'Mexico': 31, 'Panama': 36,
  'Costa Rica': 55, 'Cuba': 47, 'Guyana': 39,
  'India': 38, 'Sri Lanka': 34, 'Nepal': 35, 'Bangladesh': 24,
  'Vietnam': 40, 'Indonesia': 38, 'Philippines': 34, 'Thailand': 35,
  'Malaysia': 48, 'Mongolia': 33, 'Pakistan': 29, 'China': 42,
  'Turkey': 36, 'Iran': 28, 'Lebanon': 24, 'Iraq': 22,
  // Corrupt (CPI < 40)
  'Russia': 26, 'Azerbaijan': 26, 'Kyrgyzstan': 26, 'Tajikistan': 20,
  'Turkmenistan': 18, 'Uganda': 26, 'Nigeria': 25, 'Cameroon': 26,
  'Angola': 29, 'Mozambique': 26, 'Zimbabwe': 23, 'DRC': 20,
  'Malawi': 31, 'Madagascar': 26, 'Guinea': 26, 'Guinea-Bissau': 20,
  'Togo': 30, 'Benin': 43, 'Burkina Faso': 24, 'Mali': 28,
  'Niger': 28, 'Chad': 20, 'Mauritania': 28, 'CAR': 18,
  'DRC': 20, 'Congo': 21, 'Gabon': 27, 'Equatorial Guinea': 17,
  'Burundi': 22, 'Rwanda': 54, 'Sierra Leone': 32, 'Liberia': 32,
  'Eritrea': 22, 'South Sudan': 13, 'Somalia': 11, 'Sudan': 20,
  'Libya': 18, 'Syria': 13, 'Yemen': 16, 'Afghanistan': 20,
  'Myanmar': 20, 'North Korea': 17, 'Laos': 29, 'Cambodia': 24,
  'Haiti': 17, 'Venezuela': 13, 'Nicaragua': 17, 'Honduras': 23,
  'Guatemala': 23, 'El Salvador': 31, 'Paraguay': 28,
  'Ukraine': 35
};

function fetchAlephSearch(countryName) {
  return new Promise((resolve) => {
    const query = encodeURIComponent(`"${countryName}"`);
    const url = `https://aleph.occrp.org/api/2/entities?q=${query}&filter:schema=Company&filter:schema=Person&filter:countries=${countryName.toLowerCase()}&limit=5`;
    https.get(url, {
      headers: { 'User-Agent': 'SabianIntelligence/3.0' },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

async function fetchOccrpData(country) {
  try {
    const cpi = TI_CPI_2024[country];
    if (cpi === undefined) return { score: 40, reason: 'no_cpi_data', trend: 'stable' };

    // Base corruption risk score
    let score = 100 - cpi;

    // Try OCCRP Aleph for entity exposure count (enhances score for known corrupt states)
    const alephData = await fetchAlephSearch(country);
    if (alephData && alephData.total && alephData.total.value > 0) {
      const entityCount = alephData.total.value;
      // High entity count in Aleph = known illicit finance exposure
      const alephBonus = Math.min(15, Math.round(Math.log10(entityCount + 1) * 5));
      score = Math.min(100, score + alephBonus);
    }

    return {
      score,
      ti_cpi_2024:      cpi,
      corruption_risk:  score,
      source:           'TI_CPI_2024_OCCRP_Aleph',
      trend: score >= 70 ? 'highly_corrupt' :
             score >= 50 ? 'corrupt' :
             score >= 30 ? 'moderate' : 'clean'
    };

  } catch (err) {
    logToHive({ source: 'occrp_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { score: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchOccrpData };
