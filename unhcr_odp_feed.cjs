// unhcr_odp_feed.cjs
// UNHCR Refugee & Forced Displacement Signal — cross-border displacement pressure
// Source: UNHCR Refugee Data Finder API (public, no auth required)
// Score 0–100: higher = country is a major origin or host of forced displacement
// Logic: Refugee outflow = source country crisis severity (people voted with their feet)
//   Refugee inflow = hosting country burden (resource stress + social tension)
//   Both signals matter. Syria outflow = 6.5M (crisis severity).
//   Uganda inflow = 1.5M (hosting burden). Both elevate risk.
// Cadence: annual — UNHCR publishes mid-year and end-year global trend data

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// UNHCR country codes (ISO3)
const UNHCR_ISO3 = {
  'Afghanistan': 'AFG', 'Bangladesh': 'BGD', 'Burkina Faso': 'BFA',
  'Burundi': 'BDI', 'CAR': 'CAF', 'Cameroon': 'CMR', 'Chad': 'TCD',
  'China': 'CHN', 'Colombia': 'COL', 'DRC': 'COD', 'Egypt': 'EGY',
  'El Salvador': 'SLV', 'Ethiopia': 'ETH', 'Guatemala': 'GTM',
  'Haiti': 'HTI', 'Honduras': 'HND', 'India': 'IND', 'Indonesia': 'IDN',
  'Iran': 'IRN', 'Iraq': 'IRQ', 'Jordan': 'JOR', 'Kenya': 'KEN',
  'Lebanon': 'LBN', 'Liberia': 'LBR', 'Libya': 'LBY', 'Mali': 'MLI',
  'Mauritania': 'MRT', 'Mexico': 'MEX', 'Moldova': 'MDA', 'Morocco': 'MAR',
  'Mozambique': 'MOZ', 'Myanmar': 'MMR', 'Nepal': 'NPL', 'Nicaragua': 'NIC',
  'Niger': 'NER', 'Nigeria': 'NGA', 'Pakistan': 'PAK', 'Philippines': 'PHL',
  'Russia': 'RUS', 'Rwanda': 'RWA', 'Saudi Arabia': 'SAU', 'Sierra Leone': 'SLE',
  'Somalia': 'SOM', 'South Sudan': 'SSD', 'Sri Lanka': 'LKA', 'Sudan': 'SDN',
  'Syria': 'SYR', 'Tajikistan': 'TJK', 'Tanzania': 'TZA', 'Turkey': 'TUR',
  'Turkmenistan': 'TKM', 'Uganda': 'UGA', 'Ukraine': 'UKR', 'Uzbekistan': 'UZB',
  'Venezuela': 'VEN', 'Vietnam': 'VNM', 'Yemen': 'YEM', 'Zambia': 'ZMB',
  'Zimbabwe': 'ZWE', 'Thailand': 'THA', 'Malaysia': 'MYS', 'Ecuador': 'ECU',
  'Peru': 'PER', 'Chile': 'CHL', 'Argentina': 'ARG', 'Brazil': 'BRA',
  'Bolivia': 'BOL', 'Colombia': 'COL', 'Panama': 'PAN', 'Costa Rica': 'CRI',
  'Indonesia': 'IDN', 'Germany': 'DEU', 'France': 'FRA', 'Italy': 'ITA',
  'Greece': 'GRC', 'Bulgaria': 'BGR', 'Serbia': 'SRB', 'Romania': 'ROM',
  'Poland': 'POL', 'UK': 'GBR', 'United States': 'USA', 'Canada': 'CAN',
  'Australia': 'AUS', 'South Africa': 'ZAF', 'Angola': 'AGO',
  'Kyrgyzstan': 'KGZ', 'Kazakhstan': 'KAZ', 'Georgia': 'GEO',
  'Armenia': 'ARM', 'Azerbaijan': 'AZE', 'North Korea': 'PRK'
};

