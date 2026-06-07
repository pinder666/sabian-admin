# SABIAN DEEP PATTERN ANALYSIS — 2026-05-26T22:43:58.884Z
## 45,381 total tests | Every finding traceable to exact database rows

---

## A. SIGNAL-PAIR CORRELATIONS (All 33 Signals, Lag 0)
Tested: 398 pairs | Showing top 20 by |r|

power_grid ↔ sovereign_cds: r=0.916, n=88
power_grid ↔ corruption_risk: r=0.877, n=88
capital_flows ↔ sovereign_cds: r=0.847, n=30
capital_flows ↔ corruption_risk: r=0.84, n=30
night_lights ↔ capital_flows: r=0.832, n=29
fire_hotspot ↔ election_calendar: r=0.779, n=13
sovereign_cds ↔ corruption_risk: r=0.769, n=102
food_security ↔ health_crisis: r=0.76, n=9
capital_flows ↔ fao_food_import: r=0.746, n=30
capital_flows ↔ usda_food_supply: r=0.727, n=30
power_grid ↔ night_lights: r=0.718, n=86
capital_flows ↔ maritime_trade: r=0.704, n=19
fire_hotspot ↔ corruption_risk: r=0.695, n=13
fire_hotspot ↔ usda_food_supply: r=0.679, n=13
power_grid ↔ usda_food_supply: r=0.657, n=88
vdem_governance ↔ currency_collapse: r=-0.635, n=10
corruption_risk ↔ vdem_governance: r=0.632, n=104
internet_freedom ↔ currency_collapse: r=-0.631, n=9
corruption_risk ↔ usda_food_supply: r=0.629, n=104
night_lights ↔ sovereign_cds: r=0.627, n=100

## B. LEAD INDICATORS (Extended Lag Analysis, Lags 1-10)
Pairs tested: 189 | Lead indicators with |r| >= 0.4:

power_grid → sovereign_cds (lag 3yr): r=-0.768, n=88
power_grid → sovereign_cds (lag 4yr): r=-0.732, n=98
power_grid → sovereign_cds (lag 5yr): r=-0.723, n=98
power_grid → sovereign_cds (lag 6yr): r=-0.707, n=98
power_grid → sovereign_cds (lag 7yr): r=-0.67, n=98
power_grid → sovereign_cds (lag 8yr): r=-0.634, n=98
power_grid → sovereign_cds (lag 9yr): r=-0.625, n=98
power_grid → sovereign_cds (lag 10yr): r=-0.491, n=98
power_grid → corruption_risk (lag 3yr): r=-0.559, n=90
power_grid → corruption_risk (lag 4yr): r=-0.524, n=100
power_grid → corruption_risk (lag 5yr): r=-0.488, n=100
power_grid → corruption_risk (lag 6yr): r=-0.486, n=100
power_grid → corruption_risk (lag 7yr): r=-0.43, n=100
power_grid → corruption_risk (lag 8yr): r=-0.491, n=100
power_grid → corruption_risk (lag 9yr): r=-0.468, n=100

## C. SIGNAL-TO-SCORE CORRELATIONS (All Signals × 8 Lags)
Top 15 signal-to-score relationships:

night_lights → score (lag 3yr): r=0.994, n=26
night_lights → score (lag 7yr): r=0.994, n=22
night_lights → score (lag 1yr): r=0.992, n=28
night_lights → score (lag 2yr): r=0.992, n=27
night_lights → score (lag 4yr): r=0.992, n=25
night_lights → score (lag 6yr): r=0.992, n=23
night_lights → score (lag 5yr): r=0.991, n=24
food_security → score (lag 0yr): r=0.889, n=9
economic_stress → score (lag 0yr): r=0.72, n=7660
corruption_risk → score (lag 0yr): r=0.694, n=104
night_lights → score (lag 0yr): r=0.664, n=131
trade_collapse → score (lag 0yr): r=0.664, n=5492
usda_food_supply → score (lag 0yr): r=0.641, n=104
fao_food_import → score (lag 0yr): r=0.632, n=104
capital_flows → score (lag 0yr): r=0.612, n=808

## D. GOING-DARK ANALYSIS — SILENCE AS SIGNAL
Going-dark events detected: 189
When a signal goes dark, average score change during darkness:

power_grid: 87 events, avg score change during darkness = -30.52
economic_stress: 91 events, avg score change during darkness = -29.81
trade_collapse: 10 events, avg score change during darkness = -8.74

