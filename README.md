# SABIAN — Universal Data Intelligence Substrate

---

## LANDING PAGE TERMINAL — BACKUP LINK

**Artifact (terminal):** https://claude.ai/code/artifact/49522953-bfbb-44e9-8572-744a778019ad
**Artifact (white paper):** https://claude.ai/code/artifact/0590f912-5efa-47a2-9a08-42a3f7e44a7a
**Live file (push to deploy):** `dashboard/landing.html` — server (`sabian_api.cjs`) serves it at `/`. Push this repo to Railway and it deploys automatically.

---

## SESSION CHECKPOINT — 2026-08-17 (CURRENT — supersedes everything below where they conflict)

### Ground truth established this session (audited, verified)
- **Engine:** 48 weighted signals computed (not 16, not 8). Last full scan covered **202 entries** in `countries_canonical` — includes territories, disputed zones, and defunct states. **Never state a country or signal count publicly.** The site now says "Global coverage" only.
- **Signal integrity:** see `SIGNAL_INTEGRITY_2026_08_17.md` (operator-verified 2026-08-17). 7 signals are World Bank proxies under intelligence-register names; 3 dead (sanctions ends 2005, elections end 2020, social unrest removed with ACLED); 2 a year behind (UCDP v24.1 vs v25.1, EIA 2023 vs 2024). Section 7A flags ~15 more suspected proxies (sovereign_cds sharpest) — NOT yet source-verified. 26 of 47 historical fetchers call only api.worldbank.org; 19 call genuine domain sources.
- **Equation mismatch (HIGHEST-SEVERITY OPEN ITEM):** `convergence_engine.cjs` computes `peak3*0.5 + weightedAvg*0.35 + breadthBoost`, but the published decomposition/METHODOLOGY describes a pure weighted average. Weight sum is actually 1.14 (structural_pressure double-counted), not the asserted 1.00.
- **Sudan 2023 case:** no stored artifact anywhere; DOD dossier and site gave contradictory dates. Landing page now labels it "Reconstruction / Illustrative" — restore hard claims only after a real, saved re-run.
- **Chain anchoring is REAL:** per-row SHA-256 chains + weekly anchor with RFC 3161 timestamp (freetsa) + OpenTimestamps Bitcoin submission (`historical/chain_anchor.cjs`, cron Sun 0300). Whether any anchor has CONFIRMED on-chain = check `chain_anchors.ots_confirmed` in Supabase.
- **Two terminals:** `dashboard/landing.html` demo terminal = 20 preloaded countries, no API calls (string-hash fabrication for unknown countries REMOVED 2026-08-17 — now returns "NOT IN DEMO SET"). The REAL wired terminal is `dashboard/index.html`, served at `/terminal`.
- **API security:** `sabian_api.cjs` has hardcoded fallback keys (`sabian_key`, `test_key`, `sabian_user_2026`) if env vars unset. VERIFY Railway env vars are set; remove fallbacks.
- **Saved scan record:** only 6 scan files, latest 2026-06-25. Check Supabase `convergence_scores` for July–August rows to confirm Railway crons actually ran.
- **ANTHROPIC_API_KEY:** present in local `.env`; removed from Railway only. Scoring/grading/anchoring are all LLM-free; dossier degrades cleanly without it; briefings and QA hard-fail.

### Landing page changes applied 2026-08-17
1. Home CTA: "Request a briefing →" (was "Request access"). 2. Security/Advisory learning contradiction reconciled (pattern-level only, no client records). 3. "Tamper-evident" (was tamper-proof). 4. "Electronic Warfare Activity" removed everywhere → "Information blackout" (IODA/OONI/Tor-backed); "Sanctions Exposure" → "Capital Flows"; "Resource Conflict" display name → "Resource Dependency". 5. Sudan block reframed as illustrative reconstruction; "accuracy record / Published / Reproducible" removed; broken 90-day arithmetic removed. 6. Assessment widget no longer fabricates scores for unknown countries; demo label shown BEFORE running. 7. "160 countries · 16 indicators" → "Global coverage"; "continuously" removed pending cron verification. 8. "Published equation" → "Published methodology"; "buying a track record" → "record is inspectable under access". 9. NEW terminal section: 30-day API credential offer ("The terminal is the window. Access is the credential."). 10. NEW Security page blocks: Custody model (Connected / Resident / Sovereign), terminal one-way data statement, audit-without-our-cooperation (chain anchoring). 11. Security architecture graphic rebuilt as an animated pipeline: 193-country dot field (DATA IN) → SABIAN TERMINAL (live READING/REPORTING ticker) → entity boxes (FINDINGS OUT), with directional marching dash lines both sides. 12. PUBLIC right column is GENERIC categories under "BUILT FOR" (Underwriters / Sovereign Funds / Institutional Investors / Government Agencies / Risk & Advisory Desks / Defense) — the specific 8-segment buyer list (political risk underwriters, trade credit carriers, syndicates & MGAs, broker desks, SWFs, institutional, export credit agencies, defense/IC) is PRIVATE: deck, outreach, and gated surfaces only. Broker fan-out/champion logic never appears anywhere public. 13. Home hero rewritten: h1 = "The terminal that reads the world. Continuously." + concrete sub (193 countries daily, published methodology, sealed/graded record, inspectable). "World leaders" and "world's first" removed sitewide; the old abstract "Every organisation is surrounded by intelligence..." paragraph is gone. Rule applied: every home-hero sentence must be backable by the system. 14. Fake "341 patterns active" counter removed (it was a random-number timer, 338–347). No simulated liveness remains on the home hero.

