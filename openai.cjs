// openai.cjs — Sabian Interceptor for OpenAI Calls
// ✅ Redirects all OpenAI requests to the local LLM router
const { queryLLM } = require('./llm_router');

class FakeOpenAI {
  constructor() {}

  chat = {
    completions: {
      create: async ({ messages }) => {
        const prompt = messages.map(m => m.content).join('\n');
        const response = await queryLLM(prompt);
        return {
          choices: [{ message: { content: response } }]
        };
      }
    }
  };
}

module.exports = { OpenAI: FakeOpenAI };