## D2. GOING-DARK SEQUENCES — WHICH SIGNAL FAILS FIRST
First signal to go dark (most common):

governance: first to go dark in 63 countries
power_grid: first to go dark in 48 countries
trade_collapse: first to go dark in 12 countries
vdem_governance: first to go dark in 2 countries
economic_stress: first to go dark in 2 countries
capital_flows: first to go dark in 1 countries
fire_hotspot: first to go dark in 1 countries

## D3. DARKEST COUNTRIES (Most Signals Currently Dark)
Senegal (2030): 32 of 33 signals dark, score=59.19
Israel (2026): 32 of 33 signals dark, score=99
Honduras (2030): 32 of 33 signals dark, score=47.53
Nigeria (2030): 32 of 33 signals dark, score=51.55
El Salvador (2030): 32 of 33 signals dark, score=52.02
Pakistan (2030): 32 of 33 signals dark, score=49.43
Mexico (2030): 32 of 33 signals dark, score=60.71
Chad (2030): 32 of 33 signals dark, score=47.06
Iran (2030): 32 of 33 signals dark, score=56.7
Brazil (2030): 32 of 33 signals dark, score=61.03

## E. SILENCE QUANTIFICATION — DARKNESS % vs SCORE
Spearman r (darkness% vs score): 0.097, n=10112
Average score by darkness level:
  0-10% dark: avg score 29.6, n=13
  10-30% dark: avg score 19.1, n=91
  50%+ dark: avg score 51.7, n=10008

## F. THREE-SIGNAL CO-ACTIVATION CLUSTERS
Top 10 clusters by score amplification:

[power_grid + corruption_risk + vdem_governance] → avg score 38.2 (baseline 20.4, +17.8 pts), n=5
[power_grid + sovereign_cds + vdem_governance] → avg score 38.2 (baseline 20.4, +17.8 pts), n=5
[corruption_risk + sovereign_cds + vdem_governance] → avg score 35.3 (baseline 19.3, +15.9 pts), n=7
[power_grid + corruption_risk + sovereign_cds] → avg score 35.7 (baseline 20.4, +15.3 pts), n=6

## G. MONTE CARLO SCORE BAND SIMULATIONS (1,000 draws per band)
STABLE: empirical avg=51 (n=9184) | sim mean=50.5, 5th-95th pct=[47.2,54.4], sd=2.3
MODERATE: empirical avg=69 (n=176) | sim mean=63, 5th-95th pct=[54.5,71.7], sd=5.3
ELEVATED: empirical avg=79 (n=70) | sim mean=63, 5th-95th pct=[55.6,71.2], sd=4.9
CRITICAL: empirical avg=98 (n=198) | sim mean=2097.1, 5th-95th pct=[55.6,8309.1], sd=2856.9

## H. CONDITIONAL PROBABILITY — P(score > threshold | signal > threshold)
Top 15 by lift ratio:

fire_hotspot > 2 → P(score>85) = 0.942 vs baseline 0.014 (lift 67.99x), n_elevated=86
fire_hotspot > 1.5 → P(score>85) = 0.92 vs baseline 0.014 (lift 66.27x), n_elevated=88
fire_hotspot > 1 → P(score>85) = 0.844 vs baseline 0.014 (lift 60.14x), n_elevated=96
fire_hotspot > 0.5 → P(score>85) = 0.618 vs baseline 0.011 (lift 57.44x), n_elevated=136
fire_hotspot > 2 → P(score>75) = 0.942 vs baseline 0.019 (lift 49.86x), n_elevated=86
fire_hotspot > 1.5 → P(score>75) = 0.92 vs baseline 0.019 (lift 48.6x), n_elevated=88
fire_hotspot > 1 → P(score>75) = 0.844 vs baseline 0.019 (lift 44.1x), n_elevated=96
economic_stress > 2 → P(score>75) = 0.518 vs baseline 0.012 (lift 43.96x), n_elevated=110
fire_hotspot > 0.5 → P(score>75) = 0.618 vs baseline 0.016 (lift 38.29x), n_elevated=136
economic_stress > 1.5 → P(score>65) = 0.593 vs baseline 0.021 (lift 28.46x), n_elevated=216
economic_stress > 2 → P(score>65) = 0.736 vs baseline 0.027 (lift 27.52x), n_elevated=110
economic_stress > 1.5 → P(score>75) = 0.296 vs baseline 0.011 (lift 26.9x), n_elevated=216
economic_stress > 1 → P(score>65) = 0.406 vs baseline 0.015 (lift 26.44x), n_elevated=424
fire_hotspot > 2 → P(score>65) = 0.942 vs baseline 0.04 (lift 23.37x), n_elevated=86
fire_hotspot > 1.5 → P(score>65) = 0.92 vs baseline 0.04 (lift 22.78x), n_elevated=88

