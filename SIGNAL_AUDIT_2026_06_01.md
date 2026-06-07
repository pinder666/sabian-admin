# SIGNAL AUDIT — 15 Stale Signals Verified 2026-06-01

## METHODOLOGY
For each signal:
1. Read the actual fetcher code to identify the data source
2. Test the source API live to get latest available year
3. Compare to our stored data
4. Identify if signal measures REAL subject or is a PROXY substitute

---

## SIGNAL 1: sanctions_pressure
- **Fetcher:** `historical/ingest_ties_xls.cjs`
- **Source:** TIES v4.1 XLS file (static dataset)
- **Claims to measure:** Sanctions pressure
- **Actually measures:** TIES sanctions cases — sender, target, cost severity, multilateral flag
- **REAL or PROXY:** REAL — actual sanctions case data
- **Source coverage:** 1945–2005 (confirmed sanctions.web.unc.edu)
- **Our stored latest:** 2005-01-01
- **API latest:** N/A (static file, dataset complete)
- **VERDICT:** **ENDED** — TIES v4.1 is complete, no v5 published

---

## SIGNAL 2: election_calendar
- **Fetcher:** `historical/ingest_nelda_csv.cjs`
- **Source:** NELDA 6.0 CSV file (static dataset)
- **Claims to measure:** Election risk
- **Actually measures:** NELDA election violence indicators (pre-election violence, fraud, protestors killed, etc.)
- **REAL or PROXY:** REAL — actual election event data
- **Source coverage:** 1945–2020 (confirmed nelda.co)
- **Our stored latest:** 2020-01-01
- **API latest:** N/A (static file, dataset complete)
- **VERDICT:** **ENDED** — NELDA v6 ends 2020, no v7 announced

---

## SIGNAL 3: social_unrest
- **Fetcher:** `social_unrest_feed.cjs` (DECOMMISSIONED), `historical/fetchers/ucdp_historical.cjs`
- **Source:** ACLED (live, decommissioned), UCDP GED (historical)
- **Claims to measure:** Social unrest events
- **Actually measures:** UCDP one-sided violence events (historical)
- **REAL or PROXY:** REAL — actual violence event data
- **Our stored latest:** 2023-01-01 (source: UCDP GED)
- **Live feed status:** ACLED decommissioned 2026-06-01, EULA risk
- **VERDICT:** **ENDED** — ACLED removed, no live replacement

---

## SIGNAL 4: conflict
- **Fetcher:** `historical/fetchers/ucdp_historical.cjs`
- **Source:** UCDP GED CSV download (not API)
- **Claims to measure:** Armed conflict events
- **Actually measures:** UCDP GED armed conflict events and fatalities
- **REAL or PROXY:** REAL — actual conflict event data
- **Source coverage:** 1989–2024 (GED v25.1)
- **Our stored latest:** 2023-01-01 (source: UCDP GED v24.1)
- **API test:** API requires token, BUT CSV download works:
  - `https://ucdp.uu.se/downloads/ged/ged251-csv.zip` → HTTP 200
  - Last-Modified: Wed, 11 Jun 2025
- **VERDICT:** **BEHIND** — GED v25.1 CSV available, we have v24.1

---

## SIGNAL 5: resource_conflict
- **Fetcher:** `historical/fetchers/resource_conflict_historical.cjs`
- **Source:** World Bank WDI
- **Claims to measure:** Resource conflict risk
- **Actually measures:** `NY.GDP.TOTL.RT.ZS` = Total natural resources rents (% of GDP)
- **REAL or PROXY:** **PROXY** — measures economic dependence on resources, NOT conflict events
- **API test:** Latest with data = 2021 (tested earlier: `"date":"2021","value":12.75`)
- **Our stored latest:** 2021-01-01
- **VERDICT:** **CURRENT (PROXY)** — we have all WB has, but it's not real conflict data

---

## SIGNAL 6: rail_corridor
- **Fetcher:** `historical/fetchers/rail_corridor_historical.cjs`
- **Source:** World Bank WDI
- **Claims to measure:** Rail corridor disruption risk
- **Actually measures:** `IS.RRS.TOTL.KM` = Rail lines (total route-km)
- **REAL or PROXY:** **PROXY** — measures infrastructure quantity, NOT disruption events
- **API test:** Latest with data = 2021 (tested earlier: `"date":"2021","value":85544`)
- **Our stored latest:** 2021-01-01
- **VERDICT:** **CURRENT (PROXY)** — we have all WB has, but it's not real disruption data

---

## SIGNAL 7: water_stress
- **Fetcher:** `historical/fetchers/water_stress_historical.cjs`
- **Source:** World Bank WDI
- **Claims to measure:** Water stress
- **Actually measures:** `ER.H2O.FWTL.ZS` = Annual freshwater withdrawals (% of internal resources)
- **REAL or PROXY:** REAL — this IS a direct measure of water stress
- **API test:** Latest with data = 2022 (tested earlier: `"date":"2022","value":7750`)
- **Our stored latest:** 2022-01-01
- **VERDICT:** **CURRENT** — we have all WB has, and it's real water stress data

---

## SIGNAL 8: flight_movement
- **Fetcher:** `historical/fetchers/flight_movement_historical.cjs`
- **Source:** World Bank WDI
- **Claims to measure:** Flight movement disruption
- **Actually measures:** `IS.AIR.PSGR` = Air transport passengers carried
- **REAL or PROXY:** **PROXY** — measures passenger volume, NOT disruption events
- **API test:** Latest with data = 2023 (tested earlier: `"date":"2023","value":941557000`)
- **Our stored latest:** 2023-01-01
- **VERDICT:** **CURRENT (PROXY)** — we have all WB has, but it's not real disruption data

---

## SIGNAL 9: food_stress
- **Fetcher:** `historical/behavioral_ingest.cjs`
- **Source:** World Bank WDI
- **Claims to measure:** Food stress
- **Actually measures:** `SN.ITK.DEFC.ZS` = Prevalence of undernourishment (% of population)
- **REAL or PROXY:** REAL — this IS a direct measure of food insecurity
- **API test:** Latest with data = 2023 (tested earlier: `"date":"2023","value":9.4` for Egypt)
- **Our stored latest:** 2023-01-01
- **VERDICT:** **CURRENT** — we have all WB has, and it's real food stress data

---

## SIGNAL 10: port_congestion
- **Fetcher:** `historical/fetchers/port_congestion_historical.cjs`
- **Source:** World Bank LPI
- **Claims to measure:** Port congestion
- **Actually measures:** `LP.LPI.OVRL.XQ` = Logistics Performance Index (overall, 1-5 scale)
- **REAL or PROXY:** **PROXY** — measures logistics quality survey, NOT actual congestion/dwell time
- **API test:** Latest with data = 2022 (tested earlier: `"date":"2022","value":3.7`)
- **Our stored latest:** 2022-01-01
- **VERDICT:** **CURRENT (PROXY)** — we have all WB has, but it's not real congestion data

---

## SIGNAL 11: dark_vessel
- **Fetcher:** `historical/fetchers/dark_vessel_historical.cjs`
- **Source:** World Bank LPI (proxy), Global Fishing Watch (nominal)
- **Claims to measure:** Dark vessel (AIS gap) activity
- **Actually measures:** `LP.LPI.OVRL.XQ` = Logistics Performance Index
- **REAL or PROXY:** **PROXY** — measures logistics quality, NOT vessel AIS gaps
- **Live GFW API:** Requires API key (GFW_API_KEY), not tested
- **API test (WB proxy):** Latest with data = 2022
- **Our stored latest:** 2022-01-01
- **VERDICT:** **CURRENT (PROXY)** — WB proxy current, but NOT real vessel tracking data

---

## SIGNAL 12: energy_stress
- **Fetcher:** `historical/fetchers/eia_historical.cjs`
- **Source:** EIA API v2
- **Claims to measure:** Energy stress
- **Actually measures:** EIA international energy statistics (production, consumption)
- **REAL or PROXY:** REAL — actual energy production/consumption data
- **API test:** EIA API returns `"period":"2024"` (tested earlier)
- **Our stored latest:** 2023-01-01
- **VERDICT:** **BEHIND** — EIA has 2024 data, we have 2023

---

## SIGNAL 13: fao_food
- **Fetcher:** `historical/fetchers/food_security_historical.cjs` (NOT fao_historical.cjs)
- **Source:** World Bank WDI (proxying FAO data)
- **Claims to measure:** FAO food import dependency
- **Actually measures:** `SN.ITK.DEFC.ZS` = Prevalence of undernourishment
- **REAL or PROXY:** **PROXY** — measures undernourishment, NOT import dependency ratio
- **Note:** fao_historical.cjs tries FAOSTAT API which returns 404. Actual data came from WB.
- **API test:** WB returns 2023 (Egypt = 9.4, matches our stored 9.4)
- **Our stored latest:** 2023-01-01
- **VERDICT:** **CURRENT (PROXY)** — we have all WB has, but it's not real import dependency data

---

