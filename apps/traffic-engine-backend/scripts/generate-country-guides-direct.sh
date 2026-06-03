#!/usr/bin/env bash
# Create and publish all 6 MedCover country IVF guides via direct page pipeline
# (bypasses async idea-generation queue — more reliable on Railway).
#
# Usage:
#   BASE_URL=https://nestino-backend-production.up.railway.app \
#   ADMIN_PASSWORD=... \
#   ./scripts/generate-country-guides-direct.sh

set -euo pipefail

BASE_URL="${BASE_URL:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SITE_DOMAIN="${SITE_DOMAIN:-medcover.io}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-15}"
MAX_PIPELINE_WAIT_SEC="${MAX_PIPELINE_WAIT_SEC:-900}"
SKIP_PUBLISH="${SKIP_PUBLISH:-false}"

if [[ -z "${BASE_URL}" || -z "${ADMIN_PASSWORD}" ]]; then
  echo "Usage: BASE_URL=https://... ADMIN_PASSWORD=... $0" >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
ACCESS_TOKEN=""
jq -n '{}' > "${TMP_DIR}/empty.json"

log() { printf '[country-guides] %s\n' "$*" >&2; }

retry_curl() {
  local max="${RETRY_MAX:-8}" attempt=1 out=""
  while (( attempt <= max )); do
    if out="$(curl -sS --http1.1 "$@" 2>/dev/null)"; then
      printf '%s' "${out}"
      return 0
    fi
    sleep $((attempt * 3))
    attempt=$((attempt + 1))
  done
  return 1
}

request() {
  local method="$1"
  local path="$2"
  local payload_file="${3:-}"
  local response_file="${TMP_DIR}/response.json"
  local status
  local curl_args=(-sS --http1.1 -o "${response_file}" -w "%{http_code}" -X "${method}" "${BASE_URL}${path}" -H "Accept: application/json")

  if [[ -n "${ACCESS_TOKEN}" ]]; then
    curl_args+=(-H "Authorization: Bearer ${ACCESS_TOKEN}")
  fi
  if [[ -n "${payload_file}" ]]; then
    curl_args+=(-H "Content-Type: application/json" --data-binary "@${payload_file}")
  fi

  status="$(curl "${curl_args[@]}" 2>/dev/null || echo 000)"
  if [[ "${status}" == "000" ]]; then
    # one retry via retry_curl for flaky Railway connections
    status="$(retry_curl "${curl_args[@]}" 2>/dev/null | tail -1 || echo 000)"
  fi
  if [[ "${status}" -lt 200 || "${status}" -ge 300 ]]; then
    echo "Request failed: ${method} ${path} (${status})" >&2
    if [[ -s "${response_file}" ]]; then sed 's/^/  /' "${response_file}" >&2; fi
    return 1
  fi
  jq -c . "${response_file}"
}

login() {
  jq -n --arg email "${ADMIN_EMAIL}" --arg password "${ADMIN_PASSWORD}" '{email:$email,password:$password}' \
    > "${TMP_DIR}/login.json"
  ACCESS_TOKEN="$(request POST /api/v1/identity/login "${TMP_DIR}/login.json" | jq -r '.accessToken')"
}

