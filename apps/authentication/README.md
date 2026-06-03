# Authentication service

Multi-tenant email OTP auth for villa sites (NestJS + Prisma + Redis + Resend + JWT).

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL`, `REDIS_URL`, `JWT_*`, and Resend keys.
2. Migrations live under `prisma/migrations` (shared with `traffic-engine-backend` when using the same DB). From this app: `npx prisma migrate deploy` (or run migrations from the traffic-engine app).
3. `npm run prisma:generate`
4. `npm run start:dev` — default port **3002**

## Endpoints (no global prefix)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/auth/request-otp` | Body: `email`, `villaId`, optional `villaName`. Rate limited: 3 / 10 min per email+villa. |
| POST | `/auth/verify-otp` | Body: `email`, `villaId`, `otp`. Sets `villa_access_token` and `villa_refresh_token` cookies. |
| POST | `/auth/refresh` | Reads refresh cookie; rotates tokens. |
| POST | `/auth/logout` | Requires access cookie; revokes refresh tokens for user. |
| GET | `/auth/me` | Requires access cookie. |

Use `credentials: 'include'` from browsers when calling cross-origin APIs.
