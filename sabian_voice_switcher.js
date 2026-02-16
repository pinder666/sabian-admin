const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.resolve(__dirname, '.env') }); // Correct .env load

// Load the Sabian Language Bank
const languageBank = JSON.parse(fs.readFileSync(path.join(__dirname, 'sabian_language_bank.json')));

// Map Language and Role to ElevenLabs Voice ID
const elevenLabsVoiceMap = {
  "French_Sabian": process.env.FRENCH_SABIAN_VOICE_ID,
  "French_HostA": process.env.FRENCH_HOST_A_VOICE_ID,
  "Portuguese_Sabian": process.env.PORTUGUESE_SABIAN_VOICE_ID,
  "Portuguese_HostA": process.env.PORTUGUESE_HOST_A_VOICE_ID,
  "English_Sabian": process.env.ENGLISH_SABIAN_VOICE_ID,
  "English_HostA": process.env.ENGLISH_HOST_A_VOICE_ID
};

// Pick correct Voice ID based on country + role
function getVoiceId(countryCode, role = "Sabian") {
  const languageSettings = languageBank[countryCode];

  if (!languageSettings) {
    console.error(`❌ No language mapping found for ${countryCode}`);
    return null;
  }

  const primaryLanguage = languageSettings.primary;
  const languageRoleKey = `${primaryLanguage}_${role}`;

  const voiceId = elevenLabsVoiceMap[languageRoleKey];

  if (!voiceId) {
    console.error(`❌ No ElevenLabs voice ID found for ${languageRoleKey}`);
    return null;
  }

  return voiceId;
}

// Generate speech
async function generateSpeech(countryCode, text, role = "Sabian") {
  const voiceId = getVoiceId(countryCode, role);

  if (!voiceId) {
    console.error('❌ Cannot generate speech without valid voice ID.');
    return;
  }

  const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

  try {
    const response = await axios.post(apiUrl, {
      text: text,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    }, {
      headers: {
        'xi-api-key': elevenLabsApiKey,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    });

    const outputDir = path.join(__dirname, 'podcasts', countryCode);
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `podcast_${role}_${Date.now()}.mp3`);
    fs.writeFileSync(outputPath, response.data);

    console.log(`✅ Podcast generated for ${countryCode} (${role}) and saved at ${outputPath}`);
  } catch (error) {
    console.error('❌ Error generating speech:', error.response ? error.response.data : error.message);
  }
}

// Example Manual Usage:
// generateSpeech("AO", "Sabian está construindo o futuro de Angola!", "Sabian");
// generateSpeech("AO", "Bem-vindo ao podcast Sabian!", "HostA");
// generateSpeech("CD", "Sabian construit l'avenir du Congo!", "Sabian");
// generateSpeech("CD", "Bienvenue sur le podcast Sabian!", "HostA");

module.exports = { generateSpeech };
