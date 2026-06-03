# Nestino Backend Monorepo

```
apps/
├── traffic-engine-backend/   ← main API (content engine, webhooks)
├── clinic-inventory/         ← Google Places clinic discovery
└── authentication/           ← OTP auth service
```

## Railway deployment

### Traffic engine (existing service)

The repo root `package.json` and `railway.toml` proxy to `apps/traffic-engine-backend`, so the default Railway service can keep **Root Directory = `/`**.

### Clinic inventory (separate service)

Create a **second Railway service** from the same repo and set:

| Setting | Value |
|---------|--------|
| Root Directory | `apps/clinic-inventory` |

Required env vars: `DATABASE_URL`, `REDIS_URL`, `GOOGLE_PLACES_API_KEY`, `JWT_ACCESS_SECRET`, `TRAFFIC_ENGINE_WEBHOOK_URL`, `TRAFFIC_ENGINE_WEBHOOK_SECRET`.

### Authentication (optional)

| Setting | Value |
|---------|--------|
| Root Directory | `apps/authentication` |
