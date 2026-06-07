# COMPREHENSIVE SIGNAL FINDINGS
## 1028 tests across 43 signals
## Generated: 2026-05-26

---

## Test Coverage
- A: All-pairs Spearman lag 0 — 631 pairs tested
- B: Top pairs at lags 1–4 — 120 extended tests
- C: Signal-to-convergence-score — 84 tests
- D: Regional divergence — 8 region × signal tests
- E: Three-signal clusters — 99 combinations
- F: Collapse vs recovery asymmetry — 11 signals
- G: First-mover detection — 8 signals, 87 crisis events
- H: Going-dark sequence — 15 signals
- I: Risk-band signal composition — 52 band × signal tests
- **TOTAL: 1028 tests**

---

## A — Top Signal Pair Correlations (lag 0)

*Spearman rank correlation across all available country-years. n = number of country-year observations where both signals present.*

### Strong Correlations (|r| ≥ 0.70, n ≥ 20)

**power_grid ↔ sovereign_cds**: r=0.916, n=88, positive relationship
**corruption_risk ↔ power_grid**: r=0.877, n=88, positive relationship
**capital_flows ↔ sovereign_cds**: r=0.847, n=30, positive relationship
**capital_flows ↔ corruption_risk**: r=0.840, n=30, positive relationship
**capital_flows ↔ night_lights**: r=0.832, n=29, positive relationship
**corruption_risk ↔ sovereign_cds**: r=0.769, n=102, positive relationship
**capital_flows ↔ fao_food_import**: r=0.746, n=30, positive relationship
**capital_flows ↔ usda_food_supply**: r=0.727, n=30, positive relationship
**night_lights ↔ power_grid**: r=0.718, n=86, positive relationship

### Moderate Correlations (|r| 0.50–0.69, n ≥ 20)

**power_grid ↔ usda_food_supply**: r=0.657, n=88, positive relationship
**imf_fiscal ↔ vdem_governance**: r=-0.643, n=30, inverse relationship
**corruption_risk ↔ vdem_governance**: r=0.632, n=104, positive relationship
**corruption_risk ↔ usda_food_supply**: r=0.629, n=104, positive relationship
**night_lights ↔ sovereign_cds**: r=0.627, n=100, positive relationship
**usda_food_supply ↔ vdem_governance**: r=0.577, n=104, positive relationship
**pipeline_risk ↔ rail_corridor**: r=0.557, n=104, positive relationship
**sovereign_cds ↔ usda_food_supply**: r=0.553, n=102, positive relationship
**maritime_trade ↔ power_grid**: r=0.546, n=55, positive relationship
**corruption_risk ↔ resource_conflict**: r=0.534, n=20, positive relationship
**maritime_trade ↔ sovereign_cds**: r=0.527, n=67, positive relationship
**dam_risk ↔ usda_food_supply**: r=0.525, n=104, positive relationship
**power_grid ↔ vdem_governance**: r=0.517, n=88, positive relationship
**sanctions_pressure ↔ vdem_governance**: r=0.516, n=104, positive relationship
**chokepoint ↔ resource_conflict**: r=-0.513, n=20, inverse relationship
**election_calendar ↔ sanctions_pressure**: r=0.507, n=104, positive relationship
**capital_flows ↔ port_congestion**: r=-0.501, n=30, inverse relationship

### Cross-Domain Correlations (natural signals ↔ governance)

*These pairs cross category boundaries — the correlation is not an artifact of shared measurement.*

**fire_hotspot ↔ vdem_governance**: r=0.308, n=36

---

## B — Lagged Relationships (lags 1–4 years)

*For top pairs at lag 0, tested whether one signal leads the other. "Signal A at year T predicts Signal B at year T+lag" reads as: when A was elevated, B was also elevated lag years later.*

