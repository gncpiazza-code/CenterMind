-- Portal performance snapshots (dashboard, supervision CC, estadísticas, visor)
-- Ejecutar en Supabase SQL editor

-- Snapshot dashboard
CREATE TABLE IF NOT EXISTS portal_snapshot_dashboard (
  id bigserial PRIMARY KEY,
  id_distribuidor int NOT NULL,
  periodo text NOT NULL,
  sucursal_id int,
  payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_snap_dashboard
  ON portal_snapshot_dashboard (id_distribuidor, periodo, COALESCE(sucursal_id, -1));
CREATE INDEX IF NOT EXISTS idx_snap_dashboard_dist
  ON portal_snapshot_dashboard (id_distribuidor, generated_at DESC);

-- Snapshot supervision CC
CREATE TABLE IF NOT EXISTS portal_snapshot_supervision_cc (
  id bigserial PRIMARY KEY,
  id_distribuidor int NOT NULL,
  sucursal text,
  id_vendedor int,
  payload jsonb NOT NULL,
  fecha_snapshot_cc timestamptz,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_snap_supervision
  ON portal_snapshot_supervision_cc (id_distribuidor, COALESCE(sucursal, ''), COALESCE(id_vendedor, -1));
CREATE INDEX IF NOT EXISTS idx_snap_supervision_dist
  ON portal_snapshot_supervision_cc (id_distribuidor, generated_at DESC);

-- Snapshot estadísticas cartas
CREATE TABLE IF NOT EXISTS portal_snapshot_estadisticas_cartas (
  id bigserial PRIMARY KEY,
  id_distribuidor int NOT NULL,
  meses_hash text NOT NULL,
  sucursal text,
  payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_snap_estadisticas
  ON portal_snapshot_estadisticas_cartas (id_distribuidor, meses_hash, COALESCE(sucursal, ''));
CREATE INDEX IF NOT EXISTS idx_snap_estadisticas_dist
  ON portal_snapshot_estadisticas_cartas (id_distribuidor, generated_at DESC);

-- Snapshot visor
CREATE TABLE IF NOT EXISTS portal_snapshot_visor (
  id bigserial PRIMARY KEY,
  id_distribuidor int NOT NULL,
  payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_snap_visor
  ON portal_snapshot_visor (id_distribuidor);
CREATE INDEX IF NOT EXISTS idx_snap_visor_dist
  ON portal_snapshot_visor (id_distribuidor, generated_at DESC);
