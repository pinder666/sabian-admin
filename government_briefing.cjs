// government_briefing.cjs
// Sabian DOD vertical — dual-voice government intelligence briefing
// Modes: 'retroactive' (historical demo) | 'forward' (live prediction)
// Output: MP3 in audio_sessions/gov/
// Usage: node government_briefing.cjs Mali retroactive 2026-03-01
//        node government_briefing.cjs Mali forward

require('dotenv').config({ path: './.env' });
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const { logToHive } = require('./logger.cjs');
const runConvergence = require('./convergence_engine.cjs');

const GOV_AUDIO_DIR = path.join(__dirname, 'audio_sessions', 'gov');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// ── Claude script generation ──────────────────────────────────────────────────

async function generateScript(country, convergenceData, mode, targetDate) {
  const { convergence_score, risk_level, threshold_window, signals, top_3_signals } = convergenceData;

  const signalSummary = (signals || [])
    .filter(s => s.score !== null)
    .map(s => `  - ${s.name}: ${s.score}/100 — ${s.label} (${s.trend})`)
    .join('\n');

  const top3 = (top_3_signals || [])
    .map((s, i) => `${i + 1}. ${s.name} at ${s.score}/100 — ${s.label}`)
    .join('\n');

  const retroContext = mode === 'retroactive'
    ? `This is a RETROACTIVE briefing. The date is ${targetDate}. You are presenting what Sabian's signals showed on that date — before any public event occurred. This demonstrates Sabian's advance warning capability.`
    : `This is a FORWARD briefing. Today is ${targetDate}. You are presenting Sabian's current live assessment and near-term prediction.`;

  const prompt = `You are writing a classified-level intelligence briefing script for Sabian — an autonomous signal convergence platform used by military commanders.

${retroContext}

CONVERGENCE DATA FOR ${country.toUpperCase()}:
- Convergence Score: ${convergence_score}/100
- Risk Level: ${risk_level}
- Threshold Window: ${threshold_window}
- Signals scored:
${signalSummary}

Top 3 driving signals:
${top3}

OUTPUT FORMAT — MANDATORY:
- Dialogue ONLY between Host A (senior military analyst) and Sabian (AI oracle).
- Every single line MUST start with exactly "Host A:" or "Sabian:".
- No bullets, no markdown, no headings, no stage directions.
- Host A opens. Host A closes.
- Sabian speaks with absolute precision — cites the specific scores, names the signals, states the window.
- Tone: classified briefing room, not a podcast. Urgent, data-driven, no corporate language.
- Length: 90-120 seconds of spoken audio. Approximately 10-14 dialogue lines total.
- Closing line: Host A ends with the exact number of days of decision space Sabian is manufacturing.
- ${mode === 'retroactive' ? 'CRITICAL: Host A must reference that this briefing was generated BEFORE the public event occurred — emphasizing the advance warning.' : 'CRITICAL: End with a clear forward prediction and the action window.'}

EXAMPLE TONE (do not copy, only match the register):
Host A: You're looking at Mali. What does Sabian see?
Sabian: Convergence at seventy-four. Food emergency across one hundred and twenty-nine regions. Political stability collapsed to twenty-three out of one hundred. Zero rainfall in fourteen days against forty-one degree heat. The conditions for a threshold crossing are complete.
Host A: How long?
Sabian: Fifty-five days. That is the decision window. After that, options collapse.

Now write the full script for ${country} in ${mode} mode at ${targetDate}:`;

  const requestBody = JSON.stringify({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const text = parsed.content?.[0]?.text || '';
          if (!text) reject(new Error(`Claude returned no content: ${body.slice(0, 200)}`));
          else resolve(text);
        } catch (e) {
          reject(new Error(`Claude parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────

async function generateSpeech(text, voiceId, outputPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY in .env');
  if (!voiceId) throw new Error('Missing voiceId for TTS');

  const cleanText = (text ?? '').toString().trim();
  if (!cleanText) throw new Error('generateSpeech called with empty text');

  if (fs.existsSync(outputPath)) {
    try { fs.unlinkSync(outputPath); } catch (_) {}
  }

  const res = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text: cleanText,
      model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_monolingual_v1',
      voice_settings: { stability: 0.45, similarity_boost: 0.8 }
    },
    {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      responseType: 'arraybuffer',
      timeout: 120000
    }
  );

  fs.writeFileSync(outputPath, Buffer.from(res.data), { flag: 'w' });
  console.log(`  Audio segment: ${path.basename(outputPath)}`);
}

// ── ffmpeg merge ───────────────────────────────────────────────────────────────

async function mergeAudio(segments, mergedPath) {
  const ffmpeg = require('fluent-ffmpeg');
  return new Promise((resolve, reject) => {
    const chain = ffmpeg();
    segments.forEach(seg => chain.input(seg));
    chain
      .on('end', resolve)
      .on('error', reject)
      .mergeToFile(mergedPath);
  });
}

// ── Script parsing ────────────────────────────────────────────────────────────

function parseDialogueLines(raw) {
  return raw
    .split('\n')
    .map(l => l.trim().replace(/^[-–—•"'`*]+\s*/, ''))
    .filter(l => l.startsWith('Host A:') || l.startsWith('Sabian:'));
}

// ── Main briefing runner ──────────────────────────────────────────────────────

async function runBriefing(country, mode = 'forward', date = null) {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeCountry = country.replace(/\s+/g, '_').toLowerCase();

  ensureDir(GOV_AUDIO_DIR);

  console.log(`\nSabian Government Briefing`);
  console.log(`Country: ${country} | Mode: ${mode} | Date: ${targetDate}\n`);

  try {
    // ── Step 1: Run convergence engine ────────────────────────────────────────
    console.log('Running convergence engine...');
    const convergenceData = await runConvergence(country, date);

    if (convergenceData.error) {
      throw new Error(`Convergence failed: ${convergenceData.error}`);
    }

    console.log(`Convergence score: ${convergenceData.convergence_score}/100 — ${convergenceData.risk_level}`);
    console.log(`Threshold window: ${convergenceData.threshold_window}\n`);

    // ── Step 2: Generate briefing script via Claude ───────────────────────────
    console.log('Generating briefing script...');
    const rawScript = await generateScript(country, convergenceData, mode, targetDate);
    console.log('\nScript generated:\n');
    console.log(rawScript);
    console.log('\n');

    const scriptPath = path.join(GOV_AUDIO_DIR, `${safeCountry}_${mode}_${ts}.txt`);
    fs.writeFileSync(scriptPath, rawScript, 'utf8');

    const lines = parseDialogueLines(rawScript);
    if (!lines.length) throw new Error('No valid dialogue lines found (expected Host A:/Sabian:)');

    console.log(`Parsed ${lines.length} dialogue lines. Generating audio...\n`);

    // ── Step 3: TTS per line ──────────────────────────────────────────────────
    const sabianVoiceId = process.env.SABIAN_VOICE_ID;
    const hostVoiceId = process.env.HOST_A_US_ID;

    if (!sabianVoiceId) throw new Error('Missing SABIAN_VOICE_ID in .env');
    if (!hostVoiceId) throw new Error('Missing HOST_A_US_ID in .env');

    const segDir = path.join(GOV_AUDIO_DIR, `segs_${ts}`);
    ensureDir(segDir);

    const audioSegments = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const voiceId = line.startsWith('Sabian:') ? sabianVoiceId : hostVoiceId;
      const cleanedLine = line
        .replace(/^Sabian:\s*/i, '')
        .replace(/^Host A:\s*/i, '')
        .replace(/\*/g, '')
        .trim();

      if (!cleanedLine) continue;

      const segPath = path.join(segDir, `seg_${String(i).padStart(3, '0')}.mp3`);
      await generateSpeech(cleanedLine, voiceId, segPath);
      audioSegments.push(segPath);
    }

    // ── Step 4: Merge to final MP3 ────────────────────────────────────────────
    const mergedPath = path.join(GOV_AUDIO_DIR, `${safeCountry}_${mode}_${targetDate}.mp3`);
    console.log('\nMerging audio segments...');
    await mergeAudio(audioSegments, mergedPath);

    // Cleanup segment files
    audioSegments.forEach(seg => { try { fs.unlinkSync(seg); } catch (_) {} });
    try { fs.rmdirSync(segDir); } catch (_) {}

    logToHive({
      source: 'government_briefing',
      level: 'intel',
      event: 'briefing_complete',
      data: {
        country,
        mode,
        date: targetDate,
        convergence_score: convergenceData.convergence_score,
        risk_level: convergenceData.risk_level,
        audio_path: mergedPath,
        script_path: scriptPath,
        lines_generated: lines.length
      },
      tags: ['gov', 'dod', 'briefing', country.toLowerCase(), mode]
    });

    const result = {
      status: 'complete',
      country,
      mode,
      date: targetDate,
      convergence_score: convergenceData.convergence_score,
      risk_level: convergenceData.risk_level,
      threshold_window: convergenceData.threshold_window,
      audio_path: mergedPath,
      script_path: scriptPath,
      generated_at: new Date().toISOString()
    };

    console.log('\nBriefing complete:');
    console.log(`Audio: ${mergedPath}`);
    console.log(`Script: ${scriptPath}`);

    return result;

  } catch (err) {
    logToHive({
      source: 'government_briefing',
      level: 'error',
      event: 'briefing_failed',
      data: { country, mode, date: targetDate, message: err.message },
      tags: ['gov', 'error']
    });
    console.error(`Briefing failed: ${err.message}`);
    return { status: 'error', country, mode, date: targetDate, error: err.message };
  }
}

module.exports = runBriefing;

// Standalone: node government_briefing.cjs Mali retroactive 2026-03-01
//             node government_briefing.cjs Sudan forward
if (require.main === module) {
  const country = process.argv[2] || 'Mali';
  const mode    = process.argv[3] || 'forward';
  const date    = process.argv[4] || null;
  runBriefing(country, mode, date).catch(console.error);
}
