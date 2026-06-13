#!/usr/bin/env bash
# Audit and fix clinic page robotsMeta on production MedCover.
#
# Usage:
#   ./scripts/backfill-clinic-robots-index-production.sh --audit
#   ./scripts/backfill-clinic-robots-index-production.sh --fix-db     # needs DATABASE_URL (Railway Postgres)
#   ./scripts/backfill-clinic-robots-index-production.sh --patch-all   # PATCH robotsMeta via admin API (needs deployed backend)
#   ./scripts/backfill-clinic-robots-index-production.sh --republish   # republish clinic pages + frontend webhook
#   ./scripts/backfill-clinic-robots-index-production.sh --verify-live   # sample live MedCover HTML checks
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE="${BASE_URL:-https://nestino-backend-production.up.railway.app/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-NestinoTest2026!}"
SITE_ID="${SITE_ID:-2}"
FRONTEND="${FRONTEND_URL:-https://www.medcover.io}"
MODE="${1:---audit}"

login() {
  curl -sS --max-time 45 -X POST "$BASE/identity/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])"
}

echo "========== CLINIC ROBOTS INDEX BACKFILL =========="
echo "Backend: $BASE | Site: $SITE_ID | Mode: $MODE"
echo ""

TOKEN="$(login)"
export BASE TOKEN SITE_ID FRONTEND MODE ROOT

python3 <<'PY'
import json, os, re, subprocess, sys, time, urllib.error, urllib.request

base = os.environ["BASE"]
token = os.environ["TOKEN"]
site_id = int(os.environ["SITE_ID"])
frontend = os.environ["FRONTEND"].rstrip("/")
mode = os.environ["MODE"]
root = os.environ["ROOT"]

headers = {"Authorization": f"Bearer {token}"}


def api(path, method="GET", body=None):
    data = None
    req_headers = dict(headers)
    if body is not None:
        data = json.dumps(body).encode()
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{base}{path}", data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def is_clinic_pdp(page):
    slug = page.get("slug") or ""
    parts = slug.rstrip("/").split("/")
    parts = [p for p in parts if p]
    return page.get("pageType") == "clinic_pdp" or (len(parts) == 4 and parts[0] == "clinics")


all_pages = []
for page_num in range(1, 50):
    batch = api(f"/pages?siteId={site_id}&status=PUBLISHED&page={page_num}&limit=200")
    if not batch:
        break
    all_pages.extend(batch)
    if len(batch) < 200:
        break

clinic_pages = []
for p in all_pages:
    slug = p.get("slug") or ""
    if not slug.startswith("/clinics/"):
        continue
    parts = [x for x in slug.rstrip("/").split("/") if x]
    if len(parts) != 4:
        continue
    full = api(f"/pages/{p['id']}")
    if is_clinic_pdp(full):
        clinic_pages.append(full)

noindex = [p for p in clinic_pages if "noindex" in (p.get("robotsMeta") or "")]
index_ok = [p for p in clinic_pages if p.get("robotsMeta") == "index, follow"]
other = [p for p in clinic_pages if p not in noindex and p not in index_ok]

print(f"Clinic PDP pages found: {len(clinic_pages)}")
print(f"  index, follow: {len(index_ok)}")
print(f"  noindex:       {len(noindex)}")
print(f"  other/null:    {len(other)}")

if mode == "--audit":
    for p in noindex[:20]:
        print(f"  NOINDEX id={p['id']} {p['slug']}")
    if len(noindex) > 20:
        print(f"  ... and {len(noindex) - 20} more")
    sys.exit(0)

if mode == "--fix-db":
    db_url = os.environ.get("DATABASE_URL", "").strip()
    if not db_url:
        print("ERROR: set DATABASE_URL to the production Postgres URL from Railway.")
        sys.exit(1)
    import subprocess
    subprocess.run(
        [
            "npx", "ts-node", "--compiler-options", '{"module":"CommonJS"}',
            "scripts/backfill-clinic-robots-index.ts",
            "--site=medcover.io",
        ],
        cwd=root,
        check=True,
        env={**os.environ, "DATABASE_URL": db_url},
    )
    print("DB backfill complete.")
    sys.exit(0)

if mode == "--patch-all":
    updated = 0
    failed = 0
    for p in noindex:
        try:
            api(f"/pages/{p['id']}", method="PATCH", body={"robotsMeta": "index, follow"})
            api(f"/pages/{p['id']}/publish", method="POST")
            updated += 1
            if updated % 25 == 0:
                print(f"  patched {updated}/{len(noindex)}...")
            time.sleep(0.12)
        except urllib.error.HTTPError as err:
            failed += 1
            print(f"  FAIL patch page {p['id']}: HTTP {err.code}")
    print(f"Patched {updated} pages, {failed} failures.")
    sys.exit(0)

if mode == "--republish":
    updated = 0
    failed = 0
    for p in clinic_pages:
        if p.get("robotsMeta") == "index, follow":
            continue
        try:
            api(f"/pages/{p['id']}/publish", method="POST")
            updated += 1
            time.sleep(0.15)
        except urllib.error.HTTPError as err:
            failed += 1
            print(f"  FAIL republish page {p['id']}: HTTP {err.code}")
    print(f"Republished {updated} pages, {failed} failures.")
    sys.exit(0)

if mode == "--verify-live":
    samples = clinic_pages[:12] if clinic_pages else []
    if not samples:
        print("No clinic pages to verify.")
        sys.exit(1)
    bad = []
    for p in samples:
        slug = (p.get("slug") or "").rstrip("/")
        url = f"{frontend}{slug}/"
        time.sleep(0.5)
        try:
            html = subprocess.check_output(
                ["curl", "-sS", "--max-time", "30", "-A", "Mozilla/5.0", "-L", url],
                text=True,
            )
        except subprocess.CalledProcessError:
            bad.append((p["id"], slug, "FETCH_FAILED"))
            continue
        m = re.search(r'<meta name="robots" content="([^"]+)"', html)
        robots = m.group(1) if m else "MISSING"
        if robots != "index, follow":
            bad.append((p["id"], slug, robots))
        print(f"  {robots:16} {slug}")
    print(f"\nLive check: {len(samples) - len(bad)} OK, {len(bad)} FAIL (sampled {len(samples)})")
    sys.exit(1 if bad else 0)

print(f"Unknown mode: {mode}")
sys.exit(1)
PY
