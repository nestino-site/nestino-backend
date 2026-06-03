# Sindibed / Nestino Villa — PostgreSQL schema reference

This document is the **full reference** for the villa direct-booking SaaS model defined in `Doc/DATABASE_VILLA_DIRECT_BOOKING.sql`: every table, column, constraint intent, index, and how the schema supports **scale**, **performance**, **multi-channel login** (SMS, WhatsApp, OAuth, email), **third-party messaging providers**, **notifications**, **subscription billing**, **OTA / calendar sync**, and an **audit trail for CRM / AI engagement**.

**Canonical DDL:** `Doc/DATABASE_Old_SCHEMA_REFERENCE.md` describes the legacy **hotel / OTA** model for comparison only.

Apply DDL through **versioned migrations** in production; keep `synchronize` off at scale.

---

## Product and business model (schema alignment)

The platform is **SaaS for boutique villa and short-term rental owners**: direct booking sites, reduced OTA commission dependency, unified operations, and guest CRM (including AI-assisted messaging). The database separates:

| Business capability | Primary tables |
|---------------------|----------------|
| Tenant (owner business) | `accounts`, `account_members`, `account_subscriptions`, `subscription_plans` |
| Staff identity & login (SMS / WhatsApp / OAuth / email) | `users`, `user_auth_identities`, `auth_otp_challenges`, `auth_refresh_tokens` |
| Branded direct booking & catalog | `villas`, `villa_*`, `bookings`, `payments`, `guests` |
| Channel / OTA calendar sync | `channel_listings`, `villa_calendar_blocks`, `bookings` (exclusion) |
| Guest CRM & consent | `guests`, `guest_notification_preferences`, `crm_interaction_events` |
| Messaging & automation | `notification_templates`, `notification_outbox`, `account_integrations` |
| Inbound provider webhooks (delivery receipts, billing, chat) | `provider_webhook_inbox` |
| Owner payout from direct bookings | `payout_batches`, `payout_lines`, `account_payment_methods` |

**Pricing model (application layer):** subscription to the platform (`account_subscriptions` + `subscription_plans`) is **separate** from **guest booking payments** (`payments` → `bookings`). “No commission on bookings” is a commercial rule, not a column; payout logic can keep `commission_amount` at zero for direct channel.

---

## Design principles (performance & scalability)

1. **Tenant-scoped queries** — Dashboard and automation jobs should filter by `account_id` early; indexes exist on hot paths (`bookings`, `crm_interaction_events`, `notification_outbox`, `channel_listings`).
2. **Availability correctness** — `bookings` uses generated `stay_range` / `inventory_slot`, GiST overlap index, and a **partial `EXCLUDE`** constraint (requires `btree_gist`) so concurrent double-booking is rejected for configured statuses.
3. **Async side effects** — Notifications are **outbox rows** (`notification_outbox`) processed by workers; avoids long HTTP transactions and enables retries and backpressure.
4. **Provider boundaries** — API keys and OAuth secrets are **not** stored in plaintext; use `secret_vault_ref` / `credentials_vault_ref` pointing to a secrets manager; `config` / `payload` JSON hold **non-secret** routing metadata only.
5. **High-volume append-only** — `crm_interaction_events` and large calendars use **BRIN** or time-ordered B-tree indexes; plan **partitioning** when row counts reach tens of millions (see playbook below).
6. **Idempotency** — Webhooks (`provider_webhook_inbox`) and notification sends (`idempotency_key`) deduplicate partner retries safely.
7. **Single-language catalog fields** — Human-readable strings use one column per concept (`name`, `title`, `description`, `label`, `caption`). Additional locales belong in the application i18n layer, a CMS, or a dedicated translations table if you need them in the database later.

---

## Villa amenities & many read-heavy endpoints

**Is the current shape good practice?** Yes. A **global** `amenities` catalog (with `code`, category, labels) plus a **junction** `villa_amenities` is the usual relational design for marketplaces and PMS-style products. You get a **stable taxonomy** (search, analytics, SEO facets), **no duplicate strings** per villa, and straightforward **admin UX** (toggle amenities from a master list).

**When it is not ideal:** Storing a **JSONB array of strings** on `villas` only wins if you never filter “all villas with pool” in SQL, never need a shared dictionary, and accept inconsistent spelling. For your model (SEO, discovery, filters), the junction table is the better default.

**API performance (beyond indexes):**

- Avoid **N+1**: for “villa detail”, load villa + one joined query for amenities (or two round-trips: villa, then `WHERE villa_id = $1 ORDER BY sort_order`), not one query per amenity.
- **Cache** the global amenity list (`amenities` + `amenity_categories`) in memory or Redis; it changes rarely.
- **Multi-amenity AND** search (must have pool **and** wifi): use `GROUP BY villa_id HAVING COUNT(DISTINCT amenity_id) = $n` or repeated `EXISTS` (see examples below); the reverse index `(amenity_id, villa_id)` on `villa_amenities` supports starting from `amenity_id`.
- For **public list + facets**, consider **read replicas** and narrow `SELECT` lists (avoid `long_description` on list endpoints).

---

## Extensions

| Extension | Purpose |
|-----------|---------|
| `btree_gist` | GiST + scalar equality for `bookings` overlap index and `EXCLUDE` constraint. |

---

## Table reference — full columns

Conventions: **PK** = primary key, **FK** = foreign key, **UQ** = unique. Types match PostgreSQL.

### countries

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| code_iso2 | char(2) | NO | UQ; ISO 3166-1 alpha-2 |
| name | varchar(100) | NO | |
| created_at | timestamptz | NO | default `now()` |
| updated_at | timestamptz | NO | default `now()` |

### cities

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| country_id | bigint | NO | FK → `countries` |
| name | varchar(100) | NO | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Index: `idx_cities_country_id` on `country_id`.

### amenity_categories

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | smallserial | NO | PK |
| code | varchar(50) | NO | UQ |
| sort_order | smallint | NO | default 0 |

### amenities

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| category_id | smallint | NO | FK → `amenity_categories` |
| code | varchar(80) | NO | UQ |
| name | varchar(255) | NO | |
| is_active | boolean | NO | default true |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Index: `idx_amenities_category_active` on `(category_id)` WHERE `is_active` — amenity pickers and public catalog by category.

### accounts

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK; tenant root |
| legal_name | varchar(255) | NO | |
| display_name | varchar(255) | NO | |
| slug | varchar(100) | NO | UQ; URL-safe tenant key |
| default_currency | char(3) | NO | default USD |
| timezone | varchar(64) | NO | default UTC; villa scheduling |
| contact_email | varchar(255) | YES | |
| contact_phone | varchar(50) | YES | |
| billing_address | jsonb | YES | structured billing |
| status | varchar(30) | NO | `active` \| `suspended` \| `closed` |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### users

Staff / owner-operator login identity. **Email and phone are optional individually**; at least one login path should exist via `user_auth_identities` (enforced in application).

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | uuid | NO | PK; `gen_random_uuid()` |
| email | varchar(255) | YES | UQ among non-null via expression index |
| email_verified_at | timestamptz | YES | |
| phone | varchar(32) | YES | Prefer E.164; UQ among non-null |
| phone_verified_at | timestamptz | YES | |
| password_hash | text | YES | Set when `password` identity used |
| full_name | varchar(255) | YES | |
| locale | varchar(10) | NO | default `en` |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Indexes: `uq_users_email_ci` on `lower(trim(email))` WHERE `email IS NOT NULL`; `uq_users_phone_e164` on `phone` WHERE `phone IS NOT NULL`.

### user_auth_identities

Maps a user to **external subjects**: OAuth subject, normalized phone / WhatsApp ID, etc. One row per `(provider, provider_subject)` globally so the same phone cannot bind two users.

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| user_id | uuid | NO | FK → `users`, CASCADE delete |
| provider | varchar(40) | NO | `password`, `email_magic_link`, `sms_otp`, `whatsapp_otp`, `google`, `apple`, `microsoft`, `facebook` |
| provider_subject | text | NO | Normalized identifier from provider |
| verified_at | timestamptz | YES | When proof of control completed |
| metadata | jsonb | NO | default `{}`; provider profile snippets |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

UQ: `(provider, provider_subject)`. Index: `idx_user_auth_identities_user_id`.

**Integration pattern:** SMS/WhatsApp OTP is implemented by creating a row here after successful verification; `provider_subject` should match `auth_otp_challenges.destination` normalization.

### auth_otp_challenges

