# Sindibed PostgreSQL schema reference

This document describes the relational schema used by the Sindibed backend as defined by TypeORM entities under `src/**` and historical migrations under `src/infrastructure/database/migrations`. The live database may include extra objects (manual changes, older ASP.NET tables); compare with `information_schema` when in doubt.

## How the app connects

Configuration is read by `src/infrastructure/database/database.module.ts` (and `src/infrastructure/database/data-source.ts` for CLI migrations). Typical environment variables (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | Port (default 5432) |
| `DB_USERNAME` | User |
| `DB_PASSWORD` | Password (trimmed; falls back to `postgres` if unset) |
| `DB_DATABASE` or `DB_NAME` | Database name (default `ota_backend` in code if both unset) |
| `DB_SSL` | `true` to enable TLS (`rejectUnauthorized: false`, e.g. Azure) |
| `DB_SYNCHRONIZE` | `true` lets TypeORM alter schema at startup (default `false`; keep false in production) |
| `DB_LOGGING` | SQL logging |

Entity discovery: glob `src/**/*.entity.{ts,js}` plus `autoLoadEntities: true` for modules registered with `TypeOrmModule.forFeature(...)`. Some tables are mapped only via `forFeature` (e.g. `*.typeorm-entity.ts` files), not the glob.

## High-level domains

1. **Location** — countries, cities; hotels reference city and country.
2. **Hotel catalog & ARI** — hotels, master room types, per-hotel room types, rate plans, junctions, daily rates, inventory, restrictions, amenities, images, cancellation policies.
3. **Identity** — ASP.NET Identity–style users/roles, user–hotel links, refresh tokens.
4. **Orders** — channel managers, sales points, hotel orders and line tables.
5. **Settlements** — settlement batches, invoices, files, legacy per-order settlement row.
6. **Hotel supply (B2B partners)** — partners, contracts, supply orders, API logs.
7. **Channel manager integration** — OTA hotel code mappings, ARI sync audit log.

---

## Table reference

Below: **PK** = primary key, **FK** = foreign key in application terms (TypeORM `ManyToOne` / `JoinColumn`); some FKs exist only in DB migrations, not as relations in code.

### countries

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK, serial |
| name_en | varchar(100) | NO | |
| name_ar | varchar(100) | NO | |
| created_at | timestamptz | NO | auto |
| updated_at | timestamptz | NO | auto |

### cities

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| name_en | varchar(100) | NO | |
| name_ar | varchar(100) | NO | |
| country_id | bigint | NO | FK → countries |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Index: `idx_cities_country_id` on `country_id`.

### hotels

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| name_en | varchar(100) | NO | default '' |
| name_ar | varchar(100) | YES | |
| city_id | bigint | YES | FK → cities |
| country_id | bigint | YES | FK → countries |
| star | smallint | YES | |
| address_en | text | YES | |
| address_ar | text | YES | |
| contact_info | jsonb | YES | arbitrary structure |
| settlement_currency_code | char(3) | YES | |
| settlement_rules | jsonb | YES | |
| status | varchar(50) | YES | |
| ari_currency_code | char(3) | YES | |
| children_policy | jsonb | YES | `free_age_to`, `child_age_from`, `child_age_to`, `children_count_as_adult` |
| latitude | decimal(20,15) | YES | |
| longitude | decimal(21,15) | YES | |
| public_area_smoking_policy | jsonb | YES | `{ value: string }` |
| room_smoking_policy | jsonb | YES | `{ value: string }` |
| cover_image_url | text | YES | |
| check_in_time | varchar(5) | YES | default `14:00` |
| check_out_time | varchar(5) | YES | default `12:00` |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### room_types_master

Global catalog of room type definitions (codes and default occupancies).

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| room_type_code | varchar(50) | NO | UNIQUE |
| room_type_name | varchar(255) | NO | |
| description | text | YES | |
| room_type_name_ar | varchar(255) | NO | |
| description_ar | text | YES | |
| max_occupancy | smallint | NO | default 2 |
| base_occupancy | smallint | NO | default 2 |
| is_active | boolean | NO | default true |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### room_types

Per-hotel offering: links a hotel to a master room type (`room_type_id` → `room_types_master.id` logically; not all relations are declared in TypeORM).

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| hotel_id | bigint | NO | FK → hotels |
| room_type_id | bigint | NO | master id |
| description | text | YES | |
| custom_room_name | text | YES | |
| max_occupancy | smallint | YES | |
| base_occupancy | smallint | YES | |
| is_active | boolean | NO | default true |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### rate_plans

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| hotel_id | bigint | YES | FK → hotels |
| rate_plan_code | varchar(50) | NO | UNIQUE per hotel with `hotel_id` |
| rate_plan_name_en | varchar(255) | NO | |
| rate_plan_name_ar | varchar(255) | YES | |
| description_en | text | YES | |
| description_ar | text | YES | |
| meal_plan | varchar(50) | YES | |
| cancellation_policy_id | bigint | YES | FK → cancellation_policies |
| is_active | boolean | NO | default true |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Unique constraint (entity): `(hotel_id, rate_plan_code)`.

### room_type_rate_plans

Many-to-many: which rate plans apply to which hotel room types.

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| room_type_id | bigint | NO | PK, FK → room_types, ON DELETE CASCADE |
| rate_plan_id | bigint | NO | PK, FK → rate_plans, ON DELETE CASCADE |

### room_rates

Daily price and stop-sell per room type + rate plan + date.

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| room_type_id | bigint | NO | FK → room_types |
| rate_plan_id | bigint | NO | FK → rate_plans |
| date | date | NO | |
| cost_rate_usd | decimal(12,2) | NO | |
| cost_rate_iqd | decimal(12,2) | YES | |
| exchange_rate | decimal(12,6) | YES | |
| cost_currency_code | char(3) | NO | default USD |
| single_occupancy_rate | decimal(12,2) | YES | |
| double_occupancy_rate | decimal(12,2) | YES | |
| triple_occupancy_rate | decimal(12,2) | YES | |
| extra_adult_rate | decimal(12,2) | YES | |
| extra_child_rate | decimal(12,2) | YES | |
| is_stop_sell | boolean | NO | default false |
| last_synced_at | timestamptz | YES | channel manager sync |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Unique: `(room_type_id, rate_plan_id, date)`.

### room_inventory

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| room_type_id | bigint | NO | FK → room_types |
| date | date | NO | |
| total_rooms | smallint | NO | |
| sold_rooms | smallint | NO | default 0 |
| blocked_rooms | smallint | NO | default 0 |
| overbooking_limit | smallint | NO | default 0 |
| available_rooms | smallint | NO | **Generated STORED**: `total_rooms - sold_rooms - blocked_rooms + overbooking_limit` |
| last_synced_at | timestamptz | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Unique: `(room_type_id, date)`.

### restriction_types

Lookup for restriction kind (STOP_SELL, MIN_LOS, CTA, CTD, etc.).

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | smallint | NO | PK |
| code | varchar(50) | NO | UNIQUE |
| label_en | varchar(255) | NO | property name in entity: `labelEn` |

### room_restrictions

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| hotel_id | bigint | NO | FK → hotels |
| room_type_id | bigint | YES | FK → room_types; null = hotel-wide |
| rate_plan_id | bigint | YES | FK → rate_plans |
| start_date | date | NO | |
| end_date | date | NO | |
| restriction_type_id | smallint | NO | FK → restriction_types |
| restriction_value | integer | YES | e.g. LOS value |
| days_of_week | smallint[] | YES | PostgreSQL array |
| is_active | boolean | NO | default true |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Index: `(hotel_id, start_date, end_date)`.

### amenities

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| category | varchar(50) | NO | |
| name_en | varchar(255) | NO | |
| name_ar | varchar(255) | NO | |
| is_active | boolean | NO | default true |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### hotel_amenities

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| hotel_id | bigint | NO | PK, FK → hotels |
| amenity_id | bigint | NO | PK, FK → amenities |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### cancellation_policies

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| code | varchar(50) | NO | UNIQUE (also entity-level unique on `code`) |
| name_en | varchar(255) | NO | |
| name_ar | varchar(255) | YES | |
| description_en | text | YES | |
| description_ar | text | YES | |
| is_non_refundable | boolean | NO | default false |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### cancellation_policy_rules

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| cancellation_policy_id | bigint | NO | FK → cancellation_policies |
| from_hours_before_checkin | integer | NO | |
| to_hours_before_checkin | integer | YES | |
| penalty_type | varchar(20) | NO | |
| penalty_value | integer | NO | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### hotel_images

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| hotel_id | bigint | NO | FK → hotels |
| image_url | text | NO | |
| tag | varchar(50) | NO | |
| display_order | integer | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### room_type_images

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| room_type_id | bigint | NO | FK → room_types |
| image_url | text | NO | |
| is_primary | boolean | NO | default false |
| display_order | integer | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### hotel_payment_methods

One row per hotel (PK = `hotel_id`). Optional FKs to payment detail tables by id only (no TypeORM relations).

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| hotel_id | bigint | NO | PK |
| cash_payment_detail_id | bigint | YES | → Cash_payment_Detail |
| zain_payment_detail_id | bigint | YES | → Zain_payment_Detail |
| qi_payment_detail_id | bigint | YES | → Qi_payment_Detail |
| fib_payment_detail_id | bigint | YES | → FIB_payment_Detail |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### Cash_payment_Detail

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| receiver_name_arabic | varchar(255) | YES | |
| receiver_name_english | varchar(255) | YES | |
| phone_number | varchar(50) | YES | |
| upload_file_url | text | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### FIB_payment_Detail

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| iban_number | varchar(255) | YES | |
| account_name_arabic | varchar(255) | YES | |
| account_name_english | varchar(255) | YES | |
| qr_code_upload_url | text | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### Qi_payment_Detail

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| account_number | varchar(255) | YES | |
| account_name_arabic | varchar(255) | YES | |
| account_name_english | varchar(255) | YES | |
| qr_code_upload_url | text | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### Zain_payment_Detail

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| account_name_arabic | varchar(255) | YES | |
| account_name_english | varchar(255) | YES | |
| qr_code_upload_url | text | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

---

### AspNetUsers (ASP.NET Identity–compatible)

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| Id | text | NO | PK |
| UserName | varchar(256) | YES | |
| NormalizedUserName | varchar(256) | YES | UNIQUE index `UserNameIndex` |
| Email | varchar(256) | YES | |
| NormalizedEmail | varchar(256) | YES | index `EmailIndex` |
| EmailConfirmed | boolean | NO | default false |
| PasswordHash | text | YES | |
| SecurityStamp | text | YES | |
| ConcurrencyStamp | text | YES | |
| PhoneNumber | text | YES | |
| PhoneNumberConfirmed | boolean | NO | default false |
| TwoFactorEnabled | boolean | NO | default false |
| LockoutEnd | timestamptz | YES | |
| LockoutEnabled | boolean | NO | default true |
| AccessFailedCount | integer | NO | default 0 |

### AspNetRoles

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| Id | text | NO | PK |
| Name | varchar(256) | YES | |
| NormalizedName | varchar(256) | YES | UNIQUE `RoleNameIndex` |
| ConcurrencyStamp | text | YES | |

### AspNetUserRoles

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| UserId | text | NO | PK, FK → AspNetUsers, CASCADE |
| RoleId | text | NO | PK, FK → AspNetRoles, CASCADE |

Indexes: `IX_AspNetUserRoles_UserId`, `IX_AspNetUserRoles_RoleId`.

### user_hotels

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| user_id | varchar(450) | NO | PK; matches user id string |
| hotel_id | bigint | NO | PK; hotel FK may exist in DB only |

### auth_refresh_tokens

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | uuid | NO | PK |
| user_id | text | NO | FK → AspNetUsers.Id, CASCADE |
| token_hash | text | NO | |
| expires_at | timestamptz | NO | |
| revoked_at | timestamptz | YES | |
| created_at | timestamptz | NO | |
| user_agent | text | YES | |
| ip_address | text | YES | |

Indexes: `idx_auth_refresh_tokens_user_id`, `idx_auth_refresh_tokens_token_hash`, `idx_auth_refresh_tokens_expires_at`.

---

### hotel_channel_managers

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| channel_manager_name | varchar(100) | NO | |
| channel_manager_commission | numeric(5,2) | NO | |

### hotel_sales_points

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| sales_point_name | varchar(100) | NO | |
| currency_code | char(3) | NO | |

### hotel_orders

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| hotel_id | bigint | NO | FK → hotels |
| channel_manager_id | bigint | NO | FK → hotel_channel_managers |
| channel_manager_order_ref | varchar(100) | YES | |
| sales_point_id | bigint | NO | FK → hotel_sales_points |
| sales_point_order_ref | varchar(100) | YES | |
| check_in_date | date | NO | |
| check_out_date | date | NO | |
| status | varchar(30) | NO | |
| note | text | YES | |
| issued_at | timestamptz | NO | |
| finalized_at | timestamptz | YES | |
| created_at | timestamptz | NO | |
| order_created_at | timestamptz | NO | |

Indexes: `idx_order_created_at`, `idx_hotel_id`, `idx_channel_manager_id`, `idx_sales_point_id`.

### hotel_order_rooms

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| hotel_order_id | bigint | NO | FK → hotel_orders |
| room_type | varchar(50) | NO | label/code snapshot |

### hotel_order_prices

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| hotel_order_id | bigint | NO | FK → hotel_orders |
| sales_price | numeric(20,2) | NO | |
| cost_price | numeric(20,2) | NO | |
| currency_code | char(3) | NO | |
| exchange_rate | numeric(18,8) | NO | |

### hotel_order_passengers

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| hotel_order_id | bigint | NO | FK → hotel_orders |
| passenger_name | varchar(100) | NO | |
| adult_count | smallint | NO | |
| child_count | smallint | NO | |

---

### settlements

Used by settlement module via `settlement.typeorm-entity.ts` (bigint PK supplied by application, not auto-generated).

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| hotel_id | bigint | NO | |
| created_by | varchar(255) | NO | user id / name |
| created_at | timestamptz | NO | default now() |
| settlement_date | date | NO | |
| total_usd | numeric(18,2) | NO | |
| total_local | numeric(18,2) | NO | |
| currency_local | char(3) | NO | default IQD |
| status | integer | NO | default 1; enum: 1 Created, 2 Sent, 3 Confirmed, 4 Cancelled |
| payment_method | integer | YES | enum |
| notes | text | YES | |
| email_sent | boolean | NO | default false |
| email_sent_at | timestamptz | YES | |
| email_message_id | varchar(255) | YES | |
| email_template_id | varchar(100) | YES | |

Indexes: `hotel_id`, `created_at`, `settlement_date`, `status`.

Note: `src/settlement/infrastructure/persistence/entities/settlement.entity.ts` also maps to `settlements` with a generated `id` and is picked up by the `*.entity.ts` glob; the Nest settlement module registers the `typeorm-entity` variant instead. Ensure only one mapping is active at runtime to avoid TypeORM metadata conflicts.

### settlement_invoices

Links orders to a settlement. Unique: one row per `hotel_order_id`.

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| settlement_id | bigint | NO | FK → settlements, CASCADE |
| hotel_order_id | bigint | NO | UNIQUE |
| created_at | timestamptz | NO | default now() |

### settlement_files

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| file_management_id | bigint | NO | UNIQUE; external file store id |
| file_name | varchar(500) | NO | |
| file_category | varchar(50) | NO | e.g. settlement_method, hotel_invoice, hotel_confirmation |
| settlement_id | bigint | YES | FK → settlements, CASCADE |
| hotel_id | bigint | YES | |
| uploaded_by | varchar(255) | NO | |
| uploaded_at | timestamptz | NO | default now() |

### hotel_settlements

Legacy per-order settlement tracking (updated on confirmation).

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| hotel_order_id | bigint | NO | PK, UNIQUE |
| settled_date | date | YES | |
| settled_invoice_id | varchar(50) | YES | |
| settlement_status | varchar | NO | default `Pending` |
| actual_settled_date | date | YES | |

---

### partners

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| partner_code | varchar(50) | NO | UNIQUE |
| display_name | varchar(255) | NO | |
| is_active | boolean | NO | default true |
| auth_method | varchar(20) | NO | |
| auth_config | jsonb | NO | default {} |
| rate_limit_policy | jsonb | NO | default {} |
| sla_config | jsonb | NO | default {} |
| cache_policy | jsonb | NO | default {} |
| metadata | jsonb | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### partner_contracts

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| partner_id | bigint | NO | FK → partners, CASCADE |
| contract_version | varchar(20) | NO | |
| is_active | boolean | NO | default true |
| pricing_model | jsonb | NO | default {} |
| allowed_endpoints | jsonb | NO | default [] (array) |
| field_mapping | jsonb | YES | |
| effective_from | timestamptz | NO | default CURRENT_TIMESTAMP |
| effective_until | timestamptz | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

### supply_orders

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| partner_id | bigint | NO | FK → partners, RESTRICT |
| partner_order_ref | varchar(100) | YES | |
| internal_order_id | bigint | YES | link to internal order |
| offer_token | text | NO | |
| status | varchar(30) | NO | |
| hotel_id | bigint | NO | |
| check_in | date | NO | |
| check_out | date | NO | |
| guest_data | jsonb | NO | default {} |
| cost_snapshot | jsonb | NO | default {} |
| partner_price | jsonb | NO | default {} |
| hold_expires_at | timestamptz | YES | |
| confirmed_at | timestamptz | YES | |
| cancelled_at | timestamptz | YES | |
| idempotency_key | varchar(255) | YES | UNIQUE when not null |
| correlation_id | varchar(100) | NO | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Indexes: `(partner_id, status)`, partial unique on `idempotency_key`, partial index on `hold_expires_at`.

### partner_api_logs

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| partner_id | bigint | NO | FK → partners, RESTRICT |
| endpoint | varchar(100) | NO | |
| method | varchar(10) | NO | |
| request_hash | varchar(64) | YES | |
| response_status | int | YES | |
| response_time_ms | int | YES | |
| correlation_id | varchar(100) | YES | |
| created_at | timestamptz | NO | |

Index: `(partner_id, created_at)`.

---

### channel_manager_hotel_mappings

No FK to `hotels` in TypeORM (by design, cross-domain).

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| hotel_id | bigint | NO | |
| channel_manager_id | bigint | NO | |
| external_hotel_code | varchar(100) | NO | |
| external_hotel_name | varchar(255) | YES | |
| is_active | boolean | NO | default true |
| integration_settings | jsonb | YES | |
| created_at | timestamptz | NO | |
| updated_at | timestamptz | NO | |

Unique: `(hotel_id, channel_manager_id)`; `(channel_manager_id, external_hotel_code)`.

### ari_sync_logs

Audit trail for ARI (availability/rate/inventory) sync with channel managers.

| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| id | bigint | NO | PK |
| sync_id | uuid | NO | UNIQUE index |
| channel_manager_id | bigint | NO | |
| hotel_id | bigint | NO | |
| sync_type | varchar(30) | NO | |
| message_type | varchar(100) | NO | |
| echo_token | varchar(100) | YES | |
| request_timestamp | timestamptz | NO | |
| response_timestamp | timestamptz | YES | |
| status | varchar(20) | NO | |
| http_status_code | integer | YES | |
| request_payload | text | YES | |
| response_payload | text | YES | |
| error_code | varchar(50) | YES | |
| error_message | text | YES | |
| affected_dates | daterange | YES | PostgreSQL range type |
| affected_room_types | bigint[] | YES | |
| affected_rate_plans | bigint[] | YES | |
| retry_count | smallint | NO | default 0 |
| duration_ms | integer | YES | |
| created_at | timestamptz | NO | |

---

## Relationship overview (text)

- **hotels** → optional **cities** / **countries**; root for **room_types**, **rate_plans**, **hotel_images**, **hotel_amenities**, **hotel_payment_methods**, **room_restrictions**, **hotel_orders**, settlements, supply data, and CM mappings.
- **room_types** belong to **hotels** and reference **room_types_master** by id; connect to **rate_plans** via **room_type_rate_plans**; drive **room_rates**, **room_inventory**, **room_type_images**, optional **room_restrictions**.
- **rate_plans** optionally link **cancellation_policies**; **cancellation_policy_rules** hang off policies.
- **AspNetUsers** ↔ **AspNetRoles** via **AspNetUserRoles**; **user_hotels** assigns hotels to users; **auth_refresh_tokens** belong to users.
- **hotel_orders** tie **hotels**, **hotel_channel_managers**, **hotel_sales_points** to **hotel_order_rooms**, **hotel_order_prices**, **hotel_order_passengers**; **settlement_invoices** reference orders; **hotel_settlements** tracks legacy settlement state per order.
- **settlements** aggregate **settlement_invoices** and **settlement_files**.
- **partners** own **partner_contracts**, **supply_orders**, **partner_api_logs**.

## Migrations

Schema evolution is versioned under `src/infrastructure/database/migrations`. Run via TypeORM CLI / npm script using `data-source.ts` and the same `DB_*` (or appsettings) as the app.

## Refreshing this document from a live database

If you have network access to the DB configured in `.env`, you can export column definitions, for example:

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

Compare results to this file after any manual DDL or non-TypeORM changes.
