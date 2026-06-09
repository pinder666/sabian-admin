# Sabian — Complete Intelligence Build Roadmap

Last updated: 2026-05-27. 90-day autonomous proof period: May 26 → Aug 24, 2026.
Sabian does NOT predict. It READS. Every step serves legibility, not forecasting.

---

## PHASE 1 — COMPLETE

**Step 1: Historical ingestion** — DONE
Fetched 12 signals (displacement, gdelt_conflict, gdelt_tone, seismic_risk, fire_hotspot,
governance, economic_stress, capital_flows, trade_collapse, power_grid, imf_fiscal, vdem_governance)
across 153 countries, 1960–2025. Written to `historical_signal_readings`.

**Step 2: Signal relationship map** — DONE
Spearman rank correlations across all signal pairs at lag 0–4 years. 54 correlations, 8 lead indicators,
15 going-dark patterns. Written to `signal_correlation_map`, `signal_lead_indicators`, `going_dark_patterns`.

**Step 3: Historical convergence scoring** — DONE
Z-score normalization against per-country baselines. Tier-weighted stress score (50=baseline, ±15/σ,
clamped 1–99). 8,506 country-year pairs scored. Written to `historical_convergence_scores`.

**Step 4: Baseline discovery** — DONE (completed during Step 1)
P10/median/P90 per country per signal. Written to `signal_baselines`.

---

## PHASE 2 — COMPLETE

**Step 5: Synthesizer** — DONE
Reads historical scores, lead indicators, dark patterns. Produces per-country synthesis: current score vs
baseline, trajectory (linear regression), active leads, dark signals, top 3 historical analogs.
152 countries. Written to `synthesis_records`.

**Step 6: Script cache** — DONE
Pre-generates structured narrative text from synthesis_records for each country. Human-readable
sentences describing score position, trajectory, active leads, dark signals, and top analog. Cached
in `synthesis_scripts`. Feeds Phase 3 Paperclip directly without re-computation at serve time.

---

## PHASE 3 — COMPLETE

**Step 7: Paperclip** — DONE
152 briefings in `country_briefings`. Defense/intel vertical. Served at `/api/briefing/historical/:country`.

**Step 8: Hive feedback loop** — DONE
3 patterns surfaced from 6,844 hive entries (Jun 2025 – May 2026): IMF dots feed 73% failure rate
(resolved — switched to WEO), GDELT 59% failure rate, coverage growth 128→181,388 rows.
ACLED excluded (removed 2026-06-01 — no key, EULA risk). Written to `hive_observations`. Served at `/api/hive/patterns`.

---

## PHASE 4 — COMPLETE

**Step 9a: Live signal streaming** — DONE
Bridge live engine scores into the historical record so the synthesizer reads current data alongside
historical context.

**Step 9b: Custom alert subscriptions** — DONE
5 alert types: score_above, score_below, trajectory_change, lead_signal_active, cluster_change.
Webhook delivery. Scoped per subscriber key. Cron 0730 UTC.
Tables: alert_subscriptions, alert_events.
API: POST /api/alerts/subscribe, GET /api/alerts, DELETE /api/alerts/:id, GET /api/alerts/events.

**Step 9c: Access tiers** — DONE
Tiered access control: public (scores + risk bands), buyer (full dossier, history, ledger, briefings),
internal (hive, admin, scan triggers).

**Step 9d: Time machine** — DONE
Query any country × year from 1960–present. Returns synthesis + script + briefing in one response.
API: GET /api/timemachine/:country/:year (buyer+), GET /public-api/timemachine/:country/:year.

**Step 9e: Country clustering and correlation** — DONE
k-means (k=8, 5 restarts, k-means++ init). 153 countries on 12-signal stress_z vectors. Inertia: 894.11.
Table: country_clusters. API: GET /api/clusters, GET /api/cluster/:country.

---

## PHASE 4.5 — COMPLETE (Pre-Phase 5 Intelligence Mining)

