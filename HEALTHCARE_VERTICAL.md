# Healthcare Vertical — Billing Denial Prevention
## Sabian Technology · Internal Brief · 2026-08-15

---

## The Product

Read medical practice claim data before submission. Catch the errors that cause denials. Clean claim goes out. Revenue stops leaking.

**$499/month per practice.**

---

## Why This Problem

- **$262 billion** in denied claims annually (US) — Premier Inc
- Behavioral health denial rate: **12–20%** — highest of any specialty
- **82–85%** of behavioral health denials are preventable
- **60%** of behavioral health denials are never reworked — permanent loss
- At $1.5M practice revenue: ~$106k lost permanently every year
- Nobody has built this for solo PMHNP practices. Gap confirmed.

---

## Target Market

**Profile:** Solo or small-group PMHNP-owned telehealth psychiatric practice. Insurance-based. Owner is sole decision maker. 1–5 providers. Template website. No tech layer.

**Benchmark:** Dr. Martin Binyange, DNP, PMHNP-BC, MPH
- Practice: Mental Health Counseling and Wellness Center
- Site: nvmentalwell.com
- EHR: Tebra (confirmed)
- Phone: (702) 602-5250
- Licensed: Nevada + Arizona
- Revenue est: $1.5M–$2.5M/yr
- Telehealth-only. Sole decision maker. Easy to approach.

---

## Top 6 Preventable Denial Reasons (Behavioral Health)

All catchable before claim leaves the practice:

1. CPT time mismatch — wrong session length code (90832/90834/90837)
2. Telehealth modifier errors — missing -95, wrong POS code (02 vs 10)
3. NPI/credentialing mismatch — group NPI not enrolled with specific payer (critical for multi-state telehealth)
4. Session limit exceeded — no alerts before hitting annual cap
5. Wrong primary diagnosis code (Z-code/F-code misuse)
6. Wrong payer entity for behavioral health carve-out

---

## The Technical Architecture

### Universal Pipe — X12 835 ERA
- Federally mandated under HIPAA — every payer sends denial data via 835 transaction
- Contains CARC codes (Claim Adjustment Reason Codes) and RARC codes
- CLP02 = 4 means denied claim
- Lives in the clearinghouse before it reaches the EHR

### Clearinghouse = One Integration, Entire Market
- **Waystar** and **Change Healthcare** process 835s for Tebra, SimplePractice, and most EHRs
- Connect to the clearinghouse = read denial data across every practice regardless of EHR
- One integration reaches the entire US market

### EHR-Specific Connectors (build in order)

| EHR | API Status | Practice Size | Priority |
|---|---|---|---|
| **Tebra** | Public SOAP API exists. Added Active Denials Report March 2026. Denial code API access needs sandbox verification | Solo PMHNP — exact fit | **First** |
| **SimplePractice** | No public API. CSV export only | Solo mental health — exact fit | CSV first, API if they open |
| **athenahealth** | Confirmed API with denial/CARC/RARC codes | Mid-large practices | Second |
| **eClinicalWorks** | FHIR R4 + EDI 835 confirmed | Mid-size | Third |
| **DrChrono** | REST API, billing data, denial codes unconfirmed | Small practices | Verify |
| **Epic** | SMART on FHIR, batch 835 | Hospital systems | Long term |

### Tebra API Details
- SOAP API: `helpme.tebra.com/Tebra_PM/12_API_and_Integration`
- Auth: API Key in `X-Api-Key` header
- Third parties confirmed building billing tools on it (BillingParadise, Voyant Health)
- **Next step: Register on Tebra developer portal, get sandbox access, test denial code endpoints**

### Pre-Submission Prediction
- ML models catch 30% of denials before submission by reading CPT-payer-provider patterns
- Graph-based models learn which CPT+payer+modifier combinations historically deny
- Rule-based scrubbers catch hard errors (wrong format, missing field)
- Combined = clean claims before they leave the practice

---

## What Already Exists (and Why It Fails This Market)

| Company | Gap |
|---|---|
| Waystar, FinThrive, Inovalon | Enterprise-priced, not for solo practices |
| AdvancedMD, CureMD | Requires switching EHR — too much friction |
| CollaborateMD | Reactive — tracks after denial, doesn't prevent |
| Tebra built-in | Basic scrubbing only, not predictive |
| **Nobody** | Serving solo PMHNP specifically |

---

## 20-Practice Prospect List

### Tier 1 — Call First
1. Dr. Martin Binyange — nvmentalwell.com — (702) 602-5250 — NV/AZ — Tebra confirmed
2. Chinwe Ibiam — firstcornerstonehealth.com — (877) 999-0102 — GA/NC/WA/FL — Tebra confirmed
3. Uwa Omoregbe — irisbehavioralhod1.com — (347) 837-7480 — TX
4. Melissa Madalone — telanp.com — NY
5. Alendre McGhee — ingenioushealthsolutions.com — admin@ingenioushealthsolutions.com — (937) 918-6174 — OH/AZ/FL/NC/VT
6. Pascale Kidane — virtualpsychiatriccare.com — OH
7. Solo founder — Kintsugi Psychiatric Care PLLC — TN
8. PMPI TeleMed — pmpitelemed.com — CA

### Tier 2
9. Afi Kpakossou — pinnaclebhw.com — NC
10. Marie Akers — shieldpsychiatry.org — (813) 320-1246 — FL
11. Mark Gomez — Enlightenment LLC — Las Vegas NV
12. Finding Hopes — Las Vegas + AZ/UT/WA
13–17. (TX and FL practices — see full dossier)

---

## Distribution Channels

- **Facebook: "PMHNP Solo Private Practice Group"** — 11,000 members. Read, scrape pain language, contact directly. Don't post.
- **Podcast: "No Prior Auth"** — Lindsay Hill, DNP. Billing pain focus. Weekly. Sponsorship or guest.
- **Psych Congress NP Institute** — Nashville, March 2026. PMHNP-only. Sponsor table.
- **TherapySites footer badge** — publicly visible customer list on every client site.

---

## Sabian Position

- Sabian stays invisible — powered-by model
- Practice connects their EHR, Sabian reads operational data only (no PHI)
- HIPAA boundary: aggregate operational data, claim codes, payer IDs — not patient names, DOB, diagnosis, clinical notes
- Owner receives intelligence — not a dashboard they check, intelligence delivered to them
- $499/month recovers a fraction of $106k permanent annual loss = obvious yes

---

## Immediate Next Steps

1. **Register on Tebra developer portal** — get sandbox API key — test what billing/denial endpoints actually return
2. **Verify clearinghouse API access** — contact Waystar developer program
3. **Land Binyange** — approach with value first, not a pitch
4. **Connect Tebra, run first read** on real practice data

---

## Open Questions (reason with Fable 5)

- After Sabian catches a denial pattern — what does it actually DO to fix it? Auto-flag to biller? Auto-correct and resubmit? 
- What does the owner receive and in what format?
- What is the product name for the healthcare front door?
- Clearinghouse partnership requirements — volume minimums?
