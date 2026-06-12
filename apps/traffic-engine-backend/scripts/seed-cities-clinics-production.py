#!/usr/bin/env python3
"""Seed IVF clinics (10 per city) on production via discovery/quick."""
import http.client
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "https://nestino-backend-production.up.railway.app/api/v1"
TARGET_PER_CITY = 10
PAUSE_SECONDS = 150  # 2.5 min between cities
DISCOVERY_POLL_SEC = 15
DISCOVERY_WAIT_SEC = 600  # 10 min max per city

COUNTRIES = [
    {"codeIso2": "GR", "name": "Greece", "defaultCurrency": "EUR"},
    {"codeIso2": "CZ", "name": "Czech Republic", "defaultCurrency": "CZK"},
    {"codeIso2": "TR", "name": "Turkey", "defaultCurrency": "EUR"},
    {"codeIso2": "PT", "name": "Portugal", "defaultCurrency": "EUR"},
    {"codeIso2": "MK", "name": "North Macedonia", "defaultCurrency": "EUR"},
]

CITIES = [
    ("barcelona", "Barcelona", "ES", 41.3851, 2.1734),
    ("alicante", "Alicante", "ES", 38.3452, -0.4815),
    ("valencia", "Valencia", "ES", 39.4699, -0.3763),
    ("athens", "Athens", "GR", 37.9838, 23.7275),
    ("thessaloniki", "Thessaloniki", "GR", 40.6401, 22.9444),
    ("prague", "Prague", "CZ", 50.0755, 14.4378),
    ("brno", "Brno", "CZ", 49.1951, 16.6068),
    ("istanbul", "Istanbul", "TR", 41.0082, 28.9784),
    ("ankara", "Ankara", "TR", 39.9334, 32.8597),
    ("lisbon", "Lisbon", "PT", 38.7223, -9.1393),
    ("porto", "Porto", "PT", 41.1579, -8.6291),
    ("skopje", "Skopje", "MK", 41.9981, 21.4254),
]

SKIP_SLUGS = {"madrid"}


def log(msg):
    print(msg, flush=True)


def api(method, path, body=None, token=None, timeout=60, retries=5):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    last_err = None
    for attempt in range(retries):
        req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode()
            raise RuntimeError(f"{method} {path} HTTP {e.code}: {err_body[:500]}") from e
        except (urllib.error.URLError, TimeoutError, ConnectionResetError, http.client.IncompleteRead) as e:
            last_err = e
            wait = 5 * (attempt + 1)
            log(f"    retry {attempt + 1}/{retries} after {wait}s ({type(e).__name__})")
            time.sleep(wait)
    raise RuntimeError(f"{method} {path} failed after {retries} retries: {last_err}") from last_err


def login():
    return api("POST", "/identity/login", {"email": "admin@nestino.test", "password": "NestinoTest2026!"})["accessToken"]


def clinic_count(slug):
    return api("GET", f"/cities/{slug}").get("_count", {}).get("clinics", 0)


def ensure_geo(token):
    countries = {c["codeIso2"]: c for c in api("GET", "/countries")}
    for c in COUNTRIES:
        if c["codeIso2"] not in countries:
            log(f"  + country {c['name']}")
            countries[c["codeIso2"]] = api("POST", "/countries", c, token)
    cities = {c["slug"]: c for c in api("GET", "/cities")}
    for slug, name, cc, lat, lng in CITIES:
        if slug in cities:
            continue
        log(f"  + city {name}")
        cities[slug] = api(
            "POST",
            "/cities",
            {
                "countryId": countries[cc]["id"],
                "name": name,
                "slug": slug,
                "lat": lat,
                "lng": lng,
                "phase": "PHASE_1",
                "isActiveDestination": True,
            },
            token,
        )
    return {c["slug"]: c for c in api("GET", "/cities")}


def trigger_discovery(token, city_id, max_results):
    body = {
        "cityId": city_id,
        "clinicTypes": ["IVF"],
        "maxResults": max_results,
        "autoApprove": True,
        "dryRun": False,
    }
    try:
        api("POST", "/discovery/quick", body, token, timeout=45)
    except Exception as e:
        log(f"    discovery POST returned early ({type(e).__name__}) — job continues server-side")


def wait_for_target(slug, target, start):
    deadline = time.time() + DISCOVERY_WAIT_SEC
    last = start
    while time.time() < deadline:
        time.sleep(DISCOVERY_POLL_SEC)
        try:
            count = clinic_count(slug)
        except Exception as e:
            log(f"    poll error: {e}")
            continue
        if count != last:
            log(f"    clinics: {count}/{target}")
            last = count
        if count >= target:
            return count
    return clinic_count(slug)


def main():
    log("=== Production clinic seeding ===")
    log(f"Target: {TARGET_PER_CITY} per city | pause: {PAUSE_SECONDS}s | wait: {DISCOVERY_WAIT_SEC}s\n")

    token = login()
    cities = ensure_geo(token)
    token = login()

    results = []
    todo = [(slug, cities[slug]) for slug, *_ in CITIES if slug in cities and slug not in SKIP_SLUGS]

    for idx, (slug, city) in enumerate(todo):
        start = clinic_count(slug)
        needed = max(0, TARGET_PER_CITY - start)
        log(f"\n[{idx + 1}/{len(todo)}] {city['name']} ({slug}) — {start} clinics, need {needed}")

        if needed == 0:
            results.append({"city": slug, "before": start, "after": start, "status": "ok"})
            continue

        try:
            trigger_discovery(token, city["id"], needed)
            final = wait_for_target(slug, TARGET_PER_CITY, start)
            status = "ok" if final >= TARGET_PER_CITY else "partial"
            results.append({"city": slug, "before": start, "after": final, "status": status})
            log(f"  ✓ {slug}: {start} → {final} [{status}]")
        except Exception as e:
            final = clinic_count(slug)
            results.append({"city": slug, "before": start, "after": final, "status": "error"})
            log(f"  ✗ {slug} error: {e} (now {final} clinics)")

        if idx < len(todo) - 1:
            log(f"  ⏸ pause {PAUSE_SECONDS}s...")
            time.sleep(PAUSE_SECONDS)
            token = login()

    log("\n=== SUMMARY ===")
    for r in results:
        log(f"  {r['city']:15} {r['before']:2} → {r['after']:2}  [{r['status']}]")

    partial = [r["city"] for r in results if r["status"] != "ok"]
    if partial:
        log(f"\nNeeds follow-up: {partial}")
        sys.exit(1)


if __name__ == "__main__":
    main()