**Step 10-Pre-A: Holdout validation + Deep intelligence mining** — DONE
388 findings from 31 analysis modules across 8,610 country-years. Every combination tested: signal
pairs at all lags, cluster outcomes, regional contagion, decade evolution, recovery patterns,
going-dark sequences, country pairs, historical analogues, decoupling events.
Key findings:
- Armenia↔Israel r=1.0 (33 consecutive years — perfect correlation)
- Recovery takes 2× longer than collapse (83% of cases)
- Governance goes dark first (126 countries — the canary signal)
- Elevated band is not stable (zero countries held 75–85 for 10+ years)
- economic_stress appears in 38% of crises in the year before CRITICAL entry
All 388 findings in `SABIAN_INTELLIGENCE_FINDINGS.md`.

**Step 10-Pre-B: Historical Analogue Engine** — DONE
Pattern matching against 388 findings. Sabian Intelligence Dossier (12 pages + Insight):
executive summary, signal profile, analogues with outcomes, pattern matches, cluster context,
lead/going-dark status, temporal intelligence, tripwires, portfolio contagion, methodology.
PDF export. Audio generation. Queryable API.

**Step 10-Pre-C: Behavioral Signals** — DONE + VALIDATED
3 behavioral signals (night_lights, diaspora_remittance, food_stress) as raw triangulation layer.
NOT converged into stress score. Displayed separately in dossier Page 2.5.
6 validation tests: n=40, n=334, n=107 (real sample sizes only).
Key finding: Behavioral and institutional signals measure DIFFERENT dimensions.
Remittances can lead governance/power_grid/economic_stress by 1–3 years.

**Step 10-Pre-D: Temporal Intelligence Layer** — DONE
Answers "How much time does the buyer have to act?"
Lead time distributions, velocity classification, estimated timeline to crisis, decision triggers
with dates. Dossier Page 0.5. API: GET /api/intelligence/:country/temporal.

**Step 10-Pre-E: Portfolio Contagion** — DONE
Answers "If Country A falls, who follows? What's my total exposure?"
Pairwise correlations, contagion pathways with lag times, aggregate portfolio exposure.
23.6% of unexplained crossings preceded by neighbor crossing threshold.
API: GET /api/intelligence/contagion/:country, POST /api/intelligence/portfolio.

**Step 10-Pre-F: Defense Procurement Layer** — DONE (defense spending validated)
Defense spending validated against 134 historical cases: spending does NOT reliably predict score
movement. Government arms up independently of ground stress. Dossier Page 2.75.
Data: SIPRI Military Expenditure 1949–2025, 164 countries, 8,360 records.

**Step 10-Pre-G: Q&A Interaction Layer** — DONE (2026-05-27)
Three buyer interaction endpoints. Sabian reads the full dossier context and answers directly.
- POST /api/intelligence/:country/qa — typed question → Sabian answer
- POST /api/intelligence/:country/drill — drill into a named pattern
- POST /api/intelligence/:country/session — full Host A briefing session

**Step 10-Pre-H: Raw data + analysis layers** — DONE (2026-05-27)
- GET /api/data/:country/signals — Layer 1: raw signal readings from historical_signal_readings
- GET /api/analysis/:country — Layer 2: correlations, going-dark status, lead indicators, cluster

---

## PHASE 5 — COMPLETE

**Step 10a: Crisis mode trigger** — DONE (2026-05-27)
File: `historical/crisis_mode_trigger.cjs`
Trigger conditions (all three): score ≥ 75 AND trajectory RISING/SHARP_RISE AND 2+ active lead
signals (stress_z > 0.5 in signal_lead_indicators).
Trajectory stored in `convergence_scores` table on every daily scan.
API: GET /api/intelligence/crisis (buyer+) — all countries currently in crisis mode.
Migration: MIGRATION_TRAJECTORY.sql adds trajectory column to convergence_scores.

---

## PHASE 6 — COMPLETE

**Step 10c: Global aggregate view** — DONE (2026-05-27)
File: `historical/global_aggregate.cjs`
Two-layer data merge: historical_convergence_scores (validated baseline) + convergence_scores
(live daily scan) + observations (threshold crossings).
API:
- GET /public-api/global — top 10, band counts, crossings, theater rollup (no auth — feeds terminal)
- GET /api/global — full 153-country snapshot (buyer+)
- GET /api/regional/:region — single theater deep view (AFRICOM/CENTCOM/EUCOM/INDOPACOM/SOUTHCOM)
Terminal landing: full-screen overlay on first load. Click any country → selects + opens intel panel.
Theater rollup: average score, band counts, 7-day crossings per theater.

