# Clinic Inventory API

NestJS service for clinic directory, discovery (Google Places), Truth Scores, and interviews.

## Railway deploy

1. Create a Railway service from this repo (root directory: repository root).
2. Add **PostgreSQL** and **Redis** plugins; wire `DATABASE_URL` and `REDIS_URL`.
3. Set variables (see `.env.example`). Important:
   - `JWT_ACCESS_SECRET` — must match **traffic-engine-backend** (same admin JWT).
   - `GOOGLE_PLACES_API_KEY` — **server** key (Application restriction: None or IP, not HTTP referer).
   - `GOOGLE_PLACES_USE_NEW_API=true` and enable **Places API (New)** in Google Cloud.
   - `TRAFFIC_ENGINE_WEBHOOK_URL` — e.g. `https://nestino-backend-production.up.railway.app/api/v1/clinic-inventory/webhook`
   - `TRAFFIC_ENGINE_WEBHOOK_SECRET` — same secret as on traffic-engine.

4. Deploy runs `prisma migrate deploy` then starts the API (`npm run start`).

## Test Google Places (Barcelona)

```bash
./scripts/test-places-api-key.sh
./scripts/test-barcelona-places-flow.sh
```

Swagger: `https://<your-railway-host>/swagger` — authorize with JWT from `POST .../identity/login` on traffic-engine.
