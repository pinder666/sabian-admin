// convergence_engine.cjs
// Sabian DOD vertical — multi-signal convergence scoring
// Accepts: { country, date } — date is optional, defaults to latest available
// Returns: convergence_score 0-100, risk_level, top_3 signals, threshold_window
// Score bands: 0-40 STABLE | 41-65 ELEVATED | 66-80 WARNING | 81-100 CRITICAL

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');
const fetchFoodSecurity = require('./fews_food_security.cjs');
const fetchGovernance = require('./worldbank_governance.cjs');
const fetchDisplacement = require('./unhcr_displacement_feed.cjs');
const fetchImportData = require('./comtrade_import_feed.cjs');
const fetchImfDots = require('./imf_dots_feed.cjs');
const { fetchConflictData } = require('./acled_conflict_feed.cjs');
const fetchGdeltConflict = require('./gdelt_conflict_feed.cjs');
const fetchFireHotspots = require('./firms_fire_feed.cjs');
const fetchResourceConflict = require('./resource_conflict_feed.cjs');
const fetchSeismicRisk = require('./seismic_risk_feed.cjs');
const fetchOoni = require('./ooni_feed.cjs');
const fetchImfFiscal = require('./imf_fiscal_feed.cjs');
const fetchMaritime = require('./unctad_maritime_feed.cjs');
const { fetchGpsJammingData }       = require('./gps_jamming_feed.cjs');
const { fetchSocialUnrestData }     = require('./social_unrest_feed.cjs');
const { fetchSanctionsData }        = require('./sanctions_feed.cjs');
const { fetchCurrencyCollapseData }    = require('./exchangerate_feed.cjs');
const { fetchFlightMovementData }      = require('./opensky_feed.cjs');
const { fetchHealthCrisisData }        = require('./who_health_feed.cjs');
const { fetchEnergyStressData }        = require('./eia_energy_feed.cjs');
const { fetchCapitalFlowsData }        = require('./fred_capital_feed.cjs');
const { fetchMilitaryProximityData }   = require('./military_proximity_feed.cjs');
const { fetchChokepointData }          = require('./chokepoint_feed.cjs');
const { fetchGdeltGkgData }            = require('./gdelt_gkg_feed.cjs');

// ISO2 codes — used by FEWS, World Bank, OONI, and IMF queries
// All 160 monitored countries (159 global watch list + United States)
const COUNTRY_ISO = {
  // Active conflicts
  'Mali': 'ML',        'Burkina Faso': 'BF', 'Niger': 'NE',       'Sudan': 'SD',
  'Ethiopia': 'ET',    'Myanmar': 'MM',      'Venezuela': 'VE',   'Somalia': 'SO',
  'DRC': 'CD',         'CAR': 'CF',          'Chad': 'TD',         'Nigeria': 'NG',
  'Mozambique': 'MZ',  'Libya': 'LY',        'Haiti': 'HT',        'Yemen': 'YE',
  'Afghanistan': 'AF', 'Syria': 'SY',        'Iraq': 'IQ',         'South Sudan': 'SS',
  'Israel': 'IL',      'Palestine': 'PS',    'Ukraine': 'UA',      'Colombia': 'CO',
  'Lebanon': 'LB',     'Pakistan': 'PK',     'Cameroon': 'CM',     'Armenia': 'AM',
  'Georgia': 'GE',     'Russia': 'RU',       'Philippines': 'PH',  'Indonesia': 'ID',
  'Mexico': 'MX',
  // Threshold watch
  'Iran': 'IR',        'Zimbabwe': 'ZW',     'Bangladesh': 'BD',   'Sri Lanka': 'LK',
  'Kenya': 'KE',       'Uganda': 'UG',       'Tanzania': 'TZ',     'Zambia': 'ZM',
  'Senegal': 'SN',     'Guinea': 'GN',       'Ecuador': 'EC',      'Bolivia': 'BO',
  'Eritrea': 'ER',     'Djibouti': 'DJ',     'Kosovo': 'XK',       'Bosnia': 'BA',
  'Taiwan': 'TW',      'North Korea': 'KP',  'Belarus': 'BY',      'Moldova': 'MD',
  'Serbia': 'RS',      'Azerbaijan': 'AZ',   'Kyrgyzstan': 'KG',   'Tajikistan': 'TJ',
  'Turkmenistan': 'TM','Uzbekistan': 'UZ',   'Kazakhstan': 'KZ',   'Peru': 'PE',
  'Brazil': 'BR',      'Nicaragua': 'NI',    'Honduras': 'HN',     'Guatemala': 'GT',
  'El Salvador': 'SV', 'Cuba': 'CU',         'Angola': 'AO',       'Rwanda': 'RW',
  'Burundi': 'BI',     'Malawi': 'MW',       'Guinea-Bissau': 'GW','Sierra Leone': 'SL',
  'Liberia': 'LR',     'Togo': 'TG',         'Benin': 'BJ',        'Mauritania': 'MR',
  'Tunisia': 'TN',     'Algeria': 'DZ',      'Morocco': 'MA',      'Egypt': 'EG',
  'Jordan': 'JO',      'Saudi Arabia': 'SA', 'Oman': 'OM',         'Kuwait': 'KW',
  'Vietnam': 'VN',     'Cambodia': 'KH',     'Laos': 'LA',         'Nepal': 'NP',
  'India': 'IN',       'Timor-Leste': 'TL',  'Papua New Guinea': 'PG',
  'Solomon Islands': 'SB', 'Fiji': 'FJ',
  // Global watch
  'Turkey': 'TR',      'Greece': 'GR',       'Bulgaria': 'BG',     'Romania': 'RO',
  'Hungary': 'HU',     'Poland': 'PL',       'Slovakia': 'SK',     'Croatia': 'HR',
  'North Macedonia': 'MK', 'Montenegro': 'ME', 'Albania': 'AL',
  'China': 'CN',       'South Korea': 'KR',  'Japan': 'JP',        'Mongolia': 'MN',
  'Thailand': 'TH',    'Malaysia': 'MY',     'Singapore': 'SG',    'Australia': 'AU',
  'New Zealand': 'NZ', 'South Africa': 'ZA', 'Ghana': 'GH',
  'Ivory Coast': 'CI', 'Gabon': 'GA',        'Congo': 'CG',        'Equatorial Guinea': 'GQ',
  'Namibia': 'NA',     'Botswana': 'BW',
  'Argentina': 'AR',   'Chile': 'CL',        'Paraguay': 'PY',     'Uruguay': 'UY',
  'Guyana': 'GY',      'Suriname': 'SR',     'Trinidad and Tobago': 'TT',
  'Panama': 'PA',      'Costa Rica': 'CR',   'Dominican Republic': 'DO',
  'Jamaica': 'JM',     'Belize': 'BZ',
  'UAE': 'AE',         'Qatar': 'QA',        'Bahrain': 'BH',
  'UK': 'GB',          'France': 'FR',       'Germany': 'DE',      'Spain': 'ES',
  'Italy': 'IT',       'Portugal': 'PT',     'Sweden': 'SE',       'Finland': 'FI',
  'Norway': 'NO',      'Denmark': 'DK',      'Netherlands': 'NL',  'Belgium': 'BE',
  'Austria': 'AT',     'Switzerland': 'CH',  'Cyprus': 'CY',
  // United States — best-lit node: FRED, SEC, EIA
  'United States': 'US'
};

// Geographic center coordinates for Open-Meteo climate queries
// All 160 monitored countries — missing coords return null, never a fake score
const COUNTRY_COORDS = {
  // Active conflicts
  'Mali':          { lat: 17.5707, lon:  -3.9962 },
  'Burkina Faso':  { lat: 12.3644, lon:  -1.5353 },
  'Niger':         { lat: 17.6078, lon:   8.0817 },
  'Sudan':         { lat: 15.5007, lon:  32.5599 },
  'Ethiopia':      { lat:  9.1450, lon:  40.4897 },
  'Myanmar':       { lat: 19.1633, lon:  96.7742 },
  'Venezuela':     { lat:  6.4238, lon: -66.5897 },
  'Somalia':       { lat:  5.1521, lon:  46.1996 },
  'DRC':           { lat: -4.0383, lon:  21.7587 },
  'CAR':           { lat:  6.6111, lon:  20.9394 },
  'Chad':          { lat: 15.4542, lon:  18.7322 },
  'Nigeria':       { lat:  9.0820, lon:   8.6753 },
  'Mozambique':    { lat:-18.6657, lon:  35.5296 },
  'Libya':         { lat: 26.3351, lon:  17.2283 },
  'Haiti':         { lat: 18.9712, lon: -72.2852 },
  'Yemen':         { lat: 15.5527, lon:  48.5164 },
  'Afghanistan':   { lat: 33.9391, lon:  67.7100 },
  'Syria':         { lat: 34.8021, lon:  38.9968 },
  'South Sudan':   { lat:  6.8770, lon:  31.3070 },
  'Israel':        { lat: 31.5000, lon:  34.8000 },
  'Palestine':     { lat: 31.9000, lon:  35.2000 },
  'Ukraine':       { lat: 48.3794, lon:  31.1656 },
  'Colombia':      { lat:  4.5709, lon: -74.2973 },
  'Lebanon':       { lat: 33.8547, lon:  35.8623 },
  'Iraq':          { lat: 33.2232, lon:  43.6793 },
  'Pakistan':      { lat: 30.3753, lon:  69.3451 },
  'Cameroon':      { lat:  3.8480, lon:  11.5021 },
  'Armenia':       { lat: 40.0691, lon:  45.0382 },
  'Georgia':       { lat: 42.3154, lon:  43.3569 },
  'Russia':        { lat: 61.5240, lon: 105.3188 },
  'Philippines':   { lat: 12.8797, lon: 121.7740 },
  'Indonesia':     { lat: -0.7893, lon: 113.9213 },
  'Mexico':        { lat: 23.6345, lon:-102.5528 },
  // Threshold watch
  'Iran':          { lat: 32.4279, lon:  53.6880 },
  'Zimbabwe':      { lat:-19.0154, lon:  29.1549 },
  'Bangladesh':    { lat: 23.6850, lon:  90.3563 },
  'Sri Lanka':     { lat:  7.8731, lon:  80.7718 },
  'Kenya':         { lat: -1.2921, lon:  36.8219 },
  'Uganda':        { lat:  1.3733, lon:  32.2903 },
  'Tanzania':      { lat: -6.3690, lon:  34.8888 },
  'Zambia':        { lat:-13.1339, lon:  27.8493 },
  'Senegal':       { lat: 14.4974, lon: -14.4524 },
  'Guinea':        { lat: 11.0041, lon: -10.9408 },
  'Ecuador':       { lat: -1.8312, lon: -78.1834 },
  'Bolivia':       { lat:-16.2902, lon: -63.5887 },
  'Eritrea':       { lat: 15.1794, lon:  39.7823 },
  'Djibouti':      { lat: 11.8251, lon:  42.5903 },
  'Kosovo':        { lat: 42.6026, lon:  20.9030 },
  'Bosnia':        { lat: 43.9159, lon:  17.6791 },
  'Taiwan':        { lat: 23.6978, lon: 120.9605 },
  'North Korea':   { lat: 40.3399, lon: 127.5101 },
  'Belarus':       { lat: 53.7098, lon:  27.9534 },
  'Moldova':       { lat: 47.4116, lon:  28.3699 },
  'Serbia':        { lat: 44.0165, lon:  21.0059 },
  'Azerbaijan':    { lat: 40.1431, lon:  47.5769 },
  'Kyrgyzstan':    { lat: 41.2044, lon:  74.7661 },
  'Tajikistan':    { lat: 38.8610, lon:  71.2761 },
  'Turkmenistan':  { lat: 38.9697, lon:  59.5563 },
  'Uzbekistan':    { lat: 41.3775, lon:  64.5853 },
  'Kazakhstan':    { lat: 48.0196, lon:  66.9237 },
  'Peru':          { lat: -9.1900, lon: -75.0152 },
  'Brazil':        { lat:-14.2350, lon: -51.9253 },
  'Nicaragua':     { lat: 12.8654, lon: -85.2072 },
  'Honduras':      { lat: 15.1999, lon: -86.2419 },
  'Guatemala':     { lat: 15.7835, lon: -90.2308 },
  'El Salvador':   { lat: 13.7942, lon: -88.8965 },
  'Cuba':          { lat: 21.5218, lon: -77.7812 },
  'Angola':        { lat:-11.2027, lon:  17.8739 },
  'Rwanda':        { lat: -1.9403, lon:  29.8739 },
  'Burundi':       { lat: -3.3731, lon:  29.9189 },
  'Malawi':        { lat:-13.2543, lon:  34.3015 },
  'Guinea-Bissau': { lat: 11.8037, lon: -15.1804 },
  'Sierra Leone':  { lat:  8.4657, lon: -11.7799 },
  'Liberia':       { lat:  6.4281, lon:  -9.4295 },
  'Togo':          { lat:  8.6195, lon:   0.8248 },
  'Benin':         { lat:  9.3077, lon:   2.3158 },
  'Mauritania':    { lat: 21.0079, lon: -10.9408 },
  'Tunisia':       { lat: 33.8869, lon:   9.5375 },
  'Algeria':       { lat: 28.0339, lon:   1.6596 },
  'Morocco':       { lat: 31.7917, lon:  -7.0926 },
  'Egypt':         { lat: 26.8206, lon:  30.8025 },
  'Jordan':        { lat: 30.5852, lon:  36.2384 },
  'Saudi Arabia':  { lat: 23.8859, lon:  45.0792 },
  'Oman':          { lat: 21.5125, lon:  55.9233 },
  'Kuwait':        { lat: 29.3117, lon:  47.4818 },
  'Vietnam':       { lat: 14.0583, lon: 108.2772 },
  'Cambodia':      { lat: 12.5657, lon: 104.9910 },
  'Laos':          { lat: 19.8563, lon: 102.4955 },
  'Nepal':         { lat: 28.3949, lon:  84.1240 },
  'India':         { lat: 20.5937, lon:  78.9629 },
  'Timor-Leste':   { lat: -8.8742, lon: 125.7275 },
  'Papua New Guinea': { lat: -6.3150, lon: 143.9555 },
  'Solomon Islands':  { lat: -9.6457, lon: 160.1562 },
  'Fiji':          { lat:-17.7134, lon: 178.0650 },
  // Global watch
  'Turkey':        { lat: 38.9637, lon:  35.2433 },
  'Greece':        { lat: 39.0742, lon:  21.8243 },
  'Bulgaria':      { lat: 42.7339, lon:  25.4858 },
  'Romania':       { lat: 45.9432, lon:  24.9668 },
  'Hungary':       { lat: 47.1625, lon:  19.5033 },
  'Poland':        { lat: 51.9194, lon:  19.1451 },
  'Slovakia':      { lat: 48.6690, lon:  19.6990 },
  'Croatia':       { lat: 45.1000, lon:  15.2000 },
  'North Macedonia': { lat: 41.6086, lon:  21.7453 },
  'Montenegro':    { lat: 42.7087, lon:  19.3744 },
  'Albania':       { lat: 41.1533, lon:  20.1683 },
  'China':         { lat: 35.8617, lon: 104.1954 },
  'South Korea':   { lat: 35.9078, lon: 127.7669 },
  'Japan':         { lat: 36.2048, lon: 138.2529 },
  'Mongolia':      { lat: 46.8625, lon: 103.8467 },
  'Thailand':      { lat: 15.8700, lon: 100.9925 },
  'Malaysia':      { lat:  4.2105, lon: 101.9758 },
  'Singapore':     { lat:  1.3521, lon: 103.8198 },
  'Australia':     { lat:-25.2744, lon: 133.7751 },
  'New Zealand':   { lat:-40.9006, lon: 174.8860 },
  'South Africa':  { lat:-30.5595, lon:  22.9375 },
  'Ghana':         { lat:  7.9465, lon:  -1.0232 },
  'Ivory Coast':   { lat:  7.5400, lon:  -5.5471 },
  'Gabon':         { lat: -0.8037, lon:  11.6094 },
  'Congo':         { lat: -0.2280, lon:  15.8277 },
  'Equatorial Guinea': { lat:  1.6508, lon:  10.2679 },
  'Namibia':       { lat:-22.9576, lon:  18.4904 },
  'Botswana':      { lat:-22.3285, lon:  24.6849 },
  'Argentina':     { lat:-38.4161, lon: -63.6167 },
  'Chile':         { lat:-35.6751, lon: -71.5430 },
  'Paraguay':      { lat:-23.4425, lon: -58.4438 },
  'Uruguay':       { lat:-32.5228, lon: -55.7658 },
  'Guyana':        { lat:  4.8604, lon: -58.9302 },
  'Suriname':      { lat:  3.9193, lon: -56.0278 },
  'Trinidad and Tobago': { lat: 10.6918, lon: -61.2225 },
  'Panama':        { lat:  8.5380, lon: -80.7821 },
  'Costa Rica':    { lat:  9.7489, lon: -83.7534 },
  'Dominican Republic': { lat: 18.7357, lon: -70.1627 },
  'Jamaica':       { lat: 18.1096, lon: -77.2975 },
  'Belize':        { lat: 17.1899, lon: -88.4976 },
  'UAE':           { lat: 23.4241, lon:  53.8478 },
  'Qatar':         { lat: 25.3548, lon:  51.1839 },
  'Bahrain':       { lat: 26.0275, lon:  50.5500 },
  'UK':            { lat: 55.3781, lon:  -3.4360 },
  'France':        { lat: 46.2276, lon:   2.2137 },
  'Germany':       { lat: 51.1657, lon:  10.4515 },
  'Spain':         { lat: 40.4637, lon:  -3.7492 },
  'Italy':         { lat: 41.8719, lon:  12.5674 },
  'Portugal':      { lat: 39.3999, lon:  -8.2245 },
  'Sweden':        { lat: 60.1282, lon:  18.6435 },
  'Finland':       { lat: 61.9241, lon:  25.7482 },
  'Norway':        { lat: 60.4720, lon:   8.4689 },
  'Denmark':       { lat: 56.2639, lon:   9.5018 },
  'Netherlands':   { lat: 52.1326, lon:   5.2913 },
  'Belgium':       { lat: 50.5039, lon:   4.4699 },
  'Austria':       { lat: 47.5162, lon:  14.5501 },
  'Switzerland':   { lat: 46.8182, lon:   8.2275 },
  'Cyprus':        { lat: 35.1264, lon:  33.4299 },
  // United States — best-lit node: FRED, SEC, EIA
  'United States': { lat: 37.0902, lon: -95.7129 }
};

