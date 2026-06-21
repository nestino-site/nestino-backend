#!/usr/bin/env bash
# Phase 2: cost pages (3) + origin journeys (2) + authority articles (5) = 10 pages.
#
# Usage:
#   BASE_URL=https://nestino-backend-production.up.railway.app \
#   ADMIN_PASSWORD=... \
#   ./scripts/generate-dental-phase2-content.sh

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

log() { printf '[dental-phase2] %s\n' "$*" >&2; }

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

# process_page site_id keyword slug title meta_title meta_description intent priority notes
process_page() {
  local site_id="$1" keyword="$2" slug="$3" title="$4" meta_title="$5" meta_description="$6"
  local intent="${7:-INFORMATIONAL}" priority="${8:-80}" notes="${9:-}"
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
  log "Site id=${site_id} — generating 10 phase-2 pages"

  # ── Cost pages (DT-D) ──────────────────────────────────────────────────────
  log "--- Cost pages ---"
  process_page "${site_id}" \
    "dental cost turkey 2026" \
    "/costs/dental-turkey-cost-2026" \
    "Dental Cost in Turkey 2026: What Patients Actually Paid" \
    "Dental Cost Turkey 2026 — Real Patient Data | MedCover" \
    "Dental work in Turkey costs €300–€600 per implant based on verified patient interviews. See implant, veneer, all-on-4 pricing, hidden fees, and all-in costs." \
    INFORMATIONAL 90 \
    "Template DT-D. Cost range €300–€600/implant. Implant tiers, veneer/crown prices, all-on-4, add-ons, travel, hidden costs. Link to turkey guide and istanbul guide." \
    || failures+=("cost-turkey")

  process_page "${site_id}" \
    "dental cost spain 2026" \
    "/costs/dental-spain-cost-2026" \
    "Dental Cost in Spain 2026: What Patients Actually Paid" \
    "Dental Cost Spain 2026 — Real Patient Data | MedCover" \
    "Dental work in Spain costs €500–€900 per implant. EU-regulated clinics in Barcelona and Madrid with verified patient pricing data." \
    INFORMATIONAL 90 \
    "Template DT-D. Cost range €500–€900/implant. EU standards, Barcelona/Madrid pricing. Link to spain guide and city guides." \
    || failures+=("cost-spain")

  process_page "${site_id}" \
    "dental cost greece 2026" \
    "/costs/dental-greece-cost-2026" \
    "Dental Cost in Greece 2026: What Patients Actually Paid" \
    "Dental Cost Greece 2026 — Real Patient Data | MedCover" \
    "Dental work in Greece costs €400–€750 per implant. Athens clinics with verified implant and veneer pricing and patient interview data." \
    INFORMATIONAL 90 \
    "Template DT-D. Cost range €400–€750/implant. Athens hub. Link to greece guide and athens guide." \
    || failures+=("cost-greece")

  # ── Origin journeys (DT-F) ─────────────────────────────────────────────────
  log "--- Origin journeys ---"
  process_page "${site_id}" \
    "dental treatment abroad from uk" \
    "/from/uk/dental-abroad" \
    "Dental Treatment Abroad for UK Patients: What You Need to Know" \
    "Dental Treatment Abroad from UK — Patient Guide | MedCover" \
    "UK patients save 50–70% on dental work abroad. Compare Turkey, Spain, and Greece costs, clinics, travel logistics, and what to expect." \
    INFORMATIONAL 85 \
    "Template DT-F UK origin. UK £2,000–£25,000 vs abroad €300–€900/implant. Destinations, clinic selection, NHS/insurance, travel." \
    || failures+=("origin-uk")

  process_page "${site_id}" \
    "dental treatment abroad from usa" \
    "/from/usa/dental-abroad" \
    "Dental Treatment Abroad for US Patients: What You Need to Know" \
    "Dental Treatment Abroad from USA — Patient Guide | MedCover" \
    "US patients save thousands on dental work abroad. Compare Turkey, Spain, and Greece — costs, clinics, travel, and trip planning." \
    INFORMATIONAL 85 \
    "Template DT-F USA origin. US \$3,000–\$6,000/implant vs abroad. Insurance gaps, flight times, visa-free destinations." \
    || failures+=("origin-usa")

  # ── Authority articles ─────────────────────────────────────────────────────
  log "--- Authority articles ---"
  process_page "${site_id}" \
    "dental implants vs veneers abroad" \
    "/guides/dental-implants-vs-veneers-abroad" \
    "Dental Implants vs Veneers Abroad: Which Is Right for You?" \
    "Dental Implants vs Veneers Abroad — Comparison Guide | MedCover" \
    "Implants and veneers solve different problems. Compare durability, cost abroad, trip count, and candidacy to choose the right treatment." \
    INFORMATIONAL 80 \
    "Authority article. Implants vs veneers comparison, materials, cost abroad, trip count, candidacy. Link to treatment page and country guides." \
    || failures+=("implants-vs-veneers")

  process_page "${site_id}" \
    "all on 4 dental implants guide" \
    "/guides/all-on-4-dental-implants-guide" \
    "All-on-4 Dental Implants: Complete Patient Guide (2026)" \
    "All-on-4 Dental Implants Guide 2026 | MedCover" \
    "All-on-4 replaces a full arch with four implants. Learn candidacy, costs abroad, materials, recovery, and what to ask your clinic." \
    INFORMATIONAL 85 \
    "All-on-4 authority guide. Full-arch replacement, candidacy, costs abroad, materials, recovery timeline, red flags." \
    || failures+=("all-on-4")

  process_page "${site_id}" \
    "dental tourism istanbul guide" \
    "/guides/dental-tourism-istanbul-guide" \
    "Dental Tourism in Istanbul: Complete Patient Guide (2026)" \
    "Dental Tourism Istanbul 2026 — Patient Guide | MedCover" \
    "Istanbul is a top dental tourism hub. Clinic selection, 3–5 day itinerary, implant costs, hotels, and red flags for international patients." \
    COMMERCIAL 85 \
    "Istanbul authority guide. Clinic selection, itinerary, implant/veneer costs, hotels near clinics, red flags." \
    || failures+=("istanbul-guide")

  process_page "${site_id}" \
    "dental implant recovery timeline" \
    "/guides/dental-implant-recovery-timeline" \
    "Dental Implant Recovery Timeline: What to Expect Week by Week" \
    "Dental Implant Recovery Timeline — Week by Week | MedCover" \
    "Dental implant recovery spans days to months. Week-by-week timeline from surgery to final crown — what to expect at each stage." \
    INFORMATIONAL 75 \
    "Recovery timeline. Week-by-week from day 1 to final crown. Osseointegration, temporary vs permanent teeth, when to fly home." \
    || failures+=("recovery-timeline")

  process_page "${site_id}" \
    "how to choose dental clinic abroad" \
    "/guides/how-to-choose-dental-clinic-abroad" \
    "How to Choose a Dental Clinic Abroad: What Patients Should Verify" \
    "How to Choose a Dental Clinic Abroad — Patient Guide | MedCover" \
    "Choosing a dental clinic abroad requires verifying credentials, materials, warranties, and aftercare. Checklist for implants, veneers, and full-mouth work." \
    INFORMATIONAL 80 \
    "Clinic selection guide. Credentials, materials, warranty, aftercare, red flags, questions to ask. Link to country guides." \
    || failures+=("choose-clinic")

  ((${#failures[@]} > 0)) && log "Incomplete (fix manually): ${failures[*]}"
  log "Phase 2 complete — all 10 pages processed (check partial pages manually)."
}

main "$@"
