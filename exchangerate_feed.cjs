// exchangerate_feed.cjs
// Currency Collapse Signal — Alpha Vantage FX monthly data
// Score 0–100: higher = greater currency stress (depreciation vs USD over 12 months)
// Cadence: weekly (168h) — currency moves are slow-burn signals

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');
const { resolveTableKey } = require('./resolve_table_key.cjs');

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// Country → ISO 4217 currency code
const COUNTRY_CURRENCY = {
  'Afghanistan': 'AFN', 'Albania': 'ALL', 'Algeria': 'DZD', 'Angola': 'AOA',
  'Argentina': 'ARS', 'Armenia': 'AMD', 'Australia': 'AUD', 'Azerbaijan': 'AZN',
  'Bahrain': 'BHD', 'Bangladesh': 'BDT', 'Belarus': 'BYN', 'Bolivia': 'BOB',
  'Bosnia': 'BAM', 'Brazil': 'BRL', 'Bulgaria': 'BGN', 'Burkina Faso': 'XOF',
  'Burundi': 'BIF', 'Cambodia': 'KHR', 'Cameroon': 'XAF', 'CAR': 'XAF',
  'Chad': 'XAF', 'Chile': 'CLP', 'China': 'CNY', 'Colombia': 'COP',
  'Congo': 'XAF', 'Costa Rica': 'CRC', 'Croatia': 'EUR', 'Cuba': 'CUP',
  'DRC': 'CDF', 'Dominican Republic': 'DOP', 'Ecuador': 'USD', 'Egypt': 'EGP',
  'El Salvador': 'USD', 'Ethiopia': 'ETB', 'Fiji': 'FJD', 'France': 'EUR',
  'Gabon': 'XAF', 'Georgia': 'GEL', 'Germany': 'EUR', 'Ghana': 'GHS',
  'Greece': 'EUR', 'Guatemala': 'GTQ', 'Guinea': 'GNF', 'Haiti': 'HTG',
  'Honduras': 'HNL', 'Hungary': 'HUF', 'India': 'INR', 'Indonesia': 'IDR',
  'Iran': 'IRR', 'Iraq': 'IQD', 'Israel': 'ILS', 'Ivory Coast': 'XOF',
  'Jamaica': 'JMD', 'Japan': 'JPY', 'Jordan': 'JOD', 'Kazakhstan': 'KZT',
  'Kenya': 'KES', 'Kuwait': 'KWD', 'Kyrgyzstan': 'KGS', 'Laos': 'LAK',
  'Lebanon': 'LBP', 'Libya': 'LYD', 'Malawi': 'MWK', 'Malaysia': 'MYR',
  'Mali': 'XOF', 'Mauritania': 'MRU', 'Mexico': 'MXN', 'Moldova': 'MDL',
  'Mongolia': 'MNT', 'Morocco': 'MAD', 'Mozambique': 'MZN', 'Myanmar': 'MMK',
  'Nepal': 'NPR', 'Nicaragua': 'NIO', 'Niger': 'XOF', 'Nigeria': 'NGN',
  'North Korea': 'KPW', 'Pakistan': 'PKR', 'Palestine': 'ILS', 'Panama': 'USD',
  'Paraguay': 'PYG', 'Peru': 'PEN', 'Philippines': 'PHP', 'Poland': 'PLN',
  'Romania': 'RON', 'Russia': 'RUB', 'Rwanda': 'RWF', 'Saudi Arabia': 'SAR',
  'Senegal': 'XOF', 'Serbia': 'RSD', 'Sierra Leone': 'SLL', 'Somalia': 'SOS',
  'South Africa': 'ZAR', 'South Korea': 'KRW', 'South Sudan': 'SSP',
  'Spain': 'EUR', 'Sri Lanka': 'LKR', 'Sudan': 'SDG', 'Syria': 'SYP',
  'Taiwan': 'TWD', 'Tajikistan': 'TJS', 'Tanzania': 'TZS', 'Thailand': 'THB',
  'Togo': 'XOF', 'Tunisia': 'TND', 'Turkey': 'TRY', 'Turkmenistan': 'TMT',
  'UAE': 'AED', 'Uganda': 'UGX', 'Ukraine': 'UAH', 'United States': 'USD',
  'Uruguay': 'UYU', 'Uzbekistan': 'UZS', 'Venezuela': 'VES', 'Vietnam': 'VND',
  'Yemen': 'YER', 'Zambia': 'ZMW', 'Zimbabwe': 'ZWL'
};

function fetchFX(fromCurrency) {
  return new Promise((resolve, reject) => {
    const url = `https://www.alphavantage.co/query?function=FX_MONTHLY&from_symbol=${fromCurrency}&to_symbol=USD&apikey=${API_KEY}`;
    https.get(url, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function fetchCurrencyCollapseData(country) {
  const { value: currency } = await resolveTableKey(country, COUNTRY_CURRENCY);
  if (!currency) return { score: null, reason: 'no_currency_mapping' };
  if (currency === 'USD') return { score: 0, reason: 'usd_pegged', currency };
  if (!API_KEY) return { score: null, reason: 'no_api_key' };

  try {
    const data = await fetchFX(currency);
    const series = data['Monthly Time Series'] || data['Time Series FX (Monthly)'];
    if (!series) return { score: null, reason: 'no_fx_data', currency };

    const dates = Object.keys(series).sort((a, b) => new Date(b) - new Date(a));
    if (dates.length < 13) return { score: null, reason: 'insufficient_history', currency };

    // Latest close vs 12 months ago — measures annual depreciation
    const latest = parseFloat(series[dates[0]]['4. close']);
    const yearAgo = parseFloat(series[dates[12]]['4. close']);

    if (!latest || !yearAgo) return { score: null, reason: 'parse_error', currency };

    // Higher rate = weaker currency (more local currency per USD)
    // Depreciation % = (latest - yearAgo) / yearAgo × 100
    const depreciationPct = ((latest - yearAgo) / yearAgo) * 100;

    // Score: 0 if stable/appreciating, scales to 100 for catastrophic collapse
    // 10% depreciation = 20 score, 30% = 55, 50% = 75, 100%+ = 95
    let score = 0;
    if (depreciationPct > 0) {
      score = Math.min(95, Math.round(depreciationPct * 0.8));
    }

    return {
      score,
      currency,
      depreciation_pct: Math.round(depreciationPct * 10) / 10,
      latest_rate: latest,
      year_ago_rate: yearAgo
    };
  } catch (err) {
    logToHive({ source: 'exchangerate_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchCurrencyCollapseData };
