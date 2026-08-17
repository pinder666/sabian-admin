# SIGNAL INTEGRITY AUDIT — 2026-08-17

**Method:** manually verified by operator in PowerShell. Every finding below was
confirmed by reading fetcher source directly or by calling the external API live.
No finding here rests on a prior audit document or on an AI summary.

**Scope:** the 7 "proxy" signals. The 3 "dead" and 2 "behind" signals were NOT
re-verified in this session and remain unconfirmed.

---

## 1. Headline finding

Seven signals carry names describing a quantity they do not measure. In every case
the fetcher calls the World Bank WDI API and returns a slow annual development
statistic, while the signal name implies an event-resolution intelligence feed.

The data itself is real. The sources are real. The `source` field written to the
database is accurate. **The defect is naming, not fabrication** — which is why a
fabrication-hunting audit does not catch it.

Structural consequence: **26 of 47 fetchers call `api.worldbank.org`** (countable from
the full inventory, Appendix A). Whatever the signals are named, the majority of the
system draws on one source.

**The seven verified below are not the full extent.** See section 7A — the inventory
flags roughly fifteen further signals whose names point at a specific organisation or
instrument while the fetcher calls the World Bank.

---

## 2. Verified proxy signals

| Signal key | Name implies | Actually retrieves | Verified by |
|---|---|---|---|
| `dark_vessel` | AIS gaps / vessels going dark | `LP.LPI.OVRL.XQ` — Logistics Performance Index (shipper survey, 1–5) | live GFW call returned 422; GFW function never invoked |
| `port_congestion` | Port dwell time | Mean of `LP.LPI.OVRL.XQ`, `LP.LPI.INFR.XQ`, `IS.SHP.GCNW.XQ` | World Bank indicator API returned official names |
| `rail_corridor` | Rail disruption | `IS.RRS.TOTL.KM` (route-km), `IS.RRS.GOOD.MT.K6` (freight) | source read |
| `flight_movement` | Flight disruption | `IS.AIR.PSGR`, `IS.AIR.DPRT`, `IS.AIR.GOOD.MT.K1` (annual totals) | source read |
| `resource_conflict` | Resource conflict events | `NY.GDP.TOTL.RT.ZS` — resource rents % GDP | source read |
| `pipeline_risk` | Pipeline infrastructure risk | `NY.GDP.PETR.RT.ZS` ×1.5, `NY.GDP.NGAS.RT.ZS` ×1.0, `EG.ELC.ACCS.ZS` ×−0.5 | source read |
| `fao_food` | FAO food import dependency | `SN.ITK.DEFC.ZS` — undernourishment prevalence | DB `source` field reads "World Bank WDI (FAO data)" |

### Secondary defects found in the same pass

- **`rail_corridor` direction is inverted.** Both indicators are set `invert: false`,
  meaning more track and more freight raise the risk score. Route-km is a measure of
  infrastructure *existence* and is near-static year to year.
- **`flight_movement` resolution cannot support its stated purpose.** The file comment
  (line 6) states the intent: a sudden drop in flights signals crisis. The inputs are
  annual World Bank aggregates published 12–18 months in arrears. A crisis disruption
  resolves in days.
- **`pipeline_risk` weights are hand-set, not fitted.** 1.5 / 1.0 / −0.5 were chosen,
  not derived. Defensible as a heuristic, indefensible as a published model.

---

## 3. Corrections to the prior report (SIGNAL_AUDIT_2026_06_01 / August addendum)

**Proxy count of 7 holds.** Two mechanism claims were wrong:

### 3.1 `dark_vessel` does not "fall back" to LPI — it never attempts GFW

`fetchGFWVessels()` is defined at line 36 of `historical/fetchers/dark_vessel_historical.cjs`
and **is never called anywhere in the file.** The only invocation is `fetchLPIFallback()`
at line 89. There is no conditional, no try-then-degrade.

The file states this itself in `fetchDarkVessel()`:

```
// Primary: use LPI as proxy (reliable, wide coverage, free)
// GFW API requires authentication for AIS gap data
```

This matters for diligence framing: a broken integration is an accident, an unreachable
function retained above the real path is a decision. The GFW code makes the file read as
vessel tracking when the executing path is a survey index.

Separately, the GFW endpoint is also dead on its own terms. Live call returned:

```
422 Unprocessable Entity
Dataset with id [public-global-presence:v4.0] is not compatible with
endpoint [/v2/4wings/report]. Available versions [v3]
```

The code pins `:latest`; GFW advanced the dataset past what the v2 endpoint accepts.
Even if the function were wired in, it would fail for every country.

### 3.2 `fao_food` has two writers, undocumented in any prior audit

