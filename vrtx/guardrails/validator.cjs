function countSentences(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  const matches = value.match(/[.!?]+(?=\s|$)/g);
  return matches ? matches.length : 1;
}

function startsWithSpeaker(line) {
  const value = String(line || "").trim();
  return value.startsWith("Host A:") || value.startsWith("Sabian:");
}

function speakerOf(line) {
  const value = String(line || "").trim();
  if (value.startsWith("Host A:")) return "Host A";
  if (value.startsWith("Sabian:")) return "Sabian";
  return null;
}

function stripSpeaker(line) {
  return String(line || "")
    .replace(/^Host A:\s*/, "")
    .replace(/^Sabian:\s*/, "")
    .trim();
}

function extractArrayLiteral(raw) {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function parseOutput(raw) {
  const normalized = String(raw || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();

  const literal = extractArrayLiteral(normalized);

  if (!literal) {
    return { ok: false, errors: ["Output is not a JavaScript array."], lines: [] };
  }

  try {
    const parsed = JSON.parse(literal);

    if (!Array.isArray(parsed)) {
      return { ok: false, errors: ["Output is not an array."], lines: [] };
    }

    return {
      ok: true,
      errors: [],
      lines: parsed.map(v => String(v).trim()).filter(Boolean)
    };
  } catch (error) {
    return { ok: false, errors: ["Output array could not be parsed."], lines: [] };
  }
}

function hasUnsupportedAssumption(text) {
  const t = String(text || "").toLowerCase();

  const patterns = [
    /\bhe feels\b/,
    /\bshe feels\b/,
    /\bthey feel\b/,
    /\byou feel\b/,
    /\bhe is dehydrated\b/,
    /\bshe is dehydrated\b/,
    /\bthey are dehydrated\b/,
    /\bhe skipped breakfast\b/,
    /\bshe skipped breakfast\b/,
    /\bcoffee caused\b/,
    /\bcaffeine caused\b/,
    /\bcortisol is high\b/,
    /\bthis proves\b/,
    /\bhe will\b/,
    /\bshe will\b/,
    /\bthey will\b/,
    /\byou will\b/
  ];

  return patterns.some(rx => rx.test(t));
}

function looksLikeReportLine(text) {
  const t = String(text || "").trim();
  return /^(Indicator|Mechanism|Move):/i.test(t);
}

function isDirectiveLike(part) {
  const t = String(part || "").trim();
  if (!t) return false;
  if (/\?$/.test(t)) return false;
  if (/\b(and|because|which|while|although|however|therefore)\b/i.test(t)) return false;
  return true;
}

function getLastSabianIndex(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (String(lines[i] || "").startsWith("Sabian:")) return i;
  }
  return -1;
}

function validateLines(lines) {
  const errors = [];

  if (lines.length < 8) errors.push(`Minimum 8 lines required. Got ${lines.length}.`);
  if (lines.length > 12) errors.push(`Maximum 12 lines allowed. Got ${lines.length}.`);
  if (!lines.length) return errors;

  const lastSabianIdx = getLastSabianIndex(lines);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!startsWithSpeaker(line)) {
      errors.push(`Line ${i + 1} must start with "Host A:" or "Sabian:".`);
      continue;
    }

    const speaker = speakerOf(line);
    const body = stripSpeaker(line);

    if (!body) {
      errors.push(`Line ${i + 1} is empty.`);
      continue;
    }

    if (speaker === "Sabian") {
      const isClosingDirectiveLine = i === lastSabianIdx;

      if (!isClosingDirectiveLine && countSentences(body) > 2) {
        errors.push(`Sabian line ${i + 1} >2 sentences.`);
      }

      if (looksLikeReportLine(body)) {
        errors.push(`Sabian line ${i + 1} uses report-template language.`);
      }

      if (hasUnsupportedAssumption(body)) {
        errors.push(`Unsupported assumption in Sabian line ${i + 1}.`);
      }

      if (i < lines.length - 1 && speakerOf(lines[i + 1]) === "Sabian") {
        errors.push(`Monologue risk: Sabian spoke consecutively at lines ${i + 1}-${i + 2}.`);
      }
    }

    if (speaker === "Host A") {
      if (i < lines.length - 1 && speakerOf(lines[i + 1]) === "Host A") {
        errors.push(`Turn break: Host A spoke consecutively at lines ${i + 1}-${i + 2}.`);
      }
    }
  }

  if (!lines[0].startsWith("Host A:")) {
    errors.push("Line 1 must start with Host A.");
  }

  if (!lines[lines.length - 1].startsWith("Host A:")) {
    errors.push("Final line must be Host A.");
  }

  return errors;
}

