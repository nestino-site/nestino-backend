#!/usr/bin/env bash
# Seed Dental clinics (20 per city) on production via discovery/quick.
set -uo pipefail
export PATH="/usr/bin:/bin:/opt/homebrew/bin"

BASE="${BASE_URL:-https://nestino-backend-production.up.railway.app/api/v1}"
TARGET=20
PAUSE=150
WAIT=720
POLL=12
SHORT_WAIT=45
TREATMENT="DENTAL"
LOG="${LOG_FILE:-/tmp/dental-seed.log}"

log() { echo "$(date -u +%H:%M:%S) $*" >> "$LOG"; echo "$(date -u +%H:%M:%S) $*"; }
log_file() { echo "$(date -u +%H:%M:%S) $*" >> "$LOG"; }

curl_json() {
  local attempt=1 out=""
  while [[ "$attempt" -le 3 ]]; do
    out=$(curl -sS --max-time 45 "$@" 2>/dev/null) && [[ -n "$out" ]] && { echo "$out"; return 0; }
    attempt=$((attempt + 1))
    sleep 2
  done
  return 1
}

login() {
  curl_json -X POST "$BASE/identity/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@nestino.test","password":"NestinoTest2026!"}' \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])"
}

ensure_treatment() {
  local token="$1"
  local raw
  raw=$(curl_json -H "Authorization: Bearer $token" "$BASE/treatments" || echo "[]")
  local exists
  exists=$(echo "$raw" | python3 -c "import json,sys;d=json.load(sys.stdin);codes=[t['code'] for t in d];print('yes' if 'DENTAL' in codes else 'no')" 2>/dev/null || echo "no")
  if [[ "$exists" == "yes" ]]; then
    log "Treatment DENTAL already exists"
    return
  fi
  log "Creating treatment DENTAL..."
  curl -sS --max-time 30 -X POST "$BASE/treatments" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d '{"code":"DENTAL","name":"Dental","description":"Dental implants, veneers, crowns, and all-on-4 clinics","sortOrder":21,"isActive":true}' \
    >>"$LOG" 2>&1 || true
}

city_meta() {
  local slug="$1" attempt=1 raw id name
  while [[ "$attempt" -le 5 ]]; do
    raw=$(curl_json "$BASE/cities/$slug" || true)
    if [[ -n "$raw" ]]; then
      id=$(echo "$raw" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['id'])" 2>/dev/null || true)
      name=$(echo "$raw" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['name'])" 2>/dev/null || true)
      if [[ "$id" =~ ^[0-9]+$ && -n "$name" ]]; then
        echo "$id $name"
        return 0
      fi
    fi
    attempt=$((attempt + 1))
    sleep 3
  done
  log "  ✗ failed to resolve city $slug — skipping"
  return 1
}

dental_count() {
  local cid="$1"
  [[ "$cid" =~ ^[0-9]+$ ]] || { echo "0"; return 0; }
  curl_json "$BASE/clinics?cityId=${cid}&treatment=${TREATMENT}&limit=100" \
    | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('items',[])))" 2>/dev/null || echo "0"
}

trigger_discovery() {
  local token="$1" cid="$2" max="$3"
  local types_json="$4"
  [[ "$max" -gt 15 ]] && max=15
  local resp
  resp=$(curl -sS --max-time 180 -X POST "$BASE/discovery/quick" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{\"cityId\":${cid},\"clinicTypes\":${types_json},\"maxResults\":${max},\"autoApprove\":true,\"dryRun\":false}" 2>/dev/null || echo '{"error":"curl failed"}')
  echo "$resp" >>"$LOG"
  if echo "$resp" | python3 -c "import json,sys;d=json.load(sys.stdin);sys.exit(0 if d.get('approved') is not None else 1)" 2>/dev/null; then
    local approved
    approved=$(echo "$resp" | python3 -c "import json,sys;print(json.load(sys.stdin).get('approved',0))")
    log_file "    discovery approved=$approved"
    echo "$approved"
  else
    log_file "    discovery error: $(echo "$resp" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('message',d))" 2>/dev/null || echo "$resp")"
    echo "-1"
  fi
}

wait_target() {
  local cid="$1" target="$2" start="$3" wait_secs="${4:-$WAIT}"
  local deadline=$(( $(date +%s) + wait_secs ))
  local last="$start" stale=0
  while [[ $(date +%s) -lt $deadline ]]; do
    sleep "$POLL"
    local count
    count=$(dental_count "$cid" || echo "$last")
    [[ "$count" =~ ^[0-9]+$ ]] || count="$last"
    if [[ "$count" != "$last" ]]; then
      log_file "    dental clinics: $count/$target"
      last="$count"
      stale=0
    else
      stale=$((stale + 1))
    fi
    [[ "$count" -ge "$target" ]] && echo "$count" && return 0
    [[ "$stale" -ge 8 ]] && log_file "    stalled at $count" && echo "$count" && return 0
  done
  dental_count "$cid" || echo "$last"
}

# Keyword passes for dental clinic discovery.
PASS_KEYWORDS=(
  '["dental clinic"]'
  '["dentist"]'
  '["dental implant"]'
  '["clinica dental"]'
)

CITIES=(
  alicante ankara athens barcelona brno istanbul lisbon madrid porto prague skopje thessaloniki valencia
)
if [[ -n "${ONLY_CITIES:-}" ]]; then
  read -ra CITIES <<< "${ONLY_CITIES//,/ }"
fi

: > "$LOG"
log "=== Dental seeding | target $TARGET/city | pause ${PAUSE}s ==="

TOKEN=$(login)
ensure_treatment "$TOKEN"

RESULTS=()
for i in "${!CITIES[@]}"; do
  slug="${CITIES[$i]}"
  if ! read -r CID CNAME <<< "$(city_meta "$slug")"; then
    RESULTS+=("$slug:?:?:error")
    continue
  fi
  start=$(dental_count "$CID")
  n=$(( i + 1 ))
  total=${#CITIES[@]}
  log ""
  log "[$n/$total] $CNAME ($slug) — $start dental clinics, need $((TARGET - start))"

  if [[ "$start" -ge "$TARGET" ]]; then
    log "  skip (already at target)"
    RESULTS+=("$slug:$start:$start:ok")
    continue
  fi

  final="$start"
  pass=0
  for types_json in "${PASS_KEYWORDS[@]}"; do
    [[ "$final" -ge "$TARGET" ]] && break
    pass=$((pass + 1))
    still=$((TARGET - final))
    pass_max=$(( still + 10 ))
    [[ "$pass_max" -gt 15 ]] && pass_max=15
    TOKEN=$(login)
    kw=$(echo "$types_json" | python3 -c "import json,sys;print(json.load(sys.stdin)[0])")
    log "  → discovery pass $pass ($kw, max=$pass_max)"
    approved=$(trigger_discovery "$TOKEN" "$CID" "$pass_max" "$types_json")
    if [[ "$approved" == "-1" ]]; then
      wait_secs=$SHORT_WAIT
    elif [[ "$approved" == "0" ]]; then
      wait_secs=$SHORT_WAIT
    else
      wait_secs=$WAIT
    fi
    final=$(wait_target "$CID" "$TARGET" "$final" "$wait_secs")
  done

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
log "=== SUMMARY (DENTAL per city) ==="
for r in "${RESULTS[@]}"; do
  IFS=: read -r slug before after status <<< "$r"
  log "  $(printf '%-15s %2s → %2s  [%s]' "$slug" "$before" "$after" "$status")"
done

log "=== ALL DONE ==="
