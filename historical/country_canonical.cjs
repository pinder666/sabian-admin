// country_canonical.cjs
// Single source of truth for country name normalization.
// Every fetcher that writes to historical_signal_readings must call
// canonicalize(rawName) before inserting.
// This prevents fragmentation from source-specific naming conventions.

const CANONICAL_MAP = {
  // DRC variants → DRC
  'Democratic Republic of Congo': 'DRC',
  'Democratic Republic of the Congo': 'DRC',
  'DR Congo': 'DRC',
  'Congo, DR': 'DRC',
  'Congo. Democratic Republic': 'DRC',
  'The Democratic Republic of Congo': 'DRC',
  'Zaire': 'DRC',

  // Republic of Congo variants → Congo
  'Republic of Congo': 'Congo',
  'Republic of the Congo': 'Congo',
  'Congo Republic': 'Congo',
  'Congo, Republic': 'Congo',
  'Congo. Republic of': 'Congo',

  // UAE variants → UAE
  'United Arab Emirates': 'UAE',
  'U.A.E.': 'UAE',

  // UK variants → UK
  'United Kingdom': 'UK',
  'Great Britain': 'UK',
  'England': 'UK',

  // Bosnia variants → Bosnia
  'Bosnia and Herzegovina': 'Bosnia',
  'Bosnia & Herzegovina': 'Bosnia',
  'Bosnia-Herzegovina': 'Bosnia',

  // CAR variants → CAR
  'Central African Republic': 'CAR',

  // Côte d'Ivoire variants → Ivory Coast (engine canonical)
  "Cote d'Ivoire": 'Ivory Coast',
  "Côte d'Ivoire": 'Ivory Coast',
  "Côte D'Ivoire": 'Ivory Coast',
  "Côte d´Ivoire": 'Ivory Coast',
  "Côte-d'Ivoire": 'Ivory Coast',
  "Côte d ́Ivoire": 'Ivory Coast',

  // Misspellings
  'Czech Republik': 'Czech Republic',
  'Kuweit': 'Kuwait',
  'Moldovaa': 'Moldova',

  // Common alternates
  'Brunei Darussalam': 'Brunei',
  'Cabo Verde': 'Cape Verde',
  'Gambia, The': 'Gambia',
  'Guinea Bissau': 'Guinea-Bissau',
  'Korea (North)': 'North Korea',
  'Korea, North': 'North Korea',
  'Kyrgyz Republic': 'Kyrgyzstan',
  'Macao': 'Macau',
  'Myanmar (Burma)': 'Myanmar',
  'Sao Tome & Principe': 'Sao Tome and Principe',
  'Surinam': 'Suriname',
  'The United States of America': 'United States',
  'Timor Leste': 'Timor-Leste',
  'Trinidad & Tobago': 'Trinidad and Tobago',
  'Türkiye': 'Turkey',
  'Viet Nam': 'Vietnam',
  'Dominican Rep.': 'Dominican Republic',
  'Samoa/Western Samoa': 'Samoa',
  'Serbia & Montenegro': 'Serbia',
  'Serbia (Yugoslavia)': 'Serbia',
};

function canonicalize(name) {
  if (!name) return name;
  return CANONICAL_MAP[name] || name;
}

module.exports = { canonicalize, CANONICAL_MAP };
