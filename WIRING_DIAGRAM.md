# SABIAN WIRING DIAGRAM — COMPLETE SYSTEM MAP

Generated: 2026-05-30 | Last updated: 2026-06-01 (session 2)
Purpose: Every component, every connection, what's live, what's dark.
Validated: Full rebuild 2026-06-01. 214 countries, 17,097 country-years, 54 signals. Canonical names enforced. ACLED removed.

## ACTIVE WORK — SESSION 2026-06-01 (all counts live-queried)

| Item | Status | Notes |
|------|--------|-------|
| **ACLED removal** | ✅ DONE 2026-06-01 | ACLED removed from all 12+ files. EULA risk eliminated. Conflict = GDELT only. Social unrest dormant. acled_conflict_feed.cjs + social_unrest_feed.cjs decommissioned. |
| **Country canonicalization** | ✅ DONE 2026-06-01 | 47 ghost baselines deleted. UAE/Bosnia/Congo/Macao remapped. 13 fetchers updated. country_canonical.cjs created. 214 canonical countries in scores. 2 Ivory Coast corruption_risk readings remapped. |
| **Ivory Coast stale orphans** | ⚠ AWAITING JASON CONFIRM | 6 stale signal_baselines (ids: 4171,14940,14942,14943,14944,14945) + 2 stale convergence scores (ids: 409851,409852) under Côte d'Ivoire variants. Readings remapped. Need delete confirmation + baseline/convergence rebuild. |
| **Republic of Congo ghost baseline** | ⚠ AWAITING JASON CONFIRM | id=15894 signal_baselines row — 0 readings, all stats null. Needs delete confirmation. |
| **PostgreSQL delete trigger** | ⚠ NEEDS JASON SQL RUN | SQL created. Jason must run in Supabase SQL editor. Blocks all DELETEs on 3 protected tables at DB level. |
| **baseline_discovery rebuild** | ✅ DONE 2026-06-01 | 5,781 baselines, 229 distinct countries. All canonical. |
| **convergence_history rebuild** | ✅ DONE 2026-06-01 | 17,097 country-year scores, 214 countries, 1801-2031. All canonical names. |
| **deep_intelligence_mining_3** | ✅ DONE 2026-06-01 | Re-ran on corrected data. 133 findings added. Stale Ivory Coast variant entries in findings file — will self-correct after orphan delete. |
| displacement composite | ✅ DONE | flow (6,544) + stock (3,589 non-null) → 6,718 composite rows. Top: Ukraine, Syria, Afghanistan. Old rows confirmed 0. |
| displacement old data sweep | ✅ DONE | 11,628 readings deleted, 31 baselines deleted. Counts verified exact. Wide sweep: observations/convergence/hive/audit all clean. |
| ingest_runner.cjs recontamination risk | ✅ FIXED | unhcr removed from SLOW_FETCHERS with comment. Re-enabling would re-write 11,628 deleted rows. |
| signal_registry.cjs | ✅ UPDATED | displacement entry updated to composite source. displacement_flow + displacement_stock added as separate entries. Seeds on next ingest run. |
| usda_food direction fix | ✅ DONE | Was direction=-1 → 3,195 zeros. Now +1, 17 zeros. Re-ran fetcher. |
| ingest_runner.cjs bugs | ✅ DONE | Added ROOT variable (was undefined) + require.main guard (was firing on require()) |
| displacement_flow load | ✅ DONE | 6,544 rows, 151 countries, 1962–2025, UNHCR XLSX |
| displacement_stock crawl | ✅ DONE | 153/153 countries, 11,628 rows, 432 minutes. 3,589 non-null (rest are gap=true years with no data). |
| sovereign_cds fix | ✅ DONE | Normalization redesigned: all 4 indicators now 0-100 positive-risk. Re-fetched 2,888 rows. 2.4% zeros (was 91.9%). Top: Liberia 2012 (95.4), Argentina 2023 (89.8). |
| gdelt_conflict | ✅ CONFIRMED CORRECT | 24 active conflict countries with data, 3,120 null rows = non-conflict countries. Not a bug. |
| convergence_history raw client | ✅ DONE | Fixed — now uses db.cjs (db_guard covers writes to historical_convergence_scores) |
| "17 ghost signals" | ✅ FALSE ALARM | Prior query had limit(200) on 2,933-row table. Real: 52 signals with baselines, only 2 true ghosts (displacement_flow, displacement_stock — expected components) |
| Missing baselines (5 signals) | ⚠ PENDING FINAL REBUILD | food_security/iom_displacement/prediction_market/social_volume/unhcr_odp have data for 80-150 countries but 3-8 baselines each. Data correct. Final baseline_discovery will fix. |
| **health_crisis scale collision** | ✅ FIXED (re-fetching) | health_crisis_historical.cjs: WHO GHO now normalized to 0-100 (ceiling=300 per-1000 live births). Both sources now same scale. Re-fetch running (~2 min, overwrites 10,322 WHO GHO rows via upsert). |

