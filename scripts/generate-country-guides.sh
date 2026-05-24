#!/usr/bin/env bash
# Generate, approve, pipeline, and publish all 6 MedCover country IVF guides on Nestino.
#
# Usage:
#   BASE_URL=https://nestino-backend-production.up.railway.app \
#   ADMIN_PASSWORD=... \
#   ./scripts/generate-country-guides.sh
#
# Optional:
#   SITE_DOMAIN=medcover.io
#   IDEA_PROVIDER=google
#   POLL_INTERVAL_SEC=10
#   MAX_PIPELINE_WAIT_SEC=900
#   SKIP_PUBLISH=true

set -euo pipefail

BASE_URL="${BASE_URL:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SITE_DOMAIN="${SITE_DOMAIN:-medcover.io}"
IDEA_PROVIDER="${IDEA_PROVIDER:-google}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-10}"
MAX_PIPELINE_WAIT_SEC="${MAX_PIPELINE_WAIT_SEC:-900}"
SKIP_PUBLISH="${SKIP_PUBLISH:-false}"

if [[ -z "${BASE_URL}" || -z "${ADMIN_PASSWORD}" ]]; then
  echo "Usage: BASE_URL=https://... ADMIN_PASSWORD=... $0" >&2
  exit 1
fi

if ! command -v curl >/dev/null || ! command -v jq >/dev/null; then
  echo "curl and jq are required." >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
ACCESS_TOKEN=""
jq -n '{}' > "${TMP_DIR}/empty.json"

log() { printf '[country-guides] %s\n' "$*" >&2; }

request() {
  local method="$1"
  local path="$2"
  local payload_file="${3:-}"
  local response_file="${TMP_DIR}/response.json"
  local status
  local curl_args=(-sS --http1.1 -o "${response_file}" -w "%{http_code}" -X "${method}" "${BASE_URL}${path}" -H "Accept: application/json")
  : > "${response_file}"

  if [[ -n "${ACCESS_TOKEN}" ]]; then
    curl_args+=(-H "Authorization: Bearer ${ACCESS_TOKEN}")
  fi
  if [[ -n "${payload_file}" ]]; then
    curl_args+=(-H "Content-Type: application/json" --data-binary "@${payload_file}")
  fi

  status="$(curl "${curl_args[@]}")"
  if [[ "${status}" -lt 200 || "${status}" -ge 300 ]]; then
    echo "Request failed: ${method} ${path} (${status})" >&2
    if [[ -s "${response_file}" ]]; then
      sed 's/^/  /' "${response_file}" >&2
    fi
    return 1
  fi
  jq -c . "${response_file}"
}

login() {
  jq -n --arg email "${ADMIN_EMAIL}" --arg password "${ADMIN_PASSWORD}" '{email:$email,password:$password}' \
    > "${TMP_DIR}/login.json"
  ACCESS_TOKEN="$(request POST /api/v1/identity/login "${TMP_DIR}/login.json" | jq -r '.accessToken')"
  if [[ -z "${ACCESS_TOKEN}" || "${ACCESS_TOKEN}" == "null" ]]; then
    echo "Login failed." >&2
    exit 1
  fi
}

