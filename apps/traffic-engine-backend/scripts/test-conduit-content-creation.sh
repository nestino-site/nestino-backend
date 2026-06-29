#!/usr/bin/env bash
# End-to-end Conduit content creation test — one page, all text AI via Conduit.
#
# Prerequisites on the target backend (Railway or local):
#   CONDUIT_API_KEY=sk-cdt-...
#   AI_STUB=false
#   AI_GATEWAY_PROVIDER=conduit
#   LLM_GATEWAY_PROVIDER=conduit
#
# Usage:
#   ADMIN_PASSWORD=... ./scripts/test-conduit-content-creation.sh
#   BASE_URL=http://localhost:3000/api/v1 ADMIN_PASSWORD=... ./scripts/test-conduit-content-creation.sh
#
# Optional:
#   SITE_ID=2
#   RESTORE_SITE_CONFIG=true   # restore model/runtime config after test (default true)
#   PUBLISH=true               # publish when READY (default false — keeps draft for review)
set -euo pipefail

BASE_URL="${BASE_URL:-https://nestino-backend-production.up.railway.app/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD required}"
SITE_ID="${SITE_ID:-2}"
POLL_INTERVAL="${POLL_INTERVAL:-20}"
POLL_MAX="${POLL_MAX:-90}"
RESTORE_SITE_CONFIG="${RESTORE_SITE_CONFIG:-true}"
PUBLISH="${PUBLISH:-false}"

# Conduit model mix: strong writer + fast analyzers (see https://conduit.ozdoev.net/#docs)
CONDUIT_MODEL_GENERATE="${CONDUIT_MODEL_GENERATE:-claude-sonnet-4-6}"
CONDUIT_MODEL_ANALYZE="${CONDUIT_MODEL_ANALYZE:-gpt-4o-mini}"
CONDUIT_MODEL_REWRITE="${CONDUIT_MODEL_REWRITE:-gpt-4o-mini}"
CONDUIT_MODEL_SEO_CHECK="${CONDUIT_MODEL_SEO_CHECK:-gpt-4o-mini}"

TS="$(date +%Y%m%d%H%M%S)"
TEST_SLUG="${TEST_SLUG:-/guides/egg-freezing-spain-guide-${TS}}"
TEST_KEYWORD="${TEST_KEYWORD:-egg freezing spain cost timeline guide}"
TEST_TITLE="${TEST_TITLE:-Egg Freezing in Spain: Costs, Timeline, and How to Choose a Clinic}"
TEST_META_TITLE="${TEST_META_TITLE:-Egg Freezing in Spain — Costs & Clinic Guide | MedCover}"
TEST_META_DESC="${TEST_META_DESC:-Plan egg freezing in Spain: typical costs, treatment timeline, legal basics, and a practical checklist for comparing clinics.}"
TEST_NOTES="${TEST_NOTES:-MedCover patient guide (~1,400 words). REQUIRED H2s: Why Spain for Egg Freezing; Typical Costs and What Is Included; Step-by-Step Timeline; Legal and Storage Rules; How to Compare Clinics; Red Flags; FAQ. YMYL: balanced, cite ESHRE/ASRM where relevant, no guaranteed outcomes.}"

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

log() { printf '[conduit-test] %s\n' "$*" >&2; }

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
    log "FAIL $method $path (HTTP $code)"
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

backup_site_config() {
  api GET "/site-configs/${SITE_ID}" > "${TMP}/site-config-backup.json"
  log "Backed up site ${SITE_ID} config"
}

patch_conduit_test_config() {
  local payload
  payload="$(jq -n \
    --arg gen "$CONDUIT_MODEL_GENERATE" \
    --arg analyze "$CONDUIT_MODEL_ANALYZE" \
    --arg rewrite "$CONDUIT_MODEL_REWRITE" \
    --arg seo "$CONDUIT_MODEL_SEO_CHECK" \
    '{
      modelConfig: {
        generate: $gen,
        analyze: $analyze,
        rewrite: $rewrite,
        seo_check: $seo,
        image_generation: "imagen-4.0-generate-001",
        rules: {
          highPriority: $gen,
          lowPriority: $analyze,
          fallback: $analyze
        }
      },
      runtimeConfig: {
        enableAnalysis: true,
        enableRewrite: true,
        enableImageGeneration: false,
        enableSeoCheck: true,
        enableInternalLinking: true,
        enableHtmlInternalLinking: false,
        maxRetries: 2,
        minSeoCheckScore: 40
      }
    }')"
  api PATCH "/site-configs/${SITE_ID}" "$payload" >/dev/null
  log "Patched site ${SITE_ID} for Conduit-only text pipeline (no Imagen, no Gemini YMYL)"
  log "  generate=$CONDUIT_MODEL_GENERATE analyze=$CONDUIT_MODEL_ANALYZE rewrite=$CONDUIT_MODEL_REWRITE seo_check=$CONDUIT_MODEL_SEO_CHECK"
}

restore_site_config() {
  if [[ "$RESTORE_SITE_CONFIG" != "true" ]]; then
    log "Skipping site config restore (RESTORE_SITE_CONFIG=$RESTORE_SITE_CONFIG)"
    return 0
  fi
  local backup="${TMP}/site-config-backup.json"
  if [[ ! -f "$backup" ]]; then
    return 0
  fi
  local payload
  payload="$(jq '{
    modelConfig: .modelConfig,
    runtimeConfig: .runtimeConfig,
    pipelineConfig: .pipelineConfig,
    promptConfig: .promptConfig
  }' "$backup")"
  api PATCH "/site-configs/${SITE_ID}" "$payload" >/dev/null || log "WARNING: could not restore site config"
  log "Restored site ${SITE_ID} config from backup"
}

