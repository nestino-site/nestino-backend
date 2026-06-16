#!/usr/bin/env bash
# Phase 2: cost pages (3) + origin journeys (2) + authority articles (5) = 10 pages.
#
# Usage:
#   BASE_URL=https://nestino-backend-production.up.railway.app \
#   ADMIN_PASSWORD=... \
#   ./scripts/generate-hair-restoration-phase2-content.sh

set -euo pipefail

BASE_URL="${BASE_URL:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SITE_DOMAIN="${SITE_DOMAIN:-www.medcover.io}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-15}"
MAX_PIPELINE_WAIT_SEC="${MAX_PIPELINE_WAIT_SEC:-1200}"
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

log() { printf '[hr-phase2] %s\n' "$*" >&2; }

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

find_keyword_id() {
  local site_id="$1" target_url="$2"
  request GET "/api/v1/keywords?siteId=${site_id}" | jq -r --arg url "$(normalize_slug "${target_url}")" '
    first(.[] | select((.targetUrl | rtrimstr("/")) == ($url | rtrimstr("/"))) | .id) // empty'
}

create_or_find_keyword() {
  local site_id="$1" keyword="$2" target_url="$3" intent="$4" priority="$5" notes="$6"
  local keyword_id slug_norm response_file="${TMP_DIR}/keyword-response.json"
  slug_norm="$(normalize_slug "${target_url}")"
  keyword_id="$(find_keyword_id "${site_id}" "${slug_norm}")"
  [[ -n "${keyword_id}" ]] && { printf '%s\n' "${keyword_id}"; return 0; }

  jq -n \
    --argjson siteId "${site_id}" --arg keyword "${keyword}" --arg targetUrl "${slug_norm}" \
    --arg intent "${intent}" --argjson priority "${priority}" --arg notes "${notes}" \
    '{siteId:$siteId, keyword:$keyword, language:"EN", intent:$intent, priority:$priority, targetUrl:$targetUrl, notes:$notes}' \
    > "${TMP_DIR}/keyword.json"

  if request POST /api/v1/keywords "${TMP_DIR}/keyword.json" > "${response_file}"; then
    jq -r '.id' "${response_file}"
    return 0
  fi
  keyword_id="$(find_keyword_id "${site_id}" "${slug_norm}")"
  [[ -n "${keyword_id}" ]] && { printf '%s\n' "${keyword_id}"; return 0; }
  return 1
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

# process_page site_id keyword slug title meta_title meta_description intent priority notes
process_page() {
  local site_id="$1" keyword="$2" slug="$3" title="$4" meta_title="$5" meta_description="$6"
  local intent="${7:-INFORMATIONAL}" priority="${8:-80}" notes="${9:-}"
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
    keyword_id="$(create_or_find_keyword "${site_id}" "${keyword}" "${slug_norm}" "${intent}" "${priority}" "${notes}")" \
      || { log "ERROR: could not create/find keyword for ${slug_norm}"; return 1; }

    jq -n \
      --argjson siteId "${site_id}" --argjson keywordId "${keyword_id}" \
      --arg slug "${slug_norm}" --arg title "${title}" \
      --arg metaTitle "${meta_title}" --arg metaDescription "${meta_description}" \
      '{siteId:$siteId, keywordId:$keywordId, slug:$slug, language:"EN", title:$title,
        metaTitle:$metaTitle, metaDescription:$metaDescription}' \
      > "${TMP_DIR}/page.json"
    page_id="$(request POST /api/v1/pages "${TMP_DIR}/page.json" | jq -r '.id // .page.id // empty')"
    [[ -n "${page_id}" && "${page_id}" != "null" ]] || { log "ERROR: page creation returned no id for ${slug_norm}"; return 1; }
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
  log "Site id=${site_id} — generating 10 phase-2 pages"

  # ── Cost pages (HR-D) ──────────────────────────────────────────────────────
  log "--- Cost pages ---"
  process_page "${site_id}" \
    "hair transplant cost turkey 2026" \
    "/costs/hair-restoration-turkey-cost-2026" \
    "Hair Transplant Cost in Turkey 2026: What Patients Actually Paid" \
    "Hair Transplant Cost Turkey 2026 — Real Patient Data | MedCover" \
    "Hair transplant in Turkey costs €1,500–€3,500 for 2,000–4,000 grafts based on verified patient interviews. See FUE/DHI pricing, hidden fees, and all-in costs." \
    INFORMATIONAL 90 \
    "Template HR-D. Cost range €1,500–€3,500. Graft pricing tiers, FUE vs DHI, add-ons, travel, hidden costs. Link to turkey guide and istanbul guide." \
    || failures+=("cost-turkey")

  process_page "${site_id}" \
    "hair transplant cost spain 2026" \
    "/costs/hair-restoration-spain-cost-2026" \
    "Hair Transplant Cost in Spain 2026: What Patients Actually Paid" \
    "Hair Transplant Cost Spain 2026 — Real Patient Data | MedCover" \
    "Hair transplant in Spain costs €3,500–€7,000 for 2,000–4,000 grafts. EU-regulated clinics in Barcelona and Madrid with verified patient pricing data." \
    INFORMATIONAL 90 \
    "Template HR-D. Cost range €3,500–€7,000. EU standards, Barcelona/Madrid pricing. Link to spain guide and city guides." \
    || failures+=("cost-spain")

  process_page "${site_id}" \
    "hair transplant cost greece 2026" \
    "/costs/hair-restoration-greece-cost-2026" \
    "Hair Transplant Cost in Greece 2026: What Patients Actually Paid" \
    "Hair Transplant Cost Greece 2026 — Real Patient Data | MedCover" \
    "Hair transplant in Greece costs €2,500–€5,500 for 2,000–4,000 grafts. Athens clinics with verified FUE/DHI pricing and patient interview data." \
    INFORMATIONAL 90 \
    "Template HR-D. Cost range €2,500–€5,500. Athens hub. Link to greece guide and athens guide." \
    || failures+=("cost-greece")

  # ── Origin journeys (HR-F) ─────────────────────────────────────────────────
  log "--- Origin journeys ---"
  process_page "${site_id}" \
    "hair transplant abroad from uk" \
    "/from/uk/hair-restoration-abroad" \
    "Hair Transplant Abroad for UK Patients: What You Need to Know" \
    "Hair Transplant Abroad from UK — Patient Guide | MedCover" \
    "UK patients save 50–70% on hair transplants abroad. Compare Turkey, Spain, and Greece costs, clinics, travel logistics, and what to expect." \
    INFORMATIONAL 85 \
    "Template HR-F UK origin. UK £4,000–£12,000 vs abroad €1,500–€7,000. Destinations, clinic selection, NHS/insurance, travel." \
    || failures+=("origin-uk")

  process_page "${site_id}" \
    "hair transplant abroad from usa" \
    "/from/usa/hair-restoration-abroad" \
    "Hair Transplant Abroad for US Patients: What You Need to Know" \
    "Hair Transplant Abroad from USA — Patient Guide | MedCover" \
    "US patients save thousands on hair transplants abroad. Compare Turkey, Spain, and Greece — costs, clinics, travel, and recovery timelines." \
    INFORMATIONAL 85 \
    "Template HR-F USA origin. US \$8,000–\$15,000 vs abroad. Insurance gaps, flight times, visa-free destinations." \
    || failures+=("origin-usa")

  # ── Authority articles ─────────────────────────────────────────────────────
  log "--- Authority articles ---"
  process_page "${site_id}" \
    "fue vs dhi hair transplant" \
    "/guides/fue-vs-dhi-hair-transplant-guide" \
    "FUE vs DHI Hair Transplant: Which Technique Is Right for You?" \
    "FUE vs DHI Hair Transplant — Comparison Guide | MedCover" \
    "FUE and DHI are the two main hair transplant techniques. Compare graft survival, scarring, recovery time, and cost to choose the right method." \
    INFORMATIONAL 80 \
    "Authority article. FUE vs DHI comparison, graft survival, scarring, cost, technique selection. Link to treatment page and country guides." \
    || failures+=("fue-vs-dhi")

  process_page "${site_id}" \
    "hair transplant istanbul guide" \
    "/guides/hair-transplant-istanbul-guide" \
    "Hair Transplant in Istanbul: Complete Patient Guide (2026)" \
    "Hair Transplant Istanbul 2026 — Patient Guide | MedCover" \
    "Istanbul is the world's hair transplant capital. Clinic selection, 3-day itinerary, costs, recovery hotels, and red flags for international patients." \
    COMMERCIAL 85 \
    "Istanbul authority guide. 500k+ transplants/year. 3-day itinerary, clinic selection, recovery hotels, red flags." \
    || failures+=("istanbul-guide")

  process_page "${site_id}" \
    "how many grafts hair transplant" \
    "/guides/hair-transplant-graft-count-calculator" \
    "Hair Transplant Graft Count: How Many Grafts Do You Need?" \
    "Hair Transplant Graft Count Guide — Norwood Scale | MedCover" \
    "How many grafts do you need? Norwood scale guide with graft counts by hair loss stage, pricing impact, and over-harvesting risks explained." \
    INFORMATIONAL 80 \
    "Graft count guide. Norwood I–VII table, pricing impact, over-harvesting risks." \
    || failures+=("graft-count")

  process_page "${site_id}" \
    "best age for hair transplant" \
    "/guides/best-age-for-hair-transplant" \
    "Best Age for a Hair Transplant: What the Data Shows" \
    "Best Age for Hair Transplant — Patient Guide | MedCover" \
    "Most surgeons recommend waiting until 25–30 for a hair transplant. Learn why age matters, progression risks, and when to consult a surgeon." \
    INFORMATIONAL 75 \
    "Best age guide. Minimum age, wait until 25–30, progression risks. Cite ISHRS." \
    || failures+=("best-age")

  process_page "${site_id}" \
    "hair transplant results timeline" \
    "/guides/hair-transplant-results-timeline" \
    "Hair Transplant Results Timeline: What to Expect Week by Week" \
    "Hair Transplant Results Timeline — Week by Week | MedCover" \
    "Hair transplant results take 6–12 months. Week-by-week timeline from scabbing and shock loss to full growth — what to expect at each stage." \
    INFORMATIONAL 75 \
    "Results timeline. Week-by-week from day 1 to month 12+. Shock loss, growth phases." \
    || failures+=("results-timeline")

  ((${#failures[@]} > 0)) && { log "Failed: ${failures[*]}"; exit 1; }
  log "Phase 2 complete — all 10 pages processed."
}

main "$@"
