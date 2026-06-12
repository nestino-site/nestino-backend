#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3001}"
BASE="http://localhost:${PORT}/api/v1"

echo "==> Seeding clinic inventory..."
npx prisma db seed 2>&1 | tail -5

echo "==> Seeding MedCover test fixtures..."
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-medcover-test-fixtures.ts

SITE_ID=$(head -1 scripts/output/medcover-test-api-key.txt)
API_KEY=$(tail -1 scripts/output/medcover-test-api-key.txt)

auth_headers=(
  -H "X-Site-Api-Key: ${API_KEY}"
  -H "X-Site-Id: ${SITE_ID}"
)

pass=0
fail=0

assert_status() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS $name (HTTP $actual)"
    pass=$((pass + 1))
  else
    echo "  FAIL $name (expected HTTP $expected, got $actual)"
    fail=$((fail + 1))
  fi
}

assert_json() {
  local name="$1"
  local expr="$2"
  local body="$3"
  if echo "$body" | jq -e "$expr" >/dev/null 2>&1; then
    echo "  PASS $name"
    pass=$((pass + 1))
  else
    echo "  FAIL $name (jq: $expr)"
    echo "$body" | head -c 500
    fail=$((fail + 1))
  fi
}

echo "==> Building and starting server on port ${PORT}..."
npm run build >/tmp/medcover-api-test-build.log 2>&1
export SITE_API_KEY_HMAC_SECRET="${SITE_API_KEY_HMAC_SECRET:-local-test-site-api-key-hmac-secret-32chars}"
PORT="${PORT}" node dist/main >/tmp/medcover-api-test.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${auth_headers[@]}" "${BASE}/content/taxonomy" 2>/dev/null || echo "000")
  if [[ "$code" == "200" ]]; then
    echo "Server ready after ${i}s"
    break
  fi
  sleep 1
done

echo ""
echo "==> Catalog API tests"
echo ""

# taxonomy
code=$(curl -s -o /tmp/taxonomy.json -w '%{http_code}' "${auth_headers[@]}" "${BASE}/content/taxonomy")
assert_status "GET /content/taxonomy" "200" "$code"
assert_json "taxonomy has countries" '.countries | length > 0' "$(cat /tmp/taxonomy.json)"
assert_json "taxonomy has treatments" '.treatments | length > 0' "$(cat /tmp/taxonomy.json)"
assert_json "taxonomy spain flag" '.countries[] | select(.slug=="spain") | .flagEmoji != null' "$(cat /tmp/taxonomy.json)"

# clinics list
code=$(curl -s -o /tmp/clinics.json -w '%{http_code}' "${auth_headers[@]}" "${BASE}/content/clinics?country=spain&limit=10")
assert_status "GET /content/clinics" "200" "$code"
assert_json "clinics list has items" '.items | length >= 1' "$(cat /tmp/clinics.json)"

code=$(curl -s -o /tmp/clinics-filter.json -w '%{http_code}' "${auth_headers[@]}" "${BASE}/content/clinics?minRating=4&minTruthScore=70&sort=price_asc")
assert_status "GET /content/clinics filters" "200" "$code"

# PDP
code=$(curl -s -o /tmp/pdp.json -w '%{http_code}' "${auth_headers[@]}" "${BASE}/content/clinics/spain/barcelona/instituto-marques")
assert_status "GET /content/clinics PDP" "200" "$code"
assert_json "PDP has truthScore" '.truthScore.composite == 84' "$(cat /tmp/pdp.json)"
assert_json "PDP has pricingPackages" '.pricingPackages | length >= 1' "$(cat /tmp/pdp.json)"

code=$(curl -s -o /dev/null -w '%{http_code}' "${auth_headers[@]}" "${BASE}/content/clinics/spain/barcelona/nonexistent-clinic")
assert_status "GET /content/clinics PDP 404" "404" "$code"

# costs
code=$(curl -s -o /tmp/costs.json -w '%{http_code}' "${auth_headers[@]}" "${BASE}/content/costs/ivf?country=spain")
assert_status "GET /content/costs/ivf" "200" "$code"
assert_json "costs has overall sample" '.overall.sampleSize >= 1' "$(cat /tmp/costs.json)"

# search
code=$(curl -s -o /tmp/search.json -w '%{http_code}' "${auth_headers[@]}" "${BASE}/content/search?q=instituto")
assert_status "GET /content/search" "200" "$code"
assert_json "search finds clinic" '.clinics | length >= 1' "$(cat /tmp/search.json)"

code=$(curl -s -o /tmp/search-empty.json -w '%{http_code}' "${auth_headers[@]}" "${BASE}/content/search")
assert_status "GET /content/search empty" "200" "$code"
assert_json "search suggestions" '.suggestions.countries | length >= 1' "$(cat /tmp/search-empty.json)"

# compare
code=$(curl -s -o /tmp/compare.json -w '%{http_code}' "${auth_headers[@]}" "${BASE}/content/compare?type=clinic&a=instituto-marques&b=genesis-athens")
assert_status "GET /content/compare clinic" "200" "$code"
assert_json "compare has entityA" '.entityA.name != null' "$(cat /tmp/compare.json)"

code=$(curl -s -o /dev/null -w '%{http_code}' "${auth_headers[@]}" "${BASE}/content/compare?type=country&a=spain&b=greece&treatment=ivf")
assert_status "GET /content/compare country" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "${auth_headers[@]}" "${BASE}/content/compare?type=country&a=unknown&b=greece&treatment=ivf")
assert_status "GET /content/compare 404" "404" "$code"

echo ""
echo "==> Slug migration dry-run"
npm run migrate:medcover-slugs -- --dry-run 2>&1 | tail -3

echo ""
echo "==> Hub seed"
npm run seed:medcover-hubs 2>&1 | tail -6

echo ""
echo "=============================="
echo "Results: ${pass} passed, ${fail} failed"
if [[ "$fail" -gt 0 ]]; then
  echo "Server log: /tmp/medcover-api-test.log"
  exit 1
fi
echo "All tests passed."
