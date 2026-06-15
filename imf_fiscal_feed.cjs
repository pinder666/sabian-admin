// imf_fiscal_feed.cjs
// IMF Data API — fiscal crisis early warning
// FREE, no key required
// Tracks: foreign reserves (months of import cover), inflation rate, current account balance
// Signal: reserves < 3 months = imminent fiscal insolvency → security breakdown
// Sudan 2022: reserves collapsed → 14 months later RSF offensive
// Venezuela: reserves to zero → Maduro security apparatus collapse

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');
const { resolveTableKey } = require('./resolve_table_key.cjs');

// IMF WEO country codes (ISO numeric)
const IMF_INDICATORS = {
  reserves: 'NGDPDPC',       // GDP per capita as proxy (reserves not always in WEO)
  inflation: 'PCPIPCH',      // CPI % change
  currentAccount: 'BCA_NGDPD', // Current account % GDP
  govDebt: 'GGXWDG_NGDP'    // Government gross debt % GDP
};

async function fetchImfScore(country, date) {
  const imfCode = await getImfCode(country);
  if (!imfCode) {
    return { source: 'IMF', country, conflict_score: null, warning: `No IMF code for ${country}` };
  }

  const targetYear = date ? new Date(date).getFullYear() : new Date().getFullYear();

  try {
    // IMF WEO API — World Economic Outlook data
    const indicators = ['PCPIPCH', 'BCA_NGDPD', 'GGXWDG_NGDP'];
    const results = {};

    await Promise.allSettled(
      indicators.map(async indicator => {
        const path = `/external/datamapper/api/v1/${indicator}/${imfCode}`;
        try {
          const raw = await fetchJson('www.imf.org', path);
          const values = raw?.values?.[indicator]?.[imfCode];
          if (values) {
            // Get latest available year and prior year
            const years = Object.keys(values).map(Number).sort((a,b) => b-a);
            const latestYear = years[0];
            const priorYear = years[1];
            results[indicator] = {
              latest: parseFloat(values[latestYear]),
              prior: priorYear ? parseFloat(values[priorYear]) : null,
              year: latestYear
            };
          }
        } catch (_) {}
      })
    );

    const inflation = results['PCPIPCH']?.latest;
    const currentAccount = results['BCA_NGDPD']?.latest;
    const govDebt = results['GGXWDG_NGDP']?.latest;

    if (inflation === undefined && currentAccount === undefined) {
      return { source: 'IMF', country, conflict_score: null, warning: 'No IMF data available' };
    }

    let score = 0;

    // Inflation component (0-40 points)
    // Hyperinflation = fiscal collapse signal
    if (inflation !== undefined && !isNaN(inflation)) {
      if (inflation >= 100) score += 40;       // hyperinflation
      else if (inflation >= 50) score += 30;
      else if (inflation >= 20) score += 20;
      else if (inflation >= 10) score += 12;
      else if (inflation >= 5)  score += 5;
    }

    // Current account deficit (0-30 points)
    // Severe deficit = import dependency crisis
    if (currentAccount !== undefined && !isNaN(currentAccount)) {
      if (currentAccount <= -15) score += 30;
      else if (currentAccount <= -10) score += 20;
      else if (currentAccount <= -5)  score += 12;
      else if (currentAccount <= -2)  score += 5;
    }

    // Government debt (0-30 points)
    // Debt > 100% GDP = fiscal trap
    if (govDebt !== undefined && !isNaN(govDebt)) {
      if (govDebt >= 150) score += 30;
      else if (govDebt >= 100) score += 20;
      else if (govDebt >= 70)  score += 10;
      else if (govDebt >= 50)  score += 4;
    }

    score = Math.min(100, score);

    const trend = inflation >= 50 ? 'hyperinflationary crisis' :
                  inflation >= 20 ? 'severe inflation' :
                  currentAccount <= -10 ? 'balance of payments crisis' :
                  govDebt >= 100 ? 'debt trap' :
                  score >= 30 ? 'fiscal stress' : 'manageable';

    logToHive({
      source: 'imf_fiscal_feed',
      level: 'intel',
      event: 'imf_scored',
      data: { country, inflation, currentAccount, govDebt, score },
      tags: ['imf', 'fiscal', country]
    });

    return {
      source: 'IMF',
      country,
      conflict_score: score,
      inflation_pct: inflation !== undefined ? parseFloat(inflation?.toFixed(1)) : null,
      current_account_pct_gdp: currentAccount !== undefined ? parseFloat(currentAccount?.toFixed(1)) : null,
      gov_debt_pct_gdp: govDebt !== undefined ? parseFloat(govDebt?.toFixed(1)) : null,
      trend,
      data_year: results['PCPIPCH']?.year || targetYear,
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'imf_fiscal_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['imf', 'error']
    });
    return { source: 'IMF', country, conflict_score: null, error: err.message };
  }
}