// Signal weights — must sum to 1.0
// 24-signal model (v4): 21 previous + military proximity, chokepoint, GDELT GKG tone
// All weights judgment-set — see METHODOLOGY.md for rationale.
const WEIGHTS = {
  conflict:             0.13,
  food_security:        0.12,
  governance:           0.09,
  displacement:         0.09,
  imf_fiscal:           0.04,
  ooni_internet:        0.03,
  fire_hotspot:         0.05,
  climate_stress:       0.05,
  trade_collapse:       0.02,
  economic_stress:      0.02,
  resource_conflict:    0.03,
  maritime_trade:       0.03,
  seismic_risk:         0.01,
  gps_jamming:          0.02,
  social_unrest:        0.03,
  sanctions_pressure:   0.03,
  currency_collapse:    0.04,
  flight_movement:      0.02,
  health_crisis:        0.03,
  energy_stress:        0.03,
  capital_flows:        0.02,
  military_proximity:   0.03,
  chokepoint:           0.02,
  gdelt_tone:           0.03
};

// Expected update cadence per signal — judgment-set, matches source publishing frequency
// freshness_window_hrs: how old the underlying data can be before it is considered stale
// A WGI score updating annually is not stale — it is expected. Cadence is the honest window.
const FRESHNESS_WINDOWS = {
  'Conflict Events':   { hours: 24,   cadence: 'ACLED weekly / GDELT near-realtime' },
  'Food Security':     { hours: 720,  cadence: 'Monthly — FEWS NET IPC updates' },
  'Governance':        { hours: 8760, cadence: 'Annual — World Bank WGI' },
  'Displacement':      { hours: 720,  cadence: 'Monthly — UNHCR' },
  'Satellite Fire':    { hours: 24,   cadence: 'Near-realtime — FIRMS VIIRS 3–12hr' },
  'Climate Stress':    { hours: 24,   cadence: 'Daily — Open-Meteo forecast' },
  'Trade Collapse':    { hours: 2160, cadence: 'Quarterly — Comtrade / IMF DOTS' },
  'Economic Stress':   { hours: 2160, cadence: 'Quarterly — World Bank GDP/CPI' },
  'Resource Conflict': { hours: 24,   cadence: 'Daily — commodity price feeds' },
  'Seismic Risk':      { hours: 24,   cadence: 'Realtime — USGS' },
  'Internet Freedom':  { hours: 24,   cadence: 'Daily — OONI' },
  'Fiscal Stress':     { hours: 2160, cadence: 'Quarterly — IMF WEO' },
  'Maritime Trade':    { hours: 720,  cadence: 'Monthly — UNCTAD' },
  'GPS Jamming':       { hours: 24,   cadence: 'Daily — gpsjam.org hexgrid (prev-day ~0800 UTC)' },
  'Social Unrest':     { hours: 168,  cadence: 'ACLED weekly — protest/riot events 90-day window' },
  'Sanctions Pressure':{ hours: 168,  cadence: 'Weekly — OFAC SDN list + static severity tier' },
  'Currency Collapse': { hours: 168,  cadence: 'Weekly — Alpha Vantage FX monthly series' },
  'Flight Movement':   { hours: 6,    cadence: '6-hourly — OpenSky Network ADS-B state vectors' },
  'Health Crisis':     { hours: 24,   cadence: 'Daily — disease.sh + WHO outbreak news' },
  'Energy Stress':     { hours: 168,  cadence: 'Weekly — EIA international energy data' },
  'Capital Flows':      { hours: 24,   cadence: 'Daily — FRED FX series + St. Louis FSI' },
  'Military Proximity': { hours: 8760, cadence: 'Annual — curated global base dataset' },
  'Chokepoint':         { hours: 8760, cadence: 'Static — geographic reality, annual review' },
  'GDELT Tone':         { hours: 24,   cadence: 'Daily — GDELT GKG 30-day tone average' }
};

function getRiskLevel(score) {
  if (score >= 81) return 'CRITICAL';
  if (score >= 66) return 'WARNING';
  if (score >= 41) return 'ELEVATED';
  return 'STABLE';
}

function getThresholdWindow(score) {
  if (score >= 81) return '0-30 days — action window closing';
  if (score >= 66) return '30-60 days — 55-day decision window';
  if (score >= 41) return '60-90 days — monitor and prepare';
  return '90+ days — no immediate trigger identified';
}

// FEWS IPC phase 1-5 → 0-100 risk (phase 1 = minimal risk, phase 5 = famine)
async function scoreFoodSecurity(country, date) {
  const iso = COUNTRY_ISO[country] || country;
  const dateFrom = date ? subtractDays(date, 180) : null;
  const dateTo = date || null;

  try {
    const result = await fetchFoodSecurity(iso, dateFrom, dateTo);

    if (result.error || !result.worst_phase) {
      return { name: 'Food Security', score: null, label: result.error || 'No IPC data', trend: 'unknown', source: 'FEWS_NET' };
    }

    const risk = Math.round(((result.worst_phase - 1) / 4) * 100);
    return {
      name: 'Food Security',
      score: risk,
      raw_phase: result.worst_phase,
      label: `IPC Phase ${result.worst_phase} — ${result.worst_phase_label}`,
      population_affected: result.total_affected_population,
      emergency_regions: result.emergency_regions,
      trend: result.worst_phase >= 4 ? 'critical' : result.worst_phase >= 3 ? 'deteriorating' : 'stable',
      source: 'FEWS_NET'
    };
  } catch (err) {
    return { name: 'Food Security', score: null, label: err.message, trend: 'unknown', source: 'FEWS_NET' };
  }
}

// World Bank governance 0-100 (100 = good governance) → inverted for risk
async function scoreGovernance(country, date) {
  const year = date ? parseInt(date.split('-')[0]) - 1 : null;

  try {
    const result = await fetchGovernance(country, year);

    if (result.error || result.avg_governance_score === null) {
      return { name: 'Governance', score: null, label: result.error || 'No governance data', trend: 'unknown', source: 'World_Bank' };
    }

    // Invert — high governance score = low risk
    const risk = Math.round(100 - result.avg_governance_score);
    const worstIndicator = result.indicators
      ? result.indicators.reduce((min, r) => (r.normalized_score < min.normalized_score ? r : min), result.indicators[0])
      : null;

    return {
      name: 'Governance',
      score: risk,
      label: worstIndicator
        ? `Weakest: ${worstIndicator.indicator} (score ${worstIndicator.normalized_score}/100)`
        : `Governance index ${result.avg_governance_score}/100`,
      trend: risk >= 70 ? 'critical' : risk >= 55 ? 'deteriorating' : 'stable',
      source: 'World_Bank'
    };
  } catch (err) {
    return { name: 'Governance', score: null, label: err.message, trend: 'unknown', source: 'World_Bank' };
  }
}

