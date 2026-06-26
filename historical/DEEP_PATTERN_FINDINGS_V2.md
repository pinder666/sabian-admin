# SABIAN DEEP PATTERN ANALYSIS — 2026-06-25T23:54:11.665Z
## 65,715 total tests | Every finding traceable to exact database rows

---

## A. SIGNAL-PAIR CORRELATIONS (All 33 Signals, Lag 0)
Tested: 527 pairs | Showing top 20 by |r|

corruption_risk ↔ power_grid: r=0.827, n=139
corruption_risk ↔ governance: r=0.796, n=12
night_lights ↔ power_grid: r=0.789, n=133
displacement ↔ unhcr_refugees: r=0.765, n=28
governance ↔ unhcr_refugees: r=0.762, n=12
corruption_risk ↔ vdem_governance: r=0.746, n=202
power_grid ↔ usda_food_supply: r=0.73, n=139
energy_stress ↔ iom_displacement: r=0.715, n=12
energy_stress ↔ power_grid: r=0.711, n=20
dark_vessel ↔ port_congestion: r=0.707, n=199
governance ↔ sanctions_pressure: r=0.698, n=12
capital_flows ↔ governance: r=-0.689, n=18
flight_movement ↔ night_lights: r=-0.688, n=77
flight_movement ↔ power_grid: r=-0.685, n=77
dark_vessel ↔ governance: r=0.663, n=12
corruption_risk ↔ energy_stress: r=0.661, n=20
governance ↔ health_crisis: r=0.651, n=12
corruption_risk ↔ usda_food_supply: r=0.647, n=202
energy_stress ↔ sanctions_pressure: r=0.643, n=20
iom_displacement ↔ vdem_governance: r=0.642, n=48

## B. LEAD INDICATORS (Extended Lag Analysis, Lags 1-10)
Pairs tested: 34 | Lead indicators with |r| >= 0.4:

defense_spending → sanctions_pressure (lag 2yr): r=-0.885, n=13
defense_spending → sanctions_pressure (lag 3yr): r=-0.6, n=13
defense_spending → sanctions_pressure (lag 4yr): r=-0.764, n=11
defense_spending → sanctions_pressure (lag 5yr): r=-0.853, n=11
defense_spending → sanctions_pressure (lag 6yr): r=-0.758, n=12
health_crisis → sanctions_pressure (lag 6yr): r=0.512, n=26
health_crisis → unhcr_odp (lag 1yr): r=0.579, n=29
health_crisis → unhcr_odp (lag 2yr): r=0.631, n=26
health_crisis → unhcr_odp (lag 3yr): r=0.725, n=24
health_crisis → unhcr_odp (lag 4yr): r=0.846, n=23
health_crisis → unhcr_odp (lag 5yr): r=0.834, n=24
health_crisis → unhcr_odp (lag 6yr): r=0.843, n=22
health_crisis → unhcr_odp (lag 7yr): r=0.829, n=20
health_crisis → unhcr_odp (lag 8yr): r=0.852, n=19
health_crisis → unhcr_odp (lag 9yr): r=0.831, n=19

## C. SIGNAL-TO-SCORE CORRELATIONS (All Signals × 8 Lags)
Top 15 signal-to-score relationships:

gdelt_tone → score (lag 0yr): r=0.948, n=932
iom_displacement → score (lag 0yr): r=0.908, n=157
election_calendar → score (lag 0yr): r=0.88, n=416
iom_displacement → score (lag 1yr): r=0.867, n=109
vdem_governance → score (lag 1yr): r=0.845, n=2268
vdem_governance → score (lag 0yr): r=0.829, n=2470
vdem_governance → score (lag 2yr): r=0.811, n=2268
governance → score (lag 0yr): r=0.798, n=18
vdem_governance → score (lag 3yr): r=0.787, n=2268
iom_displacement → score (lag 2yr): r=0.785, n=109
vdem_governance → score (lag 4yr): r=0.764, n=2268
energy_stress → score (lag 0yr): r=0.757, n=20
corruption_risk → score (lag 0yr): r=0.752, n=240
vdem_governance → score (lag 5yr): r=0.745, n=2268
power_grid → score (lag 4yr): r=0.744, n=13

## D. GOING-DARK ANALYSIS — SILENCE AS SIGNAL
Going-dark events detected: 167
When a signal goes dark, average score change during darkness:

