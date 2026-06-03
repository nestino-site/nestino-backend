#!/usr/bin/env bash
# Create and publish MedCover city IVF guides (Template A2) via direct page pipeline.
#
# Usage:
#   BASE_URL=https://nestino-backend-production.up.railway.app \
#   ADMIN_PASSWORD=... \
#   ./scripts/generate-city-guides-direct.sh --city barcelona
#
#   ./scripts/generate-city-guides-direct.sh --all
#
# Options:
#   --city <slug>   Run one city (e.g. barcelona, madrid, valencia)
#   --all           Run all 12 hub cities (skips already published)
#   --skip-publish  Stop after pipeline READY

set -euo pipefail

BASE_URL="${BASE_URL:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SITE_DOMAIN="${SITE_DOMAIN:-medcover.io}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-15}"
MAX_PIPELINE_WAIT_SEC="${MAX_PIPELINE_WAIT_SEC:-1200}"
SKIP_PUBLISH="${SKIP_PUBLISH:-false}"
CITY_FILTER=""

usage() {
  echo "Usage: BASE_URL=... ADMIN_PASSWORD=... $0 --city barcelona | --all" >&2
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

if [[ -z "${BASE_URL}" || -z "${ADMIN_PASSWORD}" ]]; then
  usage
fi

BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
ACCESS_TOKEN=""
jq -n '{}' > "${TMP_DIR}/empty.json"

log() { printf '[city-guides] %s\n' "$*" >&2; }

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
  if [[ "${status}" == "000" || "${status}" -lt 200 || "${status}" -ge 300 ]]; then
    sleep 3
    status="$(curl "${curl_args[@]}" 2>/dev/null || echo 000)"
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
        log "  page ${page_id} PARTIALLY_COMPLETED — trying complete-pipeline"
        request POST "/api/v1/pages/${page_id}/complete-pipeline" "${TMP_DIR}/empty.json" >/dev/null || \
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

process_city() {
  local site_id="$1"
  local city_key="$2"
  local keyword="$3"
  local slug="$4"
  local title="$5"
  local meta_title="$6"
  local meta_description="$7"
  local page_id keyword_id

  slug="$(normalize_slug "${slug}")"
  log "=== ${city_key}: ${slug} ==="

  page_id="$(find_page_by_slug "${site_id}" "${slug}")"
  jq -n \
    --arg metaTitle "${meta_title}" \
    --arg metaDescription "${meta_description}" \
    --arg title "${title}" \
    '{metaTitle:$metaTitle, metaDescription:$metaDescription, title:$title}' \
    > "${TMP_DIR}/page-patch.json"

  if [[ -n "${page_id}" ]]; then
    local page_status pipeline_status
    page_status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.status')"
    pipeline_status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus')"
    log "Existing page id=${page_id} status=${page_status} pipeline=${pipeline_status}"
    if [[ "${page_status}" == "PUBLISHED" ]]; then return 0; fi
    request PATCH "/api/v1/pages/${page_id}" "${TMP_DIR}/page-patch.json" >/dev/null
    if [[ "${pipeline_status}" != "READY" ]]; then
      if [[ "${pipeline_status}" == "PARTIALLY_COMPLETED" || "${pipeline_status}" == "FAILED" ]]; then
        request POST "/api/v1/pages/${page_id}/complete-pipeline" "${TMP_DIR}/empty.json" >/dev/null || true
      fi
      wait_for_page_ready "${page_id}" || return 1
    fi
  else
    jq -n \
      --argjson siteId "${site_id}" \
      --arg keyword "${keyword}" \
      --arg targetUrl "${slug}" \
      '{siteId:$siteId, keyword:$keyword, language:"EN", intent:"COMMERCIAL", priority:85, targetUrl:$targetUrl}' \
      > "${TMP_DIR}/keyword.json"
    keyword_id="$(request POST /api/v1/keywords "${TMP_DIR}/keyword.json" | jq -r '.id')"

    jq -n \
      --argjson siteId "${site_id}" \
      --argjson keywordId "${keyword_id}" \
      --arg slug "${slug}" \
      --arg title "${title}" \
      --arg metaTitle "${meta_title}" \
      --arg metaDescription "${meta_description}" \
      '{siteId:$siteId, keywordId:$keywordId, slug:$slug, language:"EN", title:$title, metaTitle:$metaTitle, metaDescription:$metaDescription}' \
      > "${TMP_DIR}/page.json"
    page_id="$(request POST /api/v1/pages "${TMP_DIR}/page.json" | jq -r '.id')"
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

run_city() {
  local site_id="$1"
  local key="$2"
  local keyword="$3"
  local country_slug="$4"
  local city_slug="$5"
  local city_name="$6"
  local cost_hint="$7"
  local slug="/guides/${country_slug}/${city_slug}-ivf-guide"
  local title="IVF in ${city_name}: Clinics, Real Costs & Patient Insights"
  local meta_title="IVF in ${city_name} 2026 — Clinics & Costs | MedCover"
  local meta_desc="IVF clinics in ${city_name} tracked by MedCover. ${cost_hint} Real patient data, hidden costs revealed, clinics ranked by Truth Score."

  process_city "${site_id}" "${key}" "${keyword}" "${slug}" "${title}" "${meta_title}" "${meta_desc}"
}

main() {
  local site_id
  local -a failures=()
  local -a keys=()

  login
  site_id="$(get_site_id)"
  if [[ -z "${site_id}" ]]; then
    log "Site not found: ${SITE_DOMAIN}"
    exit 1
  fi
  log "Site id=${site_id} domain=${SITE_DOMAIN}"

  cfg="$(request GET "/api/v1/site-configs/${site_id}" 2>/dev/null || echo '{}')"
  img_enabled="$(printf '%s' "${cfg}" | jq -r '.runtimeConfig.enableImageGeneration // false')"
  log "enableImageGeneration=${img_enabled} (requires GOOGLE_AI_API_KEY on Railway for Imagen)"

  if [[ "${CITY_FILTER}" == "all" ]]; then
    keys=(barcelona madrid valencia athens thessaloniki prague brno istanbul ankara lisbon porto skopje)
  else
    keys=("${CITY_FILTER}")
  fi

  for key in "${keys[@]}"; do
    case "${key}" in
      barcelona) run_city "${site_id}" barcelona "ivf barcelona" spain barcelona Barcelona "Average cost €3,200–€5,500." || failures+=("barcelona") ;;
      madrid)    run_city "${site_id}" madrid "ivf madrid" spain madrid Madrid "Average cost €3,400–€5,800." || failures+=("madrid") ;;
      valencia)  run_city "${site_id}" valencia "ivf valencia" spain valencia Valencia "Average cost €3,000–€5,200." || failures+=("valencia") ;;
      athens)    run_city "${site_id}" athens "ivf athens" greece athens Athens "Average cost €2,800–€4,800." || failures+=("athens") ;;
      thessaloniki) run_city "${site_id}" thessaloniki "ivf thessaloniki" greece thessaloniki Thessaloniki "Average cost €2,600–€4,500." || failures+=("thessaloniki") ;;
      prague)    run_city "${site_id}" prague "ivf prague" czech-republic prague Prague "Average cost €2,400–€4,200." || failures+=("prague") ;;
      brno)      run_city "${site_id}" brno "ivf brno" czech-republic brno Brno "Average cost €2,200–€3,900." || failures+=("brno") ;;
      istanbul)  run_city "${site_id}" istanbul "ivf istanbul" turkey istanbul Istanbul "Average cost €2,600–€4,500." || failures+=("istanbul") ;;
      ankara)    run_city "${site_id}" ankara "ivf ankara" turkey ankara Ankara "Average cost €2,400–€4,200." || failures+=("ankara") ;;
      lisbon)    run_city "${site_id}" lisbon "ivf lisbon" portugal lisbon Lisbon "Average cost €3,000–€5,200." || failures+=("lisbon") ;;
      porto)     run_city "${site_id}" porto "ivf porto" portugal porto Porto "Average cost €2,900–€5,000." || failures+=("porto") ;;
      skopje)    run_city "${site_id}" skopje "ivf skopje" north-macedonia skopje Skopje "Average cost €1,900–€3,500." || failures+=("skopje") ;;
      *) log "Unknown city key: ${key}"; failures+=("${key}") ;;
    esac
  done

  if ((${#failures[@]} > 0)); then
    log "Failed: ${failures[*]}"
    exit 1
  fi
  log "City guide(s) processed successfully."
}

main "$@"
