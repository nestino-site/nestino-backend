# Next.js frontend integration (Traffic Engine backend)

How to connect **your** Next.js site to the NestJS Traffic Engine backend (`apps/traffic-engine-backend`) for SEO content, caching, and instant updates on publish.

---

## Architecture

```
Traffic Engine (NestJS)
  ├── Pipeline completes → autoPublish
  ├── PublishService → page PUBLISHED + hero CDN upload
  ├── Webhook POST → your-site.com/api/webhooks/publish (HMAC)
  └── Content API GET /api/v1/content/* (X-Site-Api-Key)

Your Next.js app
  ├── ISR pages e.g. /[locale]/[...slug]
  ├── Data cache (fetch tags, ~1h TTL)
  ├── Webhook → revalidatePath + revalidateTag
  └── /sitemap.xml + /robots.txt proxied to backend (optional)
```

---

## Environment variables

### Next.js (`.env.local` + hosting)

| Variable | Description |
|----------|-------------|
| `TRAFFIC_ENGINE_URL` | Backend base URL **including** `/api/v1`, e.g. `https://api.example.com/api/v1` |
| `SITE_ID` | Numeric site ID from `POST /sites` |
| `SITE_API_KEY` | Content API key (shown once on site create / rotate) |
| `WEBHOOK_SECRET` | Same as `site.publishWebhookSecret` in backend |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (metadataBase, canonical fallback) |
| `CONTENT_REVALIDATE_SECONDS` | ISR / data cache TTL (default `3600`) |

### Backend (per deployment)

| Variable | Description |
|----------|-------------|
| `CDN_BASE_URL` | Public URL prefix for hero images |
| `IMAGE_UPLOADS_DIR` | Local path for uploaded heroes; serve at CDN URL in production |
| `publishWebhookUrl` | On Site record: `https://your-site.com/api/webhooks/publish` |
| `publishWebhookSecret` | Must match Next.js `WEBHOOK_SECRET` |

---

## Caching (no Redis on the frontend)

Use **three layers** — no separate Redis on Next.js:

1. **Data cache** — `fetch(..., { next: { revalidate: 3600, tags: ['page-42'] } })`
2. **ISR HTML** — `export const revalidate = 3600` on article routes
3. **CDN / edge** — Vercel or Cloudflare in front of Next.js

On publish, your webhook handler should call:

- `revalidatePath('/{locale}/{slug}')`
- `revalidateTag('page-{pageId}')`, `page-slug-{slug}`, `published-pages`

---

## Backend setup (per site)

1. Create a site → save `contentApiKey` and set `publishWebhookSecret`.
2. `publishWebhookUrl` → `https://your-domain.com/api/webhooks/publish`
3. `autoPublish: true` or manual `POST /api/v1/pages/:id/publish`
4. Set `CDN_BASE_URL` so Open Graph images use real URLs.

---

## Content API endpoints

| Endpoint | Headers | Purpose |
|----------|---------|---------|
| `GET /content/pages` | `X-Site-Api-Key`, `X-Site-Id` | List published pages (`generateStaticParams`) |
| `GET /content/by-slug/*path` | Same | Article by URL path, e.g. `/travel/morocco` |
| `GET /content/:pageId` | `X-Site-Api-Key` (validated via page’s site) | Article by ID |

**Contract v2.1 fields:** `htmlContent`, `seo`, `schemaMarkup`, `tableOfContents`, `breadcrumbs`, `faq`, `heroImage`, `publishedAt`, `updatedAt`.

Public sitemap/robots (no API key):

- `GET /api/v1/sitemap.xml?siteId={id}`
- `GET /api/v1/robots.txt?siteId={id}`

---

## What to add in your Next.js repo

Suggested layout:

```
your-next-app/
├── lib/traffic-engine/
│   ├── client.ts      # fetch wrapper + cache tags
│   └── types.ts       # ContentContract types
├── app/
│   ├── [locale]/[...slug]/page.tsx    # generateMetadata + render htmlContent
│   └── api/webhooks/publish/route.ts  # HMAC + revalidate
└── next.config.ts     # optional sitemap/robots rewrites
```

### `lib/traffic-engine/client.ts` (example)

```typescript
const BASE = process.env.TRAFFIC_ENGINE_URL!;
const KEY = process.env.SITE_API_KEY!;
const SITE_ID = process.env.SITE_ID!;
const REVALIDATE = Number(process.env.CONTENT_REVALIDATE_SECONDS ?? 3600);

function siteHeaders(): HeadersInit {
  return { 'X-Site-Api-Key': KEY, 'X-Site-Id': SITE_ID };
}

export async function getPageContentBySlug(slug: string) {
  const path = slug.startsWith('/') ? slug : `/${slug}`;
  const res = await fetch(`${BASE}/content/by-slug${path}`, {
    headers: siteHeaders(),
    next: { revalidate: REVALIDATE, tags: [`page-slug-${path}`, `site-${SITE_ID}`] },
  });
  if (!res.ok) throw new Error(`Content API ${res.status}`);
  return res.json();
}

export async function listPublishedPages() {
  const res = await fetch(`${BASE}/content/pages`, {
    headers: siteHeaders(),
    next: { revalidate: REVALIDATE, tags: ['published-pages', `site-${SITE_ID}`] },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
}
```

### `app/api/webhooks/publish/route.ts` (example)

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(req: Request) {
  const secret = process.env.WEBHOOK_SECRET!;
  const body = await req.text();
  const signature = req.headers.get('x-publish-signature') ?? '';
  if (!verifySignature(body, signature, secret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = JSON.parse(body) as {
    pageId: number;
    slug: string;
    siteId: number;
    language: string;
  };

  const locale = payload.language?.toLowerCase() ?? 'en';
  const slugPath = payload.slug.startsWith('/') ? payload.slug.slice(1) : payload.slug;

  revalidatePath(`/${locale}/${slugPath}`);
  revalidateTag(`page-${payload.pageId}`);
  revalidateTag(`page-slug-${payload.slug.startsWith('/') ? payload.slug : `/${payload.slug}`}`);
  revalidateTag('published-pages');

  return new Response('OK');
}
```

### Article page (SEO essentials)

- **`generateMetadata`** — map `content.seo.metaTitle`, `metaDescription`, `canonical`, `alternates.languages` (hreflang), `openGraph`, `twitter`, `robots`.
- **Body** — render `content.htmlContent` (server HTML from backend; do not parse Markdown on the client).
- **JSON-LD** — `<script type="application/ld+json">` with `JSON.stringify(content.schemaMarkup)`.
- **Hero** — Next.js `<Image priority>` using `content.heroImage.url` (requires `CDN_BASE_URL` on backend).
- **`generateStaticParams`** — call `listPublishedPages()` at build time.

### `next.config.ts` rewrites (optional)

```typescript
async rewrites() {
  const backend = process.env.TRAFFIC_ENGINE_URL!.replace(/\/api\/v1$/, '');
  const siteId = process.env.SITE_ID!;
  return [
    { source: '/sitemap.xml', destination: `${backend}/api/v1/sitemap.xml?siteId=${siteId}` },
    { source: '/robots.txt', destination: `${backend}/api/v1/robots.txt?siteId=${siteId}` },
  ];
}
```

---

## Webhook payload

```json
{
  "pageId": 42,
  "slug": "/travel/morocco",
  "siteId": 1,
  "language": "EN",
  "event": "page.published",
  "timestamp": 1710000000000
}
```

Header: `X-Publish-Signature: sha256=<HMAC-SHA256 of raw JSON body>` using `publishWebhookSecret`.

Failed webhooks are retried by the backend (`webhook_deliveries` + BullMQ cron).

---

## SEO checklist

| Item | Notes |
|------|--------|
| `generateMetadata` from API | title, description, canonical, OG, Twitter, hreflang |
| JSON-LD | `schemaMarkup` from API |
| ISR + webhook revalidation | Data cache tags + `revalidatePath` |
| Sitemap / robots | Proxy to backend or use backend URLs in Search Console |
| `htmlContent` | Prefer over `finalContent` (Markdown) |
| Hero CDN | Set `CDN_BASE_URL` on backend |
| Core Web Vitals | `<Image priority>` on hero; stable width/height |

---

## Local dev

```bash
# Backend
cd apps/traffic-engine-backend
npm run start:dev

# Your Next.js app (separate repo)
# TRAFFIC_ENGINE_URL=http://localhost:3001/api/v1
# SITE_ID=1 SITE_API_KEY=... WEBHOOK_SECRET=...
npm run dev
```

Use a tunnel (ngrok, etc.) if the backend must reach your local webhook URL.

---

## Backend reference

Implementation lives in `apps/traffic-engine-backend`:

- Content API: `src/modules/traffic-engine/content-api/`
- Publish + webhooks: `src/modules/traffic-engine/publishing/`
- Short backend summary: `apps/traffic-engine-backend/docs/NEXTJS_INTEGRATION.md`
