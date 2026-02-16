const fs = require('fs');
const path = require('path');
const { Configuration, OpenAIApi } = require('openai');

const logPath = path.join(__dirname, '../BUILD_LOG.md');

const configuration = new Configuration({
  apiKey: 'YOUR_OPENAI_API_KEY'
});
const openai = new OpenAIApi(configuration);

function logAction(stage, prompt, status) {
  const timestamp = new Date().toISOString();
  const logEntry = `\n🧠 ${timestamp} — GPT ${stage} (${status}): "${prompt.slice(0, 60)}..."\n`;
  fs.appendFileSync(logPath, logEntry);
}

async function runPrompt(prompt, model = 'gpt-4') {
  logAction('PROMPT', prompt, 'started');

  const response = await openai.createChatCompletion({
    model,
    messages: [{ role: 'user', content: prompt }]
  });

  const result = response.data.choices[0]?.message?.content || '';
  logAction('RESPONSE', prompt, 'complete');

  return result;
}

module.exports = {
  runPrompt
};
