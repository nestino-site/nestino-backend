#!/usr/bin/env bash
# Seed Hair Restoration clinics (20 per city) on production via discovery/quick.
set -uo pipefail
export PATH="/usr/bin:/bin:/opt/homebrew/bin"

BASE="${BASE_URL:-https://nestino-backend-production.up.railway.app/api/v1}"
TARGET=20
PAUSE=150
WAIT=720
POLL=12
TREATMENT="HAIR_RESTORATION"
LOG="${LOG_FILE:-/tmp/hair-restoration-seed.log}"

log() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }

login() {
  curl -sS --max-time 30 -X POST "$BASE/identity/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@nestino.test","password":"NestinoTest2026!"}' \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])"
}

ensure_treatment() {
  local token="$1"
  local exists
  exists=$(curl -sS --max-time 30 -H "Authorization: Bearer $token" "$BASE/treatments" \
    | python3 -c "import json,sys;d=json.load(sys.stdin);codes=[t['code'] for t in d];print('yes' if 'HAIR_RESTORATION' in codes else 'no')")
  if [[ "$exists" == "yes" ]]; then
    log "Treatment HAIR_RESTORATION already exists"
    return
  fi
  log "Creating treatment HAIR_RESTORATION..."
  curl -sS --max-time 30 -X POST "$BASE/treatments" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d '{"code":"HAIR_RESTORATION","name":"Hair Restoration","description":"Hair transplant, FUE, FUT, and hair restoration clinics","sortOrder":20,"isActive":true}' \
    | tee -a "$LOG"
}

hair_count() {
  local cid="$1"
  curl -sS --max-time 30 "$BASE/clinics?cityId=${cid}&treatment=${TREATMENT}&limit=100" \
    | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('items',[])))"
}

city_meta() {
  local slug="$1"
  curl -sS --max-time 30 "$BASE/cities/$slug" \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['id'], d['name'])"
}

trigger_discovery() {
  local token="$1" cid="$2" max="$3"
  local types_json="$4"
  curl -sS --max-time 45 -X POST "$BASE/discovery/quick" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{\"cityId\":${cid},\"clinicTypes\":${types_json},\"maxResults\":${max},\"autoApprove\":true,\"dryRun\":false}" \
    >>"$LOG" 2>&1 || true
}

wait_target() {
  local cid="$1" target="$2" start="$3"
  local deadline=$(( $(date +%s) + WAIT ))
  local last="$start" stale=0
  while [[ $(date +%s) -lt $deadline ]]; do
    sleep "$POLL"
    local count
    count=$(hair_count "$cid" 2>/dev/null || echo "$last")
    if [[ "$count" != "$last" ]]; then
      log "    hair clinics: $count/$target"
      last="$count"
      stale=0
    else
      stale=$((stale + 1))
    fi
    [[ "$count" -ge "$target" ]] && echo "$count" && return 0
    [[ "$stale" -ge 15 ]] && log "    stalled at $count" && echo "$count" && return 0
  done
  hair_count "$cid"
}

CITIES=(
  alicante ankara athens barcelona brno istanbul lisbon madrid porto prague skopje thessaloniki valencia
)

: > "$LOG"
log "=== Hair Restoration seeding | target $TARGET/city | pause ${PAUSE}s ==="

TOKEN=$(login)
ensure_treatment "$TOKEN"

RESULTS=()
for i in "${!CITIES[@]}"; do
  slug="${CITIES[$i]}"
  read -r CID CNAME <<< "$(city_meta "$slug")"
  start=$(hair_count "$CID")
  n=$(( i + 1 ))
  total=${#CITIES[@]}
  log ""
  log "[$n/$total] $CNAME ($slug) — $start hair clinics, need $((TARGET - start))"

  if [[ "$start" -ge "$TARGET" ]]; then
    log "  skip (already at target)"
    RESULTS+=("$slug:$start:$start:ok")
    continue
  fi

  TOKEN=$(login)
  log "  → discovery pass 1 (Hair Restoration, max=25)"
  trigger_discovery "$TOKEN" "$CID" 25 '["Hair Restoration"]'
  final=$(wait_target "$CID" "$TARGET" "$start")

  if [[ "$final" -lt "$TARGET" ]]; then
    TOKEN=$(login)
    log "  → discovery pass 2 (hair transplant → HAIR_RESTORATION, max=35)"
    trigger_discovery "$TOKEN" "$CID" 35 '["hair transplant"]'
    final=$(wait_target "$CID" "$TARGET" "$final")
  fi

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
log "=== SUMMARY (HAIR_RESTORATION per city) ==="
for r in "${RESULTS[@]}"; do
  IFS=: read -r slug before after status <<< "$r"
  log "  $(printf '%-15s %2s → %2s  [%s]' "$slug" "$before" "$after" "$status")"
done

log "=== ALL DONE ==="
