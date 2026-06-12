#!/usr/bin/env bash
set -uo pipefail

BASE="${BASE_URL:-https://nestino-backend-production.up.railway.app/api/v1}"
TARGET=10
PAUSE=150
WAIT=600
POLL=15
LOG="${LOG_FILE:-/tmp/clinic-seed-run3.log}"

log() { echo "$(date -u +%H:%M:%S) $*" >> "$LOG"; echo "$(date -u +%H:%M:%S) $*"; }

login() {
  curl -sS --max-time 30 -X POST "$BASE/identity/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@nestino.test","password":"NestinoTest2026!"}' \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])"
}

clinic_count() {
  curl -sS --max-time 30 "$BASE/cities/$1" \
    | python3 -c "import json,sys;print(json.load(sys.stdin).get('_count',{}).get('clinics',0))"
}

city_id() {
  curl -sS --max-time 30 "$BASE/cities/$1" \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])"
}

trigger_discovery() {
  local token="$1" cid="$2" n="$3"
  curl -sS --max-time 45 -X POST "$BASE/discovery/quick" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{\"cityId\":$cid,\"clinicTypes\":[\"IVF\"],\"maxResults\":$n,\"autoApprove\":true,\"dryRun\":false}" \
    >/dev/null 2>&1 || true
}

wait_target() {
  local slug="$1" target="$2" start="$3"
  local deadline=$(( $(date +%s) + WAIT ))
  local last="$start"
  while [[ $(date +%s) -lt $deadline ]]; do
    sleep "$POLL"
    local count
    count=$(clinic_count "$slug" 2>/dev/null || echo "$last")
    if [[ "$count" != "$last" ]]; then
      log "    $slug: $count/$target"
      last="$count"
    fi
    if [[ "$count" -ge "$target" ]]; then
      echo "$count"
      return 0
    fi
  done
  clinic_count "$slug"
}

# slug:name pairs — madrid skipped (already 10)
CITIES=(
  barcelona
  alicante
  valencia
  athens
  thessaloniki
  prague
  brno
  istanbul
  ankara
  lisbon
  porto
  skopje
)

log "=== Production clinic seeding (curl) ==="
log "Target $TARGET/city | pause ${PAUSE}s | wait ${WAIT}s"

TOKEN=$(login)
RESULTS=()

for i in "${!CITIES[@]}"; do
  slug="${CITIES[$i]}"
  start=$(clinic_count "$slug")
  needed=$(( TARGET - start ))
  n=$(( i + 1 ))
  total=${#CITIES[@]}
  log ""
  log "[$n/$total] $slug — $start clinics, need $needed"

  if [[ "$needed" -le 0 ]]; then
    log "  skip (already at target)"
    RESULTS+=("$slug:$start:$start:ok")
    continue
  fi

  cid=$(city_id "$slug")
  TOKEN=$(login)
  log "  → discovery maxResults=$TARGET"
  trigger_discovery "$TOKEN" "$cid" "$TARGET"
  final=$(wait_target "$slug" "$TARGET" "$start")
  if [[ "$final" -ge "$TARGET" ]]; then
    status=ok
  else
    status=partial
  fi
  log "  ✓ $slug: $start → $final [$status]"
  RESULTS+=("$slug:$start:$final:$status")

  if [[ "$n" -lt "$total" ]]; then
    log "  ⏸ pause ${PAUSE}s"
    sleep "$PAUSE"
  fi
done

log ""
log "=== SUMMARY ==="
for r in "${RESULTS[@]}"; do
  IFS=: read -r slug before after status <<< "$r"
  log "  $(printf '%-15s %2s → %2s  [%s]' "$slug" "$before" "$after" "$status")"
done
