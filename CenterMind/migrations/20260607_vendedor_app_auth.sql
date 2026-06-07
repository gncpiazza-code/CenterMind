-- Migración: 20260607_vendedor_app_auth
-- App Flutter SHELFYAPP: tablas de autenticación, dispositivos y upload de vendedores
-- Ejecutar en el SQL Editor de Supabase

BEGIN;

-- ─────────────────────────────────────────────
-- 1. vendedor_app_keys — API keys (hasheadas) por vendedor
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendedor_app_keys (
  id              BIGSERIAL       PRIMARY KEY,
  id_distribuidor INTEGER         NOT NULL,
  id_vendedor     INTEGER         NOT NULL,  -- id de vendedores_v2
  key_hash        TEXT            NOT NULL,  -- argon2/bcrypt, nunca plaintext
  activo          BOOLEAN         NOT NULL DEFAULT TRUE,
  label           TEXT,                      -- etiqueta opcional del admin
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_by      TEXT,
  revoked_at      TIMESTAMPTZ,
  revoked_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_vendedor_app_keys_dist_vendor
  ON vendedor_app_keys (id_distribuidor, id_vendedor);

CREATE INDEX IF NOT EXISTS idx_vendedor_app_keys_hash_activo
  ON vendedor_app_keys (key_hash) WHERE activo = TRUE;

-- ─────────────────────────────────────────────
-- 2. vendedor_app_devices — N dispositivos por key
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendedor_app_devices (
  id              BIGSERIAL       PRIMARY KEY,
  key_id          BIGINT          NOT NULL REFERENCES vendedor_app_keys(id) ON DELETE CASCADE,
  device_id       TEXT            NOT NULL,  -- UUID estable generado en la app
  platform        TEXT            NOT NULL CHECK (platform IN ('android', 'ios')),
  app_version     TEXT,
  push_token      TEXT,                      -- FCM/APN — NULL en v1
  last_seen       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  activo          BOOLEAN         NOT NULL DEFAULT TRUE,
  registered_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  UNIQUE (key_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_vendedor_app_devices_key
  ON vendedor_app_devices (key_id);

CREATE INDEX IF NOT EXISTS idx_vendedor_app_devices_device
  ON vendedor_app_devices (device_id);

-- ─────────────────────────────────────────────
-- 3. vendedor_app_upload_queue — audit idempotencia de uploads
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendedor_app_upload_queue (
  id                BIGSERIAL   PRIMARY KEY,
  client_upload_id  UUID        NOT NULL UNIQUE,  -- idempotency key generado en la app
  id_distribuidor   INTEGER     NOT NULL,
  device_id         TEXT        NOT NULL,
  estado            TEXT        NOT NULL DEFAULT 'received'
                    CHECK (estado IN ('received', 'processing', 'done', 'failed')),
  payload_meta      JSONB,       -- {nro_cliente, tipo_pdv, photo_count, lat, lng}
  exhibicion_ids    JSONB,       -- IDs creados en success
  error_detail      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendedor_upload_queue_dist
  ON vendedor_app_upload_queue (id_distribuidor);

CREATE INDEX IF NOT EXISTS idx_vendedor_upload_queue_uid
  ON vendedor_app_upload_queue (client_upload_id);

-- ─────────────────────────────────────────────
-- 4. ALTER exhibiciones — campos mobile
-- ─────────────────────────────────────────────
ALTER TABLE exhibiciones
  ADD COLUMN IF NOT EXISTS source            TEXT    DEFAULT 'telegram_manual',
  ADD COLUMN IF NOT EXISTS capture_lat       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS capture_lng       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS client_upload_id  UUID;

CREATE INDEX IF NOT EXISTS idx_exhibiciones_source
  ON exhibiciones (source) WHERE source != 'telegram_manual';

CREATE INDEX IF NOT EXISTS idx_exhibiciones_client_upload
  ON exhibiciones (client_upload_id) WHERE client_upload_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- 5. ALTER distribuidores — branding mobile
-- ─────────────────────────────────────────────
ALTER TABLE distribuidores
  ADD COLUMN IF NOT EXISTS mobile_branding JSONB;

-- Estructura esperada en mobile_branding:
-- { "primary_color": "#RRGGBB", "logo_url": "<supabase-storage-url>", "app_name": "Shelfy" }

-- ─────────────────────────────────────────────
-- 6. ALTER integrantes_grupo — marcar integrantes sintéticos de app
-- ─────────────────────────────────────────────
ALTER TABLE integrantes_grupo
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'telegram'
    CHECK (source IN ('telegram', 'mobile_app'));

-- ─────────────────────────────────────────────
-- 7. Backfill: exhibiciones existentes son telegram
-- ─────────────────────────────────────────────
UPDATE exhibiciones
  SET source = 'telegram_manual'
  WHERE source IS NULL;

COMMIT;