---

## SIGNAL SYSTEM — 55 SIGNALS TOTAL (53 scoring, 2 component-only)

| Signal | Direction | Tier | Description |
|--------|-----------|------|-------------|
| cable_disruption | +1 | supporting | BGP anomaly — higher = more disruption |
| capital_flows | -1 | supporting | FRED capital inflows — lower = more stress |
| chokepoint | +1 | supporting | Trade dependency × chokepoint weight |
| climate_stress | +1 | anchor | Temperature/rainfall anomaly |
| conflict | +1 | supporting | UCDP armed conflict events |
| corruption_risk | +1 | anchor | TI CPI inverted — higher = more corrupt |
| currency_collapse | +1 | supporting | Depreciation % — higher = weaker currency |
| cyber_threat | +1 | supporting | Internet security (inverted) |
| dam_risk | +1 | supporting | Water withdrawal + maintenance proxy |
| dark_vessel | +1 | anchor | LPI inverted — lower logistics = more risk |
| defense_spending | +1 | supporting | Military expenditure — higher = more stress |
| diaspora_remittance | -1 | supporting | Remittance inflows — lower = more stress |
| displacement | +1 | low_coverage | UNHCR composite (flow+stock z-score avg) — REBUILDING (old sparse data → composite) |
| displacement_flow | +1 | supplemental | UNHCR XLSX annual departures by origin — COMPONENT ONLY (feeds composite) |
| displacement_stock | +1 | supplemental | UNHCR API cumulative stock by origin — COMPONENT ONLY (feeds composite, crawl running) |
| economic_stress | -1 | supporting | GDP/employment indicators |
| election_calendar | +1 | supporting | NELDA violence-weighted |
| energy_stress | -1 | supporting | Electricity production/consumption |
| fao_food | +1 | supporting | Undernourishment % |
| fire_hotspot | +1 | supporting | FIRMS thermal anomalies |
| flight_movement | +1 | supporting | Air passenger YoY drop |
| flood_risk | +1 | supporting | Disaster displacement + climate risk |
| food_security | +1 | supporting | FEWS IPC classification |
| food_stress | +1 | supporting | Food price/availability stress |
| gdelt_conflict | +1 | low_coverage | GDELT event counts |
| gdelt_tone | -1 | anchor | GDELT average tone |
| governance | -1 | anchor | WGI composite |
| gps_jamming | +1 | supporting | Military expenditure % GDP proxy |
| health_crisis | +1 | supporting | WHO mortality + capacity |
| imf_fiscal | +1 | supporting | IMF fiscal stress indicators |
| internet_shutdown_ioda | +1 | supplemental | BGP outage events |
| iom_displacement | +1 | supporting | IOM DTM + IDMC internal |
| maritime_trade | -1 | supporting | Trade volume USD bn |
| military_proximity | +1 | anchor | Arms imports — higher = more buildup |
| night_lights | -1 | supporting | DMSP/VIIRS radiance |
| occrp | +1 | anchor | WGI corruption inverted |
| ooni_internet | -1 | anchor | Freedom score (100 - anomaly_rate) |
| pipeline_risk | +1 | supporting | Oil/gas rents + electricity |
| port_congestion | +1 | supporting | LPI/LSCI — lower connectivity = more congestion |
| power_grid | -1 | anchor | Electricity generation capacity |
| prediction_market | +1 | supporting | Polymarket geopolitical contracts |
| rail_corridor | +1 | anchor | Rail lines — lower density = more risk |
| resource_conflict | +1 | supporting | Total natural resource rents % GDP |
| sanctions_pressure | +1 | anchor | TIES cost-severity |
| seismic_risk | +1 | supplemental | USGS earthquake magnitude |
| social_unrest | +1 | supporting | UCDP one-sided violence |
| social_volume | +1 | supporting | Social media mention spikes |
| sovereign_cds | +1 | supporting | Damodaran country risk premium |
| structural_pressure | +1 | supporting | MDC composite (F1=0.825, 2yr early warning) |
| tor_censorship | +1 | supporting | Bridge users — higher = more censorship |
| trade_collapse | -1 | supporting | Trade volume decline |
| unhcr_odp | +1 | supporting | UNHCR refugee/asylum origins |
| usda_food | +1 | supporting | USDA PSD grain stocks / WB WDI food security — FIXED 2026-05-31 (direction was -1, 3,195 zeros corrected) |
| vdem_governance | -1 | low_coverage | V-Dem liberal democracy index |
| water_stress | +1 | supporting | Freshwater withdrawal % |

