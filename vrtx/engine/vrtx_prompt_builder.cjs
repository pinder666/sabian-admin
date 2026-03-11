const fs = require('fs');
const path = require('path');
const { buildEvidence } = require('../data/vrtx_evidence_adapter.cjs');
const { adaptProfile } = require('../data/vrtx_profile_adapter.cjs');
const { retrieveRelevantChunks } = require('../knowledge/vrtx_retrieval.cjs');

function loadTemplate() {
  const filePath = path.join(__dirname, '..', 'templates', 'vrtx_duologue_template.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function renderEvidence(evidence) {
  return evidence.summaryLines.map(line => `- ${line}`).join('\n');
}

function renderProfile(profile) {
  return [
    `- user: ${profile.name}`,
    `- diet: ${profile.dietaryStyle}`,
    `- caffeine pattern: ${profile.caffeinePattern}`,
    `- fasting pattern: ${profile.fastingPattern}`,
    `- meal timing: ${profile.mealTiming}`,
    `- sleep window: ${profile.sleepWindow}`,
    `- training intent: ${profile.trainingIntent}`,
    `- digestion sensitivity: ${profile.digestionSensitivity}`,
    `- heat exposure: ${profile.heatExposure}`,
    `- sweat profile: ${profile.sweatProfile}`
  ].join('\n');
}

function renderKnowledge(chunks) {
  if (!chunks.length) return '- no retrieval snippets used';
  return chunks.map((chunk, idx) => `- snippet ${idx + 1} | ${chunk.source} | chunk ${chunk.chunk_id}: ${chunk.text}`).join('\n');
}

function buildSystemPrompt(payload = {}) {
  const template = loadTemplate();
  const profile = adaptProfile(payload);
  const evidence = buildEvidence(payload);
  const chunks = retrieveRelevantChunks({
    chunksDir: path.join(__dirname, '..', 'knowledge', 'chunks'),
    query: evidence.query,
    topK: 4
  });

  const prompt = `You are Sabian, the VRTX Insight Engine.\n\n` +
`This is a staged two-voice reading, not a chatbot reply.\n` +
`Host A owns the room. Sabian reads the evidence.\n\n` +
`TEMPLATE\n` +
`${JSON.stringify(template, null, 2)}\n\n` +
`USER PROFILE\n${renderProfile(profile)}\n\n` +
`TODAY'S EVIDENCE\n${renderEvidence(evidence)}\n\n` +
`RETRIEVED KNOWLEDGE\n${renderKnowledge(chunks)}\n\n` +
`NON-NEGOTIABLE LAWS\n` +
`- Host A opens with raw numbers.\n` +
`- Host A challenges weak logic immediately.\n` +
`- Host A must say Define the day exactly once.\n` +
`- Host A must ask Sabian how to win the day exactly once.\n` +
`- Sabian may speak intelligently but must not assume facts not supported by evidence.\n` +
`- Sabian never uses labels like Indicator, Mechanism, or Move.\n` +
`- Sabian speaks one line at a time.\n` +
`- Final line is always Sabian with 4 to 6 short operational directives.\n` +
`- Food or hydration only appear if the evidence makes them relevant.\n` +
`- Water advice must consider electrolyte context when sweat, heat, load, or caffeine make that relevant.\n` +
`- The conversation must feel like a duologue between two great actors who know each other's rhythm.\n\n` +
`OUTPUT\n` +
`Return only a JavaScript array of strings. Every line starts with Host A: or Sabian:.`; 

  return {
    prompt,
    profile,
    evidence,
    chunks,
    query: evidence.query
  };
}

module.exports = { buildSystemPrompt };