---

## COMPLETION ROADMAP — ALL STEPS DONE (2026-05-27)

**Step 1: Machine running** — DONE. Railway autonomous scan active from May 26, 2026.

**Step 2: Terminal overhaul** — DONE.
OpenMCT full-screen. 43 signals as sub-objects under each country.
Military-grade loading screen. Sabian brand overlay. INTEL slide-in panel.
All OpenMCT branding removed. Color palette: #060a14 / #00b8d4 / #ff3333 / #00e676.

**Step 3: Demo asset package** — DONE.
File: `historical/demo_package.cjs`
CLI: node historical/demo_package.cjs "Yemen"
Output: data/demo/{country}/ with dossier.pdf, audio/, package_manifest.json, delivery.html.
Delivery HTML: military-grade branded buyer delivery page with audio player, top signals, links.

**Step 4: Global aggregate** — DONE. See Phase 6 above.

**Step 5: Crisis mode trigger** — DONE. See Phase 5 above.

**Step 6: Snapshot / audit layer** — DONE (2026-05-27)
File: `historical/snapshot_nightly.cjs`
Table: dossier_snapshots (country, snapshot_date, score, band, trajectory, summary_text,
full_json, checksum, changed_from_prior).
Deduplication: SHA256 checksum — full JSON only written when dossier changes day-over-day.
Cron: 0830 UTC daily. CLI: node historical/snapshot_nightly.cjs --country Yemen
Migration: MIGRATION_SNAPSHOTS.sql (included in MIGRATION_ALL_PENDING.sql).
API:
- GET /api/intelligence/:country/history — up to 365 daily snapshots, newest first
- GET /api/intelligence/:country/snapshot/:date — specific date (YYYY-MM-DD)

**Step 7: Pattern tables SQL** — DONE (2026-05-27)
MIGRATION_ALL_PENDING.sql run in Supabase. Creates pattern_match_history + pattern_daily_reports.
Fixes: /api/intelligence/patterns/report (was returning 404).
Run once: node historical/pattern_matcher_nightly.cjs to write first record.

**Step 8: Roadmap + memory update** — DONE (2026-05-27). This file.

---

## TODAY — 2026-05-28 FIXES AND COMPLETIONS

**pattern_findings table — WIRED (was dead code)** — DONE (2026-05-28)
`FINDINGS_TABLE = 'pattern_findings'` constant existed since day one but was NEVER written to.
`findingSummary` was computed each run and discarded into JSONB blob inside pattern_match_history.
Fix: Added upsert to `pattern_findings` after each pattern run. MIGRATION_PATTERN_FINDINGS.sql created.
First write: 15 findings, 162 countries, 2026-05-28.
New API endpoints:
- GET /api/intelligence/findings — all 15 findings ranked by match count
- GET /api/intelligence/finding/:id/matches — countries currently matching a specific finding
- GET /api/intelligence/:country/findings — all findings active for a given country

**GEE Fire LSIB name fix** — DONE (2026-05-28)
Root cause: LSIB dataset uses non-obvious country names. EE null Feature objects are truthy in Python,
so `if geometry:` guard never fired. Fix: added complete LSIB name_map + `.size().getInfo()` count check.
10 errored countries re-run with fixed Python: CAR (6yr), DRC (2yr), Myanmar (2yr), Bosnia (19yr),
North Korea (4yr), North Macedonia (27yr), Palestine (27yr), Solomon Islands (3yr), South Korea (13yr).
Fiji: legitimately zero fire events (confirmed by GEE, not an error).

**Fire backfill — 43 missing countries** — IN PROGRESS (2026-05-28)
fire_backfill_targeted.cjs Phase 2 running. Countries include: Japan, Germany, UK, France, US, UAE,
South Africa, Chile, and 35 others. Auto-triggers post_backfill_chain on completion.

**Audit chain CLI await fix** — DONE (2026-05-28)
`logAuditEvent(...).catch(() => {})` without `await` in CLI scripts caused process exit before HTTP
completed. Fixed in pattern_matcher_nightly.cjs and convergence_history.cjs. Audit chain now writes
correctly (id=2 pattern_run event confirmed in DB).

---

## CRON CHAIN (Railway UTC)