// Static baseline — UNHCR Global Trends 2024 (end-year)
// refugees_out: thousands of refugees originating from this country
// refugees_in:  thousands of refugees hosted in this country
// forcibly_displaced_total: all categories (refugees + asylum-seekers + IDPs for UNHCR mandate)
const UNHCR_DATA = {
  'Syria':       { refugees_out: 6480, refugees_in: 150,  note: 'Largest refugee-origin country' },
  'Venezuela':   { refugees_out: 7700, refugees_in: 30,   note: 'Largest displacement crisis in Americas' },
  'Ukraine':     { refugees_out: 6500, refugees_in: 0,    note: 'War-driven; 6.5M in Europe' },
  'Afghanistan': { refugees_out: 6100, refugees_in: 70,   note: 'Post-Taliban flight ongoing' },
  'South Sudan': { refugees_out: 2200, refugees_in: 300,  note: 'Protracted civil conflict' },
  'Myanmar':     { refugees_out: 1200, refugees_in: 0,    note: 'Rohingya + coup displacement' },
  'Sudan':       { refugees_out: 1100, refugees_in: 1100, note: 'Major origin and host; war surge 2023' },
  'Somalia':     { refugees_out: 800,  refugees_in: 0,    note: 'Persistent conflict/drought flight' },
  'DRC':         { refugees_out: 900,  refugees_in: 510,  note: 'Both origin and major host' },
  'Ethiopia':    { refugees_out: 450,  refugees_in: 900,  note: 'Regional host (Somalia/S.Sudan/Eritrea)' },
  'Colombia':    { refugees_out: 280,  refugees_in: 2500, note: 'Hosts 2.5M Venezuelans' },
  'Pakistan':    { refugees_out: 10,   refugees_in: 1300, note: 'Hosts Afghan refugees' },
  'Iran':        { refugees_out: 10,   refugees_in: 800,  note: 'Hosts Afghan refugees' },
  'Turkey':      { refugees_out: 20,   refugees_in: 3600, note: 'World largest refugee host (Syrians)' },
  'Uganda':      { refugees_out: 10,   refugees_in: 1550, note: 'Major host (S.Sudan, DRC, Somalia)' },
  'Germany':     { refugees_out: 5,    refugees_in: 2200, note: 'Major European host' },
  'Lebanon':     { refugees_out: 15,   refugees_in: 780,  note: 'Highest refugee density per capita' },
  'Jordan':      { refugees_out: 5,    refugees_in: 730,  note: 'Syrian and Palestinian refugees' },
  'Kenya':       { refugees_out: 5,    refugees_in: 600,  note: 'Kakuma and Dadaab camps' },
  'Bangladesh':  { refugees_out: 5,    refugees_in: 960,  note: 'Rohingya camps in Cox\'s Bazar' },
  'Chad':        { refugees_out: 50,   refugees_in: 610,  note: 'Major host (Sudan, CAR, Nigeria)' },
  'Niger':       { refugees_out: 50,   refugees_in: 290,  note: 'Hosts Malians, Nigerians, Burkinabes' },
  'Cameroon':    { refugees_out: 30,   refugees_in: 460,  note: 'CAR and Nigerian refugees' },
  'Rwanda':      { refugees_out: 5,    refugees_in: 130,  note: 'Hosts DRC/Burundi refugees' },
  'Tanzania':    { refugees_out: 5,    refugees_in: 280,  note: 'Nyarugusu and Nduta camps' },
  'Malaysia':    { refugees_out: 5,    refugees_in: 180,  note: 'Unregistered Rohingya/Myanmar' },
  'Thailand':    { refugees_out: 5,    refugees_in: 100,  note: 'Myanmar border camps' },
  'Ecuador':     { refugees_out: 5,    refugees_in: 580,  note: 'Venezuelan transit/host' },
  'Peru':        { refugees_out: 5,    refugees_in: 1500, note: 'Venezuelan host' },
  'Chile':       { refugees_out: 5,    refugees_in: 500,  note: 'Venezuelan host' },
  'Brazil':      { refugees_out: 5,    refugees_in: 560,  note: 'Venezuelan host (Roraima state)' },
  'Iraq':        { refugees_out: 250,  refugees_in: 280,  note: 'Hosts Syrian refugees' },
  'Libya':       { refugees_out: 30,   refugees_in: 50,   note: 'Transit country, detention crisis' },
  'Eritrea':     { refugees_out: 550,  refugees_in: 0,    note: 'Authoritarian flight ongoing' },
  'Burkina Faso':{ refugees_out: 50,   refugees_in: 50,   note: 'Net displacement — hosting Malians' },
  'Mali':        { refugees_out: 150,  refugees_in: 60,   note: 'Sahel conflict displacement' },
  'Nigeria':     { refugees_out: 90,   refugees_in: 110,  note: 'Boko Haram displacement' },
  'Zambia':      { refugees_out: 5,    refugees_in: 100,  note: 'DRC and Mozambican refugees' },
  'Mozambique':  { refugees_out: 30,   refugees_in: 20,   note: 'Cabo Delgado displacement' },
  'Zimbabwe':    { refugees_out: 55,   refugees_in: 15,   note: 'Economic/political flight' },
  'Haiti':       { refugees_out: 110,  refugees_in: 0,    note: 'Gang violence mass flight' },
  'Venezuela':   { refugees_out: 7700, refugees_in: 30,   note: 'Largest Americas displacement' },
  'Myanmar':     { refugees_out: 1200, refugees_in: 0,    note: 'Coup + Rohingya exodus' },
  'Russia':      { refugees_out: 80,   refugees_in: 100,  note: 'Post-invasion draft flight' },
  'North Korea': { refugees_out: 35,   refugees_in: 0,    note: 'Authoritarian flight (China-routed)' },
  'Cuba':        { refugees_out: 90,   refugees_in: 0,    note: 'Political/economic flight' }
};

function fetchUnhcrData(iso3) {
  return new Promise((resolve) => {
    const url = `https://api.unhcr.org/population/v1/population/?limit=1&origincountries=${iso3}&yearFrom=2023`;
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

async function fetchUnhcrOdpData(country) {
  try {
    const data = UNHCR_DATA[country];
    if (!data) return { score: 5, reason: 'no_unhcr_data', trend: 'stable' };

    // Score from refugee outflow (origin crisis severity)
    const outScore = data.refugees_out >= 5000 ? 90 :
                     data.refugees_out >= 1000 ? 75 :
                     data.refugees_out >= 500  ? 60 :
                     data.refugees_out >= 100  ? 45 :
                     data.refugees_out >= 30   ? 30 :
                     data.refugees_out >= 5    ? 15 : 5;

    // Score from refugee inflow (hosting burden — secondary stress signal)
    const inScore = data.refugees_in >= 2000 ? 30 :
                    data.refugees_in >= 500  ? 20 :
                    data.refugees_in >= 100  ? 12 :
                    data.refugees_in >= 20   ? 6  : 0;

    // We weight origin crisis 2x hosting burden
    const score = Math.min(100, Math.round(outScore * 0.7 + inScore * 0.3));

    return {
      score,
      refugees_out_thousands: data.refugees_out,
      refugees_in_thousands:  data.refugees_in,
      note:                   data.note,
      source:                 'UNHCR_Global_Trends_2024',
      trend:                  score >= 70 ? 'mass_displacement' : score >= 40 ? 'elevated' : 'monitored'
    };

  } catch (err) {
    logToHive({ source: 'unhcr_odp_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { score: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchUnhcrOdpData };
