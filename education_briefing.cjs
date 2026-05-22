require('dotenv').config()
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const { getNAEPReading, getWorldBankIndicator } = require('./education_intelligence.cjs')

const edu = require('./sabian_education_prompt.json')

// ─── Extract NAEP mean score from raw API response ────────────────────────────
function extractNAEPScore(raw) {
  if (!raw) return null
  const result = raw?.result ?? raw?.data ?? raw
  if (Array.isArray(result) && result.length > 0) {
    const row = result[0]
    return row?.Value ?? row?.value ?? row?.MN ?? row?.score ?? null
  }
  return null
}

// ─── Format benchmark context string for prompt injection ────────────────────
function buildBenchmarkContext({ naep_national, naep_state, stateCode, literacy_global }) {
  const lines = []

  const natScore = extractNAEPScore(naep_national?.raw)
  const stScore  = extractNAEPScore(naep_state?.raw)

  if (natScore) {
    lines.push(`NAEP 2022 Grade 4 Reading — National mean: ${natScore} (Below Basic threshold: 208)`)
  } else {
    lines.push(`NAEP 2022 Grade 4 Reading — National reference mean: 217 (Below Basic threshold: 208)`)
  }

  if (stScore && stateCode) {
    lines.push(`NAEP 2022 Grade 4 Reading — ${stateCode} mean: ${stScore}`)
  }

  if (literacy_global?.records?.length) {
    const usRecord = literacy_global.records.find(r => r.countryCode === 'USA')
    if (usRecord) lines.push(`World Bank adult literacy — US: ${usRecord.value?.toFixed(1)}%`)
    const sum = literacy_global.records.reduce((s, r) => s + (r.value || 0), 0)
    const globalAvg = sum / literacy_global.records.length
    if (globalAvg) lines.push(`World Bank adult literacy — global average: ${globalAvg.toFixed(1)}%`)
  }

  return lines.join('\n')
}

// ─── Build the full system prompt — mirrors how insight_engine.cjs does it ───
function buildSystemPrompt(tier, benchmarkContext) {
  const tierInstruction = edu.experience_tiers[tier] ?? edu.experience_tiers.teacher_briefing

  return `Identity: ${JSON.stringify(edu.identity)}
Directives: ${JSON.stringify(edu.directives)}
Personality: ${JSON.stringify(edu.personality)}
Simulation: ${JSON.stringify(edu.simulation)}
VoiceScript: ${JSON.stringify(edu.voiceScript)}
Protocol Knowledge: ${JSON.stringify(edu.protocol_knowledge)}
Intel: ${JSON.stringify(edu.intel)}
Instructions: ${JSON.stringify(edu.instructions)}

Experience Tier — ${tier}: ${tierInstruction}

Benchmark data for this briefing:
${benchmarkContext}

OUTPUT RULES — MANDATORY:
- Dialogue ONLY. Every line starts with "Host A:" or "Sabian:"
- Host A opens. Host A closes with: "Sixty seconds. Excellent work."
- 6 to 8 lines total
- No bullets, no markdown, no stage directions, no headings
- Sabian references specific numbers from the data provided
- One concrete action at the end. Not three. One.`
}

// ─── Generate a district intelligence briefing ────────────────────────────────
// This is the only Sabian voiced briefing in the product hierarchy.
// Teachers get the UI. Principals get school stats. District heads get this.
async function generateTeacherBriefing({
  teacherName = 'Superintendent',
  schoolName  = 'School District',
  stateCode   = null,
  grade       = 4,
  classData   = null,
  tier        = 'district_intelligence',
} = {}) {
  const [naep_national, naep_state, literacy_global] = await Promise.all([
    getNAEPReading(grade, 'NP').catch(() => null),
    stateCode ? getNAEPReading(grade, stateCode).catch(() => null) : Promise.resolve(null),
    getWorldBankIndicator('SE.ADT.LITR.ZS', 'all', 1).catch(() => null),
  ])

  const benchmarkContext = buildBenchmarkContext({ naep_national, naep_state, stateCode, literacy_global })

  const classSection = classData
    ? `Class session data this week:\n${typeof classData === 'string' ? classData : JSON.stringify(classData, null, 2)}`
    : `No class session data provided. Generate briefing grounded in benchmark context only.`

  const userContent = `Teacher: ${teacherName}
School: ${schoolName}
Grade: ${grade}${stateCode ? `\nState: ${stateCode}` : ''}

${classSection}

Generate the briefing now.`

  const apiKey = process.env.OPENROUTER_API_KEY
  const model  = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4-6'

  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set in .env')

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(tier, benchmarkContext) },
        { role: 'user',   content: userContent },
      ],
      max_tokens: 600,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  )

  const script = response.data.choices?.[0]?.message?.content?.trim() ?? ''

  return {
    script,
    teacher: teacherName,
    school:  schoolName,
    stateCode,
    grade,
    tier,
    benchmarkContext,
    generatedAt: new Date().toISOString(),
  }
}

// ─── District-level briefing shorthand ───────────────────────────────────────
async function generateDistrictBriefing({ districtName = 'School District', stateCode = null, schoolsData = null } = {}) {
  return generateTeacherBriefing({
    teacherName: 'Superintendent',
    schoolName:  districtName,
    stateCode,
    grade: 4,
    classData: schoolsData,
    tier: 'district_intelligence',
  })
}

// ─── Save to /briefings ───────────────────────────────────────────────────────
async function saveBriefing(context = {}) {
  const result  = await generateTeacherBriefing(context)
  const ts      = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir  = path.join(__dirname, 'briefings')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir)
  const outPath = path.join(outDir, `briefing_${ts}.json`)
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.log(`\n✅ Briefing saved: ${outPath}`)
  console.log(`\n📋 Script:\n${result.script}`)
  return result
}

module.exports = { generateTeacherBriefing, generateDistrictBriefing, saveBriefing, buildBenchmarkContext }

// CLI: node education_briefing.cjs
if (require.main === module) {
  saveBriefing({
    teacherName: 'Superintendent Clarke',
    schoolName:  'Greenfield Unified School District',
    stateCode:   'NV',
    grade:       4,
    classData:   null,
  }).catch(err => {
    console.error('❌', err.message)
    process.exit(1)
  })
}
