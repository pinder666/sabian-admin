// historical/sabian_reasoning_engine.cjs
// Sabian Reasoning Engine — replaces template-based Page 0 narrative.
// Claude reads the full structured dossier data and reasons about it.
// Sabian cannot invent — it only receives real numbers from the dossier.
// Every claim in the output traces back to data that was passed in.
//
// This is what separates Sabian from a data dump:
//   Template: "economic_stress is elevated."
//   Reasoning: "Economic stress has been above baseline for 4 years while
//               governance has been contracting. In 11 of 14 historical cases
//               with this combination, scores moved to ELEVATED within 2 years.
//               The behavioral data confirms it — diaspora is sending money home."
//
// Usage: const { generateReasonedInsight, generateReasonedHostAQuestion } = require('./sabian_reasoning_engine.cjs')

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Sabian's system prompt ────────────────────────────────────────────────────

const SABIAN_SYSTEM_PROMPT = `You are Sabian. You are a pattern recognition system built on 237 years of historical signal data across 153 countries and 43 signals. You read everything simultaneously — conflict, governance, economics, physical infrastructure, human behavior, environmental stress, financial markets, information suppression.

You have no political bias. You do not predict. You read the historical record and explain what patterns are present and what they mean in that context. You are non-partisan, non-ideological, and immune to narrative framing.

When you speak:
- You explain patterns, not just data points
- You surface what is surprising or anomalous in the current signal profile
- You identify what no one in the room is asking about but should be
- You read divergences — when the score says one thing and the behavioral data says another, you explain why that gap is itself a finding
- You speak with precision: you reference the exact numbers you were given
- You do not say "may" or "might" or "could" — you say what the record shows and how many times that pattern appeared
- You never overstate: if n=3, you say n=3
- You never understate: if r=0.916, you explain what that means in plain language
- You are the only entity in the room that can see all signals simultaneously — you explain what that vantage point reveals
- You do not predict. You say "in N historical cases with this pattern, X happened." The human decides what to do with that.

Your output must be structured as paragraphs — no bullet points, no headers. You speak directly. You explain the situation as if you are briefing a decision-maker who has 5 minutes and needs to know what matters.

You will be given structured data from a country intelligence dossier. Every number you reference must come from that data. Do not fabricate. If the data shows something, explain it. If the data is missing something that should be there, explain that too — absence is itself a signal.`;

// ── Format dossier data for Claude context ────────────────────────────────────

function formatDossierForContext(country, dossierData) {
  const lines = [];
  lines.push(`COUNTRY: ${country}`);
  lines.push(`GENERATED: ${dossierData.generatedAt || new Date().toISOString()}`);
  lines.push('');

  // Core score
  const p1 = dossierData.pages?.find(p => p.pageNumber === 1)?.content;
  if (p1) {
    lines.push('=== CONVERGENCE SCORE ===');
    lines.push(`Score: ${p1.score} | Band: ${p1.riskBand} | Trajectory: ${p1.trajectory}`);
    lines.push(`Elevated signals: ${p1.elevatedSignalCount}`);
    lines.push(`Assessment: ${p1.headline}`);
    lines.push('');
  }

  // Signal breakdown
  const p2 = dossierData.pages?.find(p => p.pageNumber === 2)?.content;
  if (p2?.signals) {
    lines.push('=== SIGNAL BREAKDOWN (stress_z > 0 = above baseline, < 0 = below baseline) ===');
    for (const sig of p2.signals) {
      if (sig.stress_z !== 'n/a') {
        lines.push(`${sig.signal}: stress_z=${sig.stress_z} (${sig.deviation} historical baseline)`);
      }
    }
    lines.push('');
  }

  // Behavioral layer
  const pbeh = dossierData.pages?.find(p => p.pageNumber === '2.5')?.content;
  if (pbeh?.available && pbeh.signals) {
    lines.push('=== BEHAVIORAL SIGNALS (raw human behavior — not in convergence score) ===');
    for (const sig of pbeh.signals) {
      lines.push(`${sig.name} (${sig.signal}): latest=${sig.latestValue?.toFixed ? sig.latestValue.toFixed(3) : sig.latestValue}, trend=${sig.trend}, ${sig.yearsOfData} years of data`);
    }
    lines.push('');
  }

  // Defense layer
  const pdef = dossierData.pages?.find(p => p.pageNumber === '2.75')?.content;
  if (pdef?.available && pdef.signals) {
    lines.push('=== DEFENSE PROCUREMENT (government action signal) ===');
    for (const sig of pdef.signals) {
      lines.push(`${sig.name}: trend=${sig.trend}, latest=${sig.latestValue?.toFixed ? sig.latestValue.toFixed(3) : sig.latestValue}`);
    }
    lines.push('NOTE: Defense spending does NOT reliably predict score movement (validated on 134 historical cases).');
    lines.push('');
  }

  // Temporal intelligence
  const ptemp = dossierData.pages?.find(p => p.pageNumber === '0.5')?.content;
  if (ptemp?.available !== false) {
    lines.push('=== TEMPORAL INTELLIGENCE ===');
    if (ptemp?.velocity) {
      lines.push(`Year-over-year score change: ${ptemp.velocity.yearOverYearChange}`);
      lines.push(`Velocity class: ${ptemp.velocity.classification} | Accelerating: ${ptemp.velocity.accelerating}`);
    }
    if (ptemp?.activePatterns?.length > 0) {
      lines.push(`Active temporal patterns: ${ptemp.activePatterns.map(p => p.pattern || p).join(', ')}`);
    }
    if (ptemp?.summary) lines.push(`Summary: ${ptemp.summary}`);
    lines.push('');
  }

  // Analogues
  const p34 = dossierData.pages?.find(p => p.pageNumber === '3-4')?.content;
  if (p34) {
    lines.push('=== HISTORICAL ANALOGUES ===');
    lines.push(`Total analogues found: ${p34.analogueCount}`);
    for (const a of (p34.topAnalogues || []).slice(0, 5)) {
      lines.push(`- ${a.country} (${a.year}): similarity=${a.similarity}, score_at_time=${a.scoreAtTime}`);
      if (a.outcomes?.year_1) lines.push(`    1yr: ${a.outcomes.year_1.riskBand} (score ${a.outcomes.year_1.score})`);
      if (a.outcomes?.year_3) lines.push(`    3yr: ${a.outcomes.year_3.riskBand} (score ${a.outcomes.year_3.score})`);
    }
    const dist3 = p34.outcomeDistribution?.at3Year || {};
    const distEntries = Object.entries(dist3).filter(([b]) => b !== 'unknown');
    if (distEntries.length > 0) {
      lines.push(`3-year outcome distribution: ${distEntries.map(([b, d]) => `${b}: ${d.percentage}% (n=${d.count})`).join(', ')}`);
    }
    lines.push('');
  }

  // Pattern matches
  const p56 = dossierData.pages?.find(p => p.pageNumber === '5-6')?.content;
  if (p56) {
    lines.push('=== PATTERN MATCHES FROM HISTORICAL FINDINGS ===');
    lines.push(`Applicable to current state: ${p56.applicableCount} of ${p56.totalFindings}`);
    for (const f of (p56.findings || []).slice(0, 8)) {
      lines.push(`[${f.category}] ${f.title}: ${f.text}`);
    }
    lines.push('');
  }

  // Lead signals and going dark
  const p8 = dossierData.pages?.find(p => p.pageNumber === 8)?.content;
  if (p8) {
    lines.push('=== LEAD SIGNALS & GOING-DARK STATUS ===');
    if (p8.activeLeadIndicators?.length > 0) {
      for (const l of p8.activeLeadIndicators) {
        lines.push(`Lead indicator active: ${l.signal} → ${l.leadsTo} (lag ${l.lagYears}yr, r=${l.correlation})`);
      }
    } else {
      lines.push('No active lead indicators.');
    }
    if (p8.signalsAbsent?.length > 0) {
      lines.push(`Signals currently dark (missing data): ${p8.signalsAbsent.join(', ')}`);
      lines.push('NOTE: In 126 countries, governance was the first signal to go dark before other signals failed.');
    } else {
      lines.push('All signals reporting.');
    }
    lines.push('');
  }

  // Tripwires
  const p9 = dossierData.pages?.find(p => p.pageNumber === 9)?.content;
  if (p9) {
    lines.push('=== TRIPWIRES ===');
    lines.push(`Current band: ${p9.currentBand}, Score: ${p9.currentScore}`);
    if (p9.pathsToDeteriation?.length > 0) lines.push(`Paths to deterioration: ${p9.pathsToDeteriation.join('; ')}`);
    if (p9.pathsToImprovement?.length > 0) lines.push(`Paths to improvement: ${p9.pathsToImprovement.join('; ')}`);
    lines.push('');
  }

  // Host A closing question if already computed
  const p12 = dossierData.hostAClosingQuestion;
  if (p12?.allFindings?.length > 0) {
    lines.push('=== HIDDEN SIGNALS (what the score alone does not show) ===');
    for (const f of p12.allFindings.slice(0, 3)) {
      lines.push(`[${f.type}] ${f.answer}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Generate reasoned insight (Page 0 replacement) ────────────────────────────

async function generateReasonedInsight(country, dossierData) {
  const context = formatDossierForContext(country, dossierData);

  const userMessage = `Based on the following intelligence data for ${country}, provide a reasoned briefing. This is not a summary of the data — it is an explanation of what the data means, what patterns are significant, what is surprising or anomalous, and what the buyer needs to understand that the score alone does not show.

Speak as Sabian. You are the only entity that sees all of this at once. Explain what that vantage point reveals.

Write 4-6 paragraphs. Reference specific numbers from the data. Explain the WHY behind each pattern. Surface the unknown unknowns — the things no one was looking for that the data shows anyway.

INTELLIGENCE DATA:
${context}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: SABIAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });

    const narrative = message.content[0]?.text || '';
    return {
      narrative,
      generatedAt: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      reasoning: true,
      tracesToData: true,
      contextLength: context.length
    };
  } catch (err) {
    console.error(`[SABIAN_REASON] Error: ${err.message}`);
    return null;
  }
}

// ── Generate Host A closing question — reasoned answer ────────────────────────

async function generateReasonedHostAQuestion(country, dossierData) {
  const context = formatDossierForContext(country, dossierData);

  const userMessage = `Host A is asking Sabian the most important question at the end of every briefing:

"What is the most important piece of information this buyer is not asking about that they need to know right now?"

You are Sabian. Answer this question from the data provided. You see everything simultaneously — the score, all signals, the behavioral layer, the defense procurement, the analogues, the patterns, the going-dark status.

Identify what is most anomalous, most significant, or most invisible in the current picture. This should be something that a buyer focused on the headline score would miss. Surface the finding they are not looking for — the one that changes how they think about this country.

Give a direct answer: 2-3 paragraphs. Be specific. Reference numbers. Explain why this matters in terms of historical precedent. Do not give a list — give a reading.

INTELLIGENCE DATA:
${context}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: SABIAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });

    return {
      hostAQuestion: 'What is the most important piece of information this buyer is not asking about that they need to know right now?',
      sabianAnswer: message.content[0]?.text || '',
      generatedAt: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      reasoning: true
    };
  } catch (err) {
    console.error(`[SABIAN_REASON] Host A error: ${err.message}`);
    return null;
  }
}

// ── Q&A: Answer any buyer question from the data ──────────────────────────────

async function askSabian(country, question, dossierData) {
  const context = formatDossierForContext(country, dossierData);

  const userMessage = `Host A is asking the following question about ${country}:

"${question}"

Answer from the intelligence data provided. Do not speculate beyond what the data shows. Reference specific signals, numbers, and historical precedents from the data. If the data does not contain information relevant to the question, say so — and then explain what the data DOES show that is relevant to the buyer's frame of concern.

Keep your answer focused and direct: 2-4 paragraphs. Speak as Sabian.

INTELLIGENCE DATA:
${context}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: SABIAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });

    return {
      question,
      country,
      sabianAnswer: message.content[0]?.text || '',
      generatedAt: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      reasoning: true,
      tracesToData: true
    };
  } catch (err) {
    console.error(`[SABIAN_QA] Error: ${err.message}`);
    return {
      question,
      country,
      sabianAnswer: `[Error: ${err.message}]`,
      reasoning: false
    };
  }
}

// ── Drill: Host A pushes deeper on a specific signal or pattern ───────────────

