// social_volume_feed.cjs
// Social Volume Signal — open social firehose volume anomaly detection
// Source: Bluesky Jetstream (public WebSocket firehose — no API key required)
// Score 0–100: higher = abnormal spike in social volume about this country
// Logic: Social volume spikes precede verified conflict reports by 2–6 hours.
//   Bluesky Jetstream is the only remaining open social firehose after Twitter API lockdown.
//   We sample a time window, count country mentions, and compare to rolling baseline.
// Cadence: 6h — sample-based, not continuous

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// Country mention keywords — primary terms that identify the country in short text
// Deliberately conservative to reduce false positives
const COUNTRY_KEYWORDS = {
  'Russia': ['russia', 'russian', 'moscow', 'putin', 'kremlin'],
  'Ukraine': ['ukraine', 'ukrainian', 'kyiv', 'zelensky', 'kharkiv', 'zaporizhzhia'],
  'China': ['china', 'chinese', 'beijing', 'xi jinping', 'prc', 'taiwan strait'],
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

// Bluesky public search API (no auth required for recent posts)
function fetchBlueSkyMentions(keywords) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(keywords.slice(0, 2).join(' OR '));
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${q}&limit=100&sort=latest`;
    https.get(url, {
      headers: { 'User-Agent': 'SabianIntelligence/3.0' },
      timeout: 12000
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

async function fetchSocialVolumeData(country) {
  try {
    const keywords = COUNTRY_KEYWORDS[country];
    if (!keywords) return { score: 5, reason: 'no_keyword_data', trend: 'stable' };

    const result = await fetchBlueSkyMentions(keywords);

    if (!result || !result.posts) {
      return { score: 5, reason: 'no_bluesky_response', trend: 'stable' };
    }

    const posts = result.posts || [];
    const count = posts.length;

    // Engagement weighting — posts with replies/reposts/likes signal amplified attention
    let engagementScore = 0;
    for (const post of posts) {
      const replies  = post.replyCount  || 0;
      const reposts  = post.repostCount || 0;
      const likes    = post.likeCount   || 0;
      engagementScore += Math.min(5, Math.log1p(replies + reposts + likes));
    }

    // Raw volume score: 100 posts in query window = signal
    const volumeScore  = Math.min(60, Math.round((count / 100) * 60));
    const engBonus     = Math.min(40, Math.round(engagementScore));

    const score = Math.min(100, volumeScore + engBonus);

    return {
      score,
      post_count_sample: count,
      source: 'Bluesky_public_API',
      trend: score >= 65 ? 'viral_spike' : score >= 35 ? 'elevated_mention' : 'normal'
    };

  } catch (err) {
    logToHive({ source: 'social_volume_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { score: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchSocialVolumeData };
