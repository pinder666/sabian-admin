// historical/fetchers/vdem_historical.cjs
// V-Dem Liberal Democracy Index — annual, 1789–2024 for countries with full records.
// V-Dem has no JSON API. This file embeds the LDI values from the v14 dataset
// for the countries in the convergence engine watchlist.
// Full CSV ingestion (all years back to 1789) is flagged as pending manual import.
// For now: stores the 2024 snapshot and marks all pre-2024 years as pending.

// The embedded data below is the v14 2024 LDI from vdem_governance_feed.cjs.
// Historical year series would come from V-Dem's CSV download:
//   https://v-dem.net/data/the-v-dem-dataset/

const VDEM_2024 = {
  'North Korea':  0.01, 'Eritrea': 0.02, 'Turkmenistan': 0.02, 'Saudi Arabia': 0.04,
  'UAE': 0.05, 'Cuba': 0.05, 'Laos': 0.05, 'China': 0.07, 'Vietnam': 0.08,
  'Qatar': 0.08, 'Iran': 0.08, 'Sudan': 0.06, 'Syria': 0.05, 'Afghanistan': 0.04,
  'Myanmar': 0.08, 'Libya': 0.06, 'Tajikistan': 0.06, 'Burundi': 0.07, 'CAR': 0.07,
  'Russia': 0.11, 'Egypt': 0.10, 'Algeria': 0.12, 'Kazakhstan': 0.12,
  'Ethiopia': 0.13, 'Rwanda': 0.13, 'Cambodia': 0.13, 'Belarus': 0.08,
  'Uzbekistan': 0.14, 'Jordan': 0.15, 'Turkey': 0.15, 'Uganda': 0.14,
  'Tanzania': 0.15, 'Mozambique': 0.16, 'Bangladesh': 0.17, 'Cameroon': 0.14,
  'Zimbabwe': 0.18, 'DRC': 0.15, 'Iraq': 0.18, 'Nigeria': 0.19, 'Pakistan': 0.22,
  'Venezuela': 0.09, 'Nicaragua': 0.08, 'Haiti': 0.12, 'Somalia': 0.11,
  'South Sudan': 0.09, 'Mali': 0.09, 'Burkina Faso': 0.09, 'Niger': 0.10,
  'Chad': 0.10, 'Guinea': 0.11, 'Guinea-Bissau': 0.15, 'Yemen': 0.06,
  'Hungary': 0.26, 'Serbia': 0.28, 'Georgia': 0.35, 'Kyrgyzstan': 0.25,
  'Armenia': 0.35, 'Moldova': 0.38, 'Ukraine': 0.38, 'Bolivia': 0.35,
  'Ecuador': 0.38, 'Colombia': 0.40, 'India': 0.30, 'Morocco': 0.25,
  'Tunisia': 0.22, 'Ghana': 0.48, 'Kenya': 0.40, 'Senegal': 0.40,
  'Mexico': 0.38, 'Peru': 0.38, 'Guatemala': 0.32, 'Honduras': 0.28,
  'El Salvador': 0.28, 'Brazil': 0.44, 'Indonesia': 0.40, 'Philippines': 0.38,
  'Malaysia': 0.40, 'Thailand': 0.28, 'Sri Lanka': 0.38, 'Nepal': 0.40,
  'South Africa': 0.52, 'Argentina': 0.55, 'Chile': 0.60, 'Panama': 0.55,
  'Costa Rica': 0.62, 'Romania': 0.52, 'Bulgaria': 0.50, 'Poland': 0.55,
  'Israel': 0.50, 'Mongolia': 0.52, 'Uruguay': 0.78, 'Taiwan': 0.75,
  'South Korea': 0.72, 'Japan': 0.80, 'Australia': 0.82, 'New Zealand': 0.85,
  'United States': 0.72, 'UK': 0.80, 'Germany': 0.86, 'France': 0.78,
  'Netherlands': 0.88, 'Belgium': 0.84, 'Sweden': 0.88, 'Norway': 0.90,
  'Denmark': 0.90, 'Finland': 0.90, 'Switzerland': 0.88, 'Austria': 0.84,
  'Spain': 0.78, 'Portugal': 0.80, 'Singapore': 0.40,
};

function fetchVdemHistorical(country) {
  const ldi = VDEM_2024[country];
  const results = [];

  if (ldi == null) {
    results.push({
      signal_key:   'vdem_governance',
      signal_name:  'VDem Governance',
      date:         '2024-01-01',
      raw_value:    null,
      raw_metadata: { country },
      source:       'vdem_v14_static',
      gap:          true,
      gap_reason:   'country_not_in_vdem_dataset',
    });
    return results;
  }

  // 2024 snapshot
  results.push({
    signal_key:   'vdem_governance',
    signal_name:  'VDem Governance',
    date:         '2024-01-01',
    raw_value:    ldi,
    raw_metadata: { ldi, year: 2024, note: 'v14_snapshot_2024' },
    source:       'vdem_v14_static',
    gap:          false,
    gap_reason:   null,
  });

  // All years before 2024: mark as pending CSV import
  // When V-Dem CSV is downloaded and parsed, these rows will be replaced via upsert
  for (let year = 1789; year < 2024; year++) {
    results.push({
      signal_key:   'vdem_governance',
      signal_name:  'VDem Governance',
      date:         `${year}-01-01`,
      raw_value:    null,
      raw_metadata: { country, year, note: 'pending_csv_import' },
      source:       'vdem_v14_static',
      gap:          true,
      gap_reason:   'pending_csv_import',
    });
  }

  return results;
}

module.exports = { fetchVdemHistorical };