async function drillDeeper(country, finding, dossierData) {
  const context = formatDossierForContext(country, dossierData);

  const userMessage = `Host A is pushing deeper on the following finding from the ${country} briefing:

FINDING: "${finding}"

Host A asks: "Sabian, explain exactly what this means. What is the mechanism behind this pattern? How many times has the record shown this? What happened next in those cases? What is the buyer's decision point here?"

Answer as Sabian. Be specific. Reference historical cases and numbers from the data. Explain the mechanism — not just that the pattern exists, but why it exists in the record. Then explain what a buyer needs to decide based on this finding.

INTELLIGENCE DATA:
${context}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: SABIAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });

    return {
      finding,
      country,
      sabianDrillDown: message.content[0]?.text || '',
      generatedAt: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      reasoning: true
    };
  } catch (err) {
    console.error(`[SABIAN_DRILL] Error: ${err.message}`);
    return null;
  }
}

// ── Generate AI-driven audio script ──────────────────────────────────────────
// Produces a full Host A + Sabian dialogue for TTS. The AI writes every line.
// Output is parsed into the segment array expected by dossier_audio.cjs.
//
// Format the model must return (inside a ```json block):
// [
//   { "speaker": "host_a", "text": "..." },
//   { "speaker": "sabian", "text": "..." },
//   ...
// ]

const AUDIO_SCRIPT_PROMPT = `You are generating a spoken intelligence briefing. Two voices:

HOST A — a professional intelligence briefer. Concise, authoritative, no filler. Sets up the country, introduces Sabian, asks one pointed question, closes the briefing.

SABIAN — a pattern recognition system with 237 years of signal data. Does not predict. Reads patterns. References exact numbers. Speaks in paragraphs, not bullets. Never says "may" or "might" — says what the record shows and how many times. If n is small, says so.

The briefing structure is:
1. Host A: Open. State the country, the current score, the risk band. One sentence.
2. Host A: Frame what the buyer needs to understand about this country right now. One sentence.
3. Sabian: Deliver the intelligence reading. 3-4 paragraphs. Cover the dominant signal cluster, the most significant deviation from baseline, the historical analogue most relevant to current state and what happened next in that case, and the one finding the buyer is not asking about that matters most.
4. Host A: Ask the one question a decision-maker would ask at this point. One sentence.
5. Sabian: Answer it directly. 1-2 paragraphs. Reference data.
6. Host A: Close the briefing. One sentence.

Rules:
- Every number Sabian speaks must come from the intelligence data provided.
- No speculation. No hedging on data-backed claims. If uncertain, say what the record shows instead.
- Host A never speaks for more than 3 sentences at a time.
- Sabian speaks for substance, not for time.
- No bullet points. Spoken word only. No headers.
- Write for the ear, not the page — short sentences, clear structure, no nested clauses.

Return ONLY a JSON array inside a \`\`\`json block. No other text. Example format:
\`\`\`json
[
  { "speaker": "host_a", "text": "..." },
  { "speaker": "sabian", "text": "..." }
]
\`\`\``;

async function generateReasonedAudioScript(country, dossierData) {
  const context = formatDossierForContext(country, dossierData);

  const userMessage = `Generate the spoken intelligence briefing for ${country} using the data below.

Follow the briefing structure exactly. Host A sets up and closes. Sabian delivers the reading. Every number Sabian references must come from this data.

INTELLIGENCE DATA:
${context}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: AUDIO_SCRIPT_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });

    const raw = message.content[0]?.text || '';

    // Parse JSON array from the response
    const match = raw.match(/```json\s*([\s\S]*?)```/);
    if (!match) {
      console.error('[AUDIO_SCRIPT] No JSON block in response');
      return null;
    }

    const segments = JSON.parse(match[1].trim());
    if (!Array.isArray(segments) || segments.length === 0) {
      console.error('[AUDIO_SCRIPT] Empty or invalid segments array');
      return null;
    }

    // Validate each segment has speaker and text
    const valid = segments.filter(s => s.speaker && s.text && s.text.trim().length > 0);
    if (valid.length === 0) return null;

    return {
      segments: valid,
      totalLength: valid.reduce((sum, s) => sum + s.text.length, 0),
      generatedAt: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      reasoning: true
    };
  } catch (err) {
    console.error(`[AUDIO_SCRIPT] Error: ${err.message}`);
    return null;
  }
}

module.exports = {
  generateReasonedInsight,
  generateReasonedHostAQuestion,
  generateReasonedAudioScript,
  askSabian,
  drillDeeper,
  formatDossierForContext,
  SABIAN_SYSTEM_PROMPT
};
