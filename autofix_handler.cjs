// autofix_handler.cjs

const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function requestFix(mission) {
  const prompt = `This Sabian mission failed. Here's the error:\n\n${mission.lastError}\n\nThis was the mission file: ${mission.file}\n\nPlease suggest a fixed script.`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content:
              'You are a senior devops engineer that repairs broken mission scripts.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const fixedCode = response.data.choices?.[0]?.message?.content;
    if (!fixedCode) {
      throw new Error('No fix returned from OpenAI');
    }

    const filePath = path.join(__dirname, '..', mission.file);
    fs.writeFileSync(filePath, fixedCode);
    console.log(`🔁 Auto-fixed and replaced: ${mission.id}`);
  } catch (err) {
    console.error('❌ Autofix error:', err.message);
  }
}

module.exports = { requestFix };