// Open-Meteo climate — drought stress + heat stress → 0-100 risk
async function scoreClimateStress(country, date) {
  const coords = COUNTRY_COORDS[country];
  if (!coords) {
    return { name: 'Climate Stress', score: null, label: 'No coordinates for country', trend: 'unknown', source: 'Open-Meteo' };
  }

  try {
    let url;
    if (date) {
      const endDate = date.slice(0, 10);
      const startDate = subtractDays(endDate, 14);
      url = `https://archive-api.open-meteo.com/v1/archive?latitude=${coords.lat}&longitude=${coords.lon}&start_date=${startDate}&end_date=${endDate}&daily=precipitation_sum,temperature_2m_max&timezone=auto`;
    } else {
      url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=precipitation_sum,temperature_2m_max&timezone=auto&forecast_days=14`;
    }

    const data = await fetchJson(url);
    const precip = data.daily?.precipitation_sum || [];
    const temps = data.daily?.temperature_2m_max || [];

    const validPrecip = precip.filter(v => v !== null);
    const validTemps = temps.filter(v => v !== null);

    const totalPrecip = validPrecip.reduce((s, v) => s + v, 0);
    const meanMaxTemp = validTemps.length ? validTemps.reduce((s, v) => s + v, 0) / validTemps.length : 30;

    // Drought: <5mm/14days = severe, >40mm = no stress
    const droughtScore = Math.max(0, Math.min(100, Math.round(100 - (totalPrecip / 40) * 100)));
    // Heat: >38°C = stress, >48°C = maximum
    const heatScore = Math.max(0, Math.min(100, Math.round((meanMaxTemp - 35) * 10)));

    const climateRisk = Math.round(droughtScore * 0.6 + heatScore * 0.4);

    return {
      name: 'Climate Stress',
      score: climateRisk,
      label: `${totalPrecip.toFixed(1)}mm/14d precip, ${meanMaxTemp.toFixed(1)}°C mean max temp`,
      drought_score: droughtScore,
      heat_score: heatScore,
      trend: droughtScore > 70 ? 'severe drought' : droughtScore > 40 ? 'dry conditions' : 'adequate rainfall',
      source: 'Open-Meteo'
    };
  } catch (err) {
    return { name: 'Climate Stress', score: null, label: err.message, trend: 'unknown', source: 'Open-Meteo' };
  }
}

// Conflict signal -- ACLED primary (fatalities + events), GDELT fallback (news coverage volume)
// ACLED EULA: data may NOT be used for ML training -- convergence scoring only, never into hive
// GDELT is free, no key, near real-time news-based conflict coverage index
async function scoreConflict(country, date) {
  const dateTo = date || null;
  const dateFrom = date ? subtractDays(date, 180) : null;

  // Try ACLED first if key is set
  if (process.env.ACLED_EMAIL && process.env.ACLED_API_KEY &&
      !process.env.ACLED_API_KEY.startsWith('PASTE')) {
    try {
      const result = await fetchConflictData(country, dateFrom, dateTo);
      if (!result.error && result.conflict_score !== null) {
        return {
          name: 'Conflict Events',
          score: result.conflict_score,
          label: `${result.total_fatalities} fatalities, ${result.total_events} events (${result.trend})`,
          trend: result.trend || 'unknown',
          source: 'ACLED'
        };
      }
    } catch (_) { /* fall through to GDELT */ }
  }

  // GDELT fallback -- always available, no key required
  try {
    const gdeltResult = await fetchGdeltConflict(country, dateFrom, dateTo);
    if (gdeltResult.error) {
      return { name: 'Conflict Events', score: null, label: gdeltResult.error, trend: 'unknown', source: 'GDELT' };
    }
    return {
      name: 'Conflict Events',
      score: gdeltResult.conflict_score,
      label: `GDELT coverage intensity ${gdeltResult.avg_volume_intensity} (${gdeltResult.trend})`,
      trend: gdeltResult.trend || 'unknown',
      source: 'GDELT'
    };
  } catch (err) {
    return { name: 'Conflict Events', score: null, label: err.message, trend: 'unknown', source: 'ACLED/GDELT' };
  }
}

// NASA FIRMS VIIRS satellite fire hotspots → 0-100 risk
// Near real-time satellite (3-12hr latency). High FRP + non-ag-season = conflict signal.
// Requires FIRMS_MAP_KEY — free registration: https://firms.modaps.eosdis.nasa.gov/api/
async function scoreFireHotspot(country, date) {
  if (!process.env.FIRMS_MAP_KEY) {
    return { name: 'Satellite Fire', score: null, label: 'FIRMS_MAP_KEY not set — register free at firms.modaps.eosdis.nasa.gov/api/', trend: 'unknown', source: 'FIRMS' };
  }
  try {
    const dateTo = date || null;
    const dateFrom = date ? subtractDays(date, 30) : null;
    const result = await fetchFireHotspots(country, dateFrom, dateTo);
    if (result.error) {
      return { name: 'Satellite Fire', score: null, label: result.error, trend: 'unknown', source: 'FIRMS' };
    }
    return {
      name: 'Satellite Fire',
      score: result.fire_score,
      label: result.total_hotspots > 0
        ? `${result.total_hotspots} hotspots, ${result.mean_frp} MW mean FRP (${result.trend})${result.ag_burn_season ? ' — ag season dampened' : ''}`
        : result.warning || 'No hotspots detected',
      trend: result.trend || 'unknown',
      source: 'FIRMS'
    };
  } catch (err) {
    return { name: 'Satellite Fire', score: null, label: err.message, trend: 'unknown', source: 'FIRMS' };
  }
}

// UNHCR displacement → 0-100 risk (score already normalized in the feed)
async function scoreDisplacement(country, date) {
  try {
    const result = await fetchDisplacement(country, date);
    if (result.error) {
      return { name: 'Displacement', score: null, label: result.error, trend: 'unknown', source: 'UNHCR' };
    }
    return {
      name: 'Displacement',
      score: result.displacement_score,
      label: `${(result.total_displaced || 0).toLocaleString()} displaced (${result.idp_count?.toLocaleString()} IDP + ${result.refugee_count?.toLocaleString()} refugees)`,
      delta_pct: result.refugee_delta_pct,
      trend: result.trend,
      source: 'UNHCR'
    };
  } catch (err) {
    return { name: 'Displacement', score: null, label: err.message, trend: 'unknown', source: 'UNHCR' };
  }
}

// Trade collapse signal -- Comtrade annual first, IMF DOTS quarterly fallback
// Most conflict countries don't self-report to Comtrade; IMF DOTS uses mirror data from trading partners
async function scoreTradeCollapse(country, date) {
  try {
    const result = await fetchImportData(country, date);
    if (!result.error) {
      return {
        name: 'Trade Collapse',
        score: result.import_risk_score,
        label: result.delta_pct !== null
          ? `Imports ${result.delta_pct > 0 ? '+' : ''}${result.delta_pct}% YoY (${result.data_year})`
          : `Import data ${result.data_year}`,
        trend: result.trend,
        source: 'Comtrade'
      };
    }
    // Comtrade failed (common for conflict countries) -- try IMF DOTS quarterly mirror data
    const dotsResult = await fetchImfDots(country);
    if (dotsResult.error) {
      return { name: 'Trade Collapse', score: null, label: `Comtrade: ${result.error} | DOTS: ${dotsResult.error}`, trend: 'unknown', source: 'Comtrade/IMF_DOTS' };
    }
    return {
      name: 'Trade Collapse',
      score: dotsResult.import_risk_score,
      label: dotsResult.delta_pct !== null
        ? `Imports ${dotsResult.delta_pct > 0 ? '+' : ''}${dotsResult.delta_pct}% YoY quarterly (${dotsResult.latest_period})`
        : `DOTS quarterly ${dotsResult.latest_period}`,
      trend: dotsResult.trend,
      source: 'IMF_DOTS'
    };
  } catch (err) {
    return { name: 'Trade Collapse', score: null, label: err.message, trend: 'unknown', source: 'Comtrade/IMF_DOTS' };
  }
}

// World Bank GDP growth + CPI inflation → 0-100 economic stress score
async function scoreEconomicStress(country, date) {
  const iso = COUNTRY_ISO[country] || country;
  const mrv = 3;

  try {
    const [gdpResult, cpiResult] = await Promise.allSettled([
      fetchJson(`https://api.worldbank.org/v2/country/${iso}/indicator/NY.GDP.MKTP.KD.ZG?format=json&mrv=${mrv}&per_page=${mrv}`),
      fetchJson(`https://api.worldbank.org/v2/country/${iso}/indicator/FP.CPI.TOTL.ZG?format=json&mrv=${mrv}&per_page=${mrv}`)
    ]);

    const gdpObs = gdpResult.status === 'fulfilled' ? (gdpResult.value[1] || []) : [];
    const cpiObs = cpiResult.status === 'fulfilled' ? (cpiResult.value[1] || []) : [];

    const gdpLatest = gdpObs.find(o => o.value !== null);
    const cpiLatest = cpiObs.find(o => o.value !== null);

    const gdpGrowth = gdpLatest ? parseFloat(gdpLatest.value) : 0;
    const inflation = cpiLatest ? parseFloat(cpiLatest.value) : 10;

    // GDP: 0% growth = 50 risk, -6.25% = 100 risk, +6.25% = 0 risk
    const gdpScore = Math.max(0, Math.min(100, Math.round(50 - gdpGrowth * 8)));
    // CPI: 0% = 0 risk, 67% = 100 risk
    const cpiScore = Math.max(0, Math.min(100, Math.round(inflation * 1.5)));

    const econRisk = Math.round((gdpScore + cpiScore) / 2);

    return {
      name: 'Economic Stress',
      score: econRisk,
      label: `GDP growth ${gdpGrowth.toFixed(1)}%, inflation ${inflation.toFixed(1)}%`,
      gdp_growth: gdpGrowth,
      inflation,
      trend: gdpGrowth < -2 ? 'contracting' : gdpGrowth < 1 ? 'stagnant' : 'growing',
      source: 'World_Bank'
    };
  } catch (err) {
    return { name: 'Economic Stress', score: null, label: err.message, trend: 'unknown', source: 'World_Bank' };
  }
}

