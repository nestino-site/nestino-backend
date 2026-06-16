#!/usr/bin/env bash
# Phase 6 orchestrator: seed templates/subjects, then generate first-wave hair restoration content.
#
# Usage:
#   BASE_URL=https://nestino-backend-production.up.railway.app \
#   ADMIN_PASSWORD=... \
#   ./scripts/generate-hair-restoration-first-wave.sh
#
# Options (forwarded to child scripts):
#   SKIP_PUBLISH=true          Stop after pipeline READY
#   SKIP_SEED=true             Skip template/subject seeding
#   SKIP_CITY_GUIDES=true      Skip city guide generation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '[hr-first-wave] %s\n' "$*" >&2; }

if [[ -z "${BASE_URL:-}" || -z "${ADMIN_PASSWORD:-}" ]]; then
  echo "Usage: BASE_URL=https://... ADMIN_PASSWORD=... $0" >&2
  exit 1
fi

if [[ "${SKIP_SEED:-false}" != "true" ]]; then
  log "Step 1/3: Seeding templates and subjects..."
  bash "${SCRIPT_DIR}/seed-hair-restoration.sh"
fi

log "Step 2/3: Generating country guides + treatment page..."
bash "${SCRIPT_DIR}/generate-hair-restoration-country-guides-direct.sh"

if [[ "${SKIP_CITY_GUIDES:-false}" != "true" ]]; then
  log "Step 3/3: Generating city guides..."
  bash "${SCRIPT_DIR}/generate-hair-restoration-city-guides-direct.sh" --all
else
  log "Step 3/3: Skipped city guides (SKIP_CITY_GUIDES=true)"
fi

log "First wave complete. Run cost/origin/article scripts from Doc/Health/hair-restoration/ swagger bodies for remaining pages."