Short-lived challenges for **SMS, WhatsApp, or email** codes / magic links. Store **only a hash** of the code (`code_hash`). Rate limits use `destination` + `created_at` (index).

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | uuid | NO | PK |
| user_id | uuid | YES | FK → `users`; null during first-time signup |
| destination | text | NO | E.164 phone, WhatsApp ID, or email |
| channel | varchar(20) | NO | `sms` \| `whatsapp` \| `email` |
| code_hash | text | NO | bcrypt/argon2 of OTP |
| expires_at | timestamptz | NO | |
| consumed_at | timestamptz | YES | Set when verified |
| attempt_count | smallint | NO | default 0 |
| max_attempts | smallint | NO | default 5 |
| idempotency_key | varchar(128) | YES | UQ when not null; client resend safety |
| ip_address | text | YES | |
| user_agent | text | YES | |
| integration_hint | varchar(60) | YES | Which `account_integrations` or platform route to use |
| created_at | timestamptz | NO | |

Indexes: `uq_auth_otp_idempotency`; `idx_auth_otp_destination_created`; `idx_auth_otp_pending_expires` (partial, open challenges).

### account_members

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| account_id | bigint | NO | PK, FK → `accounts` |
| user_id | uuid | NO | PK, FK → `users` |
| role | varchar(30) | NO | `owner` \| `admin` \| `staff` \| `readonly` |
| created_at | timestamptz | NO | |

Index: `idx_account_members_user_id`.

### auth_refresh_tokens

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | uuid | NO | PK |
| user_id | uuid | NO | FK → `users`, CASCADE |
| token_hash | text | NO | Hash of refresh token |
| expires_at | timestamptz | NO | |
| revoked_at | timestamptz | YES | |
| created_at | timestamptz | NO | |
| user_agent | text | YES | |
| ip_address | text | YES | |

Indexes: `user_id`, `token_hash`, `expires_at`.

### cancellation_policies

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| account_id | bigint | YES | FK → `accounts`; null = global template if you add platform rows |
| code | varchar(80) | NO | UQ per account: `(account_id, code)` |
| name | varchar(255) | NO | |
| description | text | YES | |
| is_non_refundable | boolean | NO | default false |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### cancellation_policy_rules

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| cancellation_policy_id | bigint | NO | FK → `cancellation_policies`, CASCADE |
| from_hours_before_checkin | integer | NO | |
| to_hours_before_checkin | integer | YES | |
| penalty_type | varchar(20) | NO | app-defined |
| penalty_value | integer | NO | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Index: `idx_cancellation_policy_rules_policy`.

### villas

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| account_id | bigint | NO | FK → `accounts`, CASCADE |
| public_slug | varchar(120) | NO | UQ per account |
| title | varchar(255) | NO | |
| short_description | text | YES | |
| long_description | text | YES | |
| city_id | bigint | YES | FK → `cities` |
| country_id | bigint | YES | FK → `countries` |
| address_line | text | YES | |
| latitude | decimal(20,15) | YES | |
| longitude | decimal(21,15) | YES | |
| check_in_time | varchar(5) | NO | default `15:00` |
| check_out_time | varchar(5) | NO | default `11:00` |
| bedrooms | smallint | NO | default 1 |
| bathrooms | smallint | NO | default 1 |
| max_guests | smallint | NO | |
| extra_guest_policy | jsonb | YES | |
| children_policy | jsonb | YES | |
| pets_allowed | boolean | NO | default false |
| smoking_allowed | boolean | NO | default false |
| minimum_nights | smallint | NO | default 1 |
| maximum_nights | smallint | YES | |
| advance_booking_days | smallint | YES | |
| same_day_booking_cutoff | time | YES | |
| status | varchar(30) | NO | `draft` \| `published` \| `paused` \| `archived` |
| published_at | timestamptz | YES | |
| cover_image_url | text | YES | |
| cancellation_policy_id | bigint | YES | FK → `cancellation_policies` |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Indexes: `account_id`, `status`, `public_slug`, partial `idx_villas_published_location` on `(country_id, city_id)` WHERE `status = 'published'`; `idx_villas_account_status` on `(account_id, status)` for owner dashboards.

### villa_amenities

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| villa_id | bigint | NO | PK, FK → `villas`, CASCADE |
| amenity_id | bigint | NO | PK, FK → `amenities`, CASCADE |
| sort_order | smallint | NO | default 0; display order on villa detail / cards |
| created_at | timestamptz | NO | |