async function scoreResourceConflict(country, date) {
  try {
    const result = await fetchResourceConflict(country);
    if (!result || result.conflict_score === null) {
      return { name: 'Resource Conflict', score: null, label: result?.warning || result?.error || 'No commodity data', trend: 'unknown', source: 'ResourceConflict' };
    }
    return {
      name: 'Resource Conflict',
      score: result.conflict_score,
      label: result.price_change !== null
        ? `${result.commodity} ${result.price_change > 0 ? '+' : ''}${result.price_change}% YoY (${result.trend})`
        : `${result.commodity} price: ${result.price} (${result.trend})`,
      trend: result.trend || 'unknown',
      source: 'ResourceConflict'
    };
  } catch (err) {
    return { name: 'Resource Conflict', score: null, label: err.message, trend: 'unknown', source: 'ResourceConflict' };
  }
}

async function scoreSeismicRisk(country, date) {
  try {
    const result = await fetchSeismicRisk(country, date);
    if (result.error) {
      return { name: 'Seismic Risk', score: null, label: result.error, trend: 'unknown', source: 'USGS' };
    }
    return {
      name: 'Seismic Risk',
      score: result.conflict_score,
      label: result.event_count > 0
        ? `${result.event_count} events M${4.5}+, max M${result.max_magnitude} (${result.trend})`
        : 'No significant seismic activity',
      trend: result.trend || 'stable',
      source: 'USGS'
    };
  } catch (err) {
    return { name: 'Seismic Risk', score: null, label: err.message, trend: 'unknown', source: 'USGS' };
  }
}

async function scoreOoniInternet(country, date) {
  try {
    const result = await fetchOoni(country, date);
    if (result.error) {
      return { name: 'Internet Freedom', score: null, label: result.error, trend: 'unknown', source: 'OONI' };
    }
    if (result.conflict_score === null) {
      return { name: 'Internet Freedom', score: null, label: result.warning || 'No data', trend: 'unknown', source: 'OONI' };
    }
    return {
      name: 'Internet Freedom',
      score: result.conflict_score,
      label: result.blackout_days > 0
        ? `${result.blackout_days} blackout days — ${result.trend}`
        : `${result.anomaly_rate}% anomaly rate — ${result.trend}`,
      trend: result.trend,
      source: 'OONI'
    };
  } catch (err) {
    return { name: 'Internet Freedom', score: null, label: err.message, trend: 'unknown', source: 'OONI' };
  }
}

async function scoreMaritimeTrade(country, date) {
  try {
    const result = await fetchMaritime(country, date);
    if (result.conflict_score === null) {
      return { name: 'Maritime Trade', score: null, label: result.warning || result.error || 'No port data', trend: 'unknown', source: 'UNCTAD' };
    }
    return {
      name: 'Maritime Trade',
      score: result.conflict_score,
      label: result.summary || result.trend,
      trend: result.trend,
      source: 'UNCTAD'
    };
  } catch (err) {
    return { name: 'Maritime Trade', score: null, label: err.message, trend: 'unknown', source: 'UNCTAD' };
  }
}

async function scoreImfFiscal(country, date) {
  try {
    const result = await fetchImfFiscal(country, date);
    if (result.error) {
      return { name: 'Fiscal Stress', score: null, label: result.error, trend: 'unknown', source: 'IMF' };
    }
    if (result.conflict_score === null) {
      return { name: 'Fiscal Stress', score: null, label: result.warning || 'No IMF data', trend: 'unknown', source: 'IMF' };
    }
    return {
      name: 'Fiscal Stress',
      score: result.conflict_score,
      label: [
        result.inflation_pct !== null ? `inflation ${result.inflation_pct}%` : null,
        result.current_account_pct_gdp !== null ? `CA ${result.current_account_pct_gdp}% GDP` : null,
        result.gov_debt_pct_gdp !== null ? `debt ${result.gov_debt_pct_gdp}% GDP` : null
      ].filter(Boolean).join(', ') || result.trend,
      trend: result.trend,
      source: 'IMF'
    };
  } catch (err) {
    return { name: 'Fiscal Stress', score: null, label: err.message, trend: 'unknown', source: 'IMF' };
  }
}

// GPS Jamming — gpsjam.org daily hexgrid, H3 resolution 4
// Requires h3-js (npm install h3-js) — returns null if not installed, weight redistributes
async function scoreGpsJamming(country, date) {
  const coords = COUNTRY_COORDS[country];
  if (!coords) {
    return { name: 'GPS Jamming', score: null, label: 'No coordinates for country', trend: 'unknown', source: 'GPSJam' };
  }
  try {
    const result = await fetchGpsJammingData(coords.lat, coords.lon, date);
    if (result.gps_jamming_score === null) {
      return { name: 'GPS Jamming', score: null, label: result.warning || result.error || 'No data', trend: 'unknown', source: 'GPSJam' };
    }
    return {
      name: 'GPS Jamming',
      score: result.gps_jamming_score,
      label: `Peak probability ${result.peak_probability} / avg ${result.avg_probability} (${result.cells_found} cells)`,
      trend: result.trend || 'unknown',
      source: 'GPSJam'
    };
  } catch (err) {
    return { name: 'GPS Jamming', score: null, label: err.message, trend: 'unknown', source: 'GPSJam' };
  }
}

// Social Unrest — ACLED protest/riot layer, 90-day window
// ACLED EULA: scoring only — data may NOT be used for ML training, never into hive
async function scoreSocialUnrest(country, date) {
  const dateTo   = date || null;
  const dateFrom = date ? subtractDays(date, 90) : null;
  try {
    const result = await fetchSocialUnrestData(country, dateFrom, dateTo);
    if (result.social_unrest_score === null) {
      return { name: 'Social Unrest', score: null, label: result.error || result.warning || 'No data', trend: 'unknown', source: 'ACLED' };
    }
    return {
      name: 'Social Unrest',
      score: result.social_unrest_score,
      label: result.total_events > 0
        ? `${result.total_events} events (${result.protest_count} protests, ${result.riot_count} riots), ${result.violent_pct}% violent (${result.trend})`
        : (result.warning || 'No protest/riot events'),
      trend: result.trend || 'stable',
      source: 'ACLED'
    };
  } catch (err) {
    return { name: 'Social Unrest', score: null, label: err.message, trend: 'unknown', source: 'ACLED' };
  }
}

// Sanctions Pressure — OFAC SDN + static severity tier
// Higher score = more isolated / economically constrained = higher state-risk
async function scoreSanctionsPressure(country) {
  try {
    const result = await fetchSanctionsData(country);
    if (result.sanctions_score === null || result.sanctions_score === undefined) {
      return { name: 'Sanctions Pressure', score: null, label: result.error || 'No data', trend: 'unknown', source: 'OFAC_SDN' };
    }
    return {
      name: 'Sanctions Pressure',
      score: result.sanctions_score,
      label: result.active_programs?.length > 0
        ? `${result.tier} — ${result.active_programs.length} active programs, ${result.entity_count} SDN entities`
        : (result.sanctions_score > 0 ? `${result.tier} watch` : 'No active sanctions'),
      trend: result.trend || 'unknown',
      source: 'OFAC_SDN'
    };
  } catch (err) {
    return { name: 'Sanctions Pressure', score: null, label: err.message, trend: 'unknown', source: 'OFAC_SDN' };
  }
}

