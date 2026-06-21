# MedCover — Dental Site Architecture

Phase 3 niche expansion: **Dental** (implants, veneers, crowns, all-on-4). Mirrors the IVF / Hair Restoration hub-and-spoke SEO model.

**Treatment code:** `DENTAL`  
**Treatment slug:** `dental`  
**Primary destinations (Phase 1):** Turkey (Istanbul), Spain (Barcelona, Madrid), Greece (Athens)  
**Origin markets (Phase 1):** UK, USA

---

## URL Taxonomy

```
medcover.com/
│
├── /guides/
│   ├── /guides/turkey-dental-guide/
│   │   └── /guides/turkey/istanbul-dental-guide/
│   ├── /guides/spain-dental-guide/
│   │   ├── /guides/spain/barcelona-dental-guide/
│   │   └── /guides/spain/madrid-dental-guide/
│   └── /guides/greece-dental-guide/
│       └── /guides/greece/athens-dental-guide/
│
├── /clinics/
│   ├── /clinics/turkey/istanbul/dental/
│   ├── /clinics/spain/barcelona/dental/
│   └── /clinics/greece/athens/dental/
│
├── /compare/
│   ├── /compare/turkey-vs-spain-dental/
│   └── /compare/istanbul-vs-barcelona-dental/
│
├── /costs/
│   ├── /costs/dental-turkey-cost-2026/
│   ├── /costs/dental-spain-cost-2026/
│   └── /costs/dental-greece-cost-2026/
│
├── /treatments/dental/
│
├── /from/
│   ├── /from/uk/dental-abroad/
│   └── /from/usa/dental-abroad/
│
└── /guides/  (authority articles)
    ├── /guides/dental-implants-vs-veneers-abroad/
    ├── /guides/all-on-4-dental-implants-guide/
    ├── /guides/dental-tourism-istanbul-guide/
    ├── /guides/dental-implant-recovery-timeline/
    └── /guides/how-to-choose-dental-clinic-abroad/
```

---

## Slug Patterns

| Page Type | Pattern | Example |
|---|---|---|
| Country guide | `/guides/[country]-dental-guide/` | `/guides/turkey-dental-guide/` |
| City guide | `/guides/[country]/[city]-dental-guide/` | `/guides/turkey/istanbul-dental-guide/` |
| Treatment PLP | `/clinics/[country]/[city]/dental/` | `/clinics/turkey/istanbul/dental/` |
| Country cost | `/costs/dental-[country]-cost-[year]/` | `/costs/dental-turkey-cost-2026/` |
| Treatment page | `/treatments/dental/` | `/treatments/dental/` |
| Origin journey | `/from/[country]/dental-abroad/` | `/from/uk/dental-abroad/` |
| Comparison | `/compare/[a]-vs-[b]-dental/` | `/compare/turkey-vs-spain-dental/` |

---

## Priority Destinations

| Phase | Country | Cities |
|---|---|---|
| Phase 1 | Turkey | Istanbul |
| Phase 1 | Spain | Barcelona, Madrid |
| Phase 1 | Greece | Athens |

---

## Internal Linking

| Hub | Must link to |
|---|---|
| Country guide | Cost page, city guides, top clinics, `/treatments/dental/` |
| City guide | Parent country guide, city clinic PLP, cost page |
| Cost page | Country guide, city guides, origin journeys |
| Treatment page | All country guides, cost pages |
| Origin journey | Turkey, Spain, Greece guides + cost pages |

---

## Related Docs

- [`Template Registry.md`](Template%20Registry.md)
- [`country-guides-swagger-bodies.json`](country-guides-swagger-bodies.json)
- [`cost-pages-2026-swagger-bodies.json`](cost-pages-2026-swagger-bodies.json)
- [`origin-journey-swagger-bodies.json`](origin-journey-swagger-bodies.json)
- [`high-impact-articles-swagger-bodies.json`](high-impact-articles-swagger-bodies.json)