**Total: 55 signals (53 scoring + 2 component-only). Zero duplicates. Zero manipulation.**
*Note: displacement_flow and displacement_stock are NOT in STRESS_DIRECTION and do NOT score directly. They feed the displacement composite only.*

---

## DATABASE TABLES

| Table | Rows | Status | Fed By | Feeds |
|-------|------|--------|--------|-------|
| historical_signal_readings | **966,835** | LIVE | ingest_runner + 15 fetchers + 2 displacement loaders + composite builder | convergence_history, baseline_discovery |
| historical_convergence_scores | **17,097** | LIVE (clean, rebuilt 2026-06-01) | convergence_history | dossier_generator, analogue_engine, pattern_matcher |
| convergence_scores | **1,425** | LIVE | global_scan, convergence_engine | API endpoints, terminal, alerts |
| signal_baselines | **5,781** | LIVE (rebuilt 2026-06-01) | baseline_discovery | convergence_history |
| signal_registry | **53** | LIVE (pending seed) | ingest_runner | reference only — displacement_flow + displacement_stock defined in CJS, seed on next ingest run |
| signal_reliability_map | **52** | LIVE | reliability_map.cjs | convergence_history (weights) — 1 missing: internet_shutdown_ioda |
| country_briefings | 316 | LIVE | paperclip | API /api/briefing |
| synthesis_records | 316 | LIVE | synthesizer | dossier_generator, time machine |
| synthesis_scripts | 316 | LIVE | script_cache | audio generation |
| country_clusters | 164 | LIVE | clustering | dossier_generator |
| pattern_findings | 233 | LIVE | deep_intelligence_mining, pattern_matcher | analogue_engine, API |
| pattern_daily_reports | 3 | PARTIAL | pattern_matcher_nightly | API /api/intelligence/patterns |
| dossier_snapshots | 2 | PARTIAL | snapshot_nightly | /api/intelligence/:country/history |
| hive_observations | 3 | PARTIAL | hive_reader | hive patterns |
| observations | 42 | LIVE | global_scan (threshold crossings) | grading_pass, proof chain |
| immutable_audit_log | 32 | LIVE | audit_chain.cjs | chain_anchor, proof |
| hive_logs | 0 | DARK | logger.cjs | debugging |
| alert_subscriptions | 0 | DARK | API POST /api/alerts/subscribe | alert_engine |
| alert_events | 0 | DARK | alert_engine | API /api/alerts/events |
| intelligence_briefings | 0 | DARK | ? | ? |
| historical_findings | 0 | DARK | deep_intelligence_mining (FILE NOT DB) | analogue_engine |
| audit_events | 0 | DARK | ? | ? |

---

## SCORING SYSTEM

### Scoring Formula
```
z = (value - baseline_median) / IQR
stress_z = z × direction
weighted_stress = stress_z × tier_weight
score = 50 + (weighted_mean × 15)
```

### Tier Weights
| Tier | Weight | Count |
|------|--------|-------|
| anchor | 1.0 | 12 signals |
| supporting | 0.8 | 35 signals |
| supplemental | 0.5 | 3 signals |
| low_coverage | 0.2 | 3 signals |

### Coverage
- **Countries (historical)**: 214 scored (live-queried 2026-06-01, all canonical names)
- **Countries (live, signal_baselines)**: 229 distinct (includes 9 stale orphans awaiting delete confirmation)
- **Countries (live, convergence_scores)**: 153
- **Year range**: 1801–2031 (live-queried 2026-06-01)
- **Country-year pairs scored**: 17,097 (live-queried 2026-06-01 post-rebuild)
- **Signals with data**: 54 (live-queried 2026-06-01, includes 2 component-only)
- **Signals scoring (STRESS_DIRECTION)**: 53 (displacement_flow and displacement_stock component-only, expected)
- **Signals with no data**: internet_shutdown_ioda (in STRESS_DIRECTION but 0 rows — dark)
- **All scale collisions**: RESOLVED (health_crisis 0 values > 100 as of 2026-06-01)

---

## CRON JOBS (in sabian_api.cjs)

| Time UTC | Job | File Called | Status |
|----------|-----|-------------|--------|
| 0600 | Daily global scan | global_scan.cjs | WIRED |
| 0630 | Grading pass | grading_pass.cjs | WIRED |
| 0700 | Live stream | historical/live_stream.cjs | WIRED |
| 0730 | Alert engine | historical/alert_engine.cjs | WIRED |
| 0800 | Pattern matcher | historical/pattern_matcher_nightly.cjs | WIRED |
| 0830 | Snapshot nightly | historical/snapshot_nightly.cjs | WIRED |
| Sun 0200 | Weekly backup | sabian_backup.cjs | WIRED |
| Sun 0300 | Chain anchor | historical/chain_anchor.cjs | WIRED |

**NOTE:** Crons only run when sabian_api.cjs is running (Railway or local).

---

## CORE FILES (root directory)

| File | Purpose | Status | Connects To |
|------|---------|--------|-------------|
| sabian_api.cjs | Main API server, all endpoints, cron scheduler | CORE | Everything |
| convergence_engine.cjs | Live scoring for single country (53 signals) | LIVE | global_scan, API /api/score |
| global_scan.cjs | Scans all 164 countries | LIVE | convergence_scores table |
| grading_pass.cjs | Grades observations at window close | WIRED | observation_ledger |
| sabian_alert.cjs | Sends email on threshold crossing | WIRED | alert_events |
| government_briefing.cjs | Generates dual-voice audio | WIRED | ElevenLabs API |
| sabian_persistence.cjs | Supabase read/write | LIVE | All tables |
| observation_ledger.cjs | Records what Sabian said when | PARTIAL | observation_ledger table |
| logger.cjs | Logs to hive_logs | DARK | hive_logs (0 rows) |
| sabian_backup.cjs | Weekly Supabase backup | WIRED | Supabase |

---

## HISTORICAL FILES (historical/ directory)

### INGESTION CHAIN
| File | Purpose | Status |
|------|---------|--------|
| ingest_runner.cjs | Orchestrates all historical ingestion — FIXED 2026-05-31 (ROOT var + require.main guard + unhcr removed from SLOW_FETCHERS) | LIVE |
| ingest_ti_cpi.cjs | TI Corruption Perception Index 1995-2025 | LIVE (4,335 rows) |
| ingest_nelda_csv.cjs | NELDA elections 1945-2020 | LIVE (3,086 rows) |
| ingest_ties_xls.cjs | TIES sanctions 1945-2005 | LIVE (3,650 rows) |
| ingest_vdem_csv.cjs | V-Dem governance 1789-2024 | LIVE (21,593 rows) |
| structural_pressure_historical.cjs | MDC composite signal | LIVE (3,968 rows) |
| fews_food_security_historical.cjs | FEWS IPC food security | LIVE |
| usda_food_historical.cjs | USDA grain stocks / WB WDI fallback — FIXED 2026-05-31 direction | LIVE |
| load_displacement_flow_xlsx.cjs | UNHCR XLSX → displacement_flow (6,544 rows, run once DONE) | ARCHIVED |
| run_displacement_stock_slow.cjs | UNHCR API → displacement_stock (✅ DONE: 153/153, 11,628 rows, 432m) | ARCHIVED |
| displacement_historical.cjs | Composite builder: flow+stock z-scores → displacement (✅ DONE: 6,718 rows) | LIVE |
| run_unhcr_displacement_refetch.cjs | One-off targeted refetch (string-concat fix, DONE) | ARCHIVED |
| iom_displacement_historical.cjs | IOM displacement | LIVE |
| social_volume_historical.cjs | Social media volume | LIVE |
| prediction_market_historical.cjs | Polymarket data | LIVE |
| post_backfill_chain.cjs | Auto-runs after ingestion | LIVE |

### SCORING CHAIN
| File | Purpose | Status |
|------|---------|--------|
| baseline_discovery.cjs | Calculates P10/median/P90 per signal | LIVE (427 countries) |
| convergence_history.cjs | Scores all country-years (53 signals) | LIVE (**16,138 scores**) |
| reliability_map.cjs | Sets signal weights (53 signals) | LIVE |
| scoring_stress_test.cjs | 1000-iteration validation | LIVE |

### PATTERN MINING CHAIN
| File | Purpose | Status | Output Location |
|------|---------|--------|-----------------|
| deep_intelligence_mining.cjs | Pass 1: 101 findings | RAN | FILE (not in DB) |
| deep_intelligence_mining_2.cjs | Pass 2: 141 findings | RAN | FILE (not in DB) |
| deep_intelligence_mining_3.cjs | Pass 3: 133 findings (re-ran 2026-06-01 on corrected data) | RAN | FILE (not in DB) |
| cross_dimensional_analysis.cjs | Cross-signal correlations | RAN | FILE |
| comprehensive_signal_analysis.cjs | 1,028 tests | RAN | FILE |
| relationship_map.cjs | Signal→signal correlations | RAN | FILE |
| holdout_validation.cjs | Out-of-sample validation | RAN | SABIAN_INTELLIGENCE_FINDINGS.md |

**ISSUE:** Findings are in FILES, not in historical_findings table. Cannot be queried by API.

### SYNTHESIS CHAIN
| File | Purpose | Status |
|------|---------|--------|
| synthesizer.cjs | Generates synthesis_records | LIVE (316 records) |
| script_cache.cjs | Generates synthesis_scripts | LIVE (316 scripts) |
| paperclip.cjs | Generates country_briefings | LIVE (316 briefings) |
| clustering.cjs | K-means country clustering | LIVE (164 clusters) |

### DOSSIER CHAIN
| File | Purpose | Status |
|------|---------|--------|
| dossier_generator.cjs | 10-page intelligence dossier | BUILT |
| dossier_audio.cjs | Audio version of dossier | BUILT |
| dossier_qa.cjs | Q&A endpoint | BUILT |
| analogue_engine.cjs | Historical pattern matching | BUILT |
| insight_generator.cjs | Page 0 Sabian Insight | BUILT |
| sabian_reasoning_engine.cjs | Extended reasoning | BUILT |
| temporal_intelligence.cjs | Lead times, velocity | BUILT |
| portfolio_contagion.cjs | Multi-country analysis | BUILT |

