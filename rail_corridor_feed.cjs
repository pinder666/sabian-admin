// rail_corridor_feed.cjs
// Rail Corridor Risk Signal — strategic rail infrastructure vulnerability
// Source: OpenRailwayMap data (OSM-derived) + curated strategic corridor index
// Score 0–100: higher = country has strategic rail at risk of disruption
// Logic: Rail corridors are critical for food, military logistics, and energy.
//   Trans-Siberian, Beira Corridor, Horn of Africa, CPEC rail — all move
//   grain, troops, and fuel. Disruption precedes humanitarian crises by days.
// Cadence: static — update quarterly

require('dotenv').config({ path: './.env' });
const { logToHive } = require('./logger.cjs');

// Strategic rail corridor index per country
// rail_km: operational km (OSM-derived estimate)
// strategic_score: how critical to national/regional logistics (0-100)
// corridor: named strategic corridor the country participates in
// attack_risk: active conflict near rail lines
const RAIL_DATA = {
  // High-strategic rail nations
  'Russia':       { rail_km: 85600,  strategic_score: 88, corridor: 'Trans-Siberian / North-South',        attack_risk: true  },
  'Ukraine':      { rail_km: 19800,  strategic_score: 85, corridor: 'East-West European corridor',          attack_risk: true  },
  'China':        { rail_km: 155000, strategic_score: 82, corridor: 'Belt & Road / Eurasian Land Bridge',    attack_risk: false },
  'Kazakhstan':   { rail_km: 16000,  strategic_score: 72, corridor: 'Trans-Caspian / INSTC',               attack_risk: false },
  'Pakistan':     { rail_km: 11900,  strategic_score: 68, corridor: 'CPEC rail (under construction)',       attack_risk: true  },
  'India':        { rail_km: 68000,  strategic_score: 75, corridor: 'Delhi-Mumbai / Northeast corridors',   attack_risk: false },
  'Iran':         { rail_km: 11100,  strategic_score: 65, corridor: 'INSTC / Trans-Asian railway',          attack_risk: false },
  'Turkey':       { rail_km: 13000,  strategic_score: 70, corridor: 'Baku-Tbilisi-Kars / Europe-Asia',      attack_risk: false },
  'Ethiopia':     { rail_km: 660,    strategic_score: 58, corridor: 'Addis-Djibouti (Ethio-Djibouti)',      attack_risk: true  },
  'Djibouti':     { rail_km: 97,     strategic_score: 72, corridor: 'Ethio-Djibouti (Horn gateway)',        attack_risk: false },
  'Kenya':        { rail_km: 3900,   strategic_score: 60, corridor: 'SGR Mombasa-Nairobi-Malaba',           attack_risk: false },
  'Tanzania':     { rail_km: 4000,   strategic_score: 55, corridor: 'TAZARA / Central Corridor',            attack_risk: false },
  'Mozambique':   { rail_km: 3000,   strategic_score: 58, corridor: 'Beira Corridor / Nacala Corridor',     attack_risk: true  },
  'DRC':          { rail_km: 4100,   strategic_score: 50, corridor: 'Lobito Corridor (in development)',     attack_risk: true  },
  'Zambia':       { rail_km: 3130,   strategic_score: 52, corridor: 'TAZARA / Lobito Corridor',             attack_risk: false },
  'Angola':       { rail_km: 2750,   strategic_score: 55, corridor: 'Lobito Corridor (Benguela railway)',   attack_risk: false },
  'South Africa': { rail_km: 20500,  strategic_score: 70, corridor: 'North-South Corridor',                 attack_risk: false },
  'Nigeria':      { rail_km: 3500,   strategic_score: 55, corridor: 'Lagos-Kano / Abuja-Kaduna',            attack_risk: true  },
  'Sudan':        { rail_km: 5500,   strategic_score: 48, corridor: 'Port Sudan corridor',                  attack_risk: true  },
  'Egypt':        { rail_km: 9800,   strategic_score: 60, corridor: 'Suez industrial corridor',             attack_risk: false },
  'Myanmar':      { rail_km: 6000,   strategic_score: 55, corridor: 'Trans-Asian railway (gap country)',    attack_risk: true  },
  'Vietnam':      { rail_km: 3100,   strategic_score: 50, corridor: 'North-South Reunification Express',    attack_risk: false },
  'Malaysia':     { rail_km: 1600,   strategic_score: 48, corridor: 'ECRL (East Coast Rail Link)',          attack_risk: false },
  'Thailand':     { rail_km: 4100,   strategic_score: 52, corridor: 'Thailand-China high-speed link',       attack_risk: false },
  'Laos':         { rail_km: 420,    strategic_score: 60, corridor: 'Laos-China Railway (Vientiane-Boten)', attack_risk: false },
  'Poland':       { rail_km: 19000,  strategic_score: 68, corridor: 'NATO Eastern Flank logistics',         attack_risk: false },
  'Germany':      { rail_km: 41000,  strategic_score: 72, corridor: 'European core network / Rhine-Alpine',  attack_risk: false },
  'Serbia':       { rail_km: 3800,   strategic_score: 55, corridor: 'Belgrade-Budapest (SEETO Corridor X)',  attack_risk: false },
  'Hungary':      { rail_km: 8100,   strategic_score: 58, corridor: 'TEN-T Orient/East-Med Corridor',        attack_risk: false },
  'Belarus':      { rail_km: 5500,   strategic_score: 65, corridor: 'Russia-Europe transit (sanctioned)',   attack_risk: false },
  'Georgia':      { rail_km: 1400,   strategic_score: 60, corridor: 'Baku-Tbilisi-Kars (BTK)',              attack_risk: false },
  'Azerbaijan':   { rail_km: 2100,   strategic_score: 62, corridor: 'BTK / Trans-Caspian',                  attack_risk: false },
  'Uzbekistan':   { rail_km: 4600,   strategic_score: 55, corridor: 'Trans-Afghan (proposed)',              attack_risk: false },
  'Afghanistan':  { rail_km: 75,     strategic_score: 45, corridor: 'Trans-Afghan railway (isolated)',      attack_risk: true  },
  'Iraq':         { rail_km: 2300,   strategic_score: 50, corridor: 'Development Road (Faw-Turkey)',         attack_risk: true  },
  'Colombia':     { rail_km: 3000,   strategic_score: 45, corridor: 'Pacific Corridor (degraded)',          attack_risk: true  },
  'Brazil':       { rail_km: 30000,  strategic_score: 65, corridor: 'Santos / Paranagua port corridors',    attack_risk: false },
  'Argentina':    { rail_km: 36900,  strategic_score: 55, corridor: 'Belgrano Cargas (grain export)',       attack_risk: false },
  'Mexico':       { rail_km: 27000,  strategic_score: 62, corridor: 'NAFTA rail corridor (KCS/KCSM)',       attack_risk: true  },
  'Indonesia':    { rail_km: 5700,   strategic_score: 52, corridor: 'Java corridor / Sumatra network',      attack_risk: false }
};

async function fetchRailCorridorData(country) {
  try {
    const data = RAIL_DATA[country];
    if (!data) return { score: 0, reason: 'no_rail_data', trend: 'stable' };

    let score = Math.round(data.strategic_score * 0.55);

    // km bonus (log-scaled, capped at 20)
    const kmBonus = Math.min(20, Math.round(Math.log10(data.rail_km + 1) * 5));
    score = Math.min(100, score + kmBonus);

    // Active conflict near rail amplifies risk
    if (data.attack_risk) score = Math.min(100, score + 15);

    return {
      score,
      rail_km:         data.rail_km,
      strategic_score: data.strategic_score,
      corridor:        data.corridor,
      attack_risk:     data.attack_risk,
      trend:           score >= 70 ? 'critical_corridor' : score >= 45 ? 'elevated' : 'monitored'
    };

  } catch (err) {
    logToHive({ source: 'rail_corridor_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { score: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchRailCorridorData };
