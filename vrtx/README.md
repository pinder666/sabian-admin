# VRTX — Human Performance Intelligence Engine

VRTX reads physiological signals from wearables, resolves what state the body is in, and delivers one clear morning briefing: what happened overnight, what the body is doing today, and what the highest-leverage action is right now.

Not a fitness tracker. Not a wellness assistant. Not a motivational tool. VRTX identifies the governing condition, explains the biology in plain language, and defines the move.

---

## BUILD STATUS — April 2026

### DONE

**Core engine pipeline — fully operational**
- Complete pipeline from biometric input → validated script → audio artifact
- Runs locally via `node vrtx/engine/vrtx_engine.cjs`
- Outputs to `output/vrtx/`: script, parsed lines, full run record JSON, audio MP3

**Dual-pathway dialogue system**
- Pathway A: Adenosine/short sleep — explains clearance debt and how it builds through the day
- Pathway B: Leverage/recovery — explains the surplus, how it was built, and how to protect it
- Pathway C: Autonomic stress — delays deployment, gives the nervous system time to come down first

**Five differentiated dialogue arcs**
Each governing condition (peak_window, recovery_window, partial_clearance_deficit, full_depletion, autonomic_stress) has its own Beat 10 structure, teaching angle, and biological mechanism. No two arcs produce the same output pattern.

**4-sentence coaching arc (Line 10)**
Covers the full day: morning (what to consume now) → lunch (what to eat) → 3pm (activity-calibrated habit) → evening/sleep (timing and food).
The afternoon beat is calibrated to yesterday's activity level — a desk worker gets a movement break, a physically active person gets a rest or hydration pause. Generated from the actual board state, not templates.

**Activity calibration**
`activityLoad` derived from yesterday's steps: very_low / light / moderate / high. Drives the afternoon coaching beat. Connected to `user_preferences.job_type` in Supabase schema.

**Isolated Line 10 regeneration**
When main generation fails on Line 10 violations after 2 attempts, a focused isolated pass fires for the specific pathway and activity level. Accepted first attempt in most scenarios.

**Validator — semantic enforcement**
Checks: no work commands in L10, no generic wellness advice, no food terms on leverage days, no calorie reasoning, adenosine exactly once (Line 6 only), coaching arc structure (4 sentences, 3 of 4 day-points covered), timing claims grounded. Correction messages fed to model on retry.

**Knowledge base retrieval**
TF-IDF retrieval from scientific corpus (Why We Sleep, The Circadian Code, Guyton & Hall). State-keyed — each governing condition pulls from relevant sources. Grounds mechanism explanations and biological reasons.

**Calibration system**
Persistent baseline in `calibration/baseline_schema.json`. Compares today's metrics against personal baseline. Progresses: early calibration → day 8–14 → calibrated. By day 14 shifts from reactive to predictive.

**Scene builder**
Before any prompt is assembled, converts the day into one governing frame: day_frame, main_problem, body_mechanism, stakes, winning_move. Model is given a forced operating frame and told to lead from it. Prevents generic multi-metric narration.

**Audio pipeline**
ElevenLabs TTS, dual-voice (Sabian + Host A), per-line segments merged by ffmpeg. Script completes independently of audio — if TTS fails, script and run record are still valid.

**20+ test scenarios + batch runner**
`vrtx/input/scenarios/` covers all governing conditions and pathway combinations. `vrtx/scripts/batch_run.cjs` runs all scenarios and writes output report.

**Front-end web app — built, not wired**
`vrtx-main/` at `C:\Users\user\Desktop\vrtx-main\`
- React + TypeScript + Vite + Tailwind + Supabase
- Auth (signup, login, password reset) fully wired to Supabase
- All 13 pages built: Index, Login, Signup, Onboarding (4 steps), Dashboard, Circle, Twin, Goals, Profile, Billing, Support, NotFound
- Supabase schema live: profiles, wearable_connections, circles, circle_members, user_preferences (includes job_type, sleep_schedule, subscription_plan)
- All dashboard data is currently mock — not connected to VRTX engine

---

### NOT YET BUILT

| What | Why it matters |
|---|---|
| Health Connect integration | This is how all wearables feed VRTX — Fitbit, Galaxy Watch, Garmin, everything goes through Health Connect on Android |
| Android bridge app | Health Connect is local to Android — a small Kotlin app reads it and pushes data to Supabase |
| Supabase `health_metrics` table | Stores incoming daily biometric data per user |
| Supabase `daily_insights` table | Stores generated insights, readiness score, audio URL per user |
| Supabase `receive-health-data` edge function | Receives POST from Android bridge, writes to `health_metrics` |
| VRTX HC connector | Reads from Supabase `health_metrics`, normalizes for the engine |
| Engine writes to Supabase | After each run, insight stored in `daily_insights`, audio in Supabase storage |
| VRTX deployment (Railway) | Engine needs a real server — can't run as a Supabase edge function (requires ffmpeg, Node.js) |
| Front end wired to real data | InsightCard, ReadinessRing, MetricCard all showing mock data right now |
| Push notifications | Alert when morning insight is ready |
| Calendar integration | External demand layer — Google Calendar OAuth, events feed scene builder |
| Multi-user calibration in Supabase | Baselines currently stored as local JSON, need to move per-user to database |

---

## IMMEDIATE NEXT BUILD QUEUE

These are the steps in order. Each one is a dependency for the next.

**Step 1 — User action (no code): Enable Fitbit → Health Connect on Android**
Open Fitbit Android app → Profile → App Settings → Health Connect → Enable: Sleep, Heart Rate, Heart Rate Variability, Resting Heart Rate, Steps, Oxygen Saturation, Respiratory Rate, Active Minutes. Do this for every VTA member who has an Android phone. Once enabled, Fitbit syncs to Health Connect automatically after each device sync.

**Step 2 — Supabase migration: Add `health_metrics` and `daily_insights` tables**
Two new tables in `vrtx-main/supabase/migrations/`. See `ROADMAP.md` for the exact SQL. RLS: users read own rows, service role writes. Both tables have `UNIQUE(user_id, date)` so each user has one row per day.

**Step 3 — Supabase edge function: `receive-health-data`**
Receives the Android POST. Validates the user. Upserts into `health_metrics`. Returns 200 on success. This is the entry point for all wearable data into the system.

**Step 4 — Android bridge app**
Minimal Kotlin app. No UI except a first-run permissions screen.
- Requests Health Connect permissions: sleep, HRV, resting HR, steps, SpO2, respiratory, active calories
- Registers a WorkManager job: runs daily at 6:00am
- Job reads yesterday's data from Health Connect, calculates activityLoad from steps, POSTs to Supabase edge function with user_id + session token
- Has a "Sync Now" button for manual testing
- User authenticates with their Supabase credentials on first launch (stored in EncryptedSharedPreferences)
- Sideload APK for testing — no Play Store needed

**Step 5 — VRTX HC connector: `vrtx/connectors/health_connect_pull.cjs`**
Reads from Supabase `health_metrics` for a given user_id and date. Transforms the row into the same shape the engine already expects (`fitbit_latest.json` format). Writes to `vrtx/input/hc_latest.json`. Engine picks it up. Requires: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

**Step 6 — Test the full chain**
Android app sends data → Supabase edge function receives it → `health_metrics` row created → HC connector reads it → Engine runs on that data → Script generated → Validate insight looks correct for the actual biometric values.

**Step 7 — Engine writes insights to Supabase**
After `contractParsedLines` produces the final script:
- Write to `daily_insights`: user_id, date, governing_condition, day_frame, pathway, readiness_score, script (JSON array), script_text
- After audio: update the row with audio_url (Supabase storage bucket `vrtx-audio/{user_id}/{date}.mp3`)
Requires `@supabase/supabase-js` in the engine.

**Step 8 — Deploy engine to Railway**
Dockerize the engine with Node.js + ffmpeg. Add a thin Express server (`vrtx/server.cjs`):
- `POST /run` — trigger insight generation for a user_id
- `GET /status` — health check
Daily trigger: Supabase scheduled edge function calls `POST /run` at 6:30am UTC for each active user.

**Step 9 — Wire front end to real data**
In order:
1. `InsightCard` reads `daily_insights` from Supabase (latest row for user)
2. Audio player reads `audio_url` from `daily_insights`
3. `ReadinessRing` reads `readiness_score` from `daily_insights`
4. `MetricCard` reads `health_metrics` for today (sleep, HRV, RHR, steps, SpO2)
5. `StepConnectWearable` updated to show HC setup instructions instead of generic "Connect device"
6. `api.ts` endpoints replaced with real Supabase queries or Railway server calls
7. `user_preferences.job_type` passed to engine on each run to calibrate coaching arc

**Step 10 — Multi-user and circles**
- Each VTA member has their own Android bridge session (user_id in app)
- Circle readiness comparison: `daily_insights.readiness_score` aggregated per circle
- Circle members can see each other's readiness score (not raw metrics) — RLS via `circle_members` join
- Weekly group VTA insight from aggregated governing conditions across the circle

---

## FULL PIPELINE — TARGET STATE

```
Wearable (Fitbit / Galaxy Watch / Garmin / any Android wearable)
  ↓ auto-sync
Android Health Connect (on user's phone)
  ↓ daily 6am
Android Bridge App (Kotlin, WorkManager)
  ↓ POST /functions/v1/receive-health-data
Supabase Edge Function
  ↓ upsert
Supabase: health_metrics table
  ↓ read
VRTX HC Connector (vrtx/connectors/health_connect_pull.cjs)
  ↓
vrtx/engine/vrtx_engine.cjs
  → vrtx_context_layer.cjs (normalize, behavior layer)
  → calibration/baseline_schema.json
  → logic/deterministic.cjs (deviations, state)
  → vrtx_calendar_adapter.cjs (external demand)
  → engine/scene_builder.cjs (governing frame)
  → prompts/vrtx_system_prompt.cjs (system message)
  → LLM (OpenRouter / Anthropic)
  → guardrails/validator.cjs
  → audio/audio_orchestrator.cjs
  ↓ write
Supabase: daily_insights table + vrtx-audio storage bucket
  ↓ read
vrtx-main (React web app)
  → InsightCard (script_text)
  → Audio player (audio_url)
  → ReadinessRing (readiness_score)
  → MetricCard (health_metrics row)
```

---

## CURRENT LIVE PIPELINE (what actually runs today)

```
node vrtx/connectors/fitbit_pull.cjs
  ↓ writes
vrtx/input/fitbit_latest.json
  ↓
node vrtx/engine/vrtx_engine.cjs
  ↓ writes
output/vrtx/vrtx_run_*.json
output/vrtx/vrtx_script_*.txt
output/vrtx/*.mp3
```

No Supabase. No front end. No Android. Engine runs locally from a local JSON file.

---

## RUN COMMANDS (current)

From project root (`sabian_core/`):

```bash
# Pull live Fitbit data
node .\vrtx\connectors\fitbit_pull.cjs

# Run the engine
node .\vrtx\engine\vrtx_engine.cjs
```

**Development flags — use these to avoid spending credits:**

```bash
# Skip ElevenLabs TTS — script still writes, no audio spend
SKIP_AUDIO=1 node .\vrtx\engine\vrtx_engine.cjs

# Replay a previous run — skip LLM call entirely, test post-generation logic only
SKIP_AUDIO=1 REPLAY_RUN=20260425_112524 node .\vrtx\engine\vrtx_engine.cjs

# Run all test scenarios
node .\vrtx\scripts\batch_run.cjs
```

**Standard development loop:**
```bash
# 1. Test logic changes — no spend at all
SKIP_AUDIO=1 REPLAY_RUN=<last_timestamp> node .\vrtx\engine\vrtx_engine.cjs

# 2. Verify with a live generation — no audio spend
SKIP_AUDIO=1 node .\vrtx\engine\vrtx_engine.cjs

# 3. Full production run when confirmed clean
node .\vrtx\engine\vrtx_engine.cjs
```

---

## ENVIRONMENT VARIABLES

All in `sabian_core/.env`:

**Generation (required now):**
`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `ANTHROPIC_API_KEY`
`ELEVENLABS_API_KEY`, `SABIAN_VOICE_ID`, `HOST_A_US_ID`, `ELEVENLABS_MODEL_ID`

**Fitbit (current data source, single user):**
`FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, `FITBIT_REDIRECT_URI`, `FITBIT_TOKEN_URI`
`FITBIT_ACCESS_TOKEN`, `FITBIT_REFRESH_TOKEN`

**VTA members (multi-user Fitbit pull):**
`FITBIT_TOKEN_JASON`, `FITBIT_TOKEN_SHELLY`, `FITBIT_TOKEN_JUS`, `FITBIT_TOKEN_UNI`

**Supabase (add when Phase 2 starts):**
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

Do not rename these. Connectors, engine, and audio system all depend on exact names.

---

## ACTIVE FILES

| File | Role |
|---|---|
| `connectors/fitbit_pull.cjs` | Live Fitbit ingestion (current source) |
| `connectors/health_connect_pull.cjs` | HC ingestion via Supabase — TO BUILD |
| `input/fitbit_latest.json` | Connector → engine handoff artifact |
| `data/vrtx_context_layer.cjs` | Normalization, behavior layer, yesterday layer |
| `calibration/baseline_schema.json` | Persisted user baseline |
| `calibration/calibration_state.json` | Calibration progression state |
| `logic/deterministic.cjs` | Deviation computation, state classification |
| `data/vrtx_calendar_adapter.cjs` | External demand normalization |
| `engine/scene_builder.cjs` | Governing frame before prompt |
| `engine/vrtx_engine.cjs` | Central coordinator |
| `prompts/vrtx_system_prompt.cjs` | Sabian/Host A behavior contract |
| `guardrails/validator.cjs` | Structural + semantic enforcement |
| `audio/audio_orchestrator.cjs` | TTS rendering |
| `knowledge/vrtx_retrieval.cjs` | Scientific corpus retrieval (TF-IDF) |
| `scripts/batch_run.cjs` | Multi-scenario test runner |

---

## STRICT RULES — THESE DO NOT CHANGE

- **Steps are never a same-day driver.** Steps are carryover only.
- **No calorie-based reasoning** in output.
- **No raw metric narration without interpretation.** Always resolve the governing condition first.
- **One clear highest-leverage action.** Never multiple equal recommendations.
- **Calendar is a modifier, not a governor.** Calendar without biological support = constraint. Calendar with biological support = leverage.
- **Coaching arc is generated from the board state, not templates.** Specific foods, supplements, and mechanisms must come from the actual metrics, not example text.
- **Activity calibration is required.** Afternoon beat must reflect what the person actually did yesterday.
- **Zero Deletion Policy.** Deprecated components are bypassed, not removed.

---

## DEBUGGING

When a run produces unexpected output — read `output/vrtx/vrtx_run_*.json` first. It contains every input and intermediate structure used for that run: fitbit payload, baseline values, deviations, state classification, flags, scene object, parsed dialogue.

If output is generic or repetitive: check `fitbit_latest.json` for stale data, then check the scene object in the run record to confirm the governing frame resolved correctly.

---

## FULL ROADMAP

See `ROADMAP.md` in this directory for the detailed phase-by-phase build plan with exact table schemas, edge function specs, Android app requirements, deployment steps, and front-end wiring order.
