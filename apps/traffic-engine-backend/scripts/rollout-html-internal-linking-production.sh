#!/usr/bin/env bash
# Roll out HTML internal linking on production MedCover:
#   1) Preview QA on sample pages
#   2) Enable runtimeConfig.enableHtmlInternalLinking
#   3) Republish all published pages (injects links at publish time)
#
# Usage:
#   cd apps/traffic-engine-backend
#   ADMIN_PASSWORD=... ./scripts/rollout-html-internal-linking-production.sh
#   ./scripts/rollout-html-internal-linking-production.sh --preview-only
#   ./scripts/rollout-html-internal-linking-production.sh --republish-only
#   ./scripts/rollout-html-internal-linking-production.sh --apply-only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Prefer env already exported; optional dotenv via node (avoids broken shell .env syntax)
if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  ADMIN_PASSWORD="$(node -e "require('dotenv').config(); process.stdout.write(process.env.ADMIN_PASSWORD||'')")"
fi

BASE="${BASE_URL:-https://nestino-backend-production.up.railway.app/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"
SITE_DOMAIN="${SITE_DOMAIN:-www.medcover.io}"
MODE="${1:---full}"

login() {
  curl -sS --max-time 45 -X POST "$BASE/identity/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])"
}

echo "========== HTML INTERNAL LINKING ROLLOUT (MedCover) =========="
echo "Backend: $BASE | Site: $SITE_DOMAIN | Mode: $MODE"
echo ""

TOKEN="$(login)"
export BASE TOKEN SITE_DOMAIN MODE
export PYTHONUNBUFFERED=1

python3 -u <<'PY'
import json, os, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

base = os.environ["BASE"].rstrip("/")
token = os.environ["TOKEN"]
site_domain = os.environ["SITE_DOMAIN"]
mode = os.environ["MODE"]
headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def api(path, method="GET", body=None, timeout=120):
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers_req = {**headers, "Content-Type": "application/json"}
    else:
        headers_req = headers
    req = urllib.request.Request(f"{base}{path}", data=data, headers=headers_req, method=method)
    # Force HTTP/1.1 — Railway proxy can drop long HTTP/2 preview responses (~60s LLM)
    req.add_header("Connection", "close")
    last_err = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode()
                return resp.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {"raw": raw}
            print(f"HTTP {e.code} {method} {path}", file=sys.stderr)
            print(json.dumps(payload, indent=2)[:2000], file=sys.stderr)
            raise
        except Exception as e:
            last_err = e
            if attempt < 2:
                time.sleep(2)
                continue
            raise last_err


# --- Resolve site ---
status, sites = api("/sites")
site = next((s for s in sites if s.get("domain") == site_domain), None)
if not site:
    print(f"Site not found: {site_domain}", file=sys.stderr)
    sys.exit(1)
site_id = site["id"]
print(f"Site: {site_domain} (id={site_id})\n")

# --- List all published pages (paginated; API default limit=50 would miss most of the site) ---
def fetch_all_published(site_id: int) -> list:
    all_pages: list = []
    page_num = 1
    limit = 200
    while True:
        _, batch = api(
            f"/pages?siteId={site_id}&status=PUBLISHED&page={page_num}&limit={limit}",
            timeout=60,
        )
        if not batch:
            break
        all_pages.extend(batch)
        if len(batch) < limit:
            break
        page_num += 1
    # De-dupe by id (safety)
    seen: set = set()
    unique: list = []
    for p in all_pages:
        pid = p.get("id")
        if pid is None or pid in seen:
            continue
        seen.add(pid)
        unique.append(p)
    return unique


published = fetch_all_published(site_id)
print(f"Published pages: {len(published)} (fetched with pagination)", flush=True)

# Pick preview candidates: fetch detail for top published pages (list omits finalContent)
detail_pages = []
for p in published[:20]:
    try:
        _, full = api(f"/pages/{p['id']}", timeout=30)
        detail_pages.append(full)
    except Exception:
        detail_pages.append(p)

def content_len(p):
    return len((p.get("finalContent") or p.get("htmlContent") or "") or "")

candidates = sorted(detail_pages, key=content_len, reverse=True)
preview_ids = [p["id"] for p in candidates[:2] if content_len(p) > 500]
if not preview_ids and candidates:
    preview_ids = [candidates[0]["id"]]

# --- Phase 1: Preview ---
if mode in ("--full", "--preview-only"):
    print("\n--- Phase 1: Preview QA ---")
    for pid in preview_ids:
        page = next((p for p in published if p["id"] == pid), {"id": pid, "slug": "?"})
        try:
            _, result = api(f"/pages/{pid}/internal-linking/preview", method="POST", timeout=90)
            links = len(result.get("proposedLinks") or [])
            report = result.get("report") or {}
            kws = [k.get("phrase") for k in (result.get("extractedKeywords") or [])]
            print(
                f"  page {pid} {page.get('slug')} | "
                f"keywords={len(kws)} targets={len(result.get('candidateTargets') or [])} "
                f"links={links} score={report.get('score')} "
                f"{'PASS' if report.get('passed') else 'FAIL'}"
            )
            for issue in (report.get("issues") or [])[:3]:
                print(f"    ⚠ {issue}")
        except Exception as e:
            print(f"  page {pid} {page.get('slug')} | preview failed ({e.__class__.__name__}) — continuing rollout")

