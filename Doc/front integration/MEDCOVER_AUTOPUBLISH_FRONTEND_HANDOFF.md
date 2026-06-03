# MedCover Frontend Auto-Publish Handoff

This document explains what the MedCover frontend must implement so published AI pages from the Traffic Engine backend appear automatically on `medcover.io`.

## Goal

The backend generates and publishes SEO pages. The frontend should only fetch published content, render it, and refresh cached pages when the backend sends a publish webhook.

Expected flow:

```text
Admin approves idea
-> backend creates page + AI content task
-> backend generates content and image
-> backend marks page READY
-> backend auto-publishes page
-> backend uploads hero image to Cloudinary
-> backend sends publish webhook to frontend
-> frontend revalidates cached route
-> public MedCover page updates
```

## Required Frontend Environment Variables

Set these on the MedCover frontend deployment:

```bash
TRAFFIC_ENGINE_URL="https://nestino-backend-production.up.railway.app/api/v1"
SITE_ID="2"
SITE_API_KEY="mI05OBBknX4gSWwIicRWeK-A-YDi-EWeHYzy7w_agEE"
WEBHOOK_SECRET="2fc08e3bc917dc0cb777447bed4ca0a99c31560ed019444eeb324727b7f2b9c7"
NEXT_PUBLIC_SITE_URL="https://medcover.io"
CONTENT_REVALIDATE_SECONDS="3600"
```

Notes:

- `TRAFFIC_ENGINE_URL` must include `/api/v1`.
- `SITE_API_KEY` is the content API key printed when the backend site key is rotated.
- `WEBHOOK_SECRET` must exactly match the backend `publishWebhookSecret` for the MedCover site.
- Do not expose `SITE_API_KEY` or `WEBHOOK_SECRET` to the browser.

Current production values were verified from the Traffic Engine API on 2026-05-22:

```json
{
  "siteId": 2,
  "name": "MedCover",
  "domain": "medcover.io",
  "autoPublish": true,
  "publishWebhookUrl": "https://medcover.io/api/webhooks/publish/",
  "contentApiKeyCreatedAt": "2026-05-22T14:31:49.256Z"
}
```

## Where `publishWebhookSecret` Comes From

`publishWebhookSecret` is **not** provided by Railway, Cloudinary, or Google. It is a private shared secret we create ourselves and store in the database on the MedCover `Site` record.

Use one strong random value, then set the same value in two places:

1. `Site.publishWebhookSecret` in the database (backend side)
2. `WEBHOOK_SECRET` env var on the frontend deployment

Suggested value (generated):

```
2fc08e3bc917dc0cb777447bed4ca0a99c31560ed019444eeb324727b7f2b9c7
```

## Storing Webhook Settings in the Database

`publishWebhookUrl` and `publishWebhookSecret` are proper columns on the `Site` table. They are set via `PATCH /api/v1/sites/:id` — no direct DB access needed.

These values are already set in production. If they ever need to be reset, use a direct PATCH call:

```bash
curl -s -X PATCH \
  https://nestino-backend-production.up.railway.app/api/v1/sites/2 \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "medcover.io",
    "publishWebhookUrl": "https://medcover.io/api/webhooks/publish/",
    "publishWebhookSecret": "2fc08e3bc917dc0cb777447bed4ca0a99c31560ed019444eeb324727b7f2b9c7",
    "autoPublish": true
  }'
```

If using the seed script instead, include `SITE_DOMAIN="medcover.io"` so it does not revert the domain back to `medcover.com`:

```bash
BASE_URL="https://nestino-backend-production.up.railway.app" \
ADMIN_PASSWORD="<your-admin-password>" \
SITE_DOMAIN="medcover.io" \
NEXTJS_REVALIDATION_URL="https://medcover.io/api/webhooks/publish/" \
PUBLISH_WEBHOOK_SECRET="2fc08e3bc917dc0cb777447bed4ca0a99c31560ed019444eeb324727b7f2b9c7" \
bash apps/traffic-engine-backend/scripts/seed-medcover.sh
```

The frontend content API key was rotated on 2026-05-22. Use this current key:

```bash
SITE_API_KEY="mI05OBBknX4gSWwIicRWeK-A-YDi-EWeHYzy7w_agEE"
```

The database Site record currently has:

```json
{
  "id": 2,
  "name": "MedCover",
  "domain": "medcover.io",
  "autoPublish": true,
  "publishWebhookUrl": "https://medcover.io/api/webhooks/publish/",
  "publishWebhookSecret": "2fc08e3bc917dc0cb777447bed4ca0a99c31560ed019444eeb324727b7f2b9c7"
}
```

If the frontend uses a different webhook route (e.g. `/api/revalidate`), use that URL instead.

For images, backend production also needs:

```bash
CLOUDINARY_URL="cloudinary://<api_key>:<api_secret>@<cloud_name>"
GOOGLE_AI_API_KEY="<google-ai-key>"
```

The MedCover `SiteConfig.runtimeConfig` must include:

```json
{
  "enableImageGeneration": true
}
```

## Content API Calls

Every content request must include:

```text
X-Site-Api-Key: <SITE_API_KEY>
X-Site-Id: <SITE_ID>
```

### List Published Pages

Used for `generateStaticParams`, sitemap helpers, or route discovery.

```http
GET /api/v1/content/pages
```

Response shape:

```json
{
  "items": [
    {
      "id": 123,
      "slug": "/guides/spain/health-insurance",
      "language": "EN",
      "updatedAt": "2026-05-22T12:00:00.000Z"
    }
  ]
}
```

### Fetch Page by Slug

Used by public article/guide pages.

```http
GET /api/v1/content/by-slug/guides/spain/health-insurance
```

The slug may be passed with or without the leading slash. The backend normalizes it.

## Page Contract

The backend returns Content API contract `version: "2.1"`.

Important fields:

```ts
type ContentPage = {
  version: "2.1";
  status: "ready" | "failed" | string;
  finalContent: string | null;
  htmlContent: string | null;
  language: string;
  publishedAt: string | null;
  updatedAt: string;
  seo: {
    title: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    canonical: string;
    robotsMeta: string;
    language: string;
    og: {
      title: string | null;
      description: string | null;
      image: string | null;
      type: "article";
      url: string;
    };
    twitter: {
      card: "summary_large_image" | "summary";
      title: string | null;
      description: string | null;
      image: string | null;
    };
    hreflangAlternates: unknown[];
  };
  tableOfContents: Array<{
    level: number;
    text: string;
    anchor: string;
  }>;
  breadcrumbs: Array<{
    name: string;
    slug: string;
    position: number;
  }>;
  faq: Array<{
    question: string;
    answer: string;
  }>;
  heroImage: {
    url: string | null;
    alt: string | null;
    width: number | null;
    height: number | null;
  };
  imagePrompt: string | null;
  schemaMarkup: unknown;
  analysis: unknown;
  meta: unknown;
};
```

Frontend should render:

- `htmlContent` as the main article body.
- `seo.metaTitle` / `seo.metaDescription` in metadata.
- `seo.og.image` and `seo.twitter.image` for social cards.
- `heroImage.url` as the hero image.
- `schemaMarkup` as JSON-LD.
- `breadcrumbs`, `tableOfContents`, and `faq` when present.

## Recommended Fetch Wrapper

```ts
const BASE = process.env.TRAFFIC_ENGINE_URL!;
const SITE_ID = process.env.SITE_ID!;
const SITE_API_KEY = process.env.SITE_API_KEY!;
const REVALIDATE = Number(process.env.CONTENT_REVALIDATE_SECONDS ?? 3600);

function siteHeaders(): HeadersInit {
  return {
    "X-Site-Api-Key": SITE_API_KEY,
    "X-Site-Id": SITE_ID,
  };
}

export async function getPageBySlug(slug: string) {
  const path = slug.startsWith("/") ? slug : `/${slug}`;

  const res = await fetch(`${BASE}/content/by-slug${path}`, {
    headers: siteHeaders(),
    next: {
      revalidate: REVALIDATE,
      tags: [`page-slug-${path}`, `site-${SITE_ID}`],
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Traffic Engine content API failed: ${res.status}`);

  return res.json();
}

export async function listPublishedPages() {
  const res = await fetch(`${BASE}/content/pages`, {
    headers: siteHeaders(),
    next: {
      revalidate: REVALIDATE,
      tags: ["published-pages", `site-${SITE_ID}`],
    },
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
}
```

## Publish Webhook

Backend sends a `POST` request after a page is published.

Recommended frontend route:

```text
POST /api/webhooks/publish
```

Backend request headers:

```text
Content-Type: application/json
X-Publish-Signature: sha256=<hmac-sha256-of-raw-body>
X-Publish-Timestamp: <timestamp>
```

Payload:

```json
{
  "pageId": 123,
  "slug": "/guides/spain/health-insurance",
  "siteId": 4,
  "language": "EN",
  "event": "page.published",
  "timestamp": 1710000000000
}
```

The webhook must:

1. Read the raw request body.
2. Verify `X-Publish-Signature` with `WEBHOOK_SECRET`.
3. Revalidate the page path.
4. Revalidate cache tags.
5. Return `200 OK`.

Example:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";

function verifySignature(body: string, signature: string, secret: string) {
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(req: Request) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return new Response("WEBHOOK_SECRET missing", { status: 500 });

  const body = await req.text();
  const signature = req.headers.get("x-publish-signature") ?? "";

  if (!verifySignature(body, signature, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = JSON.parse(body) as {
    pageId: number;
    slug: string;
    siteId: number;
    language: string;
    event: "page.published" | "page.updated";
    timestamp: number;
  };

  const slugPath = payload.slug.startsWith("/") ? payload.slug : `/${payload.slug}`;

  revalidatePath(slugPath);
  revalidateTag(`page-${payload.pageId}`);
  revalidateTag(`page-slug-${slugPath}`);
  revalidateTag("published-pages");
  revalidateTag(`site-${payload.siteId}`);

  return Response.json({ ok: true });
}
```

If the frontend route includes locale in the public URL, also revalidate the localized path, for example:

```ts
const locale = payload.language.toLowerCase();
revalidatePath(`/${locale}${slugPath}`);
```

## Rendering Requirements

For every MedCover content page:

- Use `htmlContent` from backend. Do not regenerate article HTML on the frontend.
- Use backend `seo` fields in `generateMetadata`.
- Render `schemaMarkup` as JSON-LD.
- Render hero image from `heroImage.url`.
- Use `heroImage.alt`, `width`, and `height`.
- Use `priority` / eager loading for the hero image on article pages.
- Render `faq` and `breadcrumbs` when present.

Hero example:

```tsx
{page.heroImage?.url ? (
  <Image
    src={page.heroImage.url}
    alt={page.heroImage.alt ?? page.seo.title ?? ""}
    width={page.heroImage.width ?? 1200}
    height={page.heroImage.height ?? 630}
    priority
  />
) : null}
```

JSON-LD example:

```tsx
{page.schemaMarkup ? (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(page.schemaMarkup) }}
  />
) : null}
```

## Image Behavior

With MedCover image generation enabled:

1. Backend generates the image prompt.
2. Backend calls Google Imagen model `imagen-3.0-generate-002`.
3. Backend saves base64 image on the page.
4. On publish, backend converts the image to WebP, resizes to `1200px`, uploads to Cloudinary, and stores the Cloudinary URL.
5. Frontend receives that URL in:

```ts
page.heroImage.url
page.seo.og.image
page.seo.twitter.image
```

Frontend does not upload or optimize generated images. It only renders the Cloudinary URL.

## Sitemap and Robots

Frontend can either proxy these backend endpoints or generate equivalent files:

```text
GET /api/v1/sitemap.xml?siteId=<SITE_ID>
GET /api/v1/robots.txt?siteId=<SITE_ID>
```

If proxying, expose them publicly as:

```text
https://medcover.io/sitemap.xml
https://medcover.io/robots.txt
```

## Acceptance Checklist

- Frontend has `TRAFFIC_ENGINE_URL`, `SITE_ID`, `SITE_API_KEY`, `WEBHOOK_SECRET`, and `NEXT_PUBLIC_SITE_URL`.
- `GET /content/pages` works from the frontend server.
- `GET /content/by-slug/*` renders `htmlContent`.
- Metadata uses backend `seo` fields.
- Hero image uses `heroImage.url` from Cloudinary.
- JSON-LD uses `schemaMarkup`.
- Webhook verifies `X-Publish-Signature`.
- Webhook revalidates path and tags.
- Backend MedCover site has `autoPublish: true`.
- Backend MedCover site has `publishWebhookUrl` pointing to the frontend webhook.

