# Defense Procurement Layer — Phase 4.5 Step 10-Pre-F

**Added:** 2026-05-25  
**Version:** Sabian Intelligence Dossier v2.1  
**Status:** Infrastructure complete, data integration pending

## Overview

The Defense Procurement Layer adds government action/intent signals to Sabian's intelligence dossier. Defense procurement shows what governments ARE doing (spending, importing, exporting weapons) — a behavioral signal that can LEAD or LAG other stress indicators.

**Key Design Principle:** Defense procurement signals are **NOT converged into the stress score**. They remain as a separate layer for triangulation, just like behavioral signals (night_lights, diaspora_remittance).

---

## Why Defense Procurement Matters

Defense procurement is a **government action signal** that reveals:

1. **Intent Before Outcome (Potentially)**
   - Governments may arm up BEFORE conflict (threat perception)
   - OR after crisis starts (reaction to existing threat)
   - Lead/lag relationship with displacement, governance, conflict signals **to be determined from data**

2. **Triangulation Against Institutional Data**
   - Score elevated but procurement flat = government unable or unwilling to arm up
   - Score stable but procurement spiking = external threat perception
   - Arms exports rising + capital_flows negative = selling weapons for hard currency
   
   **Note:** These are hypotheses. Pattern validation requires backtest with actual SIPRI data against convergence scores.

3. **Historical Pattern Recognition (Pending)**
   - Once data is integrated: "When stress score crossed X AND defense procurement was Y, Z happened in N cases"
   - Lead time distributions: To be computed from actual data
   - **No pattern claims until validated**

---

## Data Sources

### Planned Implementation

1. **SIPRI Military Expenditure Database**
   - Coverage: 1949–present, 153 countries
   - Metrics: Defense spending as % of GDP, absolute USD, per capita
   - Cadence: Annual
   - Access: Public dataset (requires download or API license)
   - **Status:** NOT YET INTEGRATED

2. **SIPRI Arms Transfers Database**
   - Coverage: 1950–present
   - Metrics: Trend Indicator Value (TIV) for arms imports/exports
   - Granularity: Supplier, recipient, weapon category (aircraft, naval, ground, etc.)
   - Cadence: Annual
   - Access: Public dataset
   - **Status:** NOT YET INTEGRATED

### Future Expansion

3. **US DoD Contract Awards**
   - Source: defense.gov (published daily)
   - Threshold: Contracts >$7M
   - Includes: Foreign Military Sales (FMS) recipients

4. **Export License Approvals**
   - US State Dept: Direct Commercial Sales (DCS) notifications
   - EU Annual Report on Arms Exports
   - UK Strategic Export Controls

5. **Defense Contractor Activity**
   - SEC EDGAR filings: Lockheed Martin, Raytheon, BAE Systems, Northrop Grumman
   - Metrics: Backlog, quarterly revenue, contract awards

6. **Naval AIS Movements**
   - Commercial AIS transponders
   - Use Case: Asset positioning

---

## Signal Structure

### defense_spending
- **Key:** `defense_spending`
- **Name:** Defense Spending
- **Description:** Military expenditure as % of GDP and absolute USD
- **Source:** SIPRI Military Expenditure Database
- **Available From:** 1949
- **Units:** percent_gdp
- **Status:** Infrastructure built, data not ingested

### arms_imports
- **Key:** `arms_imports`
- **Name:** Arms Imports
- **Description:** Value of imported major conventional weapons (SIPRI TIV)
- **Source:** SIPRI Arms Transfers Database
- **Available From:** 1950
- **Units:** trend_indicator_value
- **Status:** Infrastructure built, data not ingested

### arms_exports
- **Key:** `arms_exports`
- **Name:** Arms Exports
- **Description:** Value of exported weapons
- **Source:** SIPRI Arms Transfers Database
- **Available From:** 1950
- **Units:** trend_indicator_value
- **Status:** Infrastructure built, data not ingested

---