**power_grid → sovereign_cds** at lag 4yr: r=-0.738, n=98 (vs r=0.916 at lag 0, Δ-1.654)
**imf_fiscal → vdem_governance** at lag 1yr: r=-0.608, n=30 (vs r=-0.643 at lag 0, Δ+0.035)
**imf_fiscal → vdem_governance** at lag 2yr: r=-0.475, n=31 (vs r=-0.643 at lag 0, Δ+0.168)
**power_grid → usda_food_supply** at lag 4yr: r=-0.450, n=100 (vs r=0.657 at lag 0, Δ-1.107)
**imf_fiscal → vdem_governance** at lag 3yr: r=-0.418, n=32 (vs r=-0.643 at lag 0, Δ+0.225)
**imf_fiscal → vdem_governance** at lag 4yr: r=-0.416, n=32 (vs r=-0.643 at lag 0, Δ+0.227)
**power_grid → vdem_governance** at lag 2yr: r=-0.409, n=89 (vs r=0.517 at lag 0, Δ-0.927)
**power_grid → vdem_governance** at lag 1yr: r=-0.408, n=89 (vs r=0.517 at lag 0, Δ-0.926)

---

## C — Signal-to-Convergence-Score Correlation

*How strongly does each individual signal correlate with the overall country stress score at various lags?*

| Signal | lag=0 r | lag=1 r | lag=2 r | lag=3 r | n |
|--------|---------|---------|---------|---------|---|
| diaspora_remittance | 0.773 | 0.643 | 0.564 | 0.486 | 462 |
| economic_stress | 0.750 | 0.254 | 0.132 | 0.103 | 7660 |
| night_lights | 0.728 | 0.471 | 0.423 | 0.383 | 500 |
| corruption_risk | 0.694 | n/a | n/a | n/a | 104 |
| trade_collapse | 0.673 | 0.163 | 0.007 | 0.014 | 5492 |
| usda_food_supply | 0.641 | n/a | n/a | n/a | 104 |
| fao_food_import | 0.632 | n/a | n/a | n/a | 104 |
| capital_flows | 0.624 | 0.495 | 0.385 | 0.311 | 808 |
| sovereign_cds | 0.610 | n/a | n/a | n/a | 102 |
| governance | 0.558 | 0.304 | 0.271 | 0.126 | 3597 |
| imf_fiscal | 0.555 | 0.475 | 0.416 | 0.352 | 1266 |
| water_stress | 0.500 | n/a | n/a | n/a | 104 |
| seismic_risk | 0.490 | 0.057 | 0.032 | -0.009 | 688 |
| sanctions_pressure | 0.471 | n/a | n/a | n/a | 104 |
| displacement | 0.451 | 0.096 | 0.036 | 0.048 | 152 |
| fire_hotspot | 0.425 | 0.338 | 0.333 | 0.306 | 851 |
| dam_risk | 0.423 | n/a | n/a | n/a | 104 |
| power_grid | 0.408 | 0.324 | 0.287 | 0.243 | 4189 |
| rail_corridor | 0.389 | n/a | n/a | n/a | 104 |
| pipeline_risk | 0.380 | n/a | n/a | n/a | 104 |

---

## D — Regional Signal Divergence

*Median stress_z per region for each signal. Shows which regions are structurally elevated vs depressed on each dimension.*

### economic_stress
- **MENA**: median=0.067, n=383
- **Latin America**: median=0.038, n=293
- **East Asia & Pacific**: median=-0.028, n=101
- **South & Southeast Asia**: median=-0.03, n=297
- **Europe & FSU**: median=-0.042, n=391
- **Sub-Saharan Africa**: median=-0.076, n=754
Spread: 0.143 (MENA vs Sub-Saharan Africa)

### governance
- **MENA**: median=0.053, n=369
- **East Asia & Pacific**: median=0.011, n=115
- **Sub-Saharan Africa**: median=0.007, n=728
- **South & Southeast Asia**: median=-0.003, n=276
- **Europe & FSU**: median=-0.007, n=368
- **Latin America**: median=-0.02, n=276
Spread: 0.073 (MENA vs Latin America)

### trade_collapse
- **Latin America**: median=0.022, n=290
- **South & Southeast Asia**: median=0.02, n=253
- **MENA**: median=0, n=288
- **Europe & FSU**: median=-0.005, n=296
- **Sub-Saharan Africa**: median=-0.061, n=600
- **East Asia & Pacific**: median=-0.07, n=42
Spread: 0.092 (Latin America vs East Asia & Pacific)

