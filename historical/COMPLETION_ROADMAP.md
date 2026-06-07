# SABIAN — COMPLETION ROADMAP
## From analytical foundation to working product

Generated: 2026-05-27. This supersedes all previous roadmaps.
Phases 1–4.5 complete. Six steps remain to a working product.

---

## WHAT IS DONE

### Infrastructure (Phases 1–4.5)
- 43 signals, 153 countries, 1960–present
- Historical convergence scoring: 8,506+ country-year pairs
- Deep pattern mining: 388 findings, 45,381 tests
- Going-dark detection, regional contagion, stability classification
- 99.7% classification rate: 375 of 376 crossings explained
- Only genuine unknown unknown: Tunisia 1961

### Intelligence Product (Phases 4.5)
- 12-page Sabian Intelligence Dossier (per country)
- Sabian Reasoning Engine (Claude reads dossier, explains patterns)
- Audio insight: Host A + Sabian voices, per dossier
- PDF export: buyer downloads full dossier
- Analogue engine: matches current state to historical cases
- Portfolio contagion: "if country A falls, who follows"
- Temporal intelligence: "how much time does the buyer have"
- Defense procurement layer (SIPRI validated, arms transfers pending)
- Behavioral signals: night_lights, diaspora_remittance, food_stress

### API (39 routes)
- Three-tier auth: public / buyer / internal (Bearer token)
- Intelligence endpoints: dossier, PDF, audio, temporal, precrisis, contagion, portfolio
- OpenMCT terminal served at /terminal
- Alert subscriptions, time machine, clustering, briefings

### Q&A Module (CLI only — NOT yet in API)
- dossier_qa.cjs: runQA(), runDrill(), runFullSession()
- Typed question → Host A voices it → Sabian answers from dossier data
- Needs an API endpoint and a frontend interface

---

## FOUR DELIVERY MODES

| Mode | What It Does | Status |
|---|---|---|
| Terminal (OpenMCT) | Live convergence scores, going-dark alerts, download button | PARTIAL — shows score only |
| Download (PDF) | Full 12-page dossier, buyer downloads and reads | DONE |
| Audio Insight | Host A + Sabian podcast, buyer listens then downloads | DONE |
| Interaction (Q&A) | Typed question → Sabian answers from verified data | CLI ONLY — needs API + UI |

---

## FOUR BUYER LAYERS

| Layer | What It Serves | Endpoint | Status |
|---|---|---|---|
| Layer 1 — Data | Raw signal readings per country | /api/data/:country/signals | NOT BUILT |
| Layer 2 — Analysis | Pattern findings, correlations, first movers | /api/analysis/:country | NOT BUILT |
| Layer 3 — Intelligence | Full dossier + insight + PDF + audio | /api/intelligence/:country | DONE |
| Layer 4 — Action | Alerts, crisis triggers, portfolio exposure | /api/alerts, /api/intelligence/precrisis | PARTIAL |

---

## COMPLETION STEPS — IN ORDER

### STEP 1 — Run post_backfill_chain (IMMEDIATE)
**Why first:** fire_hotspot grew from 42 to 69 countries since last chain run. Every score downstream is stale. All subsequent steps read from convergence_scores. Fix the foundation before writing any code.
**What it does:** baseline_discovery → convergence_history → holdout_validation → pattern_matcher_nightly
**Time:** ~30 minutes
**Then:** re-run stability_filter.cjs — Test 4 (fire/GDELT first movers) is currently provisional

### STEP 2 — Wire Q&A into API
**Why second:** the interaction layer is the buyer's way to interrogate Sabian. It is the only delivery mode not accessible outside CLI. Three new endpoints:
- `POST /api/intelligence/:country/qa` — typed question → Sabian answer
- `POST /api/intelligence/:country/drill` — drill into a pattern
- `POST /api/intelligence/:country/session` — full Host A session
**Input:** `{ "question": "What is driving the score?" }`
**Output:** `{ "hostAQuestion": "...", "sabianAnswer": "...", "country": "...", "score": N }`
**Frontend:** simple typed input in the OpenMCT terminal or a buyer-facing page

