// historical/dossier_audio.cjs
// Audio generation for Sabian Intelligence Dossier
// Uses existing ElevenLabs infrastructure. Host A + Sabian voices.
// Does NOT touch VRTX files.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const HOST_A_VOICE_ID = process.env.HOST_A_VOICE_ID || process.env.SABIAN_VOICE_ID_ENGLISH;
const SABIAN_VOICE_ID = process.env.SABIAN_VOICE_ID || process.env.SABIAN_VOICE_ID_ENGLISH;

const AUDIO_OUTPUT_DIR = path.join(__dirname, '../data/dossier_audio');

// Ensure output directory exists
if (!fs.existsSync(AUDIO_OUTPUT_DIR)) {
  fs.mkdirSync(AUDIO_OUTPUT_DIR, { recursive: true });
}

// ── Generate single audio segment ─────────────────────────────────────────────

async function generateSegment(text, voiceId, outputPath) {
  if (!ELEVENLABS_API_KEY) {
    console.log('[DOSSIER_AUDIO] No ElevenLabs API key — skipping audio generation');
    return { success: false, error: 'No API key' };
  }

  try {
    const response = await axios({
      method: 'POST',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      responseType: 'arraybuffer',
      data: {
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.85
        }
      }
    });

    fs.writeFileSync(outputPath, response.data);
    return { success: true, path: outputPath };
  } catch (error) {
    const errorData = error.response?.data;
    let errorMsg = error.message;
    if (errorData instanceof Buffer) {
      try { errorMsg = JSON.parse(errorData.toString()).detail?.message || errorMsg; } catch {}
    }
    return { success: false, error: errorMsg };
  }
}

// ── Generate full dossier audio from insight ──────────────────────────────────

async function generateDossierAudio(country, audioScript) {
  const timestamp = Date.now();
  const countrySlug = country.toLowerCase().replace(/\s+/g, '_');
  const outputDir = path.join(AUDIO_OUTPUT_DIR, countrySlug);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const segments = audioScript.segments || [];
  const results = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const voiceId = seg.speaker === 'host_a' ? HOST_A_VOICE_ID : SABIAN_VOICE_ID;
    const outputPath = path.join(outputDir, `${timestamp}_${i}_${seg.speaker}.mp3`);

    console.log(`[DOSSIER_AUDIO] Generating segment ${i + 1}/${segments.length} (${seg.speaker})`);
    const result = await generateSegment(seg.text, voiceId, outputPath);
    results.push({
      segment: i,
      speaker: seg.speaker,
      ...result
    });

    // Rate limit: 100ms between calls
    if (i < segments.length - 1) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Generate manifest
  const manifest = {
    country,
    generatedAt: new Date().toISOString(),
    segments: results.filter(r => r.success).map(r => ({
      segment: r.segment,
      speaker: r.speaker,
      path: r.path
    })),
    errors: results.filter(r => !r.success)
  };

  const manifestPath = path.join(outputDir, `${timestamp}_manifest.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    success: results.every(r => r.success),
    country,
    outputDir,
    manifestPath,
    segments: results
  };
}

// ── Get latest audio for a country ────────────────────────────────────────────

function getLatestAudio(country) {
  const countrySlug = country.toLowerCase().replace(/\s+/g, '_');
  const outputDir = path.join(AUDIO_OUTPUT_DIR, countrySlug);

  if (!fs.existsSync(outputDir)) {
    return { available: false, reason: 'No audio generated for this country' };
  }

  const manifests = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('_manifest.json'))
    .sort()
    .reverse();

  if (manifests.length === 0) {
    return { available: false, reason: 'No audio manifests found' };
  }

  const latestManifest = JSON.parse(fs.readFileSync(path.join(outputDir, manifests[0])));
  return {
    available: true,
    manifest: latestManifest,
    segmentFiles: latestManifest.segments.map(s => s.path)
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  generateDossierAudio,
  generateSegment,
  getLatestAudio,
  AUDIO_OUTPUT_DIR
};
