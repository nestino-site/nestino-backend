#!/usr/bin/env bash
# Create and publish hair restoration country guides (Template HR-A) via direct page pipeline.
#
# Usage:
#   BASE_URL=https://nestino-backend-production.up.railway.app \
#   ADMIN_PASSWORD=... \
#   ./scripts/generate-hair-restoration-country-guides-direct.sh

set -euo pipefail

BASE_URL="${BASE_URL:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SITE_DOMAIN="${SITE_DOMAIN:-www.medcover.io}"
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

log() { printf '[hr-country-guides] %s\n' "$*" >&2; }

request() {
  local method="$1" path="$2" payload_file="${3:-}"
  local response_file="${TMP_DIR}/response.json" status
  local curl_args=(-sS --http1.1 -o "${response_file}" -w "%{http_code}" -X "${method}" "${BASE_URL}${path}" -H "Accept: application/json")
  [[ -n "${ACCESS_TOKEN}" ]] && curl_args+=(-H "Authorization: Bearer ${ACCESS_TOKEN}")
  [[ -n "${payload_file}" ]] && curl_args+=(-H "Content-Type: application/json" --data-binary "@${payload_file}")
  status="$(curl "${curl_args[@]}" 2>/dev/null || echo 000)"
  if [[ "${status}" -lt 200 || "${status}" -ge 300 ]]; then
    echo "Request failed: ${method} ${path} (${status})" >&2
    [[ -s "${response_file}" ]] && sed 's/^/  /' "${response_file}" >&2
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
  local site_id="$1" expected_slug="$2"
  request GET "/api/v1/pages?siteId=${site_id}" | jq -r --arg slug "$(normalize_slug "${expected_slug}")" '
    first(.[] | select((.slug | rtrimstr("/")) == ($slug | rtrimstr("/"))) | .id) // empty'
}

wait_for_page_ready() {
  local page_id="$1" deadline=$((SECONDS + MAX_PIPELINE_WAIT_SEC)) status=""
  while (( SECONDS < deadline )); do
    status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus // empty')"
    case "${status}" in
      READY) return 0 ;;
      PARTIALLY_COMPLETED)
        log "  page ${page_id} PARTIALLY_COMPLETED — trying complete-pipeline"
        request POST "/api/v1/pages/${page_id}/complete-pipeline" "${TMP_DIR}/empty.json" >/dev/null || true
        status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus // empty')"
        [[ "${status}" == "READY" ]] && return 0
        log "  page ${page_id} still ${status:-unknown} — mark-content-ready"
        request POST "/api/v1/pages/${page_id}/mark-content-ready" "${TMP_DIR}/empty.json" >/dev/null || true
        status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus // empty')"
        [[ "${status}" == "READY" ]] && return 0
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

process_page() {
  local site_id="$1" keyword="$2" slug="$3" title="$4" meta_description="$5" notes="$6"
  local page_id keyword_id slug_norm
  slug_norm="$(normalize_slug "${slug}")"
  log "=== ${title} → ${slug_norm} ==="

  page_id="$(find_page_by_slug "${site_id}" "${slug_norm}")"
  if [[ -n "${page_id}" ]]; then
    local page_status pipeline_status
    page_status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.status')"
    pipeline_status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus')"
    log "Existing page id=${page_id} status=${page_status} pipeline=${pipeline_status}"
    [[ "${page_status}" == "PUBLISHED" ]] && return 0
    if [[ "${pipeline_status}" != "READY" ]]; then
      wait_for_page_ready "${page_id}" || return 1
    fi
  else
    jq -n --argjson siteId "${site_id}" --arg keyword "${keyword}" --arg targetUrl "${slug_norm}" --arg notes "${notes}" \
      '{siteId:$siteId, keyword:$keyword, language:"EN", intent:"COMMERCIAL", priority:90, targetUrl:$targetUrl, notes:$notes}' \
      > "${TMP_DIR}/keyword.json"
    keyword_id="$(request POST /api/v1/keywords "${TMP_DIR}/keyword.json" | jq -r '.id')"

    jq -n \
      --argjson siteId "${site_id}" --argjson keywordId "${keyword_id}" \
      --arg slug "${slug_norm}" --arg title "${title}" --arg metaDescription "${meta_description}" \
      '{siteId:$siteId, keywordId:$keywordId, slug:$slug, language:"EN", title:$title,
        metaTitle: ($title + " | MedCover"), metaDescription:$metaDescription}' \
      > "${TMP_DIR}/page.json"
    page_id="$(request POST /api/v1/pages "${TMP_DIR}/page.json" | jq -r '.id')"
    log "Created page id=${page_id}"

    request POST "/api/v1/pages/${page_id}/generate-content?resetCheckpoint=true" "${TMP_DIR}/empty.json" >/dev/null
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
  local site_id failures=()
  login
  site_id="$(get_site_id)"
  [[ -n "${site_id}" ]] || { log "Site not found: ${SITE_DOMAIN}"; exit 1; }
  log "Site id=${site_id}"

  # Treatment page first
  process_page "${site_id}" "what is hair restoration fue dhi" "/treatments/hair-restoration" \
    "What Is Hair Restoration? FUE, DHI, and FUT Explained" \
    "Hair restoration covers FUE, DHI, and FUT techniques. Learn how grafts work, what results to expect, and why patients travel abroad." \
    "Template HR-E treatment entity page." \
    || failures+=("treatment")

  process_page "${site_id}" "hair transplant turkey" "/guides/turkey-hair-restoration-guide" \
    "Hair Transplant in Turkey: What Real Patients Told Us" \
    "Hair transplant in Turkey from €1,500. World's leading destination with verified FUE/DHI clinic rankings and patient data." \
    "Template HR-A Turkey country guide." \
    || failures+=("Turkey")

  process_page "${site_id}" "hair transplant spain" "/guides/spain-hair-restoration-guide" \
    "Hair Transplant in Spain: What Real Patients Told Us" \
    "Hair transplant in Spain from €3,500. EU-regulated FUE/DHI clinics in Barcelona and Madrid with verified costs." \
    "Template HR-A Spain country guide." \
    || failures+=("Spain")

  process_page "${site_id}" "hair transplant greece" "/guides/greece-hair-restoration-guide" \
    "Hair Transplant in Greece: What Real Patients Told Us" \
    "Hair transplant in Greece from €2,500. Athens FUE/DHI clinics with verified graft pricing and patient data." \
    "Template HR-A Greece country guide." \
    || failures+=("Greece")

  ((${#failures[@]} > 0)) && { log "Failed: ${failures[*]}"; exit 1; }
  log "All hair restoration country guides processed."
}

main "$@"
