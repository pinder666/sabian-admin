// PNSIQ CEO Brief — run once to generate insight + audio
// Usage: node pnsiq_brief.cjs
// Output: audio saved to my_audio/, transcript to transcripts/, logged to hive

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const fs        = require('fs');
const path      = require('path');
const { logToHive } = require('./logger.cjs');
const template  = require('./boardroom_template.json');

// ── PNSIQ demo data (mirrors frontend/lib/demo-data.ts) ──────────────────

const DATA = {
  // Revenue
  revenue_mtd:       4_200_000,
  revenue_mtd_plan:  4_800_000,
  revenue_ytd:       48_600_000,
  revenue_ytd_plan:  49_000_000,

  // Accounts at risk
  at_risk_count:    3,
  at_risk_exposure: 160_000,

  // Chargeback disputes expiring
  disputes_expiring_value: 28_400,
  disputes_expiring_count: 2,

  // Named accounts
  maison_juniper: { annual: 93_000, silent_days: 47, last_order: 14_200, cb_amount: 18_200, cb_ref: "CB-311150" },
  cedar_boutique: { annual: 38_000, silent_days: 89 },
  yarrow_collective: { annual: 29_000, silent_days: 61 },
  willow:         { cb_amount: 10_200, days_to_window: 5, cb_ref: "CB-928524" },
  mercer_collective: { fw26_order: 28_400, style_count: 14 },
  birch:          { first_order: 24_000, locations: 3 },
  heron_studio:   { value: 42_000 },

  // Reps
  reps_total: 12,
  reps_on_quota: 7,

  // Inventory carry
  refined_shirtdress: { carry: 340_000, units: 4_200, accounts: 8, weeks_to_q2: 6 },
  essential_twill:    { carry: 68_000,  units: 1_100 },
  carry_total:        408_000,

  // Q1 chargebacks
  q1_recovered:    124_000,
  q1_exposed:      156_000,
  q1_rate:         0.79,
  q1_dispute_count: 3,

  // Revenue windows
  window_5d:  10_200,
  window_28d: 131_000,
  window_90d: 408_000,

  // Full-platform recovery
  cb_total_disputed:     283_890,
  cb_expected_recovery:  151_233,
  attr_accounts_at_risk: 109,
  attr_revenue_at_risk:  2_368_274,
  ds_styles_flagged:     469,
  ds_aged_value:         35_572_770,
  ds_expected_recovery:  19_661_092,
};

// ── Build the pipeline bundle (same logic as ceo/page.tsx buildPipelineBundle) ──

