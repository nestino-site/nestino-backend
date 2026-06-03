# Next.js Integration — Traffic Engine

Copy the files in this folder into your Next.js project.

## Files

| File | Copy to | Purpose |
|------|---------|---------|
| `app/api/revalidate/route.ts` | `app/api/revalidate/route.ts` | Receives publish webhook from backend, clears page cache |
| `app/api/content-status/route.ts` | `app/api/content-status/route.ts` | Proxy to backend for client-side polling |
| `hooks/useContentStatus.ts` | `hooks/useContentStatus.ts` | Client hook to show live generation progress |
| `lib/content-api.ts` | `lib/content-api.ts` | Server component helpers to fetch content |

## Environment variables

Add to your `.env.local`:

```env
# URL of the NestJS backend
BACKEND_URL=https://your-backend.com

# Must match Site.publishWebhookSecret for this site
PUBLISH_WEBHOOK_SECRET=your-secret-per-site

# Optional: internal API key if your backend requires it
BACKEND_API_KEY=
```

## Backend setup per site

For each site, set the webhook config via:

```http
PATCH /api/v1/sites/:id
{
  "publishWebhookUrl": "https://your-next-site.com/api/revalidate",
  "publishWebhookSecret": "your-secret-per-site",
  "autoPublish": true
}
```

Set `autoPublish: false` if you want pages to stay in READY state until you manually call:

```http
POST /api/v1/pages/:id/publish
```

## Full flow

```
1. Backend generates content for a keyword
2. Pipeline finishes → pipelineStatus = READY
3. autoPublish=true → PublishService fires
   → page.status = PUBLISHED, publishedAt = now
   → POST https://your-next-site.com/api/revalidate
       body: { pageId, slug, siteId, event: "page.published", timestamp }
       header: X-Publish-Signature: sha256=<hmac>
4. Next.js /api/revalidate:
   → verifies HMAC
   → calls revalidatePath(slug) + revalidateTag(pageId)
   → page cache is cleared instantly
5. Next visitor hits the page → Next.js re-fetches from backend → serves fresh content
```

## Bulk generation (multiple sites / keywords at once)

```http
POST /api/v1/sites/:siteId/bulk-generate
{
  "keywordIds": ["kw1", "kw2", "kw3", ...]
}
```

Response:
```json
{ "queued": 3, "skipped": 0, "taskIds": ["task1", "task2", "task3"] }
```

Skips keywords that already have a page on that site to avoid duplicates.