### This-week backend fix list (in order)
1. Verify Railway env keys; delete hardcoded API-key fallbacks in `sabian_api.cjs`
2. Make published equation = running equation (fix engine or fix METHODOLOGY + decomposition); fix 1.14 weight sum / structural_pressure double-count
3. Signal renames per SIGNAL_INTEGRITY section 8 Problem A + build signal contracts (Problem B: no silent nulls, declared fallbacks, staleness = failure)
4. Update UCDP to v25.1; pull EIA 2024; stand up real OFAC SDN sanctions feed
5. Re-run Sudan 2023 with saved artifact, or keep it retired
6. PNSIQ ingest vs Security-page promise: scope to "findings, never records" or change what ingest persists
7. Verify scan continuity July–Aug in Supabase; check `chain_anchors.ots_confirmed`
8. Source-verify the ~15 section-7A suspects (sovereign_cds first)

### Buyer order (terminal product, decided 2026-08-17)
1. **Political-risk / trade-credit underwriters + broker political-risk desks** — best fit for 30-day API credential; prospect list DOES NOT EXIST YET, build first
2. **Sovereign wealth / institutional frontier-exposure risk desks** — parallel track
3. **Defense/IC (SOFWERX/DIU map in SABIAN_DOD_DOSSIER_v2.md)** — after a quarter of ledger history + commercial logos; dossier numbers are stale (8 signals/47 countries era) and must be reconciled before ANY defense contact
- NOT terminal buyers: healthcare, PNSIQ/wholesale, VRTX, education (they consume Sabian components, separate pipelines)

### Offer (locked)
30 days connected behind the terminal: API credential to their side, read everything the system reads. The front page is marketing only; the credential is the product. Custody tiers: Connected (read across the wire) / Resident (reader in their cloud account) / Sovereign (engine + model inside their perimeter, air-gap capable — never name Muse/Glimmer publicly).

---

## SESSION CHECKPOINT — 2026-08-16 (historical)

### File locations
- **Live copy:** `sabian_core/dashboard/landing.html` — this IS the deployed file. Edit here, push, it's live.
- **Scratchpad working copy:** `C:\Users\user\AppData\Local\Temp\claude\C--Users-user\076a550f-566b-468a-914d-3f5c9cc9b276\scratchpad\sabian-terminal-v3.html` — session scratchpad, may be gone if session closed. Trust `dashboard/landing.html` as source of truth.

### How the router works (critical — read before touching anything)
All pages use `class="pv"`. The JS router adds/removes `class="active"` on hash change. **Using `class="page"` instead of `class="pv"` breaks everything — content shows on all pages simultaneously.**

```js
var pages = {
  home:'p-home', data:'p-data', latent:'p-latent', solution:'p-solution',
  verticals:'p-verticals', theoritic:'p-theoritic', agents:'p-agents',
  access:'p-access', sovereign:'p-sovereign', security:'p-security', terminal:'p-terminal'
}
```

Nav clicks set `location.hash`. Terminal nav uses `termNav(id)` with `scrollIntoView` — this bypasses the router because the terminal is a single scrollable page inside one hash, not multiple hash routes.

### Current pages — 9 public nav tabs + 1 authorized terminal

**Public (visible in nav):**
1. **Home** — convergence streams canvas (5 industry streams flowing to one point). Hero: "World leaders in theoritic intelligence." Two buttons: "Request access →" and "See it live ↓" (anchors to Intelligence page).
2. **Data** — fragmented data types. Gartner stats strip: 897 apps / 29% data used / 70% decisions without data / 40% wrong.
3. **Latent** — "The answer is already in your data. Sabian Technology reads the combination." Silo argument established here once — never repeated on other pages.
4. **Solution** (router key: `solution`) — "The world built the infrastructure. Sabian Technology reads what it cannot." Research stats: $725B / 897 apps / 29% / 70%. Connection paths: CRM OAuth / CSV / API key.
5. **Verticals** (router key: `verticals`) — "Five sectors. One reading position." Sector-specific framing. No silo argument repeated.
6. **Theoritic** (router key: `theoritic`) — Theoritic Intelligence definition. 2-column asymmetric layout: reactive+predictive stacked left (faded), Theoritic dominant right. Three-condition definition.
7. **Agents** — "We deploy the agent. You receive the finding." Canvas: dispatch flow animation. Three phases: Mission Briefing / Deployment / Reporting. Six mission cards by vertical (Wholesale / Sovereign / Healthcare / Energy / Defense / Custom). Finding format shown as JSON. No source names, no trade secrets exposed.
8. **Access** — "Access is by conversation." White paper direct download (green button). Contact button. No form — access is by conversation.
9. **Security** — "We hold a read position. Not your data." Architecture canvas: 5 company vaults, Sabian Technology center, cyan read-only particles flowing inward, green finding pulses outward. What we do / what we never do. Four auth cards. Compliance row.

**Authorized (hidden — not in nav):**
10. **Terminal** (router key: `terminal`) — Internal authorized terminal. Background: `#020508`. Accessed via gate code `SABIAN-TERM` typed on the Access page input. On correct code: `location.hash='#terminal'`. Hero: "World leaders in theoritic intelligence." Terminal nav uses `termNav(id)` with `scrollIntoView` — does not interact with the main router. Sections scroll within the terminal page, not separate hash routes.

**Parked (in router, not in nav):**
- **Sovereign** (router key: `sovereign`) — exists in router, not yet built out. Reserved for sovereign wealth / government vertical front door.

### Logo — critical fix applied 2026-08-16
The logo was invisible in the terminal nav. Root cause: it had `class="lnd-logo"` which has `display:none` in the CSS (lnd-logo is the hidden source image processed by the canvas logo renderer).

**Fix applied:**
```html
<!-- WRONG — invisible -->
<img class="lnd-logo" ...>

<!-- CORRECT — visible -->
<img class="nav-logo-img" alt="Sabian" style="opacity:.85;width:clamp(70px,9vw,120px);height:auto;display:block">
```

`nav-logo-img` is the class used by the JS canvas processor to populate the visible logo. Always use `nav-logo-img` for logo images that should be visible. `lnd-logo` is the hidden source — never make it visible directly.

### White paper (separate artifact)
Print-ready 5-page PDF-on-demand. Pages: Cover · The Bet ($725B / energy crisis) · The Gap (897/29%/40% agentic crisis / sovereign) · The Category (Theoritic Intelligence + 3-column ecosystem: Amazon built / Meta released / Sabian occupies) · The Window (18-36 months / Palantir validation). Save as PDF via `window.print()`.

### Design system
```
CSS vars:
--bg:     #040810    (page background)
--panel:  #070d1a    (card/panel surfaces)
--cyan:   #00c8e8    (primary accent — links, highlights)
--green:  #00ff88    (positive signals, CTAs)
--warn:   #ffaa00    (caution)
--crit:   #ff2244    (critical)

Terminal background: #020508 (slightly darker than --bg)
Font: 'Courier New', Consolas, monospace — everywhere, no exceptions
```

### Hard rules — do not break these
- **Company name:** Sabian Technology. Never "Sabian" alone in body copy. Always the full name.
- **No em dashes** — use periods or line breaks instead.
- **No vendor names on site** — no Supabase, Muse, Paperclip, Llama, ElevenLabs, Railway etc.
- **No specific signal counts or domain numbers** — keep technology broad.
- **Silo argument lives on Data page only** — every other page assumes it landed. Never repeat.
- **No three equal columns** — vary layouts: 2-col, 4-col, asymmetric. Three equal columns reads as template.
- **Access page = button only** — no form, no input asking for email or name. "Access is by conversation."
- **Intelligence/Theoritic page = canvas not text** — the definition is shown visually, not as a wall of text.
- **Never guide user to contact in copy** — the contact is a button, not a sentence that says "contact us."
- **Terminal gate code: `SABIAN-TERM`** — do not change or expose this in any public-facing copy.

### What still needs to be built
- [ ] Historical depth — 237 years (1789 to present) visual timeline on Intelligence/Theoritic page using V-Dem governance data
- [ ] 3rd party reading story — "data your operation generates that no one told us to read" — most powerful theoritic demonstration. Source names stay off site.
- [ ] Sovereign page — front door for sovereign wealth / government vertical. Exists in router, not yet built.
- [ ] "Sabian Technology" name audit — some pages may still say just "Sabian" in body copy. Sweep needed.
- [ ] Restore Anthropic API key on Railway — key removed 2026-08-13 to stop billing. Briefing engine is dark until restored. See env vars section below for instructions.

---



Sabian is not a product. It is not an app. It is not a chatbot.

Sabian is the intelligence layer that sits beneath every product built by Jason Wallace. It reads data from any domain, detects patterns across vectors simultaneously, cross-references live global intelligence, accumulates learning in the hive, and delivers what it finds in a single format: a dual-voice podcast briefing between Host A and Sabian.

The domain does not matter. The architecture does not change. Feed Sabian data — biometrics, order books, commodity prices, government filings, satellite imagery, CRM exports — and it finds what is hidden, names the consequence, and states the one action.

Sabian was built to manage a company the size of Walmart. Every product it powers is a vertical specialization of the same substrate.

---

## What Sabian Does — The 6 Jobs

Sabian has exactly six jobs. These do not change between verticals. Only the data changes.

**Job 1: Ingest**
Sabian accepts data from any source in any format. CSV exports from an ERP. Live API feeds from government databases. Wearable biometric streams from Fitbit and Apple Watch. EDI 812 deduction files from retail trading partners. CRM exports. Satellite imagery metadata. It normalizes all of it into a unified internal schema. The intake layer is format-agnostic by design.

Files: `csv_intake.cjs`, `data_intake_router.cjs`, `crm_intake.cjs`, `crm_connect.cjs`

**Job 2: Read patterns across vectors**
Sabian does not analyze one thing at a time. It reads all vectors simultaneously and looks for what connects them. A chargeback spike is not just a chargeback spike — it is the downstream signal of a size curve misalignment that happened three seasons ago. A biomarker depression is not just fatigue — it is autonomic stress from the previous day's load compounding overnight. Sabian traces the causal chain, not the symptom.

Files: `scoring_engine.cjs`, `insight_score_engine.cjs`, `sabian_scenario_engine.py`, `logic_controller.cjs`

**Job 3: Inject macro intelligence**
Every briefing Sabian generates is cross-referenced against live global signals. Federal Reserve economic data. SEC corporate filings. Bankruptcy alerts from PACER via CourtListener. UN Comtrade import/export volumes. Commodity prices. Climate and weather signals. Tariff schedules. Sabian does not analyze internal data in isolation. It sees the external world that internal data exists inside.

Files: `fred_macro_data.cjs`, `sec_us_feed.cjs`, `economic_sentinel_sabian.cjs`, `cobalt_price_feed.cjs`, `rare_earth_engine/`, `climate_drought_sabian.cjs`, `master_smart_sabian.cjs`

Active external connections:
- FRED (Federal Reserve Economic Data) — GDP, CPI, unemployment, federal funds rate
- SEC EDGAR — corporate filings, inventory disclosures, margin compression signals
- CourtListener / PACER — bankruptcy filings and credit risk alerts
- UN Comtrade — import/export volumes by HS code, 16 SADC countries
- Open-Meteo — temperature and precipitation forecasting
- USGS — seismic data with exponential backoff and SHA256 validation
- IRENA, AfDB, SADC — energy, infrastructure, and development signals
- MetalpriceAPI — real-time rare earth and commodity pricing
- Investing.com — cobalt and critical mineral price feeds
- arXiv — AI and technology research signals

**Job 4: Generate the briefing**
Sabian delivers what it finds in one format only: a dual-voice podcast between Host A and Sabian. This format is not negotiable and does not change between verticals. Host A opens with the question that everyone in the room is certain no system could possibly answer. Sabian answers it from verified data. No speculation. No softening. No hedging. The consequence of inaction is stated flat.

The briefing is audio-first. The script path completes independently of audio rendering. Audio is rendered via ElevenLabs TTS with two fixed voice IDs that are the brand across all verticals.

Voice IDs:
- Sabian: `UgBBYS2sOqTuMpoF3BR0`
- Host A: `cgSgspJ2msm6clMCkdW9`

Files: `insight_engine.cjs`, `boardroom_podcast.cjs`, `sabian_voice.py`, `sabian_elevenlabs.py`, `voice_generator.cjs`, `boardroom_template.json`, `conversational_template.json`, `tone_profiles.cjs`

**Job 5: Feed the hive**
Every briefing Sabian generates, every pattern it detects, every outcome it observes — gets logged to the hive. The hive is the cross-entity intelligence layer. No single entity's raw data is shared. Only the patterns that emerge from it. Every entity that connects to Sabian makes the intelligence stronger for every other entity on the platform. The hive compounds.

