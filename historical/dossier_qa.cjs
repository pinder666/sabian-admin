// historical/dossier_qa.cjs
// Sabian Q&A — buyers type a specific question, Sabian answers from the data.
// Host A voices the question. Sabian answers from the full intelligence picture.
//
// Standalone usage:
//   node historical/dossier_qa.cjs --country Sudan --question "What does the food security data tell us?"
//
// Programmatic usage:
//   const { runQA } = require('./dossier_qa.cjs');
//   const result = await runQA('Sudan', 'What is driving the score?');
//
// Drill mode:
//   node historical/dossier_qa.cjs --country Sudan --drill "governance is declining"

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { generateDossier } = require('./dossier_generator.cjs');
const { askSabian, drillDeeper, generateReasonedHostAQuestion } = require('./sabian_reasoning_engine.cjs');

const SEPARATOR = '═'.repeat(70);
const THIN_SEP = '─'.repeat(70);

function printHeader(country, question, type = 'Q&A') {
  console.log('');
  console.log(SEPARATOR);
  console.log(`  SABIAN INTELLIGENCE — ${type.toUpperCase()}`);
  console.log(`  Country: ${country}`);
  console.log(SEPARATOR);
  console.log('');
  console.log(`  HOST A: "${question}"`);
  console.log('');
  console.log(THIN_SEP);
  console.log('  SABIAN:');
  console.log(THIN_SEP);
  console.log('');
}

function printAnswer(text) {
  // Word-wrap at 70 chars for clean console output
  const paragraphs = text.split(/\n\n+/);
  for (const para of paragraphs) {
    const words = para.split(' ');
    let line = '  ';
    for (const word of words) {
      if ((line + word).length > 72) {
        console.log(line.trimEnd());
        line = '  ' + word + ' ';
      } else {
        line += word + ' ';
      }
    }
    if (line.trim()) console.log(line.trimEnd());
    console.log('');
  }
}

// ── Run a Q&A session ─────────────────────────────────────────────────────────

async function runQA(country, question, options = {}) {
  const { verbose = false, dossierData: existingDossier } = options;

  // Load or use provided dossier
  let dossierData = existingDossier;
  if (!dossierData) {
    if (verbose) process.stdout.write(`  Loading ${country} intelligence...`);
    try {
      dossierData = await generateDossier(country);
      if (verbose) console.log(' done.');
    } catch (err) {
      console.error(`  Failed to load dossier for ${country}: ${err.message}`);
      return null;
    }
  }

  // Ask Sabian
  if (verbose) process.stdout.write('  Reasoning...');
  const result = await askSabian(country, question, dossierData);
  if (verbose) console.log(' done.');

  return {
    ...result,
    dossierData
  };
}

// ── Run a drill-down session ──────────────────────────────────────────────────

async function runDrill(country, finding, options = {}) {
  const { verbose = false, dossierData: existingDossier } = options;

  let dossierData = existingDossier;
  if (!dossierData) {
    if (verbose) process.stdout.write(`  Loading ${country} intelligence...`);
    try {
      dossierData = await generateDossier(country);
      if (verbose) console.log(' done.');
    } catch (err) {
      console.error(`  Failed to load dossier for ${country}: ${err.message}`);
      return null;
    }
  }

  if (verbose) process.stdout.write('  Drilling down...');
  const result = await drillDeeper(country, finding, dossierData);
  if (verbose) console.log(' done.');

  return {
    ...result,
    dossierData
  };
}

// ── Run full Host A session ───────────────────────────────────────────────────
// Combines: reasoned overview + Host A closing question + optional buyer questions

async function runFullSession(country, buyerQuestions = []) {
  console.log(`\n  Loading ${country} intelligence...`);
  const dossierData = await generateDossier(country);

  // Load score summary for display
  const p1 = dossierData.pages?.find(p => p.pageNumber === 1)?.content;
  console.log(`  Score: ${p1?.score} | Band: ${p1?.riskBand} | Elevated: ${p1?.elevatedSignalCount} signals`);

  const results = {
    country,
    score: p1?.score,
    band: p1?.riskBand,
    qa: [],
    hostAClosing: null
  };

  // Run buyer questions
  for (const question of buyerQuestions) {
    printHeader(country, question);
    const result = await askSabian(country, question, dossierData);
    printAnswer(result.sabianAnswer);
    results.qa.push(result);
  }

  // Host A closing question — always last
  printHeader(country, 'What is the most important piece of information this buyer is not asking about that they need to know right now?', 'CLOSING');
  const closing = await generateReasonedHostAQuestion(country, dossierData);
  printAnswer(closing.sabianAnswer);
  results.hostAClosing = closing;

  console.log(SEPARATOR);
  console.log('  END OF SABIAN BRIEFING');
  console.log(SEPARATOR);
  console.log('');

  return results;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const country = getArg('--country');
  const question = getArg('--question');
  const drill = getArg('--drill');
  const session = args.includes('--session');

  if (!country) {
    console.log('');
    console.log('Sabian Q&A — Usage:');
    console.log('');
    console.log('  Single question:');
    console.log('    node historical/dossier_qa.cjs --country Sudan --question "What is driving the score?"');
    console.log('');
    console.log('  Drill into a pattern:');
    console.log('    node historical/dossier_qa.cjs --country Sudan --drill "governance has been declining for 3 years"');
    console.log('');
    console.log('  Full briefing session:');
    console.log('    node historical/dossier_qa.cjs --country Sudan --session');
    console.log('');
    process.exit(0);
  }

  if (drill) {
    printHeader(country, `Explain this pattern in depth: "${drill}"`, 'DRILL');
    const result = await runDrill(country, drill, { verbose: true });
    if (result) printAnswer(result.sabianDrillDown);
  } else if (session) {
    // Demo session with example questions
    await runFullSession(country, [
      'What is the primary driver of the current score?',
      'What does the behavioral data tell us that the institutional score does not?'
    ]);
  } else if (question) {
    printHeader(country, question);
    const result = await runQA(country, question, { verbose: true });
    if (result) printAnswer(result.sabianAnswer);
  } else {
    console.log('  Specify --question, --drill, or --session');
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

module.exports = { runQA, runDrill, runFullSession };