Indexes: `idx_villa_amenities_villa_sort` on `(villa_id, sort_order, amenity_id)` for ordered detail queries; `idx_villa_amenities_amenity_villa` on `(amenity_id, villa_id)` for “which villas have this amenity?” search.

### villa_images

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| villa_id | bigint | NO | FK → `villas`, CASCADE |
| image_url | text | NO | |
| caption | varchar(500) | YES | |
| is_primary | boolean | NO | default false |
| display_order | integer | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Indexes: `villa_id`; `idx_villa_images_villa_order` on `(villa_id, display_order NULLS LAST, id)` for stable gallery ordering.

### villa_units

Optional sub-units (guest house, suite) under one listing.

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| villa_id | bigint | NO | FK → `villas`, CASCADE |
| unit_code | varchar(50) | NO | UQ per villa |
| name | varchar(255) | NO | |
| max_guests | smallint | NO | |
| is_active | boolean | NO | default true |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### villa_nightly_rates

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| villa_id | bigint | NO | FK → `villas`, CASCADE |
| villa_unit_id | bigint | YES | FK → `villa_units`; null = whole home |
| rate_date | date | NO | |
| currency_code | char(3) | NO | |
| nightly_amount | numeric(12,2) | NO | |
| min_stay_nights | smallint | YES | Override for that night |
| is_closed | boolean | NO | default false |
| note | varchar(255) | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

UQ: partial indexes `uq_villa_nightly_rates_whole_home` / `uq_villa_nightly_rates_unit`. Indexes: `(villa_id, rate_date)`, BRIN on `rate_date`.

### villa_fee_definitions

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| villa_id | bigint | NO | FK → `villas`, CASCADE |
| fee_code | varchar(50) | NO | UQ per villa |
| name | varchar(255) | NO | |
| amount | numeric(12,2) | YES | |
| amount_type | varchar(20) | NO | `fixed` \| `percent_per_stay` \| `percent_per_night` |
| tax_included | boolean | NO | default false |
| is_active | boolean | NO | default true |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Index: partial `villa_id` WHERE `is_active`.

### villa_rate_defaults

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| villa_id | bigint | NO | PK, FK → `villas`, CASCADE |
| currency_code | char(3) | NO | |
| base_nightly_amount | numeric(12,2) | NO | |
| weekend_multiplier | numeric(5,2) | YES | |
| updated_at | timestamptz | NO | |

### villa_calendar_blocks

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| villa_id | bigint | NO | FK → `villas`, CASCADE |
| villa_unit_id | bigint | YES | FK → `villa_units` |
| start_date | date | NO | |
| end_date | date | NO | must be `> start_date` |
| block_type | varchar(30) | NO | `maintenance` \| `owner_stay` \| `other` |
| reason | varchar(255) | YES | |
| source | varchar(50) | NO | default `manual`; `ical`, `airbnb`, etc. |
| external_ref | varchar(255) | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Indexes: `(villa_id, start_date, end_date)`, BRIN on `start_date`.

### guests

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | uuid | NO | PK |
| email | varchar(255) | YES | |
| phone | varchar(50) | YES | |
| full_name | varchar(255) | NO | |
| country_code | char(2) | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Indexes: partial on `email`, partial on `phone`.

### guest_notification_preferences

Per-channel consent for **guest** messaging (transactional vs marketing governed in app + law).

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| guest_id | uuid | NO | PK, FK → `guests`, CASCADE |
| channel | varchar(30) | NO | PK; `email` \| `sms` \| `whatsapp` \| `push` |
| opted_in | boolean | NO | default false |
| source | varchar(40) | NO | default `booking_flow` |
| updated_at | timestamptz | NO | |

