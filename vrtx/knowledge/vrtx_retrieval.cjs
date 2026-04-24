const fs = require('fs');
const path = require('path');

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

module.exports = { retrieveRelevantChunks };