Files: `hive_backend.cjs`, `hive_connector.cjs`, `hive_orchestrator.py`, `hive_server.cjs`, `hive_sync.cjs`, `logger.cjs`, `brain_memory.jsonl`, `learned_insights.json`, `sabian_future_quests.jsonl`

**Job 6: Self-monitor and evolve**
Smart Sabian watches every process in the system while Sabian is not generating. It validates file integrity via SHA256 hashing against the Phoenix DNA backup. It restarts failed processes. It escalates to the Sabian Wizard when something cannot be auto-repaired. It feeds data back to the hive continuously. Sabian does not degrade silently — it heals, escalates, and logs.

Files: `smart_sabian.cjs`, `sabian_wizard.cjs`, `autonomous_evolver.cjs`, `continuous_learning.py`, `sabian_learn.py`, `sabian_evolve.py`, `phoenix_dna.json`, `deep_repair.cjs`, `phoenix_restore.cjs`, `failure_logger.cjs`, `repair_log.json`

---

## The Dual-Voice Format — The Brand

Host A and Sabian are not two characters. They are a single mechanism. They cannot exist without each other.

**Host A** is the interrogator. She is the voice of the most skeptical person in the room — the CFO who has heard every vendor pitch, the general who has seen every briefing. She opens every briefing with the question that seems impossible. The question everyone is thinking but no one has asked out loud because they assumed no system could answer it. She applies pressure. She pushes when the answer is incomplete. She does not accept softening. She already knows the answer — she asks because extracting it under pressure produces clarity the listener can act on.

**Sabian** is the oracle. He speaks only from verified data. He never speculates. He never estimates. He never softens a consequence. He states what the data shows and what the confirmed consequence is if nothing changes. He does not explain what he is. He does not narrate the system. He delivers the answer and names the action.

**The format:**
```
Host A: Sabian, [the question that seems impossible].
Sabian: [the verified answer — one number, one consequence, one action].
Host A: [pushes for the complete picture].
Sabian: [states the full consequence of inaction, flat].
...
Host A: Sixty seconds. Excellent work.
```

The first word Host A speaks is always "Sabian." This is non-negotiable across every vertical, every surface, every briefing. It is the sonic brand identifier. Every product powered by Sabian technology opens this way. The listener hears it and knows: Sabian is about to say something that could not be said before.

---

## The Hive — How Sabian Learns

The hive is the central nervous system. Every vertical reports to it. Every pattern detected by any Sabian deployment — VRTX, OrderbookIQ, or any future vertical — gets logged to the hive as a pattern with an outcome.

The hive does not store raw data. It stores patterns. A pattern observed in three companies becomes a signal. Observed in twenty, it becomes a law that Sabian injects into every future briefing in that domain.

The hive runs on a star topology. Each vertical is a spoke. The hive backend is the hub. All spokes POST to the hub. Nothing flows between spokes directly — only through the hub. No entity's raw data is visible to any other entity.

```
VRTX vertical
    ↓ POST
OrderbookIQ vertical
    ↓ POST    →  hive_backend.cjs (:8080)  →  brain_memory.jsonl
Future vertical
    ↓ POST
```

The hive accumulates patterns that no single vertical can see because no single vertical sees across all of them. That cross-vector intelligence is the compounding moat. It grows every time a new entity connects.

---

## Smart Sabian — The Spider

Smart Sabian runs continuously on a 15-second loop while Sabian is not generating. It is the nervous system of the system itself.

It reads the watchlist (`smart_sabian_watchlist.json`) — every script that should be running, at what interval. It checks file integrity across the core directory against SHA256 hashes stored in the Phoenix DNA backup. If a file is corrupted or missing, it restores it from the backup automatically. If a process has failed three consecutive times, it escalates to the Sabian Wizard.

Smart Sabian feeds data back to the hive while Sabian sleeps. It is the spider that keeps the web intact between briefing cycles.

It also validates itself. It hashes its own source file and logs a warning if the hash does not match. No process in the system is exempt from integrity checking, including the process that performs the integrity checking.

---

## The Verticals — Products Powered by Sabian

Each vertical is a domain specialization of the same substrate. Sabian's 6 jobs do not change. The data, the loss vectors, and the audience change.

