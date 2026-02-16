require('dotenv').config();
const axios = require('axios');

async function testGemini() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const url = "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent";


  
  const body = {
    contents: [{
      parts: [{ text: "Write a short inspirational message about AI evolution." }]
    }]
  };

  try {
    const res = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" }
    });

    console.log("✅ Gemini Response:");
    console.log(res.data.candidates[0].content.parts[0].text);
  } catch (err) {
    console.error("❌ Gemini API failed:", err.response?.data || err.message);
  }
}

testGemini();
