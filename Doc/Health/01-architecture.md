# MedicalVera.com — Site Architecture

## URL Taxonomy (Full Hierarchy)

```
medicalvera.com/
│
├── [PATIENT-FACING CONTENT HUBS]
│
├── /guides/                                        ← Hub: Country + City Destination Guides
│   │
│   ├── /guides/spain-ivf-guide/                   ← Country hub (pillar)
│   │   ├── /guides/spain/barcelona-ivf-guide/     ← City guide (spoke)
│   │   ├── /guides/spain/madrid-ivf-guide/
│   │   ├── /guides/spain/alicante-ivf-guide/
│   │   ├── /guides/spain/valencia-ivf-guide/
│   │   ├── /guides/spain/seville-ivf-guide/
│   │   └── /guides/spain/marbella-ivf-guide/
│   │
│   ├── /guides/greece-ivf-guide/                  ← Country hub
│   │   ├── /guides/greece/athens-ivf-guide/
│   │   └── /guides/greece/thessaloniki-ivf-guide/
│   │
│   ├── /guides/czech-republic-ivf-guide/          ← Country hub
│   │   ├── /guides/czech-republic/prague-ivf-guide/
│   │   └── /guides/czech-republic/brno-ivf-guide/
│   │
│   └── /guides/cyprus-ivf-guide/                  ← Country hub
│       ├── /guides/cyprus/nicosia-ivf-guide/
│       └── /guides/cyprus/limassol-ivf-guide/
│
├── /clinics/                                       ← Hub: Clinic Directory
│   ├── /clinics/spain/                             ← Country index
│   │   ├── /clinics/spain/barcelona/               ← City index
│   │   │   └── /clinics/spain/barcelona/[clinic-slug]/
│   │   ├── /clinics/spain/madrid/
│   │   │   └── /clinics/spain/madrid/[clinic-slug]/
│   │   ├── /clinics/spain/alicante/
│   │   │   └── /clinics/spain/alicante/[clinic-slug]/
│   │   ├── /clinics/spain/valencia/
│   │   │   └── /clinics/spain/valencia/[clinic-slug]/
│   │   └── /clinics/spain/seville/
│   │       └── /clinics/spain/seville/[clinic-slug]/
│   ├── /clinics/greece/
│   │   ├── /clinics/greece/athens/
│   │   │   └── /clinics/greece/athens/[clinic-slug]/
│   │   └── /clinics/greece/thessaloniki/
│   │       └── /clinics/greece/thessaloniki/[clinic-slug]/
│   └── /clinics/czech-republic/
│       ├── /clinics/czech-republic/prague/
│       │   └── /clinics/czech-republic/prague/[clinic-slug]/
│       └── /clinics/czech-republic/brno/
│           └── /clinics/czech-republic/brno/[clinic-slug]/
│
├── /compare/                                       ← Hub: Comparison Engine
│   ├── [COUNTRY vs COUNTRY]
│   │   ├── /compare/spain-vs-greece-ivf/
│   │   ├── /compare/spain-vs-czech-republic-ivf/
│   │   ├── /compare/spain-vs-usa-ivf/
│   │   ├── /compare/spain-vs-uk-ivf/
│   │   ├── /compare/greece-vs-czech-republic-ivf/
│   │   └── /compare/ivf-abroad-vs-staying-home/
│   │
│   ├── [CITY vs CITY — same country]
│   │   ├── /compare/barcelona-vs-madrid-ivf/
│   │   ├── /compare/barcelona-vs-alicante-ivf/
│   │   └── /compare/athens-vs-prague-ivf/
│   │
│   ├── [CITY vs CITY — cross country]
│   │   ├── /compare/barcelona-vs-athens-ivf/
│   │   └── /compare/barcelona-vs-prague-ivf/
│   │
│   └── [CLINIC vs CLINIC]
│       └── /compare/clinics/[clinic-a]-vs-[clinic-b]/
│
├── /costs/                                         ← Hub: Cost Transparency
│   ├── [COUNTRY LEVEL]
│   │   ├── /costs/spain-ivf-cost-2026/
│   │   ├── /costs/greece-ivf-cost-2026/
│   │   └── /costs/czech-republic-ivf-cost-2026/
│   │
│   ├── [CITY LEVEL]
│   │   ├── /costs/barcelona-ivf-cost-2026/
│   │   ├── /costs/madrid-ivf-cost-2026/
│   │   ├── /costs/alicante-ivf-cost-2026/
│   │   └── /costs/athens-ivf-cost-2026/
│   │
│   └── [TREATMENT × COUNTRY]
│       ├── /costs/egg-donation-spain-cost-2026/
│       ├── /costs/egg-donation-greece-cost-2026/
│       └── /costs/[treatment]-[country]-cost-[year]/
│
├── /treatments/                                    ← Hub: Treatment Glossary (Entity Pages)
│   ├── /treatments/ivf/
│   ├── /treatments/egg-donation/
│   ├── /treatments/sperm-donation/
│   ├── /treatments/embryo-adoption/
│   ├── /treatments/iui/
│   └── /treatments/genetic-testing-pgta/
│
├── /from/                                          ← Hub: Origin Patient Journeys
│   ├── /from/usa/ivf-abroad/
│   ├── /from/uk/ivf-abroad/
│   └── /from/canada/ivf-abroad/
│
├── /reports/                                       ← Hub: Truth Reports
│   └── /reports/[clinic-slug]-patient-truth-report/
│
├── /patient-stories/                               ← Hub: Patient Narratives
│   └── /patient-stories/[story-slug]/
│
├── /resources/                                     ← Hub: Editorial Blog
│   ├── /resources/ivf/
│   │   └── /resources/ivf/[article-slug]/
│   ├── /resources/egg-donation/
│   │   └── /resources/egg-donation/[article-slug]/
│   ├── /resources/medical-travel/
│   │   └── /resources/medical-travel/[article-slug]/
│   └── /resources/legal-financial/
│       └── /resources/legal-financial/[article-slug]/
│
├── /faq/                                           ← AEO Power Page
│
├── [PLATFORM / PRODUCT PAGES]
│
├── /truth-score/
├── /ai-interviewer/
├── /how-it-works/
├── /about/
├── /contact/
│
├── [INTERVIEW FLOW] (mostly noindex)
│
├── /start/                                         ← Interview intake (indexed)
├── /interview/                                     ← AI session UI (noindex)
├── /interview/verify/[token]/                      ← Email verification (noindex)
├── /interview/complete/                            ← Post-interview (noindex)
│
├── [B2B PAGES]
│
├── /for-clinics/
├── /for-clinics/pricing/
├── /for-clinics/verification-as-a-service/
├── /for-clinics/claim-profile/                     ← noindex after submit
│
├── [LEGAL / COMPLIANCE]
│
├── /privacy/
├── /terms/
├── /cookie-policy/
├── /data-processing-agreement/
├── /interview-consent/
├── /data-deletion-request/
│
└── [UTILITY]
    ├── /newsletter/                                ← noindex
    ├── /sitemap/                                   ← HTML sitemap
    └── /search/                                    ← noindex
```

---

## City Pages — Why & What

City-level keywords are high-intent and have real search volume:
- "IVF clinics Barcelona" / "IVF Barcelona cost"
- "fertility treatment Madrid" / "egg donation Athens"
- "IVF Prague" / "best IVF clinic Alicante"

City pages sit **below** country guides in authority hierarchy but **above** individual clinic profiles. They aggregate clinic data at the city level and capture city-specific queries.

### Priority Cities by Phase

| Phase | Country | Cities |
|---|---|---|
| Phase 1 | Spain | Barcelona, Madrid, Alicante |
| Phase 2 | Spain | Valencia, Seville, Marbella |
| Phase 2 | Greece | Athens, Thessaloniki |
| Phase 3 | Czech Republic | Prague, Brno |
| Phase 3 | Cyprus | Nicosia, Limassol |

---

## Slug Patterns (Complete Reference Table)

| Page Type | Pattern | Example |
|---|---|---|
| Country guide | `/guides/[country]-ivf-guide/` | `/guides/spain-ivf-guide/` |
| City guide | `/guides/[country]/[city]-ivf-guide/` | `/guides/spain/barcelona-ivf-guide/` |
| Country clinic index | `/clinics/[country]/` | `/clinics/spain/` |
| City clinic index | `/clinics/[country]/[city]/` | `/clinics/spain/barcelona/` |
| Clinic profile | `/clinics/[country]/[city]/[clinic-slug]/` | `/clinics/spain/barcelona/instituto-marques/` |
| Country vs country | `/compare/[a]-vs-[b]-ivf/` | `/compare/spain-vs-greece-ivf/` |
| Country vs origin | `/compare/[country]-vs-[origin]-ivf/` | `/compare/spain-vs-usa-ivf/` |
| City vs city | `/compare/[city-a]-vs-[city-b]-ivf/` | `/compare/barcelona-vs-madrid-ivf/` |
| Clinic vs clinic | `/compare/clinics/[a]-vs-[b]/` | `/compare/clinics/instituto-marques-vs-ivi-barcelona/` |
| Country cost | `/costs/[country]-ivf-cost-[year]/` | `/costs/spain-ivf-cost-2026/` |
| City cost | `/costs/[city]-ivf-cost-[year]/` | `/costs/barcelona-ivf-cost-2026/` |
| Treatment × country cost | `/costs/[treatment]-[country]-cost-[year]/` | `/costs/egg-donation-spain-cost-2026/` |
| Treatment page | `/treatments/[treatment]/` | `/treatments/egg-donation/` |
| Origin guide | `/from/[country]/ivf-abroad/` | `/from/usa/ivf-abroad/` |
| Truth report | `/reports/[clinic-slug]-patient-truth-report/` | `/reports/instituto-marques-patient-truth-report/` |
| Patient story | `/patient-stories/[descriptive-slug]/` | `/patient-stories/ivf-spain-age-42-success/` |
| Resource article | `/resources/[category]/[article-slug]/` | `/resources/ivf/what-is-egg-donation/` |

