// convergence_engine.cjs
// Sabian DOD vertical — multi-signal convergence scoring
// Engine v6: 47 signals across conflict, governance, food, water, infrastructure,
//   financial stress, displacement, governance, internet, and predictive layers.
// Accepts: { country, date } — date is optional, defaults to latest available
// Returns: convergence_score 0-100, risk_level, top_3 signals, threshold_window
// Score bands: 0-40 STABLE | 41-65 ELEVATED | 66-80 WARNING | 81-100 CRITICAL

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');
const fetchGovernance = require('./worldbank_governance.cjs');
const fetchDisplacement = require('./unhcr_displacement_feed.cjs');
const fetchImportData = require('./comtrade_import_feed.cjs');
const fetchImfDots = require('./imf_dots_feed.cjs');
const fetchGdeltConflict = require('./gdelt_conflict_feed.cjs');
const fetchFireHotspots = require('./firms_fire_feed.cjs');
const fetchResourceConflict = require('./resource_conflict_feed.cjs');
const fetchSeismicRisk = require('./seismic_risk_feed.cjs');
const fetchOoni = require('./ooni_feed.cjs');
const fetchImfFiscal = require('./imf_fiscal_feed.cjs');
const fetchMaritime = require('./unctad_maritime_feed.cjs');
const { fetchGpsJammingData }       = require('./gps_jamming_feed.cjs');
const { fetchSanctionsData }        = require('./sanctions_feed.cjs');
const { fetchCurrencyCollapseData }    = require('./exchangerate_feed.cjs');
const { fetchFlightMovementData }      = require('./opensky_feed.cjs');
const { fetchHealthCrisisData }        = require('./who_health_feed.cjs');
const { fetchEnergyStressData }        = require('./eia_energy_feed.cjs');
const { fetchCapitalFlowsData }        = require('./fred_capital_feed.cjs');
const { fetchMilitaryProximityData }   = require('./military_proximity_feed.cjs');
const { fetchChokepointData }          = require('./chokepoint_feed.cjs');
const { fetchGdeltGkgData }            = require('./gdelt_gkg_feed.cjs');
const { fetchNightLightsData }         = require('./nightlights_feed.cjs');
const { fetchDarkVesselData }          = require('./darkvessel_feed.cjs');
const { fetchCableWatchData }          = require('./cablewatch_feed.cjs');
const { fetchWaterStressData }         = require('./water_stress_feed.cjs');
const { fetchSovereignCdsData }        = require('./sovereign_cds_feed.cjs');
const { fetchElectionCalendarData }    = require('./election_calendar_feed.cjs');
const { fetchTorCensorshipData }       = require('./tor_censorship_feed.cjs');
const { fetchInternetIodaData }        = require('./internet_ioda_feed.cjs');
const { fetchFloodRiskData }           = require('./flood_risk_feed.cjs');
const { fetchPortCongestionData }      = require('./port_congestion_feed.cjs');
const { fetchPipelineRiskData }        = require('./pipeline_risk_feed.cjs');
const { fetchPowerGridData }           = require('./power_grid_feed.cjs');
const { fetchDamRiskData }             = require('./dam_risk_feed.cjs');
const { fetchRailCorridorData }        = require('./rail_corridor_feed.cjs');
const { fetchCyberThreatData }         = require('./cyber_threat_feed.cjs');
const { fetchFaoFoodData }             = require('./fao_food_feed.cjs');
const { fetchVdemGovernanceData }      = require('./vdem_governance_feed.cjs');
const { fetchUnhcrOdpData }            = require('./unhcr_odp_feed.cjs');
const { fetchStructuralPressureData }  = require('./structural_pressure_feed.cjs');
const { fetchOccrpData }               = require('./occrp_feed.cjs');
const fetchFoodSecurity                = require('./fews_food_security.cjs');
const { fetchUsdaFoodData }            = require('./usda_food_feed.cjs');
const { fetchIomDisplacementData }     = require('./iom_displacement_feed.cjs');
const { fetchSocialVolumeData }        = require('./social_volume_feed.cjs');
const { fetchPredictionMarketData }    = require('./prediction_market_feed.cjs');

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
// 47-signal model (v6): full infrastructure + governance + food + displacement + financial layer
// All weights judgment-set — see METHODOLOGY.md for rationale.
// Verified sum = 1.00
const WEIGHTS = {
  // Core fundamentals — highest weight: structural crisis indicators
  conflict:               0.09,
  structural_pressure:    0.14,  // MDC composite: 5 behavioral/predictive signals merged
  governance:             0.05,
  displacement:           0.05,
  water_stress:           0.04,
  sovereign_cds:          0.04,
  // Major structural signals
  social_unrest:          0.03,
  military_proximity:     0.03,
  election_calendar:      0.03,
  sanctions_pressure:     0.03,
  currency_collapse:      0.03,
  // Operational monitoring signals
  imf_fiscal:             0.02,
  fao_food:               0.02,
  vdem_governance:        0.02,
  occrp:                  0.02,
  fire_hotspot:           0.02,
  climate_stress:         0.02,
  port_congestion:        0.02,
  ooni_internet:          0.02,
  health_crisis:          0.02,
  cyber_threat:           0.02,
  gdelt_tone:             0.02,
  unhcr_odp:              0.02,
  // Fine-grain signals
  economic_stress:        0.01,
  capital_flows:          0.01,
  maritime_trade:         0.01,
  chokepoint:             0.01,
  flood_risk:             0.01,
  dark_vessel:            0.01,
  tor_censorship:         0.01,
  internet_shutdown_ioda: 0.01,
  cable_disruption:       0.01,
  night_lights:           0.01,
  flight_movement:        0.01,
  trade_collapse:         0.01,
  resource_conflict:      0.01,
  energy_stress:          0.01,
  pipeline_risk:          0.01,
  power_grid:             0.01,
  gps_jamming:            0.01,
  rail_corridor:          0.01,
  dam_risk:               0.01,
  seismic_risk:           0.01,
  // Behavioral & predictive — component signals of structural_pressure MDC
  food_security:          0.08,
  usda_food:              0.02,
  iom_displacement:       0.02,
  social_volume:          0.01,
  prediction_market:      0.01
};

// Expected update cadence per signal — judgment-set, matches source publishing frequency
// freshness_window_hrs: how old the underlying data can be before it is considered stale
// A WGI score updating annually is not stale — it is expected. Cadence is the honest window.
const FRESHNESS_WINDOWS = {
  'Conflict Events':   { hours: 24,   cadence: 'GDELT near-realtime' },
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
  'Social Unrest':     { hours: 168,  cadence: 'Dormant — ACLED removed, no replacement source' },
  'Sanctions Pressure':{ hours: 168,  cadence: 'Weekly — OFAC SDN list + static severity tier' },
  'Currency Collapse': { hours: 168,  cadence: 'Weekly — Alpha Vantage FX monthly series' },
  'Flight Movement':   { hours: 6,    cadence: '6-hourly — OpenSky Network ADS-B state vectors' },
  'Health Crisis':     { hours: 24,   cadence: 'Daily — disease.sh + WHO outbreak news' },
  'Energy Stress':     { hours: 168,  cadence: 'Weekly — EIA international energy data' },
  'Capital Flows':      { hours: 24,   cadence: 'Daily — FRED FX series + St. Louis FSI' },
  'Military Proximity': { hours: 8760, cadence: 'Annual — curated global base dataset' },
  'Chokepoint':         { hours: 8760, cadence: 'Static — geographic reality, annual review' },
  'GDELT Tone':         { hours: 24,   cadence: 'Daily — GDELT GKG 30-day tone average' },
  'Night Lights':       { hours: 8760, cadence: 'Annual — World Bank electricity access trend' },
  'Dark Vessel':        { hours: 24,   cadence: 'Daily — GFW AIS gap events, 30-day window' },
  'Cable Disruption':   { hours: 6,    cadence: '6-hourly — Cloudflare Radar internet traffic anomaly' },
  'Water Stress':       { hours: 8760, cadence: 'Annual — WRI Aqueduct 3.0 + Copernicus GDO' },
  'Sovereign CDS':      { hours: 168,  cadence: 'Weekly — Damodaran CDS spreads + static table' },
  'Election Calendar':  { hours: 168,  cadence: 'Weekly — curated election dates, 90-day risk window' },
  'Tor Censorship':     { hours: 24,   cadence: 'Daily — Tor Project metrics bridge usage spike' },
  'Internet IODA':      { hours: 6,    cadence: '6-hourly — IODA BGP alert feed (Georgia Tech)' },
  'Flood Risk':         { hours: 24,   cadence: 'Daily — GloFAS river discharge ensemble forecasts' },
  'Port Congestion':    { hours: 24,   cadence: 'Daily — GoComet live + tier-based baseline' },
  'Pipeline Risk':      { hours: 2160, cadence: 'Quarterly — Global Energy Monitor pipeline tracker' },
  'Power Grid':         { hours: 8760, cadence: 'Annual — EIA international electricity reliability' },
  'Dam Risk':           { hours: 2160, cadence: 'Quarterly — Global Dam Watch + GRanD database' },
  'Rail Corridor':      { hours: 2160, cadence: 'Quarterly — OpenRailwayMap / OSM strategic corridors' },
  'Cyber Threat':       { hours: 24,   cadence: 'Daily — AlienVault OTX 7-day pulse window' },
  'Prediction Market':  { hours: 6,    cadence: '6-hourly — Polymarket geopolitical contracts' },
  'Social Volume':      { hours: 6,    cadence: '6-hourly — Bluesky public API mention sampling' },
  'USDA Food Supply':   { hours: 720,  cadence: 'Monthly — USDA FAS PSD grain balance sheets' },
  'FAO Food Import':    { hours: 8760, cadence: 'Annual — FAO FAOSTAT food import dependency ratio' },
  'VDem Governance':    { hours: 8760, cadence: 'Annual — V-Dem LDI (University of Gothenburg)' },
  'IOM Displacement':   { hours: 720,  cadence: 'Monthly — IOM DTM + IDMC internal displacement' },
  'UNHCR Refugees':     { hours: 720,  cadence: 'Monthly — UNHCR Global Trends refugee outflow/inflow' },
  'Corruption Risk':    { hours: 8760, cadence: 'Annual — TI CPI 2024 + OCCRP Aleph entity count' }
};

// Minimum live signals required to emit a score.
// Below this floor: return convergence_score: null — buyer sees "not yet scored", never a hedged number.
// This is a silent backend gate. Buyer never sees the floor or why it triggered.
const MIN_SIGNALS_FLOOR = 5;

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

// Conflict signal -- GDELT news coverage volume (near real-time, no key required)
async function scoreConflict(country, date) {
  const dateTo = date || null;
  const dateFrom = date ? subtractDays(date, 180) : null;

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
    return { name: 'Conflict Events', score: null, label: err.message, trend: 'unknown', source: 'GDELT' };
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

// Social Unrest — dormant (ACLED removed 2026-06-01, no key, EULA risk)
async function scoreSocialUnrest(country, date) {
  return { name: 'Social Unrest', score: null, label: 'Signal dormant — ACLED removed', trend: 'unknown', source: 'none' };
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

async function scoreNightLights(country) {
  try {
    const result = await fetchNightLightsData(country);
    if (result.score === null) {
      return { name: 'Night Lights', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'WorldBank_Electricity' };
    }
    return {
      name: 'Night Lights',
      score: result.score,
      label: result.electricity_access_pct !== undefined
        ? `${result.electricity_access_pct}% electricity access (${result.latest_year}) — ${result.trend}`
        : `Night lights baseline (${result.score}/100)`,
      trend: result.trend || 'stable',
      source: 'WorldBank_Electricity'
    };
  } catch (err) {
    return { name: 'Night Lights', score: null, label: err.message, trend: 'unknown', source: 'WorldBank_Electricity' };
  }
}

async function scoreDarkVessel(country) {
  try {
    const result = await fetchDarkVesselData(country);
    if (result.score === null) {
      return { name: 'Dark Vessel', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'GFW' };
    }
    if (result.score === 0) {
      return { name: 'Dark Vessel', score: 0, label: result.reason || 'No dark events', trend: 'stable', source: 'GFW' };
    }
    return {
      name: 'Dark Vessel',
      score: result.score,
      label: result.gap_events > 0
        ? `${result.gap_events} AIS gap events (avg ${result.avg_gap_duration_hrs}h dark) — 30d window`
        : 'No AIS gap events detected',
      trend: result.score >= 50 ? 'elevated' : result.score >= 20 ? 'watch' : 'stable',
      source: 'GFW'
    };
  } catch (err) {
    return { name: 'Dark Vessel', score: null, label: err.message, trend: 'unknown', source: 'GFW' };
  }
}

async function scoreCableDisruption(country) {
  try {
    const result = await fetchCableWatchData(country);
    if (result.score === null) {
      return { name: 'Cable Disruption', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'Cloudflare' };
    }
    return {
      name: 'Cable Disruption',
      score: result.score,
      label: result.active_outages > 0
        ? `${result.active_outages} active outage(s) — ${result.traffic_drop_pct}% traffic drop`
        : result.traffic_drop_pct > 10
          ? `${result.traffic_drop_pct}% traffic anomaly vs baseline`
          : 'Internet traffic normal',
      trend: result.score >= 50 ? 'disrupted' : result.score >= 20 ? 'degraded' : 'normal',
      source: 'Cloudflare'
    };
  } catch (err) {
    return { name: 'Cable Disruption', score: null, label: err.message, trend: 'unknown', source: 'Cloudflare' };
  }
}

async function scoreWaterStress(country) {
  try {
    const result = await fetchWaterStressData(country);
    if (result.score === null) return { name: 'Water Stress', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'WRI_Aqueduct' };
    return { name: 'Water Stress', score: result.score, label: result.trend || `Water stress ${result.score}/100`, trend: result.trend || 'stable', source: 'WRI_Aqueduct' };
  } catch (err) {
    return { name: 'Water Stress', score: null, label: err.message, trend: 'unknown', source: 'WRI_Aqueduct' };
  }
}

async function scoreSovereignCds(country) {
  try {
    const result = await fetchSovereignCdsData(country);
    if (result.score === null) return { name: 'Sovereign CDS', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'Damodaran_CDS' };
    return {
      name: 'Sovereign CDS',
      score: result.score,
      label: result.cds_spread_bps ? `${result.cds_spread_bps}bps CDS spread (${result.risk_tier})` : `CDS score ${result.score}/100`,
      trend: result.score >= 70 ? 'distressed' : result.score >= 45 ? 'elevated' : 'stable',
      source: 'Damodaran_CDS'
    };
  } catch (err) {
    return { name: 'Sovereign CDS', score: null, label: err.message, trend: 'unknown', source: 'Damodaran_CDS' };
  }
}

async function scoreElectionCalendar(country) {
  try {
    const result = await fetchElectionCalendarData(country);
    if (result.score === null || result.score === undefined) return { name: 'Election Calendar', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'ElectionCalendar' };
    return {
      name: 'Election Calendar',
      score: result.score,
      label: result.note || result.status || `Election risk ${result.score}/100`,
      trend: result.score >= 60 ? 'pre_election_tension' : result.score >= 30 ? 'election_window' : 'stable',
      source: 'ElectionCalendar'
    };
  } catch (err) {
    return { name: 'Election Calendar', score: null, label: err.message, trend: 'unknown', source: 'ElectionCalendar' };
  }
}

async function scoreTorCensorship(country) {
  try {
    const result = await fetchTorCensorshipData(country);
    if (result.score === null) return { name: 'Tor Censorship', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'TorProject' };
    return {
      name: 'Tor Censorship',
      score: result.score,
      label: result.bridge_spike_ratio ? `Bridge-to-relay ratio: ${result.bridge_spike_ratio}x (${result.trend})` : `Censorship signal ${result.score}/100`,
      trend: result.trend || 'stable',
      source: 'TorProject'
    };
  } catch (err) {
    return { name: 'Tor Censorship', score: null, label: err.message, trend: 'unknown', source: 'TorProject' };
  }
}

async function scoreInternetIoda(country) {
  try {
    const result = await fetchInternetIodaData(country);
    if (result.score === null) return { name: 'Internet IODA', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'IODA_GaTech' };
    return {
      name: 'Internet IODA',
      score: result.score,
      label: result.alert_count > 0 ? `${result.alert_count} IODA alert(s) — ${result.trend}` : 'No IODA alerts',
      trend: result.trend || 'stable',
      source: 'IODA_GaTech'
    };
  } catch (err) {
    return { name: 'Internet IODA', score: null, label: err.message, trend: 'unknown', source: 'IODA_GaTech' };
  }
}

async function scoreFloodRisk(country) {
  try {
    const result = await fetchFloodRiskData(country);
    if (result.score === null) return { name: 'Flood Risk', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'GloFAS' };
    return {
      name: 'Flood Risk',
      score: result.score,
      label: result.warning_count > 0
        ? `${result.warning_count} flood warning(s), ${result.watch_count || 0} watches`
        : result.total_alerts > 0 ? `${result.total_alerts} advisory alert(s)` : 'No flood alerts',
      trend: result.trend || 'stable',
      source: 'GloFAS'
    };
  } catch (err) {
    return { name: 'Flood Risk', score: null, label: err.message, trend: 'unknown', source: 'GloFAS' };
  }
}

async function scorePortCongestion(country) {
  try {
    const result = await fetchPortCongestionData(country);
    if (result.score === null) return { name: 'Port Congestion', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'GoComet' };
    if (result.reason === 'landlocked') return { name: 'Port Congestion', score: 0, label: 'Landlocked — no port exposure', trend: 'stable', source: 'GoComet' };
    return {
      name: 'Port Congestion',
      score: result.score,
      label: result.port ? `${result.port}: ${result.trend}` : `Port congestion ${result.score}/100`,
      trend: result.trend || 'stable',
      source: result.source || 'GoComet'
    };
  } catch (err) {
    return { name: 'Port Congestion', score: null, label: err.message, trend: 'unknown', source: 'GoComet' };
  }
}

async function scorePipelineRisk(country) {
  try {
    const result = await fetchPipelineRiskData(country);
    if (result.score === null) return { name: 'Pipeline Risk', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'GEM_Pipeline' };
    if (result.reason === 'no_pipeline_data') return { name: 'Pipeline Risk', score: 0, label: 'No strategic pipelines', trend: 'stable', source: 'GEM_Pipeline' };
    return {
      name: 'Pipeline Risk',
      score: result.score,
      label: `${result.pipeline_km?.toLocaleString()}km pipeline — ${result.pipeline_type} (${result.trend})`,
      trend: result.trend || 'stable',
      source: 'GEM_Pipeline'
    };
  } catch (err) {
    return { name: 'Pipeline Risk', score: null, label: err.message, trend: 'unknown', source: 'GEM_Pipeline' };
  }
}

async function scorePowerGrid(country) {
  try {
    const result = await fetchPowerGridData(country);
    if (result.score === null) return { name: 'Power Grid', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'EIA_Grid' };
    return {
      name: 'Power Grid',
      score: result.score,
      label: `Grid reliability: ${result.reliability_tier} (baseline ${result.grid_baseline}/100)`,
      trend: result.trend || 'stable',
      source: 'EIA_Grid'
    };
  } catch (err) {
    return { name: 'Power Grid', score: null, label: err.message, trend: 'unknown', source: 'EIA_Grid' };
  }
}

async function scoreDamRisk(country) {
  try {
    const result = await fetchDamRiskData(country);
    if (result.score === null) return { name: 'Dam Risk', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'GDW_GRanD' };
    if (result.reason === 'no_dam_data') return { name: 'Dam Risk', score: 5, label: 'No major dam infrastructure', trend: 'stable', source: 'GDW_GRanD' };
    return {
      name: 'Dam Risk',
      score: result.score,
      label: result.dams?.length > 0 ? `${result.dams[0]}${result.dispute ? ' (dispute)' : ''}${result.attack_risk ? ' (attack risk)' : ''}` : `Dam risk ${result.score}/100`,
      trend: result.trend || 'stable',
      source: 'GDW_GRanD'
    };
  } catch (err) {
    return { name: 'Dam Risk', score: null, label: err.message, trend: 'unknown', source: 'GDW_GRanD' };
  }
}

async function scoreRailCorridor(country) {
  try {
    const result = await fetchRailCorridorData(country);
    if (result.score === null) return { name: 'Rail Corridor', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'OpenRailwayMap' };
    if (result.reason === 'no_rail_data') return { name: 'Rail Corridor', score: 0, label: 'No strategic rail infrastructure', trend: 'stable', source: 'OpenRailwayMap' };
    return {
      name: 'Rail Corridor',
      score: result.score,
      label: result.corridor ? `${result.corridor} — ${result.rail_km?.toLocaleString()}km` : `Rail risk ${result.score}/100`,
      trend: result.trend || 'stable',
      source: 'OpenRailwayMap'
    };
  } catch (err) {
    return { name: 'Rail Corridor', score: null, label: err.message, trend: 'unknown', source: 'OpenRailwayMap' };
  }
}

async function scoreCyberThreat(country) {
  try {
    const result = await fetchCyberThreatData(country);
    if (result.score === null) return { name: 'Cyber Threat', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'AlienVault_OTX' };
    return {
      name: 'Cyber Threat',
      score: result.score,
      label: result.pulse_count_7d !== undefined ? `${result.pulse_count_7d} OTX pulses (7d) — ${result.trend}` : `Cyber threat ${result.score}/100`,
      trend: result.trend || 'stable',
      source: 'AlienVault_OTX'
    };
  } catch (err) {
    return { name: 'Cyber Threat', score: null, label: err.message, trend: 'unknown', source: 'AlienVault_OTX' };
  }
}

async function scoreFaoFood(country) {
  try {
    const result = await fetchFaoFoodData(country);
    if (result.score === null) return { name: 'FAO Food Import', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'FAO_FAOSTAT' };
    return {
      name: 'FAO Food Import',
      score: result.score,
      label: result.food_import_dependency_pct !== undefined ? `${result.food_import_dependency_pct}% import dependency (${result.trend})` : `Food import risk ${result.score}/100`,
      trend: result.trend || 'stable',
      source: 'FAO_FAOSTAT'
    };
  } catch (err) {
    return { name: 'FAO Food Import', score: null, label: err.message, trend: 'unknown', source: 'FAO_FAOSTAT' };
  }
}

async function scoreVdemGovernance(country) {
  try {
    const result = await fetchVdemGovernanceData(country);
    if (result.score === null) return { name: 'VDem Governance', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'VDem' };
    return {
      name: 'VDem Governance',
      score: result.score,
      label: result.regime ? `${result.regime} — LDI ${result.ldi} (${result.trend})` : `Governance risk ${result.score}/100`,
      trend: result.trend || 'stable',
      source: 'VDem'
    };
  } catch (err) {
    return { name: 'VDem Governance', score: null, label: err.message, trend: 'unknown', source: 'VDem' };
  }
}

async function scoreStructuralPressure(country) {
  try {
    const result = await fetchStructuralPressureData(country);
    if (result.score === null) return { name: 'Structural Pressure', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'MDC_composite' };
    return {
      name: 'Structural Pressure',
      score: result.score,
      label: result.mdc_z !== undefined ? `MDC z=${result.mdc_z.toFixed(3)} (${result.dims} dims, ${result.year})` : `Structural pressure ${result.score}/100`,
      trend: result.trend || 'stable',
      source: 'MDC_composite'
    };
  } catch (err) {
    return { name: 'Structural Pressure', score: null, label: err.message, trend: 'unknown', source: 'MDC_composite' };
  }
}

async function scoreFoodSecurity(country) {
  const iso = COUNTRY_ISO[country] || country;
  try {
    const result = await fetchFoodSecurity(iso);
    if (!result || result.worst_phase === undefined || result.worst_phase === 0) {
      return { name: 'Food Security', score: null, label: result?.warning || 'No IPC data', trend: 'unknown', source: 'FEWS_NET' };
    }
    // IPC phase 1-5 → 0-100 risk: phase 3+ is crisis
    const score = Math.min(100, Math.round(result.worst_phase * 20));
    return {
      name: 'Food Security',
      score,
      label: `IPC phase ${result.worst_phase} (${result.worst_region || 'national'}), ${result.total_affected || 0} affected`,
      trend: result.worst_phase >= 4 ? 'emergency' : result.worst_phase >= 3 ? 'crisis' : 'stable',
      source: 'FEWS_NET'
    };
  } catch (err) {
    return { name: 'Food Security', score: null, label: err.message, trend: 'unknown', source: 'FEWS_NET' };
  }
}

async function scoreUsdaFood(country) {
  try {
    const result = await fetchUsdaFoodData(country);
    if (result.score === null) return { name: 'USDA Food Supply', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'USDA_FAS' };
    return {
      name: 'USDA Food Supply',
      score: result.score,
      label: result.stocks_to_use !== undefined ? `Stocks/use ${result.stocks_to_use}% (${result.commodity})` : `Food supply risk ${result.score}/100`,
      trend: result.trend || 'stable',
      source: 'USDA_FAS'
    };
  } catch (err) {
    return { name: 'USDA Food Supply', score: null, label: err.message, trend: 'unknown', source: 'USDA_FAS' };
  }
}

async function scoreIomDisplacement(country) {
  try {
    const result = await fetchIomDisplacementData(country);
    if (result.score === null) return { name: 'IOM Displacement', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'IDMC_IOM' };
    return {
      name: 'IOM Displacement',
      score: result.score,
      label: result.idps_thousands !== undefined ? `${result.idps_thousands}k IDPs (conflict: ${result.conflict_idps || 0}, disaster: ${result.disaster_idps || 0})` : `IDP risk ${result.score}/100`,
      trend: result.trend || 'stable',
      source: 'IDMC_IOM'
    };
  } catch (err) {
    return { name: 'IOM Displacement', score: null, label: err.message, trend: 'unknown', source: 'IDMC_IOM' };
  }
}

async function scoreSocialVolume(country) {
  try {
    const result = await fetchSocialVolumeData(country);
    if (result.score === null) return { name: 'Social Volume', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'Bluesky' };
    return {
      name: 'Social Volume',
      score: result.score,
      label: `${result.post_count_sample || 0} posts sampled, ${result.trend || 'normal'}`,
      trend: result.trend || 'normal',
      source: 'Bluesky'
    };
  } catch (err) {
    return { name: 'Social Volume', score: null, label: err.message, trend: 'unknown', source: 'Bluesky' };
  }
}

async function scorePredictionMarket(country) {
  try {
    const result = await fetchPredictionMarketData(country);
    if (result.score === null) return { name: 'Prediction Market', score: null, label: result.reason || 'No contracts', trend: 'unknown', source: 'Polymarket' };
    return {
      name: 'Prediction Market',
      score: result.score,
      label: result.top_contract ? `${result.top_contract}: ${result.top_probability}%` : `Market risk ${result.score}/100`,
      trend: result.trend || 'stable',
      source: 'Polymarket'
    };
  } catch (err) {
    return { name: 'Prediction Market', score: null, label: err.message, trend: 'unknown', source: 'Polymarket' };
  }
}

async function scoreUnhcrOdp(country) {
  try {
    const result = await fetchUnhcrOdpData(country);
    if (result.score === null) return { name: 'UNHCR Refugees', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'UNHCR' };
    return {
      name: 'UNHCR Refugees',
      score: result.score,
      label: result.refugees_out_thousands !== undefined ? `${result.refugees_out_thousands}k origin refugees, ${result.refugees_in_thousands}k hosted` : `Refugee risk ${result.score}/100`,
      trend: result.trend || 'stable',
      source: 'UNHCR'
    };
  } catch (err) {
    return { name: 'UNHCR Refugees', score: null, label: err.message, trend: 'unknown', source: 'UNHCR' };
  }
}

async function scoreOccrp(country) {
  try {
    const result = await fetchOccrpData(country);
    if (result.score === null) return { name: 'Corruption Risk', score: null, label: result.reason || 'No data', trend: 'unknown', source: 'TI_CPI_OCCRP' };
    return {
      name: 'Corruption Risk',
      score: result.score,
      label: result.ti_cpi_2024 !== undefined ? `TI CPI ${result.ti_cpi_2024}/100 — ${result.trend}` : `Corruption risk ${result.score}/100`,
      trend: result.trend || 'stable',
      source: 'TI_CPI_OCCRP'
    };
  } catch (err) {
    return { name: 'Corruption Risk', score: null, label: err.message, trend: 'unknown', source: 'TI_CPI_OCCRP' };
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
      conflictResult, structuralResult, govResult, dispResult, fireResult, climateResult,
      tradeResult, econResult, resourceResult, seismicResult, ooniResult,
      imfFiscalResult, maritimeResult,
      gpsResult, unrestResult, sanctionsResult,
      currencyResult, flightResult, healthResult, energyResult, capitalResult,
      militaryResult, chokepointResult, gdeltResult,
      nightLightsResult, darkVesselResult, cableResult,
      waterStressResult, sovereignCdsResult, electionResult,
      torResult, iodaResult, floodResult, portResult, pipelineResult,
      powerGridResult, damResult, railResult, cyberResult,
      faoFoodResult, vdemResult, unhcrOdpResult, occrpResult,
      foodSecurityResult, usdaFoodResult, iomDisplacementResult, socialVolumeResult, predictionMarketResult
    ] = await Promise.all([
      timedCall(scoreConflict,            country, date),
      timedCall(scoreStructuralPressure,  country),
      timedCall(scoreGovernance,          country, date),
      timedCall(scoreDisplacement,        country, date),
      timedCall(scoreFireHotspot,         country, date),
      timedCall(scoreClimateStress,       country, date),
      timedCall(scoreTradeCollapse,       country, date),
      timedCall(scoreEconomicStress,      country, date),
      timedCall(scoreResourceConflict,    country, date),
      timedCall(scoreSeismicRisk,         country, date),
      timedCall(scoreOoniInternet,        country, date),
      timedCall(scoreImfFiscal,           country, date),
      timedCall(scoreMaritimeTrade,       country, date),
      timedCall(scoreGpsJamming,          country, date),
      timedCall(scoreSocialUnrest,        country, date),
      timedCall(scoreSanctionsPressure,   country),
      timedCall(scoreCurrencyCollapse,    country),
      timedCall(scoreFlightMovement,      country),
      timedCall(scoreHealthCrisis,        country),
      timedCall(scoreEnergyStress,        country),
      timedCall(scoreCapitalFlows,        country),
      timedCall(scoreMilitaryProximity,   country),
      timedCall(scoreChokepoint,          country),
      timedCall(scoreGdeltTone,           country),
      timedCall(scoreNightLights,         country),
      timedCall(scoreDarkVessel,          country),
      timedCall(scoreCableDisruption,     country),
      timedCall(scoreWaterStress,         country),
      timedCall(scoreSovereignCds,        country),
      timedCall(scoreElectionCalendar,    country),
      timedCall(scoreTorCensorship,       country),
      timedCall(scoreInternetIoda,        country),
      timedCall(scoreFloodRisk,           country),
      timedCall(scorePortCongestion,      country),
      timedCall(scorePipelineRisk,        country),
      timedCall(scorePowerGrid,           country),
      timedCall(scoreDamRisk,             country),
      timedCall(scoreRailCorridor,        country),
      timedCall(scoreCyberThreat,         country),
      timedCall(scoreFaoFood,             country),
      timedCall(scoreVdemGovernance,      country),
      timedCall(scoreUnhcrOdp,            country),
      timedCall(scoreOccrp,               country),
      timedCall(scoreFoodSecurity,        country),
      timedCall(scoreUsdaFood,            country),
      timedCall(scoreIomDisplacement,     country),
      timedCall(scoreSocialVolume,        country),
      timedCall(scorePredictionMarket,    country)
    ]);

    // Attach weight + freshness metadata to each signal result
    const signals = [
      { weight: WEIGHTS.conflict,            ...conflictResult     },
      { weight: WEIGHTS.structural_pressure, ...structuralResult   },
      { weight: WEIGHTS.governance,          ...govResult          },
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
      { weight: WEIGHTS.military_proximity,  ...militaryResult    },
      { weight: WEIGHTS.chokepoint,          ...chokepointResult  },
      { weight: WEIGHTS.gdelt_tone,          ...gdeltResult       },
      { weight: WEIGHTS.night_lights,           ...nightLightsResult  },
      { weight: WEIGHTS.dark_vessel,            ...darkVesselResult   },
      { weight: WEIGHTS.cable_disruption,       ...cableResult        },
      { weight: WEIGHTS.water_stress,           ...waterStressResult  },
      { weight: WEIGHTS.sovereign_cds,          ...sovereignCdsResult },
      { weight: WEIGHTS.election_calendar,      ...electionResult     },
      { weight: WEIGHTS.tor_censorship,         ...torResult          },
      { weight: WEIGHTS.internet_shutdown_ioda, ...iodaResult         },
      { weight: WEIGHTS.flood_risk,             ...floodResult        },
      { weight: WEIGHTS.port_congestion,        ...portResult         },
      { weight: WEIGHTS.pipeline_risk,          ...pipelineResult     },
      { weight: WEIGHTS.power_grid,             ...powerGridResult    },
      { weight: WEIGHTS.dam_risk,               ...damResult          },
      { weight: WEIGHTS.rail_corridor,          ...railResult         },
      { weight: WEIGHTS.cyber_threat,           ...cyberResult        },
      { weight: WEIGHTS.fao_food,               ...faoFoodResult      },
      { weight: WEIGHTS.vdem_governance,        ...vdemResult         },
      { weight: WEIGHTS.unhcr_odp,              ...unhcrOdpResult     },
      { weight: WEIGHTS.occrp,                  ...occrpResult        },
      { weight: WEIGHTS.food_security,          ...foodSecurityResult },
      { weight: WEIGHTS.usda_food,              ...usdaFoodResult     },
      { weight: WEIGHTS.iom_displacement,       ...iomDisplacementResult },
      { weight: WEIGHTS.social_volume,          ...socialVolumeResult },
      { weight: WEIGHTS.prediction_market,      ...predictionMarketResult }
    ].map(s => ({
      ...s,
      freshness_window_hrs: FRESHNESS_WINDOWS[s.name]?.hours  || null,
      freshness_cadence:    FRESHNESS_WINDOWS[s.name]?.cadence || null,
      live: s.score !== null
    }));

    // Weighted average — null signals have weight redistributed proportionally across live signals
    const scoredSignals = signals.filter(s => s.score !== null);
    const nullSignals   = signals.filter(s => s.score === null);

    // source_health_snapshot — captured at scoring time for Host A audio layer.
    // Lists what was healthy vs blocked so Host A can acknowledge gaps honestly.
    const source_health_snapshot = {
      scored_at:    new Date().toISOString(),
      healthy:      scoredSignals.map(s => s.name),
      blocked:      nullSignals.map(s => ({ name: s.name, reason: s.label || 'unavailable' })),
    };

    const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0); // nominally 1.0
    const liveWeight  = scoredSignals.reduce((s, sig) => s + sig.weight, 0);

    // Silent floor — below MIN_SIGNALS_FLOOR the score is unreliable.
    // Return null: buyer sees nothing for this country, never a hedged number.
    if (scoredSignals.length < MIN_SIGNALS_FLOOR) {
      return {
        source: 'Sabian_Convergence_Engine_v6',
        country,
        date: targetDate,
        convergence_score: null,
        coverage_reason: 'insufficient_coverage',
        signals_available: scoredSignals.length,
        source_health_snapshot,
        generated_at: new Date().toISOString()
      };
    }

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
      source: 'Sabian_Convergence_Engine_v6',
      country,
      date: targetDate,
      convergence_score: convergenceScore,
      risk_level: riskLevel,
      threshold_window: thresholdWindow,
      signals_available: scoredSignals.length,
      signals_failed: nullSignals.map(s => s.name),
      freshness_pct,
      source_health_snapshot,
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
    return { source: 'Sabian_Convergence_Engine_v6', country, date: targetDate, error: err.message };
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
