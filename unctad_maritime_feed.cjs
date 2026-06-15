// unctad_maritime_feed.cjs
// UNCTAD Maritime Transport — via World Bank API (hosts UNCTAD indicators)
// FREE, no key required
// Signals:
//   LSCI (Liner Shipping Connectivity Index) — how connected a country is to global shipping
//   Container port throughput (TEU) — actual physical cargo volume YoY change
// Hard signal: ships either move or they don't. Cannot be manipulated.
// Yemen LSCI collapsed during Red Sea blockade. Russia dropped after sanctions.
// Venezuela port throughput collapsed 18 months before economic crisis peak.

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');
const { resolveTableKey } = require('./resolve_table_key.cjs');

// World Bank API indicator codes for UNCTAD maritime data
const LSCI_INDICATOR = 'IS.SHP.GCNW.XQ';   // Liner Shipping Connectivity Index
const TEU_INDICATOR  = 'IS.SHP.GOOD.TU';    // Container port traffic (TEU)

async function fetchMaritimeScore(country, date) {
  const iso = await getIso2(country);
  if (!iso) {
    return { source: 'UNCTAD_Maritime', country, conflict_score: null, warning: `No ISO code for ${country}` };
  }

  const targetYear = date ? new Date(date).getFullYear() : new Date().getFullYear();

  try {
    const [lsciRaw, teuRaw] = await Promise.allSettled([
      fetchWbIndicator(iso, LSCI_INDICATOR, 5),
      fetchWbIndicator(iso, TEU_INDICATOR, 5)
    ]);

    const lsciObs = lsciRaw.status === 'fulfilled' ? lsciRaw.value : [];
    const teuObs  = teuRaw.status  === 'fulfilled' ? teuRaw.value  : [];

    const lsciLatest = lsciObs.find(o => o.value !== null);
    const lsciPrior  = lsciObs.find(o => o.value !== null && o !== lsciLatest);
    const teuLatest  = teuObs.find(o => o.value !== null);
    const teuPrior   = teuObs.find(o => o.value !== null && o !== teuLatest);

    if (!lsciLatest && !teuLatest) {
      return {
        source: 'UNCTAD_Maritime',
        country,
        conflict_score: null,
        warning: 'No maritime data available — landlocked country or no port infrastructure'
      };
    }

    let score = 0;
    const parts = [];

    // ── LSCI component (0-50 points) ────────────────────────────────────────
    if (lsciLatest) {
      const lsciVal = parseFloat(lsciLatest.value);

      // Absolute LSCI score: low connectivity = isolation risk
      // LSCI range: ~0 (completely isolated) to ~100+ (major hub)
      // Yemen ~5, Sudan ~3, Haiti ~6, Venezuela ~15, Russia post-sanctions ~25
      let lsciAbsoluteScore = 0;
      if (lsciVal <= 5)  lsciAbsoluteScore = 40;
      else if (lsciVal <= 10) lsciAbsoluteScore = 30;
      else if (lsciVal <= 20) lsciAbsoluteScore = 20;
      else if (lsciVal <= 35) lsciAbsoluteScore = 10;
      else lsciAbsoluteScore = 0;

      // YoY decline component
      let lsciDeclineScore = 0;
      if (lsciPrior) {
        const priorVal = parseFloat(lsciPrior.value);
        if (priorVal > 0) {
          const change = (lsciVal - priorVal) / priorVal;
          if (change <= -0.50) lsciDeclineScore = 50;
          else if (change <= -0.30) lsciDeclineScore = 35;
          else if (change <= -0.20) lsciDeclineScore = 25;
          else if (change <= -0.10) lsciDeclineScore = 12;
          else if (change >= 0.10)  lsciDeclineScore = 0; // improving connectivity
          parts.push(`LSCI ${lsciVal.toFixed(1)} (${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}% YoY)`);
        }
      } else {
        parts.push(`LSCI ${lsciVal.toFixed(1)}`);
      }

      score += Math.max(lsciAbsoluteScore, lsciDeclineScore);
    }

    // ── TEU throughput component (0-50 points) ───────────────────────────────
    if (teuLatest && teuPrior) {
      const teuVal   = parseFloat(teuLatest.value);
      const teuPriorVal = parseFloat(teuPrior.value);
      if (teuPriorVal > 0) {
        const change = (teuVal - teuPriorVal) / teuPriorVal;
        let teuScore = 0;
        if (change <= -0.60) teuScore = 50;
        else if (change <= -0.40) teuScore = 35;
        else if (change <= -0.25) teuScore = 25;
        else if (change <= -0.10) teuScore = 12;
        else if (change >= 0.10)  teuScore = 0;
        score += teuScore;
        parts.push(`port throughput ${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}% YoY`);
      }
    }

    score = Math.min(100, score);

    const trend = score >= 70 ? 'maritime isolation' :
                  score >= 45 ? 'connectivity degrading' :
                  score >= 20 ? 'mild disruption' : 'connected';

    logToHive({
      source: 'unctad_maritime_feed',
      level: 'intel',
      event: 'maritime_scored',
      data: {
        country,
        lsci: lsciLatest ? parseFloat(parseFloat(lsciLatest.value).toFixed(1)) : null,
        teu: teuLatest ? parseFloat(teuLatest.value) : null,
        score
      },
      tags: ['unctad', 'maritime', country]
    });

    return {
      source: 'UNCTAD_Maritime',
      country,
      conflict_score: score,
      lsci: lsciLatest ? parseFloat(parseFloat(lsciLatest.value).toFixed(1)) : null,
      lsci_year: lsciLatest?.date || null,
      teu: teuLatest ? parseFloat(teuLatest.value) : null,
      teu_year: teuLatest?.date || null,
      summary: parts.join(', ') || trend,
      trend,
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'unctad_maritime_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['unctad', 'maritime', 'error']
    });
    return { source: 'UNCTAD_Maritime', country, conflict_score: null, error: err.message };
  }
}