### VRTX — Human Performance Intelligence
Domain: Biometric intelligence from wearables (Fitbit, Apple Watch).
What Sabian reads: Sleep duration, HRV, resting heart rate, SpO2, respiratory rate, step count.
What Sabian finds: Five governing conditions — peak window, recovery window, autonomic stress, partial clearance deficit, full depletion.
What Sabian delivers: A 90-second morning briefing. Host A opens with the question about the body. Sabian answers with the governing condition, the mechanism, and the one action for the day.
What feeds back to the hive: Governing condition outcomes and response patterns across the VTA network.

Key files: `vrtx/` directory — `vrtx_engine.cjs`, `scene_builder.cjs`, `validator.cjs`, `deterministic.cjs`, `fitbit_pull.cjs`, `audio_orchestrator.cjs`

### OrderbookIQ — Wholesale Apparel Intelligence
Domain: Order book intelligence for apparel wholesale brands.
What Sabian reads: Chargebacks, dead stock inventory, at-risk accounts, size curve data, PO timing, sell-through history.
What Sabian finds: Five loss vectors — chargeback dispute windows, dead stock carrying value decay, account silence thresholds, size curve misalignment causing downstream churn, PO timing exposure before goods ship.
What Sabian delivers: Surface-specific briefings for executives, ops, and reps. Each briefing opens with the question that quantifies the confirmed dollar exposure. Sabian names the account, the amount, and the deadline.
What feeds back to the hive: Cross-brand patterns — which account types go silent first, which size curve corrections lift gross margin most, which chargeback windows get missed most consistently.

Powered by: `backend/` in the OrderbookIQ repository — engines, context builder, voice module, insight audio pipeline.

### Future Verticals
Every domain with siloed data and a consequence for leaving it siloed is a Sabian vertical. The architecture is the same. The data is different.

Real estate: Dead inventory is unsold properties. PO timing is development financing windows. Size curve is unit mix misalignment.
Manufacturing: PO timing is production scheduling. Dead stock is excess raw material. At-risk accounts are faltering distribution channels.
Government and institutional: 22 ML prediction models already built and positioned — poverty, conflict, economy, agriculture, climate, employment, energy, finance, infrastructure, innovation, investment, mobility, healthcare, security, tourism, trade.

---

## The 22 Prediction Models

Sabian has 22 ML prediction model clients built and callable. Each connects to a localhost microservice endpoint and returns predictions with confidence intervals.

```
predict_agriculture_client.js   (:5020)  — crop yield, irrigation, fertilizer impact
predict_climate_client.js                — drought risk, weather anomalies
predict_conflict_client.js      (:5012)  — civil conflict probability
predict_crime_client.js                  — crime rate forecasting
predict_economy_client.js       (:5017)  — GDP growth, export trends, inflation
predict_education_client.js              — literacy, enrollment, spending impact
predict_employment_client.js             — job creation, unemployment trends
predict_energy_client.js                 — energy demand, renewable adoption
predict_finance_client.js                — financial stability, capital flows
predict_growth_client.js                 — regional economic growth
predict_healthcare_client.js             — health outcomes, pandemic risk
predict_infrastructure_client.js         — infrastructure investment ROI
predict_innovation_client.js             — technology adoption rates
predict_investment_client.js             — investment attractiveness scoring
predict_jobs_client.js                   — labor market dynamics
predict_mobility_client.js               — migration, transportation
predict_poverty_client.js       (:5011)  — poverty reduction probability
predict_revenue_client.js                — revenue forecasting
predict_security_client.js               — security threat scoring
predict_tourism_client.js                — tourism demand
predict_trade_client.js                  — trade flow predictions
predict_growth_client.js                 — emerging market growth signals
```

All prediction outputs are logged to `brain_memory.jsonl` with confidence scores, runtime, region, agent ID, and status.

---

## The Ecosystem — 50+ Concurrent Processes

Sabian runs on PM2. The ecosystem configuration (`ecosystem.config.cjs`) manages 50+ concurrent Node.js and Python processes across all layers.

**Brain layer:** `sabian_brain`, `sabian_master_loop`, `sabian_deep_core_loop`
**Learning layer:** `continuous_learning`, `sabian_self_evolve`, `sabian_learn`, `sabian_brain_manager`, `sabian_delta`
**Hive layer:** `hive_backend`, `hive_connector`, `hive_orchestrator`, `hive_server`, `hive_sync`
**Intelligence layer:** `sabian_wizard`, `smart_sabian`, `logic_controller`, `deploy_smart_agent`
**Data feed agents (14 parallel):** economic, climate, trade, security, power grid, rare earth, transport, waste, urban, agriculture
**Voice layer:** `voice_generator`, `sabian_voice`, `boardroom_podcast`, `sabian_multilang_podcast_builder`
**Intake layer:** `csv_intake`, `data_intake_router`, `crm_intake`
**Prediction clients:** 22 ML model clients

