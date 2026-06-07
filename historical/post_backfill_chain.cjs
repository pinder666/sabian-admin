// historical/post_backfill_chain.cjs
// Runs automatically after a signal backfill completes.
// Chain: signal ingestion → baseline rebuild → convergence rescore → holdout validation
//        → nightly pattern matcher → deep intelligence mining → cross-dimensional analysis
//
// This is the full end-to-end pipeline. When new data lands, run this and the system
// is fully up-to-date. Triggered automatically by ingest_runner.cjs on completion.
//
// Usage: node historical/post_backfill_chain.cjs --signal gee_fire
//        node historical/post_backfill_chain.cjs --signal gdelt
//        node historical/post_backfill_chain.cjs --all
//        node historical/post_backfill_chain.cjs --all --skip-mining  (skip heavy mining steps)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const LOG  = path.join(__dirname, 'post_backfill_chain.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

function runScript(script, args = []) {
  return new Promise((resolve, reject) => {
    log(`▶  Starting: ${script} ${args.join(' ')}`);
    const proc = spawn('node', [path.join(ROOT, script), ...args], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    proc.stdout.on('data', d => { out += d; process.stdout.write(d); });
    proc.stderr.on('data', d => { err += d; process.stderr.write(d); });
    proc.on('close', code => {
      if (code === 0) {
        log(`✅ Done: ${script}`);
        resolve(out);
      } else {
        log(`❌ Failed: ${script} (exit ${code})`);
        reject(new Error(`${script} exited ${code}: ${err.slice(0, 300)}`));
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const signal     = args.includes('--signal') ? args[args.indexOf('--signal') + 1] : null;
  const skipMining = args.includes('--skip-mining');

  log('═══════════════════════════════════════════════');
  log('POST-BACKFILL CHAIN');
  log(`Signal: ${signal || 'all'}`);
  log('Chain: baseline_discovery → convergence_history → holdout_validation → pattern_matcher_nightly → deep_intelligence_mining → cross_dimensional_analysis');
  if (skipMining) log('NOTE: --skip-mining flag set. Steps 5–6 will be skipped.');
  log('═══════════════════════════════════════════════');

  try {
    // Step 0: Rebuild reliability map — registers any new signals that landed since last run.
    // Without this, new signals never enter the scoring tier system no matter how much data they have.
    log('\nSTEP 0: Rebuilding signal reliability map (all signals with data)...');
    await runScript('historical/reliability_map.cjs');

    // Step 1: Rebuild baselines from fresh signal data
    log('\nSTEP 1: Rebuilding signal baselines from real data...');
    await runScript('historical/baseline_discovery.cjs');

    // Step 2: Re-score all country-years using fresh baselines + new signals
    // This is what generates Sudan 2022-2023, Ukraine 2021-2022, etc.
    // Without this step, time machine returns nothing for recently-populated years.
    log('\nSTEP 2: Re-running historical convergence scoring (all country-years)...');
    await runScript('historical/convergence_history.cjs');

    // Step 3: Re-run holdout validation (1000+ pattern tests against new scores)
    log('\nSTEP 3: Running holdout validation (pattern tests)...');
    await runScript('historical/holdout_validation.cjs');

    // Step 4: Re-run nightly pattern matcher to refresh daily report
    log('\nSTEP 4: Refreshing nightly pattern report...');
    await runScript('historical/pattern_matcher_nightly.cjs');

    if (!skipMining) {
      // Step 5: Re-run deep intelligence mining on extended dataset
      // This discovers new patterns from additional historical data.
      // Skip with --skip-mining if you only need scores updated, not full pattern discovery.
      log('\nSTEP 5: Re-running deep intelligence mining (pattern discovery on extended dataset)...');
      await runScript('historical/deep_intelligence_mining.cjs');

      // Step 6: Re-run cross-dimensional analysis
      log('\nSTEP 6: Re-running cross-dimensional analysis...');
      await runScript('historical/cross_dimensional_analysis.cjs');
    } else {
      log('\nSTEPS 5-6 SKIPPED (--skip-mining flag).');
      log('  Run manually: node historical/deep_intelligence_mining.cjs');
      log('  Run manually: node historical/cross_dimensional_analysis.cjs');
    }

    log('\n✅ POST-BACKFILL CHAIN COMPLETE');
    log('Baselines rebuilt. Scores recomputed. Pattern tests run. Report refreshed.');
    if (!skipMining) log('Deep intelligence mining and cross-dimensional analysis re-run on extended dataset.');
    log('Time machine now answers Sudan 2023, Ukraine 2022, and all pre-1789 years.');
    log('Next: check historical/SABIAN_INTELLIGENCE_FINDINGS.md for updated findings.');

  } catch (err) {
    log(`\n❌ CHAIN FAILED at: ${err.message}`);
    log('  Partial steps may have completed. Check log above for last successful step.');
    log('  Resume by running the failed script directly, then re-run post_backfill_chain.');
    process.exit(1);
  }
}

main();
