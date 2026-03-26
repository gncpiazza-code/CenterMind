-- ──────────────────────────────────────────────────────────────────────────
-- FASE 2.1 — Mapeo Vendedor ERP ↔ Integrante Telegram
-- + Soporte para clientes "limbo" (alta entre actualizaciones de padrón)
-- Ejecutar en Supabase SQL Editor (una sola vez, orden importa)
-- ──────────────────────────────────────────────────────────────────────────

-- 1. FK de integrantes_grupo → vendedores
--    Permite linkear cada integrante a su vendedor ERP de forma estable.
--    Nullable porque puede existir un integrante sin vendedor asignado aún.
ALTER TABLE integrantes_grupo
ADD COLUMN IF NOT EXISTS id_vendedor INTEGER REFERENCES vendedores(id_vendedor);

CREATE INDEX IF NOT EXISTS idx_integrantes_vendedor
  ON integrantes_grupo (id_vendedor)
  WHERE id_vendedor IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Soporte clientes "limbo"
--    Un cliente limbo es uno que un vendedor fotografió ANTES de que el
--    admin subiera el padrón actualizado. El sistema crea el registro
--    mínimo para que la exhibición no se pierda; el próximo padrón lo adopta.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE clientes_pdv
ADD COLUMN IF NOT EXISTS es_limbo BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice para limpiar limbo fácilmente en cada ingesta
CREATE INDEX IF NOT EXISTS idx_clientes_pdv_limbo
  ON clientes_pdv (es_limbo)
  WHERE es_limbo = TRUE;

-- Ruta especial "LIMBO" por distribuidor: actúa como holding pen.
-- Se crea dinámicamente desde Python, pero dejamos la estructura documentada.
-- id_ruta_erp = '__LIMBO__', dia_semana = 'Variable', periodicidad = 'N/A'
-- Un INSERT de ejemplo (no correr, Python lo hace automáticamente):
-- INSERT INTO rutas (id_vendedor, id_ruta_erp, dia_semana, periodicidad)
-- VALUES (<id_vendedor_jefe_dist>, '__LIMBO__', 'Variable', 'N/A')
-- ON CONFLICT (id_vendedor, id_ruta_erp) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. id_distribuidor desnormalizado en clientes_pdv (para queries rápidas)
--    El PadronIngestionService lo escribe en cada upsert.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE clientes_pdv
ADD COLUMN IF NOT EXISTS id_distribuidor INTEGER REFERENCES distribuidores(id_distribuidor);

CREATE INDEX IF NOT EXISTS idx_clientes_pdv_dist
  ON clientes_pdv (id_distribuidor)
  WHERE id_distribuidor IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. RPC fn_reconcile_exhibiciones
--    Corre al final de cada ingesta del Padrón.
--    Rellena id_cliente_pdv en exhibiciones donde el cliente ya existe pero
--    el link estaba vacío (clientes subidos "en el limbo" entre actualizaciones).
--    Devuelve { updated: <n> }
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_reconcile_exhibiciones(p_dist_id INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE exhibiciones e
  SET    id_cliente_pdv = cp.id_cliente
  FROM   clientes_pdv cp
  WHERE  cp.id_distribuidor = p_dist_id
    AND  e.id_distribuidor  = p_dist_id
    AND  e.id_cliente_pdv   IS NULL
    AND  e.id_cliente        IS NOT NULL
    AND  e.id_cliente        = cp.id_cliente_erp;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN json_build_object('updated', v_updated);
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- Resumen de cambios:
--   integrantes_grupo.id_vendedor  → FK a vendedores.id_vendedor (nullable)
--   clientes_pdv.es_limbo          → true si el cliente no está en el padrón
--   clientes_pdv.id_distribuidor   → desnormalizado para queries directas
--   fn_reconcile_exhibiciones()    → RPC que llena id_cliente_pdv retroactivamente
-- ──────────────────────────────────────────────────────────────────────────
