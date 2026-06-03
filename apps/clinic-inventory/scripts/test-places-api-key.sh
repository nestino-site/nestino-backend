#!/usr/bin/env bash
# Diagnose Google Places API key and optionally fetch one Barcelona IVF clinic (Places API New)
set -euo pipefail

API_KEY="${GOOGLE_PLACES_API_KEY:-}"
if [[ -z "${API_KEY}" && -f "$(dirname "$0")/../.env" ]]; then
  API_KEY="$(grep '^GOOGLE_PLACES_API_KEY=' "$(dirname "$0")/../.env" | cut -d= -f2-)"
fi
if [[ -z "${API_KEY}" ]]; then
  echo "Set GOOGLE_PLACES_API_KEY or add it to apps/clinic-inventory/.env" >&2
  exit 1
fi

echo "=== 1) Legacy Places Text Search (server-side) ==="
legacy="$(curl -sS "https://maps.googleapis.com/maps/api/place/textsearch/json?query=IVF+clinic+Barcelona&location=41.3851,2.1734&radius=15000&key=${API_KEY}")"
echo "${legacy}" | jq '{status, error_message, count: (.results|length), first_name: .results[0].name}'

echo ""
echo "=== 2) Places API (New) — searchText ==="
new="$(curl -sS -X POST "https://places.googleapis.com/v1/places:searchText" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: ${API_KEY}" \
  -H "X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.businessStatus,places.googleMapsUri" \
  -d '{"textQuery":"IVF fertility clinic Barcelona","locationBias":{"circle":{"center":{"latitude":41.3851,"longitude":2.1734},"radius":15000}},"maxResultCount":1}')"
if echo "${new}" | jq -e '.places[0]' >/dev/null 2>&1; then
  echo "${new}" | jq '.places[0]'
  place_id="$(echo "${new}" | jq -r '.places[0].id')"
  echo ""
  echo "=== 3) Places API (New) — place details ==="
  encoded="$(python3 -c "import urllib.parse; print(urllib.parse.quote('${place_id}', safe=''))")"
  curl -sS "https://places.googleapis.com/v1/places/${encoded}" \
    -H "X-Goog-Api-Key: ${API_KEY}" \
    -H "X-Goog-FieldMask: id,displayName,formattedAddress,location,rating,userRatingCount,websiteUri,nationalPhoneNumber,internationalPhoneNumber,businessStatus,regularOpeningHours,types,googleMapsUri" \
    | jq .
  exit 0
fi

echo "${new}" | jq '.error // .'
echo ""
echo "FIX (Google Cloud Console → APIs & Services → Credentials):"
echo "  1. Create a NEW API key for backend use."
echo "  2. Application restrictions: None (dev) or IP addresses — NOT 'HTTP referers'."
echo "  3. API restrictions: enable 'Places API (New)' (required) and optionally legacy 'Places API'."
echo "  4. Enable Places API (New) for the project:"
echo "     https://console.developers.google.com/apis/api/places.googleapis.com/overview"
echo "  5. Put the new key in apps/clinic-inventory/.env as GOOGLE_PLACES_API_KEY"
echo "  6. Re-run: ./scripts/test-places-api-key.sh  then  ./scripts/test-barcelona-places-flow.sh"
exit 1