## How It Fits Into Sabian

### Layer Architecture

```
CONVERGENCE SCORE (1-99)
├─ 12 Institutional Signals (converged)
│
BEHAVIORAL LAYER (Page 2.5)
├─ 3 Behavioral Signals (raw, not converged)
│
DEFENSE PROCUREMENT LAYER (Page 2.75)
├─ 3 Defense Signals (raw, not converged)
   └─ DATA NOT YET INTEGRATED
```

### Why NOT Converged?

Defense procurement stays separate because:

1. **It's a government action signal** (INTENT), not an outcome signal (RESULT)
2. **It can lead OR lag** stress — convergence would blend the timing
3. **Triangulation value** — seeing divergence between score and procurement is the signal
4. **Buyer needs both views** — institutional stress score + government action layer

---

## Dossier Output (Page 2.75)

### Current Status (No Data)

```
DEFENSE PROCUREMENT LAYER
────────────────────────────────────────────────
Status: Infrastructure complete, data integration pending

Note: SIPRI data not yet ingested. Pattern validation requires:
  1. SIPRI Military Expenditure (1949-present)
  2. SIPRI Arms Transfers (1950-present)
  3. Backtest against historical_convergence_scores table
  4. Compute lead/lag relationships with stress signals
  
Pattern claims will be added once validated with real data.
No sample sizes or lead times reported until backtest complete.
```

### Future Output (When Data Available)

```
DEFENSE PROCUREMENT LAYER
────────────────────────────────────────────────

Latest Readings:
  • Defense Spending: [actual value] % of GDP ($[actual] USD)
    Trend: [computed from data]
    Historical Baseline: [computed from country history]
    
  • Arms Imports: [actual value] (SIPRI TIV)
    Trend: [computed from data]
    Suppliers: [actual data]

Historical Pattern:
  [Actual pattern from backtest]
  
  Example: "In [N] historical cases where score was [X] and defense
  spending was [Y], [Z] happened within [W] timeframe. Sample size: [N].
  Lead time distribution: P10=[actual], median=[actual], P90=[actual]"

Analogues:
  [Actual historical analogues with same procurement + score pattern]
```

---

## The Output (Reading, Not Predicting)

### ❌ WRONG (Prediction)
"Turkey will procure $5B in air defense systems in 12 months."

### ✅ CORRECT (Reading + Historical Precedent)
"Turkey's defense procurement increased [actual %] in the past [N] months [from SIPRI data]. Turkey's stress score is [actual score], [actual signal states]. In [N] historical cases with this signal combination + procurement trend, [actual outcomes] followed within [actual timeframe]. Analogues: [actual country] [actual year] ([actual lead time])."

**Critical:** Every number must trace to actual data. No placeholders, no estimates, no predictions.

---

## The $50M Value Proposition

### For Defense Contractors (Lockheed Martin)
**Reading (when data available):**  
"Turkey's score is [actual]. [Actual signal states]. Turkey's defense procurement is [actual trend from SIPRI]. In [N] historical cases with this pattern, procurement [increased/decreased/remained flat] within [actual timeframe]. Lead time distribution: [actual P10/median/P90 from data]."

**Buyer Decides:** Allocate sales resources based on historical lead time.

**Value:** Positioning before RFP based on historical pattern recognition.

### For Investment Funds (BlackRock)
**Reading (when data available):**  
"Israel's score crossed [actual]. In [N] historical cases when Israel crossed this threshold, [actual outcome description] followed within [actual timeframe]. Sample size: [N]."

**Buyer Decides:** Investment timing based on historical patterns.

**Value:** Timing entry/exit based on historical precedent, not prediction.

### For Reinsurance (Marsh McLennan)
**Reading (when data available):**  
"Ukraine score [actual], procurement [actual trend]. In [N] historical cases with this pattern, [actual outcomes]. In [M] cases with different procurement response, [actual different outcomes]. Sample sizes: [N], [M]."

