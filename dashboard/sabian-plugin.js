/**
 * sabian-plugin.js
 * Open MCT telemetry adapter for Sabian Intelligence Terminal
 *
 * Wires the Sabian API into Open MCT's domain object + telemetry system.
 * Consumes /public-api/* (no auth required — read-only surface).
 *
 * Objects registered:
 *   sabian:root          — navigation root
 *   sabian:theater-*     — theater folders (AFRICOM, CENTCOM, EUCOM, INDOPACOM, SOUTHCOM)
 *   sabian:country-*     — country telemetry objects (160 countries)
 *   sabian:ledger-root   — observation ledger folder
 */

// ── Theater → country mapping (mirrors global_scan.cjs getTheater()) ──────────
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
  ]
};

// Countries not in any theater → GLOBAL
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

// ── Risk level → Open MCT limit definitions ────────────────────────────────────
const LIMITS = {
  CRITICAL: { cssClass: 'is-limit--red',    name: 'CRITICAL' },
  WARNING:  { cssClass: 'is-limit--yellow', name: 'WARNING'  },
  ELEVATED: { cssClass: 'is-limit--cyan',   name: 'ELEVATED' }
};

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

    // ── All country domain objects ────────────────────────────────────────────

    const allCountries = Object.values(THEATER_MAP).flat();
    // Add United States (GLOBAL theater)
    if (!allCountries.includes('United States')) allCountries.push('United States');

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
            { key: 'utc',         name: 'Timestamp',   format: 'utc',    hints: { domain: 1 } },
            { key: 'value',       name: 'Risk Score',  format: 'number', hints: { range: 1, priority: 1 },
              min: 0, max: 100 },
            { key: 'risk_level',  name: 'Risk Level',  format: 'string', hints: { range: 2 } },
            { key: 'freshness',   name: 'Freshness %', format: 'number', hints: { range: 3 } }
          ]
        }
      };
    }

    // Theater folder objects
    const theaterObjects = {};
    for (const theater of [...Object.keys(THEATER_MAP), 'GLOBAL']) {
      const key = theaterKey(theater);
      theaterObjects[key] = {
        identifier:  { namespace: 'sabian', key },
        type:        'sabian.theater',
        name:        theater,
        composition: []  // filled by composition provider
      };
    }

    // Root object
    const rootObject = {
      identifier:  { namespace: 'sabian', key: 'root' },
      type:        'folder',
      name:        'Sabian Intelligence Terminal',
      composition: Object.keys(theaterObjects).map(k => ({ namespace: 'sabian', key: k }))
    };

    // ── Object provider ───────────────────────────────────────────────────────

    openmct.objects.addProvider('sabian', {
      get(identifier) {
        const key = identifier.key;
        if (key === 'root') return Promise.resolve(rootObject);
        if (countryObjects[key]) return Promise.resolve(countryObjects[key]);
        if (theaterObjects[key]) return Promise.resolve(theaterObjects[key]);
        return Promise.reject(new Error('Unknown Sabian object: ' + key));
      }
    });

    // ── Composition provider ──────────────────────────────────────────────────
    // Returns children of theater folders and root

    openmct.composition.addProvider({
      appliesTo(obj) {
        return obj.identifier.namespace === 'sabian' &&
               (obj.type === 'sabian.theater' || obj.key === 'root');
      },
      load(obj) {
        if (obj.identifier.key === 'root') {
          return Promise.resolve(
            [...Object.keys(THEATER_MAP), 'GLOBAL'].map(t => ({ namespace: 'sabian', key: theaterKey(t) }))
          );
        }
        // Theater → its countries
        const theaterName = obj.name;  // e.g. 'AFRICOM'
        const countries   = THEATER_MAP[theaterName] || [];
        if (theaterName === 'GLOBAL') {
          const globalCountries = allCountries.filter(c => !ALL_THEATER_COUNTRIES.includes(c));
          return Promise.resolve(globalCountries.map(c => ({ namespace: 'sabian', key: countryKey(c) })));
        }
        return Promise.resolve(countries.map(c => ({ namespace: 'sabian', key: countryKey(c) })));
      }
    });

    // ── Root registration ─────────────────────────────────────────────────────

    openmct.objects.addRoot({ namespace: 'sabian', key: 'root' });

    // ── Telemetry provider — historical ───────────────────────────────────────

    openmct.telemetry.addProvider({

      supportsRequest(obj) {
        return obj.identifier.namespace === 'sabian' && obj.type === 'sabian.country';
      },

      async request(obj, options) {
        const name = obj.name;
        const days = 90;
        try {
          const resp = await fetch(`${API}/country/${encodeURIComponent(name)}?days=${days}`);
          if (!resp.ok) return [];
          const data = await resp.json();
          const history = data.history || [];
          // Sort ascending by date for Open MCT timeline
          return history
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

      // ── Realtime subscription — polls /threats every 5 minutes ─────────────

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
          } catch { /* ignore fetch errors in subscription */ }
        };

        poll(); // fire immediately on subscribe
        const interval = setInterval(poll, 5 * 60 * 1000); // every 5 minutes
        return () => clearInterval(interval);
      },

      // ── Limit evaluator — colors score by risk band ───────────────────────

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

  };
}

// Expose globally for script-tag loading
window.SabianPlugin = SabianPlugin;
