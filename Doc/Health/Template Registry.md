# MedCover — Template Registry & SEO Specification

This document is the **single source of truth** for all `ContentTemplate` records in the traffic-engine-backend and the authoritative SEO blueprint for every page type on medcover.com.

> **How templates flow through the system:**
> `ContentTemplate` (this doc) → linked to `Subject` → resolved by `SeoBriefBuilder` → injected into `GenerationService` → composed by `PromptCompositionEngineService` → stored as `Page.finalContent` → served via `/api/v1/content` to Next.js frontend.

---

## Template Index

| # | Letter | Name | URL Pattern | `contentType` | `KeywordIntent` | Priority | ~Words |
|---|--------|------|-------------|---------------|-----------------|----------|--------|
| 1 | A | Country Destination Guide | `/guides/[country]-ivf-guide/` | `LANDING_PAGE` | `COMMERCIAL` | 0.9 | 1,500 |
| 2 | A2 | City Destination Guide | `/guides/[country]/[city]-ivf-guide/` | `CITY_PAGE` | `COMMERCIAL` | 0.85 | 1,500 |
| 3 | B | Clinic Profile Page | `/clinics/[country]/[city]/[clinic-slug]/` | `LANDING_PAGE` | `COMMERCIAL` | 0.7 | 1,500 |
| 4 | C | Country vs Country Comparison | `/compare/[country-a]-vs-[country-b]-ivf/` | `COMPARISON` | `COMMERCIAL` | 0.8 | 1,500 |
| 5 | D | Cost Transparency Page | `/costs/[country]-ivf-cost-[year]/` | `LANDING_PAGE` | `INFORMATIONAL` | 0.8 | 1,800 |
| 6 | E | Treatment Glossary / Entity | `/treatments/[treatment]/` | `ARTICLE` | `INFORMATIONAL` | 0.8 | 1,800 |
| 7 | F | Origin Patient Journey | `/from/[country]/ivf-abroad/` | `LANDING_PAGE` | `INFORMATIONAL` | 0.8 | 1,800 |
| 8 | G | Truth Report (Auto-Generated) | `/reports/[clinic-slug]-patient-truth-report/` | `ARTICLE` | `NAVIGATIONAL` | 0.6 | 800 |
| 9 | H | Patient Story | `/patient-stories/[slug]/` | `BLOG_POST` | `INFORMATIONAL` | 0.6 | 1,800 |
| 10 | J | FAQ Hub | `/faq/` | `FAQ` | `INFORMATIONAL` | 0.9 | 1,800 |
| 11 | K | For Clinics / B2B Landing | `/for-clinics/` | `LANDING_PAGE` | `COMMERCIAL` | 0.3 | 1,200 |

---

## Global SEO Rules (All Templates)

These rules apply to **every page** on the site regardless of template:

| Rule | Requirement |
|------|------------|
| **AEO Hero Answer** | First 60 words after H1 must directly answer the primary query. No preamble, no filler. Subject-verb-object sentences only. |
| **Title length** | 50–60 characters. Brand suffix `\| MedCover` always last. |
| **Meta description** | 130–155 characters. Include primary keyword, one data point, and a reason to click. |
| **YMYL compliance** | All cost, medical, and legal claims must cite a source. Treatment pages require a medical reviewer credit block. |
| **E-E-A-T attribution** | Every page must have visible author/data source. Patient quotes must include date and `via MedCover` tag. |
| **Patient quote format** | `"Patient interview, [Month Year], via MedCover"` — never omit this attribution. |
| **Schema minimum** | Every page fires at minimum `BreadcrumbList` + the page-type schema. No empty or stub schema objects. |
| **noindex gates** | Clinic Profile (Template B) and Truth Report (Template G): force `noindex` until 5 interviews collected. |
| **Canonical** | Every page has a self-referencing canonical. No page is without a canonical tag. |
| **Internal link density** | Minimum 1 contextual internal link per 200 words. No orphan pages. |
| **Image alt text** | Required on every image. Pattern: `"IVF [subject] in [city], [country] — MedCover"`. |
| **Image filename** | Kebab-case, descriptive: `instituto-marques-ivf-clinic-barcelona.webp`. |
| **OG image** | 1200×630px. Every page must define `og:image`. Default fallback: `/og/medcover-default.png`. |
| **Twitter card** | `summary_large_image` for all content pages. |
| **lastReviewed** | Schema `lastReviewed` must match the actual `Page.updatedAt` date — not `createdAt`. |
| **Hreflang** | Origin Journey pages use country-specific hreflang. All other pages: `en` only unless multilingual. |
| **robots.txt** | `/interview/`, `/interview/verify/`, `/start/`, `/api/` are `Disallow`. All content pages are `Allow`. |

---

## Template A — Country Destination Guide

**URL:** `/guides/[country]-ivf-guide/` | **Type:** `LANDING_PAGE` | **Intent:** `COMMERCIAL` | **Priority:** 0.9 | **~Words:** 1,500

### SEO Blueprint

| Field | Formula / Value |
|-------|----------------|
| **metaTitle** | `IVF in [Country] [Year] — Costs, Clinics & Patient Truth \| MedCover` |
| **metaDescription** | `Based on [N] verified patient interviews, IVF in [Country] costs €[X]–€[X]. See real clinic rankings, hidden costs, and patient quotes. MedCover-verified data.` |
| **Canonical** | `/guides/[country]-ivf-guide/` |
| **Robots** | `index, follow` |
| **Sitemap** | `priority: 0.9` · `changefreq: monthly` |
| **OG Title** | `IVF in [Country]: What [N] Real Patients Told Us` |
| **OG Description** | `Real costs, real success rates, real patient quotes. [N] verified interviews. No marketing spin.` |
| **OG Image** | `/og/guides/[country]-ivf-guide.png` (1200×630) |
| **Twitter Card** | `summary_large_image` |
| **Hreflang** | `en` |

### Heading Architecture

**H1:** `IVF in [Country]: What [N] Real Patients Told Us`
- Must include the exact patient interview count. Never a generic "IVF in Spain Guide".
- Country name must be title-case, not slug-case.
- Do not use "Best", "Top", "Ultimate" — these are trust-eroding superlatives.

**H2s — ordered list (follow this exact order):**

| # | H2 Text | Target Query / Purpose |
|---|---------|------------------------|
| 1 | `MedCover Truth Score for [Country]: What the Data Shows` | AEO: aggregated score data |
| 2 | `IVF Cost in [Country]: What Patients Actually Paid` | Featured snippet: cost table target |
| 3 | `What Patients Say About IVF in [Country]` | E-E-A-T: interview quote block |
| 4 | `Marketing vs Reality: What [Country] Clinics Don't Tell You` | Differentiator section |
| 5 | `Top IVF Clinics in [Country] by Truth Score` | Internal link hub |
| 6 | `Legal Rules for Egg Donation in [Country]` | Compliance + authority signal |
| 7 | `[Country] vs US/UK IVF: Cost & Success Rate Comparison` | Comparison intent |
| 8 | `Frequently Asked Questions About IVF in [Country]` | FAQPage schema target |

**H3 patterns:**
- Each clinic card heading: `[Clinic Name] — Truth Score [X]/100` (inside H2 #5)
- Each FAQ question: exact patient question phrasing, e.g. `How many IVF cycles do most patients need in [Country]?`
- Each dimension score in the stats block: dimension name as H3, e.g. `Cost Transparency`, `English Proficiency`

**Opening paragraph (first 60 words — AEO hero answer):**
> Template: `IVF in [Country] costs between €[low]–€[high] per cycle based on [N] patient interviews conducted by MedCover. The average wait time is [X] weeks. [N]% of patients reported hidden costs above their initial quote. MedCover tracks [N] clinics across [Country] with a national average Truth Score of [X]/100.`

### Schema Markup

```json
{
  "@type": "MedicalWebPage",
  "name": "IVF in [Country]: What [N] Real Patients Told Us",
  "description": "[metaDescription]",
  "url": "https://medcover.com/guides/[country]-ivf-guide/",
  "lastReviewed": "[ISO date of last Page.updatedAt]",
  "reviewedBy": { "@type": "Organization", "name": "MedCover" },
  "medicalAudience": { "@type": "MedicalAudience", "audienceType": "Patient" },
  "specialty": { "@type": "MedicalSpecialty", "name": "Fertility" }
}
```
```json
{
  "@type": "AggregateRating",
  "itemReviewed": { "@type": "Country", "name": "[Country]" },
  "ratingValue": "[avg Truth Score / 10]",
  "bestRating": "10",
  "ratingCount": "[total interview count for country]"
}
```
```json
{
  "@type": "FAQPage",
  "mainEntity": [{ "@type": "Question", "name": "...", "acceptedAnswer": { "@type": "Answer", "text": "..." } }]
}
```
```json
{ "@type": "BreadcrumbList", ... }
```
```json
{ "@type": "SpeakableSpecification", "cssSelector": ".speakable-summary" }
```

### AEO & Featured Snippet Rules

- **Primary snippet target:** Key Statistics Table (H2 #2). Format as a clean `<table>` with `<th>` headers: `| Metric | Value | Source |`. No merged cells.
- **Secondary snippet target:** Opening paragraph (H1 hero answer). 60-word limit, no lists.
- **AI Overview signal:** Add a `SpeakableSpecification` on the 2–3 sentence page summary at the bottom.
- **People Also Ask:** FAQ Accordion (H2 #8). Each Q&A must start with a direct answer sentence within the first 10 words.

### Content Template Payload

```json
{
  "name": "Country Destination Guide",
  "description": "Hub page for an IVF destination country. Aggregates Truth Scores, patient data, clinic links, and cost summaries at the country level.",
  "contentType": "LANDING_PAGE",
  "requiredSections": {
    "sections": [
      "Breadcrumb",
      "H1 + Hero Answer Block (60 words, direct cost answer)",
      "MedCover Truth Score Summary Card",
      "Key Statistics Table (5 rows: cost / success rate / wait time / English score / hidden cost frequency)",
      "AI Interview Insights Block (3–5 anonymized patient quotes)",
      "Marketing vs Patient Reality Table (4–6 rows)",
      "Top Clinics in Country — linked cards sorted by Truth Score",
      "Full Cost Breakdown Section (links to cost page)",
      "Legal & Ethical Context (egg donation law, regulation body, official law link)",
      "Comparison Block (Country vs US/UK)",
      "FAQ Accordion (10–14 questions)",
      "Speakable Summary (2–3 sentences, marked with SpeakableSpecification)",
      "Related Pages (card row)",
      "CTA Block"
    ]
  },
  "headingStructure": {
    "H1": "IVF in [Country]: What [N] Real Patients Told Us",
    "H1_rules": [
      "Include exact interview count",
      "Country name title-case",
      "No superlatives (Best, Top, Ultimate)"
    ],
    "H2s": [
      "MedCover Truth Score for [Country]: What the Data Shows",
      "IVF Cost in [Country]: What Patients Actually Paid",
      "What Patients Say About IVF in [Country]",
      "Marketing vs Reality: What [Country] Clinics Don't Tell You",
      "Top IVF Clinics in [Country] by Truth Score",
      "Legal Rules for Egg Donation in [Country]",
      "[Country] vs US/UK IVF: Cost & Success Rate Comparison",
      "Frequently Asked Questions About IVF in [Country]"
    ],
    "H3_clinic_card": "[Clinic Name] — Truth Score [X]/100",
    "H3_faq": "Exact patient question phrasing",
    "intro_rule": "60 words max. State cost range, interview count, hidden cost rate, clinic count, and national Truth Score. No preamble."
  },
  "seoRules": [
    "metaTitle: 'IVF in [Country] [Year] — Costs, Clinics & Patient Truth | MedCover' (max 60 chars)",
    "metaDescription: 130–155 chars. Include cost range, interview count, 'MedCover-verified'",
    "canonical: /guides/[country]-ivf-guide/",
    "robots: index, follow",
    "sitemap: priority 0.9, changefreq monthly",
    "OG image: /og/guides/[country]-ivf-guide.png at 1200×630px",
    "Twitter card: summary_large_image",
    "Schema: MedicalWebPage + AggregateRating + FAQPage + BreadcrumbList + SpeakableSpecification",
    "AggregateRating.ratingCount = total published interview count for this country",
    "AggregateRating.ratingValue = avg Truth Score across all country clinics / 10",
    "lastReviewed in schema must match Page.updatedAt date",
    "All patient quotes: 'Patient interview, [Month Year], via MedCover'",
    "Key Statistics Table: clean HTML table, no merged cells — primary featured snippet target",
    "Hero Answer Block: 60-word limit, direct subject-verb-object sentences, no nested lists",
    "SpeakableSpecification: target the 2–3 sentence Speakable Summary at page bottom",
    "Legal section: include rel='external' link to official government/regulation body"
  ],
  "faqStructure": {
    "count": "10–14 questions",
    "source": "Patient interview PAA questions + SERP People Also Ask",
    "answer_format": "First sentence = direct answer. Total 60–120 words. At least 1 internal link per answer. Cite 'Based on [N] interviews' when using MedCover data.",
    "required_topics": [
      "What is the average IVF cost in [Country]?",
      "Is egg donation legal in [Country]?",
      "How do I choose a clinic in [Country]?",
      "How many trips to [Country] does IVF require?",
      "What is the success rate for IVF in [Country]?",
      "What hidden costs should I budget for in [Country]?",
      "Does MedCover verify IVF clinics in [Country]?",
      "What languages do IVF clinics in [Country] speak?",
      "How long is the wait time at [Country] IVF clinics?",
      "Is IVF in [Country] cheaper than in the US/UK?"
    ]
  },
  "internalLinkingRules": {
    "required": [
      "/costs/[country]-ivf-cost-[year]/",
      "/compare/[country]-vs-usa-ivf/",
      "/clinics/[country]/[city]/[slug]/ — top 5 by Truth Score",
      "/treatments/ivf/",
      "/treatments/egg-donation/ (if relevant to country)",
      "/faq/"
    ],
    "anchor_text_rule": "Descriptive anchors only. 'IVF cost in Spain 2026' not 'click here' or 'learn more'.",
    "link_density": "Minimum 1 internal link per 200 words"
  },
  "ctaPlacement": "Bottom of page, after FAQ. Text: 'Get Your Personalized [Country] IVF Report'. Button links to /start/",
  "formattingInstructions": "Hero Answer Block: first content block after H1, no images between H1 and this block. Key Statistics Table: 5 rows (Avg Cost / Avg Success Rate by Age / Avg Wait Time / Staff English Score / Hidden Cost Frequency), 3 columns (Metric / Value / Source). Marketing vs Reality Table: 2 columns, 4–6 rows. Clinic cards: Truth Score badge (0–100) + grade letter + interview count + city. All costs in € with range notation (e.g. €5,500–€8,500). FAQ: accordion component, each Q is H3.",
  "isActive": true
}
```

### Clinic Inventory Data Integration

| Section | Source (clinic-inventory) | Fields |
|---------|--------------------------|--------|
| Truth Score Summary Card | `ClinicTruthScore` aggregate per country | avg `scoreValue`, avg `gradeLabel` |
| Key Statistics Table | `ClinicPricingPackage` + `PatientInterview` answers | `priceMin/Max`, dimension answer texts |
| Patient Quotes | `PatientInterview` + `InterviewAnswer` | Filter by country + `isPublished=true` |
| Top Clinics Cards | `Clinic` + `ClinicTruthScore` | `ORDER BY scoreValue DESC LIMIT 5` |
| Interview count (AggregateRating) | `PatientInterview` count | `WHERE clinic.city.country = [country] AND status = PUBLISHED` |

---

## Template A2 — City Destination Guide

**URL:** `/guides/[country]/[city]-ivf-guide/` | **Type:** `CITY_PAGE` | **Intent:** `COMMERCIAL` | **Priority:** 0.85 | **~Words:** 1,500

### SEO Blueprint

| Field | Formula / Value |
|-------|----------------|
| **metaTitle** | `IVF in [City] [Year] — [N] Clinics, Real Costs & Verified Data \| MedCover` |
| **metaDescription** | `[N] IVF clinics in [City] tracked by MedCover. Average cost €[X]–€[X]. Real patient data, hidden costs revealed, clinics ranked by Truth Score.` |
| **Canonical** | `/guides/[country]/[city]-ivf-guide/` |
| **Robots** | `index, follow` |
| **Sitemap** | `priority: 0.85` (top cities) or `0.7` (secondary) · `changefreq: monthly` |
| **OG Title** | `IVF in [City]: [N] Clinics Ranked by Verified Patient Data` |
| **OG Description** | `Real costs, hidden fees, and clinic rankings for IVF in [City] — sourced from patient interviews, not marketing.` |
| **OG Image** | `/og/guides/[country]/[city]-ivf-guide.png` (1200×630) |
| **Twitter Card** | `summary_large_image` |
| **Hreflang** | `en` |

### Heading Architecture

**H1:** `IVF in [City]: [N] Clinics, Real Costs & Patient Insights`
- Must include exact tracked clinic count pulled from clinic-inventory.
- City name must be correctly capitalized (Barcelona, not barcelona).
- Do not start with "The Best" or "Top".

**H2s — ordered list:**

| # | H2 Text | Target Query / Purpose |
|---|---------|------------------------|
| 1 | `IVF Clinics in [City] — Ranked by Truth Score` | Clinic index, hub for /clinics/ links |
| 2 | `Real IVF Cost in [City] ([Year])` | Featured snippet: city cost table |
| 3 | `Why Patients Choose [City] for IVF` | City differentiator, conversion section |
| 4 | `Getting to [City]: Travel & Logistics for IVF Patients` | Practical intent |
| 5 | `[City] vs [Other City]: Which Is Better for IVF?` | Comparison intent, compare page link |
| 6 | `Frequently Asked Questions About IVF in [City]` | FAQPage schema target |

**H3 patterns:**
- Each clinic card: `[Clinic Name] — [City] · Truth Score [X]/100`
- Each FAQ question: exact question phrasing as patient would type it
- Within Why [City]: sub-reasons as H3 (e.g. `Clinic Concentration`, `English Proficiency`, `Airport Access`)
- Within Travel section: logistics items as H3 (`Getting There`, `Where to Stay`, `How Many Trips You'll Need`)

**Opening paragraph (first 60 words — AEO hero answer):**
> Template: `IVF in [City] costs between €[low]–€[high] per cycle based on publicly listed prices from [N] tracked clinics. [City] is home to [N] MedCover-tracked fertility clinics. The city ranks [X] for English proficiency among [Country] IVF destinations. Average wait time for a first appointment is [X]–[X] weeks.`

### Schema Markup

```json
{
  "@type": "MedicalWebPage",
  "name": "IVF in [City]: [N] Clinics, Real Costs & Patient Insights",
  "url": "https://medcover.com/guides/[country]/[city]-ivf-guide/",
  "lastReviewed": "[Page.updatedAt ISO date]",
  "reviewedBy": { "@type": "Organization", "name": "MedCover" },
  "specialty": { "@type": "MedicalSpecialty", "name": "Fertility" },
  "about": { "@type": "City", "name": "[City]" }
}
```
```json
{ "@type": "FAQPage", "mainEntity": [...] }
```
```json
{ "@type": "BreadcrumbList", "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "/" },
    { "@type": "ListItem", "position": 2, "name": "Destinations", "item": "/guides/" },
    { "@type": "ListItem", "position": 3, "name": "[Country] IVF Guide", "item": "/guides/[country]-ivf-guide/" },
    { "@type": "ListItem", "position": 4, "name": "[City] IVF Guide", "item": "/guides/[country]/[city]-ivf-guide/" }
  ]
}
```
```json
{ "@type": "SpeakableSpecification", "cssSelector": ".city-quick-stats" }
```

### AEO & Featured Snippet Rules

- **Primary snippet target:** City Quick Stats Card (4 data points). Mark with `SpeakableSpecification` on `.city-quick-stats`. Format as a 2-column table.
- **Secondary target:** Opening paragraph hero answer.
- **Pre-interview disclosure:** When using publicly listed prices (not yet interview-verified), include visible label: `"Publicly listed price — not MedCover-verified"`.
- **PAA targets:** FAQ accordion questions using city-specific phrasing.

### Content Template Payload

```json
{
  "name": "City Destination Guide",
  "description": "Spoke page off the country hub. Captures city-level IVF search intent and aggregates clinics at city level.",
  "contentType": "CITY_PAGE",
  "requiredSections": {
    "sections": [
      "Breadcrumb (4-level: Home > Destinations > [Country] IVF Guide > [City] IVF Guide)",
      "H1 + Hero Answer Block (60 words, include clinic count and cost range)",
      "City Quick Stats Card (4 data points: avg cost, clinic count, avg wait time, English score)",
      "Why [City]? — Differentiator Section (clinic concentration, English level, airport access)",
      "All Clinics in [City] — linked cards sorted by Truth Score",
      "Cost Breakdown (city-specific ranges, link to city cost page)",
      "Travel & Logistics Guide (airport, accommodation, trips required)",
      "[City] vs [Other City] Mini-Comparison Table",
      "FAQ Accordion (8–10 questions)",
      "Related Pages (parent country guide, city clinic index, compare page)",
      "CTA Block"
    ]
  },
  "headingStructure": {
    "H1": "IVF in [City]: [N] Clinics, Real Costs & Patient Insights",
    "H1_rules": [
      "Use exact clinic count from clinic-inventory",
      "Correctly capitalise city name",
      "Do not use 'Best' or 'Top' superlatives"
    ],
    "H2s": [
      "IVF Clinics in [City] — Ranked by Truth Score",
      "Real IVF Cost in [City] ([Year])",
      "Why Patients Choose [City] for IVF",
      "Getting to [City]: Travel & Logistics for IVF Patients",
      "[City] vs [Other City]: Which Is Better for IVF?",
      "Frequently Asked Questions About IVF in [City]"
    ],
    "H3_clinic_card": "[Clinic Name] — [City] · Truth Score [X]/100",
    "H3_why_city": "Clinic Concentration | English Proficiency | Airport Access | International Patient Experience",
    "H3_travel": "Getting There | Where to Stay | How Many Trips You'll Need",
    "H3_faq": "Exact patient question phrasing",
    "intro_rule": "60 words max. State cost range (with disclosure if publicly listed), clinic count, English score, wait time. No preamble."
  },
  "seoRules": [
    "metaTitle: 'IVF in [City] [Year] — [N] Clinics, Real Costs & Verified Data | MedCover' (max 60 chars)",
    "metaDescription: 130–155 chars. Mention city, clinic count, avg cost, 'MedCover-tracked'",
    "canonical: /guides/[country]/[city]-ivf-guide/",
    "Breadcrumb parent: /guides/[country]-ivf-guide/ must be in breadcrumb trail",
    "robots: index, follow",
    "sitemap: priority 0.85 top-tier cities (Barcelona, Madrid, Athens, Prague), 0.7 secondary cities",
    "OG image: /og/guides/[country]/[city]-ivf-guide.png at 1200×630px",
    "Schema: MedicalWebPage + FAQPage + BreadcrumbList + SpeakableSpecification",
    "SpeakableSpecification targets .city-quick-stats (City Quick Stats Card)",
    "City Quick Stats Card: primary featured snippet target — format as clean table, 4 rows max",
    "Pre-interview pricing: label 'Publicly listed price — not MedCover-verified'",
    "Clinic count in H1 must match live clinic-inventory count — must be dynamic"
  ],
  "faqStructure": {
    "count": "8–10 questions",
    "source": "City-specific PAA from SERP + patient interview PAA",
    "answer_format": "First sentence = direct answer. 60–120 words. At least 1 internal link per answer.",
    "required_topics": [
      "How many IVF clinics are in [City]?",
      "Is [City] more expensive than [Other City] for IVF?",
      "What is the success rate for IVF in [City]?",
      "How many trips to [City] does IVF require?",
      "Which is the best IVF clinic in [City]?",
      "Can I get egg donation IVF in [City]?",
      "Is English widely spoken at IVF clinics in [City]?",
      "What is the best area to stay in [City] during IVF treatment?"
    ]
  },
  "internalLinkingRules": {
    "required": [
      "/guides/[country]-ivf-guide/ (parent — must appear in breadcrumb AND body text)",
      "/clinics/[country]/[city]/ (city clinic index)",
      "/costs/[city]-ivf-cost-[year]/",
      "/compare/[city-a]-vs-[city-b]-ivf/",
      "3+ individual clinic profile pages /clinics/[country]/[city]/[slug]/",
      "/faq/"
    ],
    "anchor_text_rule": "Descriptive only. 'IVF clinics in Barcelona' not 'here' or 'this page'."
  },
  "ctaPlacement": "Two CTAs: (1) After clinics section — 'View All [City] Clinics' → /clinics/[country]/[city]/. (2) Bottom — 'Share Your [City] IVF Experience' → /start/",
  "formattingInstructions": "City Quick Stats Card: 2-column table (Metric / Value), 4 rows: Avg Cost / Tracked Clinics / Avg Wait Time / English Score. Clinic cards: sorted by Truth Score, show badge + interview count + city. Travel section: H3 sub-headings, include airport IATA code, avg flight time from US/UK, neighbourhood recommendation. Mini-comparison table: 5 rows, 2 columns, linked to full compare page.",
  "isActive": true
}
```

### Pre-Launch Content Fallback

| Data Point | Fallback Source | Disclosure Label Required |
|------------|----------------|--------------------------|
| Avg cost | Publicly listed clinic pricing | `"Publicly listed price — not MedCover-verified"` |
| Success rate | ESHRE country-level data | `"Source: ESHRE [Year]"` |
| Clinic count | clinic-inventory live count | Exact — always dynamic |
| Wait time | Industry reports | `"Estimated from industry sources"` |
| Patient quotes | N/A | Show `"Data collection in progress"` |

---

## Template B — Clinic Profile Page

**URL:** `/clinics/[country]/[city]/[clinic-slug]/` | **Type:** `LANDING_PAGE` | **Intent:** `COMMERCIAL` | **Priority:** 0.7 | **~Words:** 1,500

### SEO Blueprint

| Field | Formula / Value |
|-------|----------------|
| **metaTitle** | `[Clinic Name] Review [Year] — MedCover Truth Score & Patient Data` |
| **metaDescription** | `[Clinic Name] scores [X]/100 on MedCover's Truth Score from [N] patient interviews. Hidden costs flagged by [X]% of patients. Real costs, real outcomes.` |
| **Canonical** | `/clinics/[country]/[city]/[clinic-slug]/` |
| **Robots** | `index, follow` when `interviewCount >= 5` · `noindex, follow` when `< 5` |
| **Sitemap** | `priority: 0.7` · `changefreq: weekly` · Exclude from sitemap if `noindex` |
| **OG Title** | `[Clinic Name] — Truth Score [X]/100 · [N] Verified Patient Interviews` |
| **OG Description** | `[N] patients reported on costs, outcomes, hidden fees, and English quality at [Clinic Name]. MedCover-verified data.` |
| **OG Image** | `/og/clinics/[clinic-slug].png` (1200×630) |
| **Twitter Card** | `summary_large_image` |
| **Hreflang** | `en` |

### Heading Architecture

**H1:** `[Clinic Name] — MedCover Truth Report`
- Use exact clinic name as stored in `Clinic.name` (clinic-inventory). No abbreviations on first use.
- Always append `— MedCover Truth Report`. This is the page's entity signal.
- Never include the city or country in H1 — they appear in the breadcrumb and the Fast Facts Table.

**H2s — ordered list:**

| # | H2 Text | Target Query / Purpose |
|---|---------|------------------------|
| 1 | `MedCover Truth Score: [X]/100 ([Grade])` | Entity/brand query target, AggregateRating anchor |
| 2 | `What Patients Actually Paid at [Clinic Name]` | Cost transparency, conversion signal |
| 3 | `Hidden Costs at [Clinic Name] — Patient-Reported` | High-value AEO target, differentiator |
| 4 | `Staff Quality & English Proficiency at [Clinic Name]` | Decision factor for international patients |
| 5 | `[Clinic Name] vs [Competitor 1] vs [Competitor 2]` | Comparison intent, links to compare pages |
| 6 | `Frequently Asked Questions About [Clinic Name]` | FAQPage schema, clinic-specific PAA |

**H3 patterns:**
- Each of the 10 Truth Score dimensions (inside H2 #1 section): `Cost Transparency`, `English Proficiency`, `Outcome Communication`, `Hidden Fees`, `Staff Quality`, `Lab Transparency`, `Logistics Support`, `Wait Time`, `Emotional Support`, `Value for Money`
- Each FAQ question: clinic-specific question phrasing, e.g. `Is [Clinic Name] worth it for egg donation?`
- Each patient quote callout: `Patient Experience — [Dimension] · [Month Year]`

**Opening paragraph (first 60 words — AEO hero answer):**
> Template: `[Clinic Name] is an IVF clinic in [City], [Country], tracked by MedCover with a Truth Score of [X]/100 ([Grade]) based on [N] verified patient interviews. [N]% of patients flagged hidden costs. The clinic's strongest dimension is [top dimension]. English proficiency is rated [score]/100 by patients.`

### Schema Markup

```json
{
  "@type": "MedicalClinic",
  "name": "[Clinic Name]",
  "url": "[clinic website URL]",
  "telephone": "[phone number]",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[address]",
    "addressLocality": "[City]",
    "addressCountry": "[Country ISO code]"
  },
  "hasMap": "[Google Maps URL]",
  "medicalSpecialty": { "@type": "MedicalSpecialty", "name": "Fertility" },
  "openingHoursSpecification": [{ "@type": "OpeningHoursSpecification", "dayOfWeek": [...], "opens": "08:00", "closes": "18:00" }]
}
```
```json
{
  "@type": "AggregateRating",
  "itemReviewed": { "@type": "MedicalClinic", "name": "[Clinic Name]" },
  "ratingValue": "[Truth Score / 10, e.g. 8.4]",
  "bestRating": "10",
  "worstRating": "0",
  "ratingCount": "[interviewCount]"
}
```
```json
{
  "@type": "Review",
  "itemReviewed": { "@type": "MedicalClinic", "name": "[Clinic Name]" },
  "author": { "@type": "Person", "name": "Anonymous Patient" },
  "datePublished": "[YYYY-MM]",
  "reviewBody": "[anonymized patient quote]",
  "reviewRating": { "@type": "Rating", "ratingValue": "[patient score]", "bestRating": "10" }
}
```
(Include 3 Review entities minimum)
```json
{ "@type": "FAQPage", "mainEntity": [...] }
```
```json
{ "@type": "BreadcrumbList", "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "/" },
    { "@type": "ListItem", "position": 2, "name": "Clinics", "item": "/clinics/" },
    { "@type": "ListItem", "position": 3, "name": "[Country]", "item": "/clinics/[country]/" },
    { "@type": "ListItem", "position": 4, "name": "[City]", "item": "/clinics/[country]/[city]/" },
    { "@type": "ListItem", "position": 5, "name": "[Clinic Name]", "item": "/clinics/[country]/[city]/[slug]/" }
  ]
}
```

### AEO & Featured Snippet Rules

- **Primary snippet target:** Procedure Pricing Table (H2 #2). Format as a 3-column table: `Procedure | Clinic-Quoted Range | MedCover-Verified Range`.
- **Secondary target:** Opening paragraph hero answer for clinic entity queries (`[clinic name] ivf`).
- **noindex gate:** This page is `noindex` until `interviewCount >= 5`. Never expose to Google with fewer than 5 interviews.
- **Entity signal:** H1 + `MedicalClinic` schema together establish the clinic as a named entity.

### Content Template Payload

```json
{
  "name": "Clinic Profile Page",
  "description": "Individual clinic verification page. Driven by clinic-inventory data and patient interviews across 10 Truth Score dimensions.",
  "contentType": "LANDING_PAGE",
  "requiredSections": {
    "sections": [
      "Breadcrumb (5-level: Home > Clinics > [Country] > [City] > [Clinic Name])",
      "H1 + Hero Answer Block (60 words, state Truth Score, interview count, strongest/weakest dimension)",
      "MedCover Truth Score Badge (score 0–100, grade letter, interview count, last updated date)",
      "Clinic Fast Facts Table (country, city, accreditations, languages, founding year, treatments)",
      "Verified Stats Block — 10 dimensions as scored bars with interview data beneath each",
      "Truth vs Marketing Block (clinic's own marketing claims vs patient-reported reality)",
      "Patient Interview Excerpts (3–5 anonymized, verbatim, tagged by dimension)",
      "Hidden Costs Revealed — bulleted list with patient-reported frequency",
      "Procedure Pricing Table (IVF / Egg Donation / PGT-A — clinic-quoted vs MedCover-verified)",
      "Staff & Lab Quality (English score, lab equipment age, embryologist experience)",
      "Compare with Similar Clinics (2 competitors, same city, linked cards)",
      "FAQ (6–10 clinic-specific questions)",
      "Clinic Official Response Slot (optional — only if clinic has claimed profile)",
      "Methodology Note (interview count, date range, link to /ai-interviewer/)",
      "CTA: Request Verified Lead"
    ]
  },
  "headingStructure": {
    "H1": "[Clinic Name] — MedCover Truth Report",
    "H1_rules": [
      "Use Clinic.name exactly as registered in clinic-inventory",
      "Always append '— MedCover Truth Report'",
      "Do not include city or country in H1",
      "Do not abbreviate clinic name on first occurrence"
    ],
    "H2s": [
      "MedCover Truth Score: [X]/100 ([Grade])",
      "What Patients Actually Paid at [Clinic Name]",
      "Hidden Costs at [Clinic Name] — Patient-Reported",
      "Staff Quality & English Proficiency at [Clinic Name]",
      "[Clinic Name] vs [Competitor 1] vs [Competitor 2]",
      "Frequently Asked Questions About [Clinic Name]"
    ],
    "H3_dimension": "Each of 10 Truth Score dimensions: Cost Transparency | English Proficiency | Outcome Communication | Hidden Fees | Staff Quality | Lab Transparency | Logistics Support | Wait Time | Emotional Support | Value for Money",
    "H3_faq": "Clinic-specific question as a patient would type it",
    "H3_quote": "Patient Experience — [Dimension] · [Month Year]",
    "intro_rule": "60 words max. State clinic name, city, country, Truth Score, grade, interview count, hidden cost rate, top/bottom dimension. No preamble."
  },
  "seoRules": [
    "metaTitle: '[Clinic Name] Review [Year] — MedCover Truth Score & Patient Data' (max 60 chars)",
    "metaDescription: 130–155 chars. Include Truth Score value, interview count, one key finding",
    "canonical: /clinics/[country]/[city]/[clinic-slug]/",
    "robots: index, follow — ONLY when interviewCount >= 5. Otherwise: noindex, follow",
    "sitemap: priority 0.7, changefreq weekly. EXCLUDE from sitemap when noindex",
    "OG image: /og/clinics/[clinic-slug].png at 1200×630px",
    "Schema: MedicalClinic + AggregateRating + Review x3 minimum + FAQPage + BreadcrumbList",
    "MedicalClinic: name, address, telephone, url, medicalSpecialty: Fertility, openingHoursSpecification, hasMap",
    "AggregateRating.ratingValue = Truth Score / 10 (scale to 10), bestRating: 10, ratingCount = interviewCount",
    "3 Review entities minimum: anonymized, author.name = 'Anonymous Patient', datePublished = interview month/year",
    "noindex gate: interviewCount < 5 → noindex + exclude from sitemap",
    "Procedure Pricing Table: clean 3-column HTML table, no merged cells — featured snippet target",
    "Entity clarity: H1 must be the clinic's full registered name — no abbreviations on first occurrence"
  ],
  "faqStructure": {
    "count": "6–10 questions",
    "source": "Clinic-specific SERP PAA + interview-derived questions",
    "answer_format": "First sentence = direct answer. 60–120 words. Include 1 internal link per answer.",
    "required_topics": [
      "Is [Clinic Name] worth it?",
      "What are [Clinic Name]'s real success rates?",
      "What are the hidden costs at [Clinic Name]?",
      "Does [Clinic Name] speak English?",
      "How long is the wait time at [Clinic Name]?",
      "Has [Clinic Name] been verified by MedCover?"
    ]
  },
  "internalLinkingRules": {
    "required": [
      "/guides/[country]-ivf-guide/ (parent country guide)",
      "/guides/[country]/[city]-ivf-guide/ (parent city guide)",
      "/reports/[clinic-slug]-patient-truth-report/",
      "2 competitor clinic profiles — same city, Truth Score within ±15 of this clinic",
      "/truth-score/ (methodology explanation)",
      "/for-clinics/"
    ],
    "competitor_rule": "Competitors must be in same city. Rank by closest Truth Score to this clinic."
  },
  "ctaPlacement": "Two CTAs: (1) After Truth Score Badge — 'Read Full Truth Report' → /reports/[clinic-slug]-patient-truth-report/. (2) Bottom — 'Connect with [Clinic Name]' → lead gen form.",
  "formattingInstructions": "Truth Score Badge: score (0–100), grade letter (A=85-100, B=70-84, C=55-69, D=40-54, F<40), interview count, last updated date. 10-dimension Verified Stats: CSS progress bars, label above, interview-sourced data sentence below each bar. Procedure Pricing Table: 3 columns (Procedure / Clinic Quoted Range / MedCover-Verified Range). Hidden Costs: bulleted list with patient-reported frequency ('flagged by X of Y patients'). Patient quotes: pull-quote styling, dimension tag, date tag.",
  "isActive": true
}
```

### Clinic Inventory Data Integration

| Section | clinic-inventory Model | Fields Used |
|---------|----------------------|-------------|
| H1 / Clinic Identity | `Clinic` | `name`, `slug`, `status` |
| Truth Score Badge | `ClinicTruthScore` | `scoreValue`, `gradeLabel`, `interviewCount`, `lastCalculatedAt` |
| Fast Facts Table | `Clinic` + `ClinicAccreditation` | `country`, `city`, `accreditations[]`, `languagesSpoken`, `foundedYear` |
| 10 Dimensions | `ClinicTruthScore.dimensionScores` | JSON per `TruthScoreDimension` |
| Patient Excerpts | `PatientInterview` + `InterviewAnswer` | `answerText` where `isPublished=true`, tagged by dimension |
| Hidden Costs | `InterviewAnswer` | Hidden-cost dimension answers, frequency count |
| Pricing Table | `ClinicPricingPackage` | `treatmentType`, `priceMin`, `priceMax`, `currency` |
| Staff & Lab | `ClinicDoctor` + dimension answers | English proficiency score, lab answers |
| Competitor Comparison | `Clinic` (city filter) | Same city, nearest Truth Score |
| Clinic Response | `Clinic.officialResponse` | Free text, requires `verified` account flag |

---

## Template C — Comparison Page (Country vs Country)

**URL:** `/compare/[country-a]-vs-[country-b]-ivf/` | **Type:** `COMPARISON` | **Intent:** `COMMERCIAL` | **Priority:** 0.8 | **~Words:** 1,500

### SEO Blueprint

| Field | Formula / Value |
|-------|----------------|
| **metaTitle** | `[Country A] vs [Country B] IVF [Year] — Cost, Success Rate & Patient Truth \| MedCover` |
| **metaDescription** | `[Country A] IVF costs €[X]–€[X] vs [Country B] at €[X]–€[X]. MedCover compares real patient data on costs, success rates, English quality, and legal rules.` |
| **Canonical** | `/compare/[country-a]-vs-[country-b]-ivf/` (alphabetical — higher-traffic country first) |
| **Redirect rule** | `/compare/[country-b]-vs-[country-a]-ivf/` → 301 → canonical |
| **Robots** | `index, follow` |
| **Sitemap** | `priority: 0.8` · `changefreq: monthly` |
| **OG Title** | `[Country A] vs [Country B] for IVF: The Verified Verdict` |
| **OG Description** | `Side-by-side comparison of IVF costs, success rates, legal rules, and patient experiences in [Country A] and [Country B].` |
| **OG Image** | `/og/compare/[country-a]-vs-[country-b]-ivf.png` (1200×630) |
| **Twitter Card** | `summary_large_image` |
| **Hreflang** | `en` |

### Heading Architecture

**H1:** `[Country A] vs [Country B] for IVF: Which Should You Choose?`
- Phrased as a direct question. Country A = higher-traffic country by search volume.
- Never use "Better" in the H1 (subjective; Google may deprioritize).

**H2s — ordered list:**

| # | H2 Text | Target Query / Purpose |
|---|---------|------------------------|
| 1 | `Quick Verdict: [Country A] vs [Country B]` | AEO hero + SpeakableSpecification target |
| 2 | `Full Comparison: [Country A] vs [Country B] IVF` | Featured snippet — 10-row comparison table |
| 3 | `IVF Cost: [Country A] vs [Country B]` | Cost comparison, links to both cost pages |
| 4 | `Success Rates: [Country A] vs [Country B]` | Data comparison, ESHRE citations |
| 5 | `Egg Donation Law: [Country A] vs [Country B]` | Legal authority signal |
| 6 | `What Patients from Each Country Say` | E-E-A-T + patient quote section |
| 7 | `Which Country Is Right for You?` | Decision guide, conversion section |
| 8 | `Frequently Asked Questions` | FAQPage schema target |

**H3 patterns:**
- Within Full Comparison Table (H2 #2): no H3 — data lives in the table itself.
- Within Which Country Is Right for You (H2 #7): decision condition H3s, e.g. `If Budget Is Your Priority`, `If English Proficiency Matters Most`, `If You Need Egg Donation`.
- Each FAQ question: exact question phrasing, e.g. `Is IVF cheaper in Spain or Greece?`

**Opening paragraph (first 60 words — AEO hero answer):**
> Template (placed after H2 #1 "Quick Verdict"): `[Country A] IVF costs €[X]–€[X] per cycle vs €[X]–€[X] in [Country B] based on MedCover patient interview data. [Country A] scores higher on English proficiency ([X]/100 vs [X]/100). [Country B] has [comparison point]. For patients prioritising cost, [verdict country]. For patients prioritising [factor], [other country].`

### Schema Markup

```json
{
  "@type": "Article",
  "headline": "[Country A] vs [Country B] for IVF: Which Should You Choose?",
  "author": { "@type": "Organization", "name": "MedCover" },
  "datePublished": "[ISO date]",
  "dateModified": "[Page.updatedAt ISO date]",
  "about": [
    { "@type": "Country", "name": "[Country A]" },
    { "@type": "Country", "name": "[Country B]" }
  ]
}
```
```json
{ "@type": "FAQPage", "mainEntity": [...] }
```
```json
{ "@type": "BreadcrumbList", "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "/" },
    { "@type": "ListItem", "position": 2, "name": "Compare", "item": "/compare/" },
    { "@type": "ListItem", "position": 3, "name": "[Country A] vs [Country B] IVF", "item": "/compare/[country-a]-vs-[country-b]-ivf/" }
  ]
}
```
```json
{ "@type": "SpeakableSpecification", "cssSelector": ".quick-verdict-card" }
```

### AEO & Featured Snippet Rules

- **Primary snippet target:** Full Comparison Table (H2 #2). 10+ rows, 3 columns (`Metric | [Country A] | [Country B]`), winner badge per row. Clean HTML table, no merged cells.
- **Speakable target:** Quick Verdict Card (H2 #1). Max 3 sentences, directly state which country wins on which dimension.
- **Canonical order enforcement:** Higher search-volume country always appears first. Reverse URL always 301s.
- **Every data row in comparison table:** must include a citation (`N MedCover interviews` or `Source: ESHRE [Year]`).

### Content Template Payload

```json
{
  "name": "Country vs Country Comparison",
  "description": "Direct comparison of two IVF destination countries. High-intent comparison queries. Data sourced from MedCover patient interviews.",
  "contentType": "COMPARISON",
  "requiredSections": {
    "sections": [
      "Breadcrumb (3-level: Home > Compare > [Country A] vs [Country B] IVF)",
      "H1 + Quick Verdict Card (H2 #1) — 3-sentence direct verdict, SpeakableSpecification target",
      "Full Comparison Table (10+ rows, winner badge per row, cited data)",
      "Cost Breakdown — both countries side-by-side with all-in totals",
      "Success Rate Comparison — age-stratified, ESHRE/SART cited",
      "Patient Quotes from Each Country — 2 quotes per country, tagged by interview source",
      "Egg Donation Law Differences — anonymity rules, regulation bodies, law links",
      "Which Country Is Right for You? — decision guide by priority",
      "FAQ (8–12 questions, both countries addressed)",
      "Related Comparisons — 3 linked comparison pages",
      "CTA"
    ]
  },
  "headingStructure": {
    "H1": "[Country A] vs [Country B] for IVF: Which Should You Choose?",
    "H1_rules": [
      "Country A = higher search-volume country",
      "Phrased as a direct question",
      "No 'Better' in H1"
    ],
    "H2s": [
      "Quick Verdict: [Country A] vs [Country B]",
      "Full Comparison: [Country A] vs [Country B] IVF",
      "IVF Cost: [Country A] vs [Country B]",
      "Success Rates: [Country A] vs [Country B]",
      "Egg Donation Law: [Country A] vs [Country B]",
      "What Patients from Each Country Say",
      "Which Country Is Right for You?",
      "Frequently Asked Questions"
    ],
    "H3_decision": "If Budget Is Your Priority | If English Proficiency Matters Most | If You Need Egg Donation | If You Have a Specific Age Profile",
    "H3_faq": "Exact cross-country question phrasing",
    "intro_rule": "Placed after 'Quick Verdict' H2. 60 words max. State cost comparison, English score comparison, and direct verdict. Never defer the verdict."
  },
  "seoRules": [
    "metaTitle: '[Country A] vs [Country B] IVF [Year] — Cost, Success Rate & Patient Truth | MedCover' (max 60 chars)",
    "metaDescription: 130–155 chars. Include cost figures for both countries, verdict, 'MedCover patient data'",
    "canonical: /compare/[country-a]-vs-[country-b]-ivf/ — alphabetical, higher-traffic first",
    "301 redirect: /compare/[country-b]-vs-[country-a]-ivf/ → canonical — implement in Next.js middleware",
    "robots: index, follow",
    "sitemap: priority 0.8, changefreq monthly",
    "OG image: /og/compare/[country-a]-vs-[country-b]-ivf.png at 1200×630px",
    "Schema: Article + FAQPage + BreadcrumbList + SpeakableSpecification on .quick-verdict-card",
    "Article.author = { @type: Organization, name: 'MedCover' }",
    "Full Comparison Table: every data row must have a citation — featured snippet primary target",
    "Quick Verdict Card: max 3 sentences, no nested lists, SpeakableSpecification target",
    "Legal section: link to official government/regulatory URL for each country with rel='external'"
  ],
  "faqStructure": {
    "count": "8–12 questions",
    "source": "Cross-country PAA from SERP",
    "answer_format": "First sentence = direct answer. 60–120 words. Mention both countries in the answer. Include 1 internal link.",
    "required_topics": [
      "Is IVF cheaper in [Country A] or [Country B]?",
      "Which country has better IVF success rates?",
      "Is egg donation legal in both [Country A] and [Country B]?",
      "Which country is better for English-speaking patients?",
      "How do wait times compare between [Country A] and [Country B]?",
      "Can I do monitoring at home and travel to [Country] only for procedures?",
      "Which country has stricter embryo freezing laws?",
      "Does [Country A] allow anonymous egg donation?"
    ]
  },
  "internalLinkingRules": {
    "required": [
      "/guides/[country-a]-ivf-guide/",
      "/guides/[country-b]-ivf-guide/",
      "/costs/[country-a]-ivf-cost-[year]/",
      "/costs/[country-b]-ivf-cost-[year]/",
      "/from/usa/ivf-abroad/ (or relevant origin country)",
      "3 related comparison pages /compare/"
    ],
    "anchor_text_rule": "Both country names must appear in anchor texts. 'IVF in Spain vs Greece' not 'compare here'."
  },
  "ctaPlacement": "Bottom: 'Get a Personalized Comparison Report' → /start/?compare=[country-a]-vs-[country-b]",
  "formattingInstructions": "Quick Verdict Card: 6-row table (Cost / English / Success Rate / Wait Time / Legal / Overall Recommendation) with winner column marked. Full Comparison Table: 10+ rows, winner badge on winning-country cell. Cost Breakdown: 2-column side-by-side table (one column per country), rows for IVF base / meds / PGT-A / travel / total. Patient Quotes: 2 quotes per country in alternating pull-quote blocks, labeled with interview source.",
  "isActive": true
}
```

---

## Template D — Cost Transparency Page

**URL:** `/costs/[country]-ivf-cost-[year]/` | **Type:** `LANDING_PAGE` | **Intent:** `INFORMATIONAL` | **Priority:** 0.8 | **~Words:** 1,800

### SEO Blueprint

| Field | Formula / Value |
|-------|----------------|
| **metaTitle** | `IVF Cost in [Country] [Year] — Real Patient Data \| MedCover` |
| **metaDescription** | `IVF in [Country] costs €[X]–€[X] per cycle based on [N] patient interviews. See what's included, what's not, and the hidden fees [X]% of patients didn't expect.` |
| **Canonical** | `/costs/[country]-ivf-cost-[year]/` |
| **Old year URL** | `/costs/[country]-ivf-cost-[prev-year]/` → 301 → current year |
| **Robots** | `index, follow` |
| **Sitemap** | `priority: 0.8` · `changefreq: monthly` · Old year URLs: not in sitemap |
| **OG Title** | `IVF Cost in [Country] [Year]: What [N] Patients Actually Paid` |
| **OG Description** | `Full cost breakdown — base IVF, medications, travel, hidden fees. Sourced from [N] verified patient interviews, not clinic marketing.` |
| **OG Image** | `/og/costs/[country]-ivf-cost-[year].png` (1200×630) |
| **Twitter Card** | `summary_large_image` |
| **Hreflang** | `en` |

### Heading Architecture

**H1:** `IVF Cost in [Country] [Year]: What [N] Patients Actually Paid`
- Must include the year and the patient count. Both are trust signals.
- Do NOT use "from €X" in H1 — always use a range: "€X–€X".
- Never use hedging language ("may cost", "could be", "it depends").

**H2s — ordered list:**

| # | H2 Text | Target Query / Purpose |
|---|---------|------------------------|
| 1 | `IVF Package Prices in [Country]: MedCover-Verified Ranges` | Featured snippet — primary cost table |
| 2 | `Hidden Add-On Costs Patients Didn't Expect` | High-value AEO, E-E-A-T differentiator |
| 3 | `IVF Medications Cost in [Country]` | Specific high-volume sub-query |
| 4 | `Travel & Accommodation Budget for [Country] IVF` | Practical cost sub-query |
| 5 | `Total All-In Cost: 3 Budget Scenarios` | SpeakableSpecification target — most actionable section |
| 6 | `IVF in [Country] vs [Origin Country]: How Much Can You Save?` | Comparison intent, conversion |
| 7 | `What Drives the Price Up or Down?` | Informational depth, decision factor |
| 8 | `Frequently Asked Questions About IVF Cost in [Country]` | FAQPage schema target |

**H3 patterns:**
- Within IVF Package Prices (H2 #1): treatment-type H3s: `IVF (Own Eggs)`, `IVF with Egg Donation`, `IVF with PGT-A`
- Within Hidden Costs (H2 #2): individual hidden cost items as H3: `Anesthesiologist Fee`, `ICSI Add-On`, `Blastocyst Culture Upgrade`, `Embryo Freezing & Storage`, `Monitoring Scans`
- Within Total Scenarios (H2 #5): scenario H3s: `Budget Scenario (€[X] total)`, `Mid-Range Scenario (€[X] total)`, `Premium Scenario (€[X] total)`
- Each FAQ question: exact patient question phrasing

**Opening paragraph (first 60 words — AEO hero answer):**
> Template: `IVF in [Country] costs between €[low]–€[high] per cycle based on [N] MedCover patient interviews. The most common all-in cost — including medication, travel, and accommodation — is €[mid] for a mid-range scenario. [N]% of patients reported costs higher than their initial clinic quote due to undisclosed add-ons.`

### Schema Markup

```json
{
  "@type": "MedicalWebPage",
  "name": "IVF Cost in [Country] [Year]: What [N] Patients Actually Paid",
  "url": "https://medcover.com/costs/[country]-ivf-cost-[year]/",
  "lastReviewed": "[Page.updatedAt ISO date]",
  "reviewedBy": { "@type": "Organization", "name": "MedCover" },
  "specialty": { "@type": "MedicalSpecialty", "name": "Fertility" },
  "about": { "@type": "MedicalProcedure", "name": "In vitro fertilisation (IVF)" }
}
```
```json
{ "@type": "FAQPage", "mainEntity": [...] }
```
```json
{ "@type": "BreadcrumbList", "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "/" },
    { "@type": "ListItem", "position": 2, "name": "Costs", "item": "/costs/" },
    { "@type": "ListItem", "position": 3, "name": "IVF Cost [Country] [Year]", "item": "/costs/[country]-ivf-cost-[year]/" }
  ]
}
```
```json
{ "@type": "SpeakableSpecification", "cssSelector": ".total-cost-summary" }
```

### AEO & Featured Snippet Rules

- **Primary snippet target:** IVF Package Prices Table (H2 #1). 3-column table (`Procedure | Low Range | High Range`), 3 rows minimum. Clean HTML, no merged cells.
- **High-value AEO target:** Hidden Costs section (H2 #2). Bulleted list format. Appears in AI Overviews more than any other section.
- **SpeakableSpecification:** Total All-In Cost summary (H2 #5). Mark `.total-cost-summary` — this is the voice search answer.
- **YMYL flag:** All cost figures must cite source. Either `"based on [N] patient interviews"` or `"publicly listed — not MedCover-verified"`.

### Content Template Payload

```json
{
  "name": "Cost Transparency Page",
  "description": "Deep-dive on IVF costs in a country or city, sourced from patient interview data. Targets 'IVF cost in Spain 2026' queries.",
  "contentType": "LANDING_PAGE",
  "requiredSections": {
    "sections": [
      "Breadcrumb (3-level: Home > Costs > IVF Cost [Country] [Year])",
      "H1 + Hero Answer Block (60 words, cost range, interview count, hidden cost rate)",
      "IVF Package Prices Table — 3 columns (Procedure / Low / High), 3+ rows",
      "Add-On Costs Table — 4 columns (Add-On / Clinic Quoted / Patient Reported / Notes)",
      "IVF Medications Cost Section — separate section targeting medication cost queries",
      "Travel & Accommodation Budget Table",
      "Total All-In Cost: 3 Scenarios (Budget / Mid / Premium) — SpeakableSpecification target",
      "Hidden Costs Section — bulleted list with patient-reported frequency",
      "Origin Country Cost Comparison Table ([Country] vs US / UK / Canada)",
      "What Drives the Price Up or Down — patient-sourced factors",
      "FAQ (8–10 questions)",
      "Related Pages (country guide, top clinics, compare page)",
      "CTA"
    ]
  },
  "headingStructure": {
    "H1": "IVF Cost in [Country] [Year]: What [N] Patients Actually Paid",
    "H1_rules": [
      "Include year AND patient count",
      "Use cost range (€X–€X), never 'from €X' alone",
      "No hedging: no 'may cost', 'could be', 'it depends' in H1"
    ],
    "H2s": [
      "IVF Package Prices in [Country]: MedCover-Verified Ranges",
      "Hidden Add-On Costs Patients Didn't Expect",
      "IVF Medications Cost in [Country]",
      "Travel & Accommodation Budget for [Country] IVF",
      "Total All-In Cost: 3 Budget Scenarios",
      "IVF in [Country] vs [Origin Country]: How Much Can You Save?",
      "What Drives the Price Up or Down?",
      "Frequently Asked Questions About IVF Cost in [Country]"
    ],
    "H3_treatment": "IVF (Own Eggs) | IVF with Egg Donation | IVF with PGT-A",
    "H3_hidden_cost": "Anesthesiologist Fee | ICSI Add-On | Blastocyst Culture Upgrade | Embryo Freezing & Storage | Monitoring Scans",
    "H3_scenario": "Budget Scenario (€[X] total) | Mid-Range Scenario (€[X] total) | Premium Scenario (€[X] total)",
    "H3_faq": "Exact patient question phrasing",
    "intro_rule": "60 words max. State cost range with citation (N interviews), all-in mid-range estimate, hidden cost rate. No preamble."
  },
  "seoRules": [
    "metaTitle: 'IVF Cost in [Country] [Year] — Real Patient Data | MedCover' (max 60 chars)",
    "metaDescription: 130–155 chars. Include cost range, year, interview count, hidden cost mention",
    "canonical: /costs/[country]-ivf-cost-[year]/",
    "301 redirect: /costs/[country]-ivf-cost-[prev-year]/ → /costs/[country]-ivf-cost-[year]/",
    "On annual refresh: update Page.updatedAt, schema.lastReviewed, sitemap.lastmod",
    "robots: index, follow",
    "sitemap: priority 0.8, changefreq monthly. Old year URL: not in sitemap after redirect",
    "OG image: /og/costs/[country]-ivf-cost-[year].png at 1200×630px",
    "Schema: MedicalWebPage + FAQPage + BreadcrumbList + SpeakableSpecification on .total-cost-summary",
    "YMYL: ALL cost figures must cite source (interview count or 'publicly listed')",
    "IVF Package Prices Table: clean HTML table, headers, no merged cells — primary featured snippet",
    "Hidden Costs Section: bulleted list format — primary AI Overview signal",
    "SpeakableSpecification: targets Total All-In Cost section (.total-cost-summary)",
    "All tables must include 'Last updated: [month year]' caption below"
  ],
  "faqStructure": {
    "count": "8–10 questions",
    "source": "Cost-specific SERP PAA + patient interview questions",
    "answer_format": "First sentence = direct answer with a number. 60–120 words. At least 1 internal link per answer.",
    "required_topics": [
      "What is the average IVF cost in [Country]?",
      "Is IVF covered by insurance in [Country]?",
      "What is NOT included in the quoted IVF price?",
      "How much do IVF medications cost in [Country]?",
      "What are the travel and accommodation costs for IVF in [Country]?",
      "Is IVF in [Country] cheaper than in the US/UK?",
      "What hidden fees should I budget for?",
      "Does the IVF price differ between cities in [Country]?"
    ]
  },
  "internalLinkingRules": {
    "required": [
      "/guides/[country]-ivf-guide/",
      "/guides/[country]/[top-city]-ivf-guide/",
      "Top 3 clinic profiles for this country",
      "/compare/[country]-vs-usa-ivf/",
      "/treatments/ivf/",
      "/faq/#costs"
    ]
  },
  "ctaPlacement": "Two CTAs: (1) After Total Scenarios section — 'Get a Full Cost Breakdown for Your Situation' → /start/. (2) Bottom of page — same CTA.",
  "formattingInstructions": "IVF Package Prices Table: 3 columns (Procedure / Low Range / High Range), 3+ rows, 'Last updated [month year]' caption. Add-On Costs Table: 4 columns (Add-On / Clinic Quoted / Patient Reported / Notes). Total Scenarios: 3 columns (Cost Category / Budget / Mid / Premium), with total row bolded. Hidden Costs: bulleted list, each item has patient frequency ('X of Y patients reported this'). All costs in € with range notation.",
  "isActive": true
}
```

### Year Refresh Workflow

1. Create new `Page` record for `/costs/[country]-ivf-cost-[new-year]/`
2. Add 301 redirect: old year → new year (Next.js middleware or nginx)
3. Remove old year URL from sitemap; add new year URL
4. Update `Page.updatedAt` and `schema.lastReviewed` to today's date
5. Re-trigger content generation: `POST /api/v1/pages/:id/generate-content`
6. Republish via webhook to frontend

---

## Template E — Treatment Glossary / Entity Page

**URL:** `/treatments/[treatment]/` | **Type:** `ARTICLE` | **Intent:** `INFORMATIONAL` | **Priority:** 0.8 | **~Words:** 1,800

### SEO Blueprint

| Field | Formula / Value |
|-------|----------------|
| **metaTitle** | `What Is [Treatment]? Costs, Success Rates & Going Abroad \| MedCover` |
| **metaDescription** | `[Treatment] is [one-sentence definition]. Costs abroad: €[X]–€[X]. Success rates by age, step-by-step process, and what MedCover patients report. Medically reviewed.` |
| **Canonical** | `/treatments/[treatment]/` |
| **Robots** | `index, follow` |
| **Sitemap** | `priority: 0.8` · `changefreq: yearly` |
| **OG Title** | `What Is [Treatment]? The Complete Guide for Patients Going Abroad` |
| **OG Description** | `Medically reviewed. Step-by-step process, success rates by age, costs abroad, and real patient insights from MedCover.` |
| **OG Image** | `/og/treatments/[treatment].png` (1200×630) |
| **Twitter Card** | `summary_large_image` |
| **Hreflang** | `en` |
| **Medical Reviewer** | MANDATORY — name, credentials, review date visible on page |

### Heading Architecture

**H1:** `What Is [Treatment]? How It Works, Costs Abroad & Patient Insights`
- Always lead with "What Is [Treatment]?" — this is the primary entity query Google expects for glossary pages.
- Include "abroad" to signal the cross-border intent specific to MedCover.

**H2s — ordered list:**

| # | H2 Text | Target Query / Purpose |
|---|---------|------------------------|
| 1 | `How [Treatment] Works: Step-by-Step` | HowTo schema target, PAA |
| 2 | `[Treatment] Success Rates by Age Group` | Featured snippet — data table |
| 3 | `Why Patients Travel Abroad for [Treatment]` | Conversion intent, links to country guides |
| 4 | `What MedCover Patients Say About [Treatment]` | E-E-A-T + interview quote block |
| 5 | `[Treatment] Abroad: Which Countries Offer It?` | Internal link hub to country guides |
| 6 | `Key [Treatment] Terms Explained` | Glossary — entity recognition |
| 7 | `Authoritative Sources on [Treatment]` | E-E-A-T signal, external links |
| 8 | `Frequently Asked Questions About [Treatment]` | FAQPage schema, PAA |

**H3 patterns:**
- Within HowTo (H2 #1): each step is a numbered H3: `Step 1: Ovarian Stimulation`, `Step 2: Egg Retrieval`, etc.
- Within Success Rates (H2 #2): age brackets as row labels — no H3 needed (use table)
- Within Terms Explained (H2 #6): each term is an H3: `Blastocyst`, `ICSI`, `PGT-A`, `Vitrification`, etc.
- Within Why Abroad (H2 #3): reason H3s: `Cost Advantage`, `Access to Egg Donation`, `Shorter Wait Times`, `Legal Advantages`
- Each FAQ: exact patient question phrasing

**Opening paragraph (first 60 words — AEO hero answer):**
> Template: `[Treatment] is a fertility treatment in which [plain-language one-sentence definition]. It is typically recommended for patients who [brief indication]. Abroad, [treatment] costs between €[low]–€[high] per cycle — significantly less than in the US or UK. MedCover has conducted [N] patient interviews with people who underwent [treatment] abroad.`

### Schema Markup

```json
{
  "@type": "MedicalWebPage",
  "name": "What Is [Treatment]?",
  "url": "https://medcover.com/treatments/[treatment]/",
  "lastReviewed": "[Page.updatedAt ISO date]",
  "reviewedBy": { "@type": "Person", "name": "[Reviewer Name]", "honorificSuffix": "[MD/PhD/etc]" },
  "specialty": { "@type": "MedicalSpecialty", "name": "Fertility" },
  "medicalAudience": { "@type": "MedicalAudience", "audienceType": "Patient" }
}
```
```json
{
  "@type": "MedicalProcedure",
  "name": "[Treatment Full Name]",
  "alternateName": "[Treatment Abbreviation]",
  "description": "[Plain-language description]",
  "procedureType": { "@type": "MedicalProcedureType", "name": "Therapeutic procedure" },
  "bodyLocation": "Reproductive system",
  "preparation": "[Preparation steps]",
  "followUp": "[Post-procedure information]",
  "recognizingAuthority": { "@type": "Organization", "name": "ESHRE" }
}
```
```json
{
  "@type": "HowTo",
  "name": "How [Treatment] Works",
  "step": [
    { "@type": "HowToStep", "position": 1, "name": "Step Name", "text": "Step description (20–40 words)" }
  ]
}
```
```json
{ "@type": "FAQPage", "mainEntity": [...] }
```
```json
{ "@type": "BreadcrumbList", ... }
```

### AEO & Featured Snippet Rules

- **Primary snippet target:** HowTo numbered list (H2 #1). Each step 20–40 words. No sub-bullets within steps. Renders as a numbered featured snippet.
- **Secondary target:** Success Rates table. Age bracket + success rate + source column. Clean HTML table.
- **Entity recognition:** `MedicalProcedure` schema + Glossary (H2 #6) build Google's entity understanding of this treatment.
- **YMYL / E-E-A-T:** Medical reviewer credit block is **mandatory**. Must be visible, not hidden in metadata.

### Content Template Payload

```json
{
  "name": "Treatment Glossary / Entity Page",
  "description": "Medical entity definition page for a fertility treatment. YMYL — requires medical reviewer. Builds topical authority and entity recognition.",
  "contentType": "ARTICLE",
  "requiredSections": {
    "sections": [
      "Breadcrumb (3-level: Home > Treatments > [Treatment])",
      "Medical Reviewer Credit Block (name, credentials, last reviewed date) — MANDATORY, visible",
      "H1 + Hero Answer Block (60 words, define treatment in plain language, include abroad cost)",
      "HowTo: The Process — numbered list, 6–8 steps, each step H3 + 1–2 sentence description",
      "Success Rates by Age — table: age bracket / success rate / source",
      "Why Patients Travel Abroad for [Treatment] — cost, access, legal, wait time",
      "What MedCover Patients Say — 3 interview excerpts tagged by dimension",
      "[Treatment] Abroad: Destination Cards (linked to country guides)",
      "Key Terms Explained — glossary, each term as H3 definition",
      "Authoritative Sources — external links (CDC, SART, ESHRE, WHO) with rel='external'",
      "FAQ (10–15 questions)",
      "Related Treatments (linked cards)",
      "CTA"
    ]
  },
  "headingStructure": {
    "H1": "What Is [Treatment]? How It Works, Costs Abroad & Patient Insights",
    "H1_rules": [
      "Always lead with 'What Is [Treatment]?'",
      "Include 'abroad' to signal cross-border intent",
      "Do not omit the question mark"
    ],
    "H2s": [
      "How [Treatment] Works: Step-by-Step",
      "[Treatment] Success Rates by Age Group",
      "Why Patients Travel Abroad for [Treatment]",
      "What MedCover Patients Say About [Treatment]",
      "[Treatment] Abroad: Which Countries Offer It?",
      "Key [Treatment] Terms Explained",
      "Authoritative Sources on [Treatment]",
      "Frequently Asked Questions About [Treatment]"
    ],
    "H3_step": "Step [N]: [Step Name] (numbered, inside HowTo section)",
    "H3_reason_abroad": "Cost Advantage | Access to Egg Donation | Shorter Wait Times | Legal Advantages",
    "H3_term": "Each glossary term: Blastocyst | ICSI | PGT-A | Vitrification | Stimulation Protocol | Embryo Transfer",
    "H3_faq": "Exact patient question phrasing",
    "intro_rule": "60 words max. Define treatment in plain language (no jargon). Include abroad cost range. State interview count. No deferred definition."
  },
  "seoRules": [
    "metaTitle: 'What Is [Treatment]? Costs, Success Rates & Going Abroad | MedCover' (max 60 chars)",
    "metaDescription: 130–155 chars. Include plain-language definition, abroad cost range, 'medically reviewed'",
    "canonical: /treatments/[treatment]/",
    "robots: index, follow",
    "sitemap: priority 0.8, changefreq yearly",
    "OG image: /og/treatments/[treatment].png at 1200×630px",
    "MANDATORY: 'Medically reviewed by: [Name], [Credentials]. Last reviewed: [Date]' — visible block, not just metadata",
    "Schema: MedicalWebPage + MedicalProcedure + HowTo + FAQPage + BreadcrumbList",
    "MedicalProcedure: name, alternateName, description, procedureType, bodyLocation, preparation, followUp, recognizingAuthority: ESHRE",
    "HowTo schema: 6–8 steps, each step has name and text (20–40 words per step)",
    "External links (CDC, SART, ESHRE, WHO): rel='external noopener'",
    "HowTo numbered list: primary featured snippet target — no sub-bullets within steps",
    "Success Rates table: age bracket / success rate / source — secondary featured snippet"
  ],
  "faqStructure": {
    "count": "10–15 questions",
    "source": "Treatment-specific SERP PAA + medical FAQ databases",
    "answer_format": "First sentence = direct answer. 60–120 words. Cite authoritative source where possible. Include 1 internal link per answer.",
    "required_topics": [
      "What is the success rate of [Treatment]?",
      "How long does [Treatment] take?",
      "Is [Treatment] painful?",
      "What is the cost of [Treatment] abroad?",
      "Is [Treatment] legal in all countries?",
      "How do I prepare for [Treatment]?",
      "What are the risks of [Treatment]?",
      "How is [Treatment] different from [related treatment]?",
      "How many cycles of [Treatment] are usually needed?",
      "What happens if [Treatment] fails?"
    ]
  },
  "internalLinkingRules": {
    "required": [
      "Country guides for each destination offering this treatment",
      "/costs/ pages for this treatment",
      "Related treatment pages (/treatments/)",
      "/faq/#ivf-basics"
    ]
  },
  "ctaPlacement": "After Countries section: 'Compare [Treatment] Options Abroad' → /guides/. Bottom: 'Find a Verified Clinic for [Treatment]' → /clinics/",
  "formattingInstructions": "Medical Reviewer Credit: visible box at top of article (not just in footer), with reviewer name, credentials, and 'Last reviewed: [date]'. HowTo: numbered list, each step has an H3 title (Step N: Name) and 1–2 sentence body. Success Rates Table: 5 rows (age brackets: <35 / 35-37 / 38-40 / 41-42 / >42), 3 columns (Age / Success Rate / Source). Glossary: alphabetical, each term bolded as H3, 1–2 sentence definition. External Resources: unordered list labeled 'Authoritative Sources'.",
  "isActive": true
}
```

---

## Template F — Origin Patient Journey Page

**URL:** `/from/[country]/ivf-abroad/` | **Type:** `LANDING_PAGE` | **Intent:** `INFORMATIONAL` | **Priority:** 0.8 | **~Words:** 1,800

### SEO Blueprint

| Field | Formula / Value |
|-------|----------------|
| **metaTitle** | `IVF Abroad for [Origin] Patients [Year] — Best Destinations & Real Costs \| MedCover` |
| **metaDescription** | `US patients pay $20,000–$30,000 for IVF at home. Spain, Greece, and Czech Republic start at €5,500. Compare destinations, legal rules, and real patient costs.` *(adjust for origin country)* |
| **Canonical** | `/from/[origin-country]/ivf-abroad/` |
| **Robots** | `index, follow` |
| **Sitemap** | `priority: 0.8` · `changefreq: monthly` |
| **OG Title** | `IVF Abroad for [Origin Country] Patients: Destinations, Costs & Logistics` |
| **OG Description** | `Everything [origin] patients need to know about IVF abroad — insurance, legal rules, how many trips, and which destination is best for you.` |
| **OG Image** | `/og/from/[origin-country]-ivf-abroad.png` (1200×630) |
| **Twitter Card** | `summary_large_image` |
| **Hreflang** | `en-us` (for /from/usa/) · `en-gb` (for /from/uk/) · `en-ca` (for /from/canada/) |

### Heading Architecture

**H1:** `IVF Abroad for [Origin Country] Patients: Guide, Costs & Real Experiences`
- Origin country in title-case.
- Include "Real Experiences" to signal patient data authority.

**H2s — ordered list:**

| # | H2 Text | Target Query / Purpose |
|---|---------|------------------------|
| 1 | `Why [Origin] Patients Travel for IVF Abroad` | Cost comparison, decision context |
| 2 | `IVF Cost Comparison: [Origin] vs Top Destinations` | Featured snippet — 4-row cost table |
| 3 | `Best IVF Destinations for [Origin] Patients` | Destination cards, internal link hub |
| 4 | `Legal & Insurance Considerations for [Origin] Patients` | High-intent informational, legal authority |
| 5 | `Logistics Guide: Visa, Travel Insurance & Number of Trips` | Practical, pre-travel intent |
| 6 | `Real [Origin] Patient Experiences` | E-E-A-T + patient quote block |
| 7 | `Frequently Asked Questions` | FAQPage schema target |

**H3 patterns:**
- Within Why Abroad (H2 #1): `The Cost Gap`, `Insurance Doesn't Cover It`, `Access to Egg Donation`, `Shorter Wait Times`
- Within Legal (H2 #4): `Insurance Coverage`, `Legal Rights Abroad`, `Tax Deductibility`, `FDA / Regulatory Jurisdiction` — with legal disclaimer H3
- Within Logistics (H2 #5): `Visa Requirements`, `Travel Insurance`, `How Many Trips You'll Need`, `Time Off Work`, `Bringing a Partner`
- Within Destinations (H2 #3): each destination card heading: `[Country] — Avg €[X]–€[X] · [Flight time] from [Origin]`
- Each FAQ: exact origin-country-specific question phrasing

**Opening paragraph (first 60 words — AEO hero answer):**
> Template: `IVF in the [Origin country] averages $[X]–$[X] per cycle. In Spain, the same treatment costs €[X]–€[X] — a saving of up to [X]%. [Origin] patients most commonly travel to Spain, Greece, and Czech Republic. Most require [N] trips. MedCover has conducted [N] patient interviews with [origin] patients who have done this.`

### Schema Markup

```json
{
  "@type": "Article",
  "headline": "IVF Abroad for [Origin Country] Patients: Guide, Costs & Real Experiences",
  "author": { "@type": "Organization", "name": "MedCover" },
  "datePublished": "[ISO date]",
  "dateModified": "[Page.updatedAt ISO date]",
  "about": { "@type": "MedicalProcedure", "name": "In vitro fertilisation (IVF)" },
  "audience": { "@type": "Audience", "geographicArea": { "@type": "Country", "name": "[Origin Country]" } }
}
```
```json
{ "@type": "FAQPage", "mainEntity": [...] }
```
```json
{ "@type": "BreadcrumbList", "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "/" },
    { "@type": "ListItem", "position": 2, "name": "From [Origin Country]", "item": "/from/[origin-country]/" },
    { "@type": "ListItem", "position": 3, "name": "IVF Abroad", "item": "/from/[origin-country]/ivf-abroad/" }
  ]
}
```
```json
{ "@type": "SpeakableSpecification", "cssSelector": ".cost-comparison-table" }
```

### AEO & Featured Snippet Rules

- **Primary snippet target:** Cost Comparison Table (H2 #2). 4 rows minimum (`[Origin] | Spain | Greece | Czech Republic`), 3 columns (`Location | Avg IVF Cost | All-In Estimate`). Mark as SpeakableSpecification.
- **Legal disclaimer:** Legal section (H2 #4) must include visible disclaimer: `"This is not legal advice. Consult a qualified attorney for insurance and medical travel law in [Origin Country]."`
- **Hreflang:** This template is the only one with country-specific hreflang. Implement in Next.js `generateMetadata`.
- **Destination card sort:** By relevance to origin country (flight distance, English proficiency, legal compatibility) — not alphabetical.

### Content Template Payload

```json
{
  "name": "Origin Patient Journey Page",
  "description": "Destination guide for patients from a specific origin country. Addresses insurance, legal, logistics, and destination ranking from their home-country perspective.",
  "contentType": "LANDING_PAGE",
  "requiredSections": {
    "sections": [
      "Breadcrumb (3-level: Home > From [Origin Country] > IVF Abroad)",
      "H1 + Hero Answer Block (60 words, state cost gap between origin and top destination)",
      "Why [Origin] Patients Travel for IVF — cost gap, insurance limits, egg donation access",
      "IVF Cost Comparison Table ([Origin] vs Spain vs Greece vs Czech Republic)",
      "Best IVF Destinations for [Origin] Patients — destination cards, sorted by origin-relevance",
      "Legal & Insurance Section — with visible legal disclaimer",
      "Logistics Guide (visa, travel insurance, trips required, time off work, bringing a partner)",
      "Real [Origin] Patient Experiences — 3 anonymized interview excerpts",
      "FAQ (10 questions, origin-specific)",
      "CTA"
    ]
  },
  "headingStructure": {
    "H1": "IVF Abroad for [Origin Country] Patients: Guide, Costs & Real Experiences",
    "H1_rules": [
      "Origin country in title-case",
      "Include 'Real Experiences' — patient data signal",
      "Do not use 'Best' or 'Ultimate'"
    ],
    "H2s": [
      "Why [Origin] Patients Travel for IVF Abroad",
      "IVF Cost Comparison: [Origin] vs Top Destinations",
      "Best IVF Destinations for [Origin] Patients",
      "Legal & Insurance Considerations for [Origin] Patients",
      "Logistics Guide: Visa, Travel Insurance & Number of Trips",
      "Real [Origin] Patient Experiences",
      "Frequently Asked Questions"
    ],
    "H3_why": "The Cost Gap | Insurance Doesn't Cover It | Access to Egg Donation | Shorter Wait Times",
    "H3_legal": "Insurance Coverage | Legal Rights Abroad | Tax Deductibility | FDA & Regulatory Jurisdiction",
    "H3_logistics": "Visa Requirements | Travel Insurance | How Many Trips You'll Need | Time Off Work | Bringing a Partner",
    "H3_destination": "[Country] — Avg €[X]–€[X] · [N]-hour flight from [Origin City]",
    "H3_faq": "Origin-country-specific question phrasing",
    "intro_rule": "60 words max. State cost gap (origin avg vs top destination avg), savings %, top destination, typical trip count, and MedCover interview count for origin patients. No preamble."
  },
  "seoRules": [
    "metaTitle: 'IVF Abroad for [Origin] Patients [Year] — Best Destinations & Real Costs | MedCover' (max 60 chars)",
    "metaDescription: 130–155 chars. Include cost gap, top destination, and 'real patient data'",
    "canonical: /from/[origin-country]/ivf-abroad/",
    "robots: index, follow",
    "sitemap: priority 0.8, changefreq monthly",
    "hreflang: en-us for /from/usa/ · en-gb for /from/uk/ · en-ca for /from/canada/",
    "OG image: /og/from/[origin-country]-ivf-abroad.png at 1200×630px",
    "Schema: Article + FAQPage + BreadcrumbList + SpeakableSpecification on .cost-comparison-table",
    "Article.audience.geographicArea = origin country",
    "Cost Comparison Table: SpeakableSpecification target + featured snippet target",
    "Legal section: visible disclaimer 'This is not legal advice' — mandatory",
    "Destination cards sorted by origin-country relevance, not alphabetically"
  ],
  "faqStructure": {
    "count": "10 questions",
    "source": "Origin-country-specific SERP PAA",
    "answer_format": "First sentence = direct answer specific to origin country. 60–120 words. Include 1 internal link.",
    "required_topics": [
      "Can I use [origin country] insurance for IVF abroad?",
      "How many trips to [destination] does IVF require?",
      "Is IVF in Spain/Greece FDA-approved?",
      "What is the time difference and jet lag impact on IVF?",
      "Can I bring a partner or support person?",
      "What happens if the cycle fails — do I have to travel again?",
      "Is it legal to use donor eggs in [destination]?",
      "Can I deduct IVF abroad costs on [origin] taxes?",
      "Does my [origin] doctor need to be involved?",
      "What [origin]-based support groups exist for IVF abroad?"
    ]
  },
  "internalLinkingRules": {
    "required": [
      "/guides/[country]-ivf-guide/ — top 3 destinations",
      "/compare/[destination-a]-vs-[destination-b]-ivf/",
      "/costs/ pages for top destinations",
      "/faq/"
    ],
    "origin_rule": "Link to patient stories from same origin country when available."
  },
  "ctaPlacement": "Bottom: 'Find Your Best Destination' → links to country guide hub or /guides/",
  "formattingInstructions": "Cost Comparison Table: 4 rows (Origin / Spain / Greece / Czech Republic), 3 columns (Location / Avg IVF Cost / All-In Estimate). Destination cards: country flag, name, avg cost range, English score, flight time from origin, link to country guide. Logistics section: numbered checklist format. Legal section: gray disclaimer box above the legal content. Patient quotes: pull-quote styling, labeled '[Origin country] patient, [month year]'.",
  "isActive": true
}
```

---

## Template G — Truth Report (Auto-Generated)

**URL:** `/reports/[clinic-slug]-patient-truth-report/` | **Type:** `ARTICLE` | **Intent:** `NAVIGATIONAL` | **Priority:** 0.6 | **~Words:** 800

### SEO Blueprint

| Field | Formula / Value |
|-------|----------------|
| **metaTitle** | `[Clinic Name] Patient Truth Report [Year] — [N] Verified Interviews \| MedCover` |
| **metaDescription** | `[Clinic Name] Truth Score: [X]/100 ([Grade]) based on [N] verified patient interviews. Key finding: [top insight]. Auto-generated from MedCover interview data.` |
| **Canonical** | `/reports/[clinic-slug]-patient-truth-report/` |
| **Robots** | `noindex, follow` when `interviewCount < 5` · `index, follow` when `>= 5` |
| **Sitemap** | Excluded when `noindex`. `priority: 0.6` · `changefreq: weekly` when indexed |
| **OG Title** | `[Clinic Name] Truth Report — [X]/100 · [N] Verified Patient Interviews` |
| **OG Description** | `Data-driven Truth Report for [Clinic Name]. Dimension breakdown, hidden costs, patient quotes. Auto-generated by MedCover.` |
| **OG Image** | `/og/reports/[clinic-slug]-truth-report.png` (1200×630) |
| **Twitter Card** | `summary_large_image` |
| **Hreflang** | `en` |

### Heading Architecture

**H1:** `[Clinic Name] Truth Report — Based on [N] Verified Patient Interviews`
- Must include exact interview count — dynamically populated.
- "Truth Report" is the brand term — never omit.
- Do not include city or year — this is a living document updated on each generation.

**H2s — ordered list:**

| # | H2 Text | Target Query / Purpose |
|---|---------|------------------------|
| 1 | `Truth Score Overview: [X]/100 ([Grade])` | AggregateRating anchor, entity clarity |
| 2 | `Key Findings` | Scannable, AI Overview target — bullet format |
| 3 | `Detailed Dimension Analysis` | Data depth, links to clinic profile |
| 4 | `What Patients Loved` | Positive signal, NLP-derived themes |
| 5 | `What Patients Flagged` | Balanced, trust signal |
| 6 | `Hidden Costs Revealed by Patients` | High-value AEO target |
| 7 | `MedCover Recommendation` | Data-driven verdict — not editorial opinion |
| 8 | `[Clinic Name]'s Official Response` *(only if claimed)* | Balance, trust |

**H3 patterns:**
- Within Dimension Analysis (H2 #3): each of the 10 dimensions as H3: `Cost Transparency [X]/100`, `English Proficiency [X]/100`, `Outcome Communication [X]/100`, `Hidden Fees [X]/100`, `Staff Quality [X]/100`, `Lab Transparency [X]/100`, `Logistics Support [X]/100`, `Wait Time [X]/100`, `Emotional Support [X]/100`, `Value for Money [X]/100`
- Within Hidden Costs (H2 #6): individual cost items as H3: e.g. `Anesthesiologist Fee`, `ICSI Upgrade`, `Embryo Freezing`
- No H3 within Key Findings — use bullet points only

**Opening paragraph (first 60 words — AEO hero answer):**
> Template (placed below H1, before Report Header Info Box): `This Truth Report is based on [N] patient interviews conducted by MedCover between [start month year] and [end month year]. [Clinic Name] received a Truth Score of [X]/100 ([Grade]). The clinic's strongest dimension is [top dimension] ([score]/100). The most common patient concern was [top flagged dimension].`

### Schema Markup

```json
{
  "@type": "CreativeWork",
  "name": "[Clinic Name] Patient Truth Report",
  "description": "Data-driven patient truth report for [Clinic Name], auto-generated from [N] verified patient interviews.",
  "dateCreated": "[initial generation date ISO]",
  "dateModified": "[last regeneration date ISO]",
  "author": { "@type": "Organization", "name": "MedCover" },
  "about": { "@type": "MedicalClinic", "name": "[Clinic Name]" }
}
```
```json
{
  "@type": "AggregateRating",
  "itemReviewed": { "@type": "MedicalClinic", "name": "[Clinic Name]" },
  "ratingValue": "[Truth Score — 0-100 scale]",
  "bestRating": "100",
  "worstRating": "0",
  "ratingCount": "[interviewCount]"
}
```
```json
{
  "@type": "Review",
  "itemReviewed": { "@type": "MedicalClinic", "name": "[Clinic Name]" },
  "author": { "@type": "Person", "name": "Anonymous Patient" },
  "datePublished": "[interview month YYYY-MM]",
  "reviewBody": "[anonymized patient quote]"
}
```
*(One `Review` entity per excerpt — minimum 3)*
```json
{ "@type": "Organization", "name": "[Clinic Name]", "url": "[clinic URL]" }
```
```json
{ "@type": "BreadcrumbList", "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "/" },
    { "@type": "ListItem", "position": 2, "name": "Reports", "item": "/reports/" },
    { "@type": "ListItem", "position": 3, "name": "[Clinic Name] Truth Report", "item": "/reports/[clinic-slug]-patient-truth-report/" }
  ]
}
```

### AEO & Featured Snippet Rules

- **noindex gate is critical:** Never expose to Google before 5 interviews. Logic must be enforced server-side at page generation.
- **Key Findings section (H2 #2):** Each bullet starts with a statistic: `"[X]% of patients said..."` — the format most often extracted by AI Overviews.
- **Hidden Costs (H2 #6):** Bulleted list format. Highest-probability AEO target on this template.
- **Methodology link:** `/ai-interviewer/` must appear on every Truth Report — mandatory for E-E-A-T.
- **Data Freshness Notice:** Italic text at bottom: `"This report was auto-generated on [date] and will update when new interviews are added."` — required.

### Content Template Payload

```json
{
  "name": "Clinic Truth Report (Auto-Generated)",
  "description": "Programmatically generated from clinic-inventory data when 5+ interviews exist. Aggregates all 10 Truth Score dimensions.",
  "contentType": "ARTICLE",
  "requiredSections": {
    "sections": [
      "Breadcrumb (3-level: Home > Reports > [Clinic Name] Truth Report)",
      "H1 + Hero Answer Block (60 words: score, grade, interview count, top/bottom dimension)",
      "Report Header Info Box (clinic name, report date, interview count, data period, methodology link)",
      "Truth Score with Dimension Breakdown (score bars for all 10 dimensions)",
      "Key Findings Summary (3–5 bullets, each starting with a statistic)",
      "Dimension Deep-Dive — 10 H3 sections, one per dimension, score + representative quote",
      "What Patients Loved — top positive NLP themes",
      "What Patients Flagged — top concerns / recurring issues",
      "Hidden Costs Revealed — bulleted list with frequency",
      "MedCover Recommendation — data-driven, not editorial",
      "Clinic Official Response Slot (only if clinic has claimed profile)",
      "Data Freshness Notice — italic, auto-generated date",
      "CTA (lead gen + interview contribution)"
    ]
  },
  "headingStructure": {
    "H1": "[Clinic Name] Truth Report — Based on [N] Verified Patient Interviews",
    "H1_rules": [
      "Dynamic interview count — must update on each regeneration",
      "'Truth Report' brand term never omitted",
      "No city or year in H1 — this is a living document"
    ],
    "H2s": [
      "Truth Score Overview: [X]/100 ([Grade])",
      "Key Findings",
      "Detailed Dimension Analysis",
      "What Patients Loved",
      "What Patients Flagged",
      "Hidden Costs Revealed by Patients",
      "MedCover Recommendation",
      "[Clinic Name]'s Official Response"
    ],
    "H3_dimension": "Each of 10 dimensions with score: 'Cost Transparency [X]/100' | 'English Proficiency [X]/100' | etc.",
    "H3_hidden_cost": "Individual hidden cost items: 'Anesthesiologist Fee' | 'ICSI Upgrade' | 'Embryo Freezing'",
    "intro_rule": "60 words max. State score, grade, interview count, date range, top and bottom dimension. No preamble."
  },
  "seoRules": [
    "metaTitle: '[Clinic Name] Patient Truth Report [Year] — [N] Verified Interviews | MedCover' (max 60 chars)",
    "metaDescription: 130–155 chars. Include Truth Score, grade, interview count, top finding",
    "canonical: /reports/[clinic-slug]-patient-truth-report/",
    "CRITICAL: noindex, follow when interviewCount < 5. Switch to index, follow at 5+ interviews",
    "sitemap: EXCLUDE when noindex. Include at priority 0.6, changefreq weekly when indexed",
    "OG image: /og/reports/[clinic-slug]-truth-report.png at 1200×630px",
    "Schema: CreativeWork + AggregateRating + Review x3+ + Organization (clinic) + BreadcrumbList",
    "AggregateRating: ratingValue = Truth Score (0-100 scale), bestRating: 100, ratingCount = interviewCount",
    "Review entities: one per excerpt, author.name = 'Anonymous Patient', datePublished = interview YYYY-MM",
    "lastReviewed: must reflect actual regeneration date, not creation date",
    "Methodology link to /ai-interviewer/ MANDATORY on every report",
    "Data Freshness Notice MANDATORY at bottom of every report",
    "Key Findings bullets: each must start with a statistic ('X% of patients said...') — AI Overview format",
    "Patient quotes: 'Patient interview, [Month Year], via MedCover'"
  ],
  "faqStructure": {
    "count": "0 — no FAQ section",
    "note": "Truth Reports are data reports. FAQs belong on Template B (Clinic Profile Page)."
  },
  "internalLinkingRules": {
    "required": [
      "/clinics/[country]/[city]/[slug]/ (clinic profile — primary link)",
      "/guides/[country]-ivf-guide/",
      "/guides/[country]/[city]-ivf-guide/",
      "/ai-interviewer/ (methodology — MANDATORY)",
      "/truth-score/ (scoring methodology)"
    ]
  },
  "ctaPlacement": "Two CTAs: (1) 'Connect with [Clinic Name]' → lead gen form. (2) 'Contribute Your Interview' → /start/",
  "formattingInstructions": "Report Header Info Box: gray callout — clinic name, report date, 'Based on [N] interviews, [start date]–[end date]', methodology link. Dimension scores: CSS progress bars, label + score above, representative quote + patient frequency below. Key Findings: bulleted list, each item starts with a percentage or number. Data Freshness Notice: italic, small text, bottom of page. All patient quotes: pull-quote styling with date tag.",
  "isActive": true
}
```

### Auto-Generation Triggers

| Event | Action |
|-------|--------|
| 5th interview published for clinic | Generate report; switch page from `noindex` to `index`; add to sitemap |
| Any new interview published | Queue report regeneration (weekly batch job) |
| Clinic submits official response | Force immediate regeneration |
| Interview withdrawn (consent revoked) | Re-check count; if `< 5`, revert to `noindex`; remove from sitemap |

---

## Template H — Patient Story Page

**URL:** `/patient-stories/[slug]/` | **Type:** `BLOG_POST` | **Intent:** `INFORMATIONAL` | **Priority:** 0.6 | **~Words:** 1,800

### SEO Blueprint

| Field | Formula / Value |
|-------|----------------|
| **metaTitle** | `[Compelling outcome] — IVF [Treatment] in [Destination] ([Year]) \| MedCover Patient Stories` |
| **metaDescription** | `A [age-range]-year-old [origin] patient shares her IVF [treatment] experience in [destination]: real costs (€[X] total), [outcome], and what surprised her most.` |
| **Canonical** | `/patient-stories/[descriptive-slug]/` |
| **Robots** | `index, follow` (ONLY after consent flag confirmed in `PatientInterview.consentGiven = true`) |
| **Sitemap** | `priority: 0.6` · `changefreq: never` (static after publish) |
| **OG Title** | same as metaTitle |
| **OG Description** | same as metaDescription |
| **OG Image** | `/og/patient-stories/[slug].png` (1200×630) — abstract/illustrative, never patient photo |
| **Twitter Card** | `summary_large_image` |
| **Hreflang** | `en` |

### Heading Architecture

**H1:** `[Compelling Outcome or Insight] — An IVF [Treatment] Journey from [Origin Country] to [Destination]`
- Example: `"First Cycle Success at 42 — An IVF Journey from the US to Barcelona"`
- Lead with the outcome or the most compelling detail, not the patient's name or clinic name.
- Never use clinic name in H1 — consent rules. Clinic appears in the body only if consented.
- Include origin → destination journey arc.

**H2s — ordered list:**

| # | H2 Text | Target Query / Purpose |
|---|---------|------------------------|
| 1 | `About [Descriptive Patient Profile]` | Anonymous bio, context for reader |
| 2 | `The Story` | Main narrative — longest section |
| 3 | `What Surprised [Her/Him/Them]` | High-value practical content, hidden info |
| 4 | `Would [She/He/They] Do It Again?` | Direct quote, conversion signal |
| 5 | `Related Patient Stories` | Internal linking, engagement |

**H3 patterns:**
- Within The Story (H2 #2): narrative sub-headings as story beats: `Before the Decision`, `Choosing [Destination]`, `The Treatment Experience`, `The Outcome`
- Within What Surprised (H2 #3): surprise items as H3: `Hidden Costs`, `Unexpected Positives`, `Things to Know Before You Go`
- Related Stories (H2 #5): each story card has an H3 title using the same H1 formula

**Opening paragraph (first 60 words — AEO hero answer):**
> Not applicable in the traditional sense. The opening paragraph after H1 should be the **Story Header Card** — a structured data block, not a hero answer paragraph. The first body text sentence should draw the reader in: `"[Patient description] wasn't planning on traveling abroad for IVF. Then she got the US clinic quote."`

### Schema Markup

```json
{
  "@type": "Article",
  "@id": "PersonalBlogPosting",
  "headline": "[H1 text]",
  "author": { "@type": "Person", "name": "Anonymous Patient" },
  "datePublished": "[publish date ISO]",
  "dateModified": "[Page.updatedAt ISO date]",
  "about": { "@type": "MedicalProcedure", "name": "[Treatment]" },
  "description": "[metaDescription]"
}
```
```json
{
  "@type": "Review",
  "itemReviewed": { "@type": "MedicalClinic", "name": "[Clinic Name or 'Anonymized Clinic']" },
  "author": { "@type": "Person", "name": "Anonymous Patient" },
  "datePublished": "[treatment year ISO]",
  "reviewBody": "[Patient's 'Would They Do It Again' quote]",
  "reviewRating": { "@type": "Rating", "ratingValue": "[patient score if given]", "bestRating": "10" }
}
```
*(Only include `Review` if the patient provided a rating — do not fabricate a rating)*
```json
{ "@type": "BreadcrumbList", "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "/" },
    { "@type": "ListItem", "position": 2, "name": "Patient Stories", "item": "/patient-stories/" },
    { "@type": "ListItem", "position": 3, "name": "[Story title short form]", "item": "/patient-stories/[slug]/" }
  ]
}
```

### AEO & Featured Snippet Rules

- **No featured snippet target** — this is a narrative page, not a data page.
- **E-E-A-T signals:** Story is labeled as sourced from a MedCover interview. Include `"MedCover-verified patient experience"` badge.
- **Consent gate is absolute:** `PatientInterview.consentGiven` must be `true` before page is published.
- **Consent revocation:** Page must be **fully deleted** — not anonymized or replaced. No cached version retained.

### Content Template Payload

```json
{
  "name": "Patient Story Page",
  "description": "Narrative patient story sourced from MedCover interviews. Human-format. Requires explicit consent. Static after publish.",
  "contentType": "BLOG_POST",
  "requiredSections": {
    "sections": [
      "Breadcrumb (3-level: Home > Patient Stories > [Story Title])",
      "H1 — outcome-led, journey arc, no clinic name",
      "Story Header Card (structured: age range, origin, destination, treatment, outcome, cycles)",
      "Patient Bio — anonymous, origin country only, fertility journey duration",
      "The Full Story — narrative, interview-sourced, 800–1,200 words",
      "Key Data Points Callout Box (cost paid, clinic [if consented], cycles, wait time, outcome)",
      "What Surprised Them — hidden costs, unexpected positives, things to know",
      "Would They Do It Again? — direct pull-quote",
      "Clinic Referenced — linked card if consented, 'Clinic withheld per patient request' if not",
      "Related Stories (3 cards — same age range or destination)",
      "CTA: Share Your Story"
    ]
  },
  "headingStructure": {
    "H1": "[Compelling Outcome] — An IVF [Treatment] Journey from [Origin Country] to [Destination]",
    "H1_example": "First Cycle Success at 42 — An IVF Journey from the US to Barcelona",
    "H1_rules": [
      "Lead with outcome or compelling detail",
      "Include origin → destination arc",
      "Never use clinic name in H1 (consent issues)",
      "Never use patient's real name or identifying details"
    ],
    "H2s": [
      "About [Descriptive Patient Profile]",
      "The Story",
      "What Surprised [Her/Him/Them]",
      "Would [She/He/They] Do It Again?",
      "Related Patient Stories"
    ],
    "H3_story_beats": "Before the Decision | Choosing [Destination] | The Treatment Experience | The Outcome",
    "H3_surprises": "Hidden Costs | Unexpected Positives | Things to Know Before You Go",
    "H3_related": "Each related story card uses same H1 formula",
    "intro_note": "Opening paragraph is NOT a hero answer. It is a narrative hook: draw the reader in with the human context."
  },
  "seoRules": [
    "metaTitle: '[Compelling outcome] — IVF [Treatment] in [Destination] ([Year]) | MedCover Patient Stories' (max 60 chars)",
    "metaDescription: 130–155 chars. Include age range, origin, destination, outcome, one data point (cost or outcome)",
    "canonical: /patient-stories/[descriptive-slug]/",
    "robots: index, follow ONLY when PatientInterview.consentGiven = true",
    "sitemap: priority 0.6, changefreq: never (static after publish)",
    "OG image: abstract/illustrative only — never a patient photo",
    "Schema: Article (PersonalBlogPosting) + Review (if patient gave a rating) + BreadcrumbList",
    "Article.author = { @type: Person, name: 'Anonymous Patient' }",
    "CONSENT GATE: Do not publish without confirmed consent flag",
    "CONSENT REVOCATION: Full page deletion required — do not retain cached or anonymized version",
    "Story labeled with 'MedCover-verified patient experience' badge — visible on page",
    "Slug must be descriptive and outcome-led: 'ivf-spain-age-42-first-cycle-success' not 'story-123'"
  ],
  "faqStructure": {
    "count": "0 — no FAQ section",
    "note": "Patient stories are narrative pages. Adding FAQs would break the format and dilute E-E-A-T."
  },
  "internalLinkingRules": {
    "required": [
      "Clinic profile /clinics/[country]/[city]/[slug]/ if consented — OR city guide if anonymized",
      "3 related patient stories (same age range or destination)",
      "/guides/[country]-ivf-guide/ (destination guide)",
      "/patient-stories/ (story hub index)"
    ],
    "consent_rule": "Only link to clinic profile if patient explicitly consented to clinic identification."
  },
  "ctaPlacement": "Bottom: 'Share Your Story' → /start/",
  "formattingInstructions": "Story Header Card: structured data card — Age Range / Origin Country / Destination / Treatment / Outcome (Y/N) / Number of Cycles. Key Data Points Callout Box: sidebar-style box — Cost Paid / Clinic (or 'Anonymized') / Cycles / Wait Time / Outcome. Pull-quote styling for 'Would They Do It Again?' section. Related Stories: 3 cards using story header card format. Patient quote attribution: '[Age range] · [Origin country] · [Treatment] · [Destination] · [Year]'.",
  "isActive": true
}
```

---

## Template J — FAQ Hub Page

**URL:** `/faq/` | **Type:** `FAQ` | **Intent:** `INFORMATIONAL` | **Priority:** 0.9 | **~Words:** 1,800+

### SEO Blueprint

| Field | Formula / Value |
|-------|----------------|
| **metaTitle** | `IVF Abroad FAQ — 80+ Patient-Sourced Questions Answered \| MedCover` |
| **metaDescription** | `Comprehensive IVF abroad FAQ: real costs, clinic selection, egg donation law, travel logistics, and success rates. Sourced from patient interviews. Updated monthly.` |
| **Canonical** | `/faq/` |
| **Robots** | `index, follow` |
| **Sitemap** | `priority: 0.9` · `changefreq: monthly` |
| **OG Title** | `IVF Abroad FAQ: 80+ Questions Answered with Verified Patient Data` |
| **OG Description** | `From cost breakdowns to egg donation law to how many trips you'll need — MedCover answers the questions real patients ask.` |
| **OG Image** | `/og/faq-hub.png` (1200×630) |
| **Twitter Card** | `summary_large_image` |
| **Hreflang** | `en` |

### Heading Architecture

**H1:** `IVF Abroad FAQ — [N]+ Questions Answered with Verified Patient Data`
- Dynamic question count (update as FAQ grows).
- "Verified Patient Data" is the E-E-A-T differentiator — never remove it.

**H2s — one per category (anchor-linked):**

| # | H2 Text | Anchor ID | Question Count |
|---|---------|-----------|----------------|
| 1 | `IVF Abroad: The Basics` | `#ivf-basics` | 12 |
| 2 | `IVF in Spain` | `#spain` | 8 |
| 3 | `IVF in Greece` | `#greece` | 8 |
| 4 | `IVF in Czech Republic` | `#czech-republic` | 6 |
| 5 | `IVF Costs & Hidden Fees` | `#costs` | 10 |
| 6 | `Choosing a Clinic` | `#clinic-selection` | 8 |
| 7 | `Egg Donation Law by Country` | `#egg-donation-law` | 8 |
| 8 | `Travel & Logistics` | `#travel` | 8 |
| 9 | `Success Rates & Lab Quality` | `#success-rates` | 8 |
| 10 | `About MedCover` | `#medicalvera` | 6 |

**H3 patterns:**
- Every FAQ question is an H3. ID format: `id="what-is-ivf-cost-spain"` (kebab-case from question text).
- H3 IDs must be **stable after publication** — external sites link to these anchors.
- Do not change H3 IDs after going live. Add new questions instead of renaming existing ones.

**Opening paragraph (first 60 words — AEO intro):**
> `This FAQ covers [N]+ questions about IVF abroad, sourced from real patient interviews conducted by MedCover. Topics include costs, clinic selection, egg donation law, travel logistics, success rates, and country-specific guidance for Spain, Greece, and Czech Republic. Each answer cites MedCover interview data or authoritative medical sources.`

### Schema Markup

```json
{
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "[Exact question text as written in H3]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Full answer text — must match visible page content exactly]"
      }
    }
  ]
}
```
*(One FAQPage schema per category, or combine into one — Google accepts both; per-category is easier to manage)*
```json
{ "@type": "BreadcrumbList", "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "/" },
    { "@type": "ListItem", "position": 2, "name": "FAQ", "item": "/faq/" }
  ]
}
```
```json
{ "@type": "SpeakableSpecification", "cssSelector": ".speakable-answer" }
```
*(Apply `.speakable-answer` class to the top 5 highest-traffic FAQ answers)*

### AEO & Featured Snippet Rules

- **This is the most important AEO page on the site.** Every answer is a direct AI Overview or featured snippet candidate.
- **Per-answer AEO rules (mandatory for every answer):**
  1. First sentence = direct answer (subject-verb-object, no hedging)
  2. Total answer: 60–120 words
  3. Cite MedCover data: `"Based on [N] patient interviews..."` where applicable
  4. At least 1 internal link per answer
  5. Answers with data: include a short table or list
- **Top 5 speakable answers:** Apply `.speakable-answer` class + `SpeakableSpecification` schema to the 5 highest-traffic questions (determined by GSC impression data).
- **H3 ID stability:** Never rename H3 IDs after publication. External links and Google's anchor indexing depend on these.

### Content Template Payload

```json
{
  "name": "FAQ Hub Page",
  "description": "The central AEO hub for the site. 80+ patient-sourced Q&As, anchor-linked by category. Primary AI Overview and featured snippet target.",
  "contentType": "FAQ",
  "requiredSections": {
    "sections": [
      "Breadcrumb (2-level: Home > FAQ)",
      "H1 + Intro paragraph (2–3 sentences, dynamic question count)",
      "Anchor Navigation (sticky, links to all 10 category sections)",
      "#ivf-basics — IVF Abroad Basics (12 Q&As)",
      "#spain — Spain-Specific (8 Q&As)",
      "#greece — Greece-Specific (8 Q&As)",
      "#czech-republic — Czech Republic-Specific (6 Q&As)",
      "#costs — Cost & Hidden Fees (10 Q&As)",
      "#clinic-selection — Choosing a Clinic (8 Q&As)",
      "#egg-donation-law — Legal & Ethical (8 Q&As)",
      "#travel — Travel & Logistics (8 Q&As)",
      "#success-rates — Success Rates & Lab Quality (8 Q&As)",
      "#medicalvera — About MedCover Platform (6 Q&As)"
    ]
  },
  "headingStructure": {
    "H1": "IVF Abroad FAQ — [N]+ Questions Answered with Verified Patient Data",
    "H1_rules": [
      "Dynamic question count — update as FAQ grows",
      "'Verified Patient Data' differentiator must remain in H1",
      "Do not use 'Ultimate', 'Complete', 'Comprehensive' — clichés"
    ],
    "H2s": [
      "IVF Abroad: The Basics (#ivf-basics)",
      "IVF in Spain (#spain)",
      "IVF in Greece (#greece)",
      "IVF in Czech Republic (#czech-republic)",
      "IVF Costs & Hidden Fees (#costs)",
      "Choosing a Clinic (#clinic-selection)",
      "Egg Donation Law by Country (#egg-donation-law)",
      "Travel & Logistics (#travel)",
      "Success Rates & Lab Quality (#success-rates)",
      "About MedCover (#medicalvera)"
    ],
    "H3_rule": "Every FAQ question is an H3. ID: kebab-case from question text. ID must be stable after publication.",
    "intro_rule": "2–3 sentences. State total question count, data source (patient interviews), and topic coverage. No preamble."
  },
  "seoRules": [
    "metaTitle: 'IVF Abroad FAQ — 80+ Patient-Sourced Questions Answered | MedCover' (max 60 chars)",
    "metaDescription: 130–155 chars. Mention question count, topics (costs, legal, travel), 'patient interviews', 'updated monthly'",
    "canonical: /faq/",
    "robots: index, follow",
    "sitemap: priority 0.9, changefreq monthly",
    "OG image: /og/faq-hub.png at 1200×630px",
    "Schema: FAQPage (per category or combined) + BreadcrumbList + SpeakableSpecification on top 5 answers",
    "FAQPage.mainEntity: question text must match H3 text EXACTLY",
    "H3 ID format: id='[kebab-case-of-question]' — STABLE after publication",
    "Per-answer AEO rule: (1) direct first sentence (2) 60-120 words (3) 1 internal link (4) cite MedCover data",
    "Top 5 speakable: apply .speakable-answer class + SpeakableSpecification targeting css selector",
    "Anchor nav: sticky at top, links to all 10 category sections"
  ],
  "faqStructure": {
    "count": "82 total (12+8+8+6+10+8+8+8+8+6)",
    "answer_format": "First sentence = direct answer. 60–120 words. At least 1 internal link. Cite 'Based on [N] interviews' when using MedCover data.",
    "categories": {
      "#ivf-basics": 12,
      "#spain": 8,
      "#greece": 8,
      "#czech-republic": 6,
      "#costs": 10,
      "#clinic-selection": 8,
      "#egg-donation-law": 8,
      "#travel": 8,
      "#success-rates": 8,
      "#medicalvera": 6
    }
  },
  "internalLinkingRules": {
    "rule": "Every answer must link to at least one relevant page. FAQ is one of the primary internal link distribution hubs.",
    "priority_links": [
      "Country guides from country-specific sections (#spain, #greece, #czech-republic)",
      "Clinic profiles from #clinic-selection section",
      "Cost pages from #costs section",
      "Treatment pages from #ivf-basics section",
      "Compare pages from country comparison questions"
    ]
  },
  "ctaPlacement": "No bottom CTA — this is a utility page. Each category section ends with: 'Read the full guide: [relevant guide link]'",
  "formattingInstructions": "Anchor nav: sticky at page top, links to all 10 category H2 anchors, shows question count per section (e.g. 'IVF Basics — 12 questions'). FAQ accordion: questions expand/collapse. First question in each section: pre-expanded. Speakable answers: badge 'Voice-optimized' (cosmetic). Tables and short lists allowed within answers. Each section ends with 'Read more' link to relevant hub page.",
  "isActive": true
}
```

---

## Template K — For Clinics / B2B Landing Page

**URL:** `/for-clinics/` | **Type:** `LANDING_PAGE` | **Intent:** `COMMERCIAL` | **Priority:** 0.3 | **~Words:** 1,200

### SEO Blueprint

| Field | Formula / Value |
|-------|----------------|
| **metaTitle** | `Verified Patient Data for IVF Clinics — Stand Out from Fake Reviews \| MedCover` |
| **metaDescription** | `MedCover gives IVF clinics verified patient truth scores, lead generation, and review legitimacy — not paid rankings. Join the platform built for patient trust.` |
| **Canonical** | `/for-clinics/` |
| **Robots** | `index, follow` |
| **Sitemap** | `priority: 0.3` · `changefreq: rarely` |
| **OG Title** | `MedCover for IVF Clinics: Verified Patient Truth, Not Pay-to-Play Rankings` |
| **OG Description** | `Stand out from fake reviews with MedCover's verified patient interview program. Truth Score, lead gen, and clinic profile claiming.` |
| **OG Image** | `/og/for-clinics.png` (1200×630) |
| **Twitter Card** | `summary_large_image` |
| **Hreflang** | `en` |

### Heading Architecture

**H1:** `Stand Out in a Sea of Fake Reviews — Verified Patient Truth for IVF Clinics`
- Speak directly to clinic administrators' pain point.
- "Verified Patient Truth" is the value proposition.
- Do not use the word "Best" or any pricing in H1.

**H2s — ordered list:**

| # | H2 Text | Purpose |
|---|---------|---------|
| 1 | `What 'MedCover Verified' Means for Your Clinic` | Value explanation, trust signal |
| 2 | `The Problem: Fake Reviews Are Costing You Patients` | Pain point, emotion |
| 3 | `How MedCover Works for Clinics` | 3-step process, objection handling |
| 4 | `MedCover Clinic Products` | Product menu, conversion section |
| 5 | `What Clinics Say About MedCover` | Social proof / testimonials |
| 6 | `Frequently Asked Questions for Clinics` | FAQPage schema, objection handling |

**H3 patterns:**
- Within How It Works (H2 #3): `Step 1: Claim Your Clinic Profile`, `Step 2: Patients Are Interviewed`, `Step 3: Your Truth Score Goes Live`
- Within Products (H2 #4): each product as H3: `MedCover Truth Score Badge`, `Verified Lead Generation`, `Verification as a Service (VaaS)`, `Truth Report Claiming`
- Each FAQ: clinic-specific objection phrasing, e.g. `Is MedCover a paid review platform?`

**Opening paragraph (first 60 words — value proposition):**
> `Patients increasingly distrust online reviews. MedCover replaces self-written star ratings with structured AI-conducted patient interviews — scored, verified, and published only after a minimum of 5 interviews. Clinics on MedCover earn a Truth Score based on what patients actually experienced, not what the clinic paid to advertise.`

### Schema Markup

```json
{
  "@type": "Service",
  "name": "MedCover Verification as a Service",
  "description": "Verified patient interview program for IVF clinics. Produces Truth Scores from structured AI-conducted patient interviews.",
  "provider": { "@type": "Organization", "name": "MedCover" },
  "serviceType": "Healthcare Reputation Verification",
  "areaServed": "Europe"
}
```
```json
{
  "@type": "Service",
  "name": "MedCover Lead Generation for IVF Clinics",
  "description": "Verified patient lead generation for IVF clinics listed on MedCover.",
  "provider": { "@type": "Organization", "name": "MedCover" }
}
```
```json
{
  "@type": "Organization",
  "name": "MedCover",
  "url": "https://medcover.com",
  "logo": "https://medcover.com/logo.png",
  "description": "Patient-verified IVF clinic data platform. Not a review site — structured interview data.",
  "contactPoint": { "@type": "ContactPoint", "contactType": "Business enquiries", "email": "clinics@medcover.com" }
}
```
```json
{ "@type": "FAQPage", "mainEntity": [...] }
```
```json
{ "@type": "BreadcrumbList", "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "/" },
    { "@type": "ListItem", "position": 2, "name": "For Clinics", "item": "/for-clinics/" }
  ]
}
```

### AEO & Featured Snippet Rules

- **This page is conversion-focused, not traffic-focused.** Do not sacrifice conversion copy for AEO optimization.
- **Primary search intent:** branded (`medcover for clinics`) and navigational. Not a featured snippet candidate.
- **FAQ section (H2 #6):** FAQPage schema is still important — clinic administrators search these exact questions when evaluating vendor options.
- **No SpeakableSpecification** on this template — it is a B2B product page, not a patient-facing content page.

### Content Template Payload

```json
{
  "name": "For Clinics B2B Landing Page",
  "description": "B2B landing page for clinic administrators. Conversion-focused. Low SEO traffic priority.",
  "contentType": "LANDING_PAGE",
  "requiredSections": {
    "sections": [
      "Breadcrumb (2-level: Home > For Clinics)",
      "H1 + Value Proposition Paragraph (60 words, explain MedCover's differentiation from fake reviews)",
      "What 'MedCover Verified' Means — 3-point explanation",
      "The Problem: Fake Reviews Are Costing You Patients — 2-column reality table",
      "How MedCover Works for Clinics — 3-step numbered process",
      "MedCover Clinic Products — pricing card layout per product",
      "Pricing Overview CTA → /for-clinics/pricing/",
      "What Clinics Say About MedCover — testimonial quote cards",
      "FAQ (6 questions, clinic-facing objection handling)",
      "CTA: Claim Your Clinic Profile"
    ]
  },
  "headingStructure": {
    "H1": "Stand Out in a Sea of Fake Reviews — Verified Patient Truth for IVF Clinics",
    "H1_rules": [
      "Speaks to clinic administrator's pain point",
      "'Verified Patient Truth' is the value proposition — do not modify",
      "No pricing in H1",
      "No superlatives ('best', 'leading')"
    ],
    "H2s": [
      "What 'MedCover Verified' Means for Your Clinic",
      "The Problem: Fake Reviews Are Costing You Patients",
      "How MedCover Works for Clinics",
      "MedCover Clinic Products",
      "What Clinics Say About MedCover",
      "Frequently Asked Questions for Clinics"
    ],
    "H3_steps": "Step 1: Claim Your Clinic Profile | Step 2: Patients Are Interviewed | Step 3: Your Truth Score Goes Live",
    "H3_products": "MedCover Truth Score Badge | Verified Lead Generation | Verification as a Service (VaaS) | Truth Report Claiming",
    "H3_faq": "Clinic-specific objection phrasing as a question",
    "intro_rule": "60 words. State MedCover's core differentiator from traditional review platforms. Mention AI-conducted interviews, 5-interview minimum, Truth Score. Business tone, not patient-facing tone."
  },
  "seoRules": [
    "metaTitle: 'Verified Patient Data for IVF Clinics — Stand Out from Fake Reviews | MedCover' (max 60 chars)",
    "metaDescription: 130–155 chars. Mention Truth Score, lead gen, not pay-to-play, 'built for patient trust'",
    "canonical: /for-clinics/",
    "robots: index, follow",
    "sitemap: priority 0.3, changefreq rarely",
    "OG image: /og/for-clinics.png at 1200×630px",
    "Schema: Service x2 (VaaS + Lead Gen) + Organization + FAQPage + BreadcrumbList",
    "No SpeakableSpecification — B2B product page, not AEO target",
    "This page is conversion-first: do not sacrifice copy clarity for keyword density",
    "Pricing: teaser only on this page, link to /for-clinics/pricing/ for full pricing"
  ],
  "faqStructure": {
    "count": "6 questions",
    "source": "Clinic administrator objection handling",
    "answer_format": "First sentence = direct answer. 60–100 words. Business tone. Link to relevant internal page where available.",
    "required_topics": [
      "Is MedCover a paid review platform?",
      "How does MedCover verify patient interviews?",
      "Can I respond to my clinic's Truth Report?",
      "What is included in the Verified Badge?",
      "How does the lead generation product work?",
      "How much does MedCover cost for clinics?"
    ]
  },
  "internalLinkingRules": {
    "required": [
      "/for-clinics/pricing/ (pricing page)",
      "/truth-score/ (scoring methodology)",
      "/ai-interviewer/ (interview methodology)",
      "Sample clinic profile — link to highest Truth Score clinic as example"
    ]
  },
  "ctaPlacement": "Two CTAs: (1) Hero section below H1 — 'Claim Your Clinic Profile' → /for-clinics/claim/. (2) Bottom of page — same CTA.",
  "formattingInstructions": "Hero: H1 + subheadline (1 sentence) + single primary CTA button. Problem section: 2-column table 'Fake Reviews vs MedCover Verified' (5 rows). How It Works: 3-step numbered cards with icon, step number, title, 2-sentence description. Products: pricing-card layout, 4 cards (one per product), feature list, 'Learn More' link per card. Social proof: quote cards — name, title, clinic name (with consent). FAQ: accordion.",
  "isActive": true
}
```

---

## Clinic Inventory Integration Architecture

The `clinic-inventory` app is the **data source** for Templates B, G, A, A2, and D. Data flows as follows:

```
clinic-inventory
  └─ ClinicTruthScore.scoreValue, dimensionScores
  └─ PatientInterview (isPublished=true)
  └─ InterviewAnswer.answerText (by dimension)
  └─ ClinicPricingPackage.priceMin/priceMax
  └─ Clinic.name, slug, city, country, languagesSpoken
        │
        │  POST /api/v1/clinic-inventory/webhook
        ▼
traffic-engine-backend
  └─ Page.knowledgeFacts (JSON from webhook payload)
  └─ SeoBriefBuilder extracts knowledgeFacts from site.config
  └─ GenerationService injects into prompt runtime context
  └─ PromptCompositionEngineService composes the final prompt
        │
        ▼
  Page.finalContent → GET /api/v1/content/by-slug/* → Next.js frontend
```

### Webhook Payload Contract

When a clinic's Truth Score is recalculated or interviews are published, clinic-inventory fires to `/api/v1/clinic-inventory/webhook`. This triggers re-queuing of the clinic's Template B page and Template G report.

```json
{
  "event": "clinic.truth_score_updated",
  "clinicSlug": "instituto-marques",
  "clinicName": "Instituto Marqués",
  "countryCode": "es",
  "citySlug": "barcelona",
  "truthScore": {
    "scoreValue": 84,
    "gradeLabel": "B",
    "interviewCount": 12,
    "lastCalculatedAt": "2026-05-19T00:00:00Z",
    "dimensionScores": {
      "cost_transparency": 79,
      "english_proficiency": 88,
      "outcome_communication": 82,
      "hidden_fees": 71,
      "staff_quality": 90,
      "lab_transparency": 85,
      "logistics_support": 76,
      "wait_time": 80,
      "emotional_support": 83,
      "value_for_money": 78
    }
  },
  "pricingPackages": [
    { "treatmentType": "IVF", "priceMin": 5500, "priceMax": 7200, "currency": "EUR" },
    { "treatmentType": "EGG_DONATION", "priceMin": 7800, "priceMax": 10500, "currency": "EUR" },
    { "treatmentType": "PGT_A", "priceMin": 1200, "priceMax": 2000, "currency": "EUR" }
  ],
  "recentInterviewExcerpts": [
    {
      "dimension": "hidden_fees",
      "text": "They quoted us €7,200 all-in. The final bill was €8,950. The clinic never mentioned the anesthesiologist fee.",
      "patientProfile": "34–38, United States",
      "interviewDate": "2025-11"
    }
  ]
}
```

---

## Template-to-Subject Mapping

When creating `Subject` records in the traffic engine, link them to the correct `ContentTemplate`:

| Subject Type | Template | `contentType` | `searchIntent` | Example `primaryKeywords` |
|-------------|----------|---------------|----------------|--------------------------|
| Country hub | A | `LANDING_PAGE` | `COMMERCIAL` | `["ivf in spain", "spain ivf guide"]` |
| City guide | A2 | `CITY_PAGE` | `COMMERCIAL` | `["ivf in barcelona", "barcelona ivf clinics"]` |
| Clinic profile | B | `LANDING_PAGE` | `COMMERCIAL` | `["instituto marques review", "instituto marques ivf"]` |
| Country comparison | C | `COMPARISON` | `COMMERCIAL` | `["spain vs greece ivf", "ivf spain or greece"]` |
| Cost page | D | `LANDING_PAGE` | `INFORMATIONAL` | `["ivf cost spain 2026", "how much does ivf cost in spain"]` |
| Treatment entity | E | `ARTICLE` | `INFORMATIONAL` | `["what is ivf", "ivf treatment abroad"]` |
| Origin journey | F | `LANDING_PAGE` | `INFORMATIONAL` | `["ivf abroad for us patients", "ivf overseas from usa"]` |
| Truth Report | G | `ARTICLE` | `NAVIGATIONAL` | `["instituto marques patient review", "instituto marques truth report"]` |
| Patient story | H | `BLOG_POST` | `INFORMATIONAL` | `["ivf success story spain", "egg donation barcelona experience"]` |
| FAQ Hub | J | `FAQ` | `INFORMATIONAL` | `["ivf abroad faq", "ivf abroad questions answered"]` |
| B2B clinics | K | `LANDING_PAGE` | `COMMERCIAL` | `["ivf clinic review platform", "verified patient reviews ivf"]` |
