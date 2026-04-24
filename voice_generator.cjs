const axios = require('axios');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg'); // Add this if not already at the top

async function generateSpeech(insightText, voiceId, outputFile) {
    const elevenLabsAPIKey = process.env.ELEVENLABS_API_KEY || '';
    try {
        const response = await axios({
            method: 'POST',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            headers: {
                'xi-api-key': elevenLabsAPIKey,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer',
            data: {
                text: insightText,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            }
        });

        fs.writeFileSync(outputFile, response.data);
        console.log(`✅ Audio file saved as ${outputFile}`);
    } catch (error) {
        console.error(`❌ Error generating ${outputFile}:`, error.response?.data || error.message);
    }
}

// 🔥 New function — trims audio to specified duration (in seconds)
function trimAudio(inputPath, outputPath, durationSeconds = 60) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .setDuration(durationSeconds)
            .output(outputPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
    });
}

module.exports = {
    generateSpeech,
    trimAudio
};