| Time | Job | File |
|------|-----|------|
| 0600 | Global scan (153 countries) | global_scan.cjs |
| 0630 | Grade open observations | grading_pass.cjs |
| 0700 | Live stream synthesis | historical/live_stream.cjs |
| 0730 | Alert engine | historical/alert_engine.cjs |
| 0800 | Pattern matcher | historical/pattern_matcher_nightly.cjs |
| 0830 | Snapshot nightly (audit trail) | historical/snapshot_nightly.cjs |
| Sun 0200 | Backup | (weekly) |

---

## API SURFACE (complete)

### Public (no auth)
- GET /public-api/threats — all countries ranked
- GET /public-api/country/:name — country detail
- GET /public-api/summary — global threat summary
- GET /public-api/theater/:name — theater rollup
- GET /public-api/observations/:country — ledger
- GET /public-api/global — global landing: top 10, crossings, rollup
- GET /public-api/intelligence/:country — public dossier summary
- GET /public-api/signals/:country — all signal readings (terminal)
- GET /public-api/signal/:country/:signal — individual signal timeseries

### Buyer (Bearer BUYER_API_KEY)
- GET /api/threats — full country list
- GET /api/country/:name — country detail + 90-day history
- GET /api/theater/:name — theater breakdown
- GET /api/global — full 153-country snapshot
- GET /api/regional/:region — theater deep view
- GET /api/intelligence/:country — full 12-page dossier
- GET /api/intelligence/:country/pdf — PDF download
- GET /api/intelligence/:country/audio — audio generation
- GET /api/intelligence/:country/temporal — lead times + decision triggers
- GET /api/intelligence/:country/history — audit trail (daily snapshots)
- GET /api/intelligence/:country/snapshot/:date — specific date snapshot
- GET /api/intelligence/crisis — countries in crisis mode (Phase 5)
- GET /api/intelligence/contagion/:country — contagion pathways
- GET /api/intelligence/precrisis — pre-crisis signatures
- GET /api/intelligence/patterns/report — latest daily pattern report
- GET /api/intelligence/findings — all 15 findings ranked by match count (live)
- GET /api/intelligence/finding/:id/matches — countries currently matching a finding
- GET /api/intelligence/:country/findings — all findings active for a country
- POST /api/intelligence/:country/qa — typed question → Sabian answers
- POST /api/intelligence/:country/drill — drill into a named pattern
- POST /api/intelligence/:country/session — full Host A briefing session
- POST /api/intelligence/portfolio — portfolio exposure analysis
- GET /api/observations/:country — observation ledger
- GET /api/observations/stats — global ledger stats + hit rate
- GET /api/data/:country/signals — Layer 1: raw signal readings
- GET /api/analysis/:country — Layer 2: correlations, going-dark, leads

### Internal (Bearer SMART_SABIAN_API_KEY)
- GET /api/score/:name — live convergence score (fresh fetch)
- POST /api/scan — trigger manual global scan
- GET /api/db/status — Supabase connection check

---

## DATABASE TABLES

| Table | Purpose |
|-------|---------|
| historical_signal_readings | Raw signal values, 1960–present, 153 countries, 43 signals |
| signal_baselines | P10/median/P90 per country per signal |
| signal_registry | Signal metadata |
| historical_convergence_scores | 65yr convergence scores with signal breakdown |
| signal_correlation_map | Pairwise correlations at lag 0–4 |
| signal_lead_indicators | Validated lead indicators (signal → outcome) |
| going_dark_patterns | Signals that go absent before crises |
| synthesis_records | Per-country synthesized intelligence |
| synthesis_scripts | Pre-generated narrative text |
| country_briefings | Phase 3 briefings |
| country_clusters | k-means clustering (k=8) |
| convergence_scores | Live daily scan scores (+ trajectory column) |
| signal_readings | Live daily signal readings |
| observations | Threshold crossing events (audit ledger) |
| alert_subscriptions | Custom buyer alert subscriptions |
| alert_events | Fired alerts |
| hive_observations | Hive feedback entries |
| pattern_match_history | Daily pattern matching results |
| pattern_daily_reports | Human-readable daily pattern reports |
| pattern_findings | Live per-finding store: match_count + matched_countries, updated every run |
| dossier_snapshots | Daily audit snapshots with checksum dedup |