### capital_flows
- **Europe & FSU**: median=0.325, n=54
- **Sub-Saharan Africa**: median=0.014, n=317
- **Latin America**: median=0.009, n=81
- **South & Southeast Asia**: median=0.008, n=57
- **MENA**: median=0.002, n=110
Spread: 0.323 (Europe & FSU vs MENA)

### imf_fiscal
- **Europe & FSU**: median=0.096, n=31
- **Latin America**: median=0.038, n=279
- **South & Southeast Asia**: median=0.011, n=108
- **Sub-Saharan Africa**: median=0, n=414
- **MENA**: median=-0.073, n=249
Spread: 0.169 (Europe & FSU vs MENA)

### fire_hotspot
- **MENA**: median=3.333, n=105
- **Sub-Saharan Africa**: median=0, n=339
- **Europe & FSU**: median=0, n=54
- **South & Southeast Asia**: median=0, n=103
- **Latin America**: median=0, n=184
- **East Asia & Pacific**: median=0, n=27
Spread: 3.333 (MENA vs East Asia & Pacific)

### displacement
- **Latin America**: median=6.943, n=8
- **Sub-Saharan Africa**: median=0.693, n=57
- **Europe & FSU**: median=0.487, n=6
- **South & Southeast Asia**: median=0, n=10
Spread: 6.943 (Latin America vs South & Southeast Asia)

### power_grid
- **Europe & FSU**: median=0.037, n=360
- **MENA**: median=0, n=375
- **East Asia & Pacific**: median=-0.036, n=110
- **South & Southeast Asia**: median=-0.079, n=285
- **Sub-Saharan Africa**: median=-0.083, n=739
- **Latin America**: median=-0.155, n=280
Spread: 0.192 (Europe & FSU vs Latin America)

---

## E — Three-Signal Simultaneous Elevation

*When all three signals are simultaneously elevated (stress_z > 0.75), what is the average convergence score? Compared to baseline.*

| Signals | Mean score (elevated) | Baseline | Score boost | n events |
|---------|----------------------|----------|-------------|---------|
| economic_stress + trade_collapse + governance | 66.4 | 51.4 | +15 | 7 |
| power_grid + fire_hotspot + capital_flows | 80.3 | 65.7 | +14.6 | 10 |
| governance + fire_hotspot + capital_flows | 75.6 | 66.4 | +9.2 | 8 |
| fire_hotspot + capital_flows + seismic_risk | 69 | 67.8 | +1.2 | 11 |
| power_grid + seismic_risk + vdem_governance | 21.1 | 21.4 | +-0.3 | 46 |
| economic_stress + seismic_risk + vdem_governance | 20.4 | 20.8 | +-0.4 | 73 |
| economic_stress + power_grid + vdem_governance | 20.7 | 21.4 | +-0.7 | 54 |
| seismic_risk + night_lights + vdem_governance | 19.9 | 20.6 | +-0.7 | 67 |
| economic_stress + night_lights + vdem_governance | 19.8 | 20.6 | +-0.8 | 77 |
| capital_flows + seismic_risk + vdem_governance | 21.5 | 22.3 | +-0.8 | 17 |
| economic_stress + seismic_risk + night_lights | 19.6 | 20.6 | +-1 | 74 |
| power_grid + night_lights + vdem_governance | 20.4 | 21.6 | +-1.2 | 50 |
| power_grid + capital_flows + vdem_governance | 19.6 | 21.2 | +-1.6 | 19 |
| power_grid + seismic_risk + night_lights | 20 | 21.6 | +-1.6 | 46 |
| economic_stress + trade_collapse + fire_hotspot | 52.6 | 54.6 | +-2 | 12 |
| economic_stress + power_grid + night_lights | 19.6 | 21.6 | +-2 | 54 |
| economic_stress + trade_collapse + power_grid | 48.9 | 51.4 | +-2.5 | 7 |
| economic_stress + capital_flows + vdem_governance | 19.9 | 23.2 | +-3.3 | 21 |
| economic_stress + fire_hotspot + capital_flows | 55.2 | 65.6 | +-10.4 | 6 |
| power_grid + fire_hotspot + seismic_risk | 51.7 | 65.8 | +-14.1 | 7 |

