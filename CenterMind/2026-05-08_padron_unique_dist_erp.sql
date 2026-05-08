-- ============================================================================
-- PADRON HOTFIX (2026-05-08)
-- Objetivo:
--   1) normalizar motivo legacy padron_absent -> padron_anulado
--   2) deduplicar clientes por clave de negocio (id_distribuidor,id_cliente_erp)
--   3) crear UNIQUE para soportar ON CONFLICT (id_distribuidor,id_cliente_erp)
--      en clientes_pdv_v2 y clientes_pdv_v2_d{dist}
--
-- Ejecutar en Supabase SQL Editor (una sola vez).
-- ============================================================================

-- 0) Legacy motivo_inactivo: unificar ausentes en "anulado operativo".
UPDATE public.clientes_pdv_v2
SET
  motivo_inactivo = 'padron_anulado',
  updated_at = NOW()
WHERE motivo_inactivo = 'padron_absent';

DO $$
DECLARE
  r RECORD;
  t TEXT;
BEGIN
  FOR r IN
    SELECT id_distribuidor::int AS dist_id
    FROM public.distribuidores
  LOOP
    t := format('clientes_pdv_v2_d%s', r.dist_id);
    EXECUTE format(
      'UPDATE public.%I
       SET motivo_inactivo = ''padron_anulado'',
           updated_at = NOW()
       WHERE motivo_inactivo = ''padron_absent''',
      t
    );
  END LOOP;
END $$;

-- 1) Deduplicar en tabla base por (id_distribuidor, id_cliente_erp)
--    Conserva fila más reciente por updated_at, luego id_cliente más alto.
WITH ranked AS (
  SELECT
    id_cliente,
    ROW_NUMBER() OVER (
      PARTITION BY id_distribuidor, id_cliente_erp
      ORDER BY updated_at DESC NULLS LAST, id_cliente DESC
    ) AS rn
  FROM public.clientes_pdv_v2
  WHERE id_distribuidor IS NOT NULL
    AND id_cliente_erp IS NOT NULL
    AND btrim(id_cliente_erp) <> ''
),
to_delete AS (
  SELECT id_cliente FROM ranked WHERE rn > 1
)
DELETE FROM public.clientes_pdv_v2 b
USING to_delete d
WHERE b.id_cliente = d.id_cliente;

-- 2) Deduplicar en particiones tenant por (id_distribuidor, id_cliente_erp)
DO $$
DECLARE
  r RECORD;
  t TEXT;
BEGIN
  FOR r IN
    SELECT id_distribuidor::int AS dist_id
    FROM public.distribuidores
  LOOP
    t := format('clientes_pdv_v2_d%s', r.dist_id);
    EXECUTE format($sql$
      WITH ranked AS (
        SELECT
          id_cliente,
          ROW_NUMBER() OVER (
            PARTITION BY id_distribuidor, id_cliente_erp
            ORDER BY updated_at DESC NULLS LAST, id_cliente DESC
          ) AS rn
        FROM public.%I
        WHERE id_distribuidor IS NOT NULL
          AND id_cliente_erp IS NOT NULL
          AND btrim(id_cliente_erp) <> ''
      ),
      to_delete AS (
        SELECT id_cliente FROM ranked WHERE rn > 1
      )
      DELETE FROM public.%I b
      USING to_delete d
      WHERE b.id_cliente = d.id_cliente
      $sql$, t, t
    );
  END LOOP;
END $$;

-- 3) UNIQUE índice base para ON CONFLICT (id_distribuidor,id_cliente_erp)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cli_v2_dist_erp
  ON public.clientes_pdv_v2 (id_distribuidor, id_cliente_erp)
  WHERE id_distribuidor IS NOT NULL
    AND id_cliente_erp IS NOT NULL
    AND btrim(id_cliente_erp) <> '';

-- 4) UNIQUE índice tenant para ON CONFLICT (id_distribuidor,id_cliente_erp)
DO $$
DECLARE
  r RECORD;
  t TEXT;
  idx TEXT;
BEGIN
  FOR r IN
    SELECT id_distribuidor::int AS dist_id
    FROM public.distribuidores
  LOOP
    t := format('clientes_pdv_v2_d%s', r.dist_id);
    idx := format('uq_cli_v2_d%s_dist_erp', r.dist_id);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I
       ON public.%I (id_distribuidor, id_cliente_erp)
       WHERE id_distribuidor IS NOT NULL
         AND id_cliente_erp IS NOT NULL
         AND btrim(id_cliente_erp) <> ''''',
      idx, t
    );
  END LOOP;
END $$;

-- 5) Verificación rápida
-- Debe devolver 0 filas:
-- SELECT id_distribuidor, id_cliente_erp, COUNT(*)
-- FROM public.clientes_pdv_v2
-- WHERE id_distribuidor IS NOT NULL
--   AND id_cliente_erp IS NOT NULL
--   AND btrim(id_cliente_erp) <> ''
-- GROUP BY 1,2
-- HAVING COUNT(*) > 1;

-- Conteo residual de legacy absent (esperado: 0):
-- SELECT COUNT(*) FROM public.clientes_pdv_v2 WHERE motivo_inactivo = 'padron_absent';