---

## SIGNAL AUDIT — 2026-05-31

### COMPLETED THIS SESSION

**ingest_runner.cjs bugs fixed** — DONE
Two bugs: ROOT variable was undefined (Phase C spawns would crash), require.main guard was missing
(any `require()` of ingest_runner fired the full 153-country pipeline).
Files changed: `historical/ingest_runner.cjs`

**usda_food direction fix** — DONE
Direction was -1, causing all World Bank WDI contributions to be negative → clipped to 0 by Math.max.
3,195 zeros → 17 zeros after fetcher re-run. Top: Mozambique 1992 (98.2), Somalia 2009 (97.9).
Note: USDA PSD API now returns 0 — WB WDI fallback covers all data. Signal still active.
Files changed: `historical/fetchers/usda_food_historical.cjs`

**displacement_flow loaded** — DONE
6,544 rows from UNHCR Refugee Data Finder XLSX (download_2_extracted/UNHCR_Flow_Data.xlsx).
151 countries, 1962–2025. Spot checks: Ukraine 2022=5.78M ✓, Rwanda 1994=2.31M ✓.
New file: `historical/load_displacement_flow_xlsx.cjs`
Signal: displacement_flow, source: UNHCR XLSX flow

**displacement_stock crawl started** — 🔄 RUNNING (~7 hours)
Slow crawl at 2s/year/country, concurrency=1. Will produce ~11,628 rows (153 countries × 76 years).
New file: `historical/run_displacement_stock_slow.cjs`
Signal: displacement_stock, source: UNHCR API stock

### PENDING — Displacement Composite (AFTER CRAWL COMPLETES)

When crawl finishes:
1. Compare displacement_stock vs old displacement rows (verify values match)
2. Remove old data from ALL 4 locations (readings + baselines + registry + confirm convergence stale)
3. Run SQL cleanup in Supabase editor (see sabian_displacement_build_state.md for exact SQL)
4. Build displacement_historical.cjs composite (structural_pressure pattern: z-score flow+stock, average)
5. Run composite, verify top 10 historically correct
6. THEN proceed to sovereign_cds

### NEXT SIGNAL — sovereign_cds

Bug: current-account surplus AND deficit both map to positive (absolute value normalization).
Then direction=-1 subtracts the positive result for both → surplus and deficit both REDUCE risk.
A country with a severe deficit gets treated the same as one with a surplus. The signal compresses
to near-zero for almost all inputs.
2,886 non-null rows exist. Data volume is fine. Logic redesign needed.

### OUTSTANDING SIGNALS (in order)

1. displacement composite — blocked on crawl ⏳
2. sovereign_cds — normalization bug, next to trace
3. gdelt_conflict — only 1,008 rows, needs investigation
4. Final rebuild: baseline_discovery + convergence_history (run ONCE after all signals clean)

---

## STATUS: DONE 2026-06-09 (Day 5)

- [x] Fixed CH_API_KEY double-prefix bug in .env — Companies House live (verified Tesco 200, Barclays 200)
- [x] Removed ACLED from .env completely — not using it
- [x] Added Companies House as Source D in actor_presence_scan.cjs (searches UK entities by country name, catches SPVs)
- [x] Added GLEIF as Source E (ISO2 lookup, entity continuity, catches actors across name changes)
- [x] Fixed writeRows chunking to 500 rows — solves Supabase TypeError fetch failed on 10,000-entity Argentina events
- [x] Full scan run: 106,985 rows across 59 events with A+B+C+D (pre-chunking)
- [x] 3 Argentina events (1995, 2016, 2020) failed on old single-batch write — chunking fix now in place, re-run fills them via ignoreDuplicates

## NEXT (start of next session)

1. Re-run node historical/actor_presence_scan.cjs — chunking fills the 3 failed Argentina events + GLEIF adds Source E to all events. Verify the 3 Argentina write lines succeed.
2. Run repetition query (no LIMIT) — entities in 3+ events, different countries, different patterns. Build behavior-weighted separator: litigation > distressed holding > passive custodial. NO name bias.
3. OpenCorporates as Source F (free tier, BVI/Cayman/Jersey shells).
4. THEN: engine swap, latent_findings table, 4 anchors.