// IMF WEO uses ISO 2-letter codes
async function getImfCode(country) {
  const codes = {
    'Afghanistan': 'AFG', 'Albania': 'ALB', 'Algeria': 'DZA', 'Angola': 'AGO',
    'Argentina': 'ARG', 'Armenia': 'ARM', 'Australia': 'AUS', 'Austria': 'AUT',
    'Azerbaijan': 'AZE', 'Bahrain': 'BHR', 'Bangladesh': 'BGD', 'Belarus': 'BLR',
    'Belgium': 'BEL', 'Benin': 'BEN', 'Bolivia': 'BOL', 'Bosnia': 'BIH',
    'Botswana': 'BWA', 'Brazil': 'BRA', 'Bulgaria': 'BGR', 'Burkina Faso': 'BFA',
    'Burundi': 'BDI', 'Cambodia': 'KHM', 'Cameroon': 'CMR', 'CAR': 'CAF',
    'Chad': 'TCD', 'Chile': 'CHL', 'China': 'CHN', 'Colombia': 'COL',
    'Congo': 'COG', 'Costa Rica': 'CRI', 'Croatia': 'HRV', 'Cuba': 'CUB',
    'Cyprus': 'CYP', 'DRC': 'COD', 'Denmark': 'DNK', 'Djibouti': 'DJI',
    'Dominican Republic': 'DOM', 'Ecuador': 'ECU', 'Egypt': 'EGY',
    'El Salvador': 'SLV', 'Eritrea': 'ERI', 'Ethiopia': 'ETH', 'Fiji': 'FJI',
    'Finland': 'FIN', 'France': 'FRA', 'Gabon': 'GAB', 'Gambia': 'GMB',
    'Georgia': 'GEO', 'Germany': 'DEU', 'Ghana': 'GHA', 'Greece': 'GRC',
    'Guatemala': 'GTM', 'Guinea': 'GIN', 'Guinea-Bissau': 'GNB', 'Guyana': 'GUY',
    'Haiti': 'HTI', 'Honduras': 'HND', 'Hungary': 'HUN', 'India': 'IND',
    'Indonesia': 'IDN', 'Iran': 'IRN', 'Iraq': 'IRQ', 'Israel': 'ISR',
    'Italy': 'ITA', 'Ivory Coast': 'CIV', 'Jamaica': 'JAM', 'Japan': 'JPN',
    'Jordan': 'JOR', 'Kazakhstan': 'KAZ', 'Kenya': 'KEN', 'Kuwait': 'KWT',
    'Kyrgyzstan': 'KGZ', 'Laos': 'LAO', 'Lebanon': 'LBN', 'Liberia': 'LBR',
    'Libya': 'LBY', 'Malawi': 'MWI', 'Malaysia': 'MYS', 'Mali': 'MLI',
    'Mauritania': 'MRT', 'Mexico': 'MEX', 'Moldova': 'MDA', 'Mongolia': 'MNG',
    'Montenegro': 'MNE', 'Morocco': 'MAR', 'Mozambique': 'MOZ', 'Myanmar': 'MMR',
    'Namibia': 'NAM', 'Nepal': 'NPL', 'Netherlands': 'NLD', 'New Zealand': 'NZL',
    'Nicaragua': 'NIC', 'Niger': 'NER', 'Nigeria': 'NGA', 'North Korea': 'PRK',
    'North Macedonia': 'MKD', 'Norway': 'NOR', 'Oman': 'OMN', 'Pakistan': 'PAK',
    'Palestine': 'PSE', 'Panama': 'PAN', 'Papua New Guinea': 'PNG', 'Paraguay': 'PRY',
    'Peru': 'PER', 'Philippines': 'PHL', 'Poland': 'POL', 'Portugal': 'PRT',
    'Qatar': 'QAT', 'Romania': 'ROU', 'Russia': 'RUS', 'Rwanda': 'RWA',
    'Saudi Arabia': 'SAU', 'Senegal': 'SEN', 'Serbia': 'SRB', 'Sierra Leone': 'SLE',
    'Somalia': 'SOM', 'South Africa': 'ZAF', 'South Korea': 'KOR',
    'South Sudan': 'SSD', 'Spain': 'ESP', 'Sri Lanka': 'LKA', 'Sudan': 'SDN',
    'Suriname': 'SUR', 'Sweden': 'SWE', 'Switzerland': 'CHE', 'Syria': 'SYR',
    'Taiwan': 'TWN', 'Tajikistan': 'TJK', 'Tanzania': 'TZA', 'Thailand': 'THA',
    'Timor-Leste': 'TLS', 'Togo': 'TGO', 'Trinidad and Tobago': 'TTO',
    'Tunisia': 'TUN', 'Turkey': 'TUR', 'Turkmenistan': 'TKM', 'UAE': 'ARE',
    'Uganda': 'UGA', 'UK': 'GBR', 'Ukraine': 'UKR', 'Uruguay': 'URY',
    'Uzbekistan': 'UZB', 'Venezuela': 'VEN', 'Vietnam': 'VNM',
    'Yemen': 'YEM', 'Zambia': 'ZMB', 'Zimbabwe': 'ZWE'
  };
  const { value } = await resolveTableKey(country, codes);
  return value;
}

function fetchJson(hostname, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode !== 200) { reject(new Error(`IMF HTTP ${res.statusCode}`)); return; }
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('IMF timeout')); });
    req.end();
  });
}

module.exports = fetchImfScore;

if (require.main === module) {
  const country = process.argv[2] || 'Venezuela';
  fetchImfScore(country)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(console.error);
}
