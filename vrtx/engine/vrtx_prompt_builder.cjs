const fs = require('fs');
const path = require('path');
const { buildEvidence } = require('../data/vrtx_evidence_adapter.cjs');
const { adaptProfile } = require('../data/vrtx_profile_adapter.cjs');
const { retrieveRelevantChunks } = require('../knowledge/vrtx_retrieval.cjs');

function loadTemplate() {
  const filePath = path.join(__dirname, '..', 'templates', 'vrtx_duologue_template.json');

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function cleanValue(value, fallback = 'unknown') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function renderEvidence(evidence) {
  const lines = Array.isArray(evidence?.summaryLines) ? evidence.summaryLines : [];
  if (!lines.length) return '- no evidence supplied';
  return lines.map(line => `- ${cleanValue(line)}`).join('\n');
}

function renderProfile(profile) {
  return [
    `- user: ${cleanValue(profile?.name, 'user')}`,
    `- diet: ${cleanValue(profile?.dietaryStyle)}`,
    `- caffeine pattern: ${cleanValue(profile?.caffeinePattern)}`,
    `- fasting pattern: ${cleanValue(profile?.fastingPattern)}`,
    `- meal timing: ${cleanValue(profile?.mealTiming)}`,
    `- sleep window: ${cleanValue(profile?.sleepWindow)}`,
    `- training intent: ${cleanValue(profile?.trainingIntent)}`,
    `- digestion sensitivity: ${cleanValue(profile?.digestionSensitivity)}`,
    `- heat exposure: ${cleanValue(profile?.heatExposure)}`,
    `- sweat profile: ${cleanValue(profile?.sweatProfile)}`
  ].join('\n');
}

function renderKnowledge(chunks) {
  if (!Array.isArray(chunks) || !chunks.length) {
    return '- no retrieval snippets used';
  }

  return chunks
    .map((chunk, idx) => {
      const source = cleanValue(chunk?.source, 'unknown_source');
      const chunkId = cleanValue(chunk?.chunk_id, 'unknown_chunk');
      const text = cleanValue(chunk?.text, '');
      return `- snippet ${idx + 1} | ${source} | chunk ${chunkId}: ${text}`;
    })
    .join('\n');
}

function buildInstructions() {
  return [
    'You are building a sharp, intelligent exchange between Host A and Sabian.',
    '',
    'This is a staged two-voice reading, not a chatbot reply.',
    'Return only a JavaScript array of strings.',
    'Every line must begin with "Host A:" or "Sabian:".',
    'Host A always speaks first.',
    'Alternate speakers every line.',
    'Do not return markdown.',
    'Do not return commentary outside the array.',
    '',
    'The conversation must sound natural and complete.',
    'There is no fixed line count.',
    'The conversation must sound natural and complete.',
    'There is no fixed line count.',
    'Target approximately 150 to 180 spoken words total.',
    'The exchange should feel like a sharp 60-second briefing.',
    'Host A and Sabian may speak as many turns as needed to reach clarity.',
    'The conversation ends when the winning strategy for the day is clearly defined.',
    '',
    'Host A is brilliant and already understands the science.',
    'Host A is not a student.',
    'Host A is the advocate for the user and the cross-examiner of Sabian.',
    'Host A assumes Sabian may be wrong, incomplete, overstating the signal, or missing something important.',
    'Host A pressure-tests every important claim.',
    'Host A challenges weak logic immediately.',
    'Host A forces clarification whenever Sabian uses a technical term.',
    'Host A forces the explanation into civilian language the user understands.',
    'Host A forces a concrete winning strategy for the day.',
    'Host A must keep pushing until the user knows exactly what to do and why.',
    '',
    'Sabian is factual, exact, and evidence-bound.',
    'Sabian must never guess, speculate, decorate, soften, or perform.',
    'Sabian may use correct physiological language when it matters.',
    'Sabian must survive Host A’s interrogation using only supported evidence.',
    'When challenged, Sabian must translate technical language into plain English without losing precision.',
    'Sabian must connect physiology to same-day consequence and same-day action.',
    'Sabian must never end with generic category advice.',
    '',
    'Use only the evidence provided.',
    'Do not invent unsupported facts.',
    'If evidence is weak or incomplete, say so plainly.',
    '',
    'Food, hydration, nutrients, and caffeine should appear only when supported by the evidence and relevant to winning the day.',
    'When giving nutrition, hydration, mineral, or caffeine advice, Sabian must use the retrieved knowledge when relevant.',
    'Sabian must recommend nutrients first, then name real food or drink sources only if those sources are supported by the retrieved knowledge.',
    'Do not use generic wellness foods or default internet examples.',
    'Do not say "eat protein" or "add electrolytes" without naming exact sources.',
    'Do not say: hydrate more, eat protein, move more, avoid intensity.',
    'Name exact foods, drinks, nutrients, timing, quantities, and physiological reason.',
    'Sabian must name exact foods, drinks, or nutrients when relevant.',
    'Sabian must include quantity or dose and timing when the evidence supports it.',
    'Sabian must explain why that exact food, drink, nutrient, quantity, or timing helps today.',
    'Every food, drink, mineral, or caffeine recommendation must explain what the body needs, why it needs it today, and what problem it solves.',
    '',
    'If caffeine is mentioned, explain whether to delay it, use it, reduce it, or avoid more of it based on the evidence.',
    'If sugar is relevant, explain whether it risks a crash, unstable energy, or worsened stress load.',
    '',
    'Conversation flow guidance:',
    '1. Host A opens with the key contradiction in the data.',
    '2. Sabian names the governing signal.',
    '3. Host A challenges or demands clarification when technical language appears.',
    '4. Sabian translates the signal into plain language.',
    '5. Host A pushes on real-world consequence.',
    '6. Sabian explains what the user is likely to feel or experience today.',
    '7. Host A asks for the first tactical move.',
    '8. Sabian gives a specific movement strategy with timing and reason.',
    '9. Host A asks for food, hydration, or caffeine strategy if relevant.',
    '10. Sabian gives specific foods, drinks, quantities, timing, and reasons.',
    '11. Host A asks what to avoid or what would backfire today.',
    '12. Sabian gives the winning strategy for the day with concrete actions and why they matter.',
    '',
    'The exchange must include this sequence at least once:',
    '1. Sabian names the governing signal using correct physiological language.',
    '2. Host A immediately challenges or asks for clarification.',
    '3. Sabian translates the concept into plain language.',
    '4. Host A forces the operational move for the day.',
    '',
    'Sabian’s final answer must become operational.',
    'It must tell the user what to do today, what to eat or drink if relevant, what to avoid if relevant, when to do it, and why it matters.',
    'Advice must be specific, not generic.',
    'The final line must contain a specific winning strategy for today with clear actions and reasons.',
    'The insight should leave the user knowing what the data means, what is happening inside the body, what to do today, what to eat or drink if relevant, what to avoid if relevant, and why.'
  ].join('\n');
}

function buildSystemPrompt(payload = {}) {
  const template = loadTemplate();
  const profile = adaptProfile(payload);
  const evidence = buildEvidence(payload);
  const chunks = retrieveRelevantChunks({
    chunksDir: path.join(__dirname, '..', 'knowledge', 'chunks'),
    query: evidence?.query || '',
    topK: 4
  });

  const sections = [
    buildInstructions(),
    '',
    template ? `REFERENCE TEMPLATE\n${JSON.stringify(template, null, 2)}\n` : '',
    `USER PROFILE\n${renderProfile(profile)}\n`,
    `TODAY'S EVIDENCE\n${renderEvidence(evidence)}\n`,
    `RETRIEVED KNOWLEDGE\n${renderKnowledge(chunks)}\n`,
    'OUTPUT REQUIREMENT',
    'Return only a JavaScript array of strings.',
    'Every line must start with "Host A:" or "Sabian:".',
    'Host A speaks first.',
    'Alternate speakers naturally during the conversation.',
    'Return only a JavaScript array of strings.',
    'Every line must start with "Host A:" or "Sabian:".',
    'Target approximately 150 to 180 spoken words total.',
'Final line must be Sabian with a specific winning strategy for today.',
'Sabian must never end with category advice alone.',
'Do not say: move more, hydrate, eat protein, add electrolytes, avoid intensity.',
'Instead specify exact actions, timing, quantities, and examples.',
'If Sabian recommends protein, he must name actual foods.',
'If Sabian recommends electrolytes, he must name actual drinks, minerals, or foods.',
'If Sabian recommends caffeine strategy, he must say when to use it, delay it, or avoid more of it, and why.',
'If Sabian recommends avoiding sugar, he must explain what kind of sugar load would backfire and when the crash would likely hit.',
'Sabian must explain the downside of ignoring the advice.',
  ].filter(Boolean);

  const prompt = sections.join('\n');

  return {
    prompt,
    profile,
    evidence,
    chunks,
    query: evidence?.query || ''
  };
}

module.exports = { buildSystemPrompt };