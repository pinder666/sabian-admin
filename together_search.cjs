const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

async function getTextFromURL(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    return article ? article.textContent : '';
  } catch (e) {
    return '';
  }
}

module.exports = { getTextFromURL };
require('dotenv').config();
const { wizard } = require('./sabian_wizard.cjs');
const { logToHive } = require('./hive_backend.cjs');


async function getSources(query) {
  const params = new URLSearchParams({
    q: query,
    mkt: 'en-US',
    count: '6',
    safeSearch: 'Strict'
  });

  const response = await fetch(`https://api.bing.microsoft.com/v7.0/search?${params}`, {
    headers: {
      'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY
    }
  });

  const json = await response.json();
  return (json.webPages?.value || []).map(x => x.url);
}

async function togetherSearch(query) {
  const urls = await getSources(query);
  const contents = await Promise.all(urls.map(getTextFromURL));
  const context = contents.join('\n\n');

  const systemPrompt = `
    You are Sabian, an intelligent business system.
    Based on the following data, provide a clear and concise answer to this question: ${query}

    Context:
    ${context}
  `;

  const wrapped = await wizard.wrap({
    origin: 'Together_AI',
    prompt: systemPrompt,
    onSuccess: logToHive,
    onFail: logToHive
  });

  const response = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ]
    })
  });

  const result = await response.json();
  return result.choices?.[0]?.message?.content || '[No response from Together]';
}

module.exports = { togetherSearch };
async function rotateLLM({ task, query }) {
  if (!task || !query) return '[Missing task or query]';

  try {
    if (task === 'search') {
      return await togetherSearch(query);
    }

    return '[Unsupported task]';
  } catch (err) {
    console.error('🧠 rotateLLM error:', err.message);
    return '[rotateLLM failed]';
  }
}

module.exports = {
  togetherSearch,
  rotateLLM
};
