#!/usr/bin/env bash
# Compare published Traffic Engine pages vs live MedCover frontend HTTP status.
# City guides must use flat slugs: /guides/{city}-ivf-guide (not /guides/{country}/{city}-ivf-guide).
set -euo pipefail

BASE="${BASE_URL:-https://nestino-backend-production.up.railway.app/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-NestinoTest2026!}"
SITE_ID="${SITE_ID:-2}"
FRONTEND="${FRONTEND_URL:-https://www.medcover.io}"

PASS=0
FAIL=0

pass() { echo "✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "❌ $1"; FAIL=$((FAIL + 1)); }

login() {
  curl -sS --max-time 45 --retry 2 -X POST "$BASE/identity/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])"
}

echo "========== MEDCOVER PUBLISH AUDIT =========="
echo "Backend: $BASE | Frontend: $FRONTEND | Site: $SITE_ID"
echo ""

TOKEN="$(login)"
export BASE TOKEN SITE_ID FRONTEND

python3 <<'PY'
import json, os, re, subprocess, sys, time, urllib.request

base = os.environ["BASE"]
token = os.environ["TOKEN"]
site_id = os.environ["SITE_ID"]
frontend = os.environ["FRONTEND"].rstrip("/")

def api(path):
    req = urllib.request.Request(
        f"{base}{path}",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read())

all_pages = []
for page in range(1, 50):
    batch = api(f"/pages?siteId={site_id}&status=PUBLISHED&page={page}&limit=200")
    if not batch:
        break
    all_pages.extend(batch)
    if len(batch) < 200:
        break

guides = [p for p in all_pages if (p.get("slug") or "").startswith("/guides/")]
nested = [p for p in guides if re.match(r"^/guides/[^/]+/[^/]+", p.get("slug") or "")]

print(f"Published pages: {len(all_pages)}")
print(f"Guide pages: {len(guides)}")
if nested:
    print("\n⚠️  Nested guide slugs still in backend (frontend will 404):")
    for p in nested:
        print(f"   id={p['id']} slug={p['slug']}")
else:
    print("Guide slug shape: OK (all flat /guides/*)")

failures = []
for p in sorted(guides, key=lambda x: x.get("slug", "")):
    slug = (p.get("slug") or "").rstrip("/")
    url = f"{frontend}{slug}"
    time.sleep(0.8)
    try:
        code = subprocess.check_output(
            ["curl", "-sS", "--max-time", "25", "-o", "/tmp/audit.html", "-w", "%{http_code}", "-L", url],
            text=True,
        ).strip()
    except subprocess.CalledProcessError:
        code = "ERR"
    if code != "200":
        failures.append((p["id"], slug, code))

print(f"\nFrontend guide checks: {len(guides) - len(failures)} OK, {len(failures)} FAIL")
for page_id, slug, code in failures:
    print(f"   FAIL id={page_id} HTTP {code} {slug}")

# Write machine-readable summary for shell counters
with open("/tmp/medcover-audit.json", "w") as f:
    json.dump({"nested": nested, "failures": failures}, f)

sys.exit(1 if nested or failures else 0)
PY

AUDIT_EXIT=$?
NESTED_COUNT=$(python3 -c "import json; d=json.load(open('/tmp/medcover-audit.json')); print(len(d['nested']))")
FAIL_COUNT=$(python3 -c "import json; d=json.load(open('/tmp/medcover-audit.json')); print(len(d['failures']))")

if [[ "$NESTED_COUNT" -eq 0 ]]; then pass "no nested /guides/{country}/{city} slugs in backend"; else fail "$NESTED_COUNT nested guide slug(s) need flattening"; fi
if [[ "$FAIL_COUNT" -eq 0 ]]; then pass "all published guides return HTTP 200 on MedCover"; else fail "$FAIL_COUNT guide(s) not live on MedCover"; fi

echo ""
echo "========== RESULTS: $PASS passed, $FAIL failed =========="
[[ "$AUDIT_EXIT" -eq 0 ]]
