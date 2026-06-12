#!/usr/bin/env bash
# Process only cities with 0 clinics (skip barcelona partial + madrid done)
set -uo pipefail
export PATH="/usr/bin:/bin:/opt/homebrew/bin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export LOG_FILE="/tmp/clinic-seed-remaining.log"
: > "$LOG_FILE"

CITIES=(alicante valencia athens thessaloniki prague brno istanbul ankara lisbon porto skopje)

for slug in "${CITIES[@]}"; do
  echo "=== Processing $slug ===" >> "$LOG_FILE"
  # Patch CITIES list in main script by passing via env - simpler: inline one city calls
  
  BASE="https://nestino-backend-production.up.railway.app/api/v1"
  TOKEN=$(curl -sS --max-time 30 -X POST "$BASE/identity/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@nestino.test","password":"NestinoTest2026!"}' \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])")
  CID=$(curl -sS --max-time 30 "$BASE/cities/$slug" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")
  START=$(curl -sS --max-time 30 "$BASE/cities/$slug" | python3 -c "import json,sys;print(json.load(sys.stdin)['_count']['clinics'])")
  echo "$(date -u +%H:%M:%S) $slug start=$START" | tee -a "$LOG_FILE"
  
  curl -sS --max-time 45 -X POST "$BASE/discovery/quick" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"cityId\":$CID,\"clinicTypes\":[\"IVF\"],\"maxResults\":10,\"autoApprove\":true}" \
    >> "$LOG_FILE" 2>&1 || true
  
  for i in $(seq 1 40); do
    sleep 15
    C=$(curl -sS --max-time 30 "$BASE/cities/$slug" | python3 -c "import json,sys;print(json.load(sys.stdin)['_count']['clinics'])")
    echo "$(date -u +%H:%M:%S) $slug poll $i: $C/10" >> "$LOG_FILE"
    [[ "$C" -ge 10 ]] && break
  done
  FINAL=$(curl -sS --max-time 30 "$BASE/cities/$slug" | python3 -c "import json,sys;print(json.load(sys.stdin)['_count']['clinics'])")
  echo "$(date -u +%H:%M:%S) $slug DONE: $START → $FINAL" | tee -a "$LOG_FILE"
  
  echo "$(date -u +%H:%M:%S) pause 150s" >> "$LOG_FILE"
  sleep 150
done

echo "=== ALL DONE ===" >> "$LOG_FILE"
curl -sS "$BASE/cities" | python3 -c "
import json,sys
for c in sorted(json.load(sys.stdin), key=lambda x:x['slug']):
    print(c['slug'], c['_count']['clinics'])
" >> "$LOG_FILE"