async function fetchWbIndicator(iso, indicator, mrv) {
  const path = `/v2/country/${iso}/indicator/${indicator}?format=json&mrv=${mrv}&per_page=${mrv}`;
  const raw = await fetchJson('api.worldbank.org', path);
  return raw?.[1] || [];
}

function fetchJson(hostname, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode !== 200) { reject(new Error(`WB HTTP ${res.statusCode}`)); return; }
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('WB timeout')); });
    req.end();
  });
}

// ISO 2-letter codes for World Bank API
async function getIso2(country) {
  const codes = {
    'Afghanistan': 'AF', 'Albania': 'AL', 'Algeria': 'DZ', 'Angola': 'AO',
    'Argentina': 'AR', 'Armenia': 'AM', 'Australia': 'AU', 'Azerbaijan': 'AZ',
    'Bahrain': 'BH', 'Bangladesh': 'BD', 'Belarus': 'BY', 'Benin': 'BJ',
    'Bolivia': 'BO', 'Bosnia': 'BA', 'Brazil': 'BR', 'Bulgaria': 'BG',
    'Burkina Faso': 'BF', 'Burundi': 'BI', 'Cambodia': 'KH', 'Cameroon': 'CM',
    'CAR': 'CF', 'Chad': 'TD', 'Chile': 'CL', 'China': 'CN',
    'Colombia': 'CO', 'Congo': 'CG', 'Costa Rica': 'CR', 'Croatia': 'HR',
    'Cuba': 'CU', 'Cyprus': 'CY', 'DRC': 'CD', 'Djibouti': 'DJ',
    'Dominican Republic': 'DO', 'Ecuador': 'EC', 'Egypt': 'EG', 'El Salvador': 'SV',
    'Eritrea': 'ER', 'Ethiopia': 'ET', 'Fiji': 'FJ', 'France': 'FR',
    'Gabon': 'GA', 'Georgia': 'GE', 'Germany': 'DE', 'Ghana': 'GH',
    'Greece': 'GR', 'Guatemala': 'GT', 'Guinea': 'GN', 'Guyana': 'GY',
    'Haiti': 'HT', 'Honduras': 'HN', 'India': 'IN', 'Indonesia': 'ID',
    'Iran': 'IR', 'Iraq': 'IQ', 'Israel': 'IL', 'Italy': 'IT',
    'Ivory Coast': 'CI', 'Jamaica': 'JM', 'Japan': 'JP', 'Jordan': 'JO',
    'Kazakhstan': 'KZ', 'Kenya': 'KE', 'Kuwait': 'KW', 'Kyrgyzstan': 'KG',
    'Laos': 'LA', 'Lebanon': 'LB', 'Liberia': 'LR', 'Libya': 'LY',
    'Malawi': 'MW', 'Malaysia': 'MY', 'Mali': 'ML', 'Mauritania': 'MR',
    'Mexico': 'MX', 'Moldova': 'MD', 'Mongolia': 'MN', 'Montenegro': 'ME',
    'Morocco': 'MA', 'Mozambique': 'MZ', 'Myanmar': 'MM', 'Namibia': 'NA',
    'Nepal': 'NP', 'Nicaragua': 'NI', 'Niger': 'NE', 'Nigeria': 'NG',
    'North Korea': 'KP', 'North Macedonia': 'MK', 'Oman': 'OM', 'Pakistan': 'PK',
    'Palestine': 'PS', 'Panama': 'PA', 'Papua New Guinea': 'PG', 'Paraguay': 'PY',
    'Peru': 'PE', 'Philippines': 'PH', 'Poland': 'PL', 'Portugal': 'PT',
    'Qatar': 'QA', 'Romania': 'RO', 'Russia': 'RU', 'Rwanda': 'RW',
    'Saudi Arabia': 'SA', 'Senegal': 'SN', 'Serbia': 'RS', 'Sierra Leone': 'SL',
    'Somalia': 'SO', 'South Africa': 'ZA', 'South Korea': 'KR', 'South Sudan': 'SS',
    'Spain': 'ES', 'Sri Lanka': 'LK', 'Sudan': 'SD', 'Suriname': 'SR',
    'Syria': 'SY', 'Taiwan': 'TW', 'Tajikistan': 'TJ', 'Tanzania': 'TZ',
    'Thailand': 'TH', 'Timor-Leste': 'TL', 'Togo': 'TG',
    'Trinidad and Tobago': 'TT', 'Tunisia': 'TN', 'Turkey': 'TR',
    'Turkmenistan': 'TM', 'UAE': 'AE', 'Uganda': 'UG', 'UK': 'GB',
    'Ukraine': 'UA', 'Uruguay': 'UY', 'Uzbekistan': 'UZ', 'Venezuela': 'VE',
    'Vietnam': 'VN', 'Yemen': 'YE', 'Zambia': 'ZM', 'Zimbabwe': 'ZW',
    // Landlocked — will return null (no ports)
    'Burkina Faso': 'BF', 'CAR': 'CF', 'Chad': 'TD', 'Ethiopia': 'ET',
    'Kosovo': 'XK', 'Niger': 'NE', 'Rwanda': 'RW', 'South Sudan': 'SS'
  };
  const { value } = await resolveTableKey(country, codes);
  return value;
}

module.exports = fetchMaritimeScore;

if (require.main === module) {
  const country = process.argv[2] || 'Yemen';
  fetchMaritimeScore(country)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(console.error);
}
