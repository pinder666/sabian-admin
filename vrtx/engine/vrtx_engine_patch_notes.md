# VRTX Engine Patch Notes

This patch does not replace your full audio pipeline.

It adds the missing middle layer that the old boardroom / conversational system had:

- a staged duologue template
- a profile adapter
- an evidence adapter
- retrieval-backed physiology context
- a thinner validator

The intended engine flow becomes:

1. raw metrics arrive
2. `vrtx_evidence_adapter.cjs` converts them into a compact evidence object
3. `vrtx_profile_adapter.cjs` normalizes user context
4. `vrtx_retrieval.cjs` pulls 2 to 4 relevant chunk snippets from `vrtx/knowledge/chunks`
5. `vrtx_prompt_builder.cjs` merges template + profile + evidence + retrieval into one final prompt
6. existing engine sends the prompt to OpenRouter
7. validator enforces dialogue structure and unsupported-assumption failures
8. existing audio pipeline continues unchanged

Recommended next code move inside your actual engine:

```js
const { buildSystemPrompt } = require('./vrtx_prompt_builder.cjs');
const built = buildSystemPrompt(payload);
const systemPrompt = built.prompt;
```

Use `built.evidence`, `built.profile`, and `built.chunks` in your run metadata JSON.
