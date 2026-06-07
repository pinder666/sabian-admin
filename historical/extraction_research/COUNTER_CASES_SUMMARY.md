# COUNTER-CASES SUMMARY — What Breaks the Extraction Pattern

## Overview
Five countries entered conditions identical to the extraction dataset and avoided systematic value transfer. The same signals that preceded Argentina 2001, Greece 2012, and Venezuela 2017 were present in all five. The escape came from specific actions, not from better economic conditions.

---

## The Five Cases

| Country | Year | Vulnerability | Escape Mechanism |
|---------|------|---------------|------------------|
| South Korea | 1997 | Currency attack, banking crisis, IMF required | Speed + completeness + no default |
| Malaysia | 1998 | Currency attack, capital flight | Capital controls blocked entry mechanism |
| Uruguay | 2003 | Argentina contagion, 11% GDP collapse | CACs + voluntary restructuring |
| Poland | 1990s | Communist debt overhang, hyperinflation | Brady Plan + EU accession anchor |
| Jamaica | 2010/2013 | 140% debt-to-GDP, two restructurings | Domestic debt composition + jurisdiction |

---

## The Six Escape Patterns

### Pattern A: No Default (Korea, Uruguay, Jamaica)
The vulture play requires a technical default to create the distressed debt buying opportunity. If a country can restructure without defaulting, the entry point disappears.

*Detectable signal*: Voluntary exchange announced while bonds still above 50 cents.

### Pattern B: Speed (Korea, Uruguay)
If restructuring completes faster than accumulation can occur, vultures cannot position. Korea completed banking restructuring in 18 months. Uruguay's exchange took 3 months.

*Detectable signal*: Restructuring announcement with hard deadline and existing majority participation pre-committed.

### Pattern C: Collective Action Clauses (Uruguay)
CACs bind holdouts to majority votes. Without CACs, every bondholder has a veto. With CACs, no holdout strategy is possible above the blocking threshold.

*Detectable signal*: CAC presence in bond documentation (public information, in prospectuses).

### Pattern D: Jurisdictional Wall (Jamaica)
Domestic debt under domestic law, held by domestic institutions, cannot be accessed by international vulture litigation.

*Detectable signal*: Ratio of domestic to external debt, governing law of outstanding bonds.

### Pattern E: Capital Controls (Malaysia)
Blocking the capital movement mechanism eliminates the currency attack playbook and limits distressed asset buying by foreign entities.

*Detectable signal*: Capital control announcement. Also: sovereign CDS pricing before controls.

### Pattern F: Credibility Anchor (Poland)
An external institutional anchor (EU accession, regional integration with legal force) creates a credible future that maintains bond prices above distressed levels and creates political durability for reform.

*Detectable signal*: EU accession status, active accession negotiation progress.

---

## What Sabian Currently Reads vs. What It Misses

### Currently Reads (Present)
- Economic stress (capital_flows, economic_stress, imf_fiscal, trade_collapse)
- Governance deterioration (governance, ooni_internet, tor_censorship)
- Financial stress (sovereign_cds, currency_collapse)
- Social conditions (social_unrest, displacement)

### Currently Missing (Gap)
- **Debt composition**: Domestic vs. external ratio. Governing law. Currency denomination.
- **CAC presence**: Whether outstanding bonds contain collective action clauses.
- **Restructuring type**: Voluntary vs. default. Speed of execution.
- **Institutional anchor**: EU accession status, regional integration depth.
- **Capital control status**: Not currently captured in real-time signal.

These are the structural factors that separate countries with identical economic signals into "extracted" vs. "escaped" outcomes.

---

## The Core Finding

**The signals that Sabian reads show vulnerability. They do not determine outcome.**

Two countries can have identical signal profiles — both ELEVATED, both showing economic stress, both showing capital flow deterioration — and produce completely different outcomes based on:
1. Whether a default occurs
2. The legal structure of the debt
3. The speed of restructuring
4. The presence of a credibility anchor

**Sabian's value proposition upgrades when these structural overlays are added.** Not just "this country is in the danger zone" — but "this country is in the danger zone AND lacks CACs AND has 60% external debt AND has no institutional anchor" vs. "this country is in the danger zone AND has CACs AND has 80% domestic debt AND is in EU accession."

The same signal score means different things with different structural overlays.

---

## Product Implications

### Current Product (Diagnosis)
"This country shows ELEVATED conditions matching the pre-crisis signatures we've documented across 15 extraction cases."

### Counter-Case Layer (Prescription)
"This country shows the same signals as Greece 2009 but has [CACs / domestic debt structure / active EU accession process] that would block [the holdout strategy / jurisdictional access / currency attack mechanism]."

### Full Product (Diagnosis + Prescription)
"Here is the extraction risk. Here is what structural factors amplify or constrain it. Here is what the five escape cases did that this country has or has not done."

---

## Files

```
extraction_research/
├── COUNTER_CASE_01_SOUTH_KOREA_1997.md  — Speed + no default
├── COUNTER_CASE_02_MALAYSIA_1998.md     — Capital controls
├── COUNTER_CASE_03_URUGUAY_2003.md      — CACs + voluntary
├── COUNTER_CASE_04_POLAND_1990s.md      — Brady + EU anchor
├── COUNTER_CASE_05_JAMAICA_2010.md      — Domestic debt jurisdiction
└── COUNTER_CASES_SUMMARY.md             — This file
```

---

*Research completed: 2026-05-28*
*Counter-cases documented: 5*
*Escape patterns identified: 6*
*Key gap identified: Debt composition and CAC coverage not in current signal set*
