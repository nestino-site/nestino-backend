# MedicalVera.com — Page Templates

Each template defines the structural contract for a page type: sections, order, schema fired, internal links required, and AEO rules. These are the blueprints for development and content generation.

---

## Template A — Country Destination Guide

**URL pattern:** `/guides/[country]-ivf-guide/`
**Example:** `/guides/spain-ivf-guide/`
**Index:** Yes | **Priority:** 0.9 | **changefreq:** monthly

### Page Sections (in order)

| # | Section | Description | AEO/SEO Purpose |
|---|---|---|---|
| 1 | Breadcrumb | `Home > Country Guides > Spain IVF Guide` | BreadcrumbList schema |
| 2 | H1 + Hero Answer Block | H1: "IVF in Spain: What [N] Real Patients Told Us" — then 60-word direct answer | AEO snippet target |
| 3 | Truth Score Summary Card | MedicalVera score for Spain (aggregate across all clinics) + date of last update + interview count | Proprietary trust signal |
| 4 | Key Statistics Table | 5 rows: Avg cost, Avg success rate (by age), Avg wait time, Staff English avg, Hidden cost frequency | Featured snippet table |
| 5 | AI Interview Insights Block | 3–5 verbatim (anonymized) patient quotes, each tagged with dimension (Cost / English / Outcome) | E-E-A-T + Review schema |
| 6 | "What Marketing Says vs What Patients Say" | Side-by-side table: clinic claims vs verified patient data | Differentiator |
| 7 | Top Clinics in [Country] (linked cards) | Top 5 clinics by Truth Score, each card links to clinic profile | Internal link hub |
| 8 | Full Cost Breakdown Section | All-in cost (procedure + meds + travel + accommodation) — links to cost page | Money page signal |
| 9 | Legal & Ethical Context | Egg donation law, anonymity rules, regulation body — with external link to official law | E-E-A-T + compliance |
| 10 | Comparison Block | Spain vs US/UK table (3 rows: cost, wait time, success rate) — links to compare page | Conversion + internal link |
| 11 | FAQ Accordion (10–14 questions) | Patient-sourced questions, answers start with direct 1-sentence reply | FAQPage schema |
| 12 | Speakable Summary | 2–3 sentence summary of the page marked with `speakable` schema | Voice + AI extraction |
| 13 | Related Pages (card row) | Linked to: cost page, compare page, top 3 clinic profiles, /from/usa/ | Internal link |
| 14 | CTA Block | "Get Your Personalized [Country] IVF Report" — leads to `/start/` | Conversion |

### Schema Fired
```
MedicalWebPage (with lastReviewed, reviewedBy, specialty: Fertility)
FAQPage
BreadcrumbList
SpeakableSpecification
AggregateRating (overall score for the country)
```

### Required Internal Links
- `/costs/[country]-ivf-cost-[year]/`
- `/compare/[country]-vs-usa-ivf/`
- Top 5 clinic profiles in this country
- `/treatments/ivf/`
- `/treatments/egg-donation/` (if relevant to country)
- `/faq/`

---

## Template B — Clinic Profile Page

**URL pattern:** `/clinics/[country]/[city]/[clinic-slug]/`
**Example:** `/clinics/spain/barcelona/instituto-marques/`
**Index:** Yes | **Priority:** 0.7 | **changefreq:** weekly

### Page Sections (in order)

| # | Section | Description | AEO/SEO Purpose |
|---|---|---|---|
| 1 | Breadcrumb | `Home > Clinics > Spain > Barcelona > Instituto Marqués` | BreadcrumbList schema |
| 2 | H1 + Clinic Identity | H1: "[Clinic Name] — MedicalVera Truth Report" | Entity clarity |
| 3 | MedicalVera Truth Score Badge | Score (0–100), grade letter, interview count, last updated date | Proprietary + AggregateRating schema |
| 4 | Clinic Fast Facts Table | Country, city, accreditations (JCI/ISO), languages spoken, founding year, treatments offered | MedicalClinic schema properties |
| 5 | Verified Stats Block (10 dimensions) | All 10 Knowledge Graph dimensions displayed as scored bars + interview-sourced data | Structured, scrapeable data |
| 6 | "Truth vs Marketing" Block | Clinic's own marketing claims (from their site) vs what patients actually reported | Core differentiator |
| 7 | Patient Interview Excerpts (3–5) | Anonymized, verbatim quotes tagged by dimension — "Cost", "English", "Outcome", etc. | Review schema |
| 8 | Hidden Costs Revealed | Specific hidden costs named by patients (meds not included, monitoring fees, etc.) | High-value AEO target |
| 9 | Procedure Pricing Table | IVF, Egg Donation, PGT-A — clinic's ranges + MedicalVera-verified ranges | Cost transparency |
| 10 | Staff & Lab Quality | English proficiency score, lab equipment age (patient-reported), embryologist experience | Differentiator |
| 11 | Compare with Similar Clinics | Side-by-side with 2 competitor clinics in same city/country — links to `/compare/clinics/` | Internal links |
| 12 | FAQ (6–10 clinic-specific questions) | Includes: "Is [Clinic] worth it?", "What are [Clinic]'s real success rates?" | FAQPage schema |
| 13 | Clinic Response Slot | Optional section if clinic has a verified MedicalVera account — their official response | Trust + balance |
| 14 | Methodology Note | "Based on [N] patient interviews conducted by MedicalVera AI between [date range]" | E-E-A-T |
| 15 | CTA: Request Verified Lead | For patients: "Connect with this clinic" — triggers B2B lead | Revenue |

### Schema Fired
```
MedicalClinic
  name, address, telephone, url
  medicalSpecialty: Fertility
  openingHoursSpecification
  hasMap
AggregateRating (ratingValue, ratingCount, bestRating: 100)
Review x3 (from interview excerpts, anonymized)
FAQPage
BreadcrumbList
```

### Required Internal Links
- Parent country guide
- Parent city index
- Truth report for this clinic (`/reports/[clinic-slug]-patient-truth-report/`)
- 2 competitor clinic profiles (contextual within comparison block)
- `/truth-score/` (explanation of scoring)
- `/for-clinics/` (for clinic discovery)

---

## Template C — Comparison Page (Country vs Country)

**URL pattern:** `/compare/[country-a]-vs-[country-b]-ivf/`
**Example:** `/compare/spain-vs-greece-ivf/`
**Index:** Yes | **Priority:** 0.8 | **changefreq:** monthly

### Page Sections (in order)

| # | Section | Description |
|---|---|---|
| 1 | Breadcrumb | `Home > Compare > Spain vs Greece IVF` |
| 2 | H1 + Direct Answer | H1 phrased as question. First 60 words: direct verdict (e.g., "Spain has higher costs but better English proficiency...") |
| 3 | Quick Verdict Card | Winner per category in a scannable card: Cost / English / Success Rate / Wait Time / Legal / Recommendation |
| 4 | Full Comparison Table | 10+ rows, one column per country, MedicalVera-sourced data + citation per row |
| 5 | Cost Breakdown (both countries) | All-in cost table per country, side-by-side |
| 6 | Patient Quotes from Each Country | 2 quotes per country, tagged by interview source |
| 7 | Success Rate Comparison | Age-stratified success rates (cited to ESHRE or clinic data) |
| 8 | Legal Differences | Egg donation anonymity, regulation bodies, law links |
| 9 | "Which is Right for You?" Decision Tree | Simple text-based decision guide (not interactive in Phase 1) |
| 10 | FAQ (8–12 questions) | Both countries addressed in answers |
| 11 | Related Comparisons (linked) | 3 related compare pages |
| 12 | CTA | "Get a Personalized Comparison Report" → `/start/` |

### Canonical Rule
- `/compare/spain-vs-greece-ivf/` is canonical
- `/compare/greece-vs-spain-ivf/` 301-redirects to the canonical URL

### Schema Fired
```
Article (with author, datePublished, dateModified)
FAQPage
BreadcrumbList
SpeakableSpecification (Quick Verdict section)
```

### Required Internal Links
- Country guide A + Country guide B
- Cost page A + Cost page B
- `/from/usa/ivf-abroad/`

---

## Template D — Cost Transparency Page

**URL pattern:** `/costs/[country]-ivf-cost-[year]/`
**Example:** `/costs/spain-ivf-cost-2026/`
**Index:** Yes | **Priority:** 0.8 | **changefreq:** monthly

### Page Sections (in order)

| # | Section | Description |
|---|---|---|
| 1 | Breadcrumb | `Home > Costs > Spain IVF Cost 2026` |
| 2 | H1 + Direct Answer | First 60 words: actual cost range ("IVF in Spain costs between €3,800–€7,500 per cycle based on [N] patient interviews") |
| 3 | Base Cost Table | IVF / Egg Donation / PGT-A — low / mid / high range, MedicalVera sourced |
| 4 | Add-On Costs Table | Medications, monitoring, genetic testing — each line: quoted vs patient-reported |
| 5 | Travel & Logistics Cost Table | Flights, accommodation, visa, translation — avg per patient |
| 6 | Total All-In Calculator (static first) | Static table showing 3 scenarios (budget / mid / premium) |
| 7 | Hidden Costs Section | Specific hidden costs named by patients — the most valuable section |
| 8 | US / UK / Canada vs [Country] Comparison | 3-row table: avg cost in origin vs destination — with % savings |
| 9 | What Affects the Price | Patient-interview-sourced list: age, protocol, egg donor requirements, clinic tier |
| 10 | FAQ (8–10 questions) | "Is IVF in Spain covered by insurance?", "What's not included in the quoted price?" |
| 11 | Related Pages | Country guide, top clinic profiles, compare pages |
| 12 | CTA | "Get a Full Cost Breakdown for Your Situation" → `/start/` |

### Year Redirect Strategy
When a new year page is created:
- Old URL: `/costs/spain-ivf-cost-2025/` → 301 → `/costs/spain-ivf-cost-2026/`
- Update `lastmod` in sitemap, update `lastReviewed` in schema

### Schema Fired
```
MedicalWebPage (lastReviewed, reviewedBy, specialty: Fertility)
FAQPage
BreadcrumbList
SpeakableSpecification (total cost summary paragraph)
```

---

## Template E — Treatment Glossary / Entity Page

**URL pattern:** `/treatments/[treatment]/`
**Example:** `/treatments/ivf/`, `/treatments/egg-donation/`
**Index:** Yes | **Priority:** 0.8 | **changefreq:** yearly

### Page Sections (in order)

| # | Section | Description |
|---|---|---|
| 1 | Breadcrumb | `Home > Treatments > IVF` |
| 2 | H1 + Definition (answer-first) | "What is IVF?" answered in first 60 words — plain language |
| 3 | HowTo: The Process | Step-by-step IVF process (6–8 steps) — HowTo schema |
| 4 | Success Rates by Age | Table: age bracket vs success rate — cited to CDC/SART/ESHRE |
| 5 | Why Patients Travel Abroad for This Treatment | Cost, access, legal (egg donation anonymity), wait time |
| 6 | What MedicalVera Patients Report | 3 interview excerpts focused on this treatment |
| 7 | Countries Available | Cards linking to each country guide |
| 8 | Glossary of Terms | Key fertility vocabulary — helps with entity recognition |
| 9 | FAQ (10–15 questions) | Covers both medical and logistical questions |
| 10 | Related Treatments | Links to related treatment pages |
| 11 | External Resources | CDC, SART, ESHRE, WHO — authoritative links |
| 12 | CTA | "Compare IVF Options Abroad" → country guides |

### Required Reviewer Credit
Every treatment page must include:
```
Medically reviewed by: [Name], [Credentials]
Last reviewed: [Date]
```
This is mandatory for YMYL compliance and E-E-A-T.

### Schema Fired
```
MedicalWebPage (lastReviewed, reviewedBy, specialty, audience)
MedicalProcedure (for the treatment itself)
HowTo
FAQPage
BreadcrumbList
```

---

## Template F — Origin Patient Journey Page

**URL pattern:** `/from/[country]/ivf-abroad/`
**Example:** `/from/usa/ivf-abroad/`
**Index:** Yes | **Priority:** 0.8 | **changefreq:** monthly

### Page Sections (in order)

| # | Section | Description |
|---|---|---|
| 1 | Breadcrumb | `Home > From USA > IVF Abroad` |
| 2 | H1 + Direct Answer | "IVF Abroad for US Patients: What You Need to Know" — 60-word answer |
| 3 | Why US Patients Travel | Cost comparison table (US avg vs top destinations), insurance gap |
| 4 | Top Destinations for [Origin] Patients | Cards: Spain, Greece, Czech Republic — sorted by relevance to origin |
| 5 | Legal Considerations | Insurance, legal rights abroad, FDA/jurisdiction notes for origin country |
| 6 | Logistics Guide | Visa, travel insurance, time off work, number of trips required |
| 7 | Patient Stories from [Origin] Country | 3 stories from same-origin patients |
| 8 | FAQ (10 questions) | Origin-country-specific: "Can I use insurance?", "How many trips to Spain?" |
| 9 | CTA | "Find Your Best Destination" → country guides |

### Schema Fired
```
Article (with author, datePublished, dateModified)
FAQPage
BreadcrumbList
SpeakableSpecification
```

---

## Template G — Truth Report (Auto-Generated)

**URL pattern:** `/reports/[clinic-slug]-patient-truth-report/`
**Example:** `/reports/instituto-marques-patient-truth-report/`
**Index:** Yes | **Priority:** 0.6 | **changefreq:** weekly

This page is **programmatically generated** from the Knowledge Graph whenever a threshold of new interviews is reached (see `04-interview-pipeline.md`).

### Page Sections (in order)

| # | Section | Description |
|---|---|---|
| 1 | Report Header | Clinic name, report date, interview count, data period (e.g., "Based on 23 interviews, Jan 2025 – May 2026") |
| 2 | Truth Score with Dimension Breakdown | Radar chart or score table: all 10 dimensions scored |
| 3 | Methodology Block | How interviews are conducted, how data is processed, anonymization statement |
| 4 | Key Findings Summary | 3–5 bullet findings ("87% of patients said English proficiency was above average") |
| 5 | Dimension Deep-Dive (10 sections) | One section per Knowledge Graph dimension — stats + 1 representative quote each |
| 6 | What Patients Loved | Top positive themes from NLP analysis of interview text |
| 7 | What Patients Flagged | Top concerns / recurring issues |
| 8 | Hidden Costs Revealed | Specific costs patients were surprised by |
| 9 | MedicalVera Recommendation | Structured recommendation (not editorial opinion — data-driven language) |
| 10 | Clinic Official Response | If clinic has claimed profile and submitted response |
| 11 | Data Freshness Notice | "This report was auto-generated on [date] and will update when new interviews are added." |
| 12 | CTA | "Connect with [Clinic]" (lead gen) OR "Request an Interview" (data contribution) |

### Auto-Generation Trigger
- Initial generation: 5+ interviews for the clinic
- Scheduled regeneration: weekly (if new interviews exist)
- Force regeneration: when clinic responds via claimed profile

### Schema Fired
```
CreativeWork (Report type, with dateCreated, dateModified)
AggregateRating (ratingValue derived from Truth Score, ratingCount = interview count)
Review x[N] (one per interview excerpt — anonymized, with datePublished)
Organization (referring to the clinic)
BreadcrumbList
```

### Content Generation Rules (CRITICAL for Google)
- Every report must include `lastReviewed` date
- Reports under 5 interviews are `noindex` until threshold met
- All patient quotes must include anonymization tag: "Patient interview, [Month Year], via MedicalVera"
- Methodology link must appear on every report (links to `/ai-interviewer/`)

---

## Template H — Patient Story Page

**URL pattern:** `/patient-stories/[descriptive-slug]/`
**Example:** `/patient-stories/ivf-spain-age-42-success/`
**Index:** Yes | **Priority:** 0.6 | **changefreq:** never (static after publish)

This is the **human-format** version of interview data — longer, narrative form, written by or with the patient.

### Page Sections (in order)

| # | Section | Description |
|---|---|---|
| 1 | Breadcrumb | `Home > Patient Stories > IVF Spain Age 42 Success` |
| 2 | Story Header | Age, origin country, destination country, treatment, outcome (pregnancy Y/N) |
| 3 | Patient Bio (anonymous) | Age, location (country only), duration of fertility journey before going abroad |
| 4 | The Full Story | Narrative, written in 1st or 3rd person — interview-sourced, edited for readability |
| 5 | Key Data Points (sidebar/callout) | Cost paid, clinic chosen, number of cycles, wait time, outcome |
| 6 | What Surprised Them | Hidden costs, unexpected positives, things to know |
| 7 | Would They Do It Again? | Direct quote |
| 8 | Clinic Referenced | Linked to clinic profile (if consented) or anonymized if not |
| 9 | Related Stories | 3 stories with similar profile (age range / destination) |
| 10 | CTA | "Share Your Story" → `/start/` |

### Schema Fired
```
Article (PersonalBlogPosting subtype)
  author: { @type: Person, name: "Anonymous Patient" }
  about: MedicalProcedure (IVF)
  datePublished, dateModified
Review (if patient gave a rating)
BreadcrumbList
```

### Consent Requirement
Patient stories require explicit written consent (see `04-interview-pipeline.md`).
Stories from patients who withdraw consent must be fully removed, not just edited.

---

## Template I — AI Interview Session (Patient-Facing)

**URL:** `/interview/`
**Index:** No (`noindex, nofollow`) | **No sitemap entry**

This is the live AI interview interface. Not a content page — a functional UI.

### Page Elements

| Element | Description |
|---|---|
| Progress indicator | Shows interview completion % |
| AI chat interface | Conversational UI with MedicalVera AI |
| Consent acknowledgment | Must be accepted before interview begins |
| Save & Continue | Allows interview to be paused and resumed via email link |
| Data use disclosure | Visible throughout: "Your responses will be anonymized and used to generate verified patient data." |

### Flow
```
/start/  →  email capture + consent  →  /interview/verify/[token]/  →  /interview/  →  /interview/complete/
```

### Data Handling
- No PHI (Protected Health Information) stored in raw form
- Interview transcript is processed by AI pipeline immediately upon completion
- Anonymized structured data is stored; raw transcript is deleted after 30 days (or per consent terms)

---

## Template A2 — City Destination Guide

**URL pattern:** `/guides/[country]/[city]-ivf-guide/`
**Example:** `/guides/spain/barcelona-ivf-guide/`
**Index:** Yes | **Priority:** 0.85 (top cities) | **changefreq:** monthly
**Parent:** Country guide (`/guides/spain-ivf-guide/`)

City guides are spokes off the country guide hub. They capture city-specific search intent ("IVF Barcelona", "egg donation Madrid cost") and aggregate clinic data at the city level.

### Page Sections (in order)

| # | Section | Description | AEO/SEO Purpose |
|---|---|---|---|
| 1 | Breadcrumb | `Home > Destinations > Spain IVF Guide > Barcelona IVF Guide` | BreadcrumbList schema |
| 2 | H1 + Hero Answer | H1: "IVF in Barcelona: [N] Clinics, Real Costs & Patient Insights" — 60-word direct answer | AEO snippet |
| 3 | City Quick Stats Card | Avg cost range, number of clinics tracked, avg wait time, clinic density note | City-specific data |
| 4 | Why Barcelona? | What makes this city specifically notable for IVF: clinic concentration, international patient experience, airport access, English proficiency | City differentiator |
| 5 | All Clinics in Barcelona | Linked cards: all tracked clinics in this city, sorted by Truth Score | Internal link hub |
| 6 | Cost Breakdown (city-specific) | Barcelona cost ranges vs Spain national avg — links to city cost page | Internal link + money page |
| 7 | Travel & Logistics | Airport (El Prat), best areas to stay, avg patient itinerary (how many trips), transport | Practical value |
| 8 | Barcelona vs [Other City] | Mini-comparison table: Barcelona vs Madrid (linked to full compare page) | Compare intent |
| 9 | FAQ (8–10 questions) | City-specific: "Is Barcelona more expensive than Madrid for IVF?", "How many clinics in Barcelona?" | FAQPage schema |
| 10 | Related Pages | Parent country guide, city cost page, city clinic index, compare page | Internal links |
| 11 | CTA | "View all Barcelona clinics" + "Share your Barcelona IVF experience" | Conversion |

### Schema Fired
```
MedicalWebPage (with lastReviewed, reviewedBy, specialty: Fertility)
FAQPage
BreadcrumbList
SpeakableSpecification (city stats + direct answer)
```

### Required Internal Links
- Parent country guide (`/guides/spain-ivf-guide/`)
- City clinic index (`/clinics/spain/barcelona/`)
- City cost page (`/costs/barcelona-ivf-cost-2026/`)
- City comparison page (`/compare/barcelona-vs-madrid-ivf/`)
- 3+ clinic profiles in this city
- `/faq/`

### Content Before Interview Data Exists
- Use published ESHRE/SEF data for country-level benchmarks
- Use publicly listed clinic pricing (disclosed as "publicly listed, not MedicalVera-verified")
- Use Trustpilot/Google review summaries (disclosed as "from public review platforms")
- Stats card shows "N clinics tracked" and "Data collection in progress"

---

## Template J — FAQ Hub Page

**URL:** `/faq/`
**Index:** Yes | **Priority:** 0.9 | **changefreq:** monthly

The single most important AEO page on the site. All FAQ sections use anchor IDs for direct linking.

### FAQ Categories (anchor-linked sections)

| Anchor | Topic | Question Count |
|---|---|---|
| `#ivf-basics` | IVF Abroad Basics | 12 |
| `#spain` | Spain-Specific | 8 |
| `#greece` | Greece-Specific | 8 |
| `#czech-republic` | Czech Republic-Specific | 6 |
| `#costs` | Cost & Hidden Fees | 10 |
| `#clinic-selection` | Choosing a Clinic | 8 |
| `#egg-donation-law` | Legal & Ethical (Egg Donation Law by Country) | 8 |
| `#travel` | Travel & Logistics | 8 |
| `#success-rates` | Success Rates & Lab Quality | 8 |
| `#medicalvera` | About MedicalVera Platform | 6 |

### AEO Rules for Every FAQ Answer
1. Answer starts with a direct 1-sentence response
2. Total answer: 60–120 words
3. Cites MedicalVera data where applicable ("Based on [N] interviews...")
4. Includes at least 1 internal link per answer
5. Complex answers include a data table or list

### Schema Fired
```
FAQPage (all question clusters, one FAQPage per category cluster OR combined)
BreadcrumbList
SpeakableSpecification (top 5 answers marked speakable)
```

---

## Template K — For Clinics / B2B Landing Page

**URL:** `/for-clinics/`
**Index:** Yes | **Priority:** 0.3 | **changefreq:** rarely

### Page Sections

| # | Section |
|---|---|
| 1 | Hero: "Stand Out in a Sea of Fake Reviews" |
| 2 | What MedicalVera Verified Means |
| 3 | The Problem: Why Fake Reviews Are Destroying Trust |
| 4 | How It Works (3 steps for clinics) |
| 5 | Products: Verified Badge, Lead Gen, VaaS, Truth Report Claim |
| 6 | Pricing overview → `/for-clinics/pricing/` |
| 7 | Social proof (clinic testimonials) |
| 8 | FAQ (clinic-focused, 6 questions) |
| 9 | CTA: "Claim Your Clinic Profile" |

### Schema Fired
```
Service (VaaS and Lead Gen as two Service entities)
FAQPage
Organization
BreadcrumbList
```