print_ai_logs() {
  local page_id="$1"
  local logs_json
  if logs_json="$(api GET "/pages/${page_id}/ai-generation-logs" 2>/dev/null)"; then
    echo "$logs_json" | jq .
    return 0
  fi
  log "ai-generation-logs endpoint unavailable (deploy latest backend) — check AiGenerationLog in DB"
}

login
log "Target: ${BASE_URL} | siteId=${SITE_ID}"
START_EPOCH="$(date +%s)"

backup_site_config
trap 'restore_site_config' EXIT
patch_conduit_test_config

log "Creating keyword..."
KW_ID="$(api POST /keywords "$(jq -n \
  --argjson siteId "$SITE_ID" \
  --arg kw "$TEST_KEYWORD" \
  --arg url "$TEST_SLUG" \
  --arg notes "$TEST_NOTES" \
  '{
    siteId: $siteId,
    keyword: $kw,
    language: "EN",
    intent: "INFORMATIONAL",
    status: "PENDING",
    priority: 5,
    targetUrl: $url,
    notes: $notes
  }')" | jq -r '.id')"
log "  keywordId=${KW_ID}"

log "Creating page ${TEST_SLUG}..."
PAGE_ID="$(api POST /pages "$(jq -n \
  --argjson siteId "$SITE_ID" \
  --argjson keywordId "$KW_ID" \
  --arg slug "$TEST_SLUG" \
  --arg title "$TEST_TITLE" \
  --arg metaTitle "$TEST_META_TITLE" \
  --arg metaDesc "$TEST_META_DESC" \
  '{
    siteId: $siteId,
    keywordId: $keywordId,
    slug: $slug,
    language: "EN",
    title: $title,
    metaTitle: $metaTitle,
    metaDescription: $metaDesc,
    status: "DRAFT"
  }')" | jq -r '.id')"
log "  pageId=${PAGE_ID}"

log "Queueing pipeline via content-tasks (skip Gemini YMYL audit)..."
TASK_JSON="$(api POST /content-tasks "$(jq -n \
  --argjson siteId "$SITE_ID" \
  --argjson keywordId "$KW_ID" \
  --argjson pageId "$PAGE_ID" \
  '{
    siteId: $siteId,
    keywordId: $keywordId,
    pageId: $pageId,
    payload: { skipYmylAudit: true }
  }')")"
TASK_ID="$(echo "$TASK_JSON" | jq -r '.id')"
log "  contentTaskId=${TASK_ID}"

log "Polling pipeline (max ${POLL_MAX} x ${POLL_INTERVAL}s)..."
i=0
while [[ "$i" -lt "$POLL_MAX" ]]; do
  PAGE="$(api GET "/pages/${PAGE_ID}")"
  PIPELINE="$(echo "$PAGE" | jq -r '.pipelineStatus')"
  STATUS="$(echo "$PAGE" | jq -r '.status')"
  WORDS="$(echo "$PAGE" | jq -r '.wordCount // 0')"
  SEO="$(echo "$PAGE" | jq -r '.seoCheckScore // "n/a"')"
  log "  poll $((i + 1)): pipeline=${PIPELINE} status=${STATUS} words=${WORDS} seoScore=${SEO}"

  if [[ "$PIPELINE" == "READY" || "$PIPELINE" == "PARTIALLY_COMPLETED" ]]; then
  END_EPOCH="$(date +%s)"
  ELAPSED="$((END_EPOCH - START_EPOCH))"
  log "Pipeline finished in ${ELAPSED}s wall-clock"

  echo ""
  echo "========== CONDUIT TEST RESULT =========="
  echo "$PAGE" | jq '{
    id, slug, pipelineStatus, status, wordCount,
    seoCheckScore, seoCheckPassed, optimizationCount,
    metaTitle, metaDescription
  }'

  echo ""
  echo "========== AI STEP METRICS =========="
  print_ai_logs "$PAGE_ID"

  if [[ "$PUBLISH" == "true" && "$STATUS" != "PUBLISHED" ]]; then
    log "Publishing page ${PAGE_ID}..."
    api POST "/pages/${PAGE_ID}/publish" "" >/dev/null || true
  fi

  echo ""
  log "Done. pageId=${PAGE_ID} slug=${TEST_SLUG}"
  log "View: ${BASE_URL%/api/v1}/api/v1/pages/${PAGE_ID}"
  exit 0
  fi

  if [[ "$PIPELINE" == "FAILED" ]]; then
    echo "$PAGE" | jq '{id, slug, pipelineStatus, seoCheckIssues}' >&2
    TASK_STATUS=""
    if [[ -n "${TASK_ID:-}" ]]; then
      TASK_STATUS="$(api GET "/content-tasks/${TASK_ID}" 2>/dev/null | jq -r '.status // empty' || true)"
      log "  contentTask status=${TASK_STATUS}"
    fi
    exit 1
  fi

  sleep "$POLL_INTERVAL"
  i=$((i + 1))
done

log "TIMEOUT after $((POLL_MAX * POLL_INTERVAL))s — pageId=${PAGE_ID}"
print_ai_logs "$PAGE_ID" || true
exit 1
