# Next.js SEO Integration (Backend)

**Full frontend guide:** [Doc/front integration/NEXTJS_INTEGRATION.md](../../../Doc/front%20integration/NEXTJS_INTEGRATION.md)

## Backend capabilities

- **Content API v2.1** — `htmlContent` (Markdown → HTML), `generatedImageCdnUrl`, SEO fields, JSON-LD
- **Publish** — hero WebP to `IMAGE_UPLOADS_DIR/pages/{pageId}/hero.webp` when `CDN_BASE_URL` is set
- **Webhooks** — HMAC-signed publish events; failures stored in `webhook_deliveries` and retried via BullMQ
- **Site-scoped routes** — `GET /content/pages`, `GET /content/by-slug/*path` (`X-Site-Api-Key` + `X-Site-Id`)

## Webhook payload

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

Header: `X-Publish-Signature: sha256=<hmac-sha256 of raw body>`.
