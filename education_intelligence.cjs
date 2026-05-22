require('dotenv').config()
const axios = require('axios')

// ─── API base URLs ────────────────────────────────────────────────────────────
const URLS = {
  naep:         'https://www.nationsreportcard.gov/api/api',
  urban:        'https://educationdata.urban.org/api/v1',
  worldbank:    'https://api.worldbank.org/v2',
  oecd:         'https://stats.oecd.org/SDMX-JSON/data',
  unesco:       process.env.UNESCO_UIS_API_URL || 'https://api.uis.unesco.org',
  fred:         'https://api.stlouisfed.org/fred',
}

const FRED_KEY = process.env.FRED_API_KEY

// Simple in-memory cache — keyed by request URL, TTL 6 hours
const _cache = new Map()
const CACHE_TTL = 6 * 60 * 60 * 1000

function fromCache(key) {
  const hit = _cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > CACHE_TTL) { _cache.delete(key); return null }
  return hit.data
}

function toCache(key, data) {
  _cache.set(key, { data, ts: Date.now() })
  return data
}

async function get(url, params = {}) {
  const cacheKey = url + JSON.stringify(params)
  const cached = fromCache(cacheKey)
  if (cached) return cached
  try {
    const res = await axios.get(url, { params, timeout: 10000 })
    return toCache(cacheKey, res.data)
  } catch (err) {
    console.error(`[education_intelligence] fetch failed: ${url}`, err.message)
    return null
  }
}

// ─── NAEP — The Nation's Report Card ─────────────────────────────────────────
// Reading proficiency by state, grade 4 and grade 8.
// Jurisdiction codes: NP = national, state abbreviations (NV, CA, TX, etc.)
async function getNAEPReading(grade = 4, jurisdiction = 'NP') {
  const url = `${URLS.naep}/data/report/studentscore/queryResultsForReport/`
  const data = await get(url, {
    type: 'NP',
    subject: 'reading',
    grade,
    scale: 'RRPCM',
    jurisdiction,
    subscale: 'RRPCM',
    variable: 'TOTAL',
    stattype: 'MN:MN',
    year: 2022,
  })
  if (!data) return null
  return {
    source: 'NAEP',
    grade,
    jurisdiction,
    year: 2022,
    raw: data,
  }
}

// State reading proficiency summary — all 50 states, grade 4
async function getAllStatesReading() {
  const STATE_CODES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
    'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
    'DC',
  ]
  const url = `${URLS.naep}/data/report/studentscore/queryResultsForReport/`
  const data = await get(url, {
    type: 'NP',
    subject: 'reading',
    grade: 4,
    scale: 'RRPCM',
    jurisdiction: ['NP', ...STATE_CODES].join(','),
    subscale: 'RRPCM',
    variable: 'TOTAL',
    stattype: 'MN:MN',
    year: 2022,
  })
  return data ? { source: 'NAEP', year: 2022, grade: 4, raw: data } : null
}

// ─── Urban Institute — Every US school ───────────────────────────────────────
// School directory by NCES ID, or search by state/district
async function getSchoolData(ncesId) {
  const data = await get(`${URLS.urban}/schools/ccd/directory/${ncesId}/`)
  return data ? { source: 'UrbanInstitute', ncesId, raw: data } : null
}

async function getSchoolsByState(stateCode, year = 2021) {
  const data = await get(`${URLS.urban}/schools/ccd/directory/`, {
    state_code: stateCode,
    year,
    per_page: 100,
  })
  return data ? { source: 'UrbanInstitute', state: stateCode, year, raw: data } : null
}

async function getTitleISchools(stateCode, year = 2021) {
  const data = await get(`${URLS.urban}/schools/ccd/directory/`, {
    state_code: stateCode,
    title_i_status: 1,
    year,
    per_page: 100,
  })
  return data ? { source: 'UrbanInstitute', state: stateCode, titleI: true, year, raw: data } : null
}

// ─── World Bank — Global education indicators ─────────────────────────────────
// indicator codes:
//   SE.ADT.LITR.ZS  — Adult literacy rate (% of people age 15+)
//   SE.PRM.CMPT.ZS  — Primary completion rate
//   SE.XPD.TOTL.GD.ZS — Government expenditure on education (% of GDP)
//   SE.PRM.ENRR     — School enrollment, primary (% gross)
async function getWorldBankIndicator(indicator, countryCode = 'all', mrv = 1) {
  const url = `${URLS.worldbank}/country/${countryCode}/indicator/${indicator}`
  const data = await get(url, { format: 'json', mrv, per_page: 300 })
  if (!data || !Array.isArray(data) || !data[1]) return null
  return {
    source: 'WorldBank',
    indicator,
    countryCode,
    records: data[1].filter(r => r.value !== null).map(r => ({
      country: r.country?.value,
      countryCode: r.countryiso3code,
      year: r.date,
      value: r.value,
    })),
  }
}

