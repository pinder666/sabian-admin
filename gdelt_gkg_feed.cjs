// gdelt_gkg_feed.cjs
// GDELT GKG Tone Signal — news sentiment/tone per country from 435+ global sources
// Source: GDELT Project DOC 2.0 API (free, no key required)
// Score 0–100: higher = more negative tone / hostile media environment
// GKG records the average emotional tone of news mentioning a country.
// Tone scale: negative = conflict/crisis coverage, positive = stability coverage.
// Cadence: 24h — GDELT updates every 15 minutes, we sample daily

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

function fetchGdeltTone(query, startDatetime, endDatetime) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      query:         query,
      mode:          'timelinetone',
      startdatetime: startDatetime,
      enddatetime:   endDatetime,
      format:        'json'
    });
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
    https.get(url, { headers: { 'User-Agent': 'SabianIntelligence/3.0' }, timeout: 15000 }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

function formatGdeltDate(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().replace(/[-T:]/g, '').slice(0, 14);
}

async function fetchGdeltGkgData(country) {
  try {
    const endDatetime   = formatGdeltDate(1);   // yesterday
    const startDatetime = formatGdeltDate(30);  // 30 days ago

    const data = await fetchGdeltTone(`"${country}"`, startDatetime, endDatetime);

    if (!data || !data.timeline || !data.timeline.length) {
      return { score: null, reason: 'no_gdelt_data' };
    }

    // GDELT tone values: negative = hostile/crisis, positive = calm/stable
    // Typical range: -10 (very negative) to +5 (positive)
    const tones = data.timeline
      .filter(t => t.value !== null && t.value !== undefined)
      .map(t => parseFloat(t.value));

    if (tones.length === 0) return { score: null, reason: 'no_tone_data' };

    const avgTone     = tones.reduce((s, v) => s + v, 0) / tones.length;
    const recentTones = tones.slice(-7);  // last 7 data points
    const recentAvg   = recentTones.reduce((s, v) => s + v, 0) / recentTones.length;

    // Convert tone to 0-100 risk score
    // avgTone of -10 → score ~90 (very negative = high risk)
    // avgTone of 0   → score ~45
    // avgTone of +5  → score ~10 (positive = low risk)
    const toneToScore = (tone) => Math.max(0, Math.min(100, Math.round(45 - (tone * 5))));

    const baseScore   = toneToScore(avgTone);
    const recentScore = toneToScore(recentAvg);

    // Weight recent 7-day average more heavily (2:1)
    const score = Math.round((baseScore + recentScore * 2) / 3);

    // Trend: is tone getting worse (more negative) recently?
    const trend = recentAvg < avgTone - 1
      ? 'deteriorating'
      : recentAvg > avgTone + 1
        ? 'improving'
        : 'stable';

    return {
      score,
      avg_tone_30d:   Math.round(avgTone * 100) / 100,
      avg_tone_7d:    Math.round(recentAvg * 100) / 100,
      tone_samples:   tones.length,
      trend
    };

  } catch (err) {
    logToHive({ source: 'gdelt_gkg_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchGdeltGkgData };
