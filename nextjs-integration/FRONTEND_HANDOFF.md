# Traffic Engine → Next.js: what to add (frontend brief)

Send this to whoever builds or maintains the Next.js app (or paste it into Cursor as context). It lists **what to copy**, **env vars**, **how the backend must be configured per site**, and **what you must wire in the App Router**.

---

## 1. Copy these files into the Next.js repo

| Source (this repo) | Destination in Next.js |
|--------------------|-------------------------|
| `app/api/revalidate/route.ts` | `app/api/revalidate/route.ts` |
| `app/api/content-status/route.ts` | `app/api/content-status/route.ts` |
| `lib/content-api.ts` | `lib/content-api.ts` (adjust `@/` import paths if your aliases differ) |
| `hooks/useContentStatus.ts` | `hooks/useContentStatus.ts` |

**Why each piece**

- **`/api/revalidate`** — The backend calls this URL when a page is published. It verifies an HMAC signature and runs `revalidatePath` + `revalidateTag` so cached HTML and tagged fetches refresh.
- **`/api/content-status`** — Server-side proxy so the browser can poll generation status without exposing `BACKEND_URL` or API keys.
- **`lib/content-api.ts`** — Server Components should fetch article HTML/metadata from the backend using `fetchPageContent(pageId)` (uses cache tags that revalidation clears).
- **`useContentStatus`** — Optional UI for “generating…” / “live” while the pipeline runs.

---

## 2. Environment variables (Next.js hosting)

Add to `.env.local` (and to Vercel/hosting env):

| Variable | Required | Purpose |
|----------|----------|---------|
| `BACKEND_URL` | Yes | Base URL of the Nest Traffic Engine API (no trailing slash), e.g. `https://api.example.com` |
| `PUBLISH_WEBHOOK_SECRET` | Yes for revalidation | Shared secret; **must match** `publishWebhookSecret` on the Site record in the backend |
| `BACKEND_API_KEY` | If your API uses it | Sent as `X-Api-Key` on server-side requests to the backend |

**Important:** `PUBLISH_WEBHOOK_SECRET` is per-site in the backend. If you run multiple Next deployments per brand, each site should have its own secret and matching Next env (or one secret shared across sites if you accept that scope).

---

## 3. Backend configuration someone must set per site

For each logical “site” in Traffic Engine, the API must be updated so publish events hit **your** Next deployment:

```http
PATCH /api/v1/sites/:siteId
Content-Type: application/json

{
  "publishWebhookUrl": "https://<your-next-domain>/api/revalidate",
  "publishWebhookSecret": "<same string as PUBLISH_WEBHOOK_SECRET>",
  "autoPublish": true
}
```

- **`autoPublish: true`** — After AI finishes, the backend marks the page published and POSTs to `/api/revalidate` automatically.
- **`autoPublish: false`** — Content stays ready but not published until someone calls `POST /api/v1/pages/:pageId/publish` on the backend.

---

## 4. App Router wiring (your responsibility)

The copied helpers are not enough by themselves; pages must **use** them consistently.

1. **Article route** — Use `fetchPageContent(pageId)` from server components for the canonical HTML/content. It tags fetches with `pageId` so the webhook can invalidate that cache entry.

2. **`revalidatePath` path must match real URLs** — The webhook handler calls `revalidatePath(payload.slug)` with the **slug string stored in the backend**. If your public URLs are not exactly `/<slug>` (e.g. they are `/blog/<slug>` or localized), **change `app/api/revalidate/route.ts`** so the path passed to `revalidatePath` matches the segment visitors use (e.g. `revalidatePath(\`/blog/${payload.slug}\`)`).

3. **Routing strategy** — You need a stable mapping from URL → `pageId` (or resolve slug → page via backend). The backend stores both `pageId` and `slug`; your routing must agree with how marketing/links are built.

4. **Optional polling UX** — Use `useContentStatus(pageId)` calling `/api/content-status?pageId=…` for dashboards or “generation in progress” states.

---

## 5. End-to-end flow (for debugging)

1. Backend finishes pipeline → page `pipelineStatus` = `READY`.
2. If `autoPublish` is true → backend sets page to published and **POSTs** to `publishWebhookUrl` with JSON body `{ pageId, slug, siteId, event: "page.published", timestamp }` and header `X-Publish-Signature: sha256=<hmac-of-raw-body>`.
3. Next `/api/revalidate` checks the signature, then `revalidatePath` + `revalidateTag(pageId)`.
4. Next request to the article route refetches from `GET ${BACKEND_URL}/api/v1/content/:pageId` and shows new content.

---

## 6. Quick verification checklist

- [ ] All four files copied; TypeScript paths resolve (`@/hooks`, `@/lib`, etc.).
- [ ] `BACKEND_URL` and `PUBLISH_WEBHOOK_SECRET` set where the app runs.
- [ ] Site record patched with `publishWebhookUrl` pointing to **production** HTTPS URL of `/api/revalidate`.
- [ ] Article pages use `fetchPageContent` (or equivalent tagged fetch to the same API).
- [ ] `revalidatePath` argument matches the real public path for that slug.

---

## 7. Docs in this folder

See [`README.md`](./README.md) in `nextjs-integration` for the same flow, bulk-generate note, and curl examples.