### bookings

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| public_ref | varchar(40) | NO | UQ; guest-facing reference |
| villa_id | bigint | NO | FK → `villas` |
| villa_unit_id | bigint | YES | FK → `villa_units` |
| account_id | bigint | NO | FK → `accounts` |
| guest_id | uuid | YES | FK → `guests` |
| check_in_date | date | NO | |
| check_out_date | date | NO | must be `> check_in_date` |
| inventory_slot | bigint | NO | **Generated:** `COALESCE(villa_unit_id, 0)` |
| stay_range | daterange | NO | **Generated:** `[check_in, check_out)` |
| status | varchar(30) | NO | see CHECK in SQL |
| guest_adults | smallint | NO | default 1 |
| guest_children | smallint | NO | default 0 |
| guest_message | text | YES | |
| internal_note | text | YES | |
| currency_code | char(3) | NO | |
| subtotal_nights | numeric(12,2) | NO | |
| fees_total | numeric(12,2) | NO | default 0 |
| taxes_total | numeric(12,2) | NO | default 0 |
| discount_total | numeric(12,2) | NO | default 0 |
| grand_total | numeric(12,2) | NO | |
| price_breakdown | jsonb | NO | default `{}`; keep aggregates in columns |
| cancellation_policy_snapshot | jsonb | YES | frozen at booking time |
| confirmed_at | timestamptz | YES | |
| cancelled_at | timestamptz | YES | |
| cancellation_reason | text | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Constraint: `bookings_excl_no_overlap` (partial EXCLUDE) on overlapping `stay_range` for same `villa_id` + `inventory_slot` when `status IN ('pending_payment','confirmed','checked_in')`.

Indexes: villa/date, `account_id`, `guest_id`, `status`, `(account_id, created_at DESC)`, partial `(guest_id, created_at DESC)` for guest trip history, GiST `idx_bookings_availability_gist`.

### booking_fee_lines

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| booking_id | bigint | NO | FK → `bookings`, CASCADE |
| fee_code | varchar(50) | NO | |
| label | varchar(255) | NO | |
| amount | numeric(12,2) | NO | |
| created_at | timestamptz | NO | |

### payments

Guest / booking money (Stripe, local PSP, etc.) — not platform subscription.

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| booking_id | bigint | NO | FK → `bookings`, CASCADE |
| provider | varchar(40) | NO | e.g. `stripe` |
| provider_intent_id | varchar(255) | YES | |
| amount | numeric(12,2) | NO | |
| currency_code | char(3) | NO | |
| status | varchar(30) | NO | pending / authorized / captured / refunded / failed / cancelled |
| paid_at | timestamptz | YES | |
| failure_reason | text | YES | |
| raw_payload | jsonb | YES | minimize retention for compliance |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Indexes: `booking_id`, partial `(provider, provider_intent_id)`, `(status, created_at DESC)`.

### payout_batches

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| account_id | bigint | NO | FK → `accounts` |
| period_start | date | NO | |
| period_end | date | NO | |
| currency_code | char(3) | NO | |
| total_amount | numeric(14,2) | NO | |
| status | varchar(30) | NO | default `draft` |
| paid_at | timestamptz | YES | |
| notes | text | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Index: `(account_id, created_at DESC)`.

### payout_lines

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| payout_batch_id | bigint | NO | FK → `payout_batches`, CASCADE |
| booking_id | bigint | NO | FK → `bookings`; **UQ** one line per booking |
| amount | numeric(12,2) | NO | |
| commission_amount | numeric(12,2) | NO | default 0; direct model often 0 |

Index: `payout_batch_id`.

### account_payment_methods

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| account_id | bigint | NO | PK, FK → `accounts`, CASCADE |
| stripe_account_id | varchar(255) | YES | Connect / payouts |
| bank_details | jsonb | YES | non-secret or encrypted-by-app |
| cash_instructions | jsonb | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### subscription_plans

Platform SaaS catalog (trial length, recurring price, entitlements).

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| code | varchar(50) | NO | PK, e.g. `pro_monthly` |
| name | varchar(255) | NO | |
| billing_interval | varchar(20) | NO | `monthly` \| `yearly` \| `custom` |
| trial_days | smallint | NO | default 90 |
| price_amount | numeric(12,2) | YES | |
| currency_code | char(3) | NO | default USD |
| features | jsonb | NO | flags for CRM, AI caps, channel sync |
| is_public | boolean | NO | default true |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### account_subscriptions

