# Next.js SEO Integration (Backend)

See the full integration guide in the frontend app:

**[traffic-engine-frontend/docs/NEXTJS_INTEGRATION.md](../../traffic-engine-frontend/docs/NEXTJS_INTEGRATION.md)**

## Backend changes summary

- **Content API v2.1** — `htmlContent` (Markdown → HTML via `markdown-it`), `generatedImageCdnUrl`
- **Publish** — uploads hero WebP to `IMAGE_UPLOADS_DIR/pages/{pageId}/hero.webp` when `CDN_BASE_URL` is set
- **Webhooks** — failed deliveries stored in `webhook_deliveries`, retried via BullMQ cron
- **Site-scoped routes** — `GET /content/pages`, `GET /content/by-slug/*path` (headers: `X-Site-Api-Key`, `X-Site-Id`)

## Webhook payload (includes `language` for locale revalidation)

```json
{
  "pageId": 1,
  "slug": "/example-page",
  "siteId": 1,
  "language": "EN",
  "event": "page.published",
  "timestamp": 1710000000000
}
```
