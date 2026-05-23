// lock_forward_observations.cjs
// Step 25 — Lock 5 timestamped forward observations in the ledger.
// Run once: node lock_forward_observations.cjs
// These are public, irrevocable predictions made 2026-05-23.
// Grading happens automatically when window_closes_at passes.

require('dotenv').config({ path: './.env' });
const { createObservation } = require('./observation_ledger.cjs');

// Five forward observations locked May 23, 2026
// Rationale: chosen for strength of signal convergence + trajectory
const FORWARD_OBSERVATIONS = [
  {
    country:             'Sudan',
    scan_date:           '2026-05-23',
    convergence_score:   92,
    risk_level:          'CRITICAL',
    previous_risk_level: 'WARNING',
    direction:           'ASCENDING',
    // Prediction: Sudan's systemic convergence (conflict, displacement, food collapse,
    // governance failure, sanctions) will hold at CRITICAL or worsen for 30 days.
    // Window closes 2026-06-22. Graded against live Sabian score on close.
  },
  {
    country:             'South Sudan',
    scan_date:           '2026-05-23',
    convergence_score:   83,
    risk_level:          'CRITICAL',
    previous_risk_level: 'WARNING',
    direction:           'ASCENDING',
    // Prediction: South Sudan's conflict+displacement convergence holds CRITICAL.
    // Window closes 2026-06-22.
  },
  {
    country:             'Afghanistan',
    scan_date:           '2026-05-23',
    convergence_score:   80,
    risk_level:          'WARNING',
    previous_risk_level: 'ELEVATED',
    direction:           'ASCENDING',
    // Prediction: Afghanistan's governance collapse + food insecurity + displacement
    // will cross from WARNING to CRITICAL within 55 days.
    // Window closes 2026-07-17.
  },
  {
    country:             'DRC',
    scan_date:           '2026-05-23',
    convergence_score:   79,
    risk_level:          'WARNING',
    previous_risk_level: 'ELEVATED',
    direction:           'ASCENDING',
    // Prediction: DRC's eastern conflict + displacement signals are ascending.
    // Expect WARNING to hold or cross CRITICAL within 55 days.
    // Window closes 2026-07-17.
  },
  {
    country:             'Ethiopia',
    scan_date:           '2026-05-23',
    convergence_score:   74,
    risk_level:          'WARNING',
    previous_risk_level: 'ELEVATED',
    direction:           'ASCENDING',
    // Prediction: Ethiopia's Tigray/Amhara pressure + food insecurity ASCENDING.
    // Watching for WARNING → CRITICAL crossing within 55 days.
    // Window closes 2026-07-17.
  }
];

async function lockObservations() {
  console.log('\nSabian — Locking 5 Forward Observations');
  console.log('Date: 2026-05-23 | These predictions are now public and irrevocable.');
  console.log('='.repeat(60));

  let locked = 0;
  for (const obs of FORWARD_OBSERVATIONS) {
    process.stdout.write(`  Locking: ${obs.country} (${obs.risk_level}, ${obs.direction})...`);
    try {
      await createObservation(obs);
      console.log(' LOCKED');
      locked++;
    } catch (err) {
      console.log(` FAILED: ${err.message}`);
    }
  }

  console.log(`\n${locked}/${FORWARD_OBSERVATIONS.length} observations locked.`);
  console.log('\nPrediction windows:');
  FORWARD_OBSERVATIONS.forEach(o => {
    const d = new Date(o.scan_date);
    const windowDays = o.risk_level === 'CRITICAL' ? 30 : 55;
    d.setDate(d.getDate() + windowDays);
    const closes = d.toISOString().slice(0, 10);
    console.log(`  ${o.country.padEnd(15)} ${o.direction.padEnd(12)} closes ${closes}`);
  });
  console.log('\nSabian will self-grade each prediction when the window closes.');
}

lockObservations().catch(console.error);
