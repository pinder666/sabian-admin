// port_congestion_feed.cjs
// Port Congestion Signal — vessel dwell time and port throughput stress
// Sources: aisstream.io AIS data + GoComet congestion database + static port tier baseline
// Score 0–100: higher = more congested / disrupted port infrastructure
// Logic: Port congestion precedes food price spikes, supply chain disruption, and
//   economic contraction. A country whose major ports are backed up by 5+ days
//   is experiencing physical economic stress before any GDP data shows it.
// Cadence: 24h

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// Major port countries and their strategic port tier
// Tier 1 = global hub (Singapore, Rotterdam-equivalent), Tier 5 = minor/regional
// congestion_sensitivity: how much a disruption matters to the country's economy
const PORT_BASELINE = {
  'Singapore':     { tier: 1, ports: ['Singapore'],                    sensitivity: 98, landlocked: false },
  'China':         { tier: 1, ports: ['Shanghai','Shenzhen','Ningbo'], sensitivity: 95, landlocked: false },
  'UAE':           { tier: 1, ports: ['Jebel Ali'],                    sensitivity: 92, landlocked: false },
  'South Korea':   { tier: 1, ports: ['Busan'],                        sensitivity: 88, landlocked: false },
  'Malaysia':      { tier: 1, ports: ['Port Klang','Tanjung Pelepas'], sensitivity: 85, landlocked: false },
  'Netherlands':   { tier: 1, ports: ['Rotterdam'],                    sensitivity: 87, landlocked: false },
  'Germany':       { tier: 1, ports: ['Hamburg'],                      sensitivity: 82, landlocked: false },
  'USA':           { tier: 1, ports: ['Los Angeles','New York'],       sensitivity: 80, landlocked: false },
  'United States': { tier: 1, ports: ['Los Angeles','New York'],       sensitivity: 80, landlocked: false },
  'Japan':         { tier: 1, ports: ['Tokyo','Yokohama'],             sensitivity: 82, landlocked: false },
  'Belgium':       { tier: 1, ports: ['Antwerp'],                      sensitivity: 85, landlocked: false },
  'Saudi Arabia':  { tier: 2, ports: ['Jeddah','Dammam'],              sensitivity: 75, landlocked: false },
  'Egypt':         { tier: 2, ports: ['Port Said','Alexandria'],       sensitivity: 78, landlocked: false },
  'Turkey':        { tier: 2, ports: ['Mersin','Istanbul'],            sensitivity: 72, landlocked: false },
  'Indonesia':     { tier: 2, ports: ['Jakarta','Surabaya'],           sensitivity: 70, landlocked: false },
  'India':         { tier: 2, ports: ['Nhava Sheva','Chennai'],        sensitivity: 72, landlocked: false },
  'Bangladesh':    { tier: 2, ports: ['Chittagong'],                   sensitivity: 82, landlocked: false },
  'Vietnam':       { tier: 2, ports: ['Ho Chi Minh City','Hai Phong'], sensitivity: 75, landlocked: false },
  'Thailand':      { tier: 2, ports: ['Laem Chabang'],                 sensitivity: 73, landlocked: false },
  'Philippines':   { tier: 2, ports: ['Manila'],                       sensitivity: 70, landlocked: false },
  'Pakistan':      { tier: 2, ports: ['Karachi'],                      sensitivity: 80, landlocked: false },
  'Sri Lanka':     { tier: 2, ports: ['Colombo'],                      sensitivity: 85, landlocked: false },
  'Morocco':       { tier: 2, ports: ['Tanger Med'],                   sensitivity: 70, landlocked: false },
  'South Africa':  { tier: 2, ports: ['Durban','Cape Town'],           sensitivity: 72, landlocked: false },
  'Brazil':        { tier: 2, ports: ['Santos','Paranagua'],           sensitivity: 68, landlocked: false },
  'Colombia':      { tier: 3, ports: ['Cartagena','Buenaventura'],     sensitivity: 65, landlocked: false },
  'Mexico':        { tier: 2, ports: ['Manzanillo','Veracruz'],        sensitivity: 68, landlocked: false },
  'Chile':         { tier: 3, ports: ['San Antonio'],                  sensitivity: 65, landlocked: false },
  'Peru':          { tier: 3, ports: ['Callao'],                       sensitivity: 65, landlocked: false },
  'Ecuador':       { tier: 3, ports: ['Guayaquil'],                    sensitivity: 62, landlocked: false },
  'Oman':          { tier: 2, ports: ['Salalah','Sohar'],              sensitivity: 72, landlocked: false },
  'Qatar':         { tier: 2, ports: ['Hamad Port'],                   sensitivity: 78, landlocked: false },
  'Kuwait':        { tier: 3, ports: ['Shuwaikh'],                     sensitivity: 70, landlocked: false },
  'Bahrain':       { tier: 3, ports: ['Khalifa bin Salman'],           sensitivity: 68, landlocked: false },
  'Iran':          { tier: 3, ports: ['Bandar Abbas'],                 sensitivity: 70, landlocked: false },
  'Iraq':          { tier: 3, ports: ['Umm Qasr'],                     sensitivity: 75, landlocked: false },
  'Yemen':         { tier: 3, ports: ['Aden','Hodeidah'],              sensitivity: 85, landlocked: false },
  'Djibouti':      { tier: 2, ports: ['Port of Djibouti'],             sensitivity: 90, landlocked: false },
  'Somalia':       { tier: 4, ports: ['Mogadishu'],                    sensitivity: 75, landlocked: false },
  'Kenya':         { tier: 3, ports: ['Mombasa'],                      sensitivity: 78, landlocked: false },
  'Tanzania':      { tier: 3, ports: ['Dar es Salaam'],                sensitivity: 72, landlocked: false },
  'Mozambique':    { tier: 3, ports: ['Beira','Maputo'],               sensitivity: 68, landlocked: false },
  'South Sudan':   { landlocked: true },
  'Ethiopia':      { landlocked: true },
  'Mali':          { landlocked: true },
  'Niger':         { landlocked: true },
  'Burkina Faso':  { landlocked: true },
  'Chad':          { landlocked: true },
  'CAR':           { landlocked: true },
  'DRC':           { tier: 4, ports: ['Matadi'],                       sensitivity: 60, landlocked: false },
  'Nigeria':       { tier: 2, ports: ['Lagos (Apapa)','Tin Can'],      sensitivity: 75, landlocked: false },
  'Ghana':         { tier: 3, ports: ['Tema'],                         sensitivity: 68, landlocked: false },
  'Ivory Coast':   { tier: 3, ports: ['Abidjan'],                      sensitivity: 72, landlocked: false },
  'Senegal':       { tier: 3, ports: ['Dakar'],                        sensitivity: 65, landlocked: false },
  'Angola':        { tier: 3, ports: ['Luanda'],                       sensitivity: 65, landlocked: false },
  'Libya':         { tier: 3, ports: ['Tripoli','Benghazi'],           sensitivity: 70, landlocked: false },
  'Algeria':       { tier: 3, ports: ['Algiers','Oran'],               sensitivity: 65, landlocked: false },
  'Tunisia':       { tier: 3, ports: ['Tunis-Rades'],                  sensitivity: 65, landlocked: false },
  'Myanmar':       { tier: 3, ports: ['Yangon'],                       sensitivity: 68, landlocked: false },
  'Cambodia':      { tier: 4, ports: ['Sihanoukville'],                sensitivity: 60, landlocked: false },
  'Laos':          { landlocked: true },
  'Nepal':         { landlocked: true },
  'Afghanistan':   { landlocked: true },
  'Kazakhstan':    { landlocked: true },
  'Uzbekistan':    { landlocked: true },
  'Kyrgyzstan':    { landlocked: true },
  'Tajikistan':    { landlocked: true },
  'Turkmenistan':  { landlocked: true },
  'Ukraine':       { tier: 3, ports: ['Odessa'],                       sensitivity: 70, landlocked: false },
  'Russia':        { tier: 2, ports: ['Novorossiysk','Vladivostok'],   sensitivity: 65, landlocked: false },
  'Turkey':        { tier: 2, ports: ['Mersin','Istanbul'],            sensitivity: 72, landlocked: false },
  'Greece':        { tier: 2, ports: ['Piraeus'],                      sensitivity: 75, landlocked: false },
  'Italy':         { tier: 2, ports: ['Genoa','Trieste'],              sensitivity: 70, landlocked: false },
  'Spain':         { tier: 2, ports: ['Valencia','Barcelona'],         sensitivity: 70, landlocked: false },
  'Portugal':      { tier: 2, ports: ['Sines'],                        sensitivity: 72, landlocked: false },
  'Australia':     { tier: 2, ports: ['Sydney','Melbourne'],           sensitivity: 68, landlocked: false },
  'New Zealand':   { tier: 3, ports: ['Auckland'],                     sensitivity: 65, landlocked: false },
  'Panama':        { tier: 2, ports: ['Panama City (Balboa)'],         sensitivity: 88, landlocked: false },
  'Taiwan':        { tier: 2, ports: ['Kaohsiung'],                    sensitivity: 82, landlocked: false },
  'Israel':        { tier: 3, ports: ['Haifa','Ashdod'],               sensitivity: 72, landlocked: false }
};

