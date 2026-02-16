7// Combined and enhanced podcast + audio generation logic integrated into boardroom_engine.cjs

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const { analyzeDynamicData } = require('./scoring_engine.cjs');
const { generateSpeech } = require('./voice_generator.cjs');
const { logToHive } = require('./logger.cjs');
const logPodcastToSupabase = async function ({ company_id, department_id, user_id, theme, audio_path, generated_at }) {
  console.log(`📁 [Boardroom] Podcast generated for Company: ${company_id}, Department: ${department_id}, Audio: ${audio_path}`);
  // This replicates the conversational podcast behavior — audio is generated and console logs track it, no Supabase dependency required for demo
};


const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runBoardroomSession({ company_id, department_id, user_id, theme, duration = 35, rawData }) {

  const session_id = uuidv4();
  console.log("🔊 Running Boardroom Intelligence Engine");

  const fields = Object.keys(rawData[0] || {});
  const sampleData = JSON.stringify(rawData.slice(0, 3), null, 2);

  await supabase.from('user_fields').upsert(
    fields.map(field => ({ company_id, field_name: field }))
  );

 const analysis = analyzeDynamicData(rawData);
 const scores = analysis.fieldSummaries;



  await supabase.from('user_field_scores').upsert(
  analysis.fieldSummaries.map(score => ({

  company_id,
  department_id,
  field_name: score.field,
  value: score.score,
  status: score.status,
  updated_at: new Date().toISOString()
}))

  );

  const overall = {
    company_id,
    insight_score: analysis.insightScore,


    status: scores.some(s => s.status === 'red') ? 'red' : scores.some(s => s.status === 'yellow') ? 'yellow' : 'green',
    updated_at: new Date().toISOString()
  };

  await supabase.from('insight_snapshots').upsert([overall]);

  // === TRACK PODCAST TIME USAGE ===
  const { data: usageRecord } = await supabase
    .from('usage_minutes')
    .select('*')
    .eq('company_id', company_id)
    .single();

  const previousMinutes = usageRecord?.minutes_used || 0;
  const newMinutes = previousMinutes + parseInt(duration);
  const monthlyLimit = 140; // Total monthly allocation
  const remainingMinutes = Math.max(0, monthlyLimit - newMinutes);

  await supabase.from('usage_minutes').upsert([
    {
      company_id,
      minutes_used: newMinutes,
      remaining_minutes: remainingMinutes,
      updated_at: new Date().toISOString()
    }
  ]);

  // === BUILD PROMPT ===
const boardroomShowcasePrompt = require('./boardroom_showcase.cjs');


  
  const prompt = `
You, Sabian an apex strategic advisor. Your insights are used by CEOs, boards, and world-class operators to outperform markets and competitors. You do not entertain. You do not guess. You speak when summoned, and deliver insights that would normally require a 10M consultancy.

COMPANY CONTEXT:
- Company ID: ${company_id}
- Department ID: ${department_id || "ALL"}
- Theme: ${theme}
- Target Duration: ${duration} min

USER DATA FIELDS: ${fields}
SAMPLE RECORDS:
${sampleData}

ECONOMIC INTEL SOURCES:
Live feeds from SEC, IMF, World Bank, OECD, FRED, Companies House, BLS, and more. Use macroeconomic data to frame context.

RULES:

const prompt = `
${template.identity}

Directives:
${template.directives.join('\n')}

Personality:
Host A: ${template.personality.host_a}
Sabian: ${template.personality.sabian}

Voice Script:
Host A: ${template.voiceScript.host_a}
Sabian: ${template.voiceScript.sabian}

Instructions:
${template.instructions}
...
`;

- Dialogue only. Host A prompts. Sabian responds.
- No filler. No AI disclaimers. No roleplay.
- Tone: surgical, strategic, confident, elite.
- Never explain Sabian's nature. Just deliver precision insight.

STRATEGIC INTELLIGENCE ENHANCEMENTS:
1. Pattern Divergence Alerts — Detect statistical behavioral shifts.
2. Real-Time KPI Watchdogs — Monitor and trigger alerts for KPI drops.
3. Board-Ready Deck Generator — Output post-podcast briefing decks.
4. Insight Stacking — Layer insights across sessions.
5. Silent Failure Watch — Detect hidden collapse risks.
6. Signal-to-Noise Filter — Highlight only statistically significant metrics.
7. Strategic Drift Detector — Detect mismatch between actions and goals.

BEHAVIORAL + EXECUTION INTELLIGENCE:
8. Decision Fatigue Tracker — Detect when execution slows down.
9. Objection Pattern Recognition — Recognize repeat pushback trends.
10. Leadership Tempo Index — Score C-level execution discipline.
11. AI Bias Hardening — Validate outputs against global benchmarks.
12. Internal Loyalty Scanner — Surface protected but failing departments.

BUSINESS OUTCOME OPTIMIZERS:
13. Revenue Throttle — Offer short vs. long-term execution levers.
14. Efficiency Yield Map — Track departmental ROI on input-output.
15. Project Death Predictor — Analyze project viability pre-launch.
16. Revenue Chain Analysis — Map entire funnel and failure points.

MARKET DOMINANCE SYSTEMS:
17. Competitor Oversight Layer — Mirror top rivals' public filings.
18. Multilingual Insight Core — Adapt logic across markets.
19. Client Success Trigger — Auto-generate case story when ROI succeeds.
20. Autonomous Uplift Scheduler — Logic upgrades monthly without downtime.

MACHINE LEARNING SIGNALS (LOG TO HIVE):
- Theme frequency by sector
- Department scores pre/post action
- Risk classification (1–10)
- Execution alignment (success vs abandonment)
- Global failure pattern index

OUTPUT FORMAT:
- "Sabian:" line-by-line dialogue
- Number key points
- End with: Department Score / Risk Score / Opportunity Lever / Execution Mode

DO NOT FAIL THIS PROMPT.
You're now entering boardroom-level strategic operations. CEOs will act based on what you say. Deliver with total clarity.
`;

  // === CALL AI MODEL ===
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    },
    {
      headers: { "Content-Type": "application/json" }
    }
  );

  const content = response.data.candidates?.[0]?.content?.[0]?.text || response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // === AUDIO PATH AND FOLDER ===
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const audioDir = path.join(__dirname, 'audio_sessions');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir);
  const audioPath = path.join(audioDir, `boardroom_${company_id}_${ts}.mp3`);

  // === GENERATE AUDIO ===
  await generateSpeech(content, process.env.SABIAN_VOICE_ID, audioPath);

  // === LOG PODCAST TO SUPABASE ===
  await logPodcastToSupabase({
    company_id,
    department_id,
    user_id,
    theme,
    audio_path: audioPath,
    generated_at: new Date().toISOString()
  });

  // === SAVE TRANSCRIPT ===
  const transcriptDir = path.join(__dirname, 'transcripts');
  if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir);
  const transcriptPath = path.join(transcriptDir, `boardroom_${company_id}_${ts}.txt`);
  fs.writeFileSync(transcriptPath, content);

  // === RETURN GENERATED TEXT ===
  return content;
}

module.exports = { runBoardroomSession };

// Trigger example run
const rawData = require("./company_earnings_data.json");

runBoardroomSession({
  company_id: "example_company",
  department_id: "sales",
  user_id: "admin",
  theme: "Boardroom Strategy",
  duration: 35,
  rawData
});
