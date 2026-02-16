const { ElevenLabsClient } = require("elevenlabs");
const client = new ElevenLabsClient({ apiKey: "sk_8c648255fc860d5012497a0a72f21b793454765fdb797e90" });

client.voices.getAll()
  .then(data => console.log("✅ API Key Works, voices loaded:", data))
  .catch(err => console.error("❌ Failed:", err.response?.status, err.response?.data || err.message));