**Buyer Decides:** Price risk scenarios based on pattern outcomes.

**Value:** Risk pricing based on historical frequency distributions.

---

## Pattern Validation — PENDING

**Status:** No patterns validated. SIPRI data not integrated.

**Methodology (When Data Available):**

1. **Ingest SIPRI Data**
   - Parse SIPRI Military Expenditure CSV (1949-2024)
   - Parse SIPRI Arms Transfers data (1950-2024)
   - Store in `historical_signal_readings` table

2. **Compute Trends**
   - For each country-year: calculate defense_spending YoY change
   - Classify trend: rising (>15% increase), falling (<-15%), stable (else)

3. **Cross-Reference with Convergence Scores**
   - Query: All country-years where score ≥70
   - Split by procurement trend: flat vs. rising
   - Measure outcomes: score movement, displacement spike, conflict indicators

4. **Report Actual Findings**
   - "In [N] cases where score ≥70 AND procurement flat: [actual outcomes]"
   - "In [M] cases where score ≥70 AND procurement rising: [actual outcomes]"
   - Lead time distributions: actual P10, median, P90 from data
   - **If sample size <10: report "insufficient data for pattern claim"**

5. **No Prediction Language**
   - NOT: "68% probability of conflict"
   - YES: "In 17 of 25 historical cases, displacement increased. Sample size: 25."

---

## Implementation Status

### ✅ Complete
- Signal structure defined
- Fetcher functions created (placeholders)
- Ingest script built
- Dossier Page 2.75 implemented
- Infrastructure ready for data integration
- Version updated to v2.1

### 🚧 Pending — CRITICAL
- **SIPRI data integration** — without this, no patterns can be validated
- **Pattern backtest** — requires data to compute actual sample sizes and outcomes
- **Lead/lag analysis** — requires correlation map update with defense procurement
- **Language review** — ensure no prediction framing in output

### Future Expansion
- DoD contract scraper
- Export license parser
- SEC EDGAR integration
- Naval AIS tracking

---

## Files Created

1. `historical/defense_procurement_signals.cjs` — Fetcher functions (placeholders)
2. `historical/defense_procurement_ingest.cjs` — Backfill script (ready for SIPRI data)
3. `historical/DEFENSE_PROCUREMENT_LAYER.md` — This documentation
4. Updated: `historical/dossier_generator.cjs` — Added Page 2.75 (shows "data pending" message)

---

## Next Steps — REQUIRED BEFORE PHASE 5

1. **Acquire SIPRI Data**
   - Download SIPRI Military Expenditure CSV
   - Download SIPRI Arms Transfers data
   - Parse and ingest into `historical_signal_readings`

2. **Run Pattern Validation**
   - Query `historical_convergence_scores` by score threshold
   - Cross-reference with defense_spending trends
   - Compute actual sample sizes and outcomes
   - **Replace all placeholder claims with real findings**

3. **Update Correlation Map**
   - Run `node historical/relationship_map.cjs` with defense procurement
   - Compute Spearman rank at lag 0-4 years
   - Identify lead/lag relationships with institutional signals

4. **Language Audit**
   - Remove any remaining prediction framing
   - Ensure all claims trace to data
   - Report sample sizes explicitly
   - Mark insufficient-data cases

---

## Summary

Defense procurement layer is **structurally complete** but **data-empty**.

**Current State:**
- Infrastructure: ✅ Built
- Data: ❌ Not integrated
- Patterns: ❌ Not validated
- Output: Shows "data pending" message

**Critical Path to Completion:**
1. Integrate SIPRI data
2. Backtest patterns with actual convergence scores
3. Replace all placeholder claims with real findings
4. Audit language for prediction framing

**Sabian reads. The buyer decides.**

The output will show: "Here's what the defense procurement data shows NOW. Here's what happened in [N] historical cases when signals looked like this. Sample size: [N]. You decide."

**No predictions. No probabilities. No placeholders. Real data only.**
