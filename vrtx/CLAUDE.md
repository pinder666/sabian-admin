# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What VRTX Is

VRTX is a behavior interpretation and optimization engine powered by Sabian intelligence.

VRTX is not a tracking system.
VRTX is not a coaching system.
VRTX is not a wellness assistant.

VRTX reads physiological and behavioral signals from wearable ecosystems, interprets them, and produces a single daily morning briefing that tells the wearable user what happened, what state they woke up in, and what the highest leverage action is right now.

Every session and every edit must align with this identity.

---

## Core Daily Output Model

VRTX runs once per morning and does four things in one pass:

1. **Yesterday as completed outcome** — movement, activity, behavioral carryover into today. Never treated as a current-day metric.
2. **Overnight recovery as current state** — sleep, HRV, resting heart rate, SpO2, sleep consistency. Defines current capacity.
3. **Today demand as external load** — calendar structure, meeting load, recovery windows, fragmentation risk.
4. **Highest leverage move** — one specific, immediate action grounded in wearable metrics.

The daily insight must answer: *"Given the current state, what is the highest leverage action right now to optimize the day and win?"*

---

## Strict Rules

- **Steps are never a same-day driver.** Steps only influence carryover into today.
- **No calorie-based reasoning anywhere** unless explicitly approved in writing for hidden internal use.
- No raw metric narration without interpretation.
- Always identify the governing condition before producing output.
- Always produce one clear highest leverage action — never multiple equal recommendations.
- Never output vague wellness advice. Never sound like guessing.

---

## Run Commands

From the project root (`sabian_core/`):

```bash
# Step 1 — pull live Fitbit data
node .\vrtx\connectors\fitbit_pull.cjs

# Step 2 — run the engine
node .\vrtx\engine\vrtx_engine.cjs
```

Output artifacts are written to `output/vrtx/`. The run record JSON (`vrtx_run_*.json`) captures all inputs and intermediate structures used for that run — use it first when debugging.

For multi-user Fitbit pull:
```bash
node .\vrtx\connectors\fitbit_pull_all.cjs
```

---

## Pipeline Architecture

The current live pipeline runs in this exact order. Do not break or reorder it without explicit instruction.

```
Fitbit connector
→ vrtx/input/fitbit_latest.json               (handoff artifact)
→ vrtx_engine.cjs: Fitbit payload mapping
→ vrtx_context_layer.cjs: normalizeHealthConnectPayload()
→ vrtx_engine.cjs: buildYesterdayWindow()     (steps, movement — completed outcome)
→ vrtx_engine.cjs: buildOvernightWindow()     (sleep/HRV/RHR/SpO2 — current capacity)
→ vrtx_context_layer.cjs: buildYesterdayLayer()
→ calibration/baseline_schema.json            (personalized baseline reference)
→ vrtx_context_layer.cjs: buildBehaviorLayer()
→ vrtx/logic/deterministic.cjs: computeDeviations(), classifyState(), selectRules()
→ vrtx_calendar_adapter.cjs                   (external demand — modifier, not governor)
→ vrtx_scene_builder.cjs: buildVrtxScene()    (one governing frame before prompt)
→ vrtx_engine.cjs: buildUserPrompt()          (SCENE first, then EVIDENCE)
→ vrtx_system_prompt.cjs                      (Sabian/Host A behavior contract)
→ OpenRouter (LLM generation)
→ vrtx/guardrails/validator.cjs
→ vrtx/audio/audio_orchestrator.cjs
→ output/vrtx/
```

**Order of interpretation:**
Baseline defines normal → today defines deviation → behavior layer defines pattern → deterministic layer defines state → calendar defines external pressure → scene builder selects the governing frame → Output is resolved → script explains Output.

---

## Active Files

These files define the current runtime:

| File | Role |
|---|---|
| `connectors/fitbit_pull.cjs` | Live Fitbit ingestion |
| `input/fitbit_latest.json` | Connector → engine handoff |
| `data/vrtx_context_layer.cjs` | Normalization, behavior layer, yesterday layer |
| `calibration/baseline_schema.json` | Persisted user baseline |
| `calibration/calibration_state.json` | Calibration progression state |
| `logic/deterministic.cjs` | Rule-based deviation and state classification |
| `data/vrtx_calendar_adapter.cjs` | External demand normalization |
| `engine/scene_builder.cjs` | Governs the day frame before prompt |
| `engine/vrtx_engine.cjs` | Central coordinator |
| `prompts/vrtx_system_prompt.cjs` | Sabian/Host A behavior contract |
| `guardrails/validator.cjs` | Structural enforcement on dialogue |
| `audio/audio_orchestrator.cjs` | TTS rendering (final stage) |

`engine/vrtx_prompt_builder.cjs` exists but live prompt assembly is currently inside `vrtx_engine.cjs`. When debugging why Sabian said something, inspect `vrtx_engine.cjs`, `scene_builder.cjs`, and `vrtx_system_prompt.cjs` first.

---

## Key Architectural Facts

**Two time windows exist in the engine:**
- `yesterdayWindow` — steps and movement minutes. Carryover only. Steps must never be treated as a current-day signal.
- `overnightWindow` — sleep, HRV, RHR, SpO2, respiratory, sleep consistency. Current capacity.

**Scene builder is the governing frame layer.**
`buildVrtxScene()` transforms the day into one scene object (`day_frame`, `main_problem`, `body_mechanism`, `stakes`, `winning_move`, `carryover`, `overnight_window`) before any prompt is assembled. The user prompt opens with SCENE, then EVIDENCE. The model must lead from the scene.

**System prompt is sent once as the system message.**
It is not duplicated in the user message. The user message starts directly with `SCENE:`.

**Calendar is external demand, not a biological signal.**
It is a modifier layer. Calendar pressure without biological support creates constraint. Calendar pressure with biological support creates leverage. Calendar must never govern Output.

**Calibration is not a separate system.**
It is the early stage of the same system. VRTX helps from day 1 while accuracy improves. By day 14, interpretation should shift from reactive toward predictive.

**`normalizeHealthConnectPayload()` is source-agnostic.**
Despite the name, it is the general normalization layer. Fitbit is the current primary source. Health Connect is the next intended source. Both feed the same downstream pipeline.

**Zero Deletion Policy.**
Do not remove existing logic without documentation. Deprecated components should be bypassed, not erased.

---

## PDF Knowledge Base

`vrtx/knowledge/` contains the scientific corpus (physiology, sleep science, metabolism, hydration, electrolytes, nutrition).

The knowledge layer is a core reasoning layer — not decoration. Its purpose is to make the daily highest leverage action smarter, sharper, and more biologically grounded. Sabian must teach from retrieved knowledge, not quote it.

To rebuild chunks: `python vrtx/knowledge/build_chunks.py`

---

## Environment Variables

Required in `sabian_core/.env`:

**Generation:** `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `ELEVENLABS_API_KEY`, `SABIAN_VOICE_ID`, `HOST_A_US_ID`, `ELEVENLABS_MODEL_ID`

**Fitbit:** `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, `FITBIT_REDIRECT_URI`, `FITBIT_TOKEN_URI`, `FITBIT_ACCESS_TOKEN`

**VTA members:** `FITBIT_TOKEN_JASON`, `FITBIT_TOKEN_SHELLY`, `FITBIT_TOKEN_JUS`, `FITBIT_TOKEN_UNI`

Do not rename these variables. The connector, engine, and audio system depend on them.

---

## VTA Network

A VTA (Ventral Tegmental Area) is a synchronized group of five individuals. Members maintain individual biometric streams and personal Sabian insights. The system can also generate group-level VTA insights from derived signals — never from raw mixed biometric data.

Current founding VTA: Jason, Shelly, Jus, Uni. Member definitions: `input/vta/vta_members.json`. Uni connects via Health Connect when available.

---

## Development Policy

- Do not rewrite architecture unless explicitly instructed. Extend it.
- All edits must align with the Core Daily Output Model and Strict Rules above.
- VRTX code stays inside `vrtx/` unless explicitly moved.
- The script path is the primary source of truth. Audio is downstream.
- If output is generic or repetitive, check `fitbit_latest.json` for stale data and check the scene object in the run record to confirm the governing frame was resolved correctly.
- When debugging a run, read `output/vrtx/vrtx_run_*.json` first — it contains all inputs and intermediate structures.
