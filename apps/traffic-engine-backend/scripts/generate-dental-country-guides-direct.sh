#!/usr/bin/env bash
# Create and publish dental care country guides (Template DT-A) via direct page pipeline.
#
# Usage:
#   BASE_URL=https://nestino-backend-production.up.railway.app \
#   ADMIN_PASSWORD=... \
#   ./scripts/generate-dental-country-guides-direct.sh

set -euo pipefail

BASE_URL="${BASE_URL:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SITE_DOMAIN="${SITE_DOMAIN:-www.medcover.io}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-15}"
MAX_PIPELINE_WAIT_SEC="${MAX_PIPELINE_WAIT_SEC:-600}"
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

log() { printf '[dental-country-guides] %s\n' "$*" >&2; }

request() {
  local method="$1" path="$2" payload_file="${3:-}"
  local response_file="${TMP_DIR}/response.json" status
  local curl_args=(-sS --http1.1 -o "${response_file}" -w "%{http_code}" -X "${method}" "${BASE_URL}${path}" -H "Accept: application/json")
  [[ -n "${ACCESS_TOKEN}" ]] && curl_args+=(-H "Authorization: Bearer ${ACCESS_TOKEN}")
  [[ -n "${payload_file}" ]] && curl_args+=(-H "Content-Type: application/json" --data-binary "@${payload_file}")
  status="$(curl "${curl_args[@]}" 2>/dev/null || echo 000)"
  if [[ "${status}" == "000" || "${status}" -lt 200 || "${status}" -ge 300 ]]; then
    sleep 3
    status="$(curl "${curl_args[@]}" 2>/dev/null || echo 000)"
  fi
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
  request GET "/api/v1/pages?siteId=${site_id}" 2>/dev/null | jq -r --arg slug "$(normalize_slug "${expected_slug}")" '
    first(.[] | select((.slug | rtrimstr("/")) == ($slug | rtrimstr("/"))) | .id) // empty' || true
}

find_keyword_id() {
  local site_id="$1" target_url="$2"
  request GET "/api/v1/keywords?siteId=${site_id}" 2>/dev/null | jq -r --arg url "$(normalize_slug "${target_url}")" '
    first(.[] | select((.targetUrl | rtrimstr("/")) == ($url | rtrimstr("/"))) | .id) // empty' || true
}

create_or_find_keyword() {
  local site_id="$1" keyword="$2" target_url="$3" notes="$4"
  local keyword_id slug_norm response_file="${TMP_DIR}/keyword-response.json"
  slug_norm="$(normalize_slug "${target_url}")"
  keyword_id="$(find_keyword_id "${site_id}" "${slug_norm}")"
  [[ -n "${keyword_id}" ]] && { printf '%s\n' "${keyword_id}"; return 0; }

  jq -n \
    --argjson siteId "${site_id}" --arg keyword "${keyword}" --arg targetUrl "${slug_norm}" --arg notes "${notes}" \
    '{siteId:$siteId, keyword:$keyword, language:"EN", intent:"COMMERCIAL", priority:90, targetUrl:$targetUrl, notes:$notes}' \
    > "${TMP_DIR}/keyword.json"

  if request POST /api/v1/keywords "${TMP_DIR}/keyword.json" > "${response_file}" 2>/dev/null; then
    jq -r '.id' "${response_file}"
    return 0
  fi
  keyword_id="$(find_keyword_id "${site_id}" "${slug_norm}")"
  [[ -n "${keyword_id}" ]] && { printf '%s\n' "${keyword_id}"; return 0; }
  return 1
}

wait_for_page_ready() {
  local page_id="$1" deadline=$((SECONDS + MAX_PIPELINE_WAIT_SEC)) status="" partial_tried=false
  while (( SECONDS < deadline )); do
    status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus // empty')"
    case "${status}" in
      READY) return 0 ;;
      PARTIALLY_COMPLETED)
        if [[ "${partial_tried}" == "true" ]]; then
          log "  page ${page_id} PARTIALLY_COMPLETED — skipping (fix manually)"
          return 2
        fi
        partial_tried=true
        log "  page ${page_id} PARTIALLY_COMPLETED — one recovery attempt"
        request POST "/api/v1/pages/${page_id}/complete-pipeline" "${TMP_DIR}/empty.json" >/dev/null || true
        status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus // empty')"
        [[ "${status}" == "READY" ]] && return 0
        request POST "/api/v1/pages/${page_id}/mark-content-ready" "${TMP_DIR}/empty.json" >/dev/null || true
        status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus // empty')"
        [[ "${status}" == "READY" ]] && return 0
        log "  page ${page_id} still ${status:-PARTIALLY_COMPLETED} — skipping (fix manually)"
        return 2
        ;;
      FAILED)
        log "  page ${page_id} FAILED — skipping (fix manually)"
        return 2 ;;
    esac
    log "  page ${page_id} pipelineStatus=${status:-unknown}"
    sleep "${POLL_INTERVAL_SEC}"
  done
  log "  page ${page_id} timed out after ${MAX_PIPELINE_WAIT_SEC}s — skipping (fix manually)"
  return 2
}

finish_page() {
  local page_id="$1" wait_rc="$2"
  if [[ "${wait_rc}" -eq 0 ]]; then
    if [[ "${SKIP_PUBLISH}" == "true" ]]; then
      log "SKIP_PUBLISH=true — page ${page_id} ready"
      return 0
    fi
    request POST "/api/v1/pages/${page_id}/publish" "${TMP_DIR}/empty.json" >/dev/null
    log "Published page ${page_id}"
    return 0
  fi
  if [[ "${wait_rc}" -eq 2 ]]; then
    log "Page ${page_id} left incomplete — continuing"
    return 0
  fi
  return 1
}

process_page() {
  local site_id="$1" keyword="$2" slug="$3" title="$4" meta_description="$5" notes="$6"
  local page_id keyword_id slug_norm wait_rc=0
  slug_norm="$(normalize_slug "${slug}")"
  log "=== ${title} → ${slug_norm} ==="

  page_id="$(find_page_by_slug "${site_id}" "${slug_norm}")"
  if [[ -n "${page_id}" ]]; then
    local page_status pipeline_status
    page_status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.status')"
    pipeline_status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus')"
    log "Existing page id=${page_id} status=${page_status} pipeline=${pipeline_status}"
    [[ "${page_status}" == "PUBLISHED" ]] && return 0
    if [[ "${pipeline_status}" == "PARTIALLY_COMPLETED" || "${pipeline_status}" == "FAILED" ]]; then
      log "Existing page ${page_id} ${pipeline_status} — skipping (fix manually)"
      return 0
    fi
    if [[ "${pipeline_status}" != "READY" ]]; then
      wait_for_page_ready "${page_id}"; wait_rc=$?
      finish_page "${page_id}" "${wait_rc}" || return 1
      return 0
    fi
  else
    keyword_id="$(create_or_find_keyword "${site_id}" "${keyword}" "${slug_norm}" "${notes}")" \
      || { log "ERROR: could not create/find keyword for ${slug_norm}"; return 1; }

    jq -n \
      --argjson siteId "${site_id}" --argjson keywordId "${keyword_id}" \
      --arg slug "${slug_norm}" --arg title "${title}" --arg metaDescription "${meta_description}" \
      '{siteId:$siteId, keywordId:$keywordId, slug:$slug, language:"EN", title:$title,
        metaTitle: ($title + " | MedCover"), metaDescription:$metaDescription}' \
      > "${TMP_DIR}/page.json"
    page_id="$(request POST /api/v1/pages "${TMP_DIR}/page.json" | jq -r '.id // empty')"
    [[ -n "${page_id}" && "${page_id}" != "null" ]] || { log "ERROR: page creation returned no id for ${slug_norm}"; return 1; }
    log "Created page id=${page_id}"

    request POST "/api/v1/pages/${page_id}/generate-content?resetCheckpoint=true" "${TMP_DIR}/empty.json" >/dev/null
    wait_for_page_ready "${page_id}"; wait_rc=$?
    finish_page "${page_id}" "${wait_rc}" || return 1
    return 0
  fi

  finish_page "${page_id}" 0 || return 1
}

main() {
  local site_id failures=()
  login
  site_id="$(get_site_id)"
  [[ -n "${site_id}" ]] || { log "Site not found: ${SITE_DOMAIN}"; exit 1; }
  log "Site id=${site_id}"

  # Treatment page first
  process_page "${site_id}" "what is dental tourism implants veneers" "/treatments/dental" \
    "What Is Dental Tourism? Implants, Veneers & Crowns Explained" \
    "Dental tourism covers implants, veneers, and crowns abroad. Learn procedures, costs, trip planning, and why patients travel for dental care." \
    "Template DT-E treatment entity page." \
    || failures+=("treatment")

  process_page "${site_id}" "dental turkey" "/guides/turkey-dental-guide" \
    "Dental Care in Turkey: What Real Patients Told Us" \
    "Dental care in Turkey from €300 per implant. Leading destination for implants, veneers, and all-on-4 with verified clinic data." \
    "Template DT-A Turkey country guide." \
    || failures+=("Turkey")

  process_page "${site_id}" "dental spain" "/guides/spain-dental-guide" \
    "Dental Care in Spain: What Real Patients Told Us" \
    "Dental care in Spain from €500 per implant. EU-regulated clinics in Barcelona and Madrid with verified costs." \
    "Template DT-A Spain country guide." \
    || failures+=("Spain")

  process_page "${site_id}" "dental greece" "/guides/greece-dental-guide" \
    "Dental Care in Greece: What Real Patients Told Us" \
    "Dental care in Greece from €400 per implant. Athens clinics with verified implant and veneer pricing." \
    "Template DT-A Greece country guide." \
    || failures+=("Greece")

  ((${#failures[@]} > 0)) && log "Incomplete (fix manually): ${failures[*]}"
  log "All dental country guides processed."
}

main "$@"
