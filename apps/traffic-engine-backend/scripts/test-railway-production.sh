#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-https://nestino-backend-production.up.railway.app/api/v1}"
KEY="${SITE_API_KEY:?SITE_API_KEY required}"
SITE_ID="${SITE_ID:-2}"

PASS=0
FAIL=0

pass() { echo "✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "❌ $1"; FAIL=$((FAIL + 1)); }

api() {
  curl -sS -H "X-Site-Api-Key: $KEY" -H "X-Site-Id: $SITE_ID" "$@"
}

echo "========== RAILWAY PRODUCTION TEST SUITE =========="
echo "Base: $BASE | Site: $SITE_ID"
echo ""

# Auth
CODE=$(curl -sS -o /tmp/pages.json -w "%{http_code}" -H "X-Site-Api-Key: $KEY" -H "X-Site-Id: $SITE_ID" "$BASE/content/pages")
if [[ "$CODE" == "200" ]]; then pass "content/pages with valid key (HTTP $CODE)"; else fail "content/pages with valid key HTTP $CODE"; fi
CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/content/pages")
if [[ "$CODE" == "403" ]]; then pass "content/pages without key rejected ($CODE)"; else fail "content/pages without key expected 403 got $CODE"; fi

# List shape
python3 - <<'PY' || fail "list endpoint shape"
import json, sys
d = json.load(open("/tmp/pages.json"))
items = d if isinstance(d, list) else d.get("items", [])
print("total pages:", len(items))
tagged = [i for i in items if i.get("pageType")]
guides = [i for i in items if i.get("pageType") == "guide"]
untagged = [i for i in items if not i.get("pageType")]
print("tagged:", len(tagged), "guides:", len(guides), "untagged:", len(untagged))
if not items:
    sys.exit(1)
print("sample keys:", sorted(items[0].keys()))
for g in guides[:3]:
    print(" guide:", g.get("slug"), "| entities:", json.dumps(g.get("entities"))[:140])
for u in untagged[:3]:
    print(" untagged:", u.get("slug"))
PY
[[ $? -eq 0 ]] && pass "list endpoint shape" || true

# Filters
for Q in "pageType=guide" "pageType=guide&country=spain" "pageType=clinic_country_plp" "pageType=clinic_city_plp"; do
  api "$BASE/content/pages?$Q" > /tmp/filter.json
  N=$(python3 -c "import json;d=json.load(open('/tmp/filter.json'));items=d if isinstance(d,list) else d.get('items',[]);print(len(items))")
  pass "filter ?$Q => $N items"
done

export BASE KEY
python3 - <<'PY' && pass "guide+spain filter validation" || fail "guide+spain filter validation"
import json, os, urllib.request
base = os.environ["BASE"]
key = os.environ["KEY"]
req = urllib.request.Request(
    f"{base}/content/pages?pageType=guide&country=spain",
    headers={"X-Site-Api-Key": key, "X-Site-Id": "2"},
)
items = json.loads(urllib.request.urlopen(req).read())
items = items if isinstance(items, list) else items.get("items", [])
for i in items:
    assert i.get("pageType") == "guide", i.get("slug")
    c = (i.get("entities") or {}).get("country") or {}
    assert c.get("slug") == "spain", (i.get("slug"), c)
print("guide+spain:", len(items), "items")
PY

# Taxonomy
api "$BASE/content/taxonomy" > /tmp/tax.json
python3 - <<'PY'
import json
d = json.load(open("/tmp/tax.json"))
countries = d.get("countries") or d.get("data", {}).get("countries", [])
treatments = d.get("treatments") or d.get("data", {}).get("treatments", [])
print("taxonomy:", len(countries), "countries,", len(treatments), "treatments")
PY
pass "content/taxonomy"

# by-slug
export BASE KEY
python3 - <<'PY' && pass "by-slug v2.2 payloads" || fail "by-slug v2.2 payloads"
import json, os, sys, urllib.request
base = os.environ["BASE"]
key = os.environ["KEY"]
headers = {"X-Site-Api-Key": key, "X-Site-Id": "2"}
slugs = [
    "/guides/spain-ivf-guide",
    "/guides/spain/barcelona-ivf-guide",
    "/guides/spain/barcelona-ivf-guide",
    "/clinics/spain/ivf",
    "/clinics/spain/barcelona/ivf",
]
errors = []
for slug in slugs:
    req = urllib.request.Request(f"{base}/content/by-slug{slug}", headers=headers)
    try:
        d = json.loads(urllib.request.urlopen(req).read())
    except Exception as e:
        errors.append(f"{slug}: {e}")
        continue
    ent = d.get("entities") or {}
    print(f"OK {slug}: version={d.get('version')} pageType={d.get('pageType')}")
    if slug.startswith("/guides/spain"):
        c, t = ent.get("country", {}), ent.get("treatment", {})
        print(f"   country={c.get('slug')}/{c.get('name')} treatment={t.get('slug')}/{t.get('name')}")
    if "barcelona" in slug:
        city = ent.get("city", {})
        print(f"   city={city.get('slug')}/{city.get('name')}")
    if d.get("version") != "2.2":
        errors.append(f"{slug}: version {d.get('version')}")
    if slug.startswith("/guides/spain") and not ent.get("country"):
        errors.append(f"{slug}: missing country entities — run backfill")
if errors:
    for e in errors:
        print("ERR", e)
    sys.exit(1)
PY

# by id
PAGE_ID=$(python3 -c "import json;d=json.load(open('/tmp/pages.json'));items=d if isinstance(d,list) else d.get('items',[]);g=next((i for i in items if i.get('pageType')=='guide' and i.get('entities',{}).get('country')), items[0]);print(g['id'])")
CODE=$(curl -sS -o /tmp/byid.json -w "%{http_code}" -H "X-Site-Api-Key: $KEY" -H "X-Site-Id: $SITE_ID" "$BASE/content/$PAGE_ID")
if [[ "$CODE" == "200" ]]; then
  python3 -c "import json;d=json.load(open('/tmp/byid.json'));pid=d.get('pageId') or d.get('id');print('by-id',pid,'pageType',d.get('pageType'),'version',d.get('version'));assert d.get('version')=='2.2'"
  pass "GET /content/$PAGE_ID"
else
  fail "GET /content/$PAGE_ID HTTP $CODE"
fi

# Frontend — country guides use flat slugs; city guides must be /guides/{city}-ivf-guide
for URL in \
  "https://www.medcover.io/clinics/spain/" \
  "https://www.medcover.io/clinics/spain/ivf" \
  "https://www.medcover.io/guides/spain-ivf-guide" \
  "https://www.medcover.io/guides/portugal-ivf-guide" \
  "https://www.medcover.io/guides/porto-ivf-guide" \
  "https://www.medcover.io/guides/lisbon-ivf-guide" \
  "https://www.medcover.io/guides/barcelona-ivf-guide" \
  "https://www.medcover.io/cost/ivf-in-vitro-fertilisation"
do
  CODE=$(curl -sS -o /tmp/fe.html -w "%{http_code}" -L "$URL")
  LOADING=$(grep -c "Loading clinics" /tmp/fe.html || true)
  if [[ "$CODE" == "200" && "$LOADING" -eq 0 ]]; then
    pass "frontend $URL"
  else
    fail "frontend $URL code=$CODE loading=$LOADING"
  fi
done

echo ""
echo "========== RESULTS: $PASS passed, $FAIL failed =========="
[[ "$FAIL" -eq 0 ]]