function fetchGoComet(portName) {
  return new Promise((resolve) => {
    const slug = portName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const url = `https://api.gocomet.com/v1/port-congestion/${slug}`;
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

async function fetchPortCongestionData(country) {
  try {
    const info = PORT_BASELINE[country];
    if (!info) return { score: 10, reason: 'no_port_data', trend: 'stable' };
    if (info.landlocked) return { score: 0, reason: 'landlocked', trend: 'stable' };

    // Try live GoComet data for primary port
    const primaryPort = info.ports[0];
    let liveScore = null;
    const gocometData = await fetchGoComet(primaryPort);

    if (gocometData && gocometData.congestion_level !== undefined) {
      // GoComet returns 0-5 congestion level
      const level = parseFloat(gocometData.congestion_level);
      liveScore = Math.round((level / 5) * 100);
    }

    if (liveScore !== null) {
      const sensitivityMod = (info.sensitivity / 100) * 20;
      return {
        score: Math.min(100, liveScore + Math.round(sensitivityMod * (liveScore / 100))),
        port: primaryPort,
        congestion_level: gocometData.congestion_level,
        source: 'GoComet_live',
        trend: liveScore >= 60 ? 'severe' : liveScore >= 35 ? 'moderate' : 'normal'
      };
    }

    // Static tier-based baseline when live data unavailable
    // Lower tier = better infrastructure = lower baseline congestion risk
    const tierBaseline = { 1: 15, 2: 25, 3: 38, 4: 52, 5: 65 };
    const baseScore = tierBaseline[info.tier] || 35;

    return {
      score: baseScore,
      port: primaryPort,
      tier: info.tier,
      source: 'baseline_tier',
      trend: baseScore >= 50 ? 'elevated' : baseScore >= 30 ? 'watch' : 'normal'
    };

  } catch (err) {
    logToHive({ source: 'port_congestion_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchPortCongestionData };
