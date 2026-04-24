# VRTX — Insight Engine (Powered by Sabian Technology)

VRTX is a synchronized human performance network powered by Sabian intelligence.

This repository contains the VRTX Insight Engine, a daily biometric interpretation system that converts wearable data into a structured two-voice operational reading. The engine does not exist to display dashboards, count calories, or behave like a wellness assistant. Its purpose is to take physiological signals, compare them against pattern and baseline context, and produce a clear daily reading that tells the user what their body is saying, what governs the day, and how the day should be approached.

The system produces a structured conversation between two voices.

Host A is the interrogator.
Sabian is the analytical intelligence.

The conversation is converted into dual-voice audio and delivered as a daily insight when the audio layer is operating correctly. The script path itself is now a primary source of truth and can complete even when downstream audio generation is not fully operational.

VRTX is not a fitness app.
VRTX is not a wellness coaching system.
VRTX is not a motivational tool.
VRTX is a Human Performance Optimization System designed to translate physiology into clear daily operational guidance.

This document describes the system exactly as it exists now, including the files that were added and updated during the current build phase. It is written so that a future GPT, Claude Code session, or developer can enter the repository and understand the current architecture without guessing, inventing parallel systems, or treating planned infrastructure as if it is already live.

## Project Location

The VRTX system lives inside the Sabian Core repository.

Working development directory:

`C:\Users\user\Desktop\sabian.ai\sabian_core`

VRTX engine root:

`C:\Users\user\Desktop\sabian.ai\sabian_core\vrtx`

All VRTX-specific runtime work is intended to remain inside the `vrtx/` directory. This follows the existing Zero Deletion Policy and keeps VRTX isolated from other Sabian infrastructure. Future GPTs or developers should treat `vrtx/` as the active runtime boundary.

## System Overview

The VRTX engine currently performs the following end-to-end flow.

It first acquires real biometric data from Fitbit through the Fitbit Web API. That raw Fitbit payload is stored locally inside the VRTX input layer. The engine then reads that file, converts Fitbit's API structure into the internal VRTX health context schema, and builds a first-layer behavioral interpretation object on top of the raw metrics. After that, the deterministic logic layer computes deviations, state, and flags. The engine then assembles a generation payload for Sabian, sends it to OpenRouter, validates the result, retries if necessary, and finally attempts to convert the final dialogue into dual-voice audio.

The result of a successful run is not just a script. A successful run produces a cluster of artifacts, including the generated script, parsed dialogue lines, and a run record JSON that contains the exact inputs and intermediate structures used to generate the insight. When the audio layer is functioning correctly, it also produces individual audio segments and a merged audio file. When audio fails, the engine still completes the script path and writes the script and run artifacts.

The current live data path is:

Fitbit Device
→ Fitbit Account / Fitbit Cloud
→ Fitbit Web API
→ `vrtx/connectors/fitbit_pull.cjs`
→ `vrtx/input/fitbit_latest.json`
→ `vrtx/engine/vrtx_engine.cjs`
→ `vrtx/data/vrtx_context_layer.cjs`
→ `vrtx/logic/deterministic.cjs`
→ `vrtx/engine/vrtx_scene_builder.cjs`
→ `vrtx/prompts/vrtx_system_prompt.cjs`
→ `vrtx/guardrails/validator.cjs`
→ `vrtx/audio/audio_orchestrator.cjs`
→ `output/vrtx/`

This is the important architectural shift that happened in the current phase of work. Earlier versions of the engine used baked-in demo metrics inside `vrtx_engine.cjs`. That is no longer the intended operating model. The engine is now structured to consume real Fitbit data pulled into `vrtx/input/fitbit_latest.json`, and the key new layers added in this phase are the behavior/context layer, the calibration layer, the scene layer, and the calendar normalization layer that sits beside the biometric interpretation path.

## Core Concept

VRTX operates as a two-voice analytical conversation.

Host A is not a passive narrator. Host A exists to challenge weak reasoning, demand proof, stop abstraction, and force Sabian to stay grounded in actual signal. Sabian is not a chatbot and not a generic coach. Sabian interprets the numbers, explains the mechanism in plain language, defines the day, and gives operational directives.

The interaction is designed to feel like a structured reading between two intelligent actors rather than a dashboard summary or wellness script. The target feel is not motivational content. The target feel is a controlled exchange where the user hears the truth of the day translated from wearable data into understandable human terms.

The system is moving away from isolated single-metric narration and toward structured state resolution. That means the engine is no longer limited to reading isolated daily metrics in a vacuum. It now has the ability to construct a first-pass interpretation of rhythm, sleep debt, recovery pressure, stimulation patterns, baseline relationship, schedule pressure, and operating constraint before the LLM generates the conversation.

## Project Directory Structure

The current VRTX structure, including the files relevant to the latest build phase, is as follows:

