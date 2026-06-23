#!/usr/bin/env bash
# Link DENTAL on seeded clinics and re-trigger clinic publish webhooks (PDP + /dental PLPs).
#
# Requires deployed backend with site-domain lookup fix (www.medcover.io / medcover.io).
#
# Usage:
#   ADMIN_PASSWORD=... ./scripts/backfill-dental-clinic-pages-production.sh
#   ADMIN_PASSWORD=... ./scripts/backfill-dental-clinic-pages-production.sh --dry-run
#   ONLY_CITIES=istanbul,barcelona ./scripts/backfill-dental-clinic-pages-production.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE="${BASE_URL:-https://nestino-backend-production.up.railway.app}"
BASE="${BASE%/}"
[[ "$BASE" == */api/v1 ]] || BASE="${BASE}/api/v1"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SITE_ID="${SITE_ID:-2}"
FRONTEND="${FRONTEND_URL:-https://www.medcover.io}"
DRY_RUN="${DRY_RUN:-0}"
PAUSE="${PAUSE:-0.35}"
LOG="${LOG_FILE:-/tmp/dental-clinic-backfill.log}"

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

if [[ -z "$ADMIN_PASSWORD" && -f .env ]]; then
  ADMIN_PASSWORD="$(python3 -c "import re; p=open('.env').read(); m=re.search(r'^ADMIN_PASSWORD=(.+)$', p, re.M); print(m.group(1).strip().strip('\"').strip(\"'\")) if m else ''")"
fi
if [[ -z "$ADMIN_PASSWORD" ]]; then
  echo "ERROR: set ADMIN_PASSWORD"
  exit 1
fi

CITIES=(
  alicante ankara athens barcelona brno istanbul lisbon madrid porto prague skopje thessaloniki valencia
)
if [[ -n "${ONLY_CITIES:-}" ]]; then
  read -ra CITIES <<< "${ONLY_CITIES//,/ }"
fi

login() {
  curl -sS --max-time 45 -X POST "$BASE/identity/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])"
}

TOKEN="$(login)"
export TOKEN

: > "$LOG"
echo "Log: $LOG"
export BASE TOKEN SITE_ID FRONTEND DRY_RUN PAUSE LOG
export CITIES_SLUGS="${CITIES[*]}"

python3 <<'PY'
import json, os, re, sys, time, urllib.error, urllib.request

base = os.environ["BASE"]
token = os.environ["TOKEN"]
site_id = int(os.environ["SITE_ID"])
frontend = os.environ["FRONTEND"].rstrip("/")
dry_run = os.environ.get("DRY_RUN", "0") == "1"
pause = float(os.environ.get("PAUSE", "0.35"))
log_path = os.environ["LOG"]
cities = [c for c in os.environ.get("CITIES_SLUGS", "").split() if c]

headers = {"Authorization": f"Bearer {token}"}

HAIR_TERMS = (
    "hair", "capilar", "trasplant", "fue", "sac-ekim", "tricholog",
    "injerto", "pelo", "graft", "transplant", "micropigmentacion",
)
IVF_TERMS = (
    "ivf", "fertil", "reproduc", "tup-bebek", "embryo", "ovul",
    "insemin", "goni", "bebek",
)
DENTAL_TERMS = (
    "dental", "dentist", "dentistry", "odontolog", "stomatolog",
    "clinica-dental", "dis-klinik", "diş", "zahn", "tann", "veneer",
    "orthodont", "implantolog",
)


def log(msg: str) -> None:
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line)
    with open(log_path, "a") as f:
        f.write(line + "\n")


def api(path, method="GET", body=None, timeout=90):
    data = None
    req_headers = dict(headers)
    if body is not None:
        data = json.dumps(body).encode()
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{base}{path}", data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def is_dental_candidate(name: str, slug: str) -> bool:
    text = f"{name} {slug}".lower()
    if any(t in text for t in HAIR_TERMS):
        return False
    if any(t in text for t in IVF_TERMS) and not any(t in text for t in ("dental", "dentist")):
        return False
    return any(t in text for t in DENTAL_TERMS)


def list_city_clinics(city_id: int):
    items = []
    cursor = None
    while True:
        q = f"/clinics?cityId={city_id}&limit=100"
        if cursor:
            q += f"&cursor={cursor}"
        batch = api(q)
        items.extend(batch.get("items", []))
        if not batch.get("hasNextPage"):
            break
        cursor = batch.get("nextCursor")
        if not cursor:
            break
    return items


