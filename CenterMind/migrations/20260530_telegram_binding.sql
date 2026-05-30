-- Migration: 20260530_telegram_binding
-- Sistema de matcheo Telegram ↔ Vendedor ERP
-- Ejecutar en el SQL Editor de Supabase

-- 1. Columnas nuevas en grupos
ALTER TABLE grupos
  ADD COLUMN IF NOT EXISTS id_vendedor_v2          INTEGER,
  ADD COLUMN IF NOT EXISTS binding_status           TEXT DEFAULT 'unlinked'
    CHECK (binding_status IN ('linked', 'review', 'unlinked')),
  ADD COLUMN IF NOT EXISTS bound_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bound_by                 TEXT,
  ADD COLUMN IF NOT EXISTS dominant_uploader_uid    BIGINT,
  ADD COLUMN IF NOT EXISTS nombre_grupo_prev        TEXT;

-- 2. Cola de sugerencias de binding
CREATE TABLE IF NOT EXISTS telegram_binding_suggestions (
  id                   BIGSERIAL PRIMARY KEY,
  id_distribuidor      INTEGER NOT NULL,
  telegram_chat_id     BIGINT NOT NULL,
  id_vendedor_v2       INTEGER NOT NULL,
  score                NUMERIC(4,3) NOT NULL,
  reasons              JSONB DEFAULT '[]',
  status               TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'rejected', 'auto_applied')),
  source               TEXT,  -- 'drift','cron','bot_vincular','padron'
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ,
  resolved_by          TEXT
);

CREATE INDEX IF NOT EXISTS idx_tbs_dist_status
  ON telegram_binding_suggestions(id_distribuidor, status);

-- 3. Historial de apply/reject
CREATE TABLE IF NOT EXISTS telegram_binding_audit (
  id                   BIGSERIAL PRIMARY KEY,
  id_distribuidor      INTEGER NOT NULL,
  telegram_chat_id     BIGINT NOT NULL,
  id_vendedor_v2_prev  INTEGER,
  id_vendedor_v2_new   INTEGER,
  action               TEXT NOT NULL,  -- 'linked','unlinked','rejected'
  source               TEXT,
  performed_by         TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tba_dist
  ON telegram_binding_audit(id_distribuidor, created_at DESC);
