-- Restricción de sucursales por usuario del portal.
-- restriccion_sucursales = false → ve todas las sucursales del tenant (default).
-- restriccion_sucursales = true  → solo filas en usuario_portal_sucursales.

ALTER TABLE usuarios_portal
  ADD COLUMN IF NOT EXISTS restriccion_sucursales BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS usuario_portal_sucursales (
  id_usuario BIGINT NOT NULL REFERENCES usuarios_portal(id_usuario) ON DELETE CASCADE,
  id_distribuidor INTEGER NOT NULL,
  id_sucursal BIGINT NOT NULL,
  PRIMARY KEY (id_usuario, id_sucursal)
);

CREATE INDEX IF NOT EXISTS idx_usuario_portal_sucursales_dist
  ON usuario_portal_sucursales (id_distribuidor);

NOTIFY pgrst, 'reload schema';
