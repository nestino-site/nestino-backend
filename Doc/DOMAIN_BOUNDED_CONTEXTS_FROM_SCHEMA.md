# Bounded contexts — platform domain map

This doc defines the Nest application and module boundaries for the Sindibed platform. Fewer top-level domains; **structure stays inside** each module (Clean Architecture layers, aggregates, folders). Separate NestJS apps per bounded context, each with its own Postgres DB.

---

## Applications (deployable services)

| App | Port | DB | Purpose |
|-----|------|----|---------|
| `apps/authentication` | 3002 | shared with traffic-engine | JWT/OTP auth; issues `JWT_ACCESS_SECRET` tokens consumed by all other apps |
| `apps/traffic-engine-backend` | 3001 | `traffic-engine` Postgres | SEO content engine: Sites, Keywords, Pages, AI pipeline, metrics, webhooks |
| `apps/clinic-inventory` | 3003 | `clinic-inventory` Postgres | Clinic directory, Truth Scores, patient interviews, discovery pipeline |

---

## `apps/clinic-inventory` — bounded contexts (modules)

| # | Module | What lives here | Rationale |
|---|--------|-----------------|-----------|
| 1 | **geo** | `Country`, `City` | Reference data: countries, active destination cities with phase/cron config |
| 2 | **catalog** | `Treatment`, `Accreditation` | Reference catalog: IVF treatments, regulatory accreditations |
| 3 | **clinics** | `Clinic`, `ClinicTreatment`, `ClinicAccreditation`, `ClinicPricingPackage`, `ClinicDoctor` | Core clinic aggregate: identity, services, pricing, accreditations, doctors |
| 4 | **media** | `ClinicMedia` | Image/logo/video management per clinic |
| 5 | **interviews** | `InterviewQuestion`, `PatientInterview`, `InterviewAnswer` | Structured AI-conducted patient interviews and consent workflow |
| 6 | **truth-score** | `TruthScoreDimension`, `ClinicTruthScore`, `ClinicTruthScoreSnapshot`, `ClinicReview` | Composite scoring engine; snapshot history; lightweight unverified reviews |
| 7 | **discovery** | `DiscoveryRun`, `DiscoveryCandidate`, `AuditEvent` | Hybrid Google Places + LLM discovery pipeline with config-driven steps |
| 8 | **discovery/config** | `SystemConfig`, `DiscoveryConfig`, `DiscoveryConfigVersion` | 3-tier versioned pipeline config (system → city → per-run override) |
| 9 | **publishing** | `ClinicWebhookDelivery` | HMAC-signed outbound webhooks to traffic-engine; retry worker |

## `apps/traffic-engine-backend` — bounded contexts (modules)

| # | Module | What lives here | Rationale |
|---|--------|-----------------|-----------|
| 1 | **sites** | `Site`, `SiteConfig` | Tenant for one web property with AI pipeline config |
| 2 | **keywords** | `Keyword`, `KeywordCluster`, `KeywordResearch` | Search term modeling and clustering |
| 3 | **pages** | `Page`, `PageKeyword`, `TopicalCluster`, `SerpSnapshot` | URL-bound content assets with SEO scoring |
| 4 | **content-ideas** | `Subject`, `ContentIdea`, `ContentTemplate` | Topic → idea generation pipeline |
| 5 | **ai** | `AiGenerationLog`, `CostLedger` | AI orchestration, provider routing, cost tracking |
| 6 | **publishing** | `WebhookDelivery` | Outbound publish webhooks + inbound clinic-inventory webhook handler |
| 7 | **seo-metrics** | `SeoMetric` | Time-series GSC/GA4 metrics |
| 8 | **identity** | `PlatformUser`, `VillaUser`, `RefreshToken`, `Otp` | Platform admin auth |

---

## Cross-context rules

- **clinic-inventory** emits `clinic.published`, `clinic.updated`, `truth_score.changed` webhooks → **traffic-engine** consumes them to upsert `Page` rows.
- **traffic-engine** does not import clinic-inventory types; communication is via HMAC-signed HTTP webhooks only.
- **authentication** tokens (`JWT_ACCESS_SECRET`) are trusted by both apps for admin routes; no direct module dependency.
- Discovery module reads `DiscoveryConfig` (city-level) and `SystemConfig` (singleton) before every run; no other module reads discovery tables.
- Truth Score module reads only verified `PatientInterview` rows; `ClinicReview` is kept separate and **never feeds the Truth Score**.

---

## Related files

- `Doc/_archive/DATABASE_VILLA_SCHEMA_REFERENCE.md` (legacy, archived)
- `Doc/_archive/DATABASE_VILLA_DIRECT_BOOKING.sql` (legacy, archived)
- `apps/clinic-inventory/prisma/schema.prisma`
- `apps/traffic-engine-backend/prisma/schema.prisma`
- `apps/traffic-engine-backend/DOMAIN.md`
- `.cursor/rules/nest-backend-clean-ddd.mdc`
- `.cursor/rules/nest-backend-performance.mdc`
