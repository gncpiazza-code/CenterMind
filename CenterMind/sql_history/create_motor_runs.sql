-- ──────────────────────────────────────────────────────────────────────────
-- FASE 1.1 — Tabla motor_runs + índices únicos para upsert idempotente
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- ──────────────────────────────────────────────────────────────────────────

-- Tabla de log persistente para cada ejecución de motor
CREATE TABLE IF NOT EXISTS motor_runs (
  id            BIGSERIAL PRIMARY KEY,
  motor         TEXT NOT NULL,        -- 'padron', 'ventas', 'cuentas'
  dist_id       INTEGER REFERENCES distribuidores(id_distribuidor),
  estado        TEXT NOT NULL,        -- 'en_curso', 'ok', 'error', 'parcial'
  iniciado_en   TIMESTAMPTZ DEFAULT NOW(),
  finalizado_en TIMESTAMPTZ,
  registros     JSONB,                -- { sucursales: 5, vendedores: 20, rutas: 30, clientes: 1500 }
  error_msg     TEXT
);

CREATE INDEX IF NOT EXISTS idx_motor_runs_dist_motor
  ON motor_runs (dist_id, motor, iniciado_en DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- Índices únicos que permiten el upsert atómico del Padrón
-- Estos son seguros de correr si los datos ya son consistentes.
-- Si alguno falla por duplicados, revisar los datos antes de continuar.
-- ──────────────────────────────────────────────────────────────────────────

-- sucursales: clave natural = (distribuidor, id_erp de la sucursal)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sucursales_dist_erp
  ON sucursales (id_distribuidor, id_sucursal_erp)
  WHERE id_sucursal_erp IS NOT NULL;

-- vendedores: clave natural = (distribuidor, nombre en el ERP)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendedores_dist_nombre
  ON vendedores (id_distribuidor, nombre_erp)
  WHERE nombre_erp IS NOT NULL;

-- rutas: clave natural = (vendedor, id de ruta en ERP)
CREATE UNIQUE INDEX IF NOT EXISTS idx_rutas_vendedor_erp
  ON rutas (id_vendedor, id_ruta_erp)
  WHERE id_ruta_erp IS NOT NULL;

-- clientes_pdv: clave natural = (ruta, id de cliente en ERP)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_pdv_ruta_erp
  ON clientes_pdv (id_ruta, id_cliente_erp)
  WHERE id_cliente_erp IS NOT NULL;
