// election_calendar_feed.cjs
// Election Calendar Signal — pre/post election risk window detection
// Source: IFES ElectionGuide + curated calendar (electionguide.org)
// Score 0–100: higher = closer to election = higher unrest/censorship/currency risk
// Logic: The 90 days before an election and 30 days after are the highest-risk window.
//   Governments suppress dissent, opposition mobilizes, currency volatility spikes.
//   Under military rule or electoral suspension: static elevated score.
// Cadence: static calendar — update when new elections are announced

require('dotenv').config({ path: './.env' });
const { logToHive } = require('./logger.cjs');

// ELECTION_CALENDAR: upcoming and recent elections per country
// date: ISO date of election day (or most recent election)
// type: general | presidential | legislative | referendum | regional
// status: scheduled | held | suspended | military_rule | no_elections
// risk: baseline risk modifier (some elections are higher-stakes)
const ELECTION_CALENDAR = {
  // Under military rule — no elections, permanent suppression risk
  'Mali':          { status: 'military_rule',  score_base: 70 },
  'Burkina Faso':  { status: 'military_rule',  score_base: 70 },
  'Niger':         { status: 'military_rule',  score_base: 65 },
  'Guinea':        { status: 'military_rule',  score_base: 60 },
  'Gabon':         { status: 'military_rule',  score_base: 55 },
  'Chad':          { status: 'military_rule',  score_base: 55 },
  'Myanmar':       { status: 'military_rule',  score_base: 75 },
  'Sudan':         { status: 'military_rule',  score_base: 75 },

  // Active conflict — elections suspended/impossible
  'Yemen':         { status: 'suspended',      score_base: 65 },
  'Syria':         { status: 'suspended',      score_base: 65 },
  'Libya':         { status: 'suspended',      score_base: 60 },
  'South Sudan':   { status: 'suspended',      score_base: 60 },
  'Somalia':       { status: 'suspended',      score_base: 55 },

  // 2026 elections — scheduled or recently held
  'Philippines':   { date: '2026-05-12', type: 'midterm',     status: 'held',      risk: 1.0 },
  'Czech Republic':{ date: '2026-10-09', type: 'legislative', status: 'scheduled', risk: 0.7 },
  'Australia':     { date: '2026-05-03', type: 'general',     status: 'held',      risk: 0.6 },
  'Bolivia':       { date: '2026-10-18', type: 'general',     status: 'scheduled', risk: 1.1 },
  'Ethiopia':      { date: '2026-06-21', type: 'general',     status: 'scheduled', risk: 1.4 },
  'Haiti':         { date: '2026-11-15', type: 'general',     status: 'scheduled', risk: 1.5 },
  'Colombia':      { date: '2026-03-15', type: 'legislative', status: 'held',      risk: 1.0 },
  'Peru':          { date: '2026-04-11', type: 'general',     status: 'held',      risk: 1.2 },
  'Senegal':       { date: '2026-07-31', type: 'legislative', status: 'scheduled', risk: 1.1 },
  'Jordan':        { date: '2026-09-10', type: 'legislative', status: 'scheduled', risk: 1.0 },
  'Tunisia':       { date: '2026-10-15', type: 'legislative', status: 'scheduled', risk: 1.2 },
  'Iran':          { date: '2025-06-28', type: 'presidential',status: 'held',      risk: 1.3 },
  'Venezuela':     { date: '2025-11-21', type: 'regional',    status: 'held',      risk: 1.4 },
  'Tanzania':      { date: '2025-10-29', type: 'general',     status: 'held',      risk: 1.1 },
  'Cameroon':      { date: '2025-10-06', type: 'legislative', status: 'held',      risk: 1.2 },
  'Togo':          { date: '2025-04-28', type: 'presidential',status: 'held',      risk: 1.0 },
  'Rwanda':        { date: '2024-07-15', type: 'presidential',status: 'held',      risk: 1.0 },
  'Mozambique':    { date: '2024-10-09', type: 'general',     status: 'held',      risk: 1.4 },
  'Ghana':         { date: '2024-12-07', type: 'general',     status: 'held',      risk: 1.0 },
  'Nigeria':       { date: '2027-02-20', type: 'general',     status: 'scheduled', risk: 1.3 },
  'Kenya':         { date: '2027-08-12', type: 'general',     status: 'scheduled', risk: 1.2 },
  'India':         { date: '2029-04-01', type: 'general',     status: 'scheduled', risk: 1.1 },
  'Pakistan':      { date: '2024-02-08', type: 'general',     status: 'held',      risk: 1.4 },
  'Bangladesh':    { date: '2024-01-07', type: 'general',     status: 'held',      risk: 1.3 },
  'Indonesia':     { date: '2024-02-14', type: 'general',     status: 'held',      risk: 1.0 },
  'South Africa':  { date: '2024-05-29', type: 'general',     status: 'held',      risk: 1.0 },
  'Mexico':        { date: '2024-06-02', type: 'general',     status: 'held',      risk: 1.0 },
  'United States': { date: '2026-11-03', type: 'midterm',     status: 'scheduled', risk: 0.8 },
  'Brazil':        { date: '2026-10-04', type: 'general',     status: 'scheduled', risk: 1.1 },
  'Argentina':     { date: '2025-10-26', type: 'legislative', status: 'held',      risk: 1.1 },
  'Turkey':        { date: '2028-05-14', type: 'general',     status: 'scheduled', risk: 1.2 },
  'Ukraine':       { status: 'suspended', score_base: 55 },
  'Russia':        { date: '2024-03-17', type: 'presidential',status: 'held',      risk: 1.3 },
  'Belarus':       { status: 'military_rule', score_base: 65 },
  'Azerbaijan':    { date: '2024-02-07', type: 'presidential',status: 'held',      risk: 1.1 },
  'Egypt':         { date: '2023-12-10', type: 'presidential',status: 'held',      risk: 1.1 },
  'Algeria':       { date: '2024-09-07', type: 'presidential',status: 'held',      risk: 1.0 },
  'Morocco':       { date: '2026-09-08', type: 'legislative', status: 'scheduled', risk: 0.9 },
  'Zimbabwe':      { date: '2023-08-23', type: 'general',     status: 'held',      risk: 1.3 },
  'DRC':           { date: '2023-12-20', type: 'general',     status: 'held',      risk: 1.4 },
  'Zambia':        { date: '2026-08-12', type: 'general',     status: 'scheduled', risk: 1.1 },
  'Uganda':        { date: '2026-01-14', type: 'general',     status: 'held',      risk: 1.2 },
  'Ivory Coast':   { date: '2025-10-25', type: 'presidential',status: 'held',      risk: 1.1 },
  'Guinea-Bissau': { date: '2024-06-04', type: 'legislative', status: 'held',      risk: 1.2 },
  'CAR':           { date: '2023-10-22', type: 'legislative', status: 'held',      risk: 1.3 },
  'Taiwan':        { date: '2024-01-13', type: 'general',     status: 'held',      risk: 1.5 },
  'Serbia':        { date: '2027-06-01', type: 'general',     status: 'scheduled', risk: 1.0 },
  'Kosovo':        { date: '2025-02-09', type: 'legislative', status: 'held',      risk: 1.1 },
  'Iraq':          { date: '2025-11-30', type: 'provincial',  status: 'held',      risk: 1.2 },
  'Afghanistan':   { status: 'military_rule', score_base: 72 },
  'North Korea':   { status: 'no_elections',  score_base: 55 },
  'Cuba':          { status: 'no_elections',  score_base: 45 },
  'China':         { status: 'no_elections',  score_base: 40 },
  'Saudi Arabia':  { status: 'no_elections',  score_base: 35 },
  'Eritrea':       { status: 'no_elections',  score_base: 60 },
  'Turkmenistan':  { status: 'no_elections',  score_base: 50 }
};

async function fetchElectionCalendarData(country) {
  try {
    const entry = ELECTION_CALENDAR[country];

    // Country not in calendar — return low base score
    if (!entry) return { score: 10, reason: 'no_election_data', trend: 'stable' };

    // Military rule, no elections, or suspended — static elevated score
    if (['military_rule', 'no_elections', 'suspended'].includes(entry.status)) {
      return {
        score: entry.score_base,
        status: entry.status,
        trend: entry.status === 'military_rule' ? 'suppressed' : 'suspended',
        label: entry.status.replace('_', ' ')
      };
    }

    // Calculate days from election
    const electionDate = new Date(entry.date);
    const today = new Date();
    const daysFromElection = Math.round((today - electionDate) / (1000 * 60 * 60 * 24));
    const riskMult = entry.risk || 1.0;

    let score;
    let window;

    if (daysFromElection < 0) {
      // Future election — within 90 days: escalating risk
      const daysUntil = Math.abs(daysFromElection);
      if (daysUntil <= 30)       score = Math.round(75 * riskMult);
      else if (daysUntil <= 60)  score = Math.round(55 * riskMult);
      else if (daysUntil <= 90)  score = Math.round(40 * riskMult);
      else                       score = Math.round(15 * riskMult);
      window = `${daysUntil} days until ${entry.type}`;
    } else {
      // Past election — 30-day post-election window (results disputes, violence)
      if (daysFromElection <= 14)       score = Math.round(65 * riskMult);
      else if (daysFromElection <= 30)  score = Math.round(45 * riskMult);
      else if (daysFromElection <= 90)  score = Math.round(20 * riskMult);
      else                              score = Math.round(8 * riskMult);
      window = `${daysFromElection} days since ${entry.type}`;
    }

    return {
      score: Math.min(100, score),
      election_date: entry.date,
      election_type: entry.type,
      days_from_election: daysFromElection,
      window,
      trend: score >= 60 ? 'critical_window' : score >= 35 ? 'elevated_window' : 'stable'
    };

  } catch (err) {
    logToHive({ source: 'election_calendar_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchElectionCalendarData };
