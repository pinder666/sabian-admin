require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log("Loading...");
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from("actor_presence_raw")
      .select("entity_name, country, filing_type, filing_date")
      .eq("filing_source", "GLEIF")
      .in("filing_type", ["FUND","SOLE_PROPRIETOR"])
      .range(from, from + 999);
    if (error) { console.log("  partial load due to:", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    from += 1000;
    if (data.length < 1000) break;
  }
  console.log(`${all.length} rows\n`);

  const derived = {
    year: r => r.filing_date?.slice(0,4),
    month: r => r.filing_date?.slice(0,7),
    dow: r => r.filing_date ? new Date(r.filing_date).getDay() : null,
    dom: r => r.filing_date ? new Date(r.filing_date).getDate() : null,
    name_len: r => r.entity_name?.length,
    first_char: r => r.entity_name?.[0]?.toUpperCase(),
    last_char: r => r.entity_name?.slice(-1)?.toUpperCase(),
    word_count: r => r.entity_name?.split(/\s+/).length,
    has_num: r => r.entity_name ? /\d/.test(r.entity_name) : null,
    all_caps: r => r.entity_name ? r.entity_name === r.entity_name.toUpperCase() : null,
  };
  const dims = ["country","filing_type", ...Object.keys(derived)];
  const valOf = (r, d) => d in derived ? derived[d](r) : r[d];

  // Build single-field marginals
  const marg = {};
  for (const d of dims) marg[d] = {};
  for (const r of all) {
    for (const d of dims) {
      const v = valOf(r, d);
      if (v === null || v === undefined || v === "") continue;
      marg[d][v] = (marg[d][v] || 0) + 1;
    }
  }
  const N = all.length;

  // For every PAIR of dimensions, compute observed vs expected
  // expected(a,b) = P(a) * P(b) * N
  // lift = observed / expected
  // Surface combinations where observed differs most from independence,
  // weighted by support (min observed) so we don't surface noise tuples.
  const tests = [];
  const dimList = dims;
  for (let i = 0; i < dimList.length; i++) {
    for (let j = i+1; j < dimList.length; j++) {
      const dA = dimList[i], dB = dimList[j];
      const joint = {};
      for (const r of all) {
        const a = valOf(r, dA), b = valOf(r, dB);
        if (a === null || a === undefined || a === "" || b === null || b === undefined || b === "") continue;
        const k = a + "\u0001" + b;
        joint[k] = (joint[k] || 0) + 1;
      }
      for (const [k, obs] of Object.entries(joint)) {
        const [a, b] = k.split("\u0001");
        const pA = marg[dA][a] / N;
        const pB = marg[dB][b] / N;
        const exp = pA * pB * N;
        if (exp < 1) continue;
        const lift = obs / exp;
        // chi-square contribution as significance
        const chi = ((obs - exp) ** 2) / exp;
        tests.push({ dA, dB, a, b, obs, exp: +exp.toFixed(1), lift: +lift.toFixed(2), chi: +chi.toFixed(1) });
      }
    }
  }

  // Surface BOTH directions: clusters tighter than chance (lift >> 1)
  // AND values absent more than chance (lift << 1) with high support
  console.log("=== TIGHTER-THAN-CHANCE CLUSTERS (top 30 by chi, lift > 2, obs >= 30) ===");
  const tight = tests.filter(t => t.lift > 2 && t.obs >= 30).sort((a,b) => b.chi - a.chi).slice(0,30);
  for (const t of tight) console.log(`  obs=${t.obs} exp=${t.exp} lift=${t.lift}x chi=${t.chi}  ${t.dA}=${t.a}  ${t.dB}=${t.b}`);

  console.log("\n=== ABSENCE TIGHTER-THAN-CHANCE (expected high, observed low, top 30) ===");
  // Build a list of (dA-value, dB-value) pairs that SHOULD have rows by marginals but don't
  const allDimValues = {};
  for (const d of dims) allDimValues[d] = Object.keys(marg[d]);
  const absences = [];
  for (let i = 0; i < dimList.length; i++) {
    for (let j = i+1; j < dimList.length; j++) {
      const dA = dimList[i], dB = dimList[j];
      const present = new Set();
      for (const r of all) {
        const a = valOf(r, dA), b = valOf(r, dB);
        if (a === null || a === undefined || a === "" || b === null || b === undefined || b === "") continue;
        present.add(a + "\u0001" + b);
      }
      const valsA = allDimValues[dA].slice(0, 50);  // limit search space
      const valsB = allDimValues[dB].slice(0, 50);
      for (const a of valsA) {
        for (const b of valsB) {
          if (present.has(a + "\u0001" + b)) continue;
          const exp = (marg[dA][a] / N) * (marg[dB][b] / N) * N;
          if (exp < 20) continue;
          absences.push({ dA, dB, a, b, exp: +exp.toFixed(0) });
        }
      }
    }
  }
  absences.sort((a,b) => b.exp - a.exp);
  for (const t of absences.slice(0,30)) console.log(`  expected=${t.exp} observed=0  ${t.dA}=${t.a}  ${t.dB}=${t.b}`);
})();
