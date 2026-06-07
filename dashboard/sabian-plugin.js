/**
 * sabian-plugin.js
 * Open MCT telemetry adapter for Sabian Intelligence Terminal
 *
 * Objects:
 *   sabian:root           — navigation root
 *   sabian:theater-*      — theater folders (AFRICOM, CENTCOM, EUCOM, INDOPACOM, SOUTHCOM)
 *   sabian:country-*      — country convergence score telemetry (160 countries)
 *   sabian-signal:{c}::{s} — individual signal telemetry under each country
 */

// ── Signals with historical data (52 signals) ────────────────────────────────
// Updated 2026-05-30 to match actual database contents
// NOTE: internet_shutdown_ioda excluded (0 readings in table)
const ALL_SIGNALS = [
  'cable_disruption','capital_flows','chokepoint','climate_stress','conflict',
  'corruption_risk','currency_collapse','cyber_threat','dam_risk','dark_vessel',
  'defense_spending','diaspora_remittance','displacement','economic_stress','election_calendar',
  'energy_stress','fao_food','fire_hotspot','flight_movement','flood_risk',
  'food_security','food_stress','gdelt_conflict','gdelt_tone','governance',
  'gps_jamming','health_crisis','imf_fiscal','iom_displacement','maritime_trade',
  'military_proximity','night_lights','occrp','ooni_internet','pipeline_risk',
  'port_congestion','power_grid','prediction_market','rail_corridor','resource_conflict',
  'sanctions_pressure','seismic_risk','social_unrest','social_volume','sovereign_cds',
  'structural_pressure','tor_censorship','trade_collapse','unhcr_odp','usda_food',
  'vdem_governance','water_stress'
];

// Signal categories for display grouping (52 signals)
const SIGNAL_CATEGORY = {
  // Institutional / Governance
  governance: 'institutional', vdem_governance: 'institutional', corruption_risk: 'institutional',
  election_calendar: 'institutional', occrp: 'institutional', ooni_internet: 'institutional',
  // Economic
  economic_stress: 'economic', capital_flows: 'economic', trade_collapse: 'economic',
  imf_fiscal: 'economic', currency_collapse: 'economic', sovereign_cds: 'economic',
  // Humanitarian
  displacement: 'humanitarian', unhcr_odp: 'humanitarian', structural_pressure: 'humanitarian',
  health_crisis: 'humanitarian', food_security: 'humanitarian', iom_displacement: 'humanitarian',
  // Conflict
  gdelt_conflict: 'conflict', gdelt_tone: 'conflict', conflict: 'conflict',
  military_proximity: 'conflict', resource_conflict: 'conflict', social_unrest: 'conflict',
  defense_spending: 'conflict', gps_jamming: 'conflict',
  // Infrastructure
  power_grid: 'infrastructure', pipeline_risk: 'infrastructure', rail_corridor: 'infrastructure',
  port_congestion: 'infrastructure', dam_risk: 'infrastructure', chokepoint: 'infrastructure',
  maritime_trade: 'infrastructure', cable_disruption: 'infrastructure', flight_movement: 'infrastructure',
  // Environmental
  fire_hotspot: 'environmental', seismic_risk: 'environmental', flood_risk: 'environmental',
  water_stress: 'environmental', energy_stress: 'environmental', climate_stress: 'environmental',
  // Behavioral / Predictive
  night_lights: 'behavioral', diaspora_remittance: 'behavioral', fao_food: 'behavioral',
  food_stress: 'behavioral', usda_food: 'behavioral', social_volume: 'behavioral',
  prediction_market: 'behavioral',
  // Geopolitical
  sanctions_pressure: 'geopolitical', tor_censorship: 'geopolitical',
  cyber_threat: 'geopolitical', dark_vessel: 'geopolitical'
};

// ── Theater → country mapping ─────────────────────────────────────────────────
const THEATER_MAP = {
  AFRICOM: [
    'Mali','Burkina Faso','Niger','Sudan','Ethiopia','Somalia','DRC','CAR','Chad',
    'Nigeria','Mozambique','Libya','South Sudan','Cameroon','Zimbabwe','Zambia',
    'Tanzania','Senegal','Guinea','Kenya','Uganda','Eritrea','Djibouti',
    'Angola','Rwanda','Burundi','Malawi','Guinea-Bissau','Sierra Leone','Liberia',
    'Togo','Benin','Mauritania','Tunisia','Algeria','Morocco','Egypt',
    'Ghana','Ivory Coast','Gabon','Congo','Equatorial Guinea','Namibia','Botswana',
    'South Africa'
  ],
  CENTCOM: [
    'Yemen','Syria','Iraq','Afghanistan','Pakistan','Iran','Lebanon','Israel','Palestine',
    'Jordan','Saudi Arabia','UAE','Qatar','Bahrain','Kuwait','Oman',
    'Kazakhstan','Kyrgyzstan','Tajikistan','Turkmenistan','Uzbekistan','Azerbaijan'
  ],
  EUCOM: [
    'Ukraine','Armenia','Georgia','Kosovo','Bosnia','Russia','Belarus','Moldova',
    'Serbia','Albania','North Macedonia','Montenegro','Bulgaria','Romania',
    'Hungary','Poland','Slovakia','Croatia','Turkey','Greece','Cyprus',
    'UK','France','Germany','Spain','Italy','Portugal','Sweden','Finland',
    'Norway','Denmark','Netherlands','Belgium','Austria','Switzerland'
  ],
  INDOPACOM: [
    'Myanmar','Bangladesh','Sri Lanka','Taiwan','North Korea','South Korea',
    'China','Japan','Mongolia','Philippines','Indonesia','Vietnam','Cambodia',
    'Laos','Thailand','Malaysia','Singapore','Nepal','India','Timor-Leste',
    'Papua New Guinea','Solomon Islands','Fiji','Australia','New Zealand'
  ],
  SOUTHCOM: [
    'Venezuela','Colombia','Haiti','Ecuador','Bolivia','Peru','Brazil',
    'Argentina','Chile','Paraguay','Uruguay','Guyana','Suriname',
    'Trinidad and Tobago','Panama','Costa Rica','Nicaragua','Honduras',
    'Guatemala','El Salvador','Cuba','Dominican Republic','Jamaica','Belize','Mexico'
  ],
  NORTHCOM: [
    'United States'
  ]
};

const ALL_THEATER_COUNTRIES = Object.values(THEATER_MAP).flat();

function getTheater(country) {
  for (const [t, countries] of Object.entries(THEATER_MAP)) {
    if (countries.includes(country)) return t;
  }
  return 'GLOBAL';
}

function countryKey(name) {
  return 'country-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

function theaterKey(theater) {
  return 'theater-' + theater.toLowerCase();
}

// Signal namespace key: "{country}::{signal}"
function signalNsKey(country, signal) {
  return country + '::' + signal;
}

// ── Plugin factory ─────────────────────────────────────────────────────────────

function SabianPlugin(options = {}) {
  const API = options.apiBase || '/public-api';

  return function install(openmct) {

    // ── Domain object types ───────────────────────────────────────────────────

    openmct.types.addType('sabian.country', {
      name:        'Country Risk Score',
      description: 'Sabian convergence score 0–100 time series',
      cssClass:    'icon-telemetry',
      creatable:   false
    });

    openmct.types.addType('sabian.theater', {
      name:      'Theater',
      cssClass:  'icon-folder',
      creatable: false
    });

    openmct.types.addType('sabian.signal', {
      name:        'Signal Telemetry',
      description: 'Individual signal reading over time',
      cssClass:    'icon-telemetry-aggregate',
      creatable:   false
    });

    // ── Country objects ───────────────────────────────────────────────────────

    const allCountries = [...ALL_THEATER_COUNTRIES];

    const countryObjects = {};
    for (const name of allCountries) {
      const key = countryKey(name);
      countryObjects[key] = {
        identifier: { namespace: 'sabian', key },
        type:       'sabian.country',
        name,
        theater:    getTheater(name),
        telemetry: {
          values: [
            { key: 'utc',        name: 'Timestamp',  format: 'utc',    hints: { domain: 1 } },
            { key: 'value',      name: 'Risk Score', format: 'number', hints: { range: 1, priority: 1 }, min: 0, max: 100 },
            { key: 'risk_level', name: 'Risk Level', format: 'string', hints: { range: 2 } },
            { key: 'freshness',  name: 'Freshness%', format: 'number', hints: { range: 3 } }
          ]
        }
      };
    }

    // ── Theater objects ───────────────────────────────────────────────────────

    const theaterObjects = {};
    for (const theater of [...Object.keys(THEATER_MAP), 'GLOBAL']) {
      const key = theaterKey(theater);
      theaterObjects[key] = {
        identifier:  { namespace: 'sabian', key },
        type:        'sabian.theater',
        name:        theater,
        composition: []
      };
    }

    // ── Root object ───────────────────────────────────────────────────────────

    const rootObject = {
      identifier:  { namespace: 'sabian', key: 'root' },
      type:        'folder',
      name:        'Sabian Intelligence Terminal',
      composition: Object.keys(theaterObjects).map(k => ({ namespace: 'sabian', key: k }))
    };

    // ── Object provider — sabian namespace ───────────────────────────────────

    openmct.objects.addProvider('sabian', {
      get(identifier) {
        const key = identifier.key;
        if (key === 'root')            return Promise.resolve(rootObject);
        if (countryObjects[key])       return Promise.resolve(countryObjects[key]);
        if (theaterObjects[key])       return Promise.resolve(theaterObjects[key]);
        return Promise.reject(new Error('Unknown Sabian object: ' + key));
      }
    });

    // ── Object provider — sabian-signal namespace ─────────────────────────────
    // Key format: "{countryName}::{signalName}"

    openmct.objects.addProvider('sabian-signal', {
      get(identifier) {
        const [country, signal] = identifier.key.split('::');
        if (!country || !signal) return Promise.reject(new Error('Invalid signal key'));
        const category = SIGNAL_CATEGORY[signal] || 'other';
        return Promise.resolve({
          identifier,
          type: 'sabian.signal',
          name: signal.replace(/_/g, ' '),
          country,
          signal,
          category,
          telemetry: {
            values: [
              { key: 'utc',   name: 'Year',        format: 'utc',    hints: { domain: 1 } },
              { key: 'value', name: 'Signal Value', format: 'number', hints: { range: 1, priority: 1 } }
            ]
          }
        });
      }
    });

    // ── Composition provider ──────────────────────────────────────────────────

    openmct.composition.addProvider({
      appliesTo(obj) {
        return obj.identifier.namespace === 'sabian' &&
               (obj.type === 'sabian.theater' || obj.identifier.key === 'root' || obj.type === 'sabian.country');
      },
      load(obj) {
        // Root → theaters
        if (obj.identifier.key === 'root') {
          return Promise.resolve(
            [...Object.keys(THEATER_MAP), 'GLOBAL'].map(t => ({ namespace: 'sabian', key: theaterKey(t) }))
          );
        }
        // Theater → countries
        if (obj.type === 'sabian.theater') {
          const theaterName = obj.name;
          if (theaterName === 'GLOBAL') {
            const globalCountries = allCountries.filter(c => !ALL_THEATER_COUNTRIES.includes(c));
            return Promise.resolve(globalCountries.map(c => ({ namespace: 'sabian', key: countryKey(c) })));
          }
          const countries = THEATER_MAP[theaterName] || [];
          return Promise.resolve(countries.map(c => ({ namespace: 'sabian', key: countryKey(c) })));
        }
        // Country → signal objects
        if (obj.type === 'sabian.country') {
          const country = obj.name;
          return Promise.resolve(
            ALL_SIGNALS.map(signal => ({ namespace: 'sabian-signal', key: signalNsKey(country, signal) }))
          );
        }
        return Promise.resolve([]);
      }
    });

    // ── Root registration ─────────────────────────────────────────────────────

    openmct.objects.addRoot({ namespace: 'sabian', key: 'root' });

    // ── Telemetry provider — country score ────────────────────────────────────

    openmct.telemetry.addProvider({

      supportsRequest(obj) {
        return obj.identifier.namespace === 'sabian' && obj.type === 'sabian.country';
      },

      async request(obj) {
        const name = obj.name;
        try {
          const resp = await fetch(`${API}/country/${encodeURIComponent(name)}?days=90`);
          if (!resp.ok) return [];
          const data = await resp.json();
          return (data.history || [])
            .filter(h => h.convergence_score !== null && h.scan_date)
            .sort((a, b) => new Date(a.scan_date) - new Date(b.scan_date))
            .map(h => ({
              utc:        new Date(h.scan_date).getTime(),
              value:      h.convergence_score,
              risk_level: h.risk_level || '',
              freshness:  h.freshness_pct || 0
            }));
        } catch { return []; }
      },

      supportsSubscribe(obj) {
        return obj.identifier.namespace === 'sabian' && obj.type === 'sabian.country';
      },

      subscribe(obj, callback) {
        const name = obj.name;
        const poll = async () => {
          try {
            const resp = await fetch(`${API}/threats`);
            if (!resp.ok) return;
            const data = await resp.json();
            const entry = (data.countries || []).find(c => c.country === name);
            if (entry && entry.convergence_score !== null) {
              callback({
                utc:        new Date(entry.scan_date || Date.now()).getTime(),
                value:      entry.convergence_score,
                risk_level: entry.risk_level || '',
                freshness:  entry.freshness_pct || 0
              });
            }
          } catch { /* ignore */ }
        };
        poll();
        const interval = setInterval(poll, 5 * 60 * 1000);
        return () => clearInterval(interval);
      },

      supportsLimits(obj) {
        return obj.identifier.namespace === 'sabian' && obj.type === 'sabian.country';
      },

      getLimitEvaluator() {
        return {
          evaluate(datum) {
            const v = datum.value;
            if (v >= 81) return { cssClass: 'is-limit--red',    name: 'CRITICAL' };
            if (v >= 66) return { cssClass: 'is-limit--yellow', name: 'WARNING'  };
            if (v >= 41) return { cssClass: 'is-limit--cyan',   name: 'ELEVATED' };
            return null;
          }
        };
      }
    });

    // ── Telemetry provider — individual signal ────────────────────────────────

    openmct.telemetry.addProvider({

      supportsRequest(obj) {
        return obj.identifier.namespace === 'sabian-signal' && obj.type === 'sabian.signal';
      },

      async request(obj) {
        const { country, signal } = obj;
        if (!country || !signal) return [];
        try {
          const resp = await fetch(
            `${API}/signal/${encodeURIComponent(country)}/${encodeURIComponent(signal)}`
          );
          if (!resp.ok) return [];
          const data = await resp.json();
          return (data.readings || [])
            .filter(r => r.value !== null && r.value !== undefined)
            .map(r => ({ utc: r.utc, value: r.value }));
        } catch { return []; }
      },

      supportsSubscribe(obj) {
        return obj.identifier.namespace === 'sabian-signal' && obj.type === 'sabian.signal';
      },

      subscribe() {
        // Signals are annual — no live subscription needed
        return () => {};
      }
    });

  };
}

window.SabianPlugin = SabianPlugin;
