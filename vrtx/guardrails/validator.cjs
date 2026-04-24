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

  // Check C: Line 10 single prescription (index 9)
  // A compound food prescription is allowed: "[food] for [reason] — and [food] for [reason]"
  // constitutes one prescription, not two separate actions. "and" connecting food objects
  // under one imperative verb is valid. Block multiple imperative verbs and multiple sentences.
  if (parsedLines[9]) {
    const line10Body = getBody(parsedLines[9]);
    const line10Lower = line10Body.toLowerCase();
    const sentenceCount = line10Body.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    // Block "also" and "additionally" — these signal a second separate instruction, not a compound object.
    // "and" is allowed when connecting food items in a prescription.
    const hasExpandingConnective = /\balso\b|\badditionally\b/.test(line10Lower);
    // Detect multiple imperative verbs — two separate actions (e.g., "Eat X. Avoid Y.")
    const imperativeVerbs = (line10Lower.match(/\b(eat|avoid|delay|wait|hold|skip|take|drink|add|use|start|stop)\b/g) || []);
    const hasMultipleActions = imperativeVerbs.length > 1;
    const behaviorHits = PROHIBITED_BEHAVIORS.filter(b => new RegExp("\\b" + b + "\\b", "i").test(line10Lower));
    if (sentenceCount > 1 || hasExpandingConnective || hasMultipleActions || behaviorHits.length >= 1) {
      const details = [];
      if (sentenceCount > 1) details.push(`${sentenceCount} sentences`);
      if (hasExpandingConnective) details.push("expanding connective found");
      if (hasMultipleActions) details.push(`multiple action verbs: [${imperativeVerbs.join(", ")}]`);
      if (behaviorHits.length >= 1) details.push(`prohibited generic category word(s): [${behaviorHits.join(", ")}]`);
      violations.push({
        check: "line10_single_action",
        line: 10,
        found: details.join("; "),
        correction:
          `SEMANTIC VIOLATION — Line 10 (single prescription):\n` +
          `Line 10 produced: ${details.join("; ")}.\n` +
          `Line 10 must not use generic nutrient category words like "protein", "carbohydrates", "hydration", "electrolytes", "water", "movement", "exercise", or "fuel".\n` +
          `Name the specific food — not the nutrient category. "Eggs" not "protein". "Lentils" not "slow carbohydrates". "Oats" not "complex carbs".\n` +
          `Line 10 is one sentence. One imperative verb. A compound food object is allowed ("eggs and lentils") but two separate action verbs are not.\n` +
          `Target structure: [eat] [specific food] for [science term — plain translation] — and [specific food] to [biological reason].\n` +
          `Example: "Eat eggs for choline — the raw material your brain uses to build the attention signal — and lentils or oats to keep blood glucose stable so the adenosine rebound does not compound with a crash."\n` +
          `Rewrite Line 10 as one prescription sentence with one action verb and specific named foods. Nothing else.`
      });
    }
  }

  // Check E: Line 10 ungrounded timing claim (index 9)
  // Only applies on Pathway A (adenosine active). On Pathway B, timing windows like
  // "the next two hours" are valid behavioral deployment references, not corpus-dependent claims.
  if (parsedLines[9] && _checkA_adenosineActive) {
    const line10Body = getBody(parsedLines[9]);
    const timingRx = /\b(?:\d+|thirty|forty[-\s]?five|sixty|ninety|one\s+hundred(?:\s+and\s+\w+)?|one|two|three|four|five|six)\s*(?:minute|hour)s?\b/gi;
    const timingMatches = [...line10Body.matchAll(timingRx)].map(m => m[0]);

    if (timingMatches.length > 0) {
      // Extract grounded boundaries from the retrieved corpus
      let groundedBoundaries = [];
      if (Array.isArray(retrievedKnowledge) && retrievedKnowledge.length > 0) {
        const corpusFull = retrievedKnowledge.map(c => (c.text || c.content || '')).join('\n');
        const boundaryRx = /\b(?:before|until|by)\s+(?:noon|midday|mid-morning)\b|\b(?:noon|midday|mid-morning)\b/gi;
        groundedBoundaries = [...new Set(
          [...corpusFull.matchAll(boundaryRx)].map(m => m[0].toLowerCase())
        )];
      }

      let correctionBody;
      if (groundedBoundaries.length === 0) {
        correctionBody =
          `Line 10 contains a timing claim [${timingMatches.join(", ")}] not supported by the retrieved knowledge.\n` +
          `The retrieved knowledge does not provide a grounded timing boundary for this mechanism.\n` +
          `Rewrite Line 10 with NO timing reference of any kind — no duration, no "after waking", no "morning", no "tonight", no "afternoon".\n` +
          `State only: what the action is and the single biological reason it works. Nothing else.\n` +
          `Example structure: "[Action verb] [behavioral class] — [one mechanism reason]."`;
      } else if (groundedBoundaries.length === 1) {
        correctionBody =
          `Line 10 contains a timing claim [${timingMatches.join(", ")}] not supported by the retrieved knowledge.\n` +
          `The grounded boundary from the retrieved knowledge is: "${groundedBoundaries[0]}".\n` +
          `Rewrite Line 10 using this grounded boundary instead of the specific duration [${timingMatches.join(", ")}].`;
      } else {
        correctionBody =
          `Line 10 contains a timing claim [${timingMatches.join(", ")}] not supported by the retrieved knowledge.\n` +
          `The retrieved knowledge supports multiple boundaries: ${groundedBoundaries.map(b => `"${b}"`).join(", ")}.\n` +
          `Rewrite Line 10 using these grounded anchors. A range expression is acceptable — for example: "Wait until [earliest boundary]. [Latest boundary] is safer."\n` +
          `Do not use the specific duration [${timingMatches.join(", ")}].`;
      }

      violations.push({
        check: "line10_ungrounded_timing",
        line: 10,
        found: timingMatches.join(", "),
        correction: `SEMANTIC VIOLATION — Line 10 (ungrounded timing claim):\n` + correctionBody
      });
    }
  }

  // Check F: Line 10 substance assumption (index 9)
  // Line 8 uses caffeine as an example of the stimulation-seeking response.
  // Line 10 must resolve the governing mechanism (stimulation timing), not the example substance.
  // An insight that says "delay caffeine" fails for any user who does not drink caffeine.
  // Line 10 must use behavioral class language: "stimulation", "artificial alertness", etc.
  if (parsedLines[9]) {
    const line10Body = getBody(parsedLines[9]).toLowerCase();
    const substanceHits = ["caffeine", "coffee", "tea"].filter(s =>
      new RegExp("\\b" + s + "\\b", "i").test(line10Body)
    );
    if (substanceHits.length > 0) {
      violations.push({
        check: "line10_substance_assumption",
        line: 10,
        found: substanceHits.join(", "),
        correction:
          `SEMANTIC VIOLATION — Line 10 (substance assumption):\n` +
          `Line 10 names [${substanceHits.join(", ")}]. This is prohibited.\n` +
          `Line 8 identified a cascade: early stimulation → adenosine masked → wears off → rebound → energy grab → alertness degrades.\n` +
          `Line 10 must break the cascade. Not complete the caffeine narrative.\n` +
          `The cascade is the mechanism. The prescription is: do not trigger it early.\n` +
          `This is independent of [${substanceHits.join(", ")}]. Whether the user drinks caffeine or not, the cascade is the same. The prescription is the same.\n` +
          `The word "${substanceHits[0]}" must not appear in Line 10.\n` +
          `Compliant form — rephrase directly from cascade logic:\n` +
          `"Don't start the cascade — let the pressure clear on its own before reaching for anything to wake you up."\n` +
          `One sentence. Behavioral class only. No substance named.`
      });
    }
  }

  // Check G: Line 10 prescription compliance (index 9)
  // When the adenosine cascade pathway was triggered (adenosine appears in Lines 4–8),
  // Line 10 must name the specific food prescription: eggs for choline + slow glucose source.
  // A generic "protein/carbohydrates" instruction without specific foods is non-compliant.
  if (parsedLines[9] && parsedLines.length >= 9) {
    const adenosinePrecedingLines = parsedLines.slice(3, 9).join(' ').toLowerCase();
    const adenosinePathwayActive = adenosinePrecedingLines.includes('adenosine');

    if (adenosinePathwayActive) {
      const line10Lower = getBody(parsedLines[9]).toLowerCase();
      const hasEggs = /\beggs?\b/.test(line10Lower);
      const hasCholine = /\bcholine\b/.test(line10Lower);

      if (!hasEggs || !hasCholine) {
        violations.push({
          check: 'line10_prescription_noncompliant',
          line: 10,
          found: 'missing eggs and choline — generic prescription delivered instead of specific food prescription',
          correction:
            `SEMANTIC VIOLATION — Line 10 (prescription noncompliant):\n` +
            `The adenosine clearance pathway was established in Lines 4–8. ` +
            `Line 10 must deliver the specific food prescription — not generic food categories.\n` +
            `Required: (1) eggs for choline — choline is the raw material the brain converts into ` +
            `acetylcholine, the attention neurotransmitter. (2) a slow blood glucose source — ` +
            `lentils, oats, or sweet potato — to prevent the glucose spike-crash that compounds the adenosine rebound.\n` +
            `Do NOT use: "protein", "carbohydrates", "nutrients", "dopamine", or any generic category.\n` +
            `Name the food. Name the science term. Translate it immediately.\n` +
            `Compliant: "Eat eggs for choline — the raw material your brain converts into acetylcholine, ` +
            `the attention neurotransmitter — and lentils or sweet potato to hold blood glucose steady ` +
            `so the adenosine rebound does not compound with a crash."`
        });
      }
    }
  }

  // Shared pathway detection for Checks H, I, J
  const _adenosinePrecedingLines = parsedLines.slice(3, 9).join(' ').toLowerCase();
  const _leverageDayActive = !_adenosinePrecedingLines.includes('adenosine');

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

  // Check J: Line 10 opener on leverage day
  // On a leverage/favorable day, Line 10 must open with an affirmative deployment imperative.
  // "Keep the rhythm", "Protect the schedule", or any maintenance/protection framing is non-compliant.
  if (_leverageDayActive && parsedLines[9]) {
    const line10Body = getBody(parsedLines[9]);
    const approvedOpenings = /^(front-load|commit|schedule|use|deploy)/i;
    if (!approvedOpenings.test(line10Body.trim())) {
      violations.push({
        check: 'line10_leverage_day_opener',
        line: 10,
        found: line10Body.trim().slice(0, 60),
        correction:
          `SEMANTIC VIOLATION — Line 10 (leverage day opener):\n` +
          `Line 10 on a leverage day must open with one of: "Front-load", "Commit", "Schedule", "Use", or "Deploy".\n` +
          `The current opening ["${line10Body.trim().slice(0, 60)}..."] is non-compliant — it does not deploy the window, it protects or maintains it.\n` +
          `Line 10 must name: (1) a specific task type (cognitive work, high-stakes decision, most demanding problem), (2) a timing window (this morning, the next two hours), (3) the biological reason (HRV + RHR + what they signal).\n` +
          `Compliant: "Front-load the heaviest cognitive work in the first two hours — HRV this high means the parasympathetic system is clear and decision-making speed is at peak."\n` +
          `Compliant: "Commit your most demanding creative or analytical work to the next two hours — HRV and resting heart rate together signal full autonomic organization."\n` +
          `Rewrite Line 10 with a deployment imperative that names the task, the window, and the biological reason.`
      });
    }
  }

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
      violations.push({
        check: 'adenosine_overuse',
        severity: 'error',
        message: `"adenosine" must appear exactly once (Line 6 only). Found in: ${
          adenosineCountByLine.filter(x => x.count > 0).map(x => `Line ${x.line}`).join(', ')
        } (${totalHits} total).`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

module.exports = { validateVrtx, validateSemantics };