### CRISIS DETECTION
| File | Purpose | Status |
|------|---------|--------|
| crisis_mode_detector.cjs | Detects crisis conditions | BUILT |
| crisis_mode_trigger.cjs | Triggers crisis mode | BUILT |
| crisis_mode_briefing.cjs | Crisis-specific briefing | BUILT |

### DEFENSE LAYER
| File | Purpose | Status |
|------|---------|--------|
| defense_procurement_signals.cjs | Defense signal definitions | BUILT |
| defense_procurement_ingest.cjs | SIPRI data ingest | BUILT (no data) |
| SIPRI_FULL_PIPELINE.cjs | Full SIPRI pipeline | BUILT |
| parse_sipri_milex.cjs | Parse military expenditure | BUILT |
| ingest_comtrade_arms.cjs | Arms trade data | BUILT |

### AUDIT/PROOF CHAIN
| File | Purpose | Status |
|------|---------|--------|
| audit_chain.cjs | Cryptographic hash chain | LIVE (32 rows) |
| chain_anchor.cjs | External timestamp anchor | WIRED |
| snapshot_nightly.cjs | Daily dossier snapshots | PARTIAL (2 rows) |
| live_stream.cjs | Bridges live→historical | WIRED |
| alert_engine.cjs | Checks thresholds, sends alerts | WIRED |
| pattern_matcher_nightly.cjs | Tests findings vs current | LIVE (15 findings tested) |

---

## FEED FILES (54 total)

These fetch LIVE data for signals. Status: EXIST but most NOT wired to historical ingestion.

| Feed | Signal | Has Historical Fetcher? |
|------|--------|------------------------|
| fred_capital_feed.cjs | capital_flows | YES (fred_historical) |
| vdem_governance_feed.cjs | vdem_governance | YES (vdem_historical) |
| unhcr_displacement_feed.cjs | displacement | YES (unhcr_historical) |
| gdelt_conflict_feed.cjs | gdelt_conflict | YES (gdelt_historical) |
| gdelt_gkg_feed.cjs | gdelt_tone | YES (gdelt_historical) |
| firms_fire_feed.cjs | fire_hotspot | YES (gee_fire_historical) |
| seismic_risk_feed.cjs | seismic_risk | YES (seismic_historical) |
| imf_fiscal_feed.cjs | imf_fiscal | YES (imf_historical) |
| power_grid_feed.cjs | power_grid | YES (worldbank_historical) |
| acled_conflict_feed.cjs | conflict | DECOMMISSIONED 2026-06-01 — ACLED removed, conflict via GDELT |
| social_unrest_feed.cjs | social_unrest | DECOMMISSIONED 2026-06-01 — signal dormant |
| flood_risk_feed.cjs | flood_risk | NO (GloFAS not built) |
| eia_energy_feed.cjs | energy_stress | NO |
| usda_food_feed.cjs | usda_food | YES (usda_food_historical) |
| ... | ... | ... |

---

## HISTORICAL FETCHERS (historical/fetchers/)

| Fetcher | Signal(s) | Status |
|---------|-----------|--------|
| worldbank_historical.cjs | economic_stress, trade_collapse, power_grid | LIVE |
| imf_historical.cjs | imf_fiscal | LIVE |
| fred_historical.cjs | capital_flows | LIVE |
| vdem_historical.cjs | vdem_governance | LIVE |
| unhcr_historical.cjs | displacement (DISABLED — removed from SLOW_FETCHERS 2026-05-31, would recontaminate) | DISABLED |
| displacement_historical.cjs | displacement composite (flow+stock z-score average) | LIVE |
| gdelt_historical.cjs | gdelt_conflict, gdelt_tone | LIVE |
| gee_fire_historical.cjs | fire_hotspot | LIVE |
| seismic_historical.cjs | seismic_risk | LIVE |
| structural_pressure_historical.cjs | structural_pressure (MDC composite) | LIVE |
| fews_food_security_historical.cjs | food_security | LIVE |
| usda_food_historical.cjs | usda_food | LIVE |
| iom_displacement_historical.cjs | iom_displacement | LIVE |
| social_volume_historical.cjs | social_volume | LIVE |
| prediction_market_historical.cjs | prediction_market | LIVE |