### Slug Rules
- Lowercase, hyphen-separated only — no underscores, no spaces
- Trailing slash: choose one convention and enforce globally (recommendation: always trailing slash)
- No query parameters in canonical URLs
- No ISO country codes — use full country name slugs (`spain` not `es`)
- City slugs: use common English name (`thessaloniki` not `salonika`)
- Year in cost pages: include year for freshness; 301-redirect old year → new year on update
- Clinic slugs: use official short name, not full legal name; must be unique in slug space
- Reverse comparison URLs 301-redirect to canonical direction (`/compare/madrid-vs-barcelona-ivf/` → `/compare/barcelona-vs-madrid-ivf/`)

---

## Navigation Structure

### Primary Navigation (desktop — visible on all pages)
```
[Logo]  How It Works | Destinations ▾ | Clinics ▾ | Compare ▾ | Costs | Resources   [Language ▾]  [CTA: Share Your Story]
```

**Destinations dropdown (groups by country → shows top cities):**
```
Spain
  ├── Spain IVF Guide
  ├── Barcelona IVF Guide
  └── Madrid IVF Guide
Greece
  └── Greece IVF Guide
Czech Republic
  └── Czech Republic IVF Guide
```

**Clinics dropdown:**
```
Spain Clinics
  ├── Barcelona Clinics
  └── Madrid Clinics
Greece Clinics
  └── Athens Clinics
Czech Republic Clinics
  └── Prague Clinics
[Search all clinics]
```

**Compare dropdown:**
```
Country Comparisons
  ├── Spain vs Greece
  └── Spain vs Czech Republic
City Comparisons
  ├── Barcelona vs Madrid
  └── Barcelona vs Athens
```

**Language switcher (top-right):**
```
[EN ▾]
  English (default)
  Español (Phase 2)
  Ελληνικά (Phase 3)
  Čeština (Phase 3)
```

### Mobile Navigation
Hamburger menu → full-screen overlay with same structure collapsed into accordions by country.

### Footer Navigation (4 columns)

**Column 1: For Patients**
- How It Works
- Share Your Story
- Patient Stories
- FAQ
- Resources

**Column 2: Destinations**
- Spain IVF Guide
  - Barcelona · Madrid · Alicante
- Greece IVF Guide
  - Athens
- Czech Republic IVF Guide
  - Prague

**Column 3: Tools**
- Truth Score
- Compare Countries
- Compare Cities
- Cost Breakdown
- Clinic Directory

**Column 4: Platform**
- AI Interviewer
- For Clinics
- About MedicalVera
- Contact

**Legal row (below columns):**
Privacy Policy | Terms of Service | Cookie Policy | Data Deletion Request | Affiliate Disclosure

---

## Breadcrumb Pattern (required on all depth pages)

```
Home > [Hub] > [Sub-level] > [Current page]
```

| Page | Breadcrumb |
|---|---|
| Country guide | `Home > Destinations > Spain IVF Guide` |
| City guide | `Home > Destinations > Spain IVF Guide > Barcelona IVF Guide` |
| City clinic index | `Home > Clinics > Spain > Barcelona` |
| Clinic profile | `Home > Clinics > Spain > Barcelona > Instituto Marqués` |
| Country cost | `Home > Costs > Spain IVF Cost 2026` |
| City cost | `Home > Costs > Barcelona IVF Cost 2026` |
| Country comparison | `Home > Compare > Spain vs Greece IVF` |
| City comparison | `Home > Compare > Barcelona vs Madrid IVF` |
| Treatment | `Home > Treatments > IVF` |
| Resource article | `Home > Resources > IVF > [Article Title]` |

---

## Sitemap Architecture

### Sitemap Index: `/sitemap.xml`
```xml
<sitemapindex>
  <sitemap><loc>https://medicalvera.com/sitemap-core.xml</loc></sitemap>
  <sitemap><loc>https://medicalvera.com/sitemap-country-guides.xml</loc></sitemap>
  <sitemap><loc>https://medicalvera.com/sitemap-city-guides.xml</loc></sitemap>
  <sitemap><loc>https://medicalvera.com/sitemap-clinics.xml</loc></sitemap>
  <sitemap><loc>https://medicalvera.com/sitemap-compare.xml</loc></sitemap>
  <sitemap><loc>https://medicalvera.com/sitemap-costs.xml</loc></sitemap>
  <sitemap><loc>https://medicalvera.com/sitemap-treatments.xml</loc></sitemap>
  <sitemap><loc>https://medicalvera.com/sitemap-reports.xml</loc></sitemap>
  <sitemap><loc>https://medicalvera.com/sitemap-stories.xml</loc></sitemap>
  <sitemap><loc>https://medicalvera.com/sitemap-resources.xml</loc></sitemap>
  <!-- Phase 2+ -->
  <sitemap><loc>https://medicalvera.com/es/sitemap.xml</loc></sitemap>
</sitemapindex>
```

### Priority Scale

| Priority | Pages |
|---|---|
| `1.0` | Home `/` |
| `0.9` | Country guides, `/faq/`, `/truth-score/`, `/ai-interviewer/` |
| `0.85` | City guides (top cities: Barcelona, Madrid, Athens, Prague) |
| `0.8` | Country cost pages, country comparison pages, treatment pages, `/from/*/` |
| `0.75` | City cost pages, city comparison pages |
| `0.7` | Clinic profiles, city clinic indexes, country clinic indexes |
| `0.6` | Truth reports, patient stories |
| `0.5` | Resource/blog articles |
| `0.3` | `/for-clinics/`, `/about/`, `/contact/`, `/start/` |
| `noindex` | All `/interview/*`, `/newsletter/`, `/search/`, legal compliance forms |

### Change Frequency

| Page Type | `changefreq` |
|---|---|
| Country guides | `monthly` |
| City guides | `monthly` |
| Clinic profiles | `monthly` |
| Truth reports | `monthly` |
| Cost pages (country + city) | `monthly` |
| Comparison pages | `monthly` |
| Treatment pages | `yearly` |
| Resources/blog | `monthly` |

### HTML Sitemap: `/sitemap/`
Human-readable, organized by category and country → city hierarchy.

---

## Internal Linking Topology

### Hub → Spoke Rules (mandatory per template)

| Hub | Must link to |
|---|---|
| Country guide | Country cost page, top 3 city guides, city cost pages, top 5 clinic profiles, 1 comparison page, treatment pages |
| City guide | Parent country guide, city clinic index, city cost page, 1 city comparison, top 3 clinics in city |
| Country clinic index | Country guide, all city indexes in that country |
| City clinic index | Parent country clinic index, city guide, city cost page, all clinic profiles in that city |
| Clinic profile | City clinic index → country clinic index → country guide, city guide, truth report, 2 competitor clinics |
| Country cost page | Country guide, top 3 city cost pages in that country, top 3 clinic profiles |
| City cost page | Parent country cost page, city guide, city clinic index, top 3 clinics in city |
| Country comparison | Both country guides, both country cost pages |
| City comparison | Both city guides, both city cost pages, parent country guide |
| Treatment page | All country guides, `/faq/`, relevant country + city cost pages |
| Origin guide | All country guides, top city guides, `/faq/`, `/start/` |
| Truth report | Parent clinic profile, city guide, country guide, `/truth-score/` |
| Patient story | City guide or country guide (whichever is more specific), `/start/`, treatment page |
| Resource article | 1 pillar page (country guide or treatment), `/faq/` |
| FAQ | All treatment pages, all country guides, all cost pages (via answers) |
| Home | Country guides ×4, `/faq/`, `/truth-score/`, `/ai-interviewer/`, `/start/`, `/for-clinics/` |

### Anchor Text Rules
- Descriptive, keyword-rich anchor text — not "click here", "learn more", or "read this"
- Maximum 3 outbound internal links per 300 words of body content
- Breadcrumbs and related-content card blocks do not count toward this limit
- City names in anchor text should match the city guide page topic exactly (not abbreviated)
