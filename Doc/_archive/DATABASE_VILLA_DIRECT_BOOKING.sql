-- Sindibed Villa — direct booking platform schema (PostgreSQL)
-- Multi-tenant: each account = villa owner / operator; villas = bookable properties.
-- Differs from hotel ARI: one primary inventory unit per villa (whole-home), optional sub-units.

-- Optional: enables GiST + btree composite for exclusion constraints (overlap prevention).
CREATE EXTENSION IF NOT EXISTS btree_gist;

BEGIN;

-- ---------------------------------------------------------------------------
-- Locales & taxonomy
-- ---------------------------------------------------------------------------

CREATE TABLE countries (
  id          bigserial PRIMARY KEY,
  code_iso2   char(2) NOT NULL UNIQUE,
  name        varchar(100) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cities (
  id          bigserial PRIMARY KEY,
  country_id  bigint NOT NULL REFERENCES countries (id),
  name        varchar(100) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cities_country_id ON cities (country_id);

CREATE TABLE amenity_categories (
  id         smallserial PRIMARY KEY,
  code       varchar(50) NOT NULL UNIQUE,
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE amenities (
  id          bigserial PRIMARY KEY,
  category_id smallint NOT NULL REFERENCES amenity_categories (id),
  code        varchar(80) NOT NULL UNIQUE,
  name        varchar(255) NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_amenities_category_active ON amenities (category_id)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- Accounts (villa owners) & team access
-- ---------------------------------------------------------------------------

CREATE TABLE accounts (
  id                    bigserial PRIMARY KEY,
  legal_name            varchar(255) NOT NULL,
  display_name          varchar(255) NOT NULL,
  slug                  varchar(100) NOT NULL UNIQUE,
  default_currency      char(3) NOT NULL DEFAULT 'USD',
  timezone              varchar(64) NOT NULL DEFAULT 'UTC',
  contact_email         varchar(255),
  contact_phone         varchar(50),
  billing_address       jsonb,
  status                varchar(30) NOT NULL DEFAULT 'active',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_accounts_status CHECK (status IN ('active', 'suspended', 'closed'))
);

-- At least one login path should exist via user_auth_identities (email, phone OTP, OAuth, etc.).
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             varchar(255),
  email_verified_at timestamptz,
  phone             varchar(32),
  phone_verified_at timestamptz,
  password_hash     text,
  full_name         varchar(255),
  locale            varchar(10) NOT NULL DEFAULT 'en',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_users_email_ci ON users (lower(trim(email))) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX uq_users_phone_e164 ON users (phone) WHERE phone IS NOT NULL;

-- Links staff users to external IdPs and OTP destinations (SMS, WhatsApp, Apple, Google, …).
CREATE TABLE user_auth_identities (
  id                 bigserial PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider           varchar(40) NOT NULL,
  provider_subject   text NOT NULL,
  verified_at        timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject),
  CONSTRAINT chk_user_auth_provider CHECK (provider IN (
    'password', 'email_magic_link', 'sms_otp', 'whatsapp_otp',
    'google', 'apple', 'microsoft', 'facebook'
  ))
);

CREATE INDEX idx_user_auth_identities_user_id ON user_auth_identities (user_id);

-- Short-lived OTP / magic-link challenges; integrate Twilio, Meta WhatsApp, or other vendors via worker.
CREATE TABLE auth_otp_challenges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES users (id) ON DELETE CASCADE,
  destination       text NOT NULL,
  channel           varchar(20) NOT NULL,
  code_hash         text NOT NULL,
  expires_at        timestamptz NOT NULL,
  consumed_at       timestamptz,
  attempt_count     smallint NOT NULL DEFAULT 0,
  max_attempts      smallint NOT NULL DEFAULT 5,
  idempotency_key   varchar(128),
  ip_address        text,
  user_agent        text,
  integration_hint  varchar(60),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_auth_otp_channel CHECK (channel IN ('sms', 'whatsapp', 'email')),
  CONSTRAINT chk_auth_otp_attempts CHECK (attempt_count >= 0 AND max_attempts > 0)
);

CREATE UNIQUE INDEX uq_auth_otp_idempotency ON auth_otp_challenges (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_auth_otp_destination_created ON auth_otp_challenges (destination, created_at DESC);

CREATE INDEX idx_auth_otp_pending_expires ON auth_otp_challenges (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE account_members (
  account_id bigint NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role       varchar(30) NOT NULL DEFAULT 'staff',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_id),
  CONSTRAINT chk_account_members_role CHECK (role IN ('owner', 'admin', 'staff', 'readonly'))
);

CREATE INDEX idx_account_members_user_id ON account_members (user_id);

CREATE TABLE auth_refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_agent  text,
  ip_address  text
);

CREATE INDEX idx_auth_refresh_tokens_user_id ON auth_refresh_tokens (user_id);
CREATE INDEX idx_auth_refresh_tokens_token_hash ON auth_refresh_tokens (token_hash);
CREATE INDEX idx_auth_refresh_tokens_expires_at ON auth_refresh_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- Cancellation templates (reusable per account or villa)
-- ---------------------------------------------------------------------------

CREATE TABLE cancellation_policies (
  id               bigserial PRIMARY KEY,
  account_id       bigint REFERENCES accounts (id) ON DELETE CASCADE,
  code             varchar(80) NOT NULL,
  name             varchar(255) NOT NULL,
  description      text,
  is_non_refundable boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, code)
);

CREATE TABLE cancellation_policy_rules (
  id                         bigserial PRIMARY KEY,
  cancellation_policy_id     bigint NOT NULL REFERENCES cancellation_policies (id) ON DELETE CASCADE,
  from_hours_before_checkin  integer NOT NULL,
  to_hours_before_checkin    integer,
  penalty_type               varchar(20) NOT NULL,
  penalty_value              integer NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cancellation_policy_rules_policy ON cancellation_policy_rules (cancellation_policy_id);

-- ---------------------------------------------------------------------------
-- Villas (bookable listings)
-- ---------------------------------------------------------------------------

CREATE TABLE villas (
  id                      bigserial PRIMARY KEY,
  account_id              bigint NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  public_slug             varchar(120) NOT NULL,
  title                   varchar(255) NOT NULL,
  short_description       text,
  long_description        text,
  city_id                 bigint REFERENCES cities (id),
  country_id              bigint REFERENCES countries (id),
  address_line            text,
  latitude                decimal(20, 15),
  longitude               decimal(21, 15),
  check_in_time           varchar(5) NOT NULL DEFAULT '15:00',
  check_out_time          varchar(5) NOT NULL DEFAULT '11:00',
  bedrooms                smallint NOT NULL DEFAULT 1,
  bathrooms               smallint NOT NULL DEFAULT 1,
  max_guests              smallint NOT NULL,
  extra_guest_policy      jsonb,
  children_policy         jsonb,
  pets_allowed            boolean NOT NULL DEFAULT false,
  smoking_allowed         boolean NOT NULL DEFAULT false,
  minimum_nights          smallint NOT NULL DEFAULT 1,
  maximum_nights          smallint,
  advance_booking_days    smallint,
  same_day_booking_cutoff time,
  status                  varchar(30) NOT NULL DEFAULT 'draft',
  published_at            timestamptz,
  cover_image_url         text,
  cancellation_policy_id  bigint REFERENCES cancellation_policies (id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, public_slug),
  CONSTRAINT chk_villas_status CHECK (status IN ('draft', 'published', 'paused', 'archived'))
);

CREATE INDEX idx_villas_account_id ON villas (account_id);
CREATE INDEX idx_villas_status ON villas (status);
CREATE INDEX idx_villas_public_slug ON villas (public_slug);

-- Guest-facing search: filter published + location without scanning drafts.
CREATE INDEX idx_villas_published_location
  ON villas (country_id, city_id)
  WHERE status = 'published';

-- Owner console: list villas for an account by workflow state.
CREATE INDEX idx_villas_account_status ON villas (account_id, status);

CREATE TABLE villa_amenities (
  villa_id    bigint NOT NULL REFERENCES villas (id) ON DELETE CASCADE,
  amenity_id  bigint NOT NULL REFERENCES amenities (id) ON DELETE CASCADE,
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (villa_id, amenity_id)
);

-- Guest detail: amenities for one villa (ORDER BY sort_order, amenity_id).
CREATE INDEX idx_villa_amenities_villa_sort ON villa_amenities (villa_id, sort_order, amenity_id);

-- Search / filters: villas that have a given amenity (join to villas, filter published).
CREATE INDEX idx_villa_amenities_amenity_villa ON villa_amenities (amenity_id, villa_id);

CREATE TABLE villa_images (
  id            bigserial PRIMARY KEY,
  villa_id      bigint NOT NULL REFERENCES villas (id) ON DELETE CASCADE,
  image_url     text NOT NULL,
  caption       varchar(500),
  is_primary    boolean NOT NULL DEFAULT false,
  display_order integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_villa_images_villa_id ON villa_images (villa_id);

CREATE INDEX idx_villa_images_villa_order ON villa_images (villa_id, display_order NULLS LAST, id);

-- Optional: compound properties with multiple rentable units (suite, guest house).
CREATE TABLE villa_units (
  id           bigserial PRIMARY KEY,
  villa_id     bigint NOT NULL REFERENCES villas (id) ON DELETE CASCADE,
  unit_code    varchar(50) NOT NULL,
  name         varchar(255) NOT NULL,
  max_guests   smallint NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (villa_id, unit_code)
);

-- ---------------------------------------------------------------------------
-- Pricing: nightly overrides + optional fees
-- ---------------------------------------------------------------------------

CREATE TABLE villa_nightly_rates (
  id              bigserial PRIMARY KEY,
  villa_id        bigint NOT NULL REFERENCES villas (id) ON DELETE CASCADE,
  villa_unit_id   bigint REFERENCES villa_units (id) ON DELETE CASCADE,
  rate_date       date NOT NULL,
  currency_code   char(3) NOT NULL,
  nightly_amount  numeric(12, 2) NOT NULL,
  min_stay_nights smallint,
  is_closed       boolean NOT NULL DEFAULT false,
  note            varchar(255),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_villa_nightly_rates_whole_home
  ON villa_nightly_rates (villa_id, rate_date)
  WHERE villa_unit_id IS NULL;

CREATE UNIQUE INDEX uq_villa_nightly_rates_unit
  ON villa_nightly_rates (villa_id, villa_unit_id, rate_date)
  WHERE villa_unit_id IS NOT NULL;

CREATE INDEX idx_villa_nightly_rates_villa_date ON villa_nightly_rates (villa_id, rate_date);

-- Very large calendars: cheap index on chronological inserts (vacuum/analyze regularly).
CREATE INDEX brin_villa_nightly_rates_rate_date ON villa_nightly_rates USING brin (rate_date);

CREATE TABLE villa_fee_definitions (
  id            bigserial PRIMARY KEY,
  villa_id      bigint NOT NULL REFERENCES villas (id) ON DELETE CASCADE,
  fee_code      varchar(50) NOT NULL,
  name          varchar(255) NOT NULL,
  amount        numeric(12, 2),
  amount_type   varchar(20) NOT NULL DEFAULT 'fixed',
  tax_included  boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (villa_id, fee_code),
  CONSTRAINT chk_villa_fee_amount_type CHECK (amount_type IN ('fixed', 'percent_per_stay', 'percent_per_night'))
);

CREATE INDEX idx_villa_fee_definitions_villa_active ON villa_fee_definitions (villa_id) WHERE is_active;

-- Default nightly when no row in villa_nightly_rates: stored on villa or separate defaults table.
CREATE TABLE villa_rate_defaults (
  villa_id           bigint PRIMARY KEY REFERENCES villas (id) ON DELETE CASCADE,
  currency_code      char(3) NOT NULL,
  base_nightly_amount numeric(12, 2) NOT NULL,
  weekend_multiplier  numeric(5, 2),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Calendar: owner blocks + iCal holds (inventory is implicit: 1 per villa/unit)
-- ---------------------------------------------------------------------------

CREATE TABLE villa_calendar_blocks (
  id             bigserial PRIMARY KEY,
  villa_id       bigint NOT NULL REFERENCES villas (id) ON DELETE CASCADE,
  villa_unit_id  bigint REFERENCES villa_units (id) ON DELETE CASCADE,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  block_type     varchar(30) NOT NULL,
  reason         varchar(255),
  source         varchar(50) NOT NULL DEFAULT 'manual',
  external_ref   varchar(255),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_villa_calendar_block_type CHECK (block_type IN ('maintenance', 'owner_stay', 'other')),
  CONSTRAINT chk_villa_calendar_dates CHECK (end_date > start_date)
);

CREATE INDEX idx_villa_calendar_blocks_villa_dates ON villa_calendar_blocks (villa_id, start_date, end_date);

CREATE INDEX brin_villa_calendar_blocks_start ON villa_calendar_blocks USING brin (start_date);

-- ---------------------------------------------------------------------------
-- Guests (optional account for repeat bookers)
-- ---------------------------------------------------------------------------

CREATE TABLE guests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        varchar(255),
  phone        varchar(50),
  full_name    varchar(255) NOT NULL,
  country_code char(2),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_guests_email ON guests (email) WHERE email IS NOT NULL;

CREATE INDEX idx_guests_phone ON guests (phone) WHERE phone IS NOT NULL;

-- Marketing / transactional channel consent (guest CRM; align with local telecom rules).
CREATE TABLE guest_notification_preferences (
  guest_id   uuid NOT NULL REFERENCES guests (id) ON DELETE CASCADE,
  channel    varchar(30) NOT NULL,
  opted_in   boolean NOT NULL DEFAULT false,
  source     varchar(40) NOT NULL DEFAULT 'booking_flow',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_id, channel),
  CONSTRAINT chk_guest_notif_channel CHECK (channel IN (
    'email', 'sms', 'whatsapp', 'push'
  ))
);

-- ---------------------------------------------------------------------------
-- Bookings & price snapshot
-- ---------------------------------------------------------------------------

CREATE TABLE bookings (
  id                      bigserial PRIMARY KEY,
  public_ref              varchar(40) NOT NULL UNIQUE,
  villa_id                bigint NOT NULL REFERENCES villas (id),
  villa_unit_id           bigint REFERENCES villa_units (id),
  account_id              bigint NOT NULL REFERENCES accounts (id),
  guest_id                uuid REFERENCES guests (id),
  check_in_date           date NOT NULL,
  check_out_date          date NOT NULL,
  -- 0 = whole villa (villa_unit_id IS NULL); otherwise villa_units.id. Used for GiST / exclusion.
  inventory_slot          bigint GENERATED ALWAYS AS (COALESCE(villa_unit_id, 0::bigint)) STORED,
  -- Half-open stay [check_in, check_out) for overlap queries and DB-level conflict prevention.
  stay_range              daterange GENERATED ALWAYS AS (
    daterange(check_in_date, check_out_date, '[)')
  ) STORED,
  status                  varchar(30) NOT NULL DEFAULT 'inquiry',
  guest_adults            smallint NOT NULL DEFAULT 1,
  guest_children          smallint NOT NULL DEFAULT 0,
  guest_message           text,
  internal_note           text,
  currency_code           char(3) NOT NULL,
  subtotal_nights         numeric(12, 2) NOT NULL,
  fees_total              numeric(12, 2) NOT NULL DEFAULT 0,
  taxes_total             numeric(12, 2) NOT NULL DEFAULT 0,
  discount_total          numeric(12, 2) NOT NULL DEFAULT 0,
  grand_total             numeric(12, 2) NOT NULL,
  price_breakdown         jsonb NOT NULL DEFAULT '{}',
  cancellation_policy_snapshot jsonb,
  confirmed_at            timestamptz,
  cancelled_at            timestamptz,
  cancellation_reason     text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_bookings_dates CHECK (check_out_date > check_in_date),
  CONSTRAINT chk_bookings_status CHECK (status IN (
    'inquiry', 'pending_payment', 'confirmed', 'checked_in', 'checked_out',
    'cancelled_by_guest', 'cancelled_by_host', 'no_show', 'expired'
  ))
);

CREATE INDEX idx_bookings_villa_dates ON bookings (villa_id, check_in_date, check_out_date);
CREATE INDEX idx_bookings_account_id ON bookings (account_id);
CREATE INDEX idx_bookings_guest_id ON bookings (guest_id);
CREATE INDEX idx_bookings_guest_created_at ON bookings (guest_id, created_at DESC)
  WHERE guest_id IS NOT NULL;
CREATE INDEX idx_bookings_status ON bookings (status);

-- Owner dashboards: keyset / time-ordered lists.
CREATE INDEX idx_bookings_account_created_at ON bookings (account_id, created_at DESC);

-- Fast “any overlap with [a,b)?” for a given villa + inventory slot (availability API).
CREATE INDEX idx_bookings_availability_gist ON bookings USING gist (villa_id, inventory_slot, stay_range);

-- Prevents overlapping active holds for the same villa inventory (tune WHERE statuses to your product).
ALTER TABLE bookings ADD CONSTRAINT bookings_excl_no_overlap
  EXCLUDE USING gist (
    villa_id WITH =,
    inventory_slot WITH =,
    stay_range WITH &&
  ) WHERE (
    status IN ('pending_payment', 'confirmed', 'checked_in')
  );

CREATE TABLE booking_fee_lines (
  id          bigserial PRIMARY KEY,
  booking_id  bigint NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  fee_code    varchar(50) NOT NULL,
  label       varchar(255) NOT NULL,
  amount      numeric(12, 2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Payments (direct booking)
-- ---------------------------------------------------------------------------

CREATE TABLE payments (
  id                 bigserial PRIMARY KEY,
  booking_id         bigint NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  provider           varchar(40) NOT NULL,
  provider_intent_id varchar(255),
  amount             numeric(12, 2) NOT NULL,
  currency_code      char(3) NOT NULL,
  status             varchar(30) NOT NULL DEFAULT 'pending',
  paid_at            timestamptz,
  failure_reason     text,
  raw_payload        jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_payments_status CHECK (status IN ('pending', 'authorized', 'captured', 'refunded', 'failed', 'cancelled'))
);

CREATE INDEX idx_payments_booking_id ON payments (booking_id);

CREATE INDEX idx_payments_provider_intent ON payments (provider, provider_intent_id)
  WHERE provider_intent_id IS NOT NULL;

CREATE INDEX idx_payments_status_created ON payments (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Owner payouts (simplified settlements)
-- ---------------------------------------------------------------------------

CREATE TABLE payout_batches (
  id              bigserial PRIMARY KEY,
  account_id      bigint NOT NULL REFERENCES accounts (id),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  currency_code   char(3) NOT NULL,
  total_amount    numeric(14, 2) NOT NULL,
  status          varchar(30) NOT NULL DEFAULT 'draft',
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payout_batches_account_created ON payout_batches (account_id, created_at DESC);

CREATE TABLE payout_lines (
  id               bigserial PRIMARY KEY,
  payout_batch_id  bigint NOT NULL REFERENCES payout_batches (id) ON DELETE CASCADE,
  booking_id       bigint NOT NULL REFERENCES bookings (id),
  amount           numeric(12, 2) NOT NULL,
  commission_amount numeric(12, 2) NOT NULL DEFAULT 0,
  UNIQUE (booking_id)
);

CREATE INDEX idx_payout_lines_batch ON payout_lines (payout_batch_id);

-- ---------------------------------------------------------------------------
-- Payment methods exposed to guest checkout (per account)
-- ---------------------------------------------------------------------------

CREATE TABLE account_payment_methods (
  account_id    bigint PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  stripe_account_id varchar(255),
  bank_details  jsonb,
  cash_instructions jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- SaaS billing (subscription to Nestino / Sindibed — not guest booking payment)
-- ---------------------------------------------------------------------------

CREATE TABLE subscription_plans (
  code            varchar(50) PRIMARY KEY,
  name            varchar(255) NOT NULL,
  billing_interval varchar(20) NOT NULL,
  trial_days      smallint NOT NULL DEFAULT 90,
  price_amount    numeric(12, 2),
  currency_code   char(3) NOT NULL DEFAULT 'USD',
  features        jsonb NOT NULL DEFAULT '{}',
  is_public       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_subscription_plans_interval CHECK (billing_interval IN ('monthly', 'yearly', 'custom'))
);

CREATE TABLE account_subscriptions (
  id                      bigserial PRIMARY KEY,
  account_id              bigint NOT NULL UNIQUE REFERENCES accounts (id) ON DELETE CASCADE,
  plan_code               varchar(50) NOT NULL REFERENCES subscription_plans (code),
  status                  varchar(30) NOT NULL DEFAULT 'trialing',
  trial_ends_at           timestamptz,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean NOT NULL DEFAULT false,
  billing_provider        varchar(40) NOT NULL DEFAULT 'stripe',
  billing_customer_id     varchar(255),
  billing_subscription_id varchar(255),
  metadata                jsonb NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_account_subscriptions_status CHECK (status IN (
    'trialing', 'active', 'past_due', 'canceled', 'paused'
  ))
);

CREATE INDEX idx_account_subscriptions_plan ON account_subscriptions (plan_code);
CREATE INDEX idx_account_subscriptions_status_period ON account_subscriptions (status, current_period_end);

-- ---------------------------------------------------------------------------
-- Third-party integrations per account (SMS, WhatsApp, email, push — config only; secrets in vault)
-- ---------------------------------------------------------------------------

CREATE TABLE account_integrations (
  id                bigserial PRIMARY KEY,
  account_id        bigint NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  provider_code     varchar(60) NOT NULL,
  status            varchar(20) NOT NULL DEFAULT 'active',
  config            jsonb NOT NULL DEFAULT '{}',
  secret_vault_ref  varchar(512),
  webhook_secret_vault_ref varchar(512),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, provider_code),
  CONSTRAINT chk_account_integrations_status CHECK (status IN ('active', 'disabled', 'error'))
);

CREATE INDEX idx_account_integrations_account ON account_integrations (account_id);
CREATE INDEX idx_account_integrations_provider ON account_integrations (provider_code);

-- ---------------------------------------------------------------------------
-- Notifications outbox (async workers; supports idempotency and retries)
-- ---------------------------------------------------------------------------

CREATE TABLE notification_templates (
  id               bigserial PRIMARY KEY,
  account_id       bigint REFERENCES accounts (id) ON DELETE CASCADE,
  code             varchar(80) NOT NULL,
  channel          varchar(30) NOT NULL,
  locale           varchar(10) NOT NULL DEFAULT 'en',
  subject_template text,
  body_template    text NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_notification_templates_system
  ON notification_templates (code, channel, locale)
  WHERE account_id IS NULL;

CREATE UNIQUE INDEX uq_notification_templates_account
  ON notification_templates (account_id, code, channel, locale)
  WHERE account_id IS NOT NULL;

CREATE TABLE notification_outbox (
  id                   bigserial PRIMARY KEY,
  account_id           bigint REFERENCES accounts (id) ON DELETE SET NULL,
  audience             varchar(20) NOT NULL,
  recipient_user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  recipient_guest_id   uuid REFERENCES guests (id) ON DELETE SET NULL,
  recipient_address    text NOT NULL,
  channel              varchar(30) NOT NULL,
  template_code        varchar(80),
  locale               varchar(10) NOT NULL DEFAULT 'en',
  payload              jsonb NOT NULL DEFAULT '{}',
  status               varchar(20) NOT NULL DEFAULT 'pending',
  priority             smallint NOT NULL DEFAULT 0,
  scheduled_at         timestamptz NOT NULL DEFAULT now(),
  available_at         timestamptz NOT NULL DEFAULT now(),
  attempt_count        smallint NOT NULL DEFAULT 0,
  next_retry_at        timestamptz,
  sent_at              timestamptz,
  provider_code        varchar(60),
  provider_message_id  varchar(255),
  last_error           text,
  idempotency_key      varchar(128),
  booking_id           bigint REFERENCES bookings (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_notification_outbox_audience CHECK (audience IN ('staff_user', 'guest', 'system')),
  CONSTRAINT chk_notification_outbox_status CHECK (status IN (
    'pending', 'retrying', 'sent', 'failed', 'cancelled'
  ))
);

CREATE UNIQUE INDEX uq_notification_outbox_idempotency ON notification_outbox (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_notification_outbox_dispatch
  ON notification_outbox (status, available_at, priority DESC, id)
  WHERE status IN ('pending', 'retrying');

CREATE INDEX idx_notification_outbox_account_created ON notification_outbox (account_id, created_at DESC);
CREATE INDEX idx_notification_outbox_booking ON notification_outbox (booking_id) WHERE booking_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Inbound webhooks idempotency (Stripe, Twilio status, WhatsApp, Meta, …)
-- ---------------------------------------------------------------------------

CREATE TABLE provider_webhook_inbox (
  id               bigserial PRIMARY KEY,
  provider_code    varchar(60) NOT NULL,
  event_id         varchar(255) NOT NULL,
  headers_snapshot jsonb,
  payload          jsonb NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz,
  processing_error text,
  UNIQUE (provider_code, event_id)
);

CREATE INDEX idx_provider_webhook_inbox_pending ON provider_webhook_inbox (received_at)
  WHERE processed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Channel / OTA connections (calendar sync, future API channel managers)
-- ---------------------------------------------------------------------------

CREATE TABLE channel_listings (
  id                    bigserial PRIMARY KEY,
  account_id            bigint NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  villa_id              bigint NOT NULL REFERENCES villas (id) ON DELETE CASCADE,
  channel_code          varchar(40) NOT NULL,
  external_listing_id   varchar(255),
  ical_feed_url         text,
  sync_direction        varchar(20) NOT NULL DEFAULT 'import',
  last_sync_at          timestamptz,
  last_sync_status      varchar(30),
  last_error            text,
  credentials_vault_ref varchar(512),
  settings              jsonb NOT NULL DEFAULT '{}',
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_channel_listings_direction CHECK (sync_direction IN ('import', 'export', 'both')),
  UNIQUE (villa_id, channel_code)
);

CREATE INDEX idx_channel_listings_account ON channel_listings (account_id);
CREATE INDEX idx_channel_listings_external ON channel_listings (channel_code, external_listing_id)
  WHERE external_listing_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- CRM / AI engagement audit trail (high volume → BRIN + time indexes)
-- ---------------------------------------------------------------------------

CREATE TABLE crm_interaction_events (
  id           bigserial PRIMARY KEY,
  account_id   bigint NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  guest_id     uuid REFERENCES guests (id) ON DELETE SET NULL,
  booking_id   bigint REFERENCES bookings (id) ON DELETE SET NULL,
  event_type   varchar(80) NOT NULL,
  channel      varchar(30),
  source       varchar(40) NOT NULL DEFAULT 'system',
  payload      jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_events_account_created ON crm_interaction_events (account_id, created_at DESC);
CREATE INDEX idx_crm_events_guest_created ON crm_interaction_events (guest_id, created_at DESC)
  WHERE guest_id IS NOT NULL;
CREATE INDEX brin_crm_interaction_events_created ON crm_interaction_events USING brin (created_at);

COMMIT;