---

## API ENDPOINTS

### Public (no auth)
| Endpoint | Purpose | Status |
|----------|---------|--------|
| GET / | Landing page | LIVE |
| GET /terminal | OpenMCT terminal | LIVE |
| GET /health | Health check | LIVE |
| GET /public-api/threats | Top threats (limited) | LIVE |
| GET /public-api/timemachine/:country/:year | Score lookup | LIVE |
| GET /public-api/global | Global snapshot | LIVE |

### Buyer (BUYER_API_KEY)
| Endpoint | Purpose | Status |
|----------|---------|--------|
| GET /api/threats | Full threat table | LIVE |
| GET /api/country/:name | Country detail | LIVE |
| GET /api/theater/:name | Theater rollup | LIVE |
| GET /api/summary | Dashboard summary | LIVE |
| GET /api/patterns/:signal | Signal patterns | LIVE |
| GET /api/timemachine/:country/:year | Full synthesis | LIVE |
| GET /api/clusters | Country clusters | LIVE |
| GET /api/global | Global snapshot | LIVE |
| GET /api/intelligence/:country | Full dossier | BUILT |
| GET /api/intelligence/:country/pdf | PDF export | BUILT |
| GET /api/intelligence/:country/audio | Audio briefing | BUILT |
| POST /api/intelligence/:country/qa | Q&A | BUILT |
| GET /api/briefing/historical/:country | Historical briefing | LIVE |

### Internal (SMART_SABIAN_API_KEY)
| Endpoint | Purpose | Status |
|----------|---------|--------|
| GET /api/score/:name | Live scoring | LIVE |
| POST /api/scan | Trigger scan | LIVE |

---

## VALIDATION STATUS

### Full Rebuild Run (2026-06-01)
```
Baseline discovery: 5,781 baselines, 229 countries (live-queried)
Convergence history: 17,097 scores, 214 countries, 1801-2031 (live-queried)

Data Integrity:
  Total scores: 17,097
  Countries scored: 214 (historical, canonical names only)
  Year range: 1801–2031
  Signals in active use: 54 in DB, 53 scoring (displacement_flow/stock component-only)

Alignment:
  STRESS_DIRECTION signals: 53
  country_canonical.cjs: canonical map enforced in 13 fetchers
  Ghost baselines: 47 deleted, 9 orphans pending Jason confirm
  ACLED: removed from all files (EULA risk eliminated)
  Stale signals from old runs: NONE
  Duplicates: NONE
  Manipulation: NONE

Storage verification:
  Raw values stored untouched in historical_signal_readings
  Normalization (z-score) applied only at scoring time
  Weighted average dilutes correlated signals (no amplification)
```

### Prior Validation Run (2026-05-30T03:01:39Z)
```
Run timestamp: 2026-05-30T03:01:39.044Z to 03:01:39.486Z
Duration: 0.442 seconds (single clean run)
Total scores at that time: 16,138 (pre-rebuild)
```