## I. SIGNAL CO-ACTIVATION PAIRS (Simultaneous Elevation, Lift > 1.5x)
101 pairs co-activate more than expected. Top 15:

rail_corridor + sanctions_pressure: lift 491598.77x (observed 0.01 vs expected 0), n=104
dam_risk + election_calendar: lift 327732.51x (observed 0.01 vs expected 0), n=104
iom_displacement + election_calendar: lift 196639.51x (observed 0.01 vs expected 0), n=104
water_stress + fao_food_import: lift 81933.13x (observed 0.077 vs expected 0), n=104
sovereign_cds + election_calendar: lift 77113.53x (observed 0.01 vs expected 0), n=102
dam_risk + iom_displacement: lift 65546.5x (observed 0.01 vs expected 0), n=104
pipeline_risk + rail_corridor: lift 54622.09x (observed 0.01 vs expected 0), n=104
pipeline_risk + election_calendar: lift 54622.09x (observed 0.01 vs expected 0), n=104
dam_risk + sovereign_cds: lift 51409.02x (observed 0.02 vs expected 0), n=102
night_lights + sovereign_cds: lift 39327.9x (observed 0.02 vs expected 0), n=100
sovereign_cds + sanctions_pressure: lift 38556.77x (observed 0.01 vs expected 0), n=102
chokepoint + iom_displacement: lift 35752.64x (observed 0.019 vs expected 0), n=104
dam_risk + corruption_risk: lift 33903.36x (observed 0.029 vs expected 0), n=104
rail_corridor + corruption_risk: lift 33903.36x (observed 0.01 vs expected 0), n=104
corruption_risk + election_calendar: lift 33903.36x (observed 0.01 vs expected 0), n=104

## J. RECOVERY CURVE ANALYSIS
Time for signal to return to baseline after peak:

economic_stress: avg recovery 1.9yr (155 events), avg collapse 7yr, asymmetry ratio 0.27
governance: avg recovery 4.6yr (22 events), avg collapse 7.9yr, asymmetry ratio 0.59
trade_collapse: avg recovery 1.3yr (49 events), avg collapse 5.4yr, asymmetry ratio 0.24
capital_flows: avg recovery 9.3yr (10 events), avg collapse 13yr, asymmetry ratio 0.72
power_grid: avg recovery 5.3yr (20 events), avg collapse 6yr, asymmetry ratio 0.88
vdem_governance: avg recovery 8.2yr (19 events), avg collapse 40.6yr, asymmetry ratio 0.2

## K. FIRST-MOVER DETECTION (Score Crossing Events)
Total score crossings analyzed: 376
No detectable first-mover: 278 (73.9% — these are the true unknown unknowns)

economic_stress: first-mover in 45 crossings (12%)
vdem_governance: first-mover in 14 crossings (3.7%)
governance: first-mover in 12 crossings (3.2%)
trade_collapse: first-mover in 9 crossings (2.4%)
seismic_risk: first-mover in 7 crossings (1.9%)
capital_flows: first-mover in 5 crossings (1.3%)
power_grid: first-mover in 4 crossings (1.1%)
fire_hotspot: first-mover in 2 crossings (0.5%)