async function getGlobalLiteracyRates() {
  return getWorldBankIndicator('SE.ADT.LITR.ZS', 'all', 1)
}

async function getEducationSpendingByGDP() {
  return getWorldBankIndicator('SE.XPD.TOTL.GD.ZS', 'all', 1)
}

async function getCountryEducationProfile(iso2Code) {
  const [literacy, spending, enrollment, completion] = await Promise.all([
    getWorldBankIndicator('SE.ADT.LITR.ZS', iso2Code, 5),
    getWorldBankIndicator('SE.XPD.TOTL.GD.ZS', iso2Code, 5),
    getWorldBankIndicator('SE.PRM.ENRR', iso2Code, 5),
    getWorldBankIndicator('SE.PRM.CMPT.ZS', iso2Code, 5),
  ])
  return { source: 'WorldBank', country: iso2Code, literacy, spending, enrollment, completion }
}

// ─── OECD — PISA reading scores ───────────────────────────────────────────────
async function getPISAReading() {
  const data = await get(
    `${URLS.oecd}/PISA/REA+MAT+SCI.TOT+BOY+GIR.OEC+OAVG..MEAN/all`,
    { contentType: 'application/json' }
  )
  return data ? { source: 'OECD', dataset: 'PISA', raw: data } : null
}

// ─── UNESCO UIS — Global literacy and out-of-school data ──────────────────────
async function getUNESCOIndicator(indicatorCode, countryCode = null) {
  const params = { indicator: indicatorCode }
  if (countryCode) params.country = countryCode
  const data = await get(`${URLS.unesco}/api/public/data`, params)
  return data ? { source: 'UNESCO', indicator: indicatorCode, countryCode, raw: data } : null
}

async function getOutOfSchoolChildren() {
  // UNESCOs OOSC indicator
  return getUNESCOIndicator('ROFST.1.cp')
}

async function getYouthLiteracyRates() {
  return getUNESCOIndicator('LR.AG15T24.F')
}

// ─── FRED — Economic correlation layer ────────────────────────────────────────
async function getFREDSeries(seriesId, limit = 12) {
  if (!FRED_KEY) return null
  const data = await get(`${URLS.fred}/series/observations`, {
    series_id: seriesId,
    api_key: FRED_KEY,
    file_type: 'json',
    sort_order: 'desc',
    limit,
  })
  if (!data?.observations) return null
  return {
    source: 'FRED',
    seriesId,
    observations: data.observations.map(o => ({ date: o.date, value: parseFloat(o.value) })),
  }
}

async function getUnemploymentRate()   { return getFREDSeries('UNRATE', 24) }
async function getChildPovertyRate()   { return getFREDSeries('CPIAUCSL', 12) }

// ─── Master snapshot — everything Sabian needs for a briefing ─────────────────
// Pass a context object to scope the pull. All fields optional.
// { stateCode: 'NV', countryCode: 'US', iso2: 'US', ncesId: null }
async function getEducationSnapshot(context = {}) {
  const { stateCode = null, iso2 = 'US', ncesId = null } = context

  const tasks = {
    naep_national:    getNAEPReading(4, 'NP'),
    naep_state:       stateCode ? getNAEPReading(4, stateCode) : Promise.resolve(null),
    naep_grade8:      getNAEPReading(8, stateCode || 'NP'),
    titleI_schools:   stateCode ? getTitleISchools(stateCode) : Promise.resolve(null),
    school:           ncesId ? getSchoolData(ncesId) : Promise.resolve(null),
    global_literacy:  getGlobalLiteracyRates(),
    edu_spending:     getEducationSpendingByGDP(),
    country_profile:  iso2 ? getCountryEducationProfile(iso2) : Promise.resolve(null),
    pisa:             getPISAReading(),
    oosc:             getOutOfSchoolChildren(),
    youth_literacy:   getYouthLiteracyRates(),
    unemployment:     getUnemploymentRate(),
  }

  const results = {}
  await Promise.allSettled(
    Object.entries(tasks).map(async ([key, promise]) => {
      results[key] = await promise
    })
  )

  return {
    fetched_at: new Date().toISOString(),
    context,
    data: results,
  }
}

module.exports = {
  // NAEP
  getNAEPReading,
  getAllStatesReading,
  // Urban Institute
  getSchoolData,
  getSchoolsByState,
  getTitleISchools,
  // World Bank
  getWorldBankIndicator,
  getGlobalLiteracyRates,
  getEducationSpendingByGDP,
  getCountryEducationProfile,
  // OECD
  getPISAReading,
  // UNESCO
  getUNESCOIndicator,
  getOutOfSchoolChildren,
  getYouthLiteracyRates,
  // FRED
  getFREDSeries,
  getUnemploymentRate,
  // Master
  getEducationSnapshot,
}
