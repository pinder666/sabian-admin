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

// ── Buyer-facing signal name mask ─────────────────────────────────────────────
// Never expose source/provider names to buyers. Map to operational categories.
const SIGNAL_MASK = {
  'VDem Governance':        'Governance Index',
  'Political Stability':    'Political Stability',
  'Corruption Risk':        'Corruption Index',
  'Election Calendar':      'Political Transition Risk',
  'GDELT Conflict':         'Conflict Activity',
  'GDELT Tone':             'Media Sentiment',
  'Conflict Events':        'Conflict Activity',
  'IOM Displacement':       'Displacement Tracking',
  'UNHCR Displacement':     'Displacement Tracking',
  'Displacement':           'Displacement Tracking',
  'USDA Food Supply':       'Food Supply Assessment',
  'FAO Food Import':        'Food Import Dependency',
  'Food Security':          'Food Security Index',
  'FEWS Food Security':     'Food Security Index',
  'Satellite Fire':         'Environmental Stress Indicator',
  'Climate Stress':         'Climate Risk Index',
  'Water Stress':           'Water Security Index',
  'Energy Stress':          'Energy Security Index',
  'Power Grid':             'Infrastructure Reliability',
  'Night Lights':           'Economic Activity Index',
  'Sovereign CDS':          'Sovereign Credit Risk',
  'Economic Stress':        'Economic Stability Index',
  'Currency Collapse':      'Currency Stability',
  'Capital Flows':          'Capital Flow Monitor',
  'Trade Collapse':         'Trade Disruption Index',
  'Fiscal Stress':          'Fiscal Health Index',
  'Sanctions Pressure':     'Sanctions Exposure',
  'Resource Conflict':      'Resource Security Index',
  'Social Volume':          'Public Sentiment Index',
  'Internet Freedom':       'Digital Access Index',
  'Tor Censorship':         'Information Control Index',
  'Cable Disruption':       'Communications Risk Index',
  'OONI Censorship':        'Information Control Index',
  'Health Crisis':          'Public Health Index',
  'Maritime Trade':         'Maritime Activity Index',
  'Flight Movement':        'Air Traffic Index',
  'GPS Jamming':            'Navigation Disruption Index',
  'Prediction Market':      'Market Risk Sentiment',
  'Cyber Threat':           'Cyber Risk Index',
  'IMF Fiscal':             'Fiscal Health Index',
  'WorldBank Governance':   'Governance Index',
  'NASA Fire':              'Environmental Stress Indicator',
};

function maskSignalName(name) {
  if (!name) return name;
  for (const [src, display] of Object.entries(SIGNAL_MASK)) {
    if (name.toLowerCase().includes(src.toLowerCase())) return display;
  }
  return name;
}

// ── Claude script generation ──────────────────────────────────────────────────

