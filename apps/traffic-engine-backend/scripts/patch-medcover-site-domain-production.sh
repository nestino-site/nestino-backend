#!/usr/bin/env bash
# Patch MedCover site (id=2) domain + webhook to www, then republish one page to bust frontend cache.
set -euo pipefail

BASE="${TRAFFIC_ENGINE_URL:-https://nestino-backend-production.up.railway.app/api/v1}"
SITE_ID="${SITE_ID:-2}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-NestinoTest2026!}"

echo "==> Login"
TOKEN=$(curl -sS --max-time 30 -X POST "$BASE/identity/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")

echo "==> Patch site $SITE_ID domain + webhook"
curl -sS --max-time 30 -X PATCH "$BASE/sites/$SITE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "www.medcover.io",
    "publishWebhookUrl": "https://www.medcover.io/api/webhooks/publish/"
  }' | python3 -c "import json,sys; d=json.load(sys.stdin); print('domain:', d.get('domain')); print('webhook:', d.get('publishWebhookUrl'))"

echo "==> Verify sitemap endpoints (requires deployed ParseOptionalIntQuery fix)"
for url in \
  "$BASE/sitemap.xml?siteId=$SITE_ID" \
  "$BASE/sitemap.xml?domain=www.medcover.io" \
  "$BASE/sites/$SITE_ID/sitemap.xml"; do
  code=$(curl -sS -o /tmp/sitemap-test.xml -w "%{http_code}" --max-time 45 "$url" || echo "000")
  count=$(grep -c "<loc>" /tmp/sitemap-test.xml 2>/dev/null || echo 0)
  echo "$url -> HTTP $code, urls=$count"
done

echo "==> Republish one clinic page to revalidate frontend published-pages cache"
curl -sS --max-time 60 -X POST "$BASE/pages/204/publish" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import json,sys; d=json.load(sys.stdin); print('page 204 publish:', d.get('webhookFired', d))"

echo "Done."
