# Defense Procurement Layer — Validation Complete

**Completed:** 2026-05-25
**Status:** Defense spending validated, arms transfers pending

---

## What Was Built

### Data Integration
- **SIPRI Military Expenditure Database** — 8,360 records ingested
- **Coverage:** 164 countries, 1949-2025 (77 years)
- **Signal:** `defense_spending` — military expenditure as % of GDP
- **Storage:** `historical_signal_readings` table in Supabase

### Pattern Validation
- **Tests run:** 118 comprehensive tests across 5 categories
- **Tests with findings:** 70
- **Sample sizes:** Real historical data, not placeholders
- **Methodology:** Backtest defense spending against convergence scores at multiple lags (1-5 years)

### Test Categories

1. **Defense Spending Spikes → Score Movement** (25 tests)
   - Tested thresholds: 10%, 20%, 30%, 50%, 100% spending increases
   - Tested lags: 1-5 years
   - Result: NO consistent pattern. Scores move independently.

2. **Score Elevated → Defense Spending Response** (25 tests)
   - Tested score thresholds: 65, 70, 75, 80, 85
   - Tested lags: 1-5 years
   - Result: NO consistent response. Governments don't automatically increase spending when scores rise.

3. **Arms Imports/Exports Patterns** (0 findings)
   - Status: Data not yet integrated
   - Pending: SIPRI Arms Transfers Database

4. **Divergence Patterns** (2 tests)
   - Pattern A: Score elevated + spending flat → what follows?
   - Pattern B: Score stable + spending spike → does score follow?
   - Result: Divergence is common. Score and spending are independent.

5. **Defense Procurement → Institutional Signal Elevation** (66 tests)
   - Which institutional signals become elevated after procurement spikes?
   - Results: Limited cases (n=6-8) for governance, economic_stress, power_grid

---

## Key Validated Findings

### Finding 1: Defense spending spikes do NOT predict score movements
**Reading:** In 134 historical cases where defense spending increased >10%, scores moved independently:
- Score increased: 29 cases (21.6%)
- Score decreased: 24 cases (17.9%)
- Score stable: 81 cases (60.4%)

**Sample size:** 134 cases
**Interpretation:** Procurement activity and stress score are independent dimensions. Spending spike does not cause score elevation.

### Finding 2: Elevated scores do NOT trigger defense spending responses
**Reading:** In 12 cases where convergence score crossed 70, defense spending increased in only 2 cases at +1yr lag.

**Sample size:** 12 cases
**Interpretation:** Score elevation does not automatically trigger procurement response. Government action is policy-driven, not score-driven.

### Finding 3: Divergence is common
**Reading:** In 12 cases where score was ≥70 but spending remained flat, score increased in 1 case and decreased in 3 cases the following year. In 62 cases where score was <65 but spending spiked, score followed upward in only 12 cases.

**Sample size:** 74 cases
**Interpretation:** Procurement shows government INTENT, not environment prediction. Display as separate layer for triangulation.

### Finding 4: Small sample sizes at extreme thresholds
At 100%+ spending spikes: only 7 cases in entire 77-year dataset. Insufficient for pattern claims.

---

## Implementation Updates

### Dossier Page 2.75
**Before:** "Data pending" message
**After:** Validated patterns with real sample sizes, key findings, triangulation method

**Content structure:**
- Purpose: Government action/intent signal
- Signals: defense_spending (latest value, trend, years of data)
- Data source: SIPRI Military Expenditure Database
- Pattern validation status: Complete (118 tests, 70 findings)
- Key findings: 3 validated patterns with real sample sizes
- Triangulation method: Compare spending trend vs. score trend, interpret divergence
- Data gaps: Arms imports/exports pending

### Files Created
1. `historical/parse_sipri_milex.cjs` — SIPRI Excel parser (handles row-based format)
2. `historical/defense_pattern_backtest.cjs` — 118-test comprehensive backtest
3. `historical/generate_defense_report.cjs` — Human-readable report generator
4. `historical/DEFENSE_PROCUREMENT_VALIDATED_PATTERNS.json` — Raw results (8,236 lines)
5. `historical/DEFENSE_PROCUREMENT_VALIDATED_PATTERNS.md` — Human-readable report
6. `historical/DEFENSE_PROCUREMENT_COMPLETE.md` — This completion summary

### Files Updated
1. `historical/dossier_generator.cjs:142` — Page 2.75 now shows validated patterns
2. `historical/SABIAN_ROADMAP.md:109` — Step 10-Pre-F marked as validated for defense spending

---

## What This Means for Buyers

**Core value proposition:**

Defense procurement is NOT a leading indicator of stress score. It's an **independent signal of government intent/action** that provides triangulation value.

**Use case:**

When viewing a country dossier:
1. Check convergence score and trend (institutional stress measurement)
2. Check defense spending and trend (government action signal)
3. Compare the two:
   - **Convergence** (both rising or both falling): Environment and policy aligned
   - **Divergence** (score rising + spending flat): Government inaction despite elevated stress
   - **Divergence** (score stable + spending spiking): Government mobilizing despite stable environment — policy-driven or anticipatory action

**The question this layer answers:** "What is the government DOING?" (not "What will happen?")

---

## Data Gaps

### Still Pending: SIPRI Arms Transfers Database
**Required for:**
- `arms_imports` signal (TIV values)
- `arms_exports` signal (TIV values)
- Pattern tests: Do arms spikes predict anything? (Category 3 tests currently 0 findings)

**Next step:** Download SIPRI Arms Transfers Database, parse, ingest, re-run comprehensive backtest with arms data included.

---

## Language Compliance

All pattern descriptions use "reading" language, not "prediction" language:
- ✅ "In N cases where [condition], [outcome]. Sample size: N."
- ❌ "68% probability that [outcome] will occur"

No prediction framing. All claims trace to real historical cases with explicit sample sizes.

---

## Phase 5 Readiness

**Defense procurement layer:** ✅ Ready for Phase 5
- Data integrated: defense_spending
- Patterns validated: 118 tests, 70 findings
- Dossier updated: Page 2.75 shows real patterns
- Language compliant: No prediction framing

**Arms transfers:** ⚠️ Pending but not blocking
- Can proceed to Phase 5 without arms data
- Arms transfers can be added later as enhancement

**Recommendation:** Move to Phase 5. Defense spending layer is validated and production-ready.

