#!/usr/bin/env bash
# Manual GSC strategist workflow (requires deployed backend + credentials).
#
# Usage:
#   BASE_URL=https://nestino-backend-production.up.railway.app/api/v1 \
#   ADMIN_PASSWORD=... \
#   SITE_ID=2 \
#   ./scripts/run-gsc-strategist-flow.sh
#
# Steps: login -> gsc-sync -> strategist-preview -> (optional) strategist-run

set -euo pipefail

BASE_URL="${BASE_URL:-${TRAFFIC_ENGINE_URL:-}}"
SITE_ID="${SITE_ID:-2}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
RUN_PERSIST="${RUN_PERSIST:-false}"

if [[ -z "${BASE_URL}" || -z "${ADMIN_PASSWORD}" ]]; then
  echo "Usage: BASE_URL=https://.../api/v1 ADMIN_PASSWORD=... SITE_ID=2 $0" >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
ACCESS_TOKEN=""

request() {
  local method="$1" path="$2" payload="${3:-}"
  local response_file="${TMP_DIR}/response.json" status
  local curl_args=(-sS --http1.1 -o "${response_file}" -w "%{http_code}" -X "${method}" "${BASE_URL}${path}" -H "Accept: application/json")
  [[ -n "${ACCESS_TOKEN}" ]] && curl_args+=(-H "Authorization: Bearer ${ACCESS_TOKEN}")
  [[ -n "${payload}" ]] && curl_args+=(-H "Content-Type: application/json" --data-binary "${payload}")
  status="$(curl "${curl_args[@]}" 2>/dev/null || echo 000)"
  if [[ "${status}" -lt 200 || "${status}" -ge 300 ]]; then
    echo "Request failed: ${method} ${path} (${status})" >&2
    [[ -s "${response_file}" ]] && sed 's/^/  /' "${response_file}" >&2
    return 1
  fi
  cat "${response_file}"
}

echo "==> Login"
ACCESS_TOKEN="$(request POST /identity/login "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" | jq -r '.accessToken')"
[[ -n "${ACCESS_TOKEN}" && "${ACCESS_TOKEN}" != "null" ]] || { echo "Login failed." >&2; exit 1; }

echo "==> GSC sync (POST /analytics/${SITE_ID}/gsc-sync)"
request POST "/analytics/${SITE_ID}/gsc-sync" | jq .

echo "==> Strategist preview (GET /analytics/${SITE_ID}/strategist-preview)"
request GET "/analytics/${SITE_ID}/strategist-preview" | jq '{candidateCount, opportunityCount, top: .opportunities[0:3]}'

if [[ "${RUN_PERSIST}" == "true" ]]; then
  echo "==> Strategist run (POST /analytics/${SITE_ID}/strategist-run)"
  request POST "/analytics/${SITE_ID}/strategist-run" | jq .
  echo "Review ideas: GET ${BASE_URL}/content-ideas?status=PENDING_REVIEW"
  echo "Approve: PATCH ${BASE_URL}/content-ideas/:id/approve"
  echo "Create page: POST ${BASE_URL}/content-ideas/:ideaId/create-task"
fi

echo "Done."
