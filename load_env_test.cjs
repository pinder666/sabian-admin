require('dotenv').config();

const openAiKey = process.env.OPENAI_API_KEY;
const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
const sabianVoiceId = process.env.SABIAN_VOICE_ID;

console.log('✅ OpenAI API Key:', openAiKey);
console.log('✅ ElevenLabs API Key:', elevenLabsKey);
console.log('✅ Sabian Voice ID:', sabianVoiceId);