normalize_slug() {
  local slug="$1"
  slug="${slug%/}"
  [[ "${slug}" == /* ]] || slug="/${slug}"
  printf '%s\n' "${slug}"
}

slug_matches() {
  local actual expected
  actual="$(normalize_slug "$1")"
  expected="$(normalize_slug "$2")"
  [[ "${actual}" == "${expected}" ]]
}

get_site_id() {
  request GET "/api/v1/sites" | jq -r --arg domain "${SITE_DOMAIN}" 'first(.[] | select(.domain == $domain) | .id) // empty'
}

get_subject_id() {
  local site_id="$1"
  local title="$2"
  request GET "/api/v1/subjects?siteId=${site_id}" | jq -r --arg title "${title}" 'first(.[] | select(.title == $title) | .id) // empty'
}

find_page_by_slug() {
  local site_id="$1"
  local expected_slug="$2"
  request GET "/api/v1/pages?siteId=${site_id}" | jq -r --arg slug "$(normalize_slug "${expected_slug}")" '
    first(.[] | select((.slug | rtrimstr("/")) == ($slug | rtrimstr("/"))) | .id) // empty'
}

wait_for_idea() {
  local subject_id="$1"
  local expected_slug="$2"
  local deadline=$((SECONDS + 180))
  local idea_id=""

  while (( SECONDS < deadline )); do
    idea_id="$(request GET "/api/v1/subjects/${subject_id}/ideas?status=PENDING_REVIEW" | jq -r --arg slug "$(normalize_slug "${expected_slug}")" '
      first(.[] | select((.slug | rtrimstr("/")) == ($slug | rtrimstr("/"))) | .id) // empty')"
    if [[ -n "${idea_id}" ]]; then
      printf '%s\n' "${idea_id}"
      return 0
    fi
    log "  waiting for idea slug ${expected_slug}..."
    sleep "${POLL_INTERVAL_SEC}"
  done
  return 1
}

wait_for_page_ready() {
  local page_id="$1"
  local deadline=$((SECONDS + MAX_PIPELINE_WAIT_SEC))
  local status=""

  while (( SECONDS < deadline )); do
    status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus // empty')"
    case "${status}" in
      READY) return 0 ;;
      FAILED|PARTIALLY_COMPLETED)
        log "Pipeline ended with status=${status} for page ${page_id}"
        return 1
        ;;
    esac
    log "  page ${page_id} pipelineStatus=${status:-unknown} — waiting..."
    sleep "${POLL_INTERVAL_SEC}"
  done
  log "Timed out waiting for page ${page_id}"
  return 1
}

publish_page() {
  local page_id="$1"
  request POST "/api/v1/pages/${page_id}/publish" "${TMP_DIR}/empty.json" >/dev/null
  log "Published page ${page_id} (status=$(request GET "/api/v1/pages/${page_id}" | jq -r '.status'))"
}

process_country() {
  local site_id="$1"
  local subject_title="$2"
  local expected_slug="$3"
  local subject_id page_id idea_id pipeline_status page_status task_response

  expected_slug="$(normalize_slug "${expected_slug}")"
  log "=== ${subject_title} → ${expected_slug} ==="

  subject_id="$(get_subject_id "${site_id}" "${subject_title}")"
  if [[ -z "${subject_id}" ]]; then
    log "Subject not found: ${subject_title}. Run seed-medcover.sh first."
    return 1
  fi

  page_id="$(find_page_by_slug "${site_id}" "${expected_slug}")"
  if [[ -n "${page_id}" ]]; then
    page_status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.status')"
    pipeline_status="$(request GET "/api/v1/pages/${page_id}" | jq -r '.pipelineStatus')"
    log "Existing page id=${page_id} status=${page_status} pipeline=${pipeline_status}"
    if [[ "${page_status}" == "PUBLISHED" ]]; then
      log "Already published — skipping."
      return 0
    fi
    if [[ "${pipeline_status}" != "READY" ]]; then
      wait_for_page_ready "${page_id}" || return 1
    fi
    if [[ "${SKIP_PUBLISH}" == "true" ]]; then
      log "SKIP_PUBLISH=true — page ${page_id} ready for review"
      return 0
    fi
    publish_page "${page_id}"
    return 0
  fi

  jq -n --arg provider "${IDEA_PROVIDER}" '{count:1, provider:$provider}' > "${TMP_DIR}/gen-idea.json"
  request POST "/api/v1/subjects/${subject_id}/ideas/generate" "${TMP_DIR}/gen-idea.json" >/dev/null
  log "Idea generation queued for subject ${subject_id}"

  idea_id="$(wait_for_idea "${subject_id}" "${expected_slug}")" || {
    log "No idea with slug ${expected_slug} within timeout."
    log "Approve manually if AI used a different slug: GET /subjects/${subject_id}/ideas"
    return 1
  }
  log "Found idea id=${idea_id}"

  request PATCH "/api/v1/content-ideas/${idea_id}/approve" "${TMP_DIR}/empty.json" >/dev/null
  log "Approved idea ${idea_id}"

  task_response="$(request POST "/api/v1/content-ideas/${idea_id}/create-task" "${TMP_DIR}/empty.json")"
  page_id="$(printf '%s' "${task_response}" | jq -r '.payload.pageId // empty')"
  if [[ -z "${page_id}" ]]; then
    page_id="$(printf '%s' "${task_response}" | jq -r '.. | objects | select(has("pageId")) | .pageId' | head -1)"
  fi
  if [[ -z "${page_id}" ]]; then
    log "Could not resolve pageId from create-task: ${task_response}"
    return 1
  fi
  log "Created page id=${page_id}"

  wait_for_page_ready "${page_id}" || return 1

  if [[ "${SKIP_PUBLISH}" == "true" ]]; then
    log "SKIP_PUBLISH=true — page ${page_id} ready for review"
    return 0
  fi

  publish_page "${page_id}"
}

main() {
  local site_id
  local -a failures=()

  login
  site_id="$(get_site_id)"
  if [[ -z "${site_id}" ]]; then
    log "Site not found for domain ${SITE_DOMAIN}. Run seed-medcover.sh first."
    exit 1
  fi
  log "Using site id=${site_id} domain=${SITE_DOMAIN}"

  process_country "${site_id}" "Spain Country Guide" "/guides/spain-ivf-guide" || failures+=("Spain")
  process_country "${site_id}" "Greece Country Guide" "/guides/greece-ivf-guide" || failures+=("Greece")
  process_country "${site_id}" "Czech Republic Country Guide" "/guides/czech-republic-ivf-guide" || failures+=("Czech Republic")
  process_country "${site_id}" "Turkey Country Guide" "/guides/turkey-ivf-guide" || failures+=("Turkey")
  process_country "${site_id}" "Portugal Country Guide" "/guides/portugal-ivf-guide" || failures+=("Portugal")
  process_country "${site_id}" "North Macedonia Country Guide" "/guides/north-macedonia-ivf-guide" || failures+=("North Macedonia")

  if ((${#failures[@]} > 0)); then
    log "Failed: ${failures[*]}"
    exit 1
  fi

  log "All 6 country guides processed."
}

main "$@"