One active subscription row per account (enforced by **UNIQUE** on `account_id`).

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| account_id | bigint | NO | UQ, FK → `accounts`, CASCADE |
| plan_code | varchar(50) | NO | FK → `subscription_plans` |
| status | varchar(30) | NO | `trialing` \| `active` \| `past_due` \| `canceled` \| `paused` |
| trial_ends_at | timestamptz | YES | |
| current_period_start | timestamptz | YES | |
| current_period_end | timestamptz | YES | |
| cancel_at_period_end | boolean | NO | default false |
| billing_provider | varchar(40) | NO | default `stripe` |
| billing_customer_id | varchar(255) | YES | |
| billing_subscription_id | varchar(255) | YES | |
| metadata | jsonb | NO | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Indexes: `plan_code`, `(status, current_period_end)`.

### account_integrations

Per-tenant routing for **Twilio SMS**, **Meta WhatsApp Business**, **email ESP**, **push**, etc.

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| account_id | bigint | NO | FK → `accounts`, CASCADE |
| provider_code | varchar(60) | NO | e.g. `twilio_messaging`, `meta_whatsapp` |
| status | varchar(20) | NO | `active` \| `disabled` \| `error` |
| config | jsonb | NO | from numbers, WABA ids, templates — **no secrets** |
| secret_vault_ref | varchar(512) | YES | API key / token pointer |
| webhook_secret_vault_ref | varchar(512) | YES | verify signatures |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

UQ: `(account_id, provider_code)`. Indexes: `account_id`, `provider_code`.

**Platform-managed option:** If Nestino supplies messaging, either omit rows and use env-based workers, or use a reserved `account_id` / feature flag in application code; this schema keeps **tenant overrides** explicit.

### notification_templates

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| account_id | bigint | YES | FK → `accounts`; null = platform default |
| code | varchar(80) | NO | stable key, e.g. `booking_confirmed` |
| channel | varchar(30) | NO | `email`, `sms`, `whatsapp`, `push` |
| locale | varchar(10) | NO | default `en` |
| subject_template | text | YES | email / some channels |
| body_template | text | NO | with `{{placeholders}}` interpreted by worker |
| is_active | boolean | NO | default true |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

UQ: partial unique for system `(code, channel, locale)` WHERE `account_id IS NULL`; per-account `(account_id, code, channel, locale)` WHERE `account_id IS NOT NULL`.

### notification_outbox

Durable queue for outbound messages; workers claim rows by `status` + `available_at`.

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| account_id | bigint | YES | FK → `accounts`, SET NULL |
| audience | varchar(20) | NO | `staff_user` \| `guest` \| `system` |
| recipient_user_id | uuid | YES | FK → `users` |
| recipient_guest_id | uuid | YES | FK → `guests` |
| recipient_address | text | NO | denormalized phone/email for delivery |
| channel | varchar(30) | NO | |
| template_code | varchar(80) | YES | |
| locale | varchar(10) | NO | default `en` |
| payload | jsonb | NO | template variables |
| status | varchar(20) | NO | `pending` \| `retrying` \| `sent` \| `failed` \| `cancelled` |
| priority | smallint | NO | default 0; higher first |
| scheduled_at | timestamptz | NO | business scheduling |
| available_at | timestamptz | NO | worker visibility |
| attempt_count | smallint | NO | default 0 |
| next_retry_at | timestamptz | YES | backoff |
| sent_at | timestamptz | YES | |
| provider_code | varchar(60) | YES | actual sender used |
| provider_message_id | varchar(255) | YES | partner id for traces |
| last_error | text | YES | |
| idempotency_key | varchar(128) | YES | UQ when set |
| booking_id | bigint | YES | FK → `bookings`, SET NULL |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Indexes: dispatch partial `(status, available_at, priority DESC, id)`; `(account_id, created_at DESC)`; partial `booking_id`.

**Performance:** Keep payloads small; archive **sent** rows older than N days to cold storage or partition by `created_at`.

### provider_webhook_inbox

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| provider_code | varchar(60) | NO | |
| event_id | varchar(255) | NO | partner unique id |
| headers_snapshot | jsonb | YES | redacted |
| payload | jsonb | NO | |
| received_at | timestamptz | NO | |
| processed_at | timestamptz | YES | |
| processing_error | text | YES | |

UQ: `(provider_code, event_id)`. Partial index on `received_at` WHERE `processed_at IS NULL`.

### channel_listings

