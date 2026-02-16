// sabian_core/sabian_launch_may/agents/openai_test.cjs

require('dotenv').config({ path: '../../.env' }); // Force correct env path

const { OpenAI } = require('openai');

// Validate key
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY in .env");
  process.exit(1);
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

(async () => {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are Sabian, elite AI strategist.' },
        { role: 'user', content: 'Give me 3 future use cases for Sabian.' }
      ],
      temperature: 0.7,
    });

    console.log("🧠 Sabian Response:");
    console.log(response.choices[0].message.content);
  } catch (err) {
    console.error("❌ OpenAI API Error:", err.message);
  }
})();