function buildBundle() {
  const d = DATA;
  const mtdPct = Math.round((d.revenue_mtd / d.revenue_mtd_plan) * 100);
  const cbScore = Math.round(d.q1_rate * 100);
  const composite = Math.round(cbScore * 0.25 + 20 * 0.25 + 15 * 0.20 + 42 * 0.15 + 50 * 0.15);

  return `PNSIQ WHOLESALE INTELLIGENCE BRIEF — Week of May 4, 2026 · Q2 2026

PIPELINE SCORE: ${composite}/100 (composite across 5 vectors)
  Chargeback Recovery 25%: ${cbScore} — ${cbScore >= 65 ? "on track" : "needs attention"}
  Account Retention   25%: 20 — CRITICAL (3 A-tier accounts silent)
  Dead Stock          20%: 15 — CRITICAL ($408k carry unresolved)
  Size Curve          15%: 42 — needs attention
  PO Timing           15%: 50 — needs attention
Score moves only when dollars are recovered. Filing and drafting do not move the score.

REVENUE
  MTD: $${(d.revenue_mtd/1e6).toFixed(1)}M of $${(d.revenue_mtd_plan/1e6).toFixed(1)}M plan (${mtdPct}%)
  YTD: $${(d.revenue_ytd/1e6).toFixed(1)}M of $${(d.revenue_ytd_plan/1e6).toFixed(1)}M plan
  Accounts at risk: ${d.at_risk_count} — $${(d.at_risk_exposure/1e3).toFixed(0)}k exposure
  Disputes expiring: $${(d.disputes_expiring_value/1e3).toFixed(1)}k (${d.disputes_expiring_count} windows closing this week)
  Q1 chargeback recovery: $${d.q1_recovered/1e3}k of $${d.q1_exposed/1e3}k exposed (${Math.round(d.q1_rate*100)}% rate, ${d.q1_dispute_count} disputes)

REVENUE CLOCK — total confirmed recoverable: $${((d.window_5d+d.window_28d+d.window_90d)/1e3).toFixed(0)}k
[5-DAY WINDOW] $${(d.window_5d/1e3).toFixed(0)}k
  • Willow ${d.willow.cb_ref}: $${(d.willow.cb_amount/1e3).toFixed(1)}k — window closes in ${d.willow.days_to_window} days. Permanent write-off if not filed.
  • Cedar Boutique reactivation: $3.8k — buyer appointment opens Friday.

[28-DAY WINDOW] $${(d.window_28d/1e3).toFixed(0)}k
  • Refined Shirtdress markdown — COO approval pending 18 days. $${(d.refined_shirtdress.carry/1e3).toFixed(0)}k carry, ${d.refined_shirtdress.weeks_to_q2} weeks to Q2 close.
  • Yarrow Collective unblock — SS25 carry blocking FW26 budget. $44k at stake.
  • 4 buyer sessions started but not completed — $35k at risk.

[90-DAY WINDOW] $${(d.window_90d/1e3).toFixed(0)}k
  • Essential Twill Black — ${d.essential_twill.units.toLocaleString()} units, $${(d.essential_twill.carry/1e3).toFixed(0)}k carry, no clearance action taken.
  • Dead stock — 3 styles across 2 reps. Channel match not drafted.
  • 5 lapsed A-tier accounts — no re-engagement plan.

ESCALATIONS (stalled, no action)
[CRITICAL · CFO] Maison Juniper ${d.maison_juniper.cb_ref} — $${(d.maison_juniper.cb_amount/1e3).toFixed(1)}k — dispute window closes May 9. Letter drafted March 28. CFO no action 17 days.
[HIGH · CFO] Willow ${d.willow.cb_ref} — $${(d.willow.cb_amount/1e3).toFixed(1)}k — window closes May 14. Letter drafted. Not submitted. ${d.willow.days_to_window} days left.
[HIGH · VP Sales] Maison Juniper — ${d.maison_juniper.silent_days} days silent — $${(d.maison_juniper.annual/1e3).toFixed(0)}k annual. Last order $${(d.maison_juniper.last_order/1e3).toFixed(1)}k March 18. Rep 14 zero logged contact.
[HIGH · VP Sales] Cedar Boutique — ${d.cedar_boutique.silent_days} days silent — $${(d.cedar_boutique.annual/1e3).toFixed(0)}k annual. Was on 45-day reorder cycle. Zero rep contact.
[HIGH · COO] Refined Shirtdress — $${(d.refined_shirtdress.carry/1e3).toFixed(0)}k carry — ${d.refined_shirtdress.units.toLocaleString()} units, markdown proposal sitting with COO 18 days unapproved.

REP PERFORMANCE
  Rep 03 Marcus Webb (Midwest):   $487k of $420k quota — 116% — 1 at-risk account
  Rep 08 Diane Cole (South):      $412k of $380k quota — 108% — 0 at-risk accounts
  Rep 14 Ryan Park (Northeast):   $398k of $440k quota —  90% — 3 at-risk accounts (owns Maison Juniper)
  Rep 19 Tara Liu (West):         $341k of $360k quota —  95% — 2 at-risk accounts
  Rep 05 Jordan Reyes (Southeast): $287k of $400k quota —  72% — 4 at-risk accounts — CRITICAL
  ${d.reps_on_quota} of ${d.reps_total} reps on quota

BUYER SESSIONS
  Mercer Collective: FW26 draft COMPLETED — $${(d.mercer_collective.fw26_order/1e3).toFixed(1)}k across ${d.mercer_collective.style_count} styles — rep notified
  Heron Studio ($${(d.heron_studio.value/1e3).toFixed(0)}k account): session started 1 day ago, not completed
  FW26 engagement tracking 31% below prior year at same point in season

FULL-PLATFORM RECOVERY PIPELINE
  Chargebacks: ${d.cb_total_disputed.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})} disputed — $${(d.cb_expected_recovery/1e3).toFixed(0)}k expected recovery
  Attrition: ${d.attr_accounts_at_risk} accounts at risk — $${(d.attr_revenue_at_risk/1e6).toFixed(1)}M revenue exposure
  Dead stock: ${d.ds_styles_flagged} styles flagged — $${(d.ds_aged_value/1e6).toFixed(1)}M aged value — $${(d.ds_expected_recovery/1e6).toFixed(1)}M recoverable`;
}

// ── ElevenLabs TTS — returns Buffer or null ───────────────────────────────

async function ttsLine(text, voiceId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) { console.warn('⚠️  ELEVENLABS_API_KEY not set — skipping audio'); return null; }
  try {
    const r = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      { text, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.42, similarity_boost: 0.78, style: 0.0, use_speaker_boost: true } },
      { headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, responseType: 'arraybuffer', timeout: 30000 }
    );
    return Buffer.from(r.data);
  } catch (err) {
    console.error(`❌ TTS error for voice ${voiceId}:`, err.response?.data || err.message);
    return null;
  }
}

// ── Parse Host A / Sabian dialogue lines ─────────────────────────────────

function parseLines(script) {
  return script
    .split('\n')
    .map(l => l.replace(/\*\*/g, '').trim())
    .filter(l => l)
    .map(l => {
      if (/^host a:/i.test(l)) return { speaker: 'host_a', text: l.replace(/^host a:\s*/i, '') };
      if (/^sabian:/i.test(l))  return { speaker: 'sabian',  text: l.replace(/^sabian:\s*/i,  '') };
      return null;
    })
    .filter(Boolean);
}

// ── System prompt from boardroom_template ─────────────────────────────────

const SYSTEM = `${template.identity}

Directives:
${template.directives.join('\n')}

Personality:
Host A: ${template.personality.host_a}
Sabian: ${template.personality.sabian}

Voice Script:
Host A: ${template.voiceScript.host_a}
Sabian: ${template.voiceScript.sabian}

Instructions:
${template.instructions.join('\n')}

Intel Sources: ${template.intel.dataSources}
Mission: ${template.intel.mission}

Session Rules:
${template.simulation.rules.join('\n')}

PNSIQ WHOLESALE APPAREL — OUTPUT RULES:
- You are briefing the CEO of a wholesale apparel brand
- Every line starts with exactly "Host A:" or "Sabian:" — no exceptions
- Strict alternating dialogue — no monologues
- Host A always opens first. Her first word is always "Sabian,"
- Host A asks the hard questions. Sabian answers with dollar figures and named accounts only
- Target: 90 seconds of spoken audio (~700-900 characters total)
- No markdown, no bold, no asterisks, no narration`;

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎙️  PNSIQ CEO Brief — Sabian Intelligence Engine\n');

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) { console.error('❌ ANTHROPIC_API_KEY not set in .env'); process.exit(1); }

  const bundle = buildBundle();
  console.log('📊 Pipeline bundle built — sending to Sabian...\n');

  // 1. Generate script via Claude (Sonnet 4.6)
  const client = new Anthropic({ apiKey: anthropicKey });
  const resp   = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 700,
    system:     SYSTEM,
    messages:   [{ role: 'user', content: bundle }],
  });

  const script = resp.content[0].text.trim();
  const lines  = parseLines(script);

  console.log('📝 Script generated:\n');
  lines.forEach(l => console.log(`  [${l.speaker === 'host_a' ? 'Host A' : 'Sabian'}] ${l.text}`));
  console.log('');

  // 2. Log to hive — behavioral and structural patterns only, no client data
  const silentAccountCount   = 3;    // how many A-tier accounts went silent simultaneously
  const maxSilenceDays       = 89;   // longest silence observed (Cedar — structural, not named)
  const disputeWindowDays    = 5;    // shortest window remaining across open disputes
  const decisionLatencyDays  = 18;   // days COO left markdown proposal unanswered
  const repsBelowQuotaPct    = Math.round(((DATA.reps_total - DATA.reps_on_quota) / DATA.reps_total) * 100);
  const carryToRevenueRatio  = parseFloat((DATA.carry_total / DATA.revenue_mtd).toFixed(3));
  const buyerSessionDropPct  = 31;   // FW26 engagement vs prior year at same point in season

  logToHive({
    source: 'pnsiq_brief',
    level:  'intel',
    event:  'wholesale_brief_pattern',
    data: {
      domain:             'wholesale_apparel',
      signals: {
        account_silence_cluster:     silentAccountCount,   // N A-tier accounts silent in same window → systemic, not isolated
        max_account_silence_days:    maxSilenceDays,       // how long silence runs before it shows up in a brief
        dispute_urgency_horizon:     disputeWindowDays,    // shortest window remaining — urgency curve shape
        executive_decision_latency:  decisionLatencyDays,  // COO/CFO stall time on time-sensitive proposals
        rep_below_quota_pct:         repsBelowQuotaPct,    // % of field force underperforming at brief time
        carry_to_mtd_revenue_ratio:  carryToRevenueRatio,  // dead stock pressure relative to in-month revenue
        buyer_engagement_delta_pct:  -buyerSessionDropPct, // YoY buyer session drop at equivalent season point
      },
      brief_structure: {
        line_count:   lines.length,
        speaker_turn_ratio: {
          host_a: lines.filter(l => l.speaker === 'host_a').length,
          sabian:  lines.filter(l => l.speaker === 'sabian').length,
        },
        vectors_present: ['chargebacks', 'account_retention', 'dead_stock', 'revenue_windows', 'rep_performance', 'buyer_sessions'],
        model: 'claude-sonnet-4-6',
      },
    },
    tags: ['wholesale', 'apparel', 'account_silence', 'dispute_urgency', 'carry_pressure', 'ceo_brief'],
  });

  // 3. Generate audio per line via ElevenLabs
  const voiceIds = { host_a: template.voices.host_a, sabian: template.voices.sabian };
  const buffers  = [];

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const voiceId = voiceIds[line.speaker];
    console.log(`🔊 Rendering line ${i + 1}/${lines.length} [${line.speaker}]...`);
    const buf = await ttsLine(line.text, voiceId);
    if (buf) buffers.push(buf);
  }

  // 4. Save transcript (text only — audio is ephemeral, not stored)
  const ts        = new Date().toISOString().replace(/[:.]/g, '-');
  const scriptDir = path.join(__dirname, 'transcripts');
  if (!fs.existsSync(scriptDir)) fs.mkdirSync(scriptDir, { recursive: true });

  const scriptPath = path.join(scriptDir, `pnsiq_ceo_brief_${ts}.txt`);
  fs.writeFileSync(scriptPath, script, 'utf8');
  console.log(`\n📄 Transcript saved: ${scriptPath}`);

  // Audio: single overwrite file for test listening — not archived
  if (buffers.length) {
    const audioDir  = path.join(__dirname, 'my_audio');
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
    const audioPath = path.join(audioDir, 'pnsiq_ceo_brief_latest.mp3');
    fs.writeFileSync(audioPath, Buffer.concat(buffers));
    console.log(`🎧 Audio (overwrite): ${audioPath}`);
  } else {
    console.log('⚠️  Audio skipped — no ElevenLabs key or all lines failed');
  }

  console.log('\n✅ Done.\n');
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  logToHive({ source: 'pnsiq_brief', level: 'error', event: 'run_failed', data: { message: err.message }, tags: ['pnsiq', 'error'] });
  process.exit(1);
});