normalize_slug() {
  local slug="${1%/}"
  [[ "${slug}" == /* ]] || slug="/${slug}"
  printf '%s\n' "${slug}"
}

get_site_id() {
  request GET "/api/v1/sites" | jq -r --arg domain "${SITE_DOMAIN}" 'first(.[] | select(.domain == $domain) | .id) // empty'
}

find_page_by_slug() {
  local site_id="$1"
  local expected_slug="$2"
  request GET "/api/v1/pages?siteId=${site_id}" | jq -r --arg slug "$(normalize_slug "${expected_slug}")" '
    first(.[] | select((.slug | rtrimstr("/")) == ($slug | rtrimstr("/"))) | .id) // empty'
}

wait_for_page_ready() {
  local page_id="$1"
  local deadline=$((SECONDS + MAX_PIPELINE_WAIT_SEC))
  local status=""

  while (( SECONDS < deadline )); do
    status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus // empty')"
    case "${status}" in
      READY) return 0 ;;
      PARTIALLY_COMPLETED)
        log "  page ${page_id} PARTIALLY_COMPLETED — retrying image generation"
        request POST "/api/v1/pages/${page_id}/retry-image-generation" "${TMP_DIR}/empty.json" >/dev/null || true
        ;;
      FAILED)
        log "Pipeline FAILED for page ${page_id}"
        return 1 ;;
    esac
    log "  page ${page_id} pipelineStatus=${status:-unknown}"
    sleep "${POLL_INTERVAL_SEC}"
  done
  return 1
}

process_country() {
  local site_id="$1"
  local keyword="$2"
  local slug="$3"
  local title="$4"
  local meta_description="$5"
  local page_id keyword_id keyword_response page_response

  slug="$(normalize_slug "${slug}")"
  log "=== ${title} → ${slug} ==="

  page_id="$(find_page_by_slug "${site_id}" "${slug}")"
  if [[ -n "${page_id}" ]]; then
    local page_status pipeline_status
    page_status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.status')"
    pipeline_status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus')"
    log "Existing page id=${page_id} status=${page_status} pipeline=${pipeline_status}"
    if [[ "${page_status}" == "PUBLISHED" ]]; then return 0; fi
    if [[ "${pipeline_status}" != "READY" ]]; then
      wait_for_page_ready "${page_id}" || return 1
    fi
  else
    jq -n \
      --argjson siteId "${site_id}" \
      --arg keyword "${keyword}" \
      --arg targetUrl "${slug}" \
      '{siteId:$siteId, keyword:$keyword, language:"EN", intent:"COMMERCIAL", priority:90, targetUrl:$targetUrl}' \
      > "${TMP_DIR}/keyword.json"
    keyword_response="$(request POST /api/v1/keywords "${TMP_DIR}/keyword.json")"
    keyword_id="$(printf '%s' "${keyword_response}" | jq -r '.id')"

    jq -n \
      --argjson siteId "${site_id}" \
      --argjson keywordId "${keyword_id}" \
      --arg slug "${slug}" \
      --arg title "${title}" \
      --arg metaTitle "${title} | MedCover" \
      --arg metaDescription "${meta_description}" \
      '{siteId:$siteId, keywordId:$keywordId, slug:$slug, language:"EN", title:$title, metaTitle:$metaTitle, metaDescription:$metaDescription}' \
      > "${TMP_DIR}/page.json"
    page_response="$(request POST /api/v1/pages "${TMP_DIR}/page.json")"
    page_id="$(printf '%s' "${page_response}" | jq -r '.id')"
    log "Created page id=${page_id} keyword id=${keyword_id}"

    request POST "/api/v1/pages/${page_id}/generate-content?resetCheckpoint=true" "${TMP_DIR}/empty.json" >/dev/null
    log "Queued content generation for page ${page_id}"
    wait_for_page_ready "${page_id}" || return 1
  fi

  if [[ "${SKIP_PUBLISH}" == "true" ]]; then
    log "SKIP_PUBLISH=true — page ${page_id} ready"
    return 0
  fi

  request POST "/api/v1/pages/${page_id}/publish" "${TMP_DIR}/empty.json" >/dev/null
  log "Published page ${page_id}"
}

main() {
  local site_id
  local -a failures=()

  login
  site_id="$(get_site_id)"
  if [[ -z "${site_id}" ]]; then
    log "Site not found: ${SITE_DOMAIN}"
    exit 1
  fi
  log "Site id=${site_id} domain=${SITE_DOMAIN}"

  process_country "${site_id}" "ivf spain" "/guides/spain-ivf-guide" \
    "IVF in Spain: What Real Patients Told Us" \
    "Based on verified patient interviews, IVF in Spain costs from €3,200. See real clinic rankings, hidden costs, and patient quotes." \
    || failures+=("Spain")

  process_country "${site_id}" "ivf greece" "/guides/greece-ivf-guide" \
    "IVF in Greece: What Real Patients Told Us" \
    "Based on verified patient interviews, IVF in Greece costs from €2,800. Mediterranean care with real clinic data and patient quotes." \
    || failures+=("Greece")

  process_country "${site_id}" "ivf czech republic" "/guides/czech-republic-ivf-guide" \
    "IVF in Czech Republic: What Real Patients Told Us" \
    "Affordable IVF in Czech Republic from €2,400. Verified clinic rankings, hidden costs, and patient interview data." \
    || failures+=("Czech Republic")

  process_country "${site_id}" "ivf turkey" "/guides/turkey-ivf-guide" \
    "IVF in Turkey: What Real Patients Told Us" \
    "IVF in Turkey from €2,600. Growing success rates, verified costs, clinic rankings, and patient quotes." \
    || failures+=("Turkey")

  process_country "${site_id}" "ivf portugal" "/guides/portugal-ivf-guide" \
    "IVF in Portugal: What Real Patients Told Us" \
    "IVF in Portugal from €3,000. Atlantic coast option with verified clinic data, costs, and patient insights." \
    || failures+=("Portugal")

  process_country "${site_id}" "ivf north macedonia" "/guides/north-macedonia-ivf-guide" \
    "IVF in North Macedonia: What Real Patients Told Us" \
    "Budget-friendly IVF in North Macedonia from €1,900. Verified costs, clinic rankings, and patient interview data." \
    || failures+=("North Macedonia")

  if ((${#failures[@]} > 0)); then
    log "Failed: ${failures[*]}"
    exit 1
  fi
  log "All 6 country guides processed."
}

main "$@"
