// pipeline_risk_feed.cjs
// Pipeline Risk Signal — oil/gas pipeline infrastructure vulnerability
// Source: Global Energy Monitor pipeline tracker + static curated data
// Score 0–100: higher = country has strategically important pipelines at risk
// Logic: Pipeline countries that also have high conflict scores are chokepoints
//   for energy supply. Russia-Ukraine pipeline disruption, Middle East oil trunk lines,
//   West Africa gas pipelines — all physically real and verifiable.
// Cadence: static (GEM updates quarterly) — 2160h review window

require('dotenv').config({ path: './.env' });
const { logToHive } = require('./logger.cjs');

// PIPELINE_DATA: DISABLED — hardcoded data removed, awaiting live feed
// To restore: uncomment the table and function body below
/*
const PIPELINE_DATA = {
  'Russia':       { pipeline_km: 250000, strategic_score: 95, transit: true,  type: 'gas+oil' },
  'Ukraine':      { pipeline_km: 38000,  strategic_score: 88, transit: true,  type: 'gas'     },
  'Kazakhstan':   { pipeline_km: 22000,  strategic_score: 72, transit: true,  type: 'oil+gas' },
  'Azerbaijan':   { pipeline_km: 5000,   strategic_score: 70, transit: true,  type: 'oil+gas' },
  'Iran':         { pipeline_km: 45000,  strategic_score: 82, transit: false, type: 'gas+oil' },
  'Saudi Arabia': { pipeline_km: 20000,  strategic_score: 88, transit: false, type: 'oil+gas' },
  'Iraq':         { pipeline_km: 8000,   strategic_score: 78, transit: false, type: 'oil'     },
  'UAE':          { pipeline_km: 5000,   strategic_score: 70, transit: true,  type: 'oil+gas' },
  'Turkey':       { pipeline_km: 15000,  strategic_score: 82, transit: true,  type: 'gas+oil' },
  'Libya':        { pipeline_km: 6000,   strategic_score: 72, transit: false, type: 'oil+gas' },
  'Algeria':      { pipeline_km: 14000,  strategic_score: 75, transit: true,  type: 'gas'     },
  'Egypt':        { pipeline_km: 10000,  strategic_score: 70, transit: true,  type: 'gas+oil' },
  'Nigeria':      { pipeline_km: 4000,   strategic_score: 72, transit: false, type: 'oil+gas' },
  'Chad':         { pipeline_km: 1100,   strategic_score: 55, transit: false, type: 'oil'     },
  'South Sudan':  { pipeline_km: 1600,   strategic_score: 60, transit: false, type: 'oil'     },
  'Sudan':        { pipeline_km: 3000,   strategic_score: 58, transit: true,  type: 'oil'     },
  'China':        { pipeline_km: 120000, strategic_score: 80, transit: false, type: 'gas+oil' },
  'Myanmar':      { pipeline_km: 2000,   strategic_score: 55, transit: true,  type: 'gas'     },
  'Mozambique':   { pipeline_km: 1200,   strategic_score: 52, transit: false, type: 'gas'     },
  'Angola':       { pipeline_km: 2000,   strategic_score: 55, transit: false, type: 'oil'     },
  'Colombia':     { pipeline_km: 9000,   strategic_score: 62, transit: false, type: 'oil+gas' },
  'Venezuela':    { pipeline_km: 8000,   strategic_score: 65, transit: false, type: 'oil'     },
  'Mexico':       { pipeline_km: 14000,  strategic_score: 68, transit: false, type: 'oil+gas' },
  'Argentina':    { pipeline_km: 35000,  strategic_score: 65, transit: false, type: 'gas'     },
  'Bolivia':      { pipeline_km: 6000,   strategic_score: 60, transit: true,  type: 'gas'     },
  'Peru':         { pipeline_km: 4000,   strategic_score: 52, transit: false, type: 'gas'     },
  'Ecuador':      { pipeline_km: 1500,   strategic_score: 55, transit: false, type: 'oil'     },
  'Pakistan':     { pipeline_km: 12000,  strategic_score: 62, transit: true,  type: 'gas'     },
  'India':        { pipeline_km: 18000,  strategic_score: 65, transit: false, type: 'gas+oil' },
  'Turkmenistan': { pipeline_km: 7500,   strategic_score: 72, transit: true,  type: 'gas'     },
  'Uzbekistan':   { pipeline_km: 12000,  strategic_score: 65, transit: true,  type: 'gas'     },
  'Afghanistan':  { pipeline_km: 500,    strategic_score: 45, transit: true,  type: 'gas'     },
  'Serbia':       { pipeline_km: 3000,   strategic_score: 58, transit: true,  type: 'gas'     },
  'Bulgaria':     { pipeline_km: 2500,   strategic_score: 55, transit: true,  type: 'gas'     },
  'Hungary':      { pipeline_km: 5000,   strategic_score: 58, transit: true,  type: 'gas'     },
  'Romania':      { pipeline_km: 14000,  strategic_score: 60, transit: false, type: 'gas+oil' },
  'Poland':       { pipeline_km: 12000,  strategic_score: 58, transit: true,  type: 'gas'     },
  'Belarus':      { pipeline_km: 8000,   strategic_score: 70, transit: true,  type: 'gas+oil' },
  'Germany':      { pipeline_km: 50000,  strategic_score: 72, transit: true,  type: 'gas'     },
  'Norway':       { pipeline_km: 8000,   strategic_score: 78, transit: false, type: 'gas+oil' },
  'Indonesia':    { pipeline_km: 8000,   strategic_score: 62, transit: false, type: 'gas'     },
  'Malaysia':     { pipeline_km: 5000,   strategic_score: 60, transit: false, type: 'gas'     },
  'Thailand':     { pipeline_km: 4000,   strategic_score: 55, transit: false, type: 'gas'     },
  'Vietnam':      { pipeline_km: 2500,   strategic_score: 52, transit: false, type: 'gas'     },
  'Yemen':        { pipeline_km: 1800,   strategic_score: 68, transit: false, type: 'oil+gas' },
  'Oman':         { pipeline_km: 3000,   strategic_score: 60, transit: false, type: 'gas'     },
  'Qatar':        { pipeline_km: 3500,   strategic_score: 72, transit: false, type: 'gas'     },
  'Israel':       { pipeline_km: 1500,   strategic_score: 55, transit: false, type: 'gas'     },
  'Cyprus':       { pipeline_km: 200,    strategic_score: 40, transit: false, type: 'gas'     },
  'Greece':       { pipeline_km: 2000,   strategic_score: 52, transit: true,  type: 'gas'     },
  'Italy':        { pipeline_km: 32000,  strategic_score: 68, transit: true,  type: 'gas'     },
  'Spain':        { pipeline_km: 10000,  strategic_score: 60, transit: false, type: 'gas'     },
  'Morocco':      { pipeline_km: 1500,   strategic_score: 48, transit: true,  type: 'gas'     },
  'Tunisia':      { pipeline_km: 1000,   strategic_score: 45, transit: true,  type: 'gas'     },
  'Senegal':      { pipeline_km: 800,    strategic_score: 48, transit: false, type: 'gas'     },
  'Mauritania':   { pipeline_km: 500,    strategic_score: 42, transit: false, type: 'gas'     },
  'Tanzania':     { pipeline_km: 500,    strategic_score: 40, transit: false, type: 'gas'     },
  'Cameroon':     { pipeline_km: 900,    strategic_score: 45, transit: true,  type: 'oil'     },
  'Gabon':        { pipeline_km: 800,    strategic_score: 48, transit: false, type: 'oil'     },
  'DRC':          { pipeline_km: 300,    strategic_score: 35, transit: false, type: 'oil'     },
  'Ethiopia':     { pipeline_km: 200,    strategic_score: 35, transit: false, type: 'oil'     },
  'Kenya':        { pipeline_km: 900,    strategic_score: 42, transit: false, type: 'oil'     },
  'Uganda':       { pipeline_km: 300,    strategic_score: 38, transit: false, type: 'oil'     }
};
*/

async function fetchPipelineRiskData(country) {
  return { score: null, reason: 'no_live_feed', coverage: false };
}

module.exports = { fetchPipelineRiskData };