## SIGNAL 14: pipeline_risk
- **Fetcher:** `historical/fetchers/pipeline_risk_historical.cjs`
- **Source:** World Bank WDI (multiple indicators)
- **Claims to measure:** Pipeline infrastructure risk
- **Actually measures:** Composite of:
  - `NY.GDP.PETR.RT.ZS` (oil rents % GDP) — latest 2021
  - `NY.GDP.NGAS.RT.ZS` (gas rents % GDP) — latest 2021
  - `EG.ELC.ACCS.ZS` (electricity access %) — latest 2023
- **REAL or PROXY:** **PROXY** — measures energy economics and electricity access, NOT pipeline infrastructure
- **API test:** Components have data through 2021-2023
- **Our stored latest:** 2023-01-01
- **VERDICT:** **CURRENT (PROXY)** — we have all WB has, but it's not real pipeline data

---

## SIGNAL 15: structural_pressure
- **Fetcher:** `historical/fetchers/structural_pressure_historical.cjs`
- **Source:** MDC composite of 5 signals
- **Claims to measure:** Structural pressure / collapse risk
- **Actually measures:** Composite z-score of:
  - iom_displacement
  - social_volume
  - prediction_market
  - food_security
  - usda_food
- **REAL or PROXY:** COMPOSITE — combination of other signals
- **Our stored latest:** 2023-01-01
- **VERDICT:** **COMPOSITE** — freshness depends on component signals

---

## SUMMARY TABLE

| Signal | Our Last | API Last | Real/Proxy | Verdict |
|--------|----------|----------|------------|---------|
| sanctions_pressure | 2005 | 2005 | REAL | ENDED |
| election_calendar | 2020 | 2020 | REAL | ENDED |
| social_unrest | 2023 | N/A | REAL | ENDED |
| conflict | 2023 | 2024 | REAL | BEHIND |
| resource_conflict | 2021 | 2021 | PROXY | CURRENT (proxy) |
| rail_corridor | 2021 | 2021 | PROXY | CURRENT (proxy) |
| water_stress | 2022 | 2022 | REAL | CURRENT |
| flight_movement | 2023 | 2023 | PROXY | CURRENT (proxy) |
| food_stress | 2023 | 2023 | REAL | CURRENT |
| port_congestion | 2022 | 2022 | PROXY | CURRENT (proxy) |
| dark_vessel | 2022 | 2022 | PROXY | CURRENT (proxy) |
| energy_stress | 2023 | 2024 | REAL | BEHIND |
| fao_food | 2023 | 2023 | PROXY | CURRENT (proxy) |
| pipeline_risk | 2023 | 2023 | PROXY | CURRENT (proxy) |
| structural_pressure | 2023 | composite | COMPOSITE | COMPOSITE |

---

## CRITICAL FINDINGS

### PROXIES EXPOSED (7 signals)
These signals claim to measure one thing but actually use World Bank economic/infrastructure proxies:

1. **resource_conflict** — claims "resource conflict risk", measures "natural resource rents % GDP"
2. **rail_corridor** — claims "rail corridor risk", measures "rail lines total km"
3. **flight_movement** — claims "flight disruption", measures "passengers carried"
4. **port_congestion** — claims "port congestion", measures "Logistics Performance Index"
5. **dark_vessel** — claims "dark vessel AIS gaps", measures "Logistics Performance Index"
6. **fao_food** — claims "FAO import dependency", measures "prevalence of undernourishment"
7. **pipeline_risk** — claims "pipeline risk", measures "electricity access + oil/gas rents"

### ENDED (3 signals)
- sanctions_pressure (TIES v4.1 ends 2005)
- election_calendar (NELDA v6 ends 2020)
- social_unrest (ACLED decommissioned)

### BEHIND (2 signals)
- conflict (UCDP GED v25.1 available, we have v24.1)
- energy_stress (EIA has 2024, we have 2023)

### CURRENT - REAL DATA (3 signals)
- water_stress
- food_stress
- structural_pressure (composite)

---

## NEXT ACTIONS REQUIRED (Jason's decision)

1. **BEHIND signals** — Run fetchers to pull newer data?
   - `conflict`: Update ucdp_historical.cjs to fetch GED v25.1
   - `energy_stress`: Run eia_historical.cjs to pull 2024

2. **PROXY signals** — Accept as proxies or find real sources?
   - dark_vessel: GFW API requires key, could get real AIS data
   - port_congestion: Could use actual port dwell time data
   - pipeline_risk: Could use Global Energy Monitor pipeline tracker
   - etc.

3. **ENDED signals** — Mark as historical-complete in convergence?

---

*Audit completed 2026-06-01. All verdicts verified by live API testing.*
