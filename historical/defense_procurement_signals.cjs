// historical/defense_procurement_signals.cjs
// Defense procurement signal fetchers — government action/intent layer
// Phase 4.5 Step 10-Pre-F: Defense Procurement Layer
//
// Data sources:
// - SIPRI Military Expenditure Database (1949–present, 153 countries)
// - SIPRI Arms Transfers Database (1950–present, imports/exports)
// - US DoD contract awards (future: defense.gov scraper)
// - Export licenses (future: US State Dept, EU reports)
// - Defense contractor SEC filings (future: EDGAR API)
//
// NOTE: Defense procurement is NOT converged into stress score.
// It's a separate behavioral layer showing government intent/action.

// SIPRI data structure (simplified for this implementation)
// In production, this would fetch from SIPRI API or parse their annual CSV releases
// For now, we'll use a placeholder structure and fetcher pattern

const DEFENSE_PROCUREMENT_SIGNALS = {
  defense_spending: {
    key: 'defense_spending',
    name: 'Defense Spending',
    description: 'Military expenditure as % of GDP and absolute USD',
    source: 'SIPRI Military Expenditure Database',
    available_from: 1949,
    cadence: 'annual',
    units: 'percent_gdp'
  },
  arms_imports: {
    key: 'arms_imports',
    name: 'Arms Imports',
    description: 'Value of imported major conventional weapons',
    source: 'SIPRI Arms Transfers Database',
    available_from: 1950,
    cadence: 'annual',
    units: 'trend_indicator_value'
  },
  arms_exports: {
    key: 'arms_exports',
    name: 'Arms Exports',
    description: 'Value of exported major conventional weapons',
    source: 'SIPRI Arms Transfers Database',
    available_from: 1950,
    cadence: 'annual',
    units: 'trend_indicator_value'
  }
};

// Country name mappings (SIPRI uses different names than our system in some cases)
const COUNTRY_MAPPINGS = {
  'United States': 'United States',
  'Russia': 'Russia',
  'China': 'China',
  'Turkey': 'Turkey',
  'Israel': 'Israel',
  'Ukraine': 'Ukraine',
  'South Korea': 'South Korea',
  'United Kingdom': 'UK',
  'Germany': 'Germany',
  'France': 'France',
  'India': 'India',
  'Saudi Arabia': 'Saudi Arabia',
  'Iran': 'Iran',
  // Add more mappings as needed
};

// ── Defense Spending Fetcher (SIPRI Military Expenditure) ────────────────────

/**
 * Fetch defense spending data for a country
 *
 * SIPRI publishes annual military expenditure data:
 * - % of GDP
 * - Absolute spending (constant 2022 USD)
 * - Per capita spending
 *
 * In production, this would:
 * 1. Fetch from SIPRI API (if available) or
 * 2. Parse their annual CSV/Excel files (https://milex.sipri.org/sipri)
 *
 * For now, this is a placeholder that returns synthetic data structure.
 * Real implementation would require SIPRI data license or web scraping.
 */
async function fetchDefenseSpending(country) {
  // Placeholder for SIPRI military expenditure fetcher
  // Real implementation would fetch from SIPRI database or parse CSV files

  console.log(`[DEFENSE] Placeholder: Would fetch defense spending for ${country} from SIPRI`);

  // Return empty for now - real data would come from SIPRI
  return [];

  // Expected return format:
  // [
  //   { country: 'Turkey', year: 2024, value: 1.9, units: 'percent_gdp', absolute_usd: 10600000000 },
  //   { country: 'Turkey', year: 2023, value: 2.0, units: 'percent_gdp', absolute_usd: 9800000000 },
  //   ...
  // ]
}

// ── Arms Transfers Fetcher (SIPRI Arms Transfers Database) ────────────────────

/**
 * Fetch arms imports/exports for a country
 *
 * SIPRI Arms Transfers Database tracks:
 * - Major conventional weapons transfers
 * - Trend Indicator Value (TIV) - volume of transfers
 * - Supplier/recipient countries
 * - Weapon categories (aircraft, naval, armored vehicles, etc.)
 *
 * Data: https://armstrade.sipri.org/armstrade/page/trade_register.php
 *
 * Real implementation would parse SIPRI's annual reports or use API.
 */
async function fetchArmsTransfers(country) {
  // Placeholder for SIPRI arms transfers fetcher
  console.log(`[DEFENSE] Placeholder: Would fetch arms transfers for ${country} from SIPRI`);

  return { imports: [], exports: [] };

  // Expected return format:
  // {
  //   imports: [
  //     { country: 'Turkey', year: 2024, value: 420, supplier: 'United States', category: 'aircraft' },
  //     ...
  //   ],
  //   exports: [
  //     { country: 'Turkey', year: 2024, value: 180, recipient: 'Azerbaijan', category: 'uav' },
  //     ...
  //   ]
  // }
}

// ── DoD Contract Awards (Future Implementation) ───────────────────────────────

/**
 * Fetch US DoD contract awards
 *
 * Source: https://www.defense.gov/News/Contracts/
 * Published daily, contracts >$7M
 *
 * Future implementation would:
 * 1. Scrape defense.gov daily
 * 2. Parse contract announcements
 * 3. Extract: contractor, amount, system type, foreign military sales (FMS) recipient
 * 4. Track which countries are receiving FMS awards
 */
async function fetchDoDContracts(country) {
  // Placeholder - future implementation
  console.log(`[DEFENSE] Placeholder: Would fetch DoD contracts for ${country}`);
  return [];
}

// ── Export Licenses (Future Implementation) ───────────────────────────────────

/**
 * Fetch export license approvals
 *
 * Sources:
 * - US State Dept Direct Commercial Sales (DCS) notifications
 * - EU Annual Report on Arms Exports
 * - UK Strategic Export Controls
 *
 * Future implementation would parse PDFs or scrape notifications.
 */
async function fetchExportLicenses(country) {
  // Placeholder - future implementation
  console.log(`[DEFENSE] Placeholder: Would fetch export licenses for ${country}`);
  return [];
}

// ── Main Fetcher ──────────────────────────────────────────────────────────────

async function fetchDefenseProcurementSignals(country) {
  console.log(`[DEFENSE] Fetching defense procurement signals for ${country}...`);

  const signals = [];

  // Fetch all available data sources
  const [spending, transfers] = await Promise.all([
    fetchDefenseSpending(country),
    fetchArmsTransfers(country)
  ]);

  // Transform defense spending into signal readings
  for (const reading of spending) {
    signals.push({
      country: reading.country,
      year: reading.year,
      signal_key: 'defense_spending',
      value: reading.value,
      metadata: {
        units: 'percent_gdp',
        absolute_usd: reading.absolute_usd
      }
    });
  }

  // Transform arms imports
  for (const imp of transfers.imports) {
    signals.push({
      country: imp.country,
      year: imp.year,
      signal_key: 'arms_imports',
      value: imp.value,
      metadata: {
        supplier: imp.supplier,
        category: imp.category
      }
    });
  }

  // Transform arms exports
  for (const exp of transfers.exports) {
    signals.push({
      country: exp.country,
      year: exp.year,
      signal_key: 'arms_exports',
      value: exp.value,
      metadata: {
        recipient: exp.recipient,
        category: exp.category
      }
    });
  }

  return signals;
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  DEFENSE_PROCUREMENT_SIGNALS,
  fetchDefenseProcurementSignals,
  fetchDefenseSpending,
  fetchArmsTransfers,
  fetchDoDContracts,
  fetchExportLicenses
};
