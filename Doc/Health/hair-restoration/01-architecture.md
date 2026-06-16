# MedCover — Hair Restoration Site Architecture

Phase 2 niche expansion: **Hair Restoration** (FUE, DHI, FUT). Mirrors the IVF hub-and-spoke SEO model with treatment-specific URL patterns and internal linking.

**Treatment code:** `HAIR_RESTORATION`  
**Treatment slug:** `hair-restoration`  
**Primary destinations (Phase 1):** Turkey (Istanbul), Spain (Barcelona, Madrid), Greece (Athens)  
**Origin markets (Phase 1):** UK, USA

---

## URL Taxonomy

```
medcover.com/
│
├── /guides/                                              ← Destination guides
│   ├── /guides/turkey-hair-restoration-guide/            ← Country hub (Template HR-A)
│   │   └── /guides/turkey/istanbul-hair-restoration-guide/  ← City guide (HR-A2)
│   ├── /guides/spain-hair-restoration-guide/
│   │   ├── /guides/spain/barcelona-hair-restoration-guide/
│   │   └── /guides/spain/madrid-hair-restoration-guide/
│   └── /guides/greece-hair-restoration-guide/
│       └── /guides/greece/athens-hair-restoration-guide/
│
├── /clinics/                                             ← Clinic directory (treatment-filtered PLP)
│   ├── /clinics/turkey/istanbul/hair-restoration/
│   ├── /clinics/spain/barcelona/hair-restoration/
│   └── /clinics/greece/athens/hair-restoration/
│
├── /compare/                                             ← Comparison engine
│   ├── /compare/turkey-vs-spain-hair-restoration/
│   ├── /compare/istanbul-vs-barcelona-hair-restoration/
│   └── /compare/turkey-vs-uk-hair-restoration/
│
├── /costs/                                               ← Cost transparency
│   ├── /costs/hair-restoration-turkey-cost-2026/
│   ├── /costs/hair-restoration-spain-cost-2026/
│   └── /costs/hair-restoration-greece-cost-2026/
│
├── /treatments/
│   └── /treatments/hair-restoration/                     ← Treatment glossary (Template HR-E)
│
├── /from/                                                ← Origin patient journeys
│   ├── /from/uk/hair-restoration-abroad/
│   └── /from/usa/hair-restoration-abroad/
│
└── /guides/                                              ← Authority articles (high-impact)
    ├── /guides/fue-vs-dhi-hair-transplant-guide/
    ├── /guides/hair-transplant-istanbul-guide/
    ├── /guides/hair-transplant-graft-count-calculator/
    ├── /guides/best-age-for-hair-transplant/
    └── /guides/hair-transplant-results-timeline/
```

---

## Slug Patterns

| Page Type | Pattern | Example |
|---|---|---|
| Country guide | `/guides/[country]-hair-restoration-guide/` | `/guides/turkey-hair-restoration-guide/` |
| City guide | `/guides/[country]/[city]-hair-restoration-guide/` | `/guides/turkey/istanbul-hair-restoration-guide/` |
| Treatment PLP | `/clinics/[country]/[city]/hair-restoration/` | `/clinics/turkey/istanbul/hair-restoration/` |
| Country comparison | `/compare/[a]-vs-[b]-hair-restoration/` | `/compare/turkey-vs-spain-hair-restoration/` |
| City comparison | `/compare/[city-a]-vs-[city-b]-hair-restoration/` | `/compare/istanbul-vs-barcelona-hair-restoration/` |
| Country cost | `/costs/hair-restoration-[country]-cost-[year]/` | `/costs/hair-restoration-turkey-cost-2026/` |
| Treatment page | `/treatments/hair-restoration/` | `/treatments/hair-restoration/` |
| Origin journey | `/from/[country]/hair-restoration-abroad/` | `/from/uk/hair-restoration-abroad/` |
| Authority article | `/guides/[topic-slug]/` | `/guides/fue-vs-dhi-hair-transplant-guide/` |

### Slug Rules

- Lowercase, hyphen-separated — no underscores
- Trailing slash enforced globally
- Use full country name slugs (`turkey` not `tr`)
- Year in cost pages for freshness; 301 old year → new year on update
- `hair-restoration` is a reserved treatment slug (protected by `TreatmentSlugGuard`)

---

## Priority Destinations by Phase

| Phase | Country | Cities |
|---|---|---|
| Phase 1 | Turkey | Istanbul |
| Phase 1 | Spain | Barcelona, Madrid |
| Phase 1 | Greece | Athens |
| Phase 2 | Thailand | Bangkok |
| Phase 2 | Turkey | Ankara, Antalya |
| Phase 2 | Spain | Valencia |

---

## Internal Linking Topology

| Hub | Must link to |
|---|---|
| Country guide | Country cost page, city guides, top 5 clinic profiles, 1 comparison, `/treatments/hair-restoration/` |
| City guide | Parent country guide, city clinic PLP, city cost page, top 3 clinics |
| Cost page | Country guide, top clinic profiles, origin journey pages |
| Treatment page | All country guides, relevant cost pages, `/faq/` |
| Origin journey | Turkey, Spain, Greece country guides, cost pages |
| Authority article | Relevant country/city guide, treatment page, cost page |

---

## Breadcrumb Pattern

| Page | Breadcrumb |
|---|---|
| Country guide | `Home > Destinations > Turkey Hair Restoration Guide` |
| City guide | `Home > Destinations > Turkey Hair Restoration Guide > Istanbul Hair Restoration Guide` |
| Cost page | `Home > Costs > Hair Restoration Turkey Cost 2026` |
| Treatment | `Home > Treatments > Hair Restoration` |
| Origin journey | `Home > From UK > Hair Restoration Abroad` |

---

## Sitemap Priority

| Priority | Pages |
|---|---|
| `0.9` | Country guides (Turkey, Spain, Greece) |
| `0.85` | City guides (Istanbul, Barcelona, Madrid, Athens) |
| `0.8` | Cost pages, treatment page, origin journeys, comparisons |
| `0.5` | Authority articles |

---

## Related Docs

- [`Template Registry.md`](Template%20Registry.md) — HR-A through HR-F template specs
- [`cost-pages-2026-swagger-bodies.json`](cost-pages-2026-swagger-bodies.json) — API payloads for cost pages
- [`country-guides-swagger-bodies.json`](country-guides-swagger-bodies.json) — Country guides + treatment page
- [`origin-journey-swagger-bodies.json`](origin-journey-swagger-bodies.json) — UK/USA origin journeys
- [`high-impact-articles-swagger-bodies.json`](high-impact-articles-swagger-bodies.json) — Authority articles