## L. REGIONAL DIVERGENCE (Top 20 Signal-Region Deviations from Global Mean)
[MENA] fire_hotspot: above_global by +971.014 (regional=1122.387, global=151.373, n=109)
[East Asia & Pacific] fire_hotspot: below_global by -151.442 (regional=-0.069, global=151.373, n=28)
[South & Southeast Asia] fire_hotspot: below_global by -151.378 (regional=-0.005, global=151.373, n=104)
[Europe & FSU] fire_hotspot: below_global by -151.352 (regional=0.021, global=151.373, n=81)
[Latin America] fire_hotspot: below_global by -151.345 (regional=0.029, global=151.373, n=184)
[Sub-Saharan Africa] fire_hotspot: below_global by -119.946 (regional=31.427, global=151.373, n=346)
[Sub-Saharan Africa] sovereign_cds: above_global by +1.969 (regional=1.054, global=-0.915, n=16)
[Europe & FSU] seismic_risk: below_global by -1.911 (regional=-1.886, global=0.025, n=14)
[Sub-Saharan Africa] night_lights: above_global by +1.888 (regional=-0.158, global=-2.047, n=16)
[Europe & FSU] capital_flows: above_global by +1.611 (regional=2.062, global=0.451, n=66)
[Europe & FSU] night_lights: below_global by -1.286 (regional=-3.333, global=-2.047, n=14)
[Sub-Saharan Africa] usda_food_supply: above_global by +1.284 (regional=-0.788, global=-2.072, n=16)
[Europe & FSU] pipeline_risk: above_global by +1.177 (regional=-0.762, global=-1.939, n=14)
[South & Southeast Asia] night_lights: below_global by -1.16 (regional=-3.207, global=-2.047, n=10)
[Europe & FSU] rail_corridor: above_global by +1.113 (regional=-1.457, global=-2.57, n=14)
[South & Southeast Asia] iom_displacement: above_global by +1.098 (regional=-1.66, global=-2.758, n=10)
[Sub-Saharan Africa] corruption_risk: above_global by +1.019 (regional=1.183, global=0.164, n=16)
[South & Southeast Asia] dam_risk: above_global by +0.908 (regional=-1.633, global=-2.541, n=10)
[South & Southeast Asia] rail_corridor: above_global by +0.883 (regional=-1.686, global=-2.57, n=10)
[Europe & FSU] corruption_risk: above_global by +0.879 (regional=1.043, global=0.164, n=14)

## M. COMPOUND AMPLIFICATION — N SIGNALS ELEVATED SIMULTANEOUSLY
0 signals elevated: avg score 49.7, median 50, p90 56.2 (n=8954)
1 signals elevated: avg score 65.4, median 60.1, p90 99 (n=985)
2 signals elevated: avg score 66.2, median 64.5, p90 98.3 (n=142)
3 signals elevated: avg score 37.3, median 29, p90 72.6 (n=15)
4 signals elevated: avg score 30.3, median 30, p90 34.2 (n=9)

## N. RISK BAND TRANSITION MATRIX (Year-over-Year)
MODERATE (n=1670): →STABLE:42.2% →MINIMAL:7.1% →MODERATE:45.9% →ELEVATED:2.8% →CRITICAL:0.6% →HIGH:1.4%
STABLE (n=6623): →MODERATE:10.4% →STABLE:79.7% →MINIMAL:8.5% →ELEVATED:1% →CRITICAL:0.2% →HIGH:0.2%
MINIMAL (n=1205): →MINIMAL:46.4% →MODERATE:8% →STABLE:44.2% →ELEVATED:0.9% →CRITICAL:0.3% →HIGH:0.2%
ELEVATED (n=175): →STABLE:31.4% →MINIMAL:15.4% →ELEVATED:14.9% →MODERATE:29.1% →HIGH:6.3% →CRITICAL:2.9%
CRITICAL (n=194): →CRITICAL:76.8% →STABLE:8.8% →HIGH:3.6% →ELEVATED:3.1% →MINIMAL:4.6% →MODERATE:3.1%
HIGH (n=70): →ELEVATED:18.6% →MINIMAL:17.1% →HIGH:20% →MODERATE:28.6% →STABLE:11.4% →CRITICAL:4.3%

## O. UNKNOWN UNKNOWNS — CROSS-DOMAIN CORRELATIONS (r >= 0.5)
Signal pairs from DIFFERENT domains with unexpected correlation:

[physical] power_grid ↔ [economic] sovereign_cds: r=0.916, n=88
[physical] power_grid ↔ [governance] corruption_risk: r=0.877, n=88
[economic] capital_flows ↔ [governance] corruption_risk: r=0.84, n=30
[economic] sovereign_cds ↔ [governance] corruption_risk: r=0.769, n=102
[economic] capital_flows ↔ [humanitarian] usda_food_supply: r=0.727, n=30
[physical] power_grid ↔ [behavioral] night_lights: r=0.718, n=86
[physical] power_grid ↔ [humanitarian] usda_food_supply: r=0.657, n=88
[governance] corruption_risk ↔ [humanitarian] usda_food_supply: r=0.629, n=104
[behavioral] night_lights ↔ [economic] sovereign_cds: r=0.627, n=100
[governance] vdem_governance ↔ [humanitarian] usda_food_supply: r=0.577, n=104
[economic] sovereign_cds ↔ [humanitarian] usda_food_supply: r=0.553, n=102
[economic] sovereign_cds ↔ [physical] maritime_trade: r=0.527, n=67
[physical] dam_risk ↔ [humanitarian] usda_food_supply: r=0.525, n=104
[governance] vdem_governance ↔ [economic] sanctions_pressure: r=0.516, n=104
[governance] election_calendar ↔ [economic] sanctions_pressure: r=0.507, n=104
[economic] capital_flows ↔ [physical] port_congestion: r=-0.501, n=30

## P. ASYMMETRY — COLLAPSE VS RECOVERY SPEED
power_grid: recovery 5.3yr, collapse 6yr, ratio=0.88 (COLLAPSE SLOWER)
capital_flows: recovery 9.3yr, collapse 13yr, ratio=0.72 (COLLAPSE SLOWER)
governance: recovery 4.6yr, collapse 7.9yr, ratio=0.59 (COLLAPSE SLOWER)
economic_stress: recovery 1.9yr, collapse 7yr, ratio=0.27 (COLLAPSE SLOWER)
trade_collapse: recovery 1.3yr, collapse 5.4yr, ratio=0.24 (COLLAPSE SLOWER)
vdem_governance: recovery 8.2yr, collapse 40.6yr, ratio=0.2 (COLLAPSE SLOWER)

## Q. SIGNAL ABSENCE AS DATA POINT
Signals where absence (going dark) correlates with score:

dam_risk absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
chokepoint absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
flood_risk absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
water_stress absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
health_crisis absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
pipeline_risk absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
rail_corridor absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
social_volume absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
unhcr_refugees absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
corruption_risk absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
fao_food_import absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
port_congestion absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
iom_displacement absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
usda_food_supply absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years
election_calendar absence: r=0.17 (absence correlates with higher score), dark in 10008/10112 country-years

## R. BOOTSTRAP CONFIDENCE INTERVALS (Top 50 Correlations, 300 iterations)
95% CI for top correlations:

power_grid ↔ sovereign_cds: r=0.916, 95%CI=[0.847, 0.954], n=88
power_grid ↔ corruption_risk: r=0.877, 95%CI=[0.776, 0.925], n=88
capital_flows ↔ sovereign_cds: r=0.847, 95%CI=[0.645, 0.939], n=30
capital_flows ↔ corruption_risk: r=0.84, 95%CI=[0.629, 0.937], n=30
night_lights ↔ capital_flows: r=0.832, 95%CI=[0.722, 0.896], n=29
fire_hotspot ↔ election_calendar: r=0.779, 95%CI=[0.459, 0.911], n=13
sovereign_cds ↔ corruption_risk: r=0.769, 95%CI=[0.654, 0.845], n=102
capital_flows ↔ fao_food_import: r=0.746, 95%CI=[0.559, 0.847], n=30
capital_flows ↔ usda_food_supply: r=0.727, 95%CI=[0.469, 0.913], n=30
power_grid ↔ night_lights: r=0.718, 95%CI=[0.589, 0.801], n=86
capital_flows ↔ maritime_trade: r=0.704, 95%CI=[0.411, 0.892], n=19
fire_hotspot ↔ corruption_risk: r=0.695, 95%CI=[0.168, 0.858], n=13
fire_hotspot ↔ usda_food_supply: r=0.679, 95%CI=[0.242, 0.877], n=13
power_grid ↔ usda_food_supply: r=0.657, 95%CI=[0.493, 0.757], n=88
vdem_governance ↔ currency_collapse: r=-0.635, 95%CI=[-0.927, -0.058], n=10

---
## SUMMARY STATISTICS
Total tests executed: 45,381
Total convergence rows: 1
Going-dark events: 189
Cross-domain unknown unknowns: 16
Signal pairs with r >= 0.7: 12
Signal pairs with r >= 0.9: 1
Score crossings analyzed: 376
Unexplained crossings (no first-mover): 278

Generated: 2026-05-26T22:43:58.884Z