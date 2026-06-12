# Guide ↔ Landing Relations — Frontend Handoff

**Status:** Live on Traffic Engine (v2.2)  
**Audience:** MedCover frontend team  
**Backend base URL:** `https://nestino-backend-production.up.railway.app/api/v1`

This document explains how to use structured `pageType` and `entities` tags from the Content API to link guides and landing pages — **without slug-pattern guessing** — while keeping full backward compatibility with untagged legacy content.

---

## 1. What changed / what did not

| Area | Change |
|------|--------|
| `GET /content/by-slug/{slug}` | Optional `pageType`, `entities` on payload (`version: "2.2"`) |
| `GET /content/{pageId}` | Same optional fields |
| `GET /content/pages` items | Optional `pageType`, `title`, `entities` per item |
| `GET /content/pages` filters | Optional `?pageType=&country=&city=&treatment=` |
| Slugs / URLs | **Unchanged** |
| Untagged pages | **Supported forever** — frontend falls back to slug inference |
| Auth headers | Unchanged — `X-Site-Api-Key` + `X-Site-Id` |

**Hard rule:** All new fields are optional. If absent, behavior must be identical to today.

---

## 2. Payload reference

### 2.1 Page detail (`GET /content/by-slug/{slug}` or `GET /content/{id}`)

```json
{
  "version": "2.2",
  "pageType": "guide",
  "entities": {
    "treatment": { "slug": "ivf-in-vitro-fertilisation", "name": "IVF — In Vitro Fertilisation" },
    "country":   { "slug": "spain", "name": "Spain" },
    "city":      { "slug": "barcelona", "name": "Barcelona" },
    "clinics": [
      {
        "slug": "reproclinic-3",
        "name": "Reproclinic",
        "urlPath": "/clinics/spain/barcelona/reproclinic-3"
      }
    ]
  },
  "pageId": 40,
  "status": "ready",
  "seo": { "metaTitle": "...", "canonical": "https://medcover.io/guides/spain-barcelona-ivf-guide/" },
  "htmlContent": "...",
  "breadcrumbs": [],
  "faq": []
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | string | yes | `"2.1"` or `"2.2"` — accept both |
| `pageType` | string \| omitted | no | See §3. Absent → use slug inference |
| `entities.treatment` | `{ slug, name }` | no | `slug` matches `GET /content/taxonomy` treatments |
| `entities.country` | `{ slug, name }` | no | `slug` = `slugify(country.name)` from taxonomy |
| `entities.city` | `{ slug, name }` | no | `slug` = `city.slug` from taxonomy |
| `entities.clinics` | `{ slug, name, urlPath }[]` | no | Only backend sends `urlPath` (non-derivable) |

**Taxonomy slugs are canonical.** Always validate tags against `GET /content/taxonomy` before trusting them. Invalid slugs → fall back to slug inference (never 404).

### 2.2 List items (`GET /content/pages`)

**Before (still valid for untagged items):**

```json
{ "id": 40, "slug": "/guides/spain-ivf-guide", "language": "EN", "updatedAt": "2026-06-01T00:00:00.000Z" }
```

**With tags (new, optional):**

```json
{
  "id": 40,
  "slug": "/guides/spain-barcelona-ivf-guide",
  "language": "EN",
  "updatedAt": "2026-06-01T00:00:00.000Z",
  "pageType": "guide",
  "title": "IVF in Barcelona: Complete Patient Guide",
  "entities": {
    "treatment": { "slug": "ivf-in-vitro-fertilisation", "name": "IVF — In Vitro Fertilisation" },
    "country": { "slug": "spain", "name": "Spain" },
    "city": { "slug": "barcelona", "name": "Barcelona" }
  }
}
```

Omitted keys when null — untagged items keep the old 4-field shape.

### 2.3 List filters (optional, additive)

```
GET /content/pages?pageType=guide
GET /content/pages?pageType=guide&country=spain
GET /content/pages?pageType=guide&country=spain&city=barcelona
GET /content/pages?pageType=guide&treatment=ivf-in-vitro-fertilisation
```

Unknown query params are ignored by older backends. When filters or list fields are absent, keep current per-slug fetch behavior.

---

## 3. `pageType` values

| `pageType` | Frontend use |
|------------|----------------|
| `guide` | Patient guide article |
| `guides_hub` | `/guides/` hub |
| `country_landing` | `/countries/{country}/` |
| `city_landing` | City destination (if used) |
| `treatment_landing` | `/treatments/{treatment}/` |
| `clinic_country_plp` | `/clinics/{country}/` |
| `clinic_city_plp` | `/clinics/{country}/{city}/` |
| `clinic_country_treatment_plp` | `/clinics/{country}/{treatment}/` |
| `clinic_city_treatment_plp` | `/clinics/{country}/{city}/{treatment}/` |
| `clinic_pdp` | `/clinics/{country}/{city}/{clinic}/` |
| `cost_hub` | `/cost/` |
| `cost_treatment` | `/cost/{treatment}/` |
| `cost_country` | Cost by country scope |
| `cost_city` | Cost by city scope |
| `compare_hub` | `/compare/` |
| `compare_country` | Country comparison |
| `compare_clinic` | Clinic comparison |
| *(absent)* | Treat as unknown → slug inference |

---

## 4. URL-building rules (frontend derives landings)

The backend sends **taxonomy slugs only**. The frontend builds landing URLs:

| Relation | URL pattern | Example |
|----------|-------------|---------|
| Country clinics | `/clinics/{country}/` | `/clinics/spain/` |
| City clinics | `/clinics/{country}/{city}/` | `/clinics/spain/barcelona/` |
| Country × treatment clinics | `/clinics/{country}/{treatment}/` | `/clinics/spain/ivf-in-vitro-fertilisation/` |
| City × treatment clinics | `/clinics/{country}/{city}/{treatment}/` | `/clinics/spain/barcelona/ivf-in-vitro-fertilisation/` |
| Country destination | `/countries/{country}/` | `/countries/spain/` |
| Treatment hub | `/treatments/{treatment}/` | `/treatments/ivf-in-vitro-fertilisation/` |
| Cost (treatment) | `/cost/{treatment}/` | `/cost/ivf-in-vitro-fertilisation/` |
| Guide (same entities) | `/guides/...` | Use list filter or slug |

**Exception:** `entities.clinics[].urlPath` is sent by the backend — use as-is for PDP links.

Use trailing slashes consistently with your router.

---

## 5. `resolvePageRelations` — reference implementation

Single resolver for all relation logic. **Tags first, slug fallback.**

```typescript
type EntityRef = { slug: string; name: string };
type PageRelations = {
  pageType?: string;
  treatment?: EntityRef;
  country?: EntityRef;
  city?: EntityRef;
  clinics?: Array<EntityRef & { urlPath: string }>;
};

type Taxonomy = {
  countries: Array<{ slug: string; name: string; cities: Array<{ slug: string; name: string }> }>;
  treatments: Array<{ slug: string; name: string }>;
};

function validateEntity(
  ref: EntityRef | undefined,
  allowed: Map<string, EntityRef>,
): EntityRef | undefined {
  if (!ref?.slug) return undefined;
  return allowed.get(ref.slug);
}

export function resolvePageRelations(
  item: { slug: string; pageType?: string; entities?: PageRelations },
  taxonomy: Taxonomy,
  slugFallback: (slug: string) => PageRelations | null,
): PageRelations {
  const countryMap = new Map(taxonomy.countries.map((c) => [c.slug, { slug: c.slug, name: c.name }]));
  const cityMap = new Map(
    taxonomy.countries.flatMap((c) =>
      c.cities.map((city) => [city.slug, { slug: city.slug, name: city.name }] as const),
    ),
  );
  const treatmentMap = new Map(
    taxonomy.treatments.map((t) => [t.slug, { slug: t.slug, name: t.name }]),
  );

  if (item.entities && Object.keys(item.entities).length > 0) {
    const country = validateEntity(item.entities.country, countryMap);
    const city = validateEntity(item.entities.city, cityMap);
    const treatment = validateEntity(item.entities.treatment, treatmentMap);

    const hasValidTag = country || city || treatment || (item.entities.clinics?.length ?? 0) > 0;

    if (hasValidTag) {
      return {
        pageType: item.pageType,
        country,
        city,
        treatment,
        clinics: item.entities.clinics,
      };
    }

    // All tags invalid → fall through to slug inference
    console.warn?.('resolvePageRelations: invalid entity slugs, using slug fallback', { slug: item.slug });
  }

  return {
    pageType: item.pageType,
    ...slugFallback(item.slug),
  };
}
```

### Rules

1. **Tag wins on conflict** — if `entities.country.slug === "portugal"` but slug says `spain`, use Portugal.
2. **Invalid taxonomy slug** — drop that entity; if nothing valid remains, use slug fallback.
3. **Never throw / 404** from resolver alone.
4. **Untagged content** — slug fallback only; must match today's behavior byte-for-byte.

Wire existing helpers (`parseGuideSlug`, `parseEntitiesFromSlug`, `buildGuideArticleItem`) as `slugFallback`.

---

## 6. Where to use the resolver

| Consumer | Today | With tags |
|----------|-------|-----------|
| `buildGuideArticleItem` / guides hub | Slug patterns; non-IVF dropped | `pageType=guide` + entities; non-IVF works |
| `buildGuideGroups` / nav | Hardcoded `ivf` | `entities.treatment` when present |
| `findRelatedGuides` on PLPs | Slug heuristics | `GET /content/pages?pageType=guide&country=spain` |
| `buildRelatedLandingsForEntities` | Partial slug parse | `resolvePageRelations` output |
| `loadGuideSummaries` | Per-slug fetch for title | Use list `title` when present |

---

## 7. Acceptance criteria

- [ ] Backend unchanged (no `entities` anywhere): site behavior identical to current production.
- [ ] One tagged guide appears in related sections via tags even if slug matches no pattern.
- [ ] Tag vs slug conflict: **tag wins**.
- [ ] Invalid tag slug: fallback to slug inference; no crash.
- [ ] List endpoint with `?pageType=guide&country=spain` returns only matching guides.
- [ ] Untagged legacy guides still appear via slug fallback.

---

## 8. Rollout order

1. **Frontend (safe now):** Ship `ContentPageSchemaV22` parsing + `resolvePageRelations` with slug-only fallback.
2. **Backend:** Deploy tagging + list fields (this release).
3. **Ops:** Run `npm run backfill:guide-entities -- --dry-run` then apply on production DB.
4. **Frontend:** Use list `title`/`entities` for tagged items; keep per-slug fetch for untagged only.
5. **Verify:** Spot-check `/guides/spain-ivf-guide` payload has `entities.country.slug === "spain"`.

---

## 9. Example requests

```bash
# Taxonomy (validate slugs)
curl -s -H "X-Site-Api-Key: $SITE_API_KEY" -H "X-Site-Id: 2" \
  "$TRAFFIC_ENGINE_URL/content/taxonomy"

# Guide with entities
curl -s -H "X-Site-Api-Key: $SITE_API_KEY" -H "X-Site-Id: 2" \
  "$TRAFFIC_ENGINE_URL/content/by-slug/guides/spain-ivf-guide"

# Related guides for Spain (no N+1)
curl -s -H "X-Site-Api-Key: $SITE_API_KEY" -H "X-Site-Id: 2" \
  "$TRAFFIC_ENGINE_URL/content/pages?pageType=guide&country=spain"
```

---

## 10. Related docs

- [MEDCOVER_AUTOPUBLISH_FRONTEND_HANDOFF.md](./MEDCOVER_AUTOPUBLISH_FRONTEND_HANDOFF.md) — auth, webhooks, env vars
- [NEXTJS_INTEGRATION.md](./NEXTJS_INTEGRATION.md) — Content API overview