async function scoreCurrencyCollapse(country) {
  try {
    const result = await fetchCurrencyCollapseData(country);
    if (result.score === null) {
      return { name: 'Currency Collapse', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'AlphaVantage' };
    }
    return {
      name: 'Currency Collapse',
      score: result.score,
      label: result.depreciation_pct !== undefined
        ? `${result.currency} ${result.depreciation_pct > 0 ? '-' : '+'}${Math.abs(result.depreciation_pct)}% vs USD (12m)`
        : (result.reason || 'USD-pegged'),
      trend: result.score >= 50 ? 'deteriorating' : result.score >= 20 ? 'watch' : 'stable',
      source: 'AlphaVantage'
    };
  } catch (err) {
    return { name: 'Currency Collapse', score: null, label: err.message, trend: 'unknown', source: 'AlphaVantage' };
  }
}

async function scoreFlightMovement(country) {
  try {
    const result = await fetchFlightMovementData(country);
    if (result.score === null) {
      return { name: 'Flight Movement', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'OpenSky' };
    }
    return {
      name: 'Flight Movement',
      score: result.score,
      label: result.emergency_squawks > 0
        ? `${result.emergency_squawks} emergency squawks — ${result.aircraft_count} total aircraft`
        : `${result.aircraft_count} aircraft over country`,
      trend: result.score >= 40 ? 'elevated' : 'normal',
      source: 'OpenSky'
    };
  } catch (err) {
    return { name: 'Flight Movement', score: null, label: err.message, trend: 'unknown', source: 'OpenSky' };
  }
}

async function scoreHealthCrisis(country) {
  try {
    const result = await fetchHealthCrisisData(country);
    if (result.score === null) {
      return { name: 'Health Crisis', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'WHO/disease.sh' };
    }
    return {
      name: 'Health Crisis',
      score: result.score,
      label: result.who_outbreaks > 0
        ? `${result.who_outbreaks} WHO active outbreak(s)`
        : result.active_per_million > 0
          ? `${result.active_per_million} active cases/M`
          : 'No active outbreaks',
      trend: result.score >= 50 ? 'critical' : result.score >= 20 ? 'elevated' : 'stable',
      source: 'WHO/disease.sh'
    };
  } catch (err) {
    return { name: 'Health Crisis', score: null, label: err.message, trend: 'unknown', source: 'WHO/disease.sh' };
  }
}

async function scoreEnergyStress(country) {
  try {
    const result = await fetchEnergyStressData(country);
    if (result.score === null) {
      return { name: 'Energy Stress', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'EIA' };
    }
    return {
      name: 'Energy Stress',
      score: result.score,
      label: result.source === 'baseline'
        ? `Energy stress baseline (${result.score}/100)`
        : `Import dependency score ${result.import_score}/50`,
      trend: result.score >= 60 ? 'critical' : result.score >= 40 ? 'elevated' : 'stable',
      source: 'EIA'
    };
  } catch (err) {
    return { name: 'Energy Stress', score: null, label: err.message, trend: 'unknown', source: 'EIA' };
  }
}

async function scoreMilitaryProximity(country) {
  try {
    const result = await fetchMilitaryProximityData(country);
    if (result.score === 0 && result.base_count === 0) {
      return { name: 'Military Proximity', score: 0, label: 'No foreign military bases', trend: 'stable', source: 'CuratedBases' };
    }
    return {
      name: 'Military Proximity',
      score: result.score,
      label: `${result.base_count} foreign base(s) — powers: ${(result.powers_present || []).join(', ')}`,
      trend: result.score >= 60 ? 'elevated' : result.score >= 30 ? 'watch' : 'stable',
      source: 'CuratedBases'
    };
  } catch (err) {
    return { name: 'Military Proximity', score: null, label: err.message, trend: 'unknown', source: 'CuratedBases' };
  }
}

async function scoreChokepoint(country) {
  try {
    const result = await fetchChokepointData(country);
    return {
      name: 'Chokepoint',
      score: result.score,
      label: result.score > 0
        ? `Controls ${result.primary} (score ${result.score}/100)`
        : 'No chokepoint leverage',
      trend: result.score >= 70 ? 'strategic' : result.score >= 40 ? 'proximate' : 'none',
      source: 'GeographicStatic'
    };
  } catch (err) {
    return { name: 'Chokepoint', score: null, label: err.message, trend: 'unknown', source: 'GeographicStatic' };
  }
}

async function scoreGdeltTone(country) {
  try {
    const result = await fetchGdeltGkgData(country);
    if (result.score === null) {
      return { name: 'GDELT Tone', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'GDELT' };
    }
    return {
      name: 'GDELT Tone',
      score: result.score,
      label: `30d avg tone ${result.avg_tone_30d}, 7d avg ${result.avg_tone_7d} (${result.trend})`,
      trend: result.trend || 'stable',
      source: 'GDELT'
    };
  } catch (err) {
    return { name: 'GDELT Tone', score: null, label: err.message, trend: 'unknown', source: 'GDELT' };
  }
}

async function scoreCapitalFlows(country) {
  try {
    const result = await fetchCapitalFlowsData(country);
    if (result.score === null) {
      return { name: 'Capital Flows', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'FRED' };
    }
    return {
      name: 'Capital Flows',
      score: result.score,
      label: result.fx_change_pct !== undefined
        ? `FX ${result.fx_change_pct > 0 ? '-' : '+'}${Math.abs(result.fx_change_pct)}% (90d) + FSI ${result.global_stress}`
        : `Capital stress baseline (${result.score}/100)`,
      trend: result.score >= 50 ? 'deteriorating' : result.score >= 25 ? 'watch' : 'stable',
      source: 'FRED'
    };
  } catch (err) {
    return { name: 'Capital Flows', score: null, label: err.message, trend: 'unknown', source: 'FRED' };
  }
}

// Wraps a scorer call with wall-clock timing and error capture.
// timedCall never rejects — failed scorers return score:null with the error in label.
async function timedCall(scorerFn, ...args) {
  const start = Date.now();
  const result = await scorerFn(...args).catch(err => ({
    score: null, label: err.message, trend: 'error', source: 'unknown'
  }));
  return { ...result, fetched_at: new Date().toISOString(), elapsed_ms: Date.now() - start };
}