seismic_risk: 20 events, avg score change during darkness = +24.31
health_crisis: 75 events, avg score change during darkness = +11.53
vdem_governance: 17 events, avg score change during darkness = +8.97
sanctions_pressure: 25 events, avg score change during darkness = +8.22
defense_spending: 6 events, avg score change during darkness = +4.38
economic_stress: 3 events, avg score change during darkness = +2.73
unhcr_odp: 3 events, avg score change during darkness = +1.07
gdelt_tone: 4 events, avg score change during darkness = -0.35
conflict: 11 events, avg score change during darkness = +0.15

## D2. GOING-DARK SEQUENCES — WHICH SIGNAL FAILS FIRST
First signal to go dark (most common):

iom_displacement: first to go dark in 9 countries
conflict: first to go dark in 6 countries
displacement: first to go dark in 3 countries
defense_spending: first to go dark in 1 countries
gdelt_tone: first to go dark in 1 countries
capital_flows: first to go dark in 1 countries

## D3. DARKEST COUNTRIES (Most Signals Currently Dark)
Bolivia (2026): 3 of 34 ever-present signals now dark, score=54
Argentina (2026): 3 of 31 ever-present signals now dark, score=56
Thailand (2026): 3 of 31 ever-present signals now dark, score=47
New Zealand (2026): 3 of 22 ever-present signals now dark, score=20
Guatemala (2026): 3 of 33 ever-present signals now dark, score=64
Greece (2026): 2 of 29 ever-present signals now dark, score=31
Peru (2026): 2 of 30 ever-present signals now dark, score=49
Brazil (2026): 2 of 31 ever-present signals now dark, score=44
Iraq (2026): 2 of 35 ever-present signals now dark, score=79
Colombia (2026): 2 of 33 ever-present signals now dark, score=64

## E. SILENCE QUANTIFICATION — DARKNESS % vs SCORE
Spearman r (darkness% vs score): 0.093, n=16837
Average score by darkness level:
  30-50% dark: avg score 68.1, n=60
  50%+ dark: avg score 52.2, n=16777

## F. THREE-SIGNAL CO-ACTIVATION CLUSTERS
Top 10 clusters by score amplification:


## G. MONTE CARLO SCORE BAND SIMULATIONS (1,000 draws per band)

## H. CONDITIONAL PROBABILITY — P(score > threshold | signal > threshold)
Top 15 by lift ratio:

vdem_governance > 1.5 → P(score>75) = 0.457 vs baseline 0.002 (lift 218.25x), n_elevated=81
vdem_governance > 1 → P(score>75) = 0.398 vs baseline 0.002 (lift 189.14x), n_elevated=93
vdem_governance > 1 → P(score>65) = 0.667 vs baseline 0.006 (lift 113.19x), n_elevated=93
vdem_governance > 0.5 → P(score>75) = 0.131 vs baseline 0.001 (lift 94.75x), n_elevated=298
vdem_governance > 2 → P(score>75) = 0.462 vs baseline 0.005 (lift 92.5x), n_elevated=65
vdem_governance > 1.5 → P(score>65) = 0.667 vs baseline 0.009 (lift 72.39x), n_elevated=81
vdem_governance > 2 → P(score>65) = 0.692 vs baseline 0.013 (lift 53.71x), n_elevated=65
vdem_governance > 0.5 → P(score>65) = 0.218 vs baseline 0.005 (lift 43.07x), n_elevated=298
corruption_risk > 0.5 → P(score>75) = 0.247 vs baseline 0.007 (lift 35.38x), n_elevated=97
corruption_risk > 0.5 → P(score>65) = 0.443 vs baseline 0.028 (lift 15.85x), n_elevated=97
night_lights > 1 → P(score>85) = 0.1 vs baseline 0.007 (lift 14x), n_elevated=10
power_grid > 0.5 → P(score>75) = 0.463 vs baseline 0.036 (lift 12.86x), n_elevated=41
corruption_risk > 1 → P(score>75) = 0.323 vs baseline 0.028 (lift 11.48x), n_elevated=62
night_lights > 0.5 → P(score>85) = 0.077 vs baseline 0.007 (lift 10.54x), n_elevated=13
corruption_risk > 1.5 → P(score>75) = 0.415 vs baseline 0.04 (lift 10.31x), n_elevated=41

## I. SIGNAL CO-ACTIVATION PAIRS (Simultaneous Elevation, Lift > 1.5x)
0 pairs co-activate more than expected. Top 15:


## J. RECOVERY CURVE ANALYSIS
Time for signal to return to baseline after peak:

vdem_governance: avg recovery 49.8yr (5 events), avg collapse 11yr, asymmetry ratio 4.53

## K. FIRST-MOVER DETECTION (Score Crossing Events)
Total score crossings analyzed: 233
No detectable first-mover: 223 (95.7% — these are the true unknown unknowns)

