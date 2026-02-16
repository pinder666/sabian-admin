// 🎯 SABIAN INSIGHT ENGINE — BEGINNER MODE

require('dotenv').config({ path: './.env' });
const readline = require('readline');
const fs = require('fs');
const axios = require('axios');
const tone_profiles = require('./tone_profiles.cjs');
const sabian_prompt = require('./sabian_prompt.json');
const { log_to_hive, manage_insight } = require('./logger.cjs'); // wizard + hive hook

const rl = readline.createInterface({
  input: process.stdin,
  
  output: process.stdout
});

console.log("\n🎙️ SABIAN INSIGHT ENGINE — BEGINNER MODE\n");

const language = 'en';
const experience_type = 'conversational';

rl.question("Enter business name: ", business_name => {
  rl.question("What problem should Sabian solve?: ", business_problem => {

    const profile = tone_profiles[`${experience_type}_${language}`] || tone_profiles['conversational_en'];
    const PRIME_DIRECTIVE = "Sabian’s mission: help this business maximize revenue, reduce leaks, unlock hidden opportunities, solve problems faster and smarter across all domains.";
    const current_topic = `Sabian must help ${business_name} solve: ${business_problem}`;

    const prompt = `
Identity: ${JSON.stringify(sabian_prompt.identity)}
Directives: ${JSON.stringify(sabian_prompt.directives)}
Personality: ${JSON.stringify(sabian_prompt.personality)}
Simulation: ${JSON.stringify(sabian_prompt.simulation)}
VoiceScript: ${JSON.stringify(sabian_prompt.voiceScript)}
Intel: ${JSON.stringify(sabian_prompt.intel)}
Instructions: ${sabian_prompt.instructions}

Experience Enhancers: ${JSON.stringify(sabian_prompt.experience_enhancers)}

PRIME DIRECTIVE: ${PRIME_DIRECTIVE}

Format:
- Podcast: Sabian Insights
- Host A = human interviewer | Sabian = Host B
- Dialogue style: ${profile.prompt}
- Topic: ${current_topic}
    `;

    const API_KEY = process.env.OPENROUTER_API_KEY;
    console.log("🔑 API KEY:", API_KEY);

    const url = `https://openrouter.ai/api/v1/chat/completions`;
   const data = {
  model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
  messages: [
    { role: "system", content: "You are Sabian, a powerful AI business consultant." },
    { role: "user", content: prompt }
  ]
};


    const headers = {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    };

    axios.post(url, data, { headers })
      .then(response => {
        const raw = response.data.choices?.[0]?.message?.content || "";
        console.log("\n🧠 SABIAN PODCAST SCRIPT:\n\n" + raw);

        const memory_entry = { 
          timestamp: new Date().toISOString(),
          business_name, business_problem 
        };
        log_to_hive({
          source: "sabian_insight_feed",
          event: "New Podcast Generated",
          level: "insight",
          data: memory_entry
        });
        manage_insight("podcast_script", memory_entry);

        rl.close();
      })
      .catch(err => {
        console.error("❌ Error generating content:", err.response?.data || err.message);
        rl.close();
      });
  });
});
