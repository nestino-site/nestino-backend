#!/usr/bin/env bash
# One IVF clinic discovery test for Barcelona (Google Places → enrich → show full candidate JSON)
set -euo pipefail

INVENTORY_URL="${INVENTORY_URL:-http://localhost:3003/api/v1}"
AUTH_URL="${AUTH_URL:-http://localhost:3001/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-NestinoTest2026!}"
CITY_ID="${CITY_ID:-1}"
POLL_MAX="${POLL_MAX:-90}"
POLL_SEC="${POLL_SEC:-3}"

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

log() { printf '[barcelona-places-test] %s\n' "$*"; }

# Login
login_code="$(curl -sS -o "${TMP}/login.json" -w "%{http_code}" -X POST "${AUTH_URL}/identity/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}")"
if [[ "${login_code}" -lt 200 || "${login_code}" -ge 300 ]]; then
  log "Login failed (${login_code})"
  cat "${TMP}/login.json" >&2
  exit 1
fi
TOKEN="$(jq -r '.accessToken' "${TMP}/login.json")"
log "Logged in as ${ADMIN_EMAIL}"

# Start discovery run — limit to 1 result for a quick single-clinic test
run_body="$(jq -n \
  --argjson cityId "${CITY_ID}" \
  '{
    cityId: $cityId,
    dryRun: false,
    configOverride: {
      pipeline: {
        dryRun: false,
        steps: [
          {
            stepKey: "places_search",
            enabled: true,
            params: {
              keywords: ["IVF clinic Barcelona"],
              radiusKm: 15,
              maxResults: 1,
              pageDepth: 1
            }
          },
          { stepKey: "dedup", enabled: true, params: {} },
          {
            stepKey: "places_details",
            enabled: true,
            params: {
              fields: ["website", "phone", "opening_hours", "photos", "reviews", "business_status", "formatted_address", "geometry", "rating", "user_ratings_total"]
            }
          },
          {
            stepKey: "website_fetch",
            enabled: true,
            params: { timeoutMs: 10000, maxPages: 2, pathHints: ["/precios", "/pricing", "/about"] }
          },
          { stepKey: "llm_extract", enabled: false, params: {} },
          { stepKey: "llm_pricing", enabled: false, params: {} },
          {
            stepKey: "score",
            enabled: true,
            params: {
              weights: {
                nameMatch: 0.25,
                websiteResolves: 0.15,
                fertilityTerms: 0.2,
                accreditation: 0.15,
                insidePolygon: 0.15,
                operational: 0.1
              },
              publishThreshold: 0.85
            }
          },
          {
            stepKey: "publish_gate",
            enabled: true,
            params: {
              requireHumanReview: true,
              minimumFields: ["websiteUrl", "addressLine"],
              maxAutoPublishesPerRun: 0
            }
          }
        ]
      }
    }
  }')"

run_code="$(curl -sS -o "${TMP}/run.json" -w "%{http_code}" -X POST "${INVENTORY_URL}/discovery/runs" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${run_body}")"
if [[ "${run_code}" -lt 200 || "${run_code}" -ge 300 ]]; then
  log "Start run failed (${run_code})"
  cat "${TMP}/run.json" >&2
  exit 1
fi
RUN_ID="$(jq -r '.id' "${TMP}/run.json")"
log "Discovery run ${RUN_ID} started for cityId=${CITY_ID}"

# Poll until we have at least one candidate past NEW/ENRICHING
for ((i = 1; i <= POLL_MAX; i++)); do
  sleep "${POLL_SEC}"
  curl -sS -o "${TMP}/candidates.json" \
    -H "Authorization: Bearer ${TOKEN}" \
    "${INVENTORY_URL}/discovery/candidates?runId=${RUN_ID}"

  count="$(jq 'length' "${TMP}/candidates.json")"
  done_count="$(jq '[.[] | select(.status != "NEW" and .status != "ENRICHING")] | length' "${TMP}/candidates.json")"

  log "Poll ${i}/${POLL_MAX}: ${count} candidate(s), ${done_count} finished enriching"

  if [[ "${done_count}" -ge 1 ]]; then
    jq '.[0]' "${TMP}/candidates.json" > "${TMP}/clinic.json"
    log "Full enriched candidate (first finished):"
    jq '.' "${TMP}/clinic.json"
    exit 0
  fi

  curl -sS -o "${TMP}/run-status.json" \
    -H "Authorization: Bearer ${TOKEN}" \
    "${INVENTORY_URL}/discovery/runs/${RUN_ID}" >/dev/null
  run_status="$(jq -r '.status' "${TMP}/run-status.json")"
  if [[ "${run_status}" == "FAILED" ]]; then
    log "Run FAILED:"
    jq '.' "${TMP}/run-status.json"
    exit 1
  fi
done

log "Timed out waiting for enrichment. Latest candidates:"
jq '.' "${TMP}/candidates.json"
exit 1