### STEP 3 — Add Layer 1 and Layer 2 endpoints
**Why third:** buyers need raw access. The four-layer model is what separates a data API from an intelligence product. Without Layer 1 and 2, the API only has Layer 3 (dossier) and Layer 4 (alerts).
- `GET /api/data/:country/signals` — raw signal readings from historical_signal_readings (buyer tier)
- `GET /api/analysis/:country` — deep pattern findings for country: correlations, going-dark status, first movers, contagion risk, cluster membership

### STEP 4 — Update OpenMCT terminal
**Why fourth:** the terminal is what buyers see first. Currently it shows only convergence score. Five additions:
1. 12 core signal telemetry objects (each signal as a telemetry source, plotted over time)
2. Going-dark panel: which signals have gone silent in the last 3 years
3. Contagion status: which neighbors have crossed threshold (from contagion endpoint)
4. Audio download button: triggers /api/intelligence/:country/audio, shows status, provides download link
5. Q&A typed input: buyer types a question, gets Sabian's answer inline (no transcript — audio only for insight)

**Confirmed:** the audio insight is NOT displayed as text in the terminal. Download button only.
**Confirmed:** the Host A closing question lives inside the audio generation prompt — not a separate terminal element.
**Q&A interface:** typed input → API call → Sabian text answer displayed inline in terminal.

### STEP 5 — Phase 5: Crisis mode trigger
**What it is:** when score + trajectory + active leads are all simultaneously elevated → crisis mode activates. Override briefing fires. Alert goes to subscriber.
**Files to build:**
- `historical/crisis_mode_trigger.cjs` — detector: reads synthesis_records + lead indicators. If score ≥ CRITICAL threshold AND trajectory rising AND 2+ active leads → mark as crisis_mode_active
- `GET /api/intelligence/crisis` — returns all countries currently in crisis mode with trigger details
**Trigger conditions:** score ≥ 75, trajectory = RISING or SHARP_RISE, 2+ signals in lead position
**Buyer value:** "not a daily briefing — a phone call at 3am."

### STEP 6 — Phase 6: Global aggregate
**What it is:** aggregate synthesis across all 152 countries into a single global stress index. Regional breakdowns by theater.
**Files to build:**
- `historical/global_aggregate.cjs` — reads all current synthesis_records, computes median/P75/P90 global score, regional averages, top 10 at risk
- `GET /api/global` — current global stress index + regional breakdown
- `GET /api/regional/:region` — AFRICOM, CENTCOM, EUCOM, INDOPACOM, SOUTHCOM breakdown
**Output format:** `{ globalScore: N, band: "ELEVATED", regional: { AFRICOM: {...}, ... }, topRisk: [...] }`

### STEP 7 — Snapshot preservation (audit layer)
**What it is:** every dossier generation is saved to a `dossier_snapshots` table. Buyers can audit what Sabian said on a given date. Prevents dispute about what was reported.
**Table:** `dossier_snapshots(country, generated_at, score, band, summary_text, full_json)`
**Endpoint:** `GET /api/intelligence/:country/history` — all snapshots for this country, newest first
**Why it matters:** institutional buyers — DOD, NGOs, financial firms — require audit trails for any intelligence product they pay for.

### STEP 8 — Update roadmap and memory files
**Final step:** update SABIAN_ROADMAP.md, COMPLETION_ROADMAP.md, and memory files with completed session work. Mark all phases done. Write the final intelligence findings summary for sales/white paper use.

---

## WHAT THE FINISHED PRODUCT LOOKS LIKE

A buyer logs in. They see the OpenMCT terminal:
- Global threat table (all countries, sorted by score)
- Each country has: score, band, going-dark alerts, contagion flags, audio download button
- They click a country → 12 signal telemetry objects plotted over 5 years
- They see which signals went dark and when
- They click Download → 12-page PDF dossier
- They click Listen → Host A + Sabian audio insight generates, they download and listen
- They type a question → Sabian answers from the data in the terminal

That is the product. No prediction. No speculation. Legibility at scale.

---

## OPTIMUM FIRST STEP

**STEP 1: Run post_backfill_chain.cjs --all**

Every other step writes code that reads from convergence_scores. If those scores are stale, everything downstream is stale. This is a 30-minute data refresh that validates the entire foundation. Do it first, before writing any endpoints.

After chain completes: re-run stability_filter.cjs to get the definitive Test 4 result.
Then move to STEP 2 (Q&A API wiring) — highest buyer impact, lowest risk.

---

Generated: 2026-05-27
Status: STEP 1 in progress
