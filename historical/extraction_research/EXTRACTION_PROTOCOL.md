# Sabian Extraction Intelligence — Research Protocol

## Objective
Map the value transfer pattern across 15 sovereign crises. Identify repeat actors, timing correlations with Sabian signals, and total extraction magnitude.

## Timeline
Week of 2026-05-28. All 15 crises mapped by end of week.

## Target Crises

| # | Country | Year | Key Features |
|---|---------|------|--------------|
| 1 | Sri Lanka | 2022 | BRI debt trap, port seizure, full collapse |
| 2 | Zambia | 2020 | Copper extraction, Chinese lending, first African COVID default |
| 3 | Lebanon | 2020 | Banking collapse, political capture, diaspora flight |
| 4 | Argentina | 2019 | Repeat crisis, Elliott playbook, IMF largest-ever loan |
| 5 | Venezuela | 2017 | Oil collateral, Russian/Chinese positioning, PDVSA bonds |
| 6 | Mozambique | 2016 | Hidden debt scandal, Tuna bonds, Credit Suisse prosecution |
| 7 | Ukraine | 2015 | War, Russian gas leverage, IMF + US intervention |
| 8 | Greece | 2012 | Eurozone crisis, PSI haircut, hedge fund holdouts |
| 9 | Ecuador | 2008 | Oil collateral, Chinese deals, Correa debt repudiation |
| 10 | Pakistan | 2008 | IMF emergency, military transition, Saudi/UAE support |
| 11 | Argentina | 2001 | Convertibility collapse, vulture fund origin story |
| 12 | Russia | 1998 | GKO default, oligarch formation, LTCM contagion |
| 13 | Indonesia | 1997 | Asian crisis, IMF conditionality, Suharto fall |
| 14 | Thailand | 1997 | Currency attack, hedge fund positioning, baht collapse |
| 15 | Mexico | 1994 | Tequila crisis, US Treasury bailout, peso collapse |

## Data Sources Per Crisis

### Primary Sources (public, historical)
1. **SEC 13F filings** — Quarterly institutional holdings of foreign sovereign debt
   - Access: SEC EDGAR (free)
   - Coverage: 1978-present, US institutions only
   - Pull: ±8 quarters around crisis date

2. **AidData Global Chinese Development Finance** — BRI loans
   - Access: AidData.org (free, academic)
   - Coverage: 2000-2021
   - Pull: All loans to target country

3. **EITI Contract Disclosures** — Extractive industry contracts
   - Access: EITI.org, country-specific portals
   - Coverage: 2003-present (varies by country)
   - Pull: Mining/oil/gas concessions ±36 months of crisis

4. **World Bank PPI Database** — Infrastructure privatization
   - Access: ppi.worldbank.org (free)
   - Coverage: 1990-present
   - Pull: All projects ±36 months of crisis

5. **IMF Monitoring Database** — Program dates and terms
   - Access: IMF.org (free)
   - Coverage: Complete historical
   - Pull: All arrangements for target country

6. **Sovereign Bond Pricing** — Secondary market levels
   - Access: FRED (partial), academic datasets
   - Coverage: Varies
   - Pull: Weekly pricing ±24 months

### Secondary Sources (enrichment)
7. **ICIJ Offshore Leaks Database** — Named entities, jurisdictions
8. **UN Comtrade** — Trade flow reversals
9. **BIS Locational Banking Statistics** — Cross-border capital flows
10. **Academic papers** — Crisis post-mortems with actor identification

## Output Format Per Crisis

```
[COUNTRY] [YEAR] — EXTRACTION MAP
═══════════════════════════════════════════════════════════════

SABIAN SIGNAL TIMELINE
──────────────────────────────────────────────────────────────
- [Signal]: [Date/Quarter]
- [Signal]: [Date/Quarter]
- CRITICAL entry: [Date]
- Crisis event: [Date]

STRATEGIC POSITIONING (pre-stress)
──────────────────────────────────────────────────────────────
- [Actor]: [Asset/Deal] ([Date], [months before CRITICAL])

INSTITUTIONAL EXIT
──────────────────────────────────────────────────────────────
- [Actor]: [Action] ([Date], [signal correlation])

DISTRESSED ENTRY
──────────────────────────────────────────────────────────────
- [Actor]: [Position] ([Date], [entry price if known])

RESOURCE/ASSET CAPTURE
──────────────────────────────────────────────────────────────
- [Actor]: [Concession/Asset] ([Date], [terms])

VALUE TRANSFER MAGNITUDE
──────────────────────────────────────────────────────────────
- Bond haircut: [X]%
- Distressed purchase discount: [Y]%
- Asset transfer value: $[Z]

REPEAT ACTORS (from other crises in dataset)
──────────────────────────────────────────────────────────────
- [Actor]: Also appeared in [Crisis], [Crisis]

PATTERN INDICATORS
──────────────────────────────────────────────────────────────
[ ] Strategic lender positioned pre-stress
[ ] Resource rights secured pre-crisis
[ ] Institutional exit on first signal
[ ] Distressed specialist entry at CRITICAL
[ ] Asset/concession renegotiation post-default
```

## Analysis Outputs

After all 15 crises mapped:

1. **REPEAT_ACTORS.md** — Entities appearing in 3+ crises, ranked by frequency
2. **TIMING_CORRELATION.md** — Average lead time between Sabian signals and actor positioning
3. **VALUE_TRANSFER_TOTAL.md** — Aggregate extraction magnitude across all 15 crises
4. **PATTERN_SIGNATURES.md** — Common sequences that indicate extraction in progress
5. **SIGNAL_TO_ACTOR_MAP.md** — Which Sabian signals best predict which actor moves

## Research Assignments

Crisis 1-5 (2017-2022): Most recent, best 13F coverage
Crisis 6-10 (2008-2016): Good documentation, IMF era
Crisis 11-15 (1994-2001): Historical baseline, vulture fund origins

## Status Tracking

| Crisis | 13F Pulled | Concessions | BRI/Loans | IMF Dates | Bond Pricing | Map Complete |
|--------|------------|-------------|-----------|-----------|--------------|--------------|
| Sri Lanka 2022 | | | | | | |
| Zambia 2020 | | | | | | |
| Lebanon 2020 | | | | | | |
| Argentina 2019 | | | | | | |
| Venezuela 2017 | | | | | | |
| Mozambique 2016 | | | | | | |
| Ukraine 2015 | | | | | | |
| Greece 2012 | | | | | | |
| Ecuador 2008 | | | | | | |
| Pakistan 2008 | | | | | | |
| Argentina 2001 | | | | | | |
| Russia 1998 | | | | | | |
| Indonesia 1997 | | | | | | |
| Thailand 1997 | | | | | | |
| Mexico 1994 | | | | | | |

## Deliverable

By end of week: 15 complete extraction maps + 5 analysis documents proving:
- Same actors appear repeatedly
- Their timing correlates with Sabian signals
- The value transfer is quantifiable
- The pattern is replicable for real-time detection