Links a villa to **Airbnb, Booking.com, Vrbo, iCal URL**, etc., for **calendar sync** and future channel manager features.

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| account_id | bigint | NO | FK → `accounts`, CASCADE |
| villa_id | bigint | NO | FK → `villas`, CASCADE |
| channel_code | varchar(40) | NO | e.g. `airbnb`, `booking_com`, `ical` |
| external_listing_id | varchar(255) | YES | OTA listing id |
| ical_feed_url | text | YES | import URL when applicable |
| sync_direction | varchar(20) | NO | `import` \| `export` \| `both` |
| last_sync_at | timestamptz | YES | |
| last_sync_status | varchar(30) | YES | |
| last_error | text | YES | |
| credentials_vault_ref | varchar(512) | YES | |
| settings | jsonb | NO | sync window, mapping |
| is_active | boolean | NO | default true |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

UQ: `(villa_id, channel_code)` — one active logical link per channel per villa at schema level; replace row or use `is_active` flips in app if you need history table later.

Indexes: `account_id`, partial `(channel_code, external_listing_id)`.

### crm_interaction_events

Append-only log for **messages, AI suggestions, campaigns, owner notes** tied to guests/bookings.

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigserial | NO | PK |
| account_id | bigint | NO | FK → `accounts`, CASCADE |
| guest_id | uuid | YES | FK → `guests` |
| booking_id | bigint | YES | FK → `bookings` |
| event_type | varchar(80) | NO | app enum |
| channel | varchar(30) | YES | |
| source | varchar(40) | NO | default `system`; `ai_agent`, `owner`, `webhook` |
| payload | jsonb | NO | |
| created_at | timestamptz | NO | |

Indexes: `(account_id, created_at DESC)`; partial `(guest_id, created_at DESC)`; BRIN on `created_at`.

---

## Index catalog (performance-oriented)

| Object | Type | Role |
|--------|------|------|
| `idx_amenities_category_active` | B-tree partial | Amenity catalog by category |
| `idx_villas_published_location` | B-tree partial | Guest discovery |
| `idx_villas_account_status` | B-tree | Owner list by `account_id` + `status` |
| `idx_villa_amenities_villa_sort` | B-tree | Ordered amenities on villa detail |
| `idx_villa_amenities_amenity_villa` | B-tree | Reverse lookup: villas with amenity |
| `idx_villa_images_villa_order` | B-tree | Image gallery sort |
| `idx_bookings_guest_created_at` | B-tree partial | Guest booking history |
| `idx_villa_nightly_rates_villa_date` | B-tree | Rate calendar fetch |
| `brin_villa_nightly_rates_rate_date` | BRIN | Large rate history |
| `brin_villa_calendar_blocks_start` | BRIN | Large block history |
| `idx_villa_fee_definitions_villa_active` | B-tree partial | Checkout fees |
| `idx_bookings_account_created_at` | B-tree | Owner booking feed |
| `idx_bookings_availability_gist` | GiST | Overlap probe |
| `bookings_excl_no_overlap` | EXCLUDE (GiST) | Double-book prevention |
| `idx_payments_provider_intent` | B-tree partial | Webhook match |
| `idx_payments_status_created` | B-tree | Ops queues |
| `idx_notification_outbox_dispatch` | B-tree partial | Worker polling |
| `uq_notification_outbox_idempotency` | Unique partial | Dedup sends |
| `idx_provider_webhook_inbox_pending` | B-tree partial | Webhook processor |
| `idx_crm_events_account_created` | B-tree | CRM timelines |
| `brin_crm_interaction_events_created` | BRIN | Very large CRM volume |
| `idx_auth_otp_destination_created` | B-tree | OTP rate limits |

---

## Authentication and third-party messaging (recommended flows)

1. **SMS / WhatsApp OTP** — Insert `auth_otp_challenges` with `code_hash` and `expires_at`; enqueue `notification_outbox` row or call provider directly from a worker; on success, upsert `user_auth_identities` and link `users.phone` / `phone_verified_at`.
2. **OAuth (Google, Apple, …)** — After IdP callback, upsert `user_auth_identities` with `provider` + stable `provider_subject`; issue `auth_refresh_tokens` as today.
3. **BYO provider** — Owner connects Twilio/Meta in dashboard → `account_integrations` row + vault secret; workers resolve integration by `account_id` for **guest** messages for that tenant.
4. **Platform default** — If Nestino pays Twilio globally, worker uses env secrets when `account_integrations` missing (application policy, not a separate table).

---

## Notifications and webhooks (operations)

- **Workers:** Poll `notification_outbox` with `FOR UPDATE SKIP LOCKED` on the dispatch index predicate; move `pending` → `retrying` → `sent` or `failed`; set `next_retry_at` with exponential backoff.
- **Inbound:** Insert `provider_webhook_inbox` first (UQ prevents double process); commit; async worker handles business side effects and sets `processed_at`.
- **Compliance:** Respect `guest_notification_preferences` and regional rules before enqueueing marketing channels.

---

## Scalability playbook (summary)

- **Read replicas** for catalog, availability reads, CRM history; **primary** for booking creation, payments, exclusion constraint.
- **Partition** `bookings` and `crm_interaction_events` by time when large; re-plan GiST/EXCLUDE per partition strategy (PostgreSQL version–dependent).
- **Archive** `notification_outbox` `sent` rows and old `auth_otp_challenges` to keep hot tables narrow.
- **PgBouncer** (transaction pooling) + short transactions.
- **Autovacuum** monitoring on high-churn tables (`bookings`, `notification_outbox`, `auth_otp_challenges`).

---

## Relationship overview

- `accounts` 1—N `villas`; `accounts` 1—0..1 `account_subscriptions`; `accounts` 1—N `account_integrations`, `channel_listings`, `crm_interaction_events`.
- `users` N—M `accounts` via `account_members`; `users` 1—N `user_auth_identities`, `auth_refresh_tokens`.
- `villas` 1—N `villa_units`, `villa_nightly_rates`, `villa_calendar_blocks`, `channel_listings`; 1—1 `villa_rate_defaults`.
- `bookings` → `villas`, optional `villa_units`, `accounts`, `guests`; `payments` → `bookings`.
- `notification_outbox` optionally references `bookings`, `users`, `guests`, `accounts`.
- `guest_notification_preferences` → `guests`.

---

## Example SQL patterns

**Dispatch batch of notifications (worker)**

```sql
SELECT id, payload, recipient_address, channel, attempt_count
FROM notification_outbox
WHERE status IN ('pending', 'retrying')
  AND available_at <= now()
ORDER BY priority DESC, id
FOR UPDATE SKIP LOCKED
LIMIT 50;
```

**Availability overlap (see also exclusion constraint)**

```sql
SELECT 1
FROM bookings
WHERE villa_id = $1
  AND inventory_slot = $2
  AND stay_range && daterange($3::date, $4::date, '[)')
  AND status IN ('pending_payment', 'confirmed', 'checked_in')
LIMIT 1;
```

**Published villas that have every amenity in a set (AND semantics)** — `$ids` is an array of `amenity_id` values; `$c` is `cardinality($ids)`.

```sql
SELECT v.id
FROM villas v
JOIN villa_amenities va ON va.villa_id = v.id
WHERE v.status = 'published'
  AND va.amenity_id = ANY ($ids::bigint[])
GROUP BY v.id
HAVING COUNT(DISTINCT va.amenity_id) = $c;
```

**Amenities for one villa (ordered for API response)**

```sql
SELECT a.id, a.code, a.name, a.category_id, va.sort_order
FROM villa_amenities va
JOIN amenities a ON a.id = va.amenity_id AND a.is_active
WHERE va.villa_id = $1
ORDER BY va.sort_order, va.amenity_id;
```

---

## Introspection query (column list from live DB)

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    table_name LIKE 'villa%'
    OR table_name LIKE '%notification%'
    OR table_name LIKE 'auth_%'
    OR table_name LIKE 'user_%'
    OR table_name LIKE 'account_%'
    OR table_name LIKE 'channel_%'
    OR table_name LIKE 'crm_%'
    OR table_name LIKE 'guest_%'
    OR table_name LIKE 'provider_%'
    OR table_name LIKE 'subscription_%'
    OR table_name IN (
      'accounts', 'bookings', 'booking_fee_lines', 'guests', 'payments',
      'payout_batches', 'payout_lines', 'countries', 'cities', 'amenities',
      'amenity_categories', 'users', 'cancellation_policies', 'cancellation_policy_rules'
    )
  )
ORDER BY table_name, ordinal_position;
```

---

## Related files

- `Doc/DATABASE_VILLA_DIRECT_BOOKING.sql` — full DDL.
- `Doc/DATABASE_Old_SCHEMA_REFERENCE.md` — legacy hotel schema reference.
