// historical/alert_engine.cjs
// Phase 4 Step 9b — Custom Alert Subscriptions
//
// Evaluates all active subscriptions against the current synthesis state.
// Fires when a threshold is crossed. Delivers via webhook POST.
// Runs after live_stream (cron 0730 UTC) so synthesis is always fresh.
//
// Alert types:
//   score_above        — fires when current_score > threshold_value
//   score_below        — fires when current_score < threshold_value
//   trajectory_change  — fires when trajectory changed vs prior synthesis record
//   lead_signal_active — fires when any active lead signal is present
//   cluster_change     — fires when country moved to a different cluster
//
// Delivery: POST to webhook_url with JSON payload. Logs to alert_events.
// If no webhook_url, logs the event but marks delivered=false for manual pickup
// via GET /api/alerts/events.
//
// Usage: node historical/alert_engine.cjs
//        node historical/alert_engine.cjs --dry-run

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const https = require('https');
const http  = require('http');
const { createClient } = require('@supabase/supabase-js');
const { logToHive }    = require('../logger.cjs');
const { logAuditEvent } = require('./audit_chain.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DELIVERY_TIMEOUT_MS = 8000;

// ── Table check ───────────────────────────────────────────────────────────────

async function checkTables() {
  const { error } = await sb.from('alert_subscriptions').select('id').limit(1);
  if (error) {
    console.error('\n❌ Missing table: alert_subscriptions');
    console.error('  Run: historical/MIGRATION_ALERTS.sql in Supabase SQL editor\n');
    process.exit(1);
  }
}

// ── Load subscriptions and synthesis ─────────────────────────────────────────

async function loadActiveSubscriptions() {
  const { data, error } = await sb
    .from('alert_subscriptions')
    .select('*')
    .eq('active', true);
  if (error) throw error;
  return data || [];
}

async function loadCurrentSyntheses() {
  // Returns map: country → synthesis record (most recent year)
  const all = [];
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('synthesis_records')
      .select('country,as_of_year,current_score,trajectory,active_leads,signal_breakdown')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  // Keep most recent year per country
  const latest = {};
  for (const r of all) {
    if (!latest[r.country] || r.as_of_year > latest[r.country].as_of_year) latest[r.country] = r;
  }
  return latest;
}

async function loadCurrentClusters() {
  const { data, error } = await sb
    .from('country_clusters')
    .select('country,cluster_id,cluster_label,as_of_year')
    .order('as_of_year', { ascending: false });
  if (error) return {};
  const latest = {};
  for (const r of (data || [])) {
    if (!latest[r.country]) latest[r.country] = r;
  }
  return latest;
}

// Load prior synthesis for trajectory/cluster comparison
async function loadPriorSyntheses(countries) {
  if (countries.length === 0) return {};
  const prior = {};
  for (const country of countries) {
    const { data } = await sb
      .from('synthesis_records')
      .select('country,as_of_year,trajectory')
      .eq('country', country)
      .order('as_of_year', { ascending: false })
      .limit(2);
    if (data && data.length >= 2) prior[country] = data[1]; // second most recent
  }
  return prior;
}

async function loadPriorClusters(countries) {
  if (countries.length === 0) return {};
  const prior = {};
  for (const country of countries) {
    const { data } = await sb
      .from('country_clusters')
      .select('country,cluster_id,as_of_year')
      .eq('country', country)
      .order('as_of_year', { ascending: false })
      .limit(2);
    if (data && data.length >= 2) prior[country] = data[1];
  }
  return prior;
}

// ── Evaluate subscriptions ────────────────────────────────────────────────────

function evaluate(sub, synthesis, cluster, priorSynth, priorCluster) {
  if (!synthesis) return null;

  switch (sub.alert_type) {

    case 'score_above':
      if (sub.threshold_value === null) return null;
      if (synthesis.current_score > sub.threshold_value) {
        return {
          triggered: true,
          trigger_value: `${synthesis.current_score}`,
          reason: `Score ${synthesis.current_score.toFixed(1)} exceeds threshold ${sub.threshold_value}`,
        };
      }
      return null;

    case 'score_below':
      if (sub.threshold_value === null) return null;
      if (synthesis.current_score < sub.threshold_value) {
        return {
          triggered: true,
          trigger_value: `${synthesis.current_score}`,
          reason: `Score ${synthesis.current_score.toFixed(1)} is below threshold ${sub.threshold_value}`,
        };
      }
      return null;

    case 'trajectory_change':
      if (!priorSynth) return null;
      if (synthesis.trajectory !== priorSynth.trajectory) {
        return {
          triggered: true,
          trigger_value: `${priorSynth.trajectory} → ${synthesis.trajectory}`,
          reason: `Trajectory changed from ${priorSynth.trajectory} to ${synthesis.trajectory}`,
        };
      }
      return null;

    case 'lead_signal_active': {
      const leads = synthesis.active_leads || [];
      if (leads.length > 0) {
        return {
          triggered: true,
          trigger_value: leads.map(l => l.signal).join(', '),
          reason: `${leads.length} active leading indicator(s): ${leads.map(l => `${l.signal}→${l.leads}`).join(', ')}`,
        };
      }
      return null;
    }

    case 'cluster_change':
      if (!cluster || !priorCluster) return null;
      if (cluster.cluster_id !== priorCluster.cluster_id) {
        return {
          triggered: true,
          trigger_value: `cluster ${priorCluster.cluster_id} → cluster ${cluster.cluster_id}`,
          reason: `Country moved from cluster ${priorCluster.cluster_id} to cluster ${cluster.cluster_id} (${cluster.cluster_label})`,
        };
      }
      return null;

    default:
      return null;
  }
}

// ── Deliver via webhook ───────────────────────────────────────────────────────

function deliverWebhook(url, payload) {
  return new Promise((resolve, reject) => {
    const body  = JSON.stringify(payload);
    const proto = url.startsWith('https') ? https : http;
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || (url.startsWith('https') ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'Sabian-Alert/1.0' },
      timeout:  DELIVERY_TIMEOUT_MS,
    };
    const req = proto.request(opts, res => resolve({ status: res.statusCode }));
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Webhook timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Write alert event ─────────────────────────────────────────────────────────

async function writeAlertEvent(sub, result, synthesis, delivered, deliveryError) {
  const payload = {
    country:         sub.country,
    alert_type:      sub.alert_type,
    reason:          result.reason,
    trigger_value:   result.trigger_value,
    threshold_value: sub.threshold_value,
    current_score:   synthesis?.current_score,
    trajectory:      synthesis?.trajectory,
    as_of_year:      synthesis?.as_of_year,
    label:           sub.label,
    fired_at:        new Date().toISOString(),
  };
  await sb.from('alert_events').insert({
    subscription_id: sub.id,
    country:         sub.country,
    alert_type:      sub.alert_type,
    trigger_value:   result.trigger_value,
    threshold_value: sub.threshold_value,
    payload,
    delivered,
    delivery_error:  deliveryError || null,
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args   = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('\n🛰️  Phase 4 Step 9b — Alert Engine');
  console.log(`   Evaluating subscriptions against current synthesis.${dryRun ? ' [DRY RUN]' : ''}\n`);

  await checkTables();

  const [subscriptions, syntheses, clusters] = await Promise.all([
    loadActiveSubscriptions(),
    loadCurrentSyntheses(),
    loadCurrentClusters(),
  ]);

  console.log(`  ${subscriptions.length} active subscriptions.`);
  console.log(`  ${Object.keys(syntheses).length} countries with synthesis data.`);
  console.log(`  ${Object.keys(clusters).length} countries with cluster assignments.\n`);

  if (subscriptions.length === 0) {
    console.log('  No active subscriptions. Nothing to evaluate.');
    console.log('═'.repeat(60));
    console.log('✅ Phase 4 Step 9b — Alert engine complete (no subscriptions).');
    return;
  }

  // Load prior data for change-detection types
  const changeSubs     = subscriptions.filter(s => s.alert_type === 'trajectory_change' || s.alert_type === 'cluster_change');
  const changeCountries = [...new Set(changeSubs.map(s => s.country))];
  const [priorSynths, priorClusters] = await Promise.all([
    loadPriorSyntheses(changeCountries),
    loadPriorClusters(changeCountries),
  ]);

  let fired = 0, delivered = 0, skipped = 0, errors = 0;

  for (const sub of subscriptions) {
    const synthesis    = syntheses[sub.country];
    const cluster      = clusters[sub.country];
    const priorSynth   = priorSynths[sub.country];
    const priorCluster = priorClusters[sub.country];

    const result = evaluate(sub, synthesis, cluster, priorSynth, priorCluster);
    if (!result) { skipped++; continue; }

    fired++;
    const sign = sub.label ? `[${sub.label}]` : `[${sub.alert_type}]`;
    console.log(`  🔔 ${sign} ${sub.country}: ${result.reason}`);

    if (dryRun) continue;

    let deliveredOk = false;
    let deliveryErr = null;

    if (sub.webhook_url) {
      try {
        await deliverWebhook(sub.webhook_url, {
          source:      'sabian',
          alert_type:  sub.alert_type,
          country:     sub.country,
          reason:      result.reason,
          trigger_value: result.trigger_value,
          threshold_value: sub.threshold_value,
          current_score: synthesis?.current_score,
          trajectory:  synthesis?.trajectory,
          as_of_year:  synthesis?.as_of_year,
          label:       sub.label,
          fired_at:    new Date().toISOString(),
        });
        deliveredOk = true;
        delivered++;
      } catch (err) {
        deliveryErr = err.message;
        errors++;
        console.log(`    ⚠️  Webhook failed: ${err.message}`);
      }
    }

    try {
      await writeAlertEvent(sub, result, synthesis, deliveredOk, deliveryErr);
    } catch (err) {
      console.log(`    ⚠️  Failed to write alert event: ${err.message}`);
    }

    logAuditEvent('alert_fired', sub.country, {
      subscription_id:  sub.id,
      alert_type:       sub.alert_type,
      reason:           result.reason,
      trigger_value:    result.trigger_value,
      threshold_value:  sub.threshold_value,
      current_score:    synthesis?.current_score,
      trajectory:       synthesis?.trajectory,
      delivered:        deliveredOk,
    }).catch(() => {});
  }

  console.log('');
  logToHive({
    source: 'alert_engine',
    level: 'intel',
    event: 'alerts_evaluated',
    data: { subscriptions: subscriptions.length, fired, delivered, skipped, errors, dry_run: dryRun },
  });

  console.log('═'.repeat(60));
  console.log(`✅ Phase 4 Step 9b — Alert engine complete.`);
  console.log(`   Subscriptions evaluated: ${subscriptions.length}`);
  console.log(`   Alerts fired:            ${fired}`);
  console.log(`   Webhooks delivered:      ${delivered}`);
  console.log(`   Not triggered:           ${skipped}`);
  if (errors > 0) console.log(`   Delivery errors:         ${errors}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
