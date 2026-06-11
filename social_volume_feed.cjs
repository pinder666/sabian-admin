// social_volume_feed.cjs
// Social Volume Signal — open social firehose volume anomaly detection
// Source: Twitter/X API v2 recent search (TWITTER_BEARER_TOKEN)
// Score 0–100: higher = abnormal spike in social volume about this country
// Logic: Social volume spikes precede verified conflict reports by 2–6 hours.
// Cadence: 6h — sample-based, not continuous

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;

// Country mention keywords — primary terms that identify the country in short text
const COUNTRY_KEYWORDS = {
  'Russia': ['russia', 'russian', 'moscow', 'putin', 'kremlin'],
  'Ukraine': ['ukraine', 'ukrainian', 'kyiv', 'zelensky', 'kharkiv'],
  'China': ['china', 'chinese', 'beijing', 'xi jinping', 'prc'],
  'Iran': ['iran', 'iranian', 'tehran', 'irgc', 'khamenei'],
  'Israel': ['israel', 'israeli', 'idf', 'tel aviv', 'netanyahu', 'hamas', 'gaza'],
  'North Korea': ['north korea', 'dprk', 'kim jong', 'pyongyang'],
  'Pakistan': ['pakistan', 'pakistani', 'islamabad', 'karachi'],
  'India': ['india', 'indian', 'modi', 'new delhi', 'mumbai'],
  'Turkey': ['turkey', 'turkish', 'erdogan', 'ankara', 'istanbul'],
  'Saudi Arabia': ['saudi', 'riyadh', 'mbs', 'aramco'],
  'Venezuela': ['venezuela', 'venezuelan', 'maduro', 'caracas'],
  'Myanmar': ['myanmar', 'burma', 'burmese', 'junta', 'tatmadaw', 'yangon'],
  'Sudan': ['sudan', 'sudanese', 'khartoum', 'rsf', 'darfur'],
  'Ethiopia': ['ethiopia', 'ethiopian', 'addis ababa', 'tigray', 'amhara'],
  'Syria': ['syria', 'syrian', 'damascus', 'aleppo', 'hts'],
  'Afghanistan': ['afghanistan', 'afghan', 'kabul', 'taliban'],
  'Iraq': ['iraq', 'iraqi', 'baghdad', 'mosul'],
  'Libya': ['libya', 'libyan', 'tripoli', 'benghazi'],
  'Haiti': ['haiti', 'haitian', 'port-au-prince'],
  'Somalia': ['somalia', 'somali', 'mogadishu', 'al-shabaab'],
  'Yemen': ['yemen', 'yemeni', 'houthi', 'sanaa', 'hodeidah'],
  'Nigeria': ['nigeria', 'nigerian', 'lagos', 'abuja', 'boko haram'],
  'DRC': ['drc', 'congo', 'kinshasa', 'm23', 'goma'],
  'Lebanon': ['lebanon', 'lebanese', 'beirut', 'hezbollah'],
  'Taiwan': ['taiwan', 'taiwanese', 'taipei', 'tsai'],
  'Egypt': ['egypt', 'egyptian', 'cairo', 'sisi'],
  'South Africa': ['south africa', 'pretoria', 'johannesburg', 'anc'],
  'Bangladesh': ['bangladesh', 'bangladeshi', 'dhaka'],
  'Colombia': ['colombia', 'colombian', 'bogota', 'farc'],
  'Mexico': ['mexico', 'mexican', 'cartel', 'ciudad juarez'],
  'Kazakhstan': ['kazakhstan', 'almaty', 'astana'],
  'Georgia': ['georgia crisis', 'tbilisi protest', 'georgian opposition']
};

function fetchTwitterSearch(query) {
  return new Promise((resolve) => {
    if (!TWITTER_BEARER_TOKEN) return resolve(null);
    const q = encodeURIComponent(`(${query}) lang:en -is:retweet`);
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${q}&max_results=100&tweet.fields=public_metrics`;
    const options = {
      headers: {
        'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
        'User-Agent': 'SabianIntelligence/3.0'
      },
      timeout: 12000
    };
    https.get(url, options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null))
      .on('timeout', () => resolve(null));
  });
}

async function fetchSocialVolumeData(country) {
  try {
    const keywords = COUNTRY_KEYWORDS[country];
    if (!keywords) return { score: 5, reason: 'no_keyword_data', trend: 'stable' };

    if (!TWITTER_BEARER_TOKEN) {
      return { score: null, reason: 'no_twitter_bearer_token', trend: 'unknown' };
    }

    const query = keywords.slice(0, 3).join(' OR ');
    const result = await fetchTwitterSearch(query);

    if (!result || result.status !== 200 || !result.data?.data) {
      // Rate limited or no results
      if (result?.status === 429) {
        return { score: null, reason: 'twitter_rate_limited', trend: 'unknown' };
      }
      return { score: 5, reason: 'no_twitter_results', trend: 'stable' };
    }

    const tweets = result.data.data || [];
    const count = tweets.length;

    // Engagement weighting
    let engagementScore = 0;
    for (const tweet of tweets) {
      const m = tweet.public_metrics || {};
      const engagement = (m.reply_count || 0) + (m.retweet_count || 0) + (m.like_count || 0);
      engagementScore += Math.min(5, Math.log1p(engagement));
    }

    const volumeScore  = Math.min(60, Math.round((count / 100) * 60));
    const engBonus     = Math.min(40, Math.round(engagementScore));
    const score        = Math.min(100, volumeScore + engBonus);

    return {
      score,
      post_count_sample: count,
      source: 'Twitter_API_v2',
      trend: score >= 65 ? 'viral_spike' : score >= 35 ? 'elevated_mention' : 'normal'
    };

  } catch (err) {
    logToHive({ source: 'social_volume_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { score: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchSocialVolumeData };
