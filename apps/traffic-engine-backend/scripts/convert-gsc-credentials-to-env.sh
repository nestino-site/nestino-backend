#!/usr/bin/env bash
# Convert a Google service-account JSON key (or tab-separated export) to a single-line
# GSC_SERVICE_ACCOUNT_JSON value for .env / Railway.
#
# Usage:
#   bash scripts/convert-gsc-credentials-to-env.sh path/to/credential.json
#   bash scripts/convert-gsc-credentials-to-env.sh path/to/credential.json >> .env

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <credential.json>" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required." >&2
  exit 1
fi

INPUT="$1"
if [[ ! -f "${INPUT}" ]]; then
  echo "File not found: ${INPUT}" >&2
  exit 1
fi

python3 - "${INPUT}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
raw = path.read_text(encoding="utf-8").strip()
if not raw:
    raise SystemExit(f"File is empty: {path}")

try:
    obj = json.loads(raw)
except json.JSONDecodeError:
    obj = {}
    for line in raw.splitlines():
        if "\t" not in line:
            continue
        key, value = line.split("\t", 1)
        key = key.strip()
        value = value.strip()
        if not key or key == "ave":
            continue
        obj[key] = value

if not obj.get("type") or not obj.get("client_email"):
    raise SystemExit("Could not parse service account JSON (missing type/client_email)")

print(f"GSC_SERVICE_ACCOUNT_JSON={json.dumps(obj, separators=(',', ':'))}")
PY
