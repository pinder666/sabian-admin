# Sabian Country-Risk Terminal — Methodology

**Version:** 1.1 — May 22, 2026
**Status:** Published. This document is the authoritative record of how every score is computed.

**Change from v1.0:** Three signals added before the 90-day run clock — GPS Jamming, Social Unrest, Sanctions Pressure. Existing signal weights adjusted proportionally. All historical scores prior to this date used the 13-signal v1.0 model.

---

## What This System Does

Sabian compiles 16 observable signals across 160 countries into a single 0–100 score. It does not predict. It makes legible. Every point in every score is traceable to a source, a weight, and an arithmetic step. A decision-maker can verify the score from first principles using only this document and the underlying data sources.

---

## The Equation

```
convergence_score = round(
    Σ ( signal_score_i × signal_weight_i )
    ─────────────────────────────────────
           Σ ( live_weights )
)
```

Where:
- `signal_score_i` — the score returned by signal i, range 0–100
- `signal_weight_i` — the allocated weight for signal i (see table below)
- `Σ(live_weights)` — sum of weights for signals that returned a non-null score
- Signals returning `null` are excluded from both the numerator and denominator

This is a weighted average over live signals only. Null signals do not contribute zero — their weight is redistributed proportionally across whatever signals did return data.

---

## Null-Redistribution Rule

If a signal returns `null` (source unavailable, API failure, no data for this country), its allocated weight is redistributed proportionally across all signals that scored.

**Example:** 16 signals allocated. 3 return null (combined weight 10%). The 13 live signals collectively hold 90% of weight. The denominator becomes 0.90 instead of 1.0. Each live signal's effective weight = `allocated_weight / 0.90`. The final score is still on a 0–100 scale.

**Why this rule:** Injecting a fabricated value (e.g., 50 for "unknown") corrupts the score. Excluding null signals entirely would silently compress the scale. Proportional redistribution preserves the relative influence of signals that did return data while keeping the output on a consistent scale.

Every score output includes `signals_available`, `signals_failed`, `freshness_pct`, and a full `decomposition` object showing each signal's allocated weight, redistributed weight, and contribution to the final number.

---

## The 16 Signals

Weights are **judgment-set** — set by the system architect based on the predictive significance of each signal for state-level instability. They are not derived from a statistical model. They are documented here so any analyst can challenge them.

| # | Signal | Source | Allocated Weight | Update Cadence |
|---|---|---|---|---|
| 1 | Conflict Events | GDELT | 16% | GDELT near-realtime |
| 2 | Food Security | FEWS NET — IPC phase | 15% | Monthly |
| 3 | Governance | World Bank WGI | 12% | Annual |
| 4 | Displacement | UNHCR | 11% | Monthly |
| 5 | Satellite Fire | NASA FIRMS VIIRS | 7% | Near-realtime (3–12hr) |
| 6 | Climate Stress | Open-Meteo | 7% | Daily |
| 7 | Social Unrest | Dormant (ACLED removed 2026-06-01) | 4% | — |
| 8 | Resource Conflict | Commodity price feeds | 4% | Daily |
| 9 | Fiscal Stress | IMF World Economic Outlook | 5% | Quarterly |
| 10 | Internet Freedom | OONI | 5% | Daily |
| 11 | GPS Jamming | gpsjam.org hexgrid | 3% | Daily |
| 12 | Sanctions Pressure | OFAC SDN + UN/EU programs | 3% | Weekly |
| 13 | Maritime Trade | UNCTAD | 3% | Monthly |
| 14 | Trade Collapse | UN Comtrade / IMF DOTS | 2% | Quarterly |
| 15 | Economic Stress | World Bank GDP/CPI | 2% | Quarterly |
| 16 | Seismic Risk | USGS | 1% | Realtime |

**Total allocated weight: 100%**

### Weight rationale

