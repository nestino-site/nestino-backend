#!/usr/bin/env bash
# Set MedCover site gscProperty to sc-domain:medcover.io (domain property in Search Console).
set -euo pipefail

BASE="${TRAFFIC_ENGINE_URL:-https://nestino-backend-production.up.railway.app/api/v1}"
SITE_ID="${SITE_ID:-2}"
GSC_PROPERTY="${GSC_PROPERTY:-sc-domain:medcover.io}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

if [[ -z "${ADMIN_PASSWORD}" ]]; then
  echo "ADMIN_PASSWORD is required." >&2
  exit 1
fi

echo "==> Login"
TOKEN=$(curl -sS --max-time 30 -X POST "$BASE/identity/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")

echo "==> Patch site $SITE_ID gscProperty=$GSC_PROPERTY"
curl -sS --max-time 30 -X PATCH "$BASE/sites/$SITE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"gscProperty\":\"$GSC_PROPERTY\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('id:', d.get('id')); print('domain:', d.get('domain')); print('gscProperty:', d.get('gscProperty'))"

echo "Done. Ensure gsc-metrics-sync@... is added as a user on the GSC property."
