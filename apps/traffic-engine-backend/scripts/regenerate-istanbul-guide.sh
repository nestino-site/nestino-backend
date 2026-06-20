#!/usr/bin/env bash
# Regenerate Istanbul hair restoration city guide (page 461) and publish when READY.
set -euo pipefail

BASE_URL="${BASE_URL:-https://nestino-backend-production.up.railway.app}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
PAGE_ID="${PAGE_ID:-461}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-20}"
MAX_PIPELINE_WAIT_SEC="${MAX_PIPELINE_WAIT_SEC:-1200}"

[[ -n "${ADMIN_PASSWORD}" ]] || {
  echo "Usage: ADMIN_PASSWORD=... $0" >&2
  exit 1
}

BASE_URL="${BASE_URL%/}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

log() { printf '[istanbul-regen] %s\n' "$*" >&2; }

TOKEN=$(curl -sS --max-time 30 -X POST "$BASE_URL/api/v1/identity/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" | jq -r '.accessToken')
[[ -n "${TOKEN}" && "${TOKEN}" != "null" ]] || { log "Login failed"; exit 1; }

log "Queue generation for page ${PAGE_ID} (resetCheckpoint=true)"
curl -sS --max-time 60 -w "\nHTTP:%{http_code}\n" -X POST \
  "$BASE_URL/api/v1/pages/${PAGE_ID}/generate-content?resetCheckpoint=true" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d '{}' | tee "$TMP/queue.json"

deadline=$((SECONDS + MAX_PIPELINE_WAIT_SEC))
while (( SECONDS < deadline )); do
  curl -sS --max-time 120 "$BASE_URL/api/v1/pages/${PAGE_ID}" \
    -H "Authorization: Bearer ${TOKEN}" > "$TMP/page.json"
  ps=$(jq -r '.pipelineStatus' "$TMP/page.json")
  raw_h1=$(jq -r '(.rawDraft // "") | split("\n")[0]' "$TMP/page.json")
  has_greece=$(jq -r '(.rawDraft // "") | test("Hair Transplant in Greece"; "i")' "$TMP/page.json")
  has_istanbul=$(jq -r '(.rawDraft // "") | test("Istanbul"; "i")' "$TMP/page.json")
  log "pipeline=${ps} greece_h1=${has_greece} istanbul=${has_istanbul} h1=${raw_h1:0:90}"

  if [[ "${ps}" == "PARTIALLY_COMPLETED" ]]; then
    curl -sS --max-time 120 -X POST "$BASE_URL/api/v1/pages/${PAGE_ID}/complete-pipeline" \
      -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d '{}' >/dev/null || true
  fi

  if [[ "${ps}" == "READY" && "${has_greece}" == "false" && "${has_istanbul}" == "true" ]]; then
    break
  fi
  if [[ "${ps}" == "FAILED" ]]; then
    jq '{pipelineStatus, contentAuditResult}' "$TMP/page.json"
    exit 1
  fi
  sleep "${POLL_INTERVAL_SEC}"
done

if (( SECONDS >= deadline )); then
  log "Timed out waiting for correct Istanbul draft"
  jq '{pipelineStatus, rawH1: ((.rawDraft // "") | split("\n")[0])}' "$TMP/page.json"
  exit 1
fi

log "Publishing page ${PAGE_ID}"
curl -sS --max-time 60 -X POST "$BASE_URL/api/v1/pages/${PAGE_ID}/publish" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d '{}' >/dev/null

curl -sS --max-time 120 "$BASE_URL/api/v1/pages/${PAGE_ID}" \
  -H "Authorization: Bearer ${TOKEN}" | jq '{
    pageId: .id,
    slug: .slug,
    status: .status,
    finalH1: (.finalContent | split("\n")[0]),
    pass: ((.finalContent | test("Istanbul"; "i")) and ((.finalContent | test("Hair Transplant in Greece"; "i")) | not))
  }'