```text
sabian_core
│
├── .env
├── output
│   └── vrtx
│       ├── attempt_*.txt
│       ├── attempt_*_errors_*.json
│       ├── vrtx_script_*.txt
│       ├── vrtx_lines_*.json
│       ├── vrtx_parsed_lines_*.txt
│       ├── vrtx_run_*.json
│       ├── seg_000_*.mp3
│       ├── seg_001_*.mp3
│       └── ... merged audio artifacts
│
└── vrtx
    │
    ├── engine
    │   ├── vrtx_engine.cjs
    │   ├── vrtx_prompt_builder.cjs
    │   ├── vrtx_scene_builder.cjs
    │   └── backups/
    │
    ├── prompts
    │   ├── vrtx_system_prompt.cjs
    │   └── backups/
    │
    ├── templates
    │   └── vrtx_duologue_template.json
    │
    ├── data
    │   ├── vrtx_profile_adapter.cjs
    │   ├── vrtx_evidence_adapter.cjs
    │   ├── vrtx_context_layer.cjs
    │   └── vrtx_calendar_adapter.cjs
    │
    ├── calibration
    │   ├── calibration_state.json
    │   └── baseline_schema.json
    │
    ├── connectors
    │   ├── fitbit_pull.cjs
    │   └── fitbit_pull_all.cjs
    │
    ├── input
    │   ├── fitbit_latest.json
    │   ├── calendar
    │   │   ├── calendar_latest.json
    │   │   └── calendar_normalized.json
    │   └── vta
    │       ├── vta_members.json
    │       ├── jason.json
    │       ├── shelly.json
    │       ├── jus.json
    │       └── uni.json
    │
    ├── knowledge
    │   ├── vrtx_retrieval.cjs
    │   ├── build_chunks.py
    │   ├── chunks/
    │   └── pdfs/
    │
    ├── guardrails
    │   └── validator.cjs
    │
    ├── audio
    │   └── audio_orchestrator.cjs
    │
    └── logic
        └── deterministic.cjs
```

The files that matter most in the current phase are vrtx_engine.cjs, vrtx_system_prompt.cjs, vrtx_context_layer.cjs, vrtx_scene_builder.cjs, fitbit_pull.cjs, baseline_schema.json, fitbit_latest.json, and vrtx_calendar_adapter.cjs. Those files define the current real-data insight path.

## What Changed in the Current Build Phase

The most important change in this session was the transition away from hardcoded demo data toward real biometric ingestion. The system was previously producing repetitive and generic outputs partly because the engine was still reading fixed example metrics. That has now been replaced by a live Fitbit ingestion path.

The second major change was the creation of the behavior/context layer. This new layer gives VRTX a structured interpretation object that exists before Sabian speaks. Instead of relying only on raw numbers like sleep minutes, HRV, resting heart rate, and steps, the engine now derives context such as sleep debt, rhythm stability, recovery pressure, and stimulation pattern risk.

The third major change was the system prompt overhaul. The prompt was rewritten so that Sabian and Host A behave more like a disciplined performance dialogue and less like a vague health summary. The prompt now explicitly expects Sabian to interpret behavior layer signals when present and instructs the system not to rely on HRV if HRV is not actually available.

The fourth major change was the introduction of the Fitbit connector and .env-driven OAuth setup so that VRTX can pull live Fitbit data into the repository.

The fifth major change was the introduction of calibration and baseline persistence so that daily interpretation can progressively move away from generic assumptions and toward individualized baseline-relative interpretation.

The sixth major change was the addition of the scene builder, which transforms the day into a single operational frame before prompt generation so the system stops collapsing into generic multi-metric commentary.

The seventh major change was the addition of the calendar normalization layer so that external demand can be represented structurally rather than left implicit.

These are the core shifts another GPT or developer needs to understand before making future changes.

## Engine

File:

`vrtx/engine/vrtx_engine.cjs`

This file is the central coordinator of the entire VRTX runtime. It is the one file that ties together the prompt, deterministic logic, behavior layer, baseline comparison, scene construction, validation, knowledge retrieval, calendar context, and audio generation.

In its current form, the engine reads from:

`vrtx/input/fitbit_latest.json`

That file is assumed to contain the most recent Fitbit payload generated by the connector. The engine no longer needs demo metrics embedded in the file. Instead, it reads the Fitbit payload, extracts the relevant user and biometrics, converts the Fitbit structure into a VRTX-compatible health payload, then passes that standardized object into the context layer.

The engine currently performs these steps in order:

It loads environment variables, validates that required keys are present, and confirms that the Fitbit input file exists. It reads the Fitbit JSON, constructs a simplified user object, converts Fitbit's sleep, activity, oxygen, respiratory, and heart-rate data into the internal health payload, and builds a history array placeholder from baseline context. It then calls normalizeHealthConnectPayload() and buildBehaviorLayer() from vrtx_context_layer.cjs. After that it computes today metrics, baseline values, deviations, flags, state, rules, and prompt signals. It then packages all of that into the LLM prompt payload, sends the prompt to OpenRouter, validates the returned dialogue using validator.cjs, retries if necessary, passes the validated lines to audio_orchestrator.cjs, and finally writes the full run record into output/vrtx/.

The engine is also the file where current source routing is defined. In the present build, the source of truth for the daily run is:

`FITBIT_INPUT_PATH = vrtx/input/fitbit_latest.json`

That is the operational handoff point between the Fitbit connector and the Sabian generation pipeline.

## Prompt Builder

File:

`vrtx/engine/vrtx_prompt_builder.cjs`

This file remains part of the VRTX engine structure and conceptually represents the layer that should construct final model-ready inputs from internal VRTX structures. In the current runtime path, the logic that assembles the actual user prompt payload is still contained directly inside vrtx_engine.cjs, particularly inside the buildUserPrompt() function and related prompt-signal preparation.

That means the current system is partially consolidated in the engine rather than fully delegated to vrtx_prompt_builder.cjs. A future refactor may move more of the prompt assembly back into the dedicated prompt-builder file, but for the current system another GPT should assume that the most important live prompt construction logic is inside vrtx_engine.cjs.

In practical terms, if a future agent is trying to understand why Sabian is saying something on a given day, the first files to inspect are vrtx_engine.cjs, vrtx_scene_builder.cjs, and vrtx_system_prompt.cjs, not only vrtx_prompt_builder.cjs.

## System Prompt

File:

`vrtx/prompts/vrtx_system_prompt.cjs`

This file defines the behavior of the Sabian/Host A dialogue. It is one of the most important files in the system because it controls not just format but tone, role discipline, and reasoning expectations.

During the current build phase this prompt was substantially updated. The prompt now explicitly describes Sabian as the VRTX Insight Engine, defines the dialogue as a two-voice operational conversation, and sets the expectation that Sabian should reason from deviations, behavior layer signals, normalized health context, calendar-aware context when present, scene context, and prompt signals. The prompt also makes clear that Sabian must not behave like a generic wellness assistant.

The prompt was updated specifically to counter prior problems where the output had become abstract, repetitive, and too dependent on canned example language. The new version pushes Host A to challenge weak reasoning and forces Sabian to interpret the day in terms of pattern, consequence, and action. It also includes explicit logic saying that if behavior_layer is present, Sabian should use it, and if HRV is null or absent, Sabian should not default back to HRV language.

This file now reflects the newer VRTX doctrine more accurately than earlier versions because it is aware of the behavior/context layer, the scene layer, the metric board, and the larger range of signals beyond just sleep, HRV, resting heart rate, and steps.

## Dialogue Template

File:

`vrtx/templates/vrtx_duologue_template.json`

This file remains the structural concept layer for the VRTX two-voice reading. It defines the staged nature of the Host A / Sabian exchange and exists to preserve the duologue format as a system artifact rather than just a prompt convention.

In the current live system, the prompt and validator are doing most of the strict enforcement of turn structure, but this template still belongs to the overall architecture and should be treated as part of the system's conversation design layer.

Future work can choose to make the engine use this file more directly again if the duologue becomes more templated or more dynamic, but for now it sits alongside the prompt as a design anchor.

## Evidence Adapter

File:

`vrtx/data/vrtx_evidence_adapter.cjs`

This file remains part of the original design and concept of VRTX, where raw biometric data is converted into evidence objects for Sabian. In the current build phase, however, the most critical live data transformation is happening in the context layer, in the Fitbit-to-raw-health-payload mapping inside vrtx_engine.cjs, and in the scene builder.

That means a future GPT should understand the evidence adapter as part of the broader architecture, but should not assume it is the dominant live transformer in the current runtime. The more important active path right now is:

Fitbit payload
→ internal raw health payload
→ normalization layer
→ baseline comparison
→ behavior layer
→ deviations
→ scene construction
→ prompt evidence

This does not make the evidence adapter obsolete. It means the live runtime currently uses the new context path as the immediate source of daily interpretation.

## Profile Adapter

File:

`vrtx/data/vrtx_profile_adapter.cjs`

This file exists to normalize user-specific context such as behavioral modifiers, meal patterns, caffeine habits, training intent, and other personal conditions that might change how metrics should be interpreted.

In the present build, user profile usage inside the engine is still limited. The current user object is constructed from the Fitbit profile name plus a simple VRTX profile object. The system has not yet fully expanded profile adaptation into a richer persistent user profile memory, but the file remains part of the VRTX architecture and future work can deepen its role.

A future GPT should understand that profile adaptation is conceptually important, but the most active personalization layer currently implemented is the combined baseline, behavior/context, and scene path, not a fully expanded profile adapter.

## New Context Layer

File:

`vrtx/data/vrtx_context_layer.cjs`

This file was created during the current build phase and is one of the most important additions to the VRTX system.

It contains two critical functions:

`normalizeHealthConnectPayload()`
`buildBehaviorLayer()`

Despite the function name normalizeHealthConnectPayload(), the file is not limited to Health Connect. The normalization logic is deliberately flexible so that mixed biometric payloads from different sources can be converted into a stable VRTX day object. Fitbit is currently the first real source being passed through this layer, and Health Connect is now being connected as the next major source path.

The normalization function takes raw wearable-style inputs and transforms them into the standardized VRTX shape. That standardized shape contains sections such as sleep, recovery, activity, body, and nutrition. This is important because it means the downstream engine no longer has to think in Fitbit field names or future Health Connect field names. It only has to think in VRTX schema.

The second function, buildBehaviorLayer(), constructs the first behavioral interpretation object from normalized daily data and history. It computes rolling baseline references where history exists and derives context-level signals such as sleep debt, HRV delta, resting heart rate delta, circadian stability, recovery pressure, stimulation pattern score, and load adaptation ratio. It also generates summary-level interpretations such as dominantDriver, dominantRisk, and operating profile markers like likely recovery state and rhythm state.

This is the first real step toward VRTX learning the user over time. The behavior layer does not yet represent the final long-term intelligence system, but it is the first stable internal object whose purpose is to translate daily biometrics into human pattern language before the LLM ever sees the data.

Any future GPT working on VRTX should treat this file as a foundational part of the current architecture.

## Calibration and Baseline Layer

VRTX includes an active calibration system.

This is not a planned concept. It is already part of the build.

The purpose of calibration is to establish an individualized baseline before the engine treats daily deviations as meaningful. VRTX does not rely on generic population assumptions when calibration data is available. It records daily biometric patterns, builds rolling baseline values, and transitions the user from early calibration into a calibrated state.

### Current Calibration Status

The calibration layer is implemented as a real subsystem inside VRTX.

It currently reads from the latest biometric input, updates persistent calibration state, and writes user-specific baseline values to disk.

Current calibration artifacts:

`vrtx/calibration/calibration_state.json`
`vrtx/calibration/baseline_schema.json`

The calibration system currently processes:

- sleep minutes
- steps
- active minutes
- resting heart rate
- HRV
- oxygen
- respiratory rate
- bedtime
- wake time
- sleep consistency

The calibration logic advances the user through staged status states and marks the system as calibrated once sufficient evidence has been collected.

### Current Calibration Logic

The current calibration flow uses the latest Fitbit payload as its input source and updates baseline values incrementally.

Live calibration path:

`vrtx/input/fitbit_latest.json`
→ calibration metric extraction
→ baseline averaging
→ sleep timing baseline update
→ sleep consistency scoring
→ calibration state progression
→ persisted baseline files

The calibration system currently uses a staged progression model:

- early calibration
- day 8 to 14 calibration phase
- calibrated

Once the calibration threshold is reached, the system marks:

`baseline_established = true`
`status = calibrated`

This allows downstream VRTX interpretation to compare new daily inputs against personal baseline rather than only against fixed logic.

### Sleep Consistency

VRTX includes a sleep consistency signal as part of the baseline layer.

It derives consistency from drift in bedtime and wake time relative to the user's baseline timing.

This gives the engine a structured rhythm signal rather than treating sleep only as duration.

Sleep consistency is part of the calibration layer because rhythm stability is a foundational operating variable for VRTX insight quality.

### Why Calibration Matters

Calibration is the system's transition from raw signal collection to personalized interpretation.

Before calibration is established, VRTX can still generate outputs, but those outputs should be understood as operating with partial personalization.

After calibration is established, the system can interpret recovery, strain, instability, and behavioral deviation relative to the user's own history. This is a critical architectural layer because it reduces generic output drift and improves the precision of daily directives.

### Relationship to the Insight Engine

Calibration does not replace the existing VRTX interpretation flow.

It strengthens it.

The current architecture should be understood as:

source ingestion
→ normalized health object
→ calibration and baseline reference
→ behavior layer
→ deterministic classification
→ calendar normalization
→ scene construction
→ output resolution
→ prompt generation
→ validation
→ audio output

This means VRTX is moving toward a system where the daily insight is shaped not only by today's raw metrics, but by baseline history, derived behavior signals, calendar pressure, and a forced operating frame.

## Calendar Layer

Files:

`vrtx/data/vrtx_calendar_adapter.cjs`
`vrtx/input/calendar/calendar_latest.json`
`vrtx/input/calendar/calendar_normalized.json`

VRTX now includes a calendar interpretation layer.

Calendar is not a future concept.
It exists as a real subsystem.

The calendar layer converts raw schedule data into structured context signals such as:

- schedule pressure
- day shape
- deep work blocks
- fragmentation
- travel load
- social load
- recovery windows
- workout presence

Calendar is not a primary biological signal.

Calendar represents external demand.

It must always be interpreted relative to biological capacity.

Calendar pressure without biological support creates constraint.
Calendar pressure with biological support creates leverage.

The engine must never treat calendar as equal to the primary biometric signals.
It is a modifier layer, not the governing layer.

At the current stage, calendar normalization exists and produces structured context. Full weighting of calendar pressure against Output is part of the active architecture direction and should be treated as partially integrated rather than ignored or treated as complete OS behavior.

## Metric System

VRTX operates on six primary biological signals and one resolved output layer.

Primary signals:

- Sleep
- HRV
- Resting Heart Rate
- Steps
- Oxygen / Respiratory
- Sleep Consistency

Seventh layer:

- Output

Output is not a metric.

Output is the resolved system state derived from:

- baseline
- deviation
- interaction between signals
- behavioral context
- calendar pressure

This is critical:

VRTX does not generate insight from raw metrics alone.

VRTX must first resolve:

What state is the system in?

Only after Output is determined can the script be generated.

The script must always be an explanation of Output.

Not a narration of inputs.

If Output is unclear, the system must default to uncertainty rather than inventing clarity.

## Fitbit Connector

File:

`vrtx/connectors/fitbit_pull.cjs`

This file was added during the current build phase to make VRTX consume real data instead of baked-in demo values.

The connector loads FITBIT_ACCESS_TOKEN from .env, calls the Fitbit Web API, and writes the returned payload to:

`vrtx/input/fitbit_latest.json`

The connector currently pulls multiple Fitbit endpoints in parallel, including the user profile, sleep data, activity summary, heart-rate summary, and intraday heart-rate data. It then packages those responses into a single JSON object with metadata such as pulled_at, source, and date.

This file is the live bridge between Fitbit and VRTX. If VRTX is using real Fitbit data, it is because fitbit_pull.cjs has already run successfully and written the latest payload into the input directory.

This also means the daily engine run should conceptually be preceded by a Fitbit pull. If the user wants the most current insight, the connector should be run first, then the engine.

## Health Connect Integration

Health Connect is now part of the active VRTX build direction.

It is not yet the dominant live runtime source, but it is being connected intentionally and the architecture is already being shaped to support it.

The current normalization path was designed so that Fitbit is the first live source and Health Connect can become the next source without requiring a second incompatible interpretation engine.

The intended source model is:

Fitbit
→ normalization path
→ VRTX schema

Health Connect
→ normalization path
→ VRTX schema

This means future Health Connect ingestion should feed the same downstream architecture:

- baseline
- behavior layer
- deterministic logic
- scene builder
- output resolution
- prompt path

The system should not fork into separate Fitbit logic and Health Connect logic once data reaches the VRTX schema.

Health Connect should be treated as the next major source integration layer, not as a separate product.

This is especially important for users and VTA members whose devices do not flow through Fitbit. In the current architecture, Health Connect is the intended path for expanding multi-device coverage while preserving one shared VRTX interpretation pipeline.

## Input Layer

Directory:

`vrtx/input/`

Key files:

`vrtx/input/fitbit_latest.json`
`vrtx/input/calendar/calendar_latest.json`
`vrtx/input/calendar/calendar_normalized.json`

fitbit_latest.json is the current live biometric input artifact for the VRTX engine.

It stores the raw Fitbit API data bundle that was pulled by fitbit_pull.cjs. The engine reads from this file directly and translates it into the VRTX internal payload. This file is therefore not just a cache; it is the current handoff artifact between connector and engine.

If the engine is producing stale or repetitive insights, one of the first things to check is whether fitbit_latest.json has actually been refreshed and whether the newest pull contains meaningful variation in the biometric data.

A future GPT should inspect this file whenever it needs to verify what the engine actually consumed in a given run.

The calendar input artifacts should also be treated as real context sources. They are not yet equivalent to biometric source truth, but they are now part of the active runtime context architecture.

## Knowledge Engine

Directory:

`vrtx/knowledge`

Files:

`vrtx/knowledge/vrtx_retrieval.cjs`
`vrtx/knowledge/build_chunks.py`
`vrtx/knowledge/chunks/`
`vrtx/knowledge/pdfs/`

The VRTX system includes a retrieval-based knowledge layer intended to provide scientific and physiological reference material for insight generation. The corpus includes materials covering physiology, metabolism, sleep science, hydration, electrolytes, and related topics.

The conceptual purpose of this layer is to give Sabian access to structured scientific explanation rather than forcing the model to invent all biological reasoning from general model memory. The knowledge layer contains PDF source material, chunked JSONL output, and a retrieval script.

In the current build phase, the most actively changed files were the engine, prompt, context layer, calibration layer, scene layer, calendar layer, and Fitbit connector. The knowledge layer was not the main focus of this phase, but it remains part of the designed VRTX architecture and should be considered active support infrastructure for explanation quality.

### Knowledge Corpus

The current corpus is intended to include physiology, metabolism, sleep science, hydration, electrolyte science, and related performance material. The chunks directory stores processed segments in JSONL-like structures so that relevant text can be retrieved without sending entire documents to the model.

A future GPT extending VRTX scientific depth should inspect:

`vrtx/knowledge/pdfs/`
`vrtx/knowledge/chunks/`
`vrtx/knowledge/vrtx_retrieval.cjs`

and determine how tightly that retrieval should be reintroduced or expanded inside the live prompt path.

## Guardrails

File:

`vrtx/guardrails/validator.cjs`

The validator enforces structure on generated dialogue. It is the file that checks whether the LLM output actually conforms to the required VRTX speaking pattern.

This file is essential because VRTX is not just generating arbitrary prose. It is generating a scripted Host A / Sabian exchange that must preserve speaker order, line count, and allowed structure. If validation fails, the engine writes the failed attempt to output and retries generation.

A future GPT working on dialogue quality must keep this validator in mind. The prompt can only evolve as far as the validator will allow. If the prompt changes but the validator still expects a different structure, the system will keep retrying or collapsing into rigid outputs.

## Deterministic Logic

File:

`vrtx/logic/deterministic.cjs`

This file performs rule-based deviation work that sits underneath the LLM layer.

The engine calls:

`computeDeviations()`
`classifyState()`
`selectRules()`

This logic currently functions as the deterministic interpretation backbone. It computes what changed from baseline, classifies the day into a state, and selects rule outputs that can be passed downstream into the prompt payload.

The current context layer and deterministic layer now work together. The deterministic layer provides rule-based state and flags. The context layer provides richer pattern interpretation signals. Together they form the pre-LLM intelligence base of the system.

## Scene Builder

File:

`vrtx/engine/vrtx_scene_builder.cjs`

The current VRTX engine no longer sends only raw evidence into the prompt path. It now includes a scene construction layer that converts the biometric state into a single operational narrative before Sabian speaks.

The previous system had a working runtime but weak insight variation. The engine was successfully ingesting Fitbit data, normalizing it, computing deviations, and generating scripts, but the outputs kept collapsing into the same repeated pattern:

- sleep duration vs resting heart rate
- "recovery compromised"
- vague explanation
- generic low-intensity advice
- repeated references to Zone 2, protein, and recovery

The issue was not primarily runtime failure. The issue was that the model was being asked to generate from a large evidence blob without a single dramatic center.

The business insight system worked better because it always had a clear scene:

- one problem
- one pressure
- one target outcome
- one momentum frame

VRTX needed the same thing.

A new file was added:

`vrtx/engine/vrtx_scene_builder.cjs`

Its job is to transform the current day into a single scene object before prompt generation.

That scene object contains:

- day_frame
- main_problem
- body_mechanism
- stakes
- winning_move
- primary_constraint
- primary_opportunity
- signal_conflict
- allowed_rules

This means the model is no longer asked to invent the whole narrative from raw metrics alone. It is now given a forced operating frame.

The current engine flow is now:

Fitbit input
→ Fitbit raw payload mapping
→ normalized VRTX health object
→ calibration + baseline
→ behavior layer
→ deterministic classification
→ calendar normalization
→ scene builder
→ evidence packaging
→ scene-led prompt
→ OpenRouter generation
→ validator
→ audio orchestration
→ output artifacts

The engine now imports:

`buildVrtxScene` from `vrtx_scene_builder.cjs`

Instead of using only:

- normalized health context
- behavior layer
- deviations
- state
- rules

it now also generates:

- scene

That scene is added into the evidence object and also placed at the top of the user prompt.

The user prompt now has this structure:

SCENE
FULL_EVIDENCE
explicit instruction to lead from the scene first

This is important. The model should no longer narrate all metrics. It should build the insight around:

- the one real problem
- the one real mechanism
- the stakes
- the winning move

The purpose of the scene builder is to stop generic narration and create a repeatable but non-redundant insight frame.

### Order of Interpretation

VRTX must follow this order:

Baseline defines normal
Today defines deviation
Behavior layer defines pattern
Deterministic layer defines state candidates
Calendar layer defines external pressure
Scene builder selects a governing frame
Output is resolved
Script explains Output

If this order is broken, the system will regress into generic narration.

The engine must never:

- start from advice
- start from a metric
- average signals into vague summaries

The engine must always:

- identify the governing constraint or opportunity
- then explain it
- then define the move

## Audio Generation

File:

`vrtx/audio/audio_orchestrator.cjs`

This file converts a validated Host A / Sabian script into dual-voice audio. It assigns the correct voice IDs, generates the individual speech segments, stores those segment files in the output directory, and merges them into the final audio artifact.

The voice IDs are loaded from .env, and the engine passes validated lines into this file only after the script has passed structural validation.

This means the audio system should always be treated as the final stage of the insight pipeline, not as part of generation itself. The engine first decides what the script is, then the audio system renders it.

At the current stage, the script path is working and the audio layer is downstream. If audio fails because of voice or TTS configuration, the script path and run record are still valid and should still be used for debugging and prompt refinement.

## Output Directory

All generated artifacts are written to:

`C:\Users\user\Desktop\sabian.ai\sabian_core\output\vrtx`

A single run may generate several files. These include attempt scripts from intermediate model tries, attempt error logs when validation fails, the final validated script text, the parsed JSON lines, per-line MP3 segments, the merged audio file, and a full run record JSON.

The run record JSON is especially important because it captures the effective model inputs used for the run. It can include Output, state, flags, today metrics, baseline values, deviations, normalized health context, behavior layer, calendar context, scene, prompt signals, and output metadata. When debugging the engine, this file is often the most useful artifact because it shows not just what Sabian said, but what data Sabian had access to.

## Running the System

Always begin from the project root:

```
cd C:\Users\user\Desktop\sabian.ai\sabian_core
```

The current real-data run sequence is two-stage.

First, pull the latest Fitbit data:

```
node .\vrtx\connectors\fitbit_pull.cjs
```

This writes the latest Fitbit payload to:

`vrtx/input/fitbit_latest.json`

Second, run the VRTX engine:

```
node .\vrtx\engine\vrtx_engine.cjs
```

This reads the Fitbit input file, builds the baseline-aware context and behavior layers, generates the Sabian conversation, validates it, attempts to render the audio, and writes all artifacts into:

`output/vrtx/`

If a convenience PowerShell wrapper such as `.\vrtx_run.ps1` exists in the repo, it may still be used, but the current live commands that matter are the Node commands above. Another GPT should assume those are the canonical execution steps unless the wrapper script is explicitly inspected and confirmed.

## Environment Variables

The .env file is now more important than in earlier versions because it controls both generation and live biometric ingestion.

The current environment should include the existing VRTX generation variables plus the Fitbit variables and the variables required for downstream audio.

Generation-side variables include:

- OPENROUTER_API_KEY
- OPENROUTER_MODEL
- ELEVENLABS_API_KEY
- SABIAN_VOICE_ID
- HOST_A_US_ID
- ELEVENLABS_MODEL_ID

Fitbit-side variables include:

- FITBIT_CLIENT_ID
- FITBIT_CLIENT_SECRET
- FITBIT_REDIRECT_URI
- FITBIT_TOKEN_URI
- FITBIT_ACCESS_TOKEN

Multi-user Fitbit variables may include:

- FITBIT_TOKEN_JASON
- FITBIT_TOKEN_SHELLY
- FITBIT_TOKEN_JUS
- FITBIT_TOKEN_UNI

A future Health Connect integration should use a similarly explicit environment and connector configuration pattern rather than burying source-specific logic inside the engine.

A future GPT should not rename these variables casually because the connector, engine, and downstream systems are built around them.

## Fitbit Integration Details

The Fitbit connection added in this phase is the first real live-data source for VRTX.

The process works like this.

An OAuth authorization URL was generated using the Fitbit client ID, redirect URI, and required scopes. The app was authorized against the user's Fitbit account. An authorization code was captured from the redirect URL, then exchanged for an access token using the Fitbit token endpoint. That access token was stored in .env and is now consumed by vrtx/connectors/fitbit_pull.cjs.

The connector then calls Fitbit's Web API and stores the returned data in vrtx/input/fitbit_latest.json.

The engine does not call Fitbit directly. The engine reads the local JSON file produced by the connector. This separation is intentional. It gives VRTX a clean ingestion stage and a clean interpretation stage.

That means future source integrations such as Health Connect should follow the same architectural idea. They should feed a VRTX input artifact that the engine can consume, rather than tangling source-specific API logic directly into the engine runtime.

### How Fitbit Data Is Mapped into VRTX

Inside the current vrtx_engine.cjs, Fitbit-specific API structures are translated into the internal raw health payload before normalization.

Sleep summary and sleep log data are converted into a sleep session object and sleep stages. Activity summary is converted into step counts and activity fields. Heart data is converted into resting heart rate and heart-rate context where possible. Oxygen and respiratory signals are now part of the metric model and should be preserved through the normalized path when available.

This Fitbit-shaped payload is then passed into normalizeHealthConnectPayload() even though it did not come from Health Connect. The name of that function reflects the original intended source, but in the current architecture it is functioning as a general normalization layer.

This is important. The system is not yet fully source-agnostic in naming, but it is becoming source-agnostic in behavior. Fitbit is simply the first real source to use the normalization path, and Health Connect is being connected into that same architecture rather than creating a separate downstream interpretation system.

## The Behavior Layer in Practical Terms

The behavior layer is one of the most important internal additions from the current phase because it changes what VRTX knows before Sabian speaks.

Before this layer existed, Sabian was largely reacting to isolated metrics and prompt wording. With the context layer in place, the engine can tell Sabian things like whether the day shows a dominant risk, whether the pattern looks like rhythm instability, whether there is meaningful sleep debt, and whether the day should be framed more as correction, preservation, leverage, or controlled output.

This means VRTX is beginning to move away from single-metric narration and toward structured pattern interpretation. That is the intended direction of the system.

Another GPT extending this work should build on the behavior layer rather than bypassing it.

## Current Insight Generation Pipeline

The current live pipeline should be understood as:

real Fitbit API pull
→ local Fitbit payload written to `vrtx/input/fitbit_latest.json`
→ Fitbit payload translated into VRTX raw health payload inside `vrtx_engine.cjs`
→ payload normalized by `vrtx_context_layer.cjs`
→ calibration and baseline reference applied
→ behavior layer built by `vrtx_context_layer.cjs`
→ deterministic deviation logic computed by `deterministic.cjs`
→ calendar context normalized by `vrtx_calendar_adapter.cjs` when present
→ prompt and scene evidence assembled in `vrtx_engine.cjs`
→ scene built by `vrtx_scene_builder.cjs`
→ Output resolved
→ Sabian dialogue generated using `vrtx_system_prompt.cjs`
→ output validated by `validator.cjs`
→ audio rendered by `audio_orchestrator.cjs` when TTS is available
→ run artifacts written to `output/vrtx/`

That is the current system as it exists now.

## VRTX Network Structure

VRTX operates on a social structure called VTA.

VTA stands for Ventral Tegmental Area.

Within the VRTX network a VTA represents a group of five individuals. One person joins and invites four others. This creates a small behavioral network where insight and accountability propagate naturally.

The VTA remains part of the broader VRTX philosophy even though the present build phase focused on individual biometric ingestion, behavioral context, calibration, scene-led generation, and real-data insight generation. A future GPT should understand that the architecture being built now is intended to support both individual interpretation and later group synchronization.

### VTA Multi-Member Architecture

VRTX is designed to operate not only at the individual level but also at the circle level through a structure called a VTA.

A VTA is a synchronized group of five individuals whose biometric patterns and insights are interpreted both individually and collectively.

Each member maintains their own biometric stream and personal Sabian insight, but VRTX can also generate a weekly VTA insight based on the combined pattern signals of the group.

This allows families, teams, and small performance groups to understand how their rhythms align and where the group is drifting together.

### Founding VTA (Current Test Group)

The current development environment contains a Founding VTA used for system testing.

Members:

- Jason
- Shelly
- Jus
- Uni

Uni is currently included as a circle member placeholder because she uses a different wearable device. When the system transitions to Health Connect ingestion, Uni is intended to connect through that pipeline instead of Fitbit.

VRTX allows members to exist inside a VTA even if their device is not yet connected. When a device becomes available, their biometric stream can simply be attached to the existing member profile.

### Multi-User Data Structure

VTA members are defined in:

`vrtx/input/vta/vta_members.json`

This file registers all individuals that belong to the VTA.

Each member is assigned:

- a display name
- a slug identifier used in file paths
- an environment variable name that stores their Fitbit token or future source token

The slug ensures that each person's biometric data is written to a separate file and processed independently.

### Multi-User Fitbit Ingestion

VRTX can pull biometric data for multiple users.

The script responsible for this is:

`vrtx/connectors/fitbit_pull_all.cjs`

This connector reads the member list from vta_members.json, loads each user's Fitbit access token from the .env file, and retrieves their biometric data from the Fitbit API.

The data for each member is written to the VTA input directory:

`vrtx/input/vta/`

Each file contains the full Fitbit API payload for that individual.

These files are then available for:

- individual Sabian insights
- group VTA analysis

### Individual vs VTA Insights

VRTX generates insights on two levels.

Individual insight:
Sabian interprets each member's biometric signals and produces a daily Host A / Sabian conversation.

VTA insight:
The system aggregates derived signals from all members and produces a group-level reading that reflects the synchronization or drift of the circle.

Individual biometric streams are never mixed directly. Only derived signals and pattern classifications are used for group analysis.

This preserves privacy while still allowing meaningful VTA pattern detection.

## Development Policy

VRTX follows a Zero Deletion Policy.

