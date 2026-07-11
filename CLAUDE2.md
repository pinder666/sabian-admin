# SABIAN TERMINAL — EXPLORE PAGE REBUILD SPEC

Created: 2026-07-09
Status: LOCKED — Do not build until confirmed

---

## THE CORE FAILURE

Every label on EXPLORE is a **claim without evidence**.

| What we show | What the buyer asks | What we answer |
|--------------|---------------------|----------------|
| CRITICAL | Critical compared to what? | Nothing |
| Red bar | How full should this be? | Nothing |
| Flat | Flat relative to when? | Nothing |
| 14 | 14 out of how many? 14 compared to what? | Nothing |

**Labels are conclusions. We're hiding the reasoning that produced them.**

The buyer's analyst will challenge every label: "Show me why Sudan is CRITICAL."

And EXPLORE can't answer. It just repeats: "Because our label says CRITICAL."

---

## CORE PRINCIPLE: INTELLIGENCE = COMPARISON

A number without a reference point is not intelligence.

| Not intelligence | Intelligence |
|------------------|--------------|
| Conflict: 98 | Conflict: 98 — highest since Darfur 2004 |
| Displacement: 94 | Displacement: 94 — 4x 10-year baseline |
| Food: 87 | Food: 87 — up 12 points in 30 days |
| CRITICAL | [no label needed — the evidence speaks] |
| Flat | Sustained at this level since April 2023 |

The comparison IS the intelligence:
- **"highest since 2004"** — tells them this is historic
- **"4x baseline"** — tells them this is far above normal
- **"+12 in 30d"** — tells them this is moving fast
- **"since April 2023"** — tells them this isn't new, it's sustained

---

## COMPARISON TYPES

From our historical data:

| Comparison type | What it answers | Example |
|-----------------|-----------------|---------|
| Historical max | When was this last seen? | "Highest since 2004" |
| Baseline multiple | How far from normal? | "4x 10-year baseline" |
| Recent delta | Is it moving? How fast? | "+22 in 30 days" |
| Dark period | When did data stop? | "No readings since Jan 2024" |
| Threshold cross | Did it just enter a new zone? | "Crossed 80 threshold 12 days ago" |
| Pattern match | What historical event does this resemble? | "Matches Syria 2011 pre-collapse" |

**These comparisons are what their analysts cannot produce.** They don't have 1789-2026. They don't have 217 countries. They don't have 17 domains converging.

---

## ROW STRUCTURE

### Current (broken):
```
Sudan | CRITICAL | ████████████████ | 14 | ── Flat
```

### Fixed (intelligence):
```
Sudan
  Conflict 98 (2004 high) · Displacement 94 (4x) · Food 87 (+12 in 30d) · +11 elevated
  Matches: South Sudan 2013 pre-civil-war
```

### Condensed single line variant:
```
Sudan    Conflict 98 (2004 high) · Displacement 94 (4x) · Food 87 (+12)    +11    Matches: S.Sudan 2013
```

**What the buyer sees:**
- Sudan's Conflict is at its worst since Darfur 2004
- Displacement is 4x above what's normal for Sudan
- Food stress spiked recently (+12 in 30 days)
- 11 MORE domains are elevated beyond these 3
- This configuration matches South Sudan before its civil war

**No red label needed. The evidence IS the severity.**

---

## BAND HEADERS

The bands (CRITICAL/WARNING/ELEVATED/STABLE) stay as **section headers** for organization.

But rows within each band show EVIDENCE, not labels:

```
CRITICAL — 14 COUNTRIES
────────────────────────────────────────────────────────────────────────────
Sudan      Conflict 98 (2004 high) · Displacement 94 (4x) · Food 87 (+12)    +11
           Matches: South Sudan 2013

Yemen      Food 91 (2018 high) · Conflict 84 (sustained 3yr) · Gov. dark 8mo  +8
           Matches: Ethiopia 2020

Syria      Displacement 96 (2015 peak) · Conflict 89 (sustained) · Econ 78    +9
           Pattern: Post-conflict plateau
```

The band header tells them how many. The rows tell them WHY.

---

## FILTERS — QUESTIONS, NOT NARROWING

### Current filters (broken):

| Current filter | What it does | Problem |
|----------------|--------------|---------|
| Level: CRITICAL | Shows our CRITICAL label | Still hiding the "why" |
| Region: Africa | Shows African countries | Just geographic narrowing |

### New filters (intelligence):

| Filter | Question it asks | What it reveals |
|--------|------------------|-----------------|
| "What's moving?" | Show me trajectories | Countries with significant 30/90 day changes |
| "What's at historic levels?" | Show me extremes | Countries at/near their historical worst |
| "What's converging?" | Show me systemic stress | Countries with 5+ domains elevated |
| "What's dark?" | Where did data stop? | Countries with feeds that went silent |
| "Match my portfolio" | What shares my risk profile? | Countries outside portfolio matching portfolio signatures |
| "What crossed threshold?" | What changed bands recently? | Countries that moved up/down in last 30 days |

Each filter opens an intelligence surface. The buyer discovers what they didn't know to look for.

---

## INTELLIGENCE SURFACES

EXPLORE is not one flat list. It is **surfaces** — each answering a different intelligence question.

### SURFACE 1: WHAT'S MOVING
Countries with the largest domain changes in 30/90 days.
```
MOVING — LAST 30 DAYS
────────────────────────────────────────────────────────────────────────────
Burkina Faso    Conflict +22 (now 74) · Governance +18 (now 61)    Trajectory: WARNING → CRITICAL
Myanmar         Conflict +34 (now 88) · Displacement +19 (now 72)  Trajectory: Accelerating
Egypt           Food +15 (now 79) · Economic +12 (now 68)          Trajectory: Worsening
```

### SURFACE 2: WHAT'S AT HISTORIC LEVELS
Countries at or near their historical maximum.
```
AT HISTORIC LEVELS
────────────────────────────────────────────────────────────────────────────
Sudan           Conflict 98 — highest since Darfur 2004
Syria           Displacement 96 — at 2015 peak level
Yemen           Food 91 — highest since 2018 famine
Venezuela       Economic 94 — highest recorded
```

### SURFACE 3: WHAT'S CONVERGING
Countries with many domains elevated simultaneously.
```
CONVERGING — SYSTEMIC STRESS
────────────────────────────────────────────────────────────────────────────
Sudan           14/17 domains elevated · Top: Conflict, Displacement, Food
Yemen           11/17 domains elevated · Top: Food, Conflict, Governance
Afghanistan     10/17 domains elevated · Top: Conflict, Governance, Economic
```

### SURFACE 4: WHAT'S DARK
Countries where data feeds stopped.
```
DATA DARK — SILENCE AS SIGNAL
────────────────────────────────────────────────────────────────────────────
Sudan           Governance dark since Jan 2024 (6 months)
Venezuela       Economic dark since Mar 2024 (4 months)
Nicaragua       Governance dark since Nov 2023 (8 months)
Myanmar         Multiple domains intermittent since coup
```

### SURFACE 5: PATTERN MATCHES
Countries matching historical pre-event signatures.
```
PATTERN MATCHES — HISTORICAL ANALOGUES
────────────────────────────────────────────────────────────────────────────
Sudan           Matches: South Sudan 2013 (pre-civil-war)
Myanmar         Matches: Cambodia 1975 (pre-regime-collapse)
Haiti           Matches: Somalia 1991 (pre-state-failure)
```

---

## BUYER WORKFLOW

**6am analyst session:**

1. Land on EXPLORE
2. See "WHAT'S MOVING" — notice Burkina Faso jumped +22 in Conflict
3. Click "WHAT'S AT HISTORIC LEVELS" — see Sudan is at Darfur-level Conflict
4. Click "PATTERN MATCHES" — see Sudan matches South Sudan 2013
5. Click Sudan row → COUNTRY DETAIL for full breakdown
6. Export dossier for board meeting

**Time: 4 minutes.** Every click revealed intelligence. No guessing what "CRITICAL" means.

---

## SHARED STATE OBJECT

```javascript
window.SABIAN = {
  // Current focus
  activeCountry: null,        // "Sudan"
  activeYear: null,           // 2024 (or historical: 2013)
  activeDomain: null,         // "displacement"
  activeRegion: null,         // "africa"
  activeSurface: null,        // "moving" | "historic" | "converging" | "dark" | "patterns"
  
  // Collections
  compareList: [],            // ["United States", "China"]
  portfolio: JSON.parse(localStorage.getItem('sabian_portfolio') || '[]'),
  
  // Filters persist across tabs
  filters: {
    level: '',
    region: '',
    timeframe: '30d'          // "30d" | "90d" | "1y"
  }
};
```

---

## API DATA STRUCTURE

For intelligence to work, the API must return comparison data per domain:

```javascript
{
  country: "Sudan",
  risk_level: "CRITICAL",
  convergence_score: 94,
  
  active_domains: [
    {
      name: "Conflict",
      score: 98,
      comparison: {
        type: "historical_max",
        reference_date: "2004",
        reference_event: "Darfur",
        label: "highest since Darfur 2004"
      },
      change_30d: 4,
      change_90d: 12
    },
    {
      name: "Displacement", 
      score: 94,
      comparison: {
        type: "baseline_multiple",
        multiple: 4.0,
        baseline_period: "10-year",
        label: "4x 10-year baseline"
      },
      change_30d: 8,
      change_90d: 22
    },
    {
      name: "Food",
      score: 87,
      comparison: {
        type: "recent_delta",
        change: 12,
        period: "30d",
        label: "+12 in 30d"
      },
      change_30d: 12,
      change_90d: 18
    }
  ],
  
  dark_domains: [
    {
      name: "Governance",
      last_reading: "2024-01-15",
      dark_days: 175,
      label: "dark 6 months"
    }
  ],
  
  pattern_match: {
    country: "South Sudan",
    year: 2013,
    event: "Pre-civil-war",
    match_strength: "strong",
    label: "Matches: South Sudan 2013 pre-civil-war"
  },
  
  elevated_count: 14,
  total_domains: 17,
  
  trajectory: "RISING",
  trajectory_label: "Sustained since April 2023",
  
  theater: "Africa"
}
```

**Without comparison data in the API, there is no intelligence. Only a data browser.**

---

## MILITARY GRADE RULES

### What we NEVER show:
| Never | Why |
|-------|-----|
| r values (r=0.81) | Methodology leak |
| Signal keys (unhcr_displacement_stock) | Internal naming |
| Source names (V-Dem, ACLED, UNHCR) | Trade secret |
| z-scores (4.8σ) | Statistical jargon |
| Sample sizes (n=4200) | Methodology |
| The word "signal" | Internal terminology |
| Correlation language | Methodology |

### What we ALWAYS show:
| Always | Example |
|--------|---------|
| Domain names | "Conflict", "Displacement", "Food" |
| Scores (0-100) | "98", "94", "87" |
| Comparisons in plain language | "highest since 2004", "4x baseline", "+12 in 30d" |
| Pattern matches without r values | "Matches: South Sudan 2013" |
| Dark periods | "Governance dark 6 months" |
| Evidence, not labels | The data speaks for itself |

### Visual constants (all pages):
| Element | Specification |
|---------|---------------|
| Risk bands | CRITICAL (red #dc2626), WARNING (amber #f59e0b), ELEVATED (yellow #eab308), STABLE (gray #6b7280) |
| Typography | Monospace for data, sans-serif for labels, ALL CAPS for headers |
| Accent | #1a6fff |
| Background | #050c1a (navy) |
| Density | Maximum information per pixel |

### Behavioral constants:
| Action | Result |
|--------|--------|
| Click country name | → COUNTRY DETAIL |
| Click domain | → DOMAIN DRILL for that domain |
| "+ Portfolio" | Adds to portfolio, stays on current page |
| "Compare" | Adds to compareList, switches to COMPARE when 2+ |
| Export | Same PDF/CSV format from any page |

---

## PORTFOLIO INTEGRATION

Within each band, portfolio countries sort FIRST.

Structure:
```
CRITICAL — 3 EXPOSURE / 14 TOTAL
────────────────────────────────────────────────────────────────────────────
Nigeria      [portfolio country - evidence row]
Egypt        [portfolio country - evidence row]
Chad         [portfolio country - evidence row]
────────────────────────────────────────────────────────────────────────────
Sudan        [non-portfolio country - evidence row]
Yemen        [non-portfolio country - evidence row]
...
```

- Header shows exposure count: "3 EXPOSURE / 14 TOTAL"
- Horizontal divider separates portfolio from non-portfolio
- No per-row markers (no stars, no badges)
- Position IS the indicator

---

## BUILD ORDER

### Phase 1: API Enhancement
1. Add `comparison` object to each domain in `/public-api/threats`
2. Add `dark_domains` array
3. Add `pattern_match` object
4. Add `change_30d` and `change_90d` to each domain
5. Add `trajectory_label` with context ("Sustained since April 2023")

### Phase 2: EXPLORE Rebuild
1. Remove old domain dropdown landing state
2. Implement surface tabs: MOVING | HISTORIC | CONVERGING | DARK | PATTERNS
3. Implement evidence row structure with comparisons
4. Implement portfolio-first sorting within bands
5. Implement new filter buttons as surface selectors

### Phase 3: Verification
1. Test with live API data
2. Verify no hardcoded values
3. Verify no methodology leaks
4. Verify click-through to COUNTRY DETAIL works
5. Verify export CSV includes comparison labels

---

## WHAT THIS REPLACES

The current explore.html that was just committed shows:
- Country name
- CRITICAL/WARNING/ELEVATED/STABLE badge (label without evidence)
- Single intensity bar (number without reference)
- Domain count (X or X/Y)
- Trend arrow (RISING/STABLE/SHARP_FALL)

This spec replaces ALL of that with evidence-based intelligence surfaces.

---

## CONFIRMATION REQUIRED

Do not build until:
1. This spec is reviewed
2. API data availability is confirmed (do we have comparison data?)
3. Build approach is confirmed (API first? Mock comparisons?)

---

## SUMMARY

| Problem | Fix |
|---------|-----|
| "CRITICAL" means nothing | Show evidence: "Conflict 98 (2004 high)" |
| "Flat" means nothing | Show context: "Sustained since April 2023" |
| Colored bars mean nothing | Show domain scores with comparisons |
| Filters narrow | Filters reveal intelligence surfaces |
| One flat list | Multiple surfaces answering different questions |
| Labels | Evidence |

**EXPLORE becomes: "What don't you know that you need to know?"**

Each surface answers a question the buyer didn't ask. Each row shows comparison, not labels. Each filter opens discovery, not narrowing.

**This is the $10M intelligence. This is what their analysts cannot produce.**

---

## GUIDED INTELLIGENCE BRIEFING — POST BUILD

Not a wizard. Not a UI tour. The system knows what the buyer is looking at and tells them what question to ask next. The intelligence speaks.

Example: "Sudan's Conflict score just crossed 80 for the first time since 2004. The last time this happened, displacement followed within 6 months. Check Displacement next."

Build this only after all 8 pages are complete. Do not build until confirmed.