async function generateScript(country, convergenceData, mode, targetDate) {
  const { convergence_score, risk_level, signals, top_3_signals } = convergenceData;

  const signalSummary = (signals || [])
    .filter(s => s.score !== null)
    .map(s => `  - ${s.name}: ${s.score}/100 — ${s.label} (${s.trend})`)
    .join('\n');

  const top3 = (top_3_signals || [])
    .map((s, i) => `${i + 1}. ${s.name} at ${s.score}/100 — ${s.label}`)
    .join('\n');

  const prompt = `You are writing an intelligence briefing script for Sabian — an autonomous intelligence platform.

Briefing date: ${targetDate}
Country: ${country.toUpperCase()}
Convergence Score: ${convergence_score}/100 — ${risk_level}

Full signal dataset:
${signalSummary}

Top 3 signals:
${top3}

THE TWO VOICES:

SABIAN — the most capable non-government intelligence system in operation. Every answer anchored to a specific signal name and exact score. No inference, no projection, no hedging. Sharp, specific, complete. Goes straight to mechanism and action. Never explains context Host A already has. Never says "suggests", "could", "may", "typically", "API", "feed", "algorithm", "model", "weighted", or anything describing internal architecture.

HOST A — she controls the conversation through her questions. The questions she asks determine what Sabian is forced to answer. She is not reacting to the data — she is using the data to drive the room toward the decisions that must be made. Her questions are structured in this order:

  1. OPEN: State the top 3 signals with scores and ask Sabian for the convergence — what do these together mean and what is the decision.
  2. CONFIDENCE CHALLENGE: Ask how Sabian knows this read is correct. Force Sabian to explain why the signals are reliable, what corroborates them, and what would change the read. This is where the product earns credibility.
  3. CONTRADICTION DRILL: Identify two signals that point in opposite directions and ask Sabian to reconcile. The contradiction is where the real intelligence lives.
  4. HIDDEN SIGNAL: Identify a signal that is absent or flat when it should not be — and ask why. Force Sabian to explain what that silence means.
  5. DECISION GATE: Ask Sabian what the single signal movement is that converts this from monitor to act now. This is the action trigger.
  6. CLOSE: State the watch list and actions. No date, no time. Flat.

She addresses Sabian by name only when opening a new line of inquiry. Sabian never addresses her — only answers.

TONE — BOTH VOICES:
- Clinical. Data-exact. No theatre. No urgency language. No dramatic phrases.
- Two professionals working a live dataset. Clean. Flat. Precise.
- Neither voice names what they are doing. No meta-commentary.
- CRITICAL: Never describe scoring methodology, signal weights, formulas, thresholds, or code mechanics.

MANDATORY FORMAT:
- Every line starts with exactly "Host A:" or "Sabian:". No exceptions.
- No bullets, no markdown, no stage directions, no parentheticals.
- Approximately 12-16 lines total.

Write the full script now:`;

  const requestBody = JSON.stringify({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
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

async function runBriefing(country, mode = 'forward', date = null, scriptOnly = false) {
  const now = new Date();
  const todayReal = `${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}/${now.getFullYear()} ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')} UTC`;
  const targetDate = date || now.toISOString().slice(0, 10);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeCountry = country.replace(/\s+/g, '_').toLowerCase();

  ensureDir(GOV_AUDIO_DIR);

  console.log(`\nSabian Government Briefing`);
  console.log(`Country: ${country} | Mode: ${mode} | Date: ${targetDate}\n`);

  try {
    // ── Step 1: Use most recent locked score from Supabase ───────────────────
    // Score is set by the daily scan — briefings never re-derive it.
    // This guarantees the same score every time until the next scan completes.
    let convergenceData;
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: stored } = await sb
      .from('convergence_scores')
      .select('*')
      .eq('country', country)
      .order('scan_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (stored && stored.convergence_score != null) {
      console.log(`Locked score: ${stored.convergence_score}/100 — ${stored.risk_level} (scan: ${stored.scan_date})`);
      convergenceData = {
        convergence_score: stored.convergence_score,
        risk_level:        stored.risk_level,
        threshold_window:  stored.threshold_window,
        signals:           stored.top_3_signals || [],
        top_3_signals:     stored.top_3_signals || [],
        signals_available: stored.signals_available,
        signals_failed:    stored.signals_failed || [],
        scan_date:         stored.scan_date,
      };
    } else {
      // No Supabase record at all — run engine once and it will save to Supabase
      console.log(`No stored score for ${country} — running engine to establish baseline...`);
      convergenceData = await runConvergence(country, null, { save: true });
      if (convergenceData.error) throw new Error(`Convergence failed: ${convergenceData.error}`);
    }

    console.log(`Convergence score: ${convergenceData.convergence_score}/100 — ${convergenceData.risk_level}\n`);

    // ── Step 2: Generate briefing script via Claude ───────────────────────────
    console.log('Generating briefing script...');
    const rawScript = await generateScript(country, convergenceData, mode, date ? targetDate : todayReal);
    console.log('\nScript generated:\n');
    console.log(rawScript);
    console.log('\n');

    const scriptPath = path.join(GOV_AUDIO_DIR, `${safeCountry}_${mode}_${ts}.txt`);
    fs.writeFileSync(scriptPath, rawScript, 'utf8');

    const lines = parseDialogueLines(rawScript);
    if (!lines.length) throw new Error('No valid dialogue lines found (expected Host A:/Sabian:)');

    console.log(`Parsed ${lines.length} dialogue lines.`);

    if (scriptOnly) {
      console.log('\n-- SCRIPT ONLY MODE — no audio generated --');
      return { status: 'script_only', country, mode, date: targetDate, script: rawScript, script_path: scriptPath, lines: lines.length };
    }

    console.log('Generating audio...\n');

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

// Standalone:
//   node government_briefing.cjs Mali forward                          — live, full audio
//   node government_briefing.cjs Mali retroactive 2026-03-01           — retroactive, full audio
//   node government_briefing.cjs Mali forward --script                 — script only, no audio
//   node government_briefing.cjs Mali retroactive 2026-03-01 --script  — retroactive, script only
if (require.main === module) {
  const args       = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const country    = args[0] || 'Mali';
  const mode       = args[1] || 'forward';
  const date       = args[2] || null;
  const scriptOnly = process.argv.includes('--script');
  runBriefing(country, mode, date, scriptOnly).catch(console.error);
}