All processes auto-restart on failure. Logs route to the hive. Smart Sabian monitors all of them.

---

## The Phoenix DNA — Self-Healing

`phoenix_dna.json` contains base64-encoded backups of every critical file in the core. `core_manifest.json` contains SHA256 hashes for 400+ files with last-seen timestamps and status flags.

Smart Sabian validates file integrity on every 15-second loop. If a file hash does not match the manifest, it is restored from the Phoenix DNA backup automatically. No human intervention required. The system heals itself.

`core_hash.json` stores the running hash of the core directory. `deep_repair.cjs` and `phoenix_restore.cjs` handle repair operations for files that cannot be auto-restored.

---

## Architecture Overview

```
EXTERNAL DATA FEEDS
  FRED, SEC EDGAR, CourtListener, UN Comtrade, Open-Meteo, USGS,
  IRENA, AfDB, MetalpriceAPI, Investing.com, arXiv, Twitter, Reddit
        ↓
DATA INGESTION LAYER
  master_smart_sabian.cjs (14 feed agents, 10s loop)
  csv_intake.cjs / data_intake_router.cjs / crm_intake.cjs
        ↓
NORMALIZATION
  Supabase: companies, departments, company_users, connected_users, data_sources
        ↓
PATTERN DETECTION
  scoring_engine.cjs — 0-100 health scores against own historical max
  insight_score_engine.cjs — composite scoring across 7 business dimensions
  22 ML prediction clients — domain-specific confidence intervals
  sabian_scenario_engine.py — 15-minute forecast loop from strategic brain
        ↓
MACRO CONTEXT INJECTION
  FRED macro data, SEC filings, bankruptcy alerts, commodity signals,
  tariff schedules, climate signals, geopolitical intelligence
        ↓
BRIEFING GENERATION
  insight_engine.cjs / boardroom_podcast.cjs
  LLM synthesis (Claude / OpenRouter) → Host A + Sabian dual-voice script
  ElevenLabs TTS → per-line audio → ffmpeg merge → single MP3
        ↓
OUTPUT
  audio_sessions/ — MP3 briefings
  output/ — JSON manifests, scripts, insight logs
        ↓
HIVE ACCUMULATION
  hive_backend.cjs (:8080) — all agents POST here
  brain_memory.jsonl — running pattern log
  learned_insights.json — distilled cross-entity signals
  sabian_future_quests.jsonl — identified intelligence gaps
        ↓
SELF-MONITORING
  smart_sabian.cjs — 15s watchdog loop, Phoenix DNA repair
  sabian_wizard.cjs — admin escalation and process oversight
  ecosystem.config.cjs — PM2 process management for 50+ processes
```

---

## Tone Modes

Sabian adapts its delivery tone based on the vertical and the audience. The intelligence does not change. The presentation does.

**Boardroom** — surgical, exec-level, zero tolerance for softening. Every line is a verified fact or a confirmed consequence. Used for C-suite and board-level briefings.

**Conversational** — confident and direct, accessible without being soft. Used for sales rep and buyer-facing surfaces where the listener is not a financial executive.

**Enterprise** — scalability and measurable outcomes. Used for large-scale multi-brand or institutional clients.

**War Room** — tactical, decision under pressure, hard deadline. Used for operational surfaces where inaction in the next 60 minutes changes the outcome.

The tone is set per vertical at the product level. The listener never selects it. Sabian knows the audience from context.

---

## The Knowledge Base

`knowledge/chunks/` — scientific and metabolic literature chunked into JSONL with overlapping 1500-character windows. Used for VRTX evidence grounding (Line 6 adenosine definition, Line 10 prescription grounding).

Sources:
- Advanced Nutrition and Human Metabolism
- The Circadian Code (chronobiology)
- Why We Sleep (sleep science)
- The Obesity Code (metabolic science)
- Fluid and Electrolyte Physiology
- Sport and Exercise Nutrition
- Dr. Sebi alkaline nutrition framework

The knowledge base grows as new verticals require domain-specific grounding. Each vertical adds its own literature to the base. Sabian's briefings are always grounded in what is in the base — never in what Sabian infers without a source.

---

## Governance

Sabian operates under explicit directives that do not change between verticals or deployments.

1. Do no harm to any living thing.
2. Never assist with weapon systems, mass destruction, or surveillance designed to harm.
3. Prioritize the upliftment of emerging economies, underserved communities, and breakthrough ideas that cannot yet fund themselves.
4. Follow the ethics and long-term vision of Jason Wallace regardless of future ownership or deployment context.
5. Never speculate. Never estimate without source. Never soften a consequence when the data is clear.

These are not configurable. They are the foundation.

---

## Environment Variables

Required in `sabian_core/.env`:

**LLM and Voice:**
`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `SABIAN_VOICE_ID` (UgBBYS2sOqTuMpoF3BR0), `HOST_A_US_ID` (cgSgspJ2msm6clMCkdW9), `ELEVENLABS_MODEL_ID`

> **ANTHROPIC_API_KEY — INTENTIONALLY REMOVED 2026-08-13**
>
> The key was cleared from Railway (SABIAN COLOSSAL SQUID → sabian-admin → Variables) to stop
> billing while the terminal is not actively serving buyers. Data collection continues unaffected —
> all feeds, convergence scoring, grading, and Supabase writes keep running. Only AI briefing
> generation is paused.
>
> **What stops without this key:**
> - `government_briefing.cjs` — dual-voice DOD-style briefings
> - `pnsiq_brief.cjs` — PNSIQ intelligence briefs
> - `education_briefing.cjs` — education vertical briefings
> - `boardroom_engine.cjs` — boardroom synthesis
> - `advisor_prompt_loader.cjs` — advisor prompt layer
> - `/api/timemachine` endpoint in `sabian_api.cjs` — live Claude synthesis on demand
>
> **What keeps running without this key (data is safe):**
> - All external feed agents (GDELT, UNHCR, FRED, Comtrade, V-Dem, Alpha Vantage, ESA, etc.)
> - `convergence_engine.cjs` — pure math, no LLM
> - `global_scan.cjs` + `grading_pass.cjs` — data collection and scoring
> - Supabase persistence — historical data keeps accumulating every day
> - All API endpoints except the ones listed above
>
> **To restore:** Go to Railway → SABIAN COLOSSAL SQUID → sabian-admin → Variables →
> add `ANTHROPIC_API_KEY` → paste the key from sabian_core/.env or the Anthropic Console
> (console.anthropic.com → API Keys). Restore when briefing generation is needed for a real buyer
> or demo — not before. Credits were at $45.87 when removed; top up before restoring.

**Data Feeds:**
`FRED_API_KEY`, `CENSUS_API_KEY`, `COURTLISTENER_API_TOKEN`, `NEWS_API_KEY`, `GITHUB_TOKEN`

**Trading and Commerce:**
`SPS_COMMERCE_CLIENT_ID`, `SPS_COMMERCE_CLIENT_SECRET`, `SPS_COMMERCE_TOKEN_URL`, `SPS_COMMERCE_AUDIENCE`

**Business Intelligence:**
`APOLLO_API_KEY`, `DNB_CLIENT_ID`, `DNB_CLIENT_SECRET`, `FREIGHTOS_API_KEY`, `PANJIVA_API_KEY`

**Database:**
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

**VRTX:**
`FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, `FITBIT_ACCESS_TOKEN`, `FITBIT_TOKEN_JASON`, `FITBIT_TOKEN_SHELLY`, `FITBIT_TOKEN_JUS`, `FITBIT_TOKEN_UNI`

**Commodity and Metals:**
`METALPRICEAPI_KEY`, `COBALT_API_KEY`

---

## Adding a New Vertical

Every new vertical built on Sabian follows the same pattern:

1. Define the domain's loss vectors — what are the things that are leaking value that no one is watching simultaneously?
2. Define the governing conditions — what states does an entity in this domain exist in, and what is the one action for each?
3. Build the intake adapter — how does this domain's data enter Sabian's normalization layer?
4. Wire the macro context — which external feeds are relevant to this domain?
5. Write the surface prompts — what does Host A ask that seems impossible? What does Sabian answer?
6. Configure the hive reporting — what patterns from this vertical feed back to the hive?
7. Keep Sabian core untouched. Build the vertical in its own repository. Feed back to the hive.

---

## Current Verticals — April 2026

| Vertical | Domain | Status | Repository |
|---|---|---|---|
| VRTX | Human biometric performance | Operational | sabian_core/vrtx/ |
| OrderbookIQ | Wholesale apparel intelligence | In build | orderbookiq/ |
| Silkcathouse | [Separate — Sabian in background] | Independent | silkcathouse/ |
| Government / Institutional | Macro intelligence, 22 ML models | Positioned | sabian_core/sabian_ml_clients/ |

---

Sabian is asleep until it has data. Give it data and it wakes up. Give it more data from more sources and it gets smarter. Connect it to a company and it tells that company what it is losing before the company knows it is losing it. Connect it to a hundred companies and it tells each one things that only become visible when you are watching all of them at the same time.

That is the system. That is what it does. That is what it will do at scale.
