# Nestino Backend Monorepo

```
apps/
├── traffic-engine-backend/   ← main API (content engine + clinic inventory)
└── authentication/           ← OTP auth service (optional)
```

## Railway deployment

One Railway service with **Root Directory = `/`** runs the unified backend:

| Setting | Value |
|---------|--------|
| Root Directory | `/` |

The root `package.json` and `railway.toml` proxy to `apps/traffic-engine-backend`.

### Required env vars

- `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`
- `GOOGLE_PLACES_API_KEY` (clinic discovery)
- `CLINIC_SITE_DOMAIN=medcover.io` (optional, default in code)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (for seed / login)

Clinic publish → MedCover pages runs **in-process** (no separate clinic-inventory service or webhook URL).

### Authentication (optional)

| Setting | Value |
|---------|--------|
| Root Directory | `apps/authentication` |