def city_id_for_slug(slug: str):
    data = api(f"/cities/{slug}")
    return data["id"], data.get("name", slug)


def fire_sitemap_webhook():
    secret = os.environ.get(
        "PUBLISH_WEBHOOK_SECRET",
        "2fc08e3bc917dc0cb777447bed4ca0a99c31560ed019444eeb324727b7f2b9c7",
    )
    url = os.environ.get("PUBLISH_WEBHOOK_URL", f"{frontend}/api/webhooks/publish/")
    payload = {
        "slug": "/sitemap.xml",
        "siteId": site_id,
        "event": "page.updated",
        "timestamp": int(time.time() * 1000),
        "affectedPaths": ["/sitemap.xml"],
    }
    body = json.dumps(payload, separators=(",", ":")).encode()
    import hashlib, hmac

    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Publish-Signature": f"sha256={sig}",
            "X-Publish-Timestamp": str(payload["timestamp"]),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            log(f"Sitemap revalidation webhook: HTTP {resp.status}")
    except urllib.error.HTTPError as err:
        log(f"Sitemap revalidation webhook failed: HTTP {err.code}")


log("=== Dental clinic page backfill ===")
log(f"Backend: {base} | dry_run={dry_run} | cities={len(cities)}")

# Already-linked dental clinics (republish only)
linked_ids = set()
for slug in cities:
    try:
        cid, _ = city_id_for_slug(slug)
    except Exception as err:
        log(f"SKIP city {slug}: {err}")
        continue
    try:
        batch = api(f"/clinics?cityId={cid}&treatment=DENTAL&limit=100")
        for item in batch.get("items", []):
            linked_ids.add(item["id"])
    except Exception:
        pass

candidates = {}
for slug in cities:
    try:
        cid, cname = city_id_for_slug(slug)
        clinics = list_city_clinics(cid)
    except Exception as err:
        log(f"SKIP {slug}: {err}")
        continue

    city_hits = 0
    for c in clinics:
        cid_num = c["id"]
        name = c.get("name") or ""
        cslug = c.get("slug") or ""
        if cid_num in linked_ids or is_dental_candidate(name, cslug):
            candidates[cid_num] = {"id": cid_num, "name": name, "city": cname, "linked": cid_num in linked_ids}
            city_hits += 1
    log(f"{cname} ({slug}): {city_hits} dental clinic candidates")

log(f"Total unique clinics to process: {len(candidates)}")

linked_ok = linked_fail = publish_ok = publish_fail = 0

for i, (clinic_id, meta) in enumerate(sorted(candidates.items()), 1):
    label = f"[{i}/{len(candidates)}] {meta['name'][:50]} (id={clinic_id})"
    if dry_run:
        action = "republish" if meta["linked"] else "link+publish"
        log(f"DRY-RUN {action}: {label}")
        continue

    try:
        if not meta["linked"]:
            api(
                f"/clinics/{clinic_id}/treatments",
                method="POST",
                body={"treatmentCode": "DENTAL", "isOffered": True},
            )
            linked_ok += 1
        api(f"/clinics/{clinic_id}/publish", method="POST", timeout=120)
        publish_ok += 1
        log(f"OK {label}")
    except urllib.error.HTTPError as err:
        body = err.read().decode(errors="replace")[:200]
        if not meta["linked"]:
            linked_fail += 1
        publish_fail += 1
        log(f"FAIL {label}: HTTP {err.code} {body}")
    except Exception as err:
        publish_fail += 1
        log(f"FAIL {label}: {err}")

    time.sleep(pause)

log("")
log(f"Done: linked={linked_ok} link_fail={linked_fail} publish_ok={publish_ok} publish_fail={publish_fail}")

if not dry_run and publish_ok > 0:
    fire_sitemap_webhook()

    # Sample backend sitemap for dental clinic URLs
    try:
        xml = urllib.request.urlopen(
            f"{base.replace('/api/v1', '')}/api/v1/sitemap.xml?domain=www.medcover.io",
            timeout=120,
        ).read().decode()
        dental = re.findall(r"<loc>(https://www\.medcover\.io/clinics/[^<]*dental[^<]*)</loc>", xml)
        log(f"Backend sitemap dental clinic URLs: {len(dental)}")
        for u in dental[:10]:
            log(f"  {u}")
    except Exception as err:
        log(f"Could not verify sitemap: {err}")

sys.exit(1 if publish_fail and not dry_run else 0)
PY
