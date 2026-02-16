// 🔁 INSIGHT ENGINE — DIALOGUE MODE
// Ensures Host A and Sabian alternate their lines like a real conversation

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const { execSync } = require('child_process');
const { generateSpeech } = require('./voice_generator.cjs');

// ✅ Host A Toggle Support
const hostAModes = {
  boardroom: 'cgSgspJ2msm6clMCkdW9',
  conversational: 'YOUR_OTHER_VOICE_ID' // Replace with actual ElevenLabs voice ID
};
const CURRENT_MODE = 'boardroom'; // Change to 'conversational' to switch tone
const hostAVoiceId = hostAModes[CURRENT_MODE];

const hostBVoiceId = 'UgBBYS2sOqTuMpoF3BR0'; // Sabian

const PORT = 5050;
const podcastDir = path.join(__dirname, 'podcasts');
const scriptDir = path.join(__dirname, 'podcast');
const userDataPath = path.join(__dirname, 'user_data.json');
const outputJsonPath = path.join(__dirname, 'output.json');
const earthDataPath = path.join(__dirname, 'earthdata_drought.json');

if (!fs.existsSync(podcastDir)) fs.mkdirSync(podcastDir);

const scriptFiles = fs.readdirSync(scriptDir)
  .filter(file => file.startsWith('podcast_script_') && file.endsWith('.txt'))
  .map(file => ({ file, time: fs.statSync(path.join(scriptDir, file)).mtime }))
  .sort((a, b) => b.time - a.time);

if (!scriptFiles.length) throw new Error('❌ No script found in /podcast directory.');

const latestScriptPath = path.join(scriptDir, scriptFiles[0].file);
const scriptContent = fs.readFileSync(latestScriptPath, 'utf-8');

// 🧠 Parse script lines
const dialogue = [];
scriptContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed.startsWith('**Host A:**')) {
    dialogue.push({ speaker: 'A', text: trimmed.replace('**Host A:**', '').trim() });
  } else if (trimmed.startsWith('**Sabian:**')) {
    dialogue.push({ speaker: 'B', text: trimmed.replace('**Sabian:**', '').trim() });
  }
});

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const finalFilename = `final_podcast_${timestamp}.mp3`;
const finalPath = path.join(podcastDir, finalFilename);

(async () => {
  console.log('🎙️ Generating segmented voice lines...');
  const segmentFiles = [];

  for (let i = 0; i < dialogue.length; i++) {
    const line = dialogue[i];
    const voiceId = line.speaker === 'A' ? hostAVoiceId : hostBVoiceId;
    const filename = `segment_${i}.mp3`;
    await generateSpeech(line.text, voiceId, filename);
    segmentFiles.push(`file ${filename}`);
  }

  fs.writeFileSync('files.txt', segmentFiles.join('\n'));
  execSync(`ffmpeg -y -f concat -safe 0 -i files.txt -c copy "${finalPath}"`);
  console.log(`✅ ${finalFilename} created in /podcasts`);

  const podcastData = {
    Title: 'Sabian Insights Podcast',
    'Generated At': new Date().toISOString(),
    Transcript: scriptContent,
    'Audio File': finalFilename,
    'File Path': finalPath
  };

  if (fs.existsSync(earthDataPath)) {
    const earthData = JSON.parse(fs.readFileSync(earthDataPath, 'utf-8'));
    podcastData.earthdata_snapshot = earthData;
  }

  let userData = [];
  if (fs.existsSync(userDataPath)) {
    userData = JSON.parse(fs.readFileSync(userDataPath, 'utf-8'));
  }
  userData.push(podcastData);
  fs.writeFileSync(userDataPath, JSON.stringify(userData, null, 2));

  let outputData = { insights: [], last_updated: null };
  if (fs.existsSync(outputJsonPath)) {
    outputData = JSON.parse(fs.readFileSync(outputJsonPath, 'utf-8'));
  }
  outputData.insights.unshift({
    event: 'New Podcast Episode',
    summary: 'Latest Sabian Insights with EarthData and full dialogue merge.',
    timestamp: new Date().toISOString()
  });
  outputData.last_updated = new Date().toISOString();

  fs.writeFileSync(outputJsonPath, JSON.stringify(outputData, null, 2));
  console.log('✅ Insight written to output.json');
})();


// -----------------------------------
// 🌍 LIVE DASH + NASA SATELLITE API
// -----------------------------------

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'map.html'));
});

app.get('/api/telemetry', (req, res) => {
  try {
    const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf-8'));
    const telemetry = userData[0]?.drone_telemetry || {};
    res.json(telemetry);
  } catch {
    res.status(500).json({ error: 'Telemetry not found' });
  }
});

app.get('/api/satellite', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const nasaLayer = 'MODIS_Terra_CorrectedReflectance_TrueColor';
  const imageUrl = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?service=WMS&request=GetMap&layers=${nasaLayer}&format=image/jpeg&width=1024&height=512&crs=EPSG:4326&bbox=-180,-90,180,90&time=${today}`;
  res.json({ imageUrl });
});

app.listen(PORT, () => {
  console.log(`🛰️ Sabian dashboard live → http://localhost:${PORT}`);
});
