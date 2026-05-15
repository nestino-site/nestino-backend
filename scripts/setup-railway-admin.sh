#!/usr/bin/env bash
# Run once after: railway login
# Usage: ./scripts/setup-railway-admin.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nestino.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-NestinoTest2026!}"
JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-7kN9mP2xQ8vR4wL6jH0fT3yU5bC1aE9dG2sZ8nM4pK7qW0rX6vB3jF8hN1mL5tY9cA2eD7gS0uI4oP8xQ3wR6z}"

echo "Setting Railway variables on nestino-backend..."
railway variables set \
  --service nestino-backend \
  "ADMIN_EMAIL=${ADMIN_EMAIL}" \
  "ADMIN_PASSWORD=${ADMIN_PASSWORD}" \
  "JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}"

echo "Redeploying nestino-backend (admin is created on startup)..."
railway redeploy --service nestino-backend --yes 2>/dev/null || railway up --detach 2>/dev/null || echo "Redeploy from Railway dashboard if needed."

echo ""
echo "Done. After deploy (~2 min), login with:"
echo "  email:    ${ADMIN_EMAIL}"
echo "  password: ${ADMIN_PASSWORD}"
echo "  POST https://nestino-backend-production.up.railway.app/api/v1/identity/login"