Legacy code should not be removed casually. If a component becomes obsolete, it should be deprecated or bypassed rather than erased without documentation. The current repository still contains files that belong to earlier stages of the architecture, and they should be interpreted in light of the current runtime path rather than assumed to be dead.

VRTX code must remain contained within the `vrtx/` directory unless there is a deliberate and documented reason to move outside of it.

Another GPT entering this repo should assume that the live runtime is now centered around:

- `vrtx/connectors/fitbit_pull.cjs`
- `vrtx/input/fitbit_latest.json`
- `vrtx/calibration/baseline_schema.json`
- `vrtx/data/vrtx_context_layer.cjs`
- `vrtx/data/vrtx_calendar_adapter.cjs`
- `vrtx/engine/vrtx_engine.cjs`
- `vrtx/engine/vrtx_scene_builder.cjs`
- `vrtx/prompts/vrtx_system_prompt.cjs`
- `vrtx/guardrails/validator.cjs`
- `vrtx/audio/audio_orchestrator.cjs`

Those are the current active files that define the real-data VRTX insight path.

## Current Run Commands

From the project root:

```
cd C:\Users\user\Desktop\sabian.ai\sabian_core
```

Pull the latest Fitbit data:

```
node .\vrtx\connectors\fitbit_pull.cjs
```

Run the engine:

```
node .\vrtx\engine\vrtx_engine.cjs
```

## Development Flags (Use These to Avoid Spending Credits)

Two environment variable flags exist for development and debugging. Use them whenever you are testing logic changes and do not need a real audio output.

### SKIP_AUDIO=1

Bypasses the ElevenLabs TTS call entirely. The script, parsed lines, and run JSON are still written to `output/vrtx/`. No audio segments are generated and no ElevenLabs credit is spent.

```
SKIP_AUDIO=1 node .\vrtx\engine\vrtx_engine.cjs
```

Use this any time you are testing insight generation, Line 10 behavior, validator output, or any engine logic that does not require final audio.

### REPLAY_RUN=\<timestamp\>

Skips the full OpenRouter LLM generation call and loads the saved `parsedLines` from a previous run JSON instead. Useful for testing post-generation logic (isolated Line 10 pass, grounding gate, contractParsedLines) without spending on another full 10-line generation.

```
SKIP_AUDIO=1 REPLAY_RUN=20260406_150736 node .\vrtx\engine\vrtx_engine.cjs
```

Replace `20260406_150736` with the timestamp of any existing run in `output/vrtx/`. The engine will load that run's lines, apply the isolated Line 10 pass if violations are still present, run the grounding gate, and write new output artifacts with a fresh timestamp.

### Standard development loop

```
# 1. Test logic changes — costs nothing
SKIP_AUDIO=1 REPLAY_RUN=<last_timestamp> node .\vrtx\engine\vrtx_engine.cjs

# 2. When Line 10 is clean, verify with a live generation (no audio)
SKIP_AUDIO=1 node .\vrtx\engine\vrtx_engine.cjs

# 3. When generation is confirmed clean, do a full production run
node .\vrtx\engine\vrtx_engine.cjs
```

Inspect generated artifacts in:

`C:\Users\user\Desktop\sabian.ai\sabian_core\output\vrtx`

Inspect current live biometric input in:

`C:\Users\user\Desktop\sabian.ai\sabian_core\vrtx\input\fitbit_latest.json`

Inspect the current behavior/context logic in:

`C:\Users\user\Desktop\sabian.ai\sabian_core\vrtx\data\vrtx_context_layer.cjs`

Inspect the calendar normalization layer in:

`C:\Users\user\Desktop\sabian.ai\sabian_core\vrtx\data\vrtx_calendar_adapter.cjs`

Inspect the current live engine in:

`C:\Users\user\Desktop\sabian.ai\sabian_core\vrtx\engine\vrtx_engine.cjs`

Inspect the current scene builder in:

`C:\Users\user\Desktop\sabian.ai\sabian_core\vrtx\engine\vrtx_scene_builder.cjs`

Inspect the current Sabian behavior contract in:

`C:\Users\user\Desktop\sabian.ai\sabian_core\vrtx\prompts\vrtx_system_prompt.cjs`

## Final State of the Current Build

The system is not yet the final form of VRTX intelligence, but it now has the correct first real-data architecture:

- source ingestion
- normalization
- calibration
- baseline comparison
- pattern interpretation
- schedule normalization
- output resolution
- dialogue generation
- validation
- audio delivery when available

VRTX should not prompt from biometrics alone.

VRTX should first decide:

- what kind of day this is
- what the body is actually doing
- what the schedule is demanding
- what the listener most needs to understand
- what the winning move is

Only then should Sabian speak.

## Not Fully Wired Yet

The following layers belong to the VRTX build direction but are not yet fully configured as complete runtime systems:

- full VRTX OS layer
- full persistent memory and learning architecture across users and circles
- complete Health Connect ingestion as a dominant live source
- complete multi-member orchestration for all VTA flows
- full automated use of calendar and calibration outputs inside every downstream decision path
- fully stable audio rendering across all voice configurations

These layers should be treated as part of the intended architecture, but not described as fully complete unless the runtime files and execution path confirm they are active.

## Documentation Rule Going Forward

Future updates to this README should separate systems mentally into three categories even if they appear in one document:

- live now
- partially implemented
- planned but not yet wired

That distinction matters because VRTX should not document future architecture as if it is already running.

## Core Principle

VRTX does not narrate metrics.

VRTX identifies the governing condition.

Then it defines the move.

That is the current state of the system, and any future work should begin from that understanding.