- **Conflict (16%) + Food Security (15%) + Governance (12%) + Displacement (11%) = 54%** — the physical and institutional core of state fragility. These four signals are the ones that appear in every major fragility index. Combined weight reflects that; reduced from 59% in v1.0 to accommodate three new signals.
- **Social Unrest (4%)** — Signal dormant as of 2026-06-01. Source was ACLED protest/riot data; ACLED removed due to EULA restriction prohibiting ML training use and no available replacement source. Weight reserved for reactivation when a compliant source is identified.
- **Satellite Fire (7%) + Climate Stress (7%)** — near-realtime physical observation layer. Each reduced 1pt from v1.0 to accommodate new signals.
- **Fiscal Stress (5%) + Internet Freedom (5%)** — institutional collapse and repression signals. Unchanged.
- **GPS Jamming (3%)** — gpsjam.org daily hexgrid of GPS/GNSS interference probability. GPS jamming is a direct indicator of military activity and conflict escalation; it precedes and accompanies kinetic operations by 24–72hr. Small weight, high signal-to-noise for active conflict zones. Score is null for countries where h3-js is not installed — weight redistributes cleanly.
- **Sanctions Pressure (3%)** — OFAC SDN entity count + active international sanctions program severity. Sanctions reflect political isolation and economic stress cascades; comprehensive sanctions correlate with state fragility and conflict ignition risk.
- **Resource Conflict (4%) + Maritime Trade (3%) + Trade Collapse (2%) + Economic Stress (2%)** — economic layer. Slower-cadence signals; trade and GDP data operate on quarterly lag. Total economic layer at 11%.
- **Seismic Risk (1%)** — pure physical hazard. Relevant for humanitarian cascade, not political instability.

---

## Risk Bands

| Score | Band | Decision Window |
|---|---|---|
| 0 – 40 | STABLE | 90+ days — no immediate trigger identified |
| 41 – 65 | ELEVATED | 60–90 days — monitor and prepare |
| 66 – 80 | WARNING | 30–60 days — 55-day decision window |
| 81 – 100 | CRITICAL | 0–30 days — action window closing |

---

## Observation Windows

When a country crosses a risk band boundary, the crossing is timestamped in the observation ledger. The window is the period during which the observation is considered open (ungraded).

| Band at Crossing | Window |
|---|---|
| CRITICAL | 30 days |
| WARNING | 55 days |
| ELEVATED | 90 days |

At window close, the observation is graded: **HIT** (situation held or worsened in the predicted direction), **MISS** (reversed), or **PARTIAL** (intermediate). The 90-day dossier reports the honest hit rate across all graded observations.

---

## What the Score Is Not

- It is not a prediction. It reports what observable data shows today.
- It is not a recommendation for action. It is a legibility surface.
- It does not direct targeting, inform weapons deployment, or produce threat assessments about individuals.
- The United States is included on the same terms as every other country. No country is exempt from the methodology.

---

## Reproducibility

Every score output includes a `decomposition` object:

```json
{
  "equation": "convergence_score = round( Σ(signal_score × signal_weight) / Σ(live_weights) )",
  "weights_basis": "judgment-set — see METHODOLOGY.md",
  "signals_live": 13,
  "signals_null": 3,
  "null_redistribution": "3 null signal(s) held 10.0% combined weight. Each live signal's effective weight = allocated_weight / 0.9000.",
  "contributions": [
    { "signal": "Conflict Events", "score": 82, "weight_allocated": "16.0%", "weight_used": "17.78%", "contribution": 14.58 },
    ...
  ],
  "sum_check": 62.0
}
```

`sum_check` should equal `convergence_score` within rounding. If it does not, that is a bug and should be reported.

---

## Data Access

All signal sources are public or publicly accessible with free registration:

| Source | URL |
|---|---|
| FEWS NET | fews.net — public API |
| World Bank WGI | databank.worldbank.org — public |
| UNHCR | data.unhcr.org — public API |
| NASA FIRMS | firms.modaps.eosdis.nasa.gov — free API key |
| Open-Meteo | open-meteo.com — free, no key required |
| IMF WEO | imf.org/en/Publications/WEO — public |
| OONI | ooni.org/data — public |
| UN Comtrade | comtradeplus.un.org — public API |
| USGS | earthquake.usgs.gov/fdsnws — public |
| UNCTAD | unctadstat.unctad.org — public |
| gpsjam.org | gpsjam.org/data/{YYYY-MM-DD}.json — public (requires h3-js) |
| OFAC SDN | treasury.gov/ofac/downloads/sdn.xml — public |

---

## ACLED Data Use Restriction

ACLED was removed from Sabian on 2026-06-01. No ACLED data is stored in any Sabian table. The ACLED EULA prohibits use of ACLED data to train or develop machine learning models — this restriction, combined with the absence of an active API key, led to the decision to remove ACLED entirely rather than risk future compliance issues. Conflict Events now runs via GDELT only.

---

*This methodology document is versioned alongside the codebase. Any change to signal weights, the equation, or the null-redistribution rule is a methodology change and must be reflected here with a version bump and date.*
