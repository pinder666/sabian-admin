require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log("Loading clump...");
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from("actor_presence_raw")
      .select("entity_name, country, filing_type, filing_date")
      .eq("filing_source", "GLEIF")
      .in("filing_type", ["FUND","SOLE_PROPRIETOR"])
      .range(from, from + 999);
    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    from += 1000;
    if (data.length < 1000) break;
  }
  console.log(`Clump: ${all.length} rows\n`);

  const derived = {
    year: r => r.filing_date?.slice(0,4),
    month: r => r.filing_date?.slice(0,7),
    day_of_week: r => r.filing_date ? new Date(r.filing_date).getDay() : null,
    day_of_month: r => r.filing_date ? new Date(r.filing_date).getDate() : null,
    name_length: r => r.entity_name?.length,
    name_first_char: r => r.entity_name?.[0]?.toUpperCase(),
    name_last_char: r => r.entity_name?.slice(-1)?.toUpperCase(),
    name_word_count: r => r.entity_name?.split(/\s+/).length,
    name_has_number: r => r.entity_name ? /\d/.test(r.entity_name) : null,
    name_all_caps: r => r.entity_name ? r.entity_name === r.entity_name.toUpperCase() : null,
  };
  const dims = ["country","filing_type"];
  const dimDerived = Object.keys(derived);

  const counts = {};
  const addCount = (k, v) => {
    if (v === null || v === undefined || v === "") return;
    counts[k] = counts[k] || {};
    counts[k][v] = (counts[k][v] || 0) + 1;
  };

  for (const r of all) {
    for (const d of dims) addCount(d, r[d]);
    for (const [k, fn] of Object.entries(derived)) addCount(k, fn(r));
  }

  // Pairs
  const pairs = {};
  for (const r of all) {
    const vals = {};
    for (const d of dims) vals[d] = r[d];
    for (const d of dimDerived) vals[d] = derived[d](r);
    const keys = Object.keys(vals);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i+1; j < keys.length; j++) {
        const a = vals[keys[i]], b = vals[keys[j]];
        if (a === null || a === undefined || a === "" || b === null || b === undefined || b === "") continue;
        const k = `${keys[i]}__${keys[j]}`;
        pairs[k] = pairs[k] || {};
        const v = `${a}|${b}`;
        pairs[k][v] = (pairs[k][v] || 0) + 1;
      }
    }
  }

  // Let the data tell us what unusual means
  function report(map, label) {
    const entries = Object.entries(map).sort((a,b) => b[1] - a[1]);
    const total = entries.reduce((s,[,c]) => s+c, 0);
    const n = entries.length;
    if (n < 3) return;
    const vals = entries.map(e => e[1]);
    const max = vals[0];
    const median = vals[Math.floor(n/2)];
    const top1 = vals[0];
    const top10pct = vals.slice(0, Math.max(1, Math.floor(n*0.1))).reduce((s,x)=>s+x,0);
    const concentration = top10pct / total;

    console.log(`\n=== ${label} ===`);
    console.log(`  distinct values: ${n}  total rows: ${total}  max: ${max}  median: ${median}  top-1: ${(top1/total*100).toFixed(1)}%  top-10%: ${(concentration*100).toFixed(1)}%`);
    console.log(`  top 10:`);
    for (const [k, c] of entries.slice(0, 10)) console.log(`    ${c}  ${k}`);
    if (n > 20) {
      console.log(`  bottom (rarest 5):`);
      for (const [k, c] of entries.slice(-5)) console.log(`    ${c}  ${k}`);
    }
  }

  console.log("\n--- SINGLE FIELDS ---");
  for (const [f, m] of Object.entries(counts)) report(m, f);

  console.log("\n\n--- FIELD PAIRS ---");
  for (const [f, m] of Object.entries(pairs)) report(m, f);
})();
