require('dotenv').config({ path: './.env' });
const https = require('https');

function fetchJson(url, headers = {}) {
  return new Promise((resolve) => {
    const opts = { headers: { 'User-Agent': 'SabianTest/1.0', ...headers }, timeout: 15000 };
    https.get(url, opts, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body.slice(0, 500) }); }
      });
    }).on('error', e => resolve({ status: 'ERROR', data: e.message }))
      .on('timeout', () => resolve({ status: 'TIMEOUT', data: 'timed out' }));
  });
}

function fetchText(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'SabianTest/1.0' }, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, data: body.slice(0, 1000) }));
    }).on('error', e => resolve({ status: 'ERROR', data: e.message }))
      .on('timeout', () => resolve({ status: 'TIMEOUT', data: 'timed out' }));
  });
}

async function run() {
  console.log('\n=== SABIAN SIGNAL TEST ===\n');
  const GFW = process.env.GFW_API_KEY;
  const OTX = process.env.OTX_API_KEY;
  console.log('GFW_API_KEY:', GFW ? 'SET' : 'MISSING');
  console.log('OTX_API_KEY:', OTX ? 'SET' : 'MISSING');
  console.log('');

  console.log('1. DARK VESSEL (GFW)');
  const gfw = await fetchJson('https://gateway.api.globalfishingwatch.org/v3/events?datasets=public-global-gaps:latest&startDate=2026-06-01&endDate=2026-06-10&bbox=25.0,12.0,43.0,23.0&limit=5&offset=0', { 'Authorization': `Bearer ${GFW}` });
  console.log('   status:', gfw.status, '| entries:', gfw.data?.entries?.length ?? gfw.data?.total ?? JSON.stringify(gfw.data).slice(0,200));
  console.log('');

  console.log('2. CYBER THREAT (OTX)');
  const sevenDaysAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
  const otx = await fetchJson(`https://otx.alienvault.com/api/v1/pulses/subscribed?limit=10&modified_since=${sevenDaysAgo}`, { 'X-OTX-API-KEY': OTX });
  console.log('   status:', otx.status, '| pulses:', otx.data?.results?.length ?? JSON.stringify(otx.data).slice(0,200));
  console.log('');

  console.log('3. FLOOD RISK (GloFAS)');
  const glofas = await fetchJson('https://globalfloods.eu/glofas-forecasting/api/v1/flood-alerts/?bbox=88.0,20.7,92.7,26.6&alert_level=Advisory&format=json');
  console.log('   status:', glofas.status, '|', JSON.stringify(glofas.data).slice(0,200));
  console.log('');

  console.log('4. PREDICTION MARKET (Polymarket)');
  const poly = await fetchJson('https://gamma-api.polymarket.com/markets?search=ukraine&closed=false&limit=3');
  console.log('   status:', poly.status, '| markets:', Array.isArray(poly.data) ? poly.data.length : JSON.stringify(poly.data).slice(0,200));
  console.log('');

  console.log('5. SOCIAL VOLUME (Bluesky)');
  const bsky = await fetchJson('https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=ukraine%20OR%20russia&limit=10&sort=latest');
  console.log('   status:', bsky.status, '| posts:', bsky.data?.posts?.length ?? JSON.stringify(bsky.data).slice(0,200));
  console.log('');

  console.log('6. TOR CENSORSHIP');
  const start = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const end = new Date().toISOString().slice(0,10);
  const tor = await fetchText(`https://metrics.torproject.org/userstats-relay-country.csv?start=${start}&end=${end}&country=ir`);
  const lines = tor.data.split('\n').filter(l => !l.startsWith('#') && !l.startsWith('date') && l.trim()).length;
  console.log('   status:', tor.status, '| data rows:', lines);
  console.log('');

  console.log('=== DONE ===');
}
run().catch(console.error);