# --- Phase 2: Enable flag ---
if mode in ("--full", "--enable-only"):
    print("\n--- Phase 2: Enable enableHtmlInternalLinking ---")
    _, cfg = api(f"/site-configs/{site_id}")
    runtime = dict(cfg.get("runtimeConfig") or {})
    if runtime.get("enableHtmlInternalLinking") is True:
        print("  Already enabled — skipping PATCH")
    else:
        runtime["enableHtmlInternalLinking"] = True
        _, updated = api(
            f"/site-configs/{site_id}",
            method="PATCH",
            body={"runtimeConfig": runtime},
        )
        enabled = (updated.get("runtimeConfig") or {}).get("enableHtmlInternalLinking")
        print(f"  enableHtmlInternalLinking = {enabled}")

# --- Phase 3: Republish all ---
if mode in ("--full", "--republish-only"):
    print("\n--- Phase 3: Republish published pages ---")
    ok = 0
    skipped = 0
    failed = 0
    for p in published:
        pid = p["id"]
        slug = p.get("slug", "")
        try:
            _, full = api(f"/pages/{pid}", timeout=30)
        except Exception as e:
            print(f"  ✗ failed load {pid} {slug} — {e.__class__.__name__}")
            failed += 1
            continue
        if not (full.get("finalContent") or "").strip():
            print(f"  skip {pid} {slug} — no finalContent")
            skipped += 1
            continue
        try:
            _, result = api(f"/pages/{pid}/publish", method="POST", timeout=180)
            if result.get("published"):
                print(f"  ✓ republished {pid} {slug}")
                ok += 1
            else:
                reason = result.get("skippedReason") or "unknown"
                print(f"  skip {pid} {slug} — {reason}")
                skipped += 1
        except urllib.error.HTTPError:
            print(f"  ✗ failed {pid} {slug}")
            failed += 1
        except Exception as e:
            print(f"  ✗ failed {pid} {slug} — {e.__class__.__name__}")
            failed += 1
        time.sleep(0.3)

    print(f"\n  Republish summary: ok={ok} skipped={skipped} failed={failed}")

# --- Phase 4: Apply internal links (writes htmlContent) ---
if mode in ("--full", "--apply-only"):
    print("\n--- Phase 4: Apply internal links to all published pages ---")
    workers = max(1, int(os.environ.get("APPLY_WORKERS", "8")))
    print(f"  Workers: {workers}", flush=True)
    stats = {"applied": 0, "no_links": 0, "failed": 0, "total_links": 0, "done": 0}
    total = len(published)
    lock = Lock()

    def apply_one(idx: int, page: dict) -> None:
        pid = page["id"]
        slug = page.get("slug", "")
        prefix = f"[{idx}/{total}]"
        try:
            _, result = api(f"/pages/{pid}/internal-linking/apply", method="POST", timeout=120)
            links = int(result.get("linksInjected") or 0)
            report = result.get("report") or {}
            if result.get("applied"):
                with lock:
                    stats["applied"] += 1
                    stats["total_links"] += links
                print(f"  {prefix} ✓ applied {pid} {slug} — {links} links (score {report.get('score')})", flush=True)
            else:
                with lock:
                    stats["no_links"] += 1
                if links > 0 or idx <= 10 or idx % 100 == 0:
                    print(f"  {prefix} – no write {pid} {slug} — {links} links, passed={report.get('passed')}", flush=True)
        except urllib.error.HTTPError:
            with lock:
                stats["failed"] += 1
            print(f"  {prefix} ✗ failed {pid} {slug}", flush=True)
        except Exception as e:
            with lock:
                stats["failed"] += 1
            print(f"  {prefix} ✗ failed {pid} {slug} — {e.__class__.__name__}", flush=True)
        finally:
            with lock:
                stats["done"] += 1
                done = stats["done"]
                if done % 50 == 0 or done == total:
                    print(
                        f"  ... progress {done}/{total}: applied={stats['applied']} no_write={stats['no_links']} "
                        f"failed={stats['failed']} total_links={stats['total_links']}",
                        flush=True,
                    )

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [
            pool.submit(apply_one, idx, page)
            for idx, page in enumerate(published, 1)
        ]
        for fut in as_completed(futures):
            fut.result()

    print(
        f"\n  Apply summary: applied={stats['applied']} no_write={stats['no_links']} "
        f"failed={stats['failed']} total_links={stats['total_links']}"
    )

print("\nDone.")
PY
