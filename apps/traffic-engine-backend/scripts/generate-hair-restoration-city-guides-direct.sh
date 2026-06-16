#!/usr/bin/env bash
# Create and publish hair restoration city guides (Template HR-A2) via direct page pipeline.
#
# Usage:
#   BASE_URL=https://nestino-backend-production.up.railway.app \
#   ADMIN_PASSWORD=... \
#   ./scripts/generate-hair-restoration-city-guides-direct.sh [--all | --city istanbul]

set -euo pipefail

BASE_URL="${BASE_URL:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SITE_DOMAIN="${SITE_DOMAIN:-www.medcover.io}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-15}"
MAX_PIPELINE_WAIT_SEC="${MAX_PIPELINE_WAIT_SEC:-1200}"
SKIP_PUBLISH="${SKIP_PUBLISH:-false}"
CITY_FILTER=""

usage() {
  echo "Usage: BASE_URL=... ADMIN_PASSWORD=... $0 --city istanbul | --all" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --city) CITY_FILTER="${2:-}"; shift 2 ;;
    --all) CITY_FILTER="all"; shift ;;
    --skip-publish) SKIP_PUBLISH="true"; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done
[[ -n "${CITY_FILTER}" ]] || usage
[[ -n "${BASE_URL}" && -n "${ADMIN_PASSWORD}" ]] || usage

BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
ACCESS_TOKEN=""
jq -n '{}' > "${TMP_DIR}/empty.json"

log() { printf '[hr-city-guides] %s\n' "$*" >&2; }

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

process_city() {
  local site_id="$1" city_key="$2" keyword="$3" slug="$4" title="$5" meta_description="$6"
  local page_id keyword_id slug_norm
  slug_norm="$(normalize_slug "${slug}")"
  log "=== ${city_key}: ${slug_norm} ==="

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
    jq -n --argjson siteId "${site_id}" --arg keyword "${keyword}" --arg targetUrl "${slug_norm}" \
      '{siteId:$siteId, keyword:$keyword, language:"EN", intent:"COMMERCIAL", priority:85, targetUrl:$targetUrl}' \
      > "${TMP_DIR}/keyword.json"
    keyword_id="$(request POST /api/v1/keywords "${TMP_DIR}/keyword.json" | jq -r '.id')"

    jq -n \
      --argjson siteId "${site_id}" --argjson keywordId "${keyword_id}" \
      --arg slug "${slug_norm}" --arg title "${title}" --arg metaDescription "${meta_description}" \
      '{siteId:$siteId, keywordId:$keywordId, slug:$slug, language:"EN", title:$title,
        metaTitle: ($title + " | MedCover"), metaDescription:$metaDescription}' \
      > "${TMP_DIR}/page.json"
    page_id="$(request POST /api/v1/pages "${TMP_DIR}/page.json" | jq -r '.id')"
    request POST "/api/v1/pages/${page_id}/generate-content?resetCheckpoint=true" "${TMP_DIR}/empty.json" >/dev/null
    wait_for_page_ready "${page_id}" || return 1
  fi

  if [[ "${SKIP_PUBLISH}" != "true" ]]; then
    request POST "/api/v1/pages/${page_id}/publish" "${TMP_DIR}/empty.json" >/dev/null
    log "Published page ${page_id}"
  fi
}

run_city() {
  local site_id="$1" key="$2" keyword="$3" country_slug="$4" city_slug="$5" city_name="$6" cost_hint="$7"
  local slug="/guides/${country_slug}/${city_slug}-hair-restoration-guide"
  local title="Hair Transplant in ${city_name}: Clinics, Real Costs & Patient Insights"
  local meta_desc="Hair transplant in ${city_name}. ${cost_hint} Verified FUE/DHI clinics and patient interview data."
  process_city "${site_id}" "${key}" "${keyword}" "${slug}" "${title}" "${meta_desc}"
}

main() {
  local site_id failures=() keys=()
  login
  site_id="$(get_site_id)"
  [[ -n "${site_id}" ]] || { log "Site not found: ${SITE_DOMAIN}"; exit 1; }

  if [[ "${CITY_FILTER}" == "all" ]]; then
    keys=(istanbul barcelona madrid athens)
  else
    keys=("${CITY_FILTER}")
  fi

  for key in "${keys[@]}"; do
    case "${key}" in
      istanbul)  run_city "${site_id}" istanbul "hair transplant istanbul" turkey istanbul Istanbul "From €1,200." || failures+=("istanbul") ;;
      barcelona) run_city "${site_id}" barcelona "hair transplant barcelona" spain barcelona Barcelona "From €3,500." || failures+=("barcelona") ;;
      madrid)    run_city "${site_id}" madrid "hair transplant madrid" spain madrid Madrid "From €3,800." || failures+=("madrid") ;;
      athens)    run_city "${site_id}" athens "hair transplant athens" greece athens Athens "From €2,500." || failures+=("athens") ;;
      *) log "Unknown city key: ${key}"; failures+=("${key}") ;;
    esac
  done

  ((${#failures[@]} > 0)) && { log "Failed: ${failures[*]}"; exit 1; }
  log "Hair restoration city guides processed."
}

main "$@"
