#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://nestino-backend-production.up.railway.app/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD required}"
SITE_ID="${SITE_ID:-2}"
POLL_INTERVAL="${POLL_INTERVAL:-15}"
POLL_MAX="${POLL_MAX:-120}"

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

log() { printf '[create-articles] %s\n' "$*" >&2; }

api() {
  local method="$1" path="$2" body="${3:-}"
  local out="${TMP}/resp.json" code
  local args=(-sS -o "$out" -w "%{http_code}" -X "$method" "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${TOKEN}" -H "Accept: application/json")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  code="$(curl "${args[@]}")"
  if [[ "$code" -lt 200 || "$code" -ge 300 ]]; then
    log "FAIL $method $path ($code)"
    cat "$out" >&2
    return 1
  fi
  cat "$out"
}

login() {
  local out="${TMP}/login.json" code
  code="$(curl -sS -o "$out" -w "%{http_code}" -X POST "${BASE_URL}/identity/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}")"
  [[ "$code" -ge 200 && "$code" -lt 300 ]] || { cat "$out" >&2; exit 1; }
  TOKEN="$(jq -r '.accessToken' "$out")"
}

create_article() {
  local slug="$1" keyword_json="$2" page_json="$3"
  log "Creating keyword for ${slug}..."
  local kw_id
  kw_id="$(api POST /keywords "$keyword_json" | jq -r '.id')"
  log "  keywordId=${kw_id}"

  local page_body
  page_body="$(echo "$page_json" | jq --argjson kid "$kw_id" '.keywordId = $kid')"
  log "Creating page ${slug}..."
  local page_id
  page_id="$(api POST /pages "$page_body" | jq -r '.id')"
  log "  pageId=${page_id}"

  log "Queueing generate-content for page ${page_id}..."
  api POST "/pages/${page_id}/generate-content?resetCheckpoint=true" "" >/dev/null

  echo "${page_id}|${slug}"
}

poll_page() {
  local page_id="$1" slug="$2"
  local i=0 status pipeline
  while [[ "$i" -lt "$POLL_MAX" ]]; do
    local data
    data="$(api GET "/pages/${page_id}")"
    status="$(echo "$data" | jq -r '.status')"
    pipeline="$(echo "$data" | jq -r '.pipelineStatus')"
    log "  ${slug} pageId=${page_id} status=${status} pipeline=${pipeline}"
    if [[ "$pipeline" == "READY" || "$pipeline" == "PARTIALLY_COMPLETED" ]]; then
      if [[ "$status" != "PUBLISHED" ]]; then
        log "  Publishing ${page_id}..."
        api POST "/pages/${page_id}/publish" "" >/dev/null || true
      fi
      echo "$data" | jq '{id, slug, status, pipelineStatus, wordCount, seoScore, publishedAt}'
      return 0
    fi
    if [[ "$pipeline" == "FAILED" ]]; then
      echo "$data" | jq '{id, slug, status, pipelineStatus}' >&2
      return 1
    fi
    sleep "$POLL_INTERVAL"
    i=$((i + 1))
  done
  log "TIMEOUT waiting for page ${page_id}"
  return 1
}

login
log "Logged in to ${BASE_URL}"

declare -a CREATED=()

# Article 3 — Add-ons (publish first)
CREATED+=("$(create_article '/guides/ivf-add-on-treatments-guide' \
  '{"siteId":2,"keyword":"ivf add on treatments worth it","language":"EN","intent":"INFORMATIONAL","status":"PENDING","priority":1,"targetUrl":"/guides/ivf-add-on-treatments-guide","notes":"CONTENT BRIEF — Objective add-on review (~1,800 words). REQUIRED H2s: What Are IVF Add-On Treatments; Add-Ons With Strong Evidence PGT-A and Embryo Glue; Mixed Evidence; Experimental Endometrial Scratching and Intralipid; Talk to Doctor; Marketing vs Evidence; Typical Add-On Costs Europe table; MedCover Patient Reports; FAQ. Link cost pages and country guides. Cite Cochrane/ESHRE."}' \
  '{"siteId":2,"slug":"/guides/ivf-add-on-treatments-guide","language":"EN","title":"Understanding Add-On Treatments: Are They Worth the Extra Cost?","metaTitle":"IVF Add-On Treatments — What'\''s Worth It? | MedCover","metaDescription":"Objective review of IVF add-ons: PGT-A, Embryo Glue, endometrial scratching, and Intralipid. Evidence vs marketing, costs, and questions for your doctor.","status":"DRAFT"}')")

# Article 5 — Lifestyle
CREATED+=("$(create_article '/guides/ivf-lifestyle-pre-treatment-plan' \
  '{"siteId":2,"keyword":"ivf lifestyle pre treatment plan 90 days","language":"EN","intent":"INFORMATIONAL","status":"PENDING","priority":1,"targetUrl":"/guides/ivf-lifestyle-pre-treatment-plan","notes":"CONTENT BRIEF — 90-day prep guide (~1,800 words). REQUIRED H2s: Why 90 Days Matters; Month 1 Baseline; Month 2 Supplements CoQ10 Vitamin D; Month 3 Final Optimization; Mediterranean Diet; Environmental Toxins; Stress and Sleep; Honest Limits; FAQ. YMYL medical reviewer."}' \
  '{"siteId":2,"slug":"/guides/ivf-lifestyle-pre-treatment-plan","language":"EN","title":"The Impact of Lifestyle on IVF Outcomes: A 3-Month Pre-Treatment Plan","metaTitle":"IVF Pre-Treatment Plan — 90-Day Lifestyle Guide | MedCover","metaDescription":"Optimize egg quality and uterine health 90 days before IVF: supplements, Mediterranean diet, toxin reduction, and stress management. Evidence-based prep plan.","status":"DRAFT"}')")

# Article 2 — IVF vs natural
CREATED+=("$(create_article '/guides/ivf-vs-natural-conception-40-plus' \
  '{"siteId":2,"keyword":"ivf vs natural conception after 40","language":"EN","intent":"INFORMATIONAL","status":"PENDING","priority":1,"targetUrl":"/guides/ivf-vs-natural-conception-40-plus","notes":"CONTENT BRIEF — Evidence decision guide (~1,800 words). REQUIRED H2s: One More Natural Cycle or IVF with PGT-A; Egg Quality After 40; Biological Clock; Live Birth Rates table Natural vs IVF; Time Is Valuable; When IVF Makes Sense; When Waiting OK; Decide With Doctor; FAQ. Cite CDC/ESHRE."}' \
  '{"siteId":2,"slug":"/guides/ivf-vs-natural-conception-40-plus","language":"EN","title":"IVF vs. Natural Conception at 40+: A Comparative Medical Analysis","metaTitle":"IVF vs Natural Conception After 40 — Data Guide | MedCover","metaDescription":"Evidence-based comparison of live birth rates: natural conception vs IVF with PGT-A after 40. Age, egg quality, and why time matters most.","status":"DRAFT"}')")

# Article 1 — AI & genetic screening
CREATED+=("$(create_article '/guides/ai-genetic-screening-ivf-2026' \
  '{"siteId":2,"keyword":"ai genetic screening ivf 2026","language":"EN","intent":"INFORMATIONAL","status":"PENDING","priority":1,"targetUrl":"/guides/ai-genetic-screening-ivf-2026","notes":"CONTENT BRIEF — Tech authority (~1,800 words). REQUIRED H2s: AI Transforming IVF Lab 2026; AI Embryo Selection Morphokinetic Analysis; Predictive Modeling; PGT-A Screening; Time-Lapse Incubators; Failed Cycles; Leading European Clinics; Questions for Clinic; FAQ. Cite ESHRE/ASRM."}' \
  '{"siteId":2,"slug":"/guides/ai-genetic-screening-ivf-2026","language":"EN","title":"The Future of Fertility: How AI & Genetic Screening Are Changing IVF in 2026","metaTitle":"AI & Genetic Screening in IVF 2026 — Patient Guide | MedCover","metaDescription":"AI embryo selection, PGT-A screening, and time-lapse incubators explained. What new lab technology means for patients with previous failed IVF cycles.","status":"DRAFT"}')")

# Article 4 — Travel insurance
CREATED+=("$(create_article '/guides/ivf-abroad-travel-insurance-guide' \
  '{"siteId":2,"keyword":"ivf abroad travel insurance coverage","language":"EN","intent":"INFORMATIONAL","status":"PENDING","priority":1,"targetUrl":"/guides/ivf-abroad-travel-insurance-guide","notes":"CONTENT BRIEF — Insurance guide (~1,800 words). REQUIRED H2s: Why Standard Insurance Fails; Complications Insurance OHSS; Emergency Return; Specialized Providers; What to Check; Country Considerations Spain Greece Turkey Czech; Costs; Pre-Trip Checklist table; FAQ. Not legal advice disclaimer."}' \
  '{"siteId":2,"slug":"/guides/ivf-abroad-travel-insurance-guide","language":"EN","title":"Your IVF Abroad Travel Insurance Guide: What Is Actually Covered?","metaTitle":"IVF Abroad Travel Insurance — What'\''s Covered? | MedCover","metaDescription":"Standard travel insurance won'\''t cover IVF complications. OHSS hospitalization, emergency returns, and specialized fertility insurance — what you need before you fly.","status":"DRAFT"}')")

log "All 5 pages queued. Polling for completion..."
RESULTS="${TMP}/results.json"
echo "[]" > "$RESULTS"

for entry in "${CREATED[@]}"; do
  page_id="${entry%%|*}"
  slug="${entry#*|}"
  log "Polling ${slug}..."
  if poll_page "$page_id" "$slug" > "${TMP}/one.json"; then
    RESULTS_NEW="$(jq -s ".[0] + [.[1]]" "$RESULTS" "${TMP}/one.json")"
    echo "$RESULTS_NEW" > "$RESULTS"
  else
    log "WARNING: ${slug} did not complete in time (pageId=${page_id})"
  fi
done

log "Done."
jq . "$RESULTS"
