const fs = require('fs');
const path = require('path');

// State-to-room mapping.
// Each governing condition maps to the specific book files it should retrieve from
// and a base query string anchored to what those books actually contain.
// This prevents the model from pulling irrelevant chunks and forces knowledge
// to come from the correct department of the library every time.
const STATE_KNOWLEDGE_ROOMS = {
  peak_window: {
    files: [
      'Why-We-Sleep-Unlocking-the-Power-of-Sleep.jsonl',
      'The Circadian Code PDF.jsonl'
    ],
    query: 'deep NREM sleep parasympathetic restoration circadian timing peak performance electrolytes mineral balance protein sustained output blood glucose meal timing'
  },
  recovery_window: {
    files: [
      'Why-We-Sleep-Unlocking-the-Power-of-Sleep.jsonl',
      'The Circadian Code PDF.jsonl'
    ],
    query: 'sleep recovery consistency circadian rhythm meal timing protein amino acids blood glucose stable energy sustained output electrolytes hydration'
  },
  stable_baseline: {
    files: [
      'The Circadian Code PDF.jsonl',
      'Why-We-Sleep-Unlocking-the-Power-of-Sleep.jsonl'
    ],
    query: 'circadian rhythm consistency routine meal timing maintenance stable glucose protein amino acids'
  },
  partial_clearance_deficit: {
    files: [
      'Why-We-Sleep-Unlocking-the-Power-of-Sleep.jsonl',
      'guyton and hall.jsonl'
    ],
    query: 'adenosine sleep pressure clearance accumulation cognitive impairment electrolytes sodium magnesium potassium amino acids neurotransmitter acetylcholine attention focus protein meal timing circadian'
  },
  full_depletion: {
    files: [
      'Why-We-Sleep-Unlocking-the-Power-of-Sleep.jsonl',
      'guyton and hall.jsonl'
    ],
    query: 'sleep deprivation cognitive impairment adenosine clearance electrolytes magnesium sodium amino acids neurotransmitter protein repair overnight recovery alkaline digestion meal timing sleep window bedtime'
  },
  autonomic_stress: {
    files: [
      'guyton and hall.jsonl',
      'Why-We-Sleep-Unlocking-the-Power-of-Sleep.jsonl'
    ],
    query: 'parasympathetic nervous system recovery magnesium digestion light meal protein easy food autonomic calming sleep window restoration'
  }
};

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function loadChunks(chunksDir) {
  if (!fs.existsSync(chunksDir)) return [];
  const files = fs.readdirSync(chunksDir).filter(name => name.endsWith('.jsonl'));
  const rows = [];

  for (const file of files) {
    const fullPath = path.join(chunksDir, file);
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        rows.push(JSON.parse(line));
      } catch (_) {
        // ignore malformed rows
      }
    }
  }
  return rows;
}

function buildIdf(rows) {
  const df = new Map();
  let total = 0;

  for (const row of rows) {
    const terms = new Set(tokenize(row.text));
    if (!terms.size) continue;
    total += 1;
    for (const term of terms) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  const idf = new Map();
  for (const [term, freq] of df.entries()) {
    idf.set(term, Math.log((1 + total) / (1 + freq)) + 1);
  }
  return idf;
}

function score(query, text, idf) {
  const q = tokenize(query);
  const t = tokenize(text);
  if (!q.length || !t.length) return 0;

  const tf = new Map();
  for (const token of t) tf.set(token, (tf.get(token) || 0) + 1);

  let total = 0;
  let hits = 0;
  for (const term of q) {
    if (tf.has(term)) {
      total += tf.get(term) * (idf.get(term) || 1);
      hits += 1;
    }
  }
  return total + hits * 0.75;
}

function retrieveRelevantChunks(options = {}) {
  const chunksDir = options.chunksDir || path.join(__dirname, 'chunks');
  const query = String(options.query || '').trim();
  const topK = Number.isFinite(options.topK) ? options.topK : 4;
  const maxPerSource = Number.isFinite(options.maxPerSource) ? options.maxPerSource : 2;
  if (!query) return [];

  const rows = loadChunks(chunksDir);
  if (!rows.length) return [];

  const idf = buildIdf(rows);
  const sorted = rows
    .map(row => ({ row, score: score(query, row.text, idf) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  // Source diversity: select topK with at most maxPerSource per source
  const sourceCount = new Map();
  const selected = [];
  for (const entry of sorted) {
    const src = entry.row.source || "unknown";
    const count = sourceCount.get(src) || 0;
    if (count < maxPerSource) {
      selected.push(entry);
      sourceCount.set(src, count + 1);
    }
    if (selected.length >= topK) break;
  }

  return selected.map(entry => ({
    source: entry.row.source,
    chunk_id: entry.row.chunk_id,
    text: String(entry.row.text || '').replace(/\s+/g, ' ').trim(),
    score: Number(entry.score.toFixed(2))
  }));
}

// Retrieves chunks from the specific books mapped to a governing condition.
// The model receives only knowledge from the right room — not a blind search
// across all 8,000+ chunks from all 14 books.
function retrieveForState(options = {}) {
  const chunksDir = options.chunksDir || path.join(__dirname, 'chunks');
  const governingCondition = options.governingCondition;
  const topK = Number.isFinite(options.topK) ? options.topK : 4;
  const maxPerSource = Number.isFinite(options.maxPerSource) ? options.maxPerSource : 2;

  const room = STATE_KNOWLEDGE_ROOMS[governingCondition];
  if (!room) {
    // Unknown state — fall back to broad search
    return retrieveRelevantChunks({ chunksDir, query: options.query || '', topK, maxPerSource });
  }

  // Load only the files for this room
  const rows = [];
  for (const fileName of room.files) {
    const fullPath = path.join(chunksDir, fileName);
    if (!fs.existsSync(fullPath)) continue;
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        rows.push(JSON.parse(line));
      } catch (_) {}
    }
  }
  if (!rows.length) return [];

  // Combine room base query with any supplemental query from the engine
  const query = [room.query, options.query || ''].filter(Boolean).join(' ');

  const idf = buildIdf(rows);
  const sorted = rows
    .map(row => ({ row, score: score(query, row.text, idf) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const sourceCount = new Map();
  const selected = [];
  for (const entry of sorted) {
    const src = entry.row.source || 'unknown';
    const count = sourceCount.get(src) || 0;
    if (count < maxPerSource) {
      selected.push(entry);
      sourceCount.set(src, count + 1);
    }
    if (selected.length >= topK) break;
  }

  return selected.map(entry => ({
    source: entry.row.source,
    chunk_id: entry.row.chunk_id,
    text: String(entry.row.text || '').replace(/\s+/g, ' ').trim(),
    score: Number(entry.score.toFixed(2))
  }));
}

module.exports = { retrieveRelevantChunks, retrieveForState };
