# MedCover — Hair Restoration Template Registry

Authoritative SEO blueprint for hair restoration `ContentTemplate` records. Mirrors IVF templates A/A2/C/D/E/F with treatment-specific headings, data points, and schema.

**Treatment:** `HAIR_RESTORATION` · **Slug:** `hair-restoration`

---

## Template Index

| # | Letter | Name | URL Pattern | `contentType` | Intent | Priority | ~Words |
|---|---|---|---|---|---|---|---|
| 1 | HR-A | Country Destination Guide | `/guides/[country]-hair-restoration-guide/` | `LANDING_PAGE` | `COMMERCIAL` | 0.9 | 1,500 |
| 2 | HR-A2 | City Destination Guide | `/guides/[country]/[city]-hair-restoration-guide/` | `CITY_PAGE` | `COMMERCIAL` | 0.85 | 1,500 |
| 3 | HR-C | Country vs Country Comparison | `/compare/[a]-vs-[b]-hair-restoration/` | `COMPARISON` | `COMMERCIAL` | 0.8 | 1,500 |
| 4 | HR-D | Cost Transparency Page | `/costs/hair-restoration-[country]-cost-[year]/` | `LANDING_PAGE` | `INFORMATIONAL` | 0.8 | 1,800 |
| 5 | HR-E | Treatment Glossary / Entity | `/treatments/hair-restoration/` | `ARTICLE` | `INFORMATIONAL` | 0.8 | 1,800 |
| 6 | HR-F | Origin Patient Journey | `/from/[country]/hair-restoration-abroad/` | `LANDING_PAGE` | `INFORMATIONAL` | 0.8 | 1,800 |

---

## Global SEO Rules (Hair Restoration)

| Rule | Requirement |
|---|---|
| **AEO Hero Answer** | First 60 words after H1 must state cost range, technique availability (FUE/DHI), and patient interview count. |
| **metaTitle** | 50–60 chars; suffix `\| MedCover` |
| **metaDescription** | 130–155 chars; include graft pricing or per-procedure cost range |
| **YMYL** | Surgical claims require sources; treatment page requires medical reviewer credit |
| **Image alt** | `Hair transplant [subject] in [city], [country] — MedCover` |
| **Schema** | `MedicalProcedure` + `BreadcrumbList` minimum on all pages |

---

## Template HR-A — Country Destination Guide

**URL:** `/guides/[country]-hair-restoration-guide/`

| Field | Formula |
|---|---|
| **metaTitle** | `Hair Transplant in [Country] [Year] — Costs, Clinics & Patient Truth \| MedCover` |
| **metaDescription** | `Based on [N] verified patient interviews, hair transplant in [Country] costs €[X]–€[X]. See FUE/DHI pricing, clinic rankings, and patient quotes.` |
| **H1** | `Hair Transplant in [Country]: What [N] Real Patients Told Us` |

**H2s (ordered):**

1. MedCover Truth Score for [Country]: What the Data Shows
2. Hair Transplant Cost in [Country]: What Patients Actually Paid
3. FUE vs DHI vs FUT: Which Technique Is Most Common in [Country]?
4. What Patients Say About Hair Transplants in [Country]
5. Marketing vs Reality: What [Country] Clinics Do Not Tell You
6. Top Hair Transplant Clinics in [Country] by Truth Score
7. Graft Counts and Pricing: How [Country] Clinics Quote
8. Recovery, Downtime, and When You Can Fly Home
9. [Country] vs UK/USA Hair Transplant: Cost Comparison
10. Frequently Asked Questions About Hair Transplants in [Country]

**Required internal links:** `/treatments/hair-restoration/`, country cost page, top city guides, 3+ clinic profiles, 1 comparison page.

**Schema:** `MedicalWebPage`, `FAQPage`, `BreadcrumbList`, `SpeakableSpecification`

---

## Template HR-A2 — City Destination Guide

**URL:** `/guides/[country]/[city]-hair-restoration-guide/`

| Field | Formula |
|---|---|
| **H1** | `Hair Transplant in [City]: [N] Clinics, Real Costs & Patient Insights` |

**H2s:**

1. Hair Transplant in [City]: What the Data Shows
2. Hair Transplant Cost in [City] vs [Country] Average
3. FUE and DHI Clinics Tracked in [City]
4. Travel Logistics for Hair Transplant in [City]
5. Recovery Hotels and Aftercare Near [City] Clinics
6. [City] vs [Other City] Hair Transplant Comparison
7. Frequently Asked Questions About Hair Transplants in [City]

**Required data:** clinics tracked, graft price range, airport, neighborhoods, typical downtime.

---

## Template HR-C — Country vs Country Comparison

**URL:** `/compare/[country-a]-vs-[country-b]-hair-restoration/`

| Field | Formula |
|---|---|
| **H1** | `Is [Country A] or [Country B] Better for a Hair Transplant?` |

**H2s:**

1. Quick Verdict: [Country A] vs [Country B]
2. Full Hair Transplant Comparison Table
3. Cost Breakdown: Grafts, Technique, and All-In Price
4. Patient Quotes from Each Country
5. Technique and Surgeon Quality Comparison
6. Recovery and Travel Logistics
7. Which Country Is Right for You?
8. Frequently Asked Questions

---

## Template HR-D — Cost Transparency Page

**URL:** `/costs/hair-restoration-[country]-cost-[year]/`

| Field | Formula |
|---|---|
| **H1** | `Hair Transplant Cost in [Country]: What Patients Actually Paid` |
| **metaTitle** | `Hair Transplant Cost in [Country] [Year] — Real Patient Data \| MedCover` |

**H2s:**

1. Hair Transplant Cost in [Country]: Direct Answer
2. Base Procedure Costs by Graft Count (2,000 / 3,000 / 4,000+)
3. FUE vs DHI Price Differences
4. Add-On Costs: PRP, Accommodation Packages, Medication
5. Travel and Logistics Costs
6. Total All-In Cost Scenarios
7. Hidden Costs Patients Reported
8. How [Country] Compares With UK/USA
9. What Affects Hair Transplant Price?
10. Frequently Asked Cost Questions

**Required tables:** graft-count pricing tiers, add-on line items, all-in scenarios (budget / mid / premium).

---

## Template HR-E — Treatment Glossary

**URL:** `/treatments/hair-restoration/`

| Field | Formula |
|---|---|
| **H1** | `What Is Hair Restoration? FUE, DHI, and FUT Explained` |
| **requiresMedicalReviewer** | `true` |

**H2s:**

1. What Is Hair Restoration?
2. How FUE (Follicular Unit Extraction) Works
3. How DHI (Direct Hair Implantation) Works
4. FUT (Strip Method): When It Is Still Used
5. Graft Counts: How Many Grafts Do You Need?
6. Success Rates and Results Timeline
7. Why Patients Travel Abroad for Hair Transplants
8. What MedCover Patients Report
9. Where Hair Restoration Is Available
10. Glossary of Hair Transplant Terms
11. Frequently Asked Questions
12. External Medical Resources

**Schema:** `MedicalWebPage`, `MedicalProcedure`, `HowTo`, `FAQPage`, `BreadcrumbList`

---

## Template HR-F — Origin Patient Journey

**URL:** `/from/[country]/hair-restoration-abroad/`

| Field | Formula |
|---|---|
| **H1** | `Hair Transplant Abroad for [Origin] Patients: What You Need to Know` |

**H2s:**

1. Why [Origin] Patients Travel for Hair Transplants
2. Best Hair Transplant Destinations for [Origin] Patients
3. Cost Comparison: [Origin] vs Turkey vs Spain vs Greece
4. Choosing a Clinic: Red Flags and Green Flags
5. Travel Logistics: Flights, Visits, and Recovery Time
6. Insurance and Financing Considerations
7. Patient Stories from [Origin]
8. Frequently Asked Questions

**Hreflang:** Use origin-country-specific hreflang where applicable.

---

## IVF vs Hair Restoration — Key Differences

| Field | IVF | Hair Restoration |
|---|---|---|
| H1 pattern | `IVF in [Country]: What [N] Real Patients Told Us` | `Hair Transplant in [Country]: What [N] Real Patients Told Us` |
| Primary data | Cost/cycle, success rate, clinic rankings | Graft pricing, FUE vs DHI, hairline design |
| Schema | `MedicalProcedure` (fertility) | `MedicalProcedure` (cosmetic/surgical) |
| YMYL level | High | Medium-high |
| Key H2s | Protocol, egg quality, legal context | Technique, graft counts, downtime, scarring |
| Recovery focus | Post-transfer, beta hCG | 10–14 day healing, when to fly home |
