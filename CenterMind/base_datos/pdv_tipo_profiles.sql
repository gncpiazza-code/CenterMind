-- Perfil de tipo de PDV por cliente ERP (modo silencioso del bot)
CREATE TABLE IF NOT EXISTS pdv_tipo_profiles (
  id SERIAL PRIMARY KEY,
  id_distribuidor INTEGER NOT NULL,
  id_cliente_erp TEXT NOT NULL,
  tipo_pdv_preferido TEXT NOT NULL,
  trust_level TEXT NOT NULL DEFAULT 'low',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_observaciones INTEGER NOT NULL DEFAULT 0,
  tipo_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  last_seen TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_distribuidor, id_cliente_erp)
);

CREATE INDEX IF NOT EXISTS idx_pdv_tipo_profiles_dist_trust
  ON pdv_tipo_profiles (id_distribuidor, trust_level);

