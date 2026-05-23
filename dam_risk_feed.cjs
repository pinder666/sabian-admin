// dam_risk_feed.cjs
// Dam Risk Signal — major dam/reservoir vulnerability and downstream population at risk
// Source: Global Dam Watch (GDW) + GRanD database — curated static data
// Score 0–100: higher = country has major dams at strategic risk
// Logic: Dam attacks (Kakhovka 2023), drought-driven depletion (Tigris-Euphrates),
//   upstream disputes (GERD/Ethiopia-Egypt-Sudan), and structural failure risk
//   are physical infrastructure events that create displacement, water crises,
//   and conflict triggers. This signal has nothing to do with politics — it is engineering.
// Cadence: static — update quarterly as dam status changes

require('dotenv').config({ path: './.env' });
const { logToHive } = require('./logger.cjs');

// Major strategic dams per country
// risk_score: 0-100 based on: dam size, downstream population, geopolitical tension, fill levels
// dispute: active upstream/downstream dispute amplifies score
// attack_risk: country has active conflict near dam infrastructure
const DAM_RISK_DATA = {
  // High-risk dam situations
  'Ethiopia':     { score: 85, dams: ['Grand Ethiopian Renaissance Dam (GERD)'],
                    dispute: true,  attack_risk: true,
                    note: 'GERD is center of Egypt-Ethiopia-Sudan water war. Filling cycle ongoing.' },
  'Egypt':        { score: 78, dams: ['Aswan High Dam'],
                    dispute: true,  attack_risk: false,
                    note: 'GERD upstream threatens Nile flow. Aswan critical for 95M people.' },
  'Sudan':        { score: 72, dams: ['Merowe Dam','Roseires Dam'],
                    dispute: true,  attack_risk: true,
                    note: 'Caught between GERD dispute and internal conflict zones near infrastructure.' },
  'Ukraine':      { score: 88, dams: ['Kakhovka Dam (destroyed)','Dnieper cascade'],
                    dispute: false, attack_risk: true,
                    note: 'Kakhovka destroyed June 2023. Remaining Dnieper cascade under active threat.' },
  'Iraq':         { score: 72, dams: ['Mosul Dam','Haditha Dam'],
                    dispute: true,  attack_risk: true,
                    note: 'Mosul Dam has structural integrity warnings. Haditha threatened in ISIS-era.' },
  'Syria':        { score: 65, dams: ['Tishrin Dam','Tabqa Dam'],
                    dispute: false, attack_risk: true,
                    note: 'Both dams in conflict zones. Tabqa controlled by SDF, Tishrin contested.' },
  'Iran':         { score: 60, dams: ['Karun cascade','Karkheh Dam'],
                    dispute: false, attack_risk: false,
                    note: 'Significant reservoir depletion from drought. Isfahan water crisis ongoing.' },
  'Tajikistan':   { score: 62, dams: ['Rogun Dam'],
                    dispute: true,  attack_risk: false,
                    note: 'Rogun under construction — downstream Uzbekistan disputes water allocation.' },
  'Pakistan':     { score: 65, dams: ['Tarbela Dam','Mangla Dam'],
                    dispute: false, attack_risk: true,
                    note: 'Both critical for irrigation and power. Tarbela supplies 30%+ of irrigation.' },
  'India':        { score: 45, dams: ['Tehri Dam','Sardar Sarovar'],
                    dispute: true,  attack_risk: false,
                    note: 'Interstate water disputes ongoing. Seismic risk at Tehri (Himalayan fault).' },
  'China':        { score: 55, dams: ['Three Gorges','Jinsha cascade'],
                    dispute: true,  attack_risk: false,
                    note: 'Three Gorges: downstream risk to 400M+ people. Mekong upstream disputes active.' },
  'Myanmar':      { score: 55, dams: ['Myitsone Dam (suspended)','Yeywa Dam'],
                    dispute: false, attack_risk: true,
                    note: 'Myitsone contested with China. Active conflict near Kachin-region dams.' },
  'Laos':         { score: 58, dams: ['Nam Theun 2','Xayaburi','Nam Ou cascade'],
                    dispute: true,  attack_risk: false,
                    note: 'Multiple Mekong mainstream dams trigger downstream dispute with Vietnam/Cambodia.' },
  'Vietnam':      { score: 42, dams: ['Hoa Binh Dam','Son La Dam'],
                    dispute: true,  attack_risk: false,
                    note: 'Upstream Chinese/Laotian dams reduce Mekong flow — downstream impact signal.' },
  'Cambodia':     { score: 48, dams: ['Lower Sesan 2'],
                    dispute: true,  attack_risk: false,
                    note: 'Mekong mainstream flow heavily impacted by upstream dams.' },
  'DRC':          { score: 38, dams: ['Inga I','Inga II','Grand Inga (proposed)'],
                    dispute: false, attack_risk: true,
                    note: 'Inga facilities degraded. Grand Inga project stalled. Key to African power grid.' },
  'Zambia':       { score: 48, dams: ['Kariba Dam','Kafue Gorge'],
                    dispute: true,  attack_risk: false,
                    note: 'Kariba shared with Zimbabwe — severe drought lowered levels to crisis in 2023.' },
  'Zimbabwe':     { score: 50, dams: ['Kariba Dam'],
                    dispute: true,  attack_risk: false,
                    note: 'Kariba shared with Zambia. Power generation cut 50%+ during drought periods.' },
  'Mozambique':   { score: 38, dams: ['Cahora Bassa'],
                    dispute: false, attack_risk: true,
                    note: 'Cahora Bassa is key regional power supplier. Transmission lines attacked by insurgents.' },
  'Angola':       { score: 32, dams: ['Lauca Dam','Capanda Dam'],
                    dispute: false, attack_risk: false,
                    note: 'New large-capacity dams. Low conflict risk currently.' },
  'Nigeria':      { score: 35, dams: ['Kainji Dam','Shiroro Dam'],
                    dispute: false, attack_risk: true,
                    note: 'Kainji aging. Shiroro dam under threat from Boko Haram proximity.' },
  'Ghana':        { score: 30, dams: ['Akosombo Dam'],
                    dispute: false, attack_risk: false,
                    note: 'Akosombo level drop during drought severely cuts power generation.' },
  'Colombia':     { score: 35, dams: ['Hidroituango'],
                    dispute: false, attack_risk: true,
                    note: 'Hidroituango had partial collapse risk in 2018. ELN attacks on infrastructure.' },
  'Venezuela':    { score: 42, dams: ['Guri Dam'],
                    dispute: false, attack_risk: false,
                    note: 'Guri supplies 70% of Venezuela electricity. Drought-driven power rationing.' },
  'Brazil':       { score: 30, dams: ['Itaipu','Belo Monte'],
                    dispute: false, attack_risk: false,
                    note: 'Large hydroelectric capacity. Drought risk during La Nina years.' },
  'Peru':         { score: 35, dams: ['Mantaro cascade'],
                    dispute: false, attack_risk: false,
                    note: 'Glacier retreat threatens long-term water supply to dams.' },
  'Russia':       { score: 30, dams: ['Krasnoyarsk Dam','Bratsk Dam'],
                    dispute: false, attack_risk: true,
                    note: 'Siberian cascade largely secure. Ukraine cross-border attacks remain possibility.' },
  'Kazakhstan':   { score: 32, dams: ['Bukhtarma Dam','Shardara Dam'],
                    dispute: true,  attack_risk: false,
                    note: 'Amu Darya / Syr Darya upstream-downstream disputes with Kyrgyzstan/Tajikistan.' },
  'Kyrgyzstan':   { score: 38, dams: ['Toktogul Dam'],
                    dispute: true,  attack_risk: false,
                    note: 'Toktogul controls downstream Syr Darya flow into Kazakhstan/Uzbekistan.' },
  'Uzbekistan':   { score: 40, dams: ['Chardara Dam'],
                    dispute: true,  attack_risk: false,
                    note: 'Dependent on upstream Kyrgyz/Tajik dam releases for irrigation.' },
  'Turkey':       { score: 55, dams: ['Ataturk Dam','Keban Dam'],
                    dispute: true,  attack_risk: false,
                    note: 'Ataturk Dam controls Euphrates flow to Syria and Iraq — active dispute.' },
  'Saudi Arabia': { score: 15, dams: [],
                    dispute: false, attack_risk: false,
                    note: 'Minimal dam infrastructure. Desalination-dependent.' }
};

async function fetchDamRiskData(country) {
  try {
    const data = DAM_RISK_DATA[country];
    if (!data) return { score: 5, reason: 'no_dam_data', trend: 'stable' };

    let score = data.score;
    if (data.dispute)      score = Math.min(100, score + 8);
    if (data.attack_risk)  score = Math.min(100, score + 10);

    return {
      score,
      dams:        data.dams || [],
      dispute:     data.dispute,
      attack_risk: data.attack_risk,
      note:        data.note,
      trend:       score >= 70 ? 'critical' : score >= 45 ? 'elevated' : 'monitored'
    };

  } catch (err) {
    logToHive({ source: 'dam_risk_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { score: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchDamRiskData };
