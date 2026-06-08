# Create Clinic Panel — AI Builder Prompt + API Reference

Use this document to build an admin **Create Clinic** panel that discovers clinics from Google Places, links treatments, and auto-publishes all MedCover pages (detail + city + country + treatment listings).

---

## Part 1 — Prompt for AI / Frontend Builder

Copy everything below the line into your AI builder or give it to your frontend developer.

---

**Build an admin page called "Create Clinic" for the Nestino traffic-engine backend.**

### Goal

Allow an admin to:
1. Pick a **city** (from the geo API).
2. Pick one or more **treatment types** (IVF, ICSI, etc.).
3. Set **max results** (1–60).
4. Toggle **auto-publish** (recommended: on).
5. Click **Discover & Publish** — the backend finds clinics on Google, enriches them, links treatments, and auto-publishes 4 page types on MedCover.

### UI requirements

- Clean, modern admin form (match existing admin panel if available).
- **City** — searchable dropdown from `GET /cities` (show `name`, store `id`).
- **Treatments** — multi-select from `GET /treatments` (show `name`, value = `code` e.g. `IVF`).
- **Max results** — number input, default 5, min 1, max 60.
- **Auto-publish** — checkbox, default checked.
- **Submit button** — "Discover & Publish".
- **Progress / result panel** after submit:
  - Run ID, status, candidate count, approved count.
  - List of expected page paths returned by the API.
  - Link to each published page on `https://medcover.io` + slug.
- **Error handling** — show API error messages; handle 401 (redirect to login).

### Auth

- Login via `POST /identity/login` with email + password.
- Store `accessToken` in memory or secure storage.
- Send `Authorization: Bearer {accessToken}` on all admin calls.

### Primary action (recommended flow)

```http
POST /api/v1/discovery/quick
Authorization: Bearer {token}
Content-Type: application/json

{
  "cityId": 1,
  "clinicTypes": ["IVF"],
  "maxResults": 5,
  "autoApprove": true,
  "dryRun": false
}
```

When `autoApprove: true`, the backend:
1. Searches Google Places for `{treatment} clinic {cityName}`.
2. Enriches each candidate (details, website, scoring).
3. Creates published clinics with treatment links.
4. Auto-builds page content from Google data (no AI).
5. Publishes all affected pages:
   - `/clinics/{country}/{city}/{clinic-slug}` — detail
   - `/clinics/{country}/{city}` — city listing (clinic directory on top, article below)
   - `/clinics/{country}` — country listing
   - `/clinics/treatment/{treatment}` — treatment listing

### Secondary actions (manual fallback)

If discovery is not needed, support manual create + publish:

1. `POST /clinics` — create clinic manually.
2. `POST /clinics/{id}/treatments` — link treatment `{ "treatmentCode": "IVF" }`.
3. `POST /clinics/{id}/publish` — trigger auto-publish of all 4 page scopes.

### Environment

```
NEXT_PUBLIC_API_BASE=https://nestino-backend-production.up.railway.app/api/v1
NEXT_PUBLIC_MEDCOVER_URL=https://medcover.io
```

### Listing page layout (for preview)

Published listing pages render markdown with this structure:
1. Page H1
2. **Clinic directory** (cards with photo, rating, address, CTA) — **on top**
3. Existing article text — **below**

Clinic photos load via proxy: `{API_BASE}/clinics/{id}/photo`.

---

## Part 2 — API Reference

**Base URL (production):** `https://nestino-backend-production.up.railway.app/api/v1`

### Authentication

```http
POST /identity/login
Content-Type: application/json

{
  "email": "admin@nestino.test",
  "password": "YOUR_PASSWORD"
}
```

Response: `{ "accessToken": "...", "expiresIn": "8h" }`

Use header on protected routes: `Authorization: Bearer {accessToken}`

---

### Geo — Cities & Countries

```http
GET /countries          # public — list countries
GET /cities             # public — list cities (?countryId=1)
GET /cities/barcelona   # public — city by slug + clinic count
```

Example city item: `{ "id": 1, "name": "Barcelona", "slug": "barcelona", "countryId": 1 }`

---

### Catalog — Treatments

```http
GET /treatments         # public — active treatments only
```

Example: `{ "code": "IVF", "name": "IVF — In Vitro Fertilisation" }`

Common codes: `IVF`, `ICSI`, `PGT_A`, `EGG_DONATION`, `IUI`, `FET`, `MINI_IVF`

---

### Discovery — Primary flow

```http
POST /discovery/quick
Authorization: Bearer {token}
Content-Type: application/json

{
  "cityId": 1,
  "clinicTypes": ["IVF", "ICSI"],
  "maxResults": 5,
  "autoApprove": true,
  "dryRun": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cityId` | number | Existing city ID |
| `clinicTypes` | string[] | Treatment labels for Google search + DB linking |
| `maxResults` | number | 1–60 clinics to discover |
| `autoApprove` | boolean | `true` = auto-create + publish clinics |
| `dryRun` | boolean | `false` for real run |

**Response (autoApprove true):**

```json
{
  "runId": 4,
  "status": "COMPLETED",
  "candidateCount": 5,
  "approved": 5,
  "pages": [
    "/clinics/spain/barcelona/clinic-slug-1",
    "/clinics/spain/barcelona",
    "/clinics/spain",
    "/clinics/treatment/ivf"
  ]
}
```

**Poll run status (optional):**

```http
GET /discovery/runs/{runId}
Authorization: Bearer {token}
```

---

### Clinics — Manual CRUD + Publish

```http
GET  /clinics?cityId=1&limit=20     # public — list published clinics
GET  /clinics/{idOrSlug}             # public — clinic detail
POST /clinics                        # admin — create clinic
PATCH /clinics/{id}                  # admin — update
POST /clinics/{id}/publish           # admin — publish + auto-update all pages
POST /clinics/{id}/treatments        # admin — link treatment
GET  /clinics/{id}/photo             # public — redirect to clinic photo
```

**Link treatment:**

```http
POST /clinics/1/treatments
Authorization: Bearer {token}
Content-Type: application/json

{ "treatmentCode": "IVF", "isOffered": true }
```

**Publish clinic (triggers 4-page auto-publish):**

```http
POST /clinics/1/publish
Authorization: Bearer {token}
```

---

### Pages — Verify publish status

```http
GET /pages?siteId=2&limit=100
Authorization: Bearer {token}
```

MedCover site ID is typically `2` (domain `medcover.io`).

```http
GET /pages/{id}
Authorization: Bearer {token}
```

Check: `status: "PUBLISHED"`, `finalContent` contains `CLINIC_DIRECTORY_START` for listings.

---

### Content API — Frontend consumption

```http
GET /content/by-slug/clinics/spain/barcelona
X-Site-Api-Key: {medcover_site_api_key}
```

Returns rendered HTML + markdown for MedCover frontend.

---

## Part 3 — End-to-end flow diagram

```
Admin form submit
    │
    ▼
POST /discovery/quick  (cityId + clinicTypes + autoApprove)
    │
    ├─ Google Places search
    ├─ Enrich (details, website, treatments detected)
    ├─ Create clinic + clinic_treatments
    └─ emitClinicPublished
           │
           ▼
    ClinicWebhookHandler (4 page specs)
           │
           ├─ Build detail content (Google data)
           ├─ Build listing directory (clinics on top, article below)
           └─ PublishService.publishPage() × 4
                  │
                  ▼
           MedCover webhook → frontend cache invalidation
```

---

## Part 4 — Test checklist

After a discovery run for Barcelona (`cityId: 1`, `clinicTypes: ["IVF"]`, `maxResults: 5`):

- [ ] 5 clinics in `GET /clinics?cityId=1`
- [ ] Each clinic has IVF in treatments (via `GET /clinics/{id}`)
- [ ] `/clinics/spain/barcelona` — PUBLISHED, directory on top with 5 cards + photos
- [ ] `/clinics/spain` — PUBLISHED, 5 clinics in directory
- [ ] `/clinics/treatment/ivf` — PUBLISHED, clinics listed (not 0)
- [ ] Detail page for clinic #1 — PUBLISHED, hero image + contact + reviews

**Live URLs (Barcelona test):**

- City: `https://medcover.io/clinics/spain/barcelona`
- Country: `https://medcover.io/clinics/spain`
- Treatment: `https://medcover.io/clinics/treatment/ivf`
- Detail: `https://medcover.io/clinics/spain/barcelona/clinica-de-fertilidad-barcelona-ivf-2`
