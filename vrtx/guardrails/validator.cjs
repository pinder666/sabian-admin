function getSpeaker(line) {
  const text = String(line || "").trim();
  if (text.startsWith("Host A:")) return "Host A";
  if (text.startsWith("Sabian:")) return "Sabian";
  return null;
}

function getBody(line) {
  return String(line || "")
    .replace(/^Host A:\s*/, "")
    .replace(/^Sabian:\s*/, "")
    .trim();
}

function normalizeText(raw) {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^\s*```(?:json|javascript|js|txt|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseLines(raw) {
  const text = normalizeText(raw);

  if (!text) {
    return { ok: false, errors: ["Output is empty."], lines: [] };
  }

  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) {
        return { ok: false, errors: ["Output must be an array."], lines: [] };
      }

      return {
        ok: true,
        errors: [],
        lines: parsed
          .map(line => String(line).trim())
          .filter(Boolean)
      };
    } catch {
      return { ok: false, errors: ["Output array could not be parsed."], lines: [] };
    }
  }

  return {
    ok: true,
    errors: [],
    lines: text
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
  };
}

const EXPECTED_SPEAKERS = ["Host A", "Sabian", "Host A", "Sabian", "Host A", "Sabian", "Host A", "Sabian", "Host A", "Sabian"];

function validateVrtx(rawOutput) {
  const parsed = parseLines(rawOutput);

  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors, lines: [] };
  }

  const lines = parsed.lines;
  const errors = [];

  for (let i = 0; i < lines.length; i += 1) {
    const speaker = getSpeaker(lines[i]);
    const body = getBody(lines[i]);

    if (!speaker) {
      errors.push(`Line ${i + 1} must start with "Host A:" or "Sabian:"`);
      continue;
    }

    if (!body) {
      errors.push(`Line ${i + 1} is empty.`);
    }

    // Speaker alternation check
    if (i < EXPECTED_SPEAKERS.length) {
      const expected = EXPECTED_SPEAKERS[i];
      if (speaker !== expected) {
        errors.push(`Line ${i + 1} speaker is "${speaker}" but must be "${expected}".`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    lines
  };
}

const PROHIBITED_BEHAVIORS = [
  "hydration", "caffeine",
  "movement", "protein", "electrolyte", "water", "coffee", "tea",
  "exercise", "fuel"
];

const STRUCTURAL_WORDS = new Set([
  "represented", "regulating", "indicating", "considered", "illustrated",
  "furthermore", "suggested", "suggesting", "described", "associated",
  "occurring", "following", "therefore", "resulting", "happening",
  "consider", "creates", "creating", "looking", "allowing"
]);

function extractKnowledgeTerms(chunk) {
  if (!chunk || !chunk.text) return [];
  const STOPWORDS = new Set([
    "the", "and", "that", "this", "with", "from", "which", "their",
    "have", "more", "also", "been", "they", "were", "when", "what",
    "each", "during", "after", "other", "would", "could", "should",
    "there", "these", "those", "than", "then", "most", "into", "over",
    "some", "both", "much", "even", "only", "back", "time", "very",
    "where", "does", "such", "like", "just", "being", "through"
  ]);
  return [...new Set(
    chunk.text
      .split(/\s+/)
      .map(w => w.replace(/[^a-zA-Z]/g, "").toLowerCase())
      .filter(w => w.length > 6 && !STOPWORDS.has(w))
  )];
}

function selectAnchorTerms(chunk, allTerms) {
  if (!allTerms || allTerms.length === 0) return [];
  const text = chunk.text || "";
  const textLower = text.toLowerCase();

  // Filter: real standalone words only (drops compound artifacts like "sleepcontrolling")
  // and structural prose words that don't name a mechanism
  const realTerms = allTerms.filter(term =>
    !STRUCTURAL_WORDS.has(term) &&
    new RegExp("\\b" + term + "\\b", "i").test(text)
  );

  const earlyText = textLower.slice(0, 350);

  // Score each term:
  // +3 if appears in first 350 chars (headline mechanism introduced first)
  // +1–3 for frequency in full text (central terms repeat, capped at 3)
  // +floor(len/3) length bonus (longer = more specific)
  const scored = realTerms.map(term => {
    const isEarly = earlyText.includes(term) ? 3 : 0;
    const freq = Math.min((textLower.match(new RegExp(term, "g")) || []).length, 3);
    const lenBonus = Math.floor(term.length / 3);
    return { term, score: isEarly + freq + lenBonus };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(s => s.term);
}

// Approved behavior-mapping mechanism terms (from BEHAVIOR MAPPING RULE in prompt logic).
// Line 6 passes knowledge_activation if it contains any of these — behavior mapping
// is VRTX logic, not retrieval, so it does not need to match retrieved chunk terms.
const BEHAVIOR_MAPPING_TERMS = [
  // Adenosine / short sleep pathway
  "adenosine",
  "sleep pressure",
  "alertness",
  "receptors",
  "accumulation",
  "clearance",
  // HRV / RHR reduced-capacity pathway
  "recovery deficit",
  "recovery capacity",
  "autonomic"
];

// Internal labels and body-state paraphrases that must never appear in dialogue output
const PROHIBITED_LABELS = [
  // Code variable names
  "mixed_or_stable",
  "signal_conflict",
  "recovery_state",
  "partially_constrained_with_offset",
  "coherent_negative",
  "coherent_positive",
  "partial_negative",
  "partial_positive",
  "net_severity",
  "rss_mixed",
  "rss_support",
  "rss_adjustment",
  "day_frame",
  "body_state",
  // Body-state label paraphrases (natural language versions of internal labels)
  "near-steady",
  "near steady",
  "partially compensated",
  "one mild limiter",
  "partially constrained state",
  "partially constrained"
];

function validateSemantics(parsedLines, retrievedKnowledge) {
  const violations = [];

  // Check A: Knowledge activation — Line 6 (index 5), checked across all retrieved chunks.
  // Only applies on Pathway A (adenosine active in Lines 4–8). On Pathway B (leverage/primed),
  // Line 6 delivers blood oxygen context — adenosine terms are not expected there.
  const _checkA_adenosineActive = parsedLines.slice(3, 9).join(' ').toLowerCase().includes('adenosine');
  if (_checkA_adenosineActive && Array.isArray(retrievedKnowledge) && retrievedKnowledge.length > 0) {
    // Collect anchor terms from all retrieved chunks, not just rank-1
    const allAnchorTerms = new Set();
    for (const chunk of retrievedKnowledge) {
      const terms = extractKnowledgeTerms(chunk);
      const anchorTerms = selectAnchorTerms(chunk, terms);
      const checkTerms = anchorTerms.length > 0 ? anchorTerms : terms;
      for (const t of checkTerms) allAnchorTerms.add(t);
    }
    const checkTerms = [...allAnchorTerms];
    const line6Body = getBody(parsedLines[5] || "").toLowerCase();

    // Pass if Line 6 contains retrieved chunk terms OR approved behavior-mapping terms.
    // Behavior mapping is VRTX prompt logic — it produces valid mechanism language
    // independently of what the retriever returned for this specific run.
    const retrievalHit = checkTerms.some(term => line6Body.includes(term));
    const behaviorMapHit = BEHAVIOR_MAPPING_TERMS.some(term => line6Body.includes(term));
    const hit = retrievalHit || behaviorMapHit;

    if (!hit) {
      // Reference rank-1 chunk in the correction message
      const topChunk = retrievedKnowledge[0];
      const termList = checkTerms.slice(0, 8).join(" / ");
      const chunkPreview = String(topChunk.text || "").slice(0, 120).replace(/\s+/g, " ");
      violations.push({
        check: "knowledge_activation",
        line: 6,
        found: `none of [${termList}] found in Line 6`,
        correction:
          `SEMANTIC VIOLATION — Line 6 (knowledge activation):\n` +
          `Line 6 contains none of the required biological terms from RETRIEVED_KNOWLEDGE.\n` +
          `Required: Line 6 must include at least one of these terms: [${termList}].\n` +
          `Required: Line 6 must state the biological mechanism behind that term in one factual sentence — not a metric restatement.\n` +
          `The top retrieved chunk (rank 1: "${topChunk.title || "unknown"}") explains: "${chunkPreview}..."`
      });
    }
  }

  // Check B: Line 9 behavior prohibition (index 8)
  if (parsedLines[8]) {
    const line9Body = getBody(parsedLines[8]).toLowerCase();
    const found = PROHIBITED_BEHAVIORS.filter(b => new RegExp("\\b" + b + "\\b", "i").test(line9Body));
    if (found.length > 0) {
      violations.push({
        check: "line9_behavior_prohibition",
        line: 9,
        found: found.join(", "),
        correction:
          `SEMANTIC VIOLATION — Line 9 (behavior prohibition):\n` +
          `Line 9 named specific behaviors: [${found.join(", ")}]. ` +
          `Host A must not name any specific behavior in Line 9. ` +
          `Rewrite as one sentence that frames the biological state from Lines 6 and 8 ` +
          `and asks what the single move is — without naming any behavior.`
      });
    }
  }

  // Check C: Line 10 coaching arc structure
  // Line 10 is the daily coaching arc — 3 sentences covering morning, lunch, and evening/sleep.
  // It must NOT be a single work-command sentence ("commit your cognitive work", "schedule your task").
  // It must NOT use generic wellness language without mechanism.
  if (parsedLines[9]) {
    const line10Body = getBody(parsedLines[9]);
    const line10Lower = line10Body.toLowerCase();

    // Ban work-scheduling commands — VRTX does not tell people how to structure their work
    const workCommandRx = /\b(commit\s+your\s+(most\s+)?(demanding|complex|cognitive|analytical|creative|hardest)\s+(work|task|output|decision)|schedule\s+your\s+(most\s+)?(demanding|complex|cognitive|hardest)|put\s+your\s+(most\s+)?(demanding|complex|cognitive|hardest)|(start|do|tackle)\s+your\s+(most\s+)?(demanding|complex|cognitive|hardest)|put\s+the\s+(hardest|most\s+demanding)\s+thing|block\s+the\s+first|push\s+through\s+your\s+(most\s+)?(demanding|hardest))\b/i;
    if (workCommandRx.test(line10Body)) {
      violations.push({
        check: 'line10_work_command',
        line: 10,
        found: line10Body.trim().slice(0, 80),
        correction:
          `SEMANTIC VIOLATION — Line 10 (work command prohibited):\n` +
          `Line 10 told the user when or how to structure their work. VRTX does not do this.\n` +
          `The user's work schedule is fixed. VRTX coaches the inputs around it: what to drink, what to eat, and when to sleep.\n` +
          `Line 10 must be the DAILY COACHING ARC — 3 sentences:\n` +
          `  Sentence 1: what to drink or take this morning — with "because" naming the biological reason\n` +
          `  Sentence 2: what to eat at lunch — with "because" naming what it supports in the body\n` +
          `  Sentence 3: what to eat at dinner and what time to sleep — with "because" naming what it enables overnight\n` +
          `COMPLIANT example:\n` +
          `  "Start with electrolytes before anything else — your cells need sodium, magnesium, and potassium to run the clearance process efficiently, and water alone won't provide them. At lunch, eat something with complete protein — meat, eggs, fish, or legumes — because your brain converts amino acids into the neurotransmitters that hold attention as the pressure builds. Finish dinner before 8pm and keep it light and alkaline — leafy greens, fish, root vegetables — then get to bed earlier than usual so the clearing process has the full window it needs."`
      });
    }

    // Ban generic wellness phrases without mechanism
    const genericWellnessRx = /\b(stay hydrated|eat (well|healthy|clean|right)|get better sleep|prioritize recovery|take it easy|listen to your body|balance activity|monitor how you feel)\b/i;
    if (genericWellnessRx.test(line10Lower)) {
      violations.push({
        check: 'line10_generic_wellness',
        line: 10,
        found: line10Body.trim().slice(0, 80),
        correction:
          `SEMANTIC VIOLATION — Line 10 (generic wellness language):\n` +
          `Line 10 used a generic wellness phrase. Every recommendation must name the specific input and the biological reason it matters today.\n` +
          `Not: "stay hydrated" — Instead: "start with electrolytes — your cells need sodium and magnesium to run the clearance process, and water alone won't provide them"\n` +
          `Not: "eat well" — Instead: "at lunch, eat something with complete protein — meat, fish, or legumes — because your brain converts amino acids into the neurotransmitters that hold focus as clearance pressure builds"\n` +
          `Rewrite Line 10 with specific inputs and specific biological reasons.`
      });
    }
  }

  // Check G2a: Line 10 must be a 4-sentence coaching arc covering morning, lunch, afternoon, and evening/sleep.
  // A single or 2-sentence output is missing required day-points.
  if (parsedLines[9]) {
    const line10Body = getBody(parsedLines[9]);
    const sentences = line10Body.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim().length > 10);
    const hasInputMorning = /\b(morning|first\s+thing|before\s+(coffee|anything|your\s+first)|start\s+with|wake|electrolyte|magnesium|mineral|sodium|potassium|water\s+with|hydrat|supplement)/i.test(line10Body);
    const hasInputLunch = /\b(lunch|protein|amino|fish|chicken|meat|eggs?|legume|lentil|salmon|muscle|carbohydrate|rice|sweet\s+potato)\b/i.test(line10Body);
    const hasInputAfternoon = /\b(3pm|afternoon|stairs|walk|outside|sunlight|movement\s+break|break\s+around|step\s+outside|5[-\s]?minute|five[-\s]?minute|rest\s+break|sit\s+down|water\s+break|hydration\s+break|natural\s+break|brief\s+rest)\b/i.test(line10Body);
    const hasInputEvening = /\b(dinner|evening|alkaline|leafy|vegetable|sleep|bed|tonight|bedtime)\b/i.test(line10Body);
    const pointsCovered = [hasInputMorning, hasInputLunch, hasInputAfternoon, hasInputEvening].filter(Boolean).length;

    if (sentences.length < 3 || pointsCovered < 3) {
      violations.push({
        check: 'line10_not_coaching_arc',
        line: 10,
        found: `${sentences.length} sentence(s), ${pointsCovered}/4 day-points covered`,
        correction:
          `SEMANTIC VIOLATION — Line 10 (not a coaching arc):\n` +
          `Line 10 produced ${sentences.length} sentence(s) covering ${pointsCovered} of 4 required day-points.\n` +
          `Line 10 must be the DAILY COACHING ARC — 4 sentences covering morning, lunch, afternoon (~3pm), and evening/sleep.\n` +
          `Each sentence must name a specific input (food, drink, supplement, or sleep timing) grounded in the day's biology — not generic advice.\n` +
          `Required structure:\n` +
          `  Sentence 1 (morning): a specific morning drink or supplement — "because" names what it does for the body's current state at the biological level.\n` +
          `  Sentence 2 (lunch): a specific lunch food — "because" names the mechanism it drives under today's conditions.\n` +
          `  Sentence 3 (~3pm): an activity-calibrated afternoon habit — "because" names what the body needs at that point based on how active it was yesterday.\n` +
          `  Sentence 4 (evening): specific dinner guidance and sleep timing — "because" names what the overnight process requires.\n` +
          `Rewrite Line 10 as four sentences. Each sentence must contain a specific biological reason. No single-sentence summaries. No generic advice.`
      });
    }
  }

  // Check G2: Line 10 front-load prohibition — applies to ALL scenarios, all pathways
  // "Front-load" is a generic filler verb. Line 10 must name specific work, specific timing, specific biology.
  if (parsedLines[9]) {
    const line10Body = getBody(parsedLines[9]);
    if (/\bfront[- ]?load/i.test(line10Body)) {
      violations.push({
        check: 'line10_frontload_banned',
        line: 10,
        found: line10Body.trim().slice(0, 80),
        correction:
          `SEMANTIC VIOLATION — Line 10 (front-load banned — all scenarios):\n` +
          `"Front-load" is ABSOLUTELY PROHIBITED. It says nothing specific.\n` +
          `Line 10 must begin with: Put / Commit / Schedule / Use / Get / Delay / Avoid / Protect / Block / Move.\n` +
          `It must name: (1) a specific work type or sleep action, (2) an exact timing window or tonight directive, (3) the biological reason from today's actual HRV and resting heart rate.\n` +
          `For depletion/deficit scenarios — compliant examples:\n` +
          `  "Get to bed 45 minutes earlier tonight — that's the only input that starts paying back the clearance debt."\n` +
          `  "Move your hardest decision to before noon — the clearance deficit narrows judgment faster than it feels."\n` +
          `  "Avoid decisions requiring deep judgment after 2pm — the clearance debt compounds hardest in the final hours of waking."\n` +
          `For peak/recovery scenarios — compliant examples:\n` +
          `  "Commit your most demanding analytical work to the next 90 minutes — HRV at [X] signals genuine surplus capacity right now."\n` +
          `  "Schedule your highest-stakes decision before noon — resting heart rate at [X] means the body is running efficiently right now."\n` +
          `Rewrite Line 10 with a specific verb, specific task or action, specific timing, and biological reason from today's numbers.`
      });
    }
  }

  // Shared pathway detection for Checks H, I, J
  const _adenosinePrecedingLines = parsedLines.slice(3, 9).join(' ').toLowerCase();
  // autonomic_stress arc also has no adenosine — detect it by Line 10 opener to avoid misfire
  const _line10Body = getBody(parsedLines[9] || '').trim().toLowerCase();
  const _autonomicStressArc = /^(delay|hold|give|wait)\b/.test(_line10Body);
  // leverage day = no adenosine AND not autonomic_stress
  const _leverageDayActive = !_adenosinePrecedingLines.includes('adenosine') && !_autonomicStressArc;

  // Check H: Line 9 food/meal question on leverage day
  // On a leverage/favorable day, Host A must NOT ask about food or the first meal in Line 9.
  // Uses word-boundary matching to avoid false positives from substrings ("creates" contains "eat").
  if (_leverageDayActive && parsedLines[8]) {
    const line9Body = getBody(parsedLines[8]).toLowerCase();
    const foodTerms = ['meal', 'eat', 'food', 'breakfast', 'plate', 'first meal', 'nutrition', 'nutrient'];
    const foodHits = foodTerms.filter(t => new RegExp('\\b' + t.replace(' ', '\\s+') + '\\b', 'i').test(line9Body));
    if (foodHits.length > 0) {
      violations.push({
        check: 'line9_food_on_leverage_day',
        line: 9,
        found: foodHits.join(', '),
        correction:
          `SEMANTIC VIOLATION — Line 9 (food question on leverage day):\n` +
          `Line 9 asked about food or the first meal [${foodHits.join(', ')}]. This is ABSOLUTELY PROHIBITED on a leverage/favorable day.\n` +
          `The Pathway B prescription is BEHAVIORAL — not nutritional. Line 9 must not ask about food, meal, eat, or any nutrition.\n` +
          `Line 9 on a leverage day: Host A frames the opportunity and demands the one behavioral move.\n` +
          `Compliant: "So the body is ahead of where it needs to be. What's the one move that locks this in?"\n` +
          `Compliant: "The nervous system is organized and the window is now. What does the first decision look like?"\n` +
          `Rewrite Line 9 as one sentence that frames the leverage state and asks for the specific behavioral action. No food. No meal. No nutrition.`
      });
    }
  }

  // Check I: Line 7 known-unknown exchange on leverage day
  // On a leverage/favorable day, Line 7 Host A must name the opportunity and its boundary.
  // Opening a known/unknown exchange ("what can't the board see?") is prohibited.
  if (_leverageDayActive && parsedLines[6]) {
    const line7Body = getBody(parsedLines[6]).toLowerCase();
    const unknownPatterns = ["can't see", "cannot see", "is missing", "what's missing", "what is missing", "board not see", "board can't", "board cannot", "can't capture", "cannot capture", "can't tell", "what can the board not"];
    const unknownHits = unknownPatterns.filter(p => line7Body.includes(p));
    if (unknownHits.length > 0) {
      violations.push({
        check: 'line7_unknown_exchange_leverage_day',
        line: 7,
        found: unknownHits.join(', '),
        correction:
          `SEMANTIC VIOLATION — Line 7 (known-unknown exchange on leverage day):\n` +
          `Line 7 opened a known/unknown exchange ["${unknownHits.join(', ')}"] — this is PROHIBITED on a leverage/favorable day.\n` +
          `Line 7 on a leverage day: Host A names the opportunity and demands its boundary — "what wastes this day?" or "what kind of work actually uses this state?"\n` +
          `Do NOT ask "what can't the board see?" or open any known/unknown sub-exchange.\n` +
          `Compliant: "No signals pulling against each other. What's the one thing that wastes a day like this?"\n` +
          `Compliant: "The body came out of last night ready to absorb demand. What kind of demand actually uses this?"\n` +
          `Compliant: "Deploy how? What kind of work wins on a day like this?"\n` +
          `Rewrite Line 7 to name the opportunity and demand its boundary. No unknowns.`
      });
    }
  }

  // Check J: removed — the old leverage-day opener requirement (Put/Commit/Schedule/Use)
  // enforced work-command language that is now prohibited. Line 10 is the coaching arc for all states.

  // Check D: Prohibited internal labels — all lines
  const LABEL_PARAPHRASE_TERMS = ["constrained", "offset", "near-steady", "near steady", "partially compensated", "one mild limiter", "partially constrained"];
  for (let i = 0; i < parsedLines.length; i += 1) {
    const lineBody = getBody(parsedLines[i]).toLowerCase();
    const found = PROHIBITED_LABELS.filter(label => lineBody.includes(label.toLowerCase()));
    if (found.length > 0) {
      // Detect whether this is a body_state label → prose conversion
      const isLabelParaphrase = LABEL_PARAPHRASE_TERMS.some(term => lineBody.includes(term));
      let correction;
      if (isLabelParaphrase) {
        correction =
          `SEMANTIC VIOLATION — Line ${i + 1} (body_state label converted to prose):\n` +
          `Line ${i + 1} contains prohibited paraphrase(s) of the internal body_state label: [${found.join(", ")}].\n` +
          `You are converting the body_state label into spoken prose. This is prohibited.\n` +
          `Fix Line ${i + 1} only. Keep all other lines exactly as written.\n` +
          `Do NOT use: "constrained", "offset", "near-steady", "partially compensated", "partially constrained state", or any phrase that narrates the body_state label.\n` +
          `Do NOT describe the body as constrained or as having an offset.\n` +
          `Instead: Rewrite Line ${i + 1} using signal-level language — state what each available signal shows, its direction and severity, without classifying the body state.\n` +
          `Example of compliant Line 2: "Sleep came in mildly below baseline, which means less adenosine clearance overnight. Resting heart rate is below baseline, which means internal strain is low. HRV is at baseline — recovery readiness is holding. Blood oxygen and sleep consistency are at baseline." No label. No classification. Signal facts only.`;
      } else {
        correction =
          `SEMANTIC VIOLATION — Line ${i + 1} (prohibited internal label):\n` +
          `Line ${i + 1} contains internal code label(s): [${found.join(", ")}]. ` +
          `Fix Line ${i + 1} only. Keep all other lines exactly as written. ` +
          `Rewrite Line ${i + 1} using plain biological language without internal variable names.`;
      }
      violations.push({
        check: "prohibited_label",
        line: i + 1,
        found: found.join(", "),
        correction
      });
    }
  }

  // Check K: Adenosine appears exactly once — in Line 6 (index 5) only.
  // All other lines must reference the concept without the word.
  if (_checkA_adenosineActive) {
    const adenosineCountByLine = parsedLines.map((l, i) =>
      ({ line: i + 1, count: (getBody(l).toLowerCase().match(/\badenosine\b/g) || []).length })
    );
    const totalHits = adenosineCountByLine.reduce((s, x) => s + x.count, 0);
    const offenders = adenosineCountByLine.filter((x, i) => i !== 5 && x.count > 0);
    if (totalHits > 1 || offenders.length > 0) {
      const offenderLines = adenosineCountByLine.filter(x => x.count > 0).map(x => `Line ${x.line}`).join(', ');
      const offenderIndexes = offenders.map(x => `Line ${x.line}`).join(', ');
      violations.push({
        check: 'adenosine_overuse',
        severity: 'error',
        line: offenders[0]?.line,
        found: `"adenosine" found in ${offenderLines} (${totalHits} total — only Line 6 is allowed)`,
        correction:
          `SEMANTIC VIOLATION — adenosine_overuse:\n` +
          `"adenosine" appears in ${offenderLines} but must appear EXACTLY ONCE — in Line 6 ONLY.\n` +
          `Lines using "adenosine" outside Line 6: ${offenderIndexes}.\n` +
          `Fix: In every line EXCEPT Line 6, replace "adenosine" with a substitute:\n` +
          `  - In Line 4: say "the chemical that drives the pressure to sleep" — do NOT name it yet.\n` +
          `  - Beat 5 (Line 5): Host A asks "What's the chemical?" — this is what pulls the definition forward.\n` +
          `  - Line 6: Sabian defines it — "Adenosine is the chemical..." — ONE use, here only.\n` +
          `  - Line 8: Use "it", "the pressure", "the signal", "the chemical" — never say "adenosine" again.\n` +
          `Rewrite any line that uses "adenosine" outside Line 6 without the word.`
      });
    }
  }

  // Check L: Night/day count prohibition — VRTX does not audit past behavior
  if (parsedLines.length > 0) {
    const fullDialogue = parsedLines.map(l => getBody(l)).join(' ');
    const countPattern = /\b\d+\s+of\s+the\s+last\s+\d+\s+(nights?|days?)\b|\b\d+\s+consecutive\s+(nights?|days?)\b|\bmost\s+(nights?|days?)\s+for\s+the\s+past\b/gi;
    const countMatches = [...fullDialogue.matchAll(countPattern)].map(m => m[0]);
    if (countMatches.length > 0) {
      violations.push({
        check: 'night_count_audit',
        severity: 'error',
        found: countMatches.join(', '),
        correction:
          `SEMANTIC VIOLATION — night_count_audit:\n` +
          `VRTX does not count past nights or audit behavior. Found: "${countMatches.join('", "')}"\n` +
          `Remove all references to past night/day counts. The body's state today already encodes the history.\n` +
          `A low HRV IS the evidence. Say what the body shows today. Say what that means today. Say what wins today.\n` +
          `Replace any count-based framing with today's physiological signal: HRV, RHR, sleep duration, or sleep score.`
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

module.exports = { validateVrtx, validateSemantics };