function validateConversationLogic(lines) {
  const errors = [];

  const hostLines = lines
    .filter(line => line.startsWith("Host A:"))
    .map(stripSpeaker);

  const defineDayCount = hostLines.filter(line => /^Define the day\.?$/i.test(line)).length;
  if (defineDayCount !== 1) {
    errors.push('Host A must say "Define the day." exactly once.');
  }

  const winCount = hostLines.filter(line => /how do we win the day\?/i.test(line)).length;
  if (winCount !== 1) {
    errors.push('Host A must ask exactly once: "Sabian, how do we win the day?"');
  }

  const firstSabianIdx = lines.findIndex(line => line.startsWith("Sabian:"));
  if (firstSabianIdx === -1) {
    errors.push("A Sabian response is required.");
  } else {
    const firstSabian = stripSpeaker(lines[firstSabianIdx]);
    if (!/\d/.test(firstSabian)) {
      errors.push("Sabian first response must anchor to at least one number.");
    }
  }

  const hasChallenge = hostLines.some(line =>
    /(prove that|define that|where do you see that|don't assume|give me facts|what does that mean|bring it back to today|keep it plain|say that clearly)/i.test(line)
  );

  if (!hasChallenge) {
    errors.push("Host A must challenge Sabian for clarity or proof at least once.");
  }

  const finalHostWrap = stripSpeaker(lines[lines.length - 1] || "");
  if (countSentences(finalHostWrap) > 2) {
    errors.push("Final Host A wrap must stay tight: maximum 2 sentences.");
  }

  const lastSabianIdx = getLastSabianIndex(lines);

  if (lastSabianIdx === -1) {
    errors.push("A closing Sabian directive line is required.");
  } else {
    const sabianClose = stripSpeaker(lines[lastSabianIdx]);
    const directiveParts = sabianClose
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (directiveParts.length < 4 || directiveParts.length > 6) {
      errors.push("Closing Sabian line must contain 4–6 short operational directives.");
    } else if (!directiveParts.every(isDirectiveLike)) {
      errors.push("Closing Sabian line must contain short operational directives only.");
    }

    if (lastSabianIdx !== lines.length - 2) {
      errors.push("Closing Sabian directive line must be immediately before final Host A wrap.");
    }
  }

  const defineDayIdx = lines.findIndex(
    line => line.startsWith("Host A:") && /^Define the day\.?$/i.test(stripSpeaker(line))
  );

  if (defineDayIdx !== -1) {
    const nextLine = lines[defineDayIdx + 1] || "";
    if (!nextLine.startsWith("Sabian:")) {
      errors.push('Sabian must answer immediately after "Define the day."');
    } else {
      const nextBody = stripSpeaker(nextLine);
      if (countSentences(nextBody) > 1) {
        errors.push('Sabian response to "Define the day." must be one clean sentence.');
      }
    }
  }

  return errors;
}

function validateScript(rawOutput) {
  const parsed = parseOutput(rawOutput);

  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors, lines: [] };
  }

  const errors = [
    ...validateLines(parsed.lines),
    ...validateConversationLogic(parsed.lines)
  ];

  return {
    ok: errors.length === 0,
    errors,
    lines: parsed.lines
  };
}

module.exports = {
  validateScript,
  validateVrtxScript: validateScript,
  validateVrtx: validateScript,
  default: validateScript
};