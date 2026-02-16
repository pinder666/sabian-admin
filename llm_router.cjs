const { togetherSearch } = require('./together_search');

async function rotateLLM({ task, query }) {
  if (!task || !query) return '[Missing task or query]';

  try {
    if (task === 'search') {
      return await togetherSearch(query);
    }

    // Placeholder for future task types:
    // if (task === 'strategy') return await openaiStrategy(query);
    // if (task === 'summary') return await geminiSummarizer(query);

    return '[Unsupported task]';
  } catch (err) {
    console.error('🧠 LLM routing failed:', err.message);
    return '[LLM Routing Error]';
  }
}

module.exports = { rotateLLM };
