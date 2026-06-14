#!/usr/bin/env python3
"""Fast production patch: set index,follow on all clinic PDP pages via admin API."""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("BASE_URL", "https://nestino-backend-production.up.railway.app/api/v1")
EMAIL = os.environ.get("ADMIN_EMAIL", "admin@nestino.test")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "NestinoTest2026!")
SITE_ID = int(os.environ.get("SITE_ID", "2"))
LOG = os.environ.get("LOG_FILE", "/tmp/clinic-robots-patch.log")


def log(msg: str) -> None:
    line = f"{time.strftime('%H:%M:%S')} {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def request(method: str, path: str, body=None, retries: int = 8):
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except Exception as err:
            last_err = err
            time.sleep(min(20, 1.5 * (attempt + 1)))
    raise last_err


def login() -> str:
    req = urllib.request.Request(
        f"{BASE}/identity/login",
        data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())["accessToken"]


def is_clinic_pdp_slug(slug: str) -> bool:
    parts = [p for p in slug.rstrip("/").split("/") if p]
    return len(parts) == 4 and parts[0] == "clinics"


def main() -> int:
    global TOKEN
    open(LOG, "w").close()
    log("starting clinic robots patch")
    TOKEN = login()
    log("login ok")

    pages = []
    for page_num in range(1, 20):
        batch = request("GET", f"/pages?siteId={SITE_ID}&status=PUBLISHED&page={page_num}&limit=200")
        if not batch:
            break
        pages.extend(batch)
        if len(batch) < 200:
            break

    candidates = [p for p in pages if is_clinic_pdp_slug(p.get("slug") or "")]
    log(f"clinic PDP pages: {len(candidates)}")

    patched = skipped = failed = 0
    for i, page in enumerate(candidates, 1):
        pid = page["id"]
        slug = page.get("slug", "")
        try:
            updated = request("PATCH", f"/pages/{pid}", {"robotsMeta": "index, follow"})
            if updated.get("robotsMeta") == "index, follow":
                request("POST", f"/pages/{pid}/publish")
                patched += 1
            else:
                skipped += 1
        except Exception as err:
            failed += 1
            log(f"FAIL id={pid} {slug}: {err}")

        if i % 25 == 0 or i == len(candidates):
            log(f"progress {i}/{len(candidates)} patched={patched} skipped={skipped} failed={failed}")

        time.sleep(0.08)

    log(f"DONE patched={patched} skipped={skipped} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