Two fetchers write `signal_key: 'fao_food'`, both upserting on
`onConflict: 'country,signal_key,date'`:

| File | Source |
|---|---|
| `fao_historical.cjs` | `bulks-faostat.fao.org` — real FAO Food Balance Sheets bulk zip |
| `food_security_historical.cjs` | `api.worldbank.org` — `SN.ITK.DEFC.ZS` |

Last writer wins. Live DB query resolves it:

```
fao_food       2023-01-01   World Bank WDI (FAO data)
food_security  2024-01-01   World Bank WDI (food security)
usda_food      2024-01-01   World Bank WDI (food security)
```

**The World Bank writer won. The genuine FAO bulk feed — the one legitimate primary
source in the food group — is not what is in the database.**

Also note `usda_food` and `food_security` write identical `source` strings from
identical World Bank composites under two different signal keys. Neither calls USDA.
No fetcher calls FEWS NET despite `fews_food_security_historical.cjs` being so named.

---

## 4. Root cause

One behaviour repeated seven times, not seven independent errors.

Every affected fetcher names a real primary source (GFW, FAO bulk, USDA, FEWS, AIS)
and executes a World Bank call instead. The World Bank WDI API is free, unauthenticated,
covers ~200 countries, carries decades of history, and reliably returns HTTP 200.
Every intended primary source requires a key, a EULA, or a large download.

When the build met the auth wall, it took the source that returns data and kept the
original signal name on top.

**Inference, not proof:** the sequence above is read from code shape and comments, not
observed. The comment in `dark_vessel_historical.cjs` documents the decision explicitly;
the rest is pattern.

### Why prior audits missed it

Earlier remediation targeted fabricated calls — endpoints that did not exist, values with
no source. The test was *is this real?* Every finding here passes that test. These are
live calls to a real API returning real data with correct source attribution written to
the database. The mismatch sits one layer up, between `signal_key` / `signal_name` and
what the fetcher retrieves. Naming is not something a fabrication audit inspects.

---

## 5. What the data is and is not

**Is:** legitimate structural indicators. LPI measures trade infrastructure quality.
Resource rents measure extraction dependency. Undernourishment prevalence is a real
measurement. Slow-moving, annual, cross-country comparable. A composite built from these
is a defensible structural pressure measure — likely part of why the one validated
result (structural pressure composite, F1 0.825, ~2-year lead) is *structural*. Slow
indicators detecting slow phenomena.

**Is not:** event detection. Dwell time, vessels going dark, flights stopping — these
move in days. These inputs move in years and publish 12–18 months late. The resolution
is not present, at any weighting.

**Exposure:** "Dark vessel" is a specific claim to a defense or insurance buyer. A
diligence team that opens the signal and finds a shipper survey ends the conversation —
not because the data is poor, but because the name was a representation. Same for a
signal named USDA that never calls USDA.

---

## 6. Not yet verified — carried forward

| Claim | Status |
|---|---|
| `sanctions_pressure` dead at 2005 (TIES v4.1) | unverified this session |
| `election_calendar` dead at 2020 (NELDA 6.0) | unverified |
| `social_unrest` — ACLED decommissioned | unverified |
| `conflict` — UCDP one version behind (v24.1 vs v25.1) | unverified |
| `energy_stress` — EIA one year behind | unverified |
| Landing page generates scores from a string hash | unverified — 30-second test: type a fake country into the live site |
| Published equation ≠ running equation (top-3 / 50-35-breadth) | unverified — highest-severity open item |
| Sudan March 2023 case has no stored artifact | unverified |
| Hardcoded API key fallbacks live on Railway | unverified |
| Scan record gap June 25 → present | unverified |

---

## 7. Additional signal-key collisions found in the inventory sweep

Beyond `fao_food`:

| Signal key | Written by |
|---|---|
| `fire_hotspot` | `firms_historical`, `firms_historical_v2`, `gee_fire_historical` |
| `displacement` | `displacement_historical`, `unhcr_historical` |
| `health_crisis` | `health_crisis_historical`, `who_historical` |

Three fetchers call no external host at all: `displacement_historical`,
`gee_fire_historical`, `structural_pressure_historical`. The last is presumed to be a
composite computed from other signals rather than fetched — **worth confirming, since it
is the basis of the F1 0.825 claim.**

---

## 7A. The pattern is wider than seven — flagged, not yet source-verified

Reading the full inventory (Appendix A), the same name/source mismatch appears across
roughly fifteen further signals. These are flagged on the evidence of **fetcher name plus
host only** — the source files have not been read. Each needs the same treatment the seven
received before being asserted.

Signals whose name points at a specific organisation or market instrument, where the only
host called is `api.worldbank.org`:

| Signal key | Name points at | Only host called |
|---|---|---|
| `sovereign_cds` | credit default swap spreads — a traded market price | api.worldbank.org |
| `prediction_market` | prediction markets (Polymarket, Metaculus) | api.worldbank.org |
| `occrp` | OCCRP — investigative journalism corruption data | api.worldbank.org |
| `gps_jamming` | GNSS interference (GPSJAM / ADS-B derived) | api.worldbank.org |
| `cyber_threat` | cyber threat activity | api.worldbank.org |
| `cable_disruption` | submarine cable faults | api.worldbank.org |
| `social_volume` | social media volume | api.worldbank.org |
| `military_proximity` | force positioning | api.worldbank.org |
| `chokepoint` | maritime chokepoint transit | api.worldbank.org |
| `dam_risk` | dam infrastructure | api.worldbank.org |
| `flood_risk` | flood exposure | api.worldbank.org |
| `water_stress` | water stress | api.worldbank.org |
| `maritime_trade` | maritime trade flow | api.worldbank.org |
| `iom_displacement` | IOM | api.worldbank.org |
| `unhcr_odp` | UNHCR Operational Data Portal | api.worldbank.org |
| `food_security` (via `fews_food_security_historical`) | FEWS NET | api.worldbank.org |

`sovereign_cds` is the sharpest of these. A CDS spread is a price quoted by dealers; the
World Bank does not publish one. Whatever populates that signal is not a CDS spread. The
prior August addendum independently reported Sovereign CDS returning null for all 202
countries in the last full scan — consistent with a fetcher that cannot retrieve what its
name promises.

Note also that in two cases a correctly-sourced fetcher exists alongside a World Bank
one under a near-identical name: `iom_dtm_historical` does call `dtmapi.iom.int`, and
`unhcr_historical` does call `api.unhcr.org`. So the real feeds were built. The question
is which key the scoring engine consumes.

**Do not restate any row in this section as established until its source file is read.**

---

## 8. Remediation — two separate problems

### Problem A: the names are wrong today

One-time correction. No automation can decide this; it requires a judgement call per
signal. Rename to what is measured: `trade_infrastructure_quality`,
`hydrocarbon_dependency`, `undernourishment`. The intelligence-register vocabulary is
lost; a system that survives audit is gained.

Building genuine maritime intelligence later is a separate project — GFW issues free API
tokens.

### Problem B: nothing reported the drift

The failure that will recur. GFW broke, LPI took over, the system ran, the dashboard
stayed green, and it held for months.

Mechanical cause: `catch (e) { return null; }`. Fetch failure is swallowed and returns
nothing, and *nothing* is indistinguishable from *no data for this country this year*.
A silent null is an unattributable claim.

**Proposed mechanism — signal contracts.** Each signal declares required source, required
endpoint, maximum acceptable age, and whether fallback is permitted. A daily verifier
checks reality against the declaration.

Three rules make it work:

1. **No silent nulls.** A fetch failure writes a failure record carrying HTTP status and
   URL. It never returns empty.
2. **Fallbacks are declared, not discovered.** Permitted fallbacks are named in the
   contract, and the row's `source` field records which path executed. An undeclared
   fallback is a hard failure.
3. **Staleness is a failure.** The contract sets maximum age. `sanctions_pressure` at 2005
   should have been red for twenty years of data, not resting quietly in the table.

Signal health then renders as a first-class element of the dashboard, not a buried
attribute. A signal failing its contract goes amber and stops contributing to scores
until cleared manually.

Estimated: one to two days.

**First step when resuming:** build the contract file from the fetcher inventory
(section 7 source data), not from intent. The inventory command is preserved below.

```powershell
Get-ChildItem .\historical\fetchers\*.cjs | ForEach-Object {
  $n = $_.BaseName
  $urls = (Select-String -Path $_.FullName -Pattern "https://[^`"'`` ]+" -AllMatches).Matches.Value |
          ForEach-Object { ($_ -split '/')[2] } | Sort-Object -Unique
  $m = (Select-String -Path $_.FullName -Pattern "signal_key:\s*'([^']+)'" -AllMatches).Matches
  $keys = if ($m) { $m | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique } else { @() }
  [pscustomobject]@{ file = $n; hosts = ($urls -join ', '); keys = ($keys -join ', ') }
} | Format-Table -AutoSize -Wrap
```

---

## 9. Buyer-facing consequence

Not yet checked: whether the site, dossiers, or DOD materials describe these signals in
event terms. The fetchers are honest about themselves — the comments state what they do.
The open question is whether the buyer-facing copy is.

That check should precede any further outreach.

---

## Appendix A — full fetcher inventory (raw output, 2026-08-17)

Generated by the command in section 8. Two `Cannot index into a null array` errors were
thrown by the original command on files containing no `signal_key` literal
(`gee_setup_check`, `worldbank_historical`); the corrected command in section 8 handles
this. Rows are otherwise complete and unedited.

```
file                           hosts                                                  keys
----                           -----                                                  ----
cable_disruption_historical    api.worldbank.org                                      cable_disruption
chokepoint_historical          api.worldbank.org                                      chokepoint
climate_historical             archive-api.open-meteo.com                             climate_stress
corruption_historical          api.worldbank.org                                      occrp
currency_historical            api.worldbank.org                                      currency_collapse
cyber_threat_historical        api.worldbank.org                                      cyber_threat
dam_risk_historical            api.worldbank.org                                      dam_risk
dark_vessel_historical         api.worldbank.org, gateway.api.globalfishingwatch.org  dark_vessel
displacement_historical        (none)                                                 displacement
eia_historical                 api.eia.gov                                            energy_stress
fao_historical                 bulks-faostat.fao.org                                  fao_food
fews_food_security_historical  api.worldbank.org                                      food_security
firms_historical               firms.modaps.eosdis.nasa.gov                           fire_hotspot
firms_historical_v2            firms.modaps.eosdis.nasa.gov                           fire_hotspot
flight_movement_historical     api.worldbank.org                                      flight_movement
flood_risk_historical          api.worldbank.org                                      flood_risk
food_security_historical       api.worldbank.org                                      fao_food
fred_historical                api.stlouisfed.org                                     capital_flows
gdelt_historical               api.gdeltproject.org                                   gdelt_conflict
gee_fire_historical            (none)                                                 fire_hotspot
gee_setup_check                code.earthengine.google.com, console.cloud.google.com  (none)
gps_jamming_historical         api.worldbank.org                                      gps_jamming
health_crisis_historical       api.worldbank.org, ghoapi.azureedge.net                health_crisis
imf_historical                 www.imf.org                                            imf_fiscal
ioda_historical                api.ioda.inetintel.cc.gatech.edu                       internet_shutdown_ioda
iom_displacement_historical    api.worldbank.org                                      iom_displacement
iom_dtm_historical             dtmapi.iom.int                                         displacement_idp
maritime_trade_historical      api.worldbank.org                                      maritime_trade
military_proximity_historical  api.worldbank.org                                      military_proximity
ooni_historical                api.ooni.io                                            ooni_internet
pipeline_risk_historical       api.worldbank.org                                      pipeline_risk
port_congestion_historical     api.worldbank.org                                      port_congestion
prediction_market_historical   api.worldbank.org                                      prediction_market
rail_corridor_historical       api.worldbank.org                                      rail_corridor
resource_conflict_historical   api.worldbank.org                                      resource_conflict
seismic_historical             earthquake.usgs.gov                                    seismic_risk
social_volume_historical       api.worldbank.org                                      social_volume
sovereign_cds_historical       api.worldbank.org                                      sovereign_cds
structural_pressure_historical (none)                                                 structural_pressure
tor_historical                 metrics.torproject.org                                 tor_censorship
ucdp_historical                ucdp.uu.se                                             conflict, social_unrest
unhcr_historical               api.unhcr.org                                          displacement
unhcr_odp_historical           api.worldbank.org                                      unhcr_odp
usda_food_historical           api.worldbank.org                                      usda_food
vdem_historical                v-dem.net                                              vdem_governance
water_stress_historical        api.worldbank.org                                      water_stress
who_historical                 ghoapi.azureedge.net                                   health_crisis
worldbank_historical           api.worldbank.org                                      (none)
```

### Read from this table

- **26 fetchers call `api.worldbank.org` and nothing else.**
- **19 call a genuine domain-specific source:** Open-Meteo, EIA, FAOSTAT, NASA FIRMS (×2),
  FRED, GDELT, WHO GHO (×2), IMF, IODA, IOM DTM, OONI, USGS, Tor Metrics, UCDP, UNHCR,
  V-Dem, Google Earth Engine setup.
- **3 call no host at all:** `displacement_historical`, `gee_fire_historical`,
  `structural_pressure_historical`.
- **4 signal keys have multiple writers:** `fao_food` (2), `fire_hotspot` (3),
  `displacement` (2), `health_crisis` (2).

The nineteen genuinely-sourced fetchers are the asset. They were built, they call the
right places, and several of them (UCDP, V-Dem, IMF, FRED, USGS, NASA FIRMS, GDELT) are
exactly the sources a defense or underwriting buyer would expect to see. The remediation
question is not whether the system is real — it is which subset survives being named
honestly.