health_crisis: first-mover in 6 crossings (2.6%)
defense_spending: first-mover in 3 crossings (1.3%)
vdem_governance: first-mover in 1 crossings (0.4%)

## L. REGIONAL DIVERGENCE (Top 20 Signal-Region Deviations from Global Mean)
[MENA] fao_food_import: above_global by +2.616 (regional=0.752, global=-1.864, n=18)
[Sub-Saharan Africa] night_lights: above_global by +2.277 (regional=-0.023, global=-2.299, n=35)
[MENA] water_stress: above_global by +2.264 (regional=1.963, global=-0.301, n=18)
[South & Southeast Asia] vdem_governance: above_global by +1.739 (regional=1.862, global=0.123, n=14)
[MENA] chokepoint: above_global by +1.677 (regional=-1, global=-2.676, n=18)
[South & Southeast Asia] flood_risk: above_global by +1.594 (regional=-1.167, global=-2.761, n=14)
[Sub-Saharan Africa] power_grid: above_global by +1.566 (regional=1.118, global=-0.448, n=35)
[Sub-Saharan Africa] fire_hotspot: above_global by +1.461 (regional=2.76, global=1.299, n=20)
[Sub-Saharan Africa] iom_displacement: above_global by +1.341 (regional=2.051, global=0.71, n=22)
[South & Southeast Asia] rail_corridor: above_global by +1.313 (regional=-1.276, global=-2.589, n=14)
[Sub-Saharan Africa] usda_food_supply: above_global by +1.26 (regional=-0.148, global=-1.408, n=37)
[Latin America] corruption_risk: above_global by +1.125 (regional=1.369, global=0.244, n=15)
[Europe & FSU] rail_corridor: above_global by +1.123 (regional=-1.466, global=-2.589, n=17)
[Latin America] cable_disruption: below_global by -1.06 (regional=-2.933, global=-1.873, n=15)
[Europe & FSU] night_lights: below_global by -1.034 (regional=-3.333, global=-2.299, n=16)
[Sub-Saharan Africa] corruption_risk: above_global by +1.021 (regional=1.265, global=0.244, n=37)
[Europe & FSU] economic_stress: below_global by -0.998 (regional=-2.588, global=-1.589, n=16)
[Sub-Saharan Africa] sanctions_pressure: below_global by -0.963 (regional=-2.291, global=-1.328, n=51)
[South & Southeast Asia] corruption_risk: above_global by +0.899 (regional=1.143, global=0.244, n=14)
[Sub-Saharan Africa] flight_movement: below_global by -0.86 (regional=-3.31, global=-2.449, n=23)

## M. COMPOUND AMPLIFICATION — N SIGNALS ELEVATED SIMULTANEOUSLY
0 signals elevated: avg score 52, median 50.4, p90 56.7 (n=16554)
1 signals elevated: avg score 64.1, median 64.5, p90 82.2 (n=197)
2 signals elevated: avg score 56.1, median 54, p90 63.6 (n=25)
3 signals elevated: avg score 59.9, median 61, p90 66 (n=15)
4 signals elevated: avg score 70, median 70, p90 76 (n=18)
5 signals elevated: avg score 72.2, median 71.5, p90 78 (n=6)
7 signals elevated: avg score 77.6, median 78, p90 79.4 (n=7)

## N. RISK BAND TRANSITION MATRIX (Year-over-Year)
STABLE (n=13761): →STABLE:95.7% →ELEVATED:0.2% →MODERATE:2.6% →MINIMAL:1.2% →HIGH:0.2% →CRITICAL:0.1%
ELEVATED (n=214): →MODERATE:23.4% →ELEVATED:60.7% →HIGH:5.6% →STABLE:8.9% →CRITICAL:1.4%
MODERATE (n=2007): →STABLE:17.7% →MODERATE:77.9% →ELEVATED:2.6% →CRITICAL:0.3% →HIGH:0.3% →MINIMAL:1.1%
MINIMAL (n=230): →STABLE:38.3% →MINIMAL:59.6% →MODERATE:2.2%
HIGH (n=112): →STABLE:8.9% →MODERATE:6.3% →ELEVATED:9.8% →HIGH:69.6% →CRITICAL:5.4%
CRITICAL (n=151): →MODERATE:2% →CRITICAL:85.4% →HIGH:4.6% →ELEVATED:2% →STABLE:6%

## O. UNKNOWN UNKNOWNS — CROSS-DOMAIN CORRELATIONS (r >= 0.5)
Signal pairs from DIFFERENT domains with unexpected correlation:

[governance] corruption_risk ↔ [physical] power_grid: r=0.827, n=139
[behavioral] night_lights ↔ [physical] power_grid: r=0.789, n=133
[physical] power_grid ↔ [economic] usda_food_supply: r=0.73, n=139
[behavioral] flight_movement ↔ [physical] power_grid: r=-0.685, n=77
[governance] corruption_risk ↔ [economic] usda_food_supply: r=0.647, n=202
[humanitarian] iom_displacement ↔ [governance] vdem_governance: r=0.642, n=48
[economic] sanctions_pressure ↔ [humanitarian] unhcr_refugees: r=0.629, n=200
[humanitarian] health_crisis ↔ [economic] sanctions_pressure: r=0.614, n=281
[humanitarian] iom_displacement ↔ [economic] usda_food_supply: r=0.611, n=48
[behavioral] flight_movement ↔ [economic] usda_food_supply: r=-0.595, n=78
[governance] corruption_risk ↔ [humanitarian] iom_displacement: r=0.577, n=48
[humanitarian] iom_displacement ↔ [economic] sanctions_pressure: r=0.573, n=48
[behavioral] night_lights ↔ [economic] usda_food_supply: r=0.567, n=150
[physical] power_grid ↔ [governance] vdem_governance: r=0.567, n=139
[economic] usda_food_supply ↔ [governance] vdem_governance: r=0.566, n=202
[economic] fao_food_import ↔ [physical] water_stress: r=0.557, n=153
[governance] corruption_risk ↔ [economic] fao_food_import: r=0.556, n=202
[economic] sanctions_pressure ↔ [governance] vdem_governance: r=0.551, n=211
[humanitarian] unhcr_refugees ↔ [governance] vdem_governance: r=0.545, n=202
[economic] defense_spending ↔ [humanitarian] health_crisis: r=-0.541, n=83

## P. ASYMMETRY — COLLAPSE VS RECOVERY SPEED
vdem_governance: recovery 49.8yr, collapse 11yr, ratio=4.53 (RECOVERY SLOWER)

## Q. SIGNAL ABSENCE AS DATA POINT
Signals where absence (going dark) correlates with score:

seismic_risk absence: r=0.27 (absence correlates with higher score), dark in 15663/16837 country-years
health_crisis absence: r=-0.237 (absence correlates with lower score), dark in 15663/16837 country-years
gdelt_tone absence: r=0.128 (absence correlates with higher score), dark in 15905/16837 country-years

## R. BOOTSTRAP CONFIDENCE INTERVALS (Top 50 Correlations, 300 iterations)
95% CI for top correlations:

corruption_risk ↔ power_grid: r=0.827, 95%CI=[0.751, 0.893], n=139
corruption_risk ↔ governance: r=0.796, 95%CI=[0.356, 0.970], n=12
night_lights ↔ power_grid: r=0.789, 95%CI=[0.721, 0.852], n=133
displacement ↔ unhcr_refugees: r=0.765, 95%CI=[0.499, 0.932], n=28
governance ↔ unhcr_refugees: r=0.762, 95%CI=[0.340, 0.962], n=12
corruption_risk ↔ vdem_governance: r=0.746, 95%CI=[0.659, 0.823], n=202
power_grid ↔ usda_food_supply: r=0.73, 95%CI=[0.619, 0.820], n=139
energy_stress ↔ iom_displacement: r=0.715, 95%CI=[0.021, 0.926], n=12
energy_stress ↔ power_grid: r=0.711, 95%CI=[0.268, 0.966], n=20
dark_vessel ↔ port_congestion: r=0.707, 95%CI=[0.620, 0.791], n=199
governance ↔ sanctions_pressure: r=0.698, 95%CI=[0.273, 0.871], n=12
capital_flows ↔ governance: r=-0.689, 95%CI=[-0.856, -0.409], n=18
flight_movement ↔ night_lights: r=-0.688, 95%CI=[-0.786, -0.561], n=77
flight_movement ↔ power_grid: r=-0.685, 95%CI=[-0.791, -0.512], n=77
dark_vessel ↔ governance: r=0.663, 95%CI=[0.215, 0.891], n=12

---
## SUMMARY STATISTICS
Total tests executed: 65,715
Total convergence rows: 1
Going-dark events: 167
Cross-domain unknown unknowns: 26
Signal pairs with r >= 0.7: 10
Signal pairs with r >= 0.9: 0
Score crossings analyzed: 233
Unexplained crossings (no first-mover): 223

Generated: 2026-06-25T23:54:11.665Z