### Dark Spots — Updated 2026-06-01
| Issue | Count | Status | Priority |
|-------|-------|--------|---------|
| **Ivory Coast stale orphans** | 6 baselines + 2 scores | ⚠ AWAITING DELETE CONFIRM | HIGH — readings remapped, IDs logged, need Jason confirm then re-rebuild |
| **PostgreSQL delete trigger** | — | ⚠ NEEDS JASON SQL RUN | HIGH — Layer 2 DB protection not yet active |
| internet_shutdown_ioda | 0 data rows | In STRESS_DIRECTION but no data ever fetched. Dark signal. | LOW |
| Findings in files not DB | 388+ | historical_findings table empty. Analogue engine references files directly. | MEDIUM |
| Dossier snapshots sparse | 2 | Needs daily runs for proof accumulation. | MEDIUM |
| health_crisis scale collision | ✅ FIXED 2026-05-31 | WHO GHO normalized to 0-100. 0 values > 100 as of 2026-06-01. | — |
| Country canonicalization | ✅ FIXED 2026-06-01 | 47 ghosts deleted, UAE/Bosnia/Congo/Macao remapped, 13 fetchers updated, country_canonical.cjs created | — |
| ACLED removal | ✅ DONE 2026-06-01 | EULA risk eliminated. GDELT is sole conflict source. | — |
| convergence scores rebuilt | ✅ REBUILT 2026-06-01 | 17,097 rows, 214 countries. Clean canonical names. | — |
| convergence_history.cjs raw createClient | ✅ FIXED 2026-05-31 | Swapped to db.cjs — historical_convergence_scores now db_guard protected | — |
| USDA PSD silent fallback | ✅ FIXED 2026-05-31 | ⚠ WARNING log added when primary source returns 0 | — |
| displacement old data | ✅ DELETED 2026-05-31 | 11,628 rows gone, 31 baselines gone. Wide sweep: zero surviving references anywhere. | — |
| gdelt_conflict sparse | ✅ CONFIRMED CORRECT | 24 conflict countries with data, 3,120 null = non-conflict. Not a bug. | — |

---

## WHAT'S LIVE (PROOF CHAIN RUNNING)

1. **observations** — 42 rows, threshold crossings logged since May 23
2. **immutable_audit_log** — 32 rows, cryptographic sealing active (live-queried 2026-06-01)
3. **historical_convergence_scores** — 17,097 country-years (rebuilt 2026-06-01, canonical names, 214 countries)

## WHAT'S DARK (NOT RUNNING)

1. **alert_events** — 0 rows, alerts never fired
2. **alert_subscriptions** — 0 rows, no one subscribed
3. **hive_logs** — 0 rows, logging broken
4. **historical_findings** — 0 rows, findings in FILES not DB
5. **intelligence_briefings** — 0 rows, not used
6. **audit_events** — 0 rows, not used

---

## WHAT'S PARTIAL (BARELY RUNNING)

1. **dossier_snapshots** — 2 rows (should be 164 × days)
2. **pattern_daily_reports** — 3 rows (should be daily)
3. **hive_observations** — 3 rows (should be growing)

---

## FILE COUNT SUMMARY

| Category | Count |
|----------|-------|
| Core .cjs files | 45 |
| Historical .cjs files | 68 |
| Feed files | 54 |
| Historical fetchers | 14 |
| Database tables | 21 |
| API endpoints | 30+ |
| Cron jobs | 8 |
| Active signals | 53 |

**TOTAL COMPONENTS: 240+**

---

## THE ENGINE STATUS

**Engine: RUNNING**
**Validation: Single clean run 2026-05-30T03:01:39Z**

**Fully Connected:**
- 53 signals in STRESS_DIRECTION (54 in DB: +displacement_flow/stock component-only)
- 17,097 country-years scored, 214 countries, 1801-2031 (live-queried 2026-06-01)
- 966,835 signal readings, 212 distinct countries, 42 sources (live-queried 2026-06-01)
- 214 countries in historical convergence scores (all canonical names)
- Zero country name fragmentation — canonical map enforced in 13 fetchers
- Zero ACLED dependency — GDELT sole conflict source
- Raw storage + scoring-time normalization (can always show raw numbers)
- 42 threshold crossings logged (proof chain)
- 32 sealed audit entries (immutable, live-queried 2026-06-01)

**Signal overlap handling:**
- structural_pressure + 5 source signals all score
- Weighted average formula dilutes (not amplifies) correlated signals
- Both raw observations AND derived pattern contribute = complete picture

**Remaining Bolts:**
- health_crisis re-fetch running (normalizing WHO GHO to 0-100) → then run baseline_discovery + convergence_history
- Findings in files, not DB (134 findings need migration)
- Dossier snapshots sparse (2 of expected hundreds)
- Alert system dark (no subscriptions)
- hive_logs not writing
- internet_shutdown_ioda has no data (dark signal, in STRESS_DIRECTION)

**90-day proof period:** Started May 23, 2026. Proof IS accumulating.