async function runConvergence(country, date) {
  const targetDate = date || new Date().toISOString().slice(0, 10);

  try {
    const [
      conflictResult, foodResult, govResult, dispResult, fireResult, climateResult,
      tradeResult, econResult, resourceResult, seismicResult, ooniResult,
      imfFiscalResult, maritimeResult,
      gpsResult, unrestResult, sanctionsResult,
      currencyResult, flightResult, healthResult, energyResult, capitalResult,
      militaryResult, chokepointResult, gdeltResult
    ] = await Promise.all([
      timedCall(scoreConflict,          country, date),
      timedCall(scoreFoodSecurity,      country, date),
      timedCall(scoreGovernance,        country, date),
      timedCall(scoreDisplacement,      country, date),
      timedCall(scoreFireHotspot,       country, date),
      timedCall(scoreClimateStress,     country, date),
      timedCall(scoreTradeCollapse,     country, date),
      timedCall(scoreEconomicStress,    country, date),
      timedCall(scoreResourceConflict,  country, date),
      timedCall(scoreSeismicRisk,       country, date),
      timedCall(scoreOoniInternet,      country, date),
      timedCall(scoreImfFiscal,         country, date),
      timedCall(scoreMaritimeTrade,     country, date),
      timedCall(scoreGpsJamming,        country, date),
      timedCall(scoreSocialUnrest,      country, date),
      timedCall(scoreSanctionsPressure, country),
      timedCall(scoreCurrencyCollapse,  country),
      timedCall(scoreFlightMovement,    country),
      timedCall(scoreHealthCrisis,      country),
      timedCall(scoreEnergyStress,      country),
      timedCall(scoreCapitalFlows,       country),
      timedCall(scoreMilitaryProximity,  country),
      timedCall(scoreChokepoint,         country),
      timedCall(scoreGdeltTone,          country)
    ]);

    // Attach weight + freshness metadata to each signal result
    const signals = [
      { weight: WEIGHTS.conflict,            ...conflictResult   },
      { weight: WEIGHTS.food_security,       ...foodResult       },
      { weight: WEIGHTS.governance,          ...govResult        },
      { weight: WEIGHTS.displacement,        ...dispResult       },
      { weight: WEIGHTS.fire_hotspot,        ...fireResult       },
      { weight: WEIGHTS.climate_stress,      ...climateResult    },
      { weight: WEIGHTS.trade_collapse,      ...tradeResult      },
      { weight: WEIGHTS.economic_stress,     ...econResult       },
      { weight: WEIGHTS.resource_conflict,   ...resourceResult   },
      { weight: WEIGHTS.seismic_risk,        ...seismicResult    },
      { weight: WEIGHTS.ooni_internet,       ...ooniResult       },
      { weight: WEIGHTS.imf_fiscal,          ...imfFiscalResult  },
      { weight: WEIGHTS.maritime_trade,      ...maritimeResult   },
      { weight: WEIGHTS.gps_jamming,         ...gpsResult        },
      { weight: WEIGHTS.social_unrest,       ...unrestResult     },
      { weight: WEIGHTS.sanctions_pressure,  ...sanctionsResult  },
      { weight: WEIGHTS.currency_collapse,   ...currencyResult   },
      { weight: WEIGHTS.flight_movement,     ...flightResult     },
      { weight: WEIGHTS.health_crisis,       ...healthResult     },
      { weight: WEIGHTS.energy_stress,       ...energyResult     },
      { weight: WEIGHTS.capital_flows,       ...capitalResult    },
      { weight: WEIGHTS.military_proximity,  ...militaryResult   },
      { weight: WEIGHTS.chokepoint,          ...chokepointResult },
      { weight: WEIGHTS.gdelt_tone,          ...gdeltResult      }
    ].map(s => ({
      ...s,
      freshness_window_hrs: FRESHNESS_WINDOWS[s.name]?.hours  || null,
      freshness_cadence:    FRESHNESS_WINDOWS[s.name]?.cadence || null,
      live: s.score !== null
    }));

    // Weighted average — null signals have weight redistributed proportionally across live signals
    const scoredSignals = signals.filter(s => s.score !== null);
    const nullSignals   = signals.filter(s => s.score === null);

    const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0); // nominally 1.0
    const liveWeight  = scoredSignals.reduce((s, sig) => s + sig.weight, 0);

    let convergenceScore = 0;
    let freshness_pct    = 0;
    if (scoredSignals.length) {
      convergenceScore = Math.round(
        scoredSignals.reduce((s, sig) => s + (sig.score * sig.weight), 0) / liveWeight
      );
      freshness_pct = Math.round((liveWeight / totalWeight) * 100);
    }

    // Decomposition — every point traceable to signal, weight, and contribution
    const enrichedSignals = signals.map(s => {
      if (s.score === null) {
        return { ...s, weight_allocated: s.weight, weight_used: 0, contribution: 0 };
      }
      const weight_used  = liveWeight > 0 ? s.weight / liveWeight : 0;
      const contribution = parseFloat((s.score * weight_used).toFixed(2));
      return { ...s, weight_allocated: s.weight, weight_used: parseFloat(weight_used.toFixed(4)), contribution };
    });

    const nullWeightLost = parseFloat((totalWeight - liveWeight).toFixed(4));
    const decomposition = {
      equation: 'convergence_score = round( Σ(signal_score × signal_weight) / Σ(live_weights) )',
      weights_basis: 'judgment-set — see METHODOLOGY.md',
      signals_live:  scoredSignals.length,
      signals_null:  nullSignals.length,
      null_redistribution: nullSignals.length > 0
        ? `${nullSignals.length} null signal(s) held ${(nullWeightLost * 100).toFixed(1)}% combined weight. Each live signal's effective weight = allocated_weight / ${liveWeight.toFixed(4)}.`
        : 'All signals live — no redistribution applied.',
      contributions: enrichedSignals
        .filter(s => s.score !== null)
        .map(s => ({
          signal:           s.name,
          score:            s.score,
          weight_allocated: `${(s.weight_allocated * 100).toFixed(1)}%`,
          weight_used:      `${(s.weight_used * 100).toFixed(2)}%`,
          contribution:     s.contribution
        })),
      sum_check: parseFloat(
        enrichedSignals.filter(s => s.score !== null)
          .reduce((sum, s) => sum + s.contribution, 0).toFixed(1)
      )
    };

    const riskLevel       = getRiskLevel(convergenceScore);
    const thresholdWindow = getThresholdWindow(convergenceScore);

    const sortedByScore = [...scoredSignals].sort((a, b) => b.score - a.score);
    const top3Signals   = sortedByScore.slice(0, 3).map(s => ({
      name: s.name, score: s.score, label: s.label, trend: s.trend
    }));

    logToHive({
      source: 'convergence_engine',
      level: 'intel',
      event: 'convergence_scored',
      data: {
        country,
        date: targetDate,
        convergence_score: convergenceScore,
        risk_level: riskLevel,
        signals_scored: scoredSignals.length,
        signals_failed: nullSignals.length,
        freshness_pct
      },
      tags: ['convergence', 'dod', country, riskLevel.toLowerCase()]
    });

    return {
      source: 'Sabian_Convergence_Engine_v4',
      country,
      date: targetDate,
      convergence_score: convergenceScore,
      risk_level: riskLevel,
      threshold_window: thresholdWindow,
      signals_available: scoredSignals.length,
      signals_failed: nullSignals.map(s => s.name),
      freshness_pct,
      signals: enrichedSignals,
      decomposition,
      top_3_signals: top3Signals,
      generated_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'convergence_engine',
      level: 'error',
      event: 'convergence_failed',
      data: { country, date: targetDate, message: err.message },
      tags: ['convergence', 'error']
    });
    return { source: 'Sabian_Convergence_Engine_v2', country, date: targetDate, error: err.message };
  }
}

function subtractDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

module.exports = runConvergence;

// Standalone test: node convergence_engine.cjs
if (require.main === module) {
  const country = process.argv[2] || 'Mali';
  const date = process.argv[3] || null;
  console.log(`Running convergence for ${country}${date ? ` at ${date}` : ' (latest data)'}...\n`);
  runConvergence(country, date).then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(console.error);
}