---

## F — Collapse vs Recovery Asymmetry

*Median years to collapse (stress_z rises by 1.0) vs median years to recover (stress_z falls by 1.0 from elevated state). Ratio > 1 = recovery takes longer than collapse.*

| Signal | Collapse (median yr) | Recovery (median yr) | Ratio | Pattern |
|--------|---------------------|---------------------|-------|---------|
| capital_flows | 3 | 4 | 1.33x | **RECOVERY_SLOWER** |
| governance | 4 | 4 | 1x | **SYMMETRIC** |
| diaspora_remittance | 4 | 4 | 1x | **SYMMETRIC** |
| imf_fiscal | 4 | 2 | 0.5x | **COLLAPSE_SLOWER** |
| fire_hotspot | 2 | 1 | 0.5x | **COLLAPSE_SLOWER** |
| displacement | 6 | 3 | 0.5x | **COLLAPSE_SLOWER** |
| gdelt_conflict | 2 | 1 | 0.5x | **COLLAPSE_SLOWER** |
| power_grid | 5 | 2 | 0.4x | **COLLAPSE_SLOWER** |
| economic_stress | 3 | 1 | 0.33x | **COLLAPSE_SLOWER** |
| trade_collapse | 3 | 1 | 0.33x | **COLLAPSE_SLOWER** |
| seismic_risk | 3 | 1 | 0.33x | **COLLAPSE_SLOWER** |

---

## G — First-Mover Detection
*87 events where convergence score crossed 70 from below. Which signal was the first to activate (stress_z > 0.75) in the 1–3 years prior?*

| Signal | Times first to activate | Share of events |
|--------|------------------------|-----------------|
| economic_stress | 30 | 34.5% |
| capital_flows | 6 | 6.9% |
| governance | 5 | 5.7% |
| trade_collapse | 3 | 3.4% |
| seismic_risk | 3 | 3.4% |
| displacement | 1 | 1.1% |
| power_grid | 1 | 1.1% |
| gdelt_conflict | 1 | 1.1% |

---

## H — Going-Dark Sequence
*During elevated score periods, which signals are most frequently absent (went dark). A signal going dark during stress is itself an intelligence signal.*

| Signal | Times dark during elevation | Rate |
|--------|---------------------------|------|
| power_grid | 8 | 1.8% |
| economic_stress | 7 | 1.6% |
| governance | 6 | 1.4% |
| trade_collapse | 6 | 1.4% |
| diaspora_remittance | 4 | 0.9% |
| night_lights | 3 | 0.7% |
| capital_flows | 2 | 0.5% |
| fire_hotspot | 2 | 0.5% |
| vdem_governance | 2 | 0.5% |
| seismic_risk | 2 | 0.5% |
| imf_fiscal | 0 | 0.0% |
| displacement | 0 | 0.0% |
| gdelt_tone | 0 | 0.0% |
| gdelt_conflict | 0 | 0.0% |
| food_security | 0 | 0.0% |

---

## I — Signal Composition by Risk Band

*For each risk band, which signals are most consistently elevated? Elevation rate = % of country-years in this band where signal stress_z > 0.75. Mean stress_z shows the central tendency.*

### CRITICAL
| Signal | Elevation rate | Mean stress_z | n |
|--------|---------------|--------------|---|
| diaspora_remittance | 100.0% | 13.018 | 5 |
| fire_hotspot | 89.0% | 1463.844 | 91 |
| capital_flows | 72.5% | 1.974 | 138 |
| displacement | 66.7% | 17371323494.61 | 9 |
| imf_fiscal | 57.1% | 7.052 | 14 |
| economic_stress | 50.4% | 1.319 | 131 |
| seismic_risk | 22.9% | 0.734 | 70 |
| trade_collapse | 20.3% | 0.176 | 69 |

### ELEVATED
| Signal | Elevation rate | Mean stress_z | n |
|--------|---------------|--------------|---|
| diaspora_remittance | 94.1% | 1.393 | 17 |
| capital_flows | 88.9% | 2.852 | 27 |
| economic_stress | 86.2% | 1.467 | 188 |
| night_lights | 81.8% | 1.527 | 11 |
| trade_collapse | 67.0% | 0.992 | 100 |
| imf_fiscal | 58.8% | 1.53 | 17 |
| seismic_risk | 54.3% | 2.122 | 35 |
| displacement | 53.3% | 1.342 | 15 |

### STRESSED
| Signal | Elevation rate | Mean stress_z | n |
|--------|---------------|--------------|---|
| displacement | 33.8% | 1.167 | 74 |
| capital_flows | 32.2% | 0.507 | 326 |
| vdem_governance | 28.3% | -0.403 | 60 |
| gdelt_conflict | 18.2% | 0.471 | 77 |
| diaspora_remittance | 17.3% | 0.332 | 197 |
| seismic_risk | 13.0% | 0.25 | 292 |
| economic_stress | 11.3% | 0.277 | 3684 |
| governance | 10.7% | 0.25 | 1799 |

### STABLE
| Signal | Elevation rate | Mean stress_z | n |
|--------|---------------|--------------|---|
| vdem_governance | 68.4% | -0.185 | 136 |
| food_security | 37.5% | -0.417 | 8 |
| night_lights | 35.9% | -1.133 | 281 |
| seismic_risk | 30.2% | -0.623 | 291 |
| capital_flows | 25.2% | -0.473 | 317 |
| displacement | 22.2% | -0.017 | 54 |
| gdelt_conflict | 14.3% | -7.697 | 70 |
| economic_stress | 13.5% | -0.367 | 3657 |

---

## Unknown Unknowns — What the Record Shows That Was Not Looked For

### Cross-Category Correlations (signals from different domains)

*These are the relationships no one is looking for — cross-domain patterns that only emerge when all signals are read simultaneously.*

- **power_grid [infrastructure] ↔ sovereign_cds [economic]**: r=0.916, n=88, positive
- **corruption_risk [governance] ↔ power_grid [infrastructure]**: r=0.877, n=88, positive
- **capital_flows [economic] ↔ corruption_risk [governance]**: r=0.840, n=30, positive
- **capital_flows [economic] ↔ night_lights [behavioral]**: r=0.832, n=29, positive
- **corruption_risk [governance] ↔ sovereign_cds [economic]**: r=0.769, n=102, positive
- **night_lights [behavioral] ↔ power_grid [infrastructure]**: r=0.718, n=86, positive
- **imf_fiscal [economic] ↔ vdem_governance [governance]**: r=-0.643, n=30, inverse
- **night_lights [behavioral] ↔ sovereign_cds [economic]**: r=0.627, n=100, positive
- **power_grid [infrastructure] ↔ vdem_governance [governance]**: r=0.517, n=88, positive
- **capital_flows [economic] ↔ port_congestion [infrastructure]**: r=-0.501, n=30, inverse
- **capital_flows [economic] ↔ vdem_governance [governance]**: r=0.493, n=35, positive
- **sovereign_cds [economic] ↔ vdem_governance [governance]**: r=0.491, n=102, positive
- **dam_risk [infrastructure] ↔ vdem_governance [governance]**: r=0.482, n=104, positive
- **internet_freedom [information] ↔ pipeline_risk [infrastructure]**: r=0.465, n=100, positive
- **corruption_risk [governance] ↔ night_lights [behavioral]**: r=0.461, n=102, positive
- **capital_flows [economic] ↔ power_grid [infrastructure]**: r=0.418, n=396, positive

### Highest-Amplifying Signal Combinations

*When these three signals are simultaneously elevated, the convergence score is on average N points above baseline.*

- **economic_stress + trade_collapse + governance**: +15 points above baseline when all three elevated (7 observed instances)

---

*Sabian reads facts from the historical record. Correlation is not causation. Sample sizes are real. No predictions.*