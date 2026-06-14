#!/usr/bin/env python3
"""Trigger MedCover frontend cache revalidation for all published clinic PDP pages."""
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request

BASE = os.environ.get("BASE_URL", "https://nestino-backend-production.up.railway.app/api/v1")
WEBHOOK_URL = os.environ.get(
    "PUBLISH_WEBHOOK_URL",
    "https://www.medcover.io/api/webhooks/publish",
)
WEBHOOK_SECRET = os.environ.get(
    "PUBLISH_WEBHOOK_SECRET",
    "2fc08e3bc917dc0cb777447bed4ca0a99c31560ed019444eeb324727b7f2b9c7",
)
EMAIL = os.environ.get("ADMIN_EMAIL", "admin@nestino.test")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "NestinoTest2026!")
SITE_ID = int(os.environ.get("SITE_ID", "2"))


def is_clinic_pdp_slug(slug: str) -> bool:
    parts = [p for p in slug.rstrip("/").split("/") if p]
    return len(parts) == 4 and parts[0] == "clinics"


def api(method: str, path: str, body=None, token: str | None = None, retries: int = 5):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=180) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except Exception as err:
            last_err = err
            time.sleep(min(10, 1.5 * (attempt + 1)))
    raise last_err


def login() -> str:
    return api(
        "POST",
        "/identity/login",
        {"email": EMAIL, "password": PASSWORD},
    )["accessToken"]


def fire_webhook(slug: str, page_id: int) -> bool:
    payload = {
        "pageId": page_id,
        "slug": slug if slug.startswith("/") else f"/{slug}",
        "siteId": SITE_ID,
        "event": "page.updated",
        "timestamp": int(time.time() * 1000),
        "affectedPaths": [slug if slug.startswith("/") else f"/{slug}"],
    }
    body = json.dumps(payload, separators=(",", ":"))
    sig = hmac.new(
        WEBHOOK_SECRET.encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=body.encode(),
        headers={
            "Content-Type": "application/json",
            "X-Publish-Signature": f"sha256={sig}",
            "X-Publish-Timestamp": str(payload["timestamp"]),
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.status == 200


def main() -> int:
    token = login()
    pages: list[dict] = []
    for page_num in range(1, 20):
        batch = api("GET", f"/pages?siteId={SITE_ID}&status=PUBLISHED&page={page_num}&limit=200", token=token)
        if not batch:
            break
        pages.extend(batch)
        if len(batch) < 200:
            break

    clinics = [p for p in pages if is_clinic_pdp_slug(p.get("slug") or "")]
    print(f"Revalidating {len(clinics)} clinic PDP pages via {WEBHOOK_URL}")

    ok = failed = 0
    for i, page in enumerate(clinics, 1):
        slug = page.get("slug", "")
        try:
            fire_webhook(slug, page["id"])
            ok += 1
        except Exception as err:
            failed += 1
            print(f"FAIL {page['id']} {slug}: {err}", file=sys.stderr)
        if i % 25 == 0 or i == len(clinics):
            print(f"progress {i}/{len(clinics)} ok={ok} failed={failed}")
        time.sleep(0.05)

    print(f"DONE ok={ok} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
