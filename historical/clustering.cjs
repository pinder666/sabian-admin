// historical/clustering.cjs
// Phase 4 Step 9e — Country Clustering and Correlation
//
// Groups countries by signal-vector similarity using k-means.
// Surfaces which countries are moving together, which are diverging.
//
// Feature vector: stress_z values per signal from synthesis_records breakdown.
// Signal space: the 12 historical signals. Missing values → 0 (neutral/baseline).
// Runs on the most recent synthesis record per country.
//
// Produces per-country cluster assignments with:
//   cluster_id      — which cluster (0-indexed integer)
//   cluster_label   — dominant signal character of the cluster
//   dominant_signal — highest mean |stress_z| signal in that cluster
//   centroid_dist   — Euclidean distance from this country to its cluster centroid
//   cluster_members — all countries in the same cluster
//
// Usage: node historical/clustering.cjs
//        node historical/clustering.cjs --k 10  (override cluster count)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { logToHive }    = require('../logger.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Import from central registry — 15 signals including behavioral
const { SIGNAL_KEYS } = require('./signal_keys.cjs');

const DEFAULT_K    = 8;
const MAX_ITER     = 150;
const N_RESTARTS   = 5;   // run k-means N times, keep best (lowest inertia)

// ── Table check ───────────────────────────────────────────────────────────────

async function checkTable() {
  const { error } = await sb.from('country_clusters').select('*').limit(1);
  if (error) {
    console.error('\n❌ Missing table: country_clusters');
    console.error('  Run: historical/MIGRATION_CLUSTERS.sql in Supabase SQL editor');
    console.error('  https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql\n');
    process.exit(1);
  }
}

// ── Load synthesis records ────────────────────────────────────────────────────

async function loadLatestSyntheses() {
  const all = [];
  let page = 0;
  process.stdout.write('  Loading synthesis records .');
  while (true) {
    const { data, error } = await sb
      .from('synthesis_records')
      .select('country,as_of_year,current_score,signal_breakdown')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    page++;
    if (page % 5 === 0) process.stdout.write('.');
  }
  console.log(` ${all.length} records loaded.`);

  // Keep only most recent year per country
  const latest = {};
  for (const r of all) {
    if (!latest[r.country] || r.as_of_year > latest[r.country].as_of_year) {
      latest[r.country] = r;
    }
  }
  return Object.values(latest);
}

// ── Build feature vectors ─────────────────────────────────────────────────────

function buildVectors(records) {
  return records.map(r => {
    const breakdown = r.signal_breakdown || {};
    const vec = SIGNAL_KEYS.map(k => {
      const sig = breakdown[k];
      return sig?.stress_z ?? 0;
    });
    return { country: r.country, year: r.as_of_year, vec };
  });
}

// ── K-means ───────────────────────────────────────────────────────────────────

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

function assignClusters(vectors, centroids) {
  return vectors.map(v => {
    let minDist = Infinity, minK = 0;
    for (let i = 0; i < centroids.length; i++) {
      const d = euclidean(v.vec, centroids[i]);
      if (d < minDist) { minDist = d; minK = i; }
    }
    return { cluster: minK, dist: minDist };
  });
}

function recomputeCentroids(vectors, assignments, k, dim) {
  const sums   = Array.from({ length: k }, () => new Array(dim).fill(0));
  const counts = new Array(k).fill(0);
  for (let i = 0; i < vectors.length; i++) {
    const c = assignments[i].cluster;
    for (let d = 0; d < dim; d++) sums[c][d] += vectors[i].vec[d];
    counts[c]++;
  }
  return sums.map((s, c) => counts[c] > 0 ? s.map(v => v / counts[c]) : s);
}

function inertia(vectors, assignments, centroids) {
  return vectors.reduce((sum, v, i) => sum + euclidean(v.vec, centroids[assignments[i].cluster]) ** 2, 0);
}

function kmeansOnce(vectors, k) {
  const dim = vectors[0].vec.length;
  // k-means++ initialization
  const centroidIdxs = [Math.floor(Math.random() * vectors.length)];
  while (centroidIdxs.length < k) {
    const dists = vectors.map(v => {
      const min = Math.min(...centroidIdxs.map(ci => euclidean(v.vec, vectors[ci].vec)));
      return min * min;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroidIdxs.push(i); break; }
    }
    if (centroidIdxs.length === k - 1 + 1) break;
    if (centroidIdxs.length < k) centroidIdxs.push(Math.floor(Math.random() * vectors.length));
  }
  let centroids = centroidIdxs.map(i => [...vectors[i].vec]);

  let assignments = assignClusters(vectors, centroids);
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const newCentroids = recomputeCentroids(vectors, assignments, k, dim);
    const newAssignments = assignClusters(vectors, newCentroids);
    const converged = newAssignments.every((a, i) => a.cluster === assignments[i].cluster);
    centroids   = newCentroids;
    assignments = newAssignments;
    if (converged) break;
  }
  return { assignments, centroids, score: inertia(vectors, assignments, centroids) };
}

function kmeans(vectors, k) {
  let best = null;
  for (let r = 0; r < N_RESTARTS; r++) {
    const result = kmeansOnce(vectors, k);
    if (!best || result.score < best.score) best = result;
  }
  return best;
}

// ── Cluster characterization ──────────────────────────────────────────────────

function characterizeClusters(vectors, assignments, k) {
  // For each cluster: find dominant signal (highest mean |stress_z|)
  const clusterSignalSums  = Array.from({ length: k }, () => new Array(SIGNAL_KEYS.length).fill(0));
  const clusterCounts      = new Array(k).fill(0);
  const clusterMembers     = Array.from({ length: k }, () => []);

  for (let i = 0; i < vectors.length; i++) {
    const c = assignments[i].cluster;
    clusterCounts[c]++;
    clusterMembers[c].push(vectors[i].country);
    for (let d = 0; d < SIGNAL_KEYS.length; d++) {
      clusterSignalSums[c][d] += Math.abs(vectors[i].vec[d]);
    }
  }

  return Array.from({ length: k }, (_, c) => {
    const n = clusterCounts[c];
    if (n === 0) return { label: 'empty', dominant: null, members: [] };
    const means = clusterSignalSums[c].map(s => s / n);
    const maxIdx = means.indexOf(Math.max(...means));
    const dominant = SIGNAL_KEYS[maxIdx];
    const label = labelCluster(dominant, means[maxIdx], n);
    return { label, dominant, members: clusterMembers[c].sort() };
  });
}

function labelCluster(dominant, meanAbs, size) {
  const level = meanAbs > 1.5 ? 'high' : meanAbs > 0.5 ? 'moderate' : 'low';
  const labels = {
    displacement:    `${level}-displacement`,
    gdelt_conflict:  `${level}-conflict`,
    gdelt_tone:      `${level}-tone-stress`,
    seismic_risk:    `${level}-seismic`,
    fire_hotspot:    `${level}-fire`,
    governance:      `${level}-governance-pressure`,
    economic_stress: `${level}-economic-stress`,
    capital_flows:   `${level}-capital-flow`,
    trade_collapse:  `${level}-trade-stress`,
    power_grid:      `${level}-grid-stress`,
    imf_fiscal:      `${level}-fiscal-stress`,
    vdem_governance: `${level}-democratic-stress`,
  };
  return labels[dominant] || `cluster-${dominant}`;
}

// ── Write ─────────────────────────────────────────────────────────────────────

async function writeClusters(rows) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb
      .from('country_clusters')
      .upsert(rows.slice(i, i + 500), { onConflict: 'country,as_of_year' });
    if (error) throw error;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const k    = args.includes('--k') ? parseInt(args[args.indexOf('--k') + 1]) : DEFAULT_K;

  console.log('\n🛰️  Phase 4 Step 9e — Country Clustering and Correlation');
  console.log(`   Grouping 153 countries by signal-vector similarity (k=${k}).\n`);

  await checkTable();

  const records = await loadLatestSyntheses();
  console.log(`  ${records.length} countries with synthesis records.\n`);

  const vectors = buildVectors(records);
  const withData = vectors.filter(v => v.vec.some(x => x !== 0));
  console.log(`  ${withData.length} countries with non-zero signal vectors.\n`);

  console.log(`  Running k-means (k=${k}, ${N_RESTARTS} restarts)...`);
  const { assignments, centroids, score } = kmeans(withData, k);
  console.log(`  Inertia: ${score.toFixed(2)}\n`);

  const clusterInfo = characterizeClusters(withData, assignments, k);

  // Print cluster summary
  console.log('  Cluster assignments:');
  for (let c = 0; c < k; c++) {
    const info = clusterInfo[c];
    if (info.members.length === 0) continue;
    console.log(`    [${c}] ${info.label.padEnd(30)} ${info.members.length} countries`);
    console.log(`         ${info.members.slice(0, 6).join(', ')}${info.members.length > 6 ? '...' : ''}`);
  }

  // Build rows
  const rows = withData.map((v, i) => {
    const c    = assignments[i].cluster;
    const info = clusterInfo[c];
    return {
      country:        v.country,
      as_of_year:     v.year,
      cluster_id:     c,
      cluster_label:  info.label,
      dominant_signal: info.dominant,
      centroid_dist:  parseFloat(assignments[i].dist.toFixed(4)),
      cluster_members: info.members,
      computed_at:    new Date().toISOString(),
    };
  });

  console.log(`\n  Writing ${rows.length} cluster assignments to Supabase...`);
  await writeClusters(rows);
  console.log(`  country_clusters: ${rows.length} rows written.\n`);

  logToHive({
    source: 'clustering',
    level: 'intel',
    event: 'clustering_complete',
    data: { countries: rows.length, k, inertia: parseFloat(score.toFixed(2)) },
  });

  console.log('═'.repeat(60));
  console.log('✅ Phase 4 Step 9e — Clustering complete.');
  console.log(`   Countries clustered: ${rows.length}`);
  console.log(`   Clusters:            ${k}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
