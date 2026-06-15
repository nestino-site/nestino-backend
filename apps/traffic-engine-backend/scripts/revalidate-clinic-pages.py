#!/usr/bin/env python3
"""Trigger MedCover frontend cache revalidation for all clinic PDP pages in sitemap."""
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

WEBHOOK_URL = os.environ.get(
    "PUBLISH_WEBHOOK_URL",
    "https://www.medcover.io/api/webhooks/publish",
)
WEBHOOK_SECRET = os.environ.get(
    "PUBLISH_WEBHOOK_SECRET",
    "2fc08e3bc917dc0cb777447bed4ca0a99c31560ed019444eeb324727b7f2b9c7",
)
SITE_ID = int(os.environ.get("SITE_ID", "2"))
SITEMAP_URL = os.environ.get("SITEMAP_URL", "https://www.medcover.io/sitemap.xml")


def clinic_slugs_from_sitemap() -> list[str]:
    xml = subprocess.check_output(["curl", "-sL", "--max-time", "90", SITEMAP_URL], text=True)
    slugs = []
    for match in re.finditer(r"<loc>https?://[^/]+(/clinics/[^<]+)</loc>", xml):
        path = match.group(1).rstrip("/")
        parts = [p for p in path.split("/") if p]
        if len(parts) == 4 and parts[0] == "clinics":
            slugs.append(path)
    return slugs
def fire_webhook(slug: str) -> bool:
    public_path = slug if slug.endswith("/") else f"{slug}/"
    payload = {
        "slug": slug if slug.startswith("/") else f"/{slug}",
        "siteId": SITE_ID,
        "event": "page.updated",
        "timestamp": int(time.time() * 1000),
        "affectedPaths": [public_path],
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
    opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler())
    with opener.open(req, timeout=60) as resp:
        return resp.status == 200


def main() -> int:
    slugs = clinic_slugs_from_sitemap()
    print(f"Revalidating {len(slugs)} clinic PDP pages via {WEBHOOK_URL}")

    ok = failed = 0
    for i, slug in enumerate(slugs, 1):
        try:
            fire_webhook(slug)
            ok += 1
        except Exception as err:
            failed += 1
            print(f"FAIL {slug}: {err}", file=sys.stderr)
        if i % 25 == 0 or i == len(slugs):
            print(f"progress {i}/{len(slugs)} ok={ok} failed={failed}")
        time.sleep(0.05)

    print(f"DONE ok={ok} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
