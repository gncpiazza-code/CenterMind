-- Tabla para ventas enriquecidas (Reporteador Genérico: Informe de Ventas)
CREATE TABLE IF NOT EXISTS public.ventas_enriched_v2 (
  id BIGSERIAL PRIMARY KEY,
  id_distribuidor BIGINT NOT NULL,
  tenant_id TEXT NOT NULL,
  fecha_factura DATE,
  fecha_pedido DATE,
  anulado BOOLEAN DEFAULT FALSE,
  tipo_documento TEXT,
  serie TEXT,
  numero_documento TEXT,
  id_cliente_erp TEXT,
  nombre_cliente TEXT,
  codigo_vendedor TEXT,
  nombre_vendedor TEXT,
  ruta TEXT,
  cod_articulo TEXT,
  descripcion_articulo TEXT,
  agrupacion_art_1 TEXT,
  agrupacion_art_2 TEXT,
  canal TEXT,
  subcanal TEXT,
  subcanal_mkt TEXT,
  bultos_total DOUBLE PRECISION DEFAULT 0,
  unidades_total DOUBLE PRECISION DEFAULT 0,
  importe_final DOUBLE PRECISION DEFAULT 0,
  importe_neto DOUBLE PRECISION DEFAULT 0,
  importe_bruto DOUBLE PRECISION DEFAULT 0,
  raw_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ventas_enriched_v2_doc_art
ON public.ventas_enriched_v2 (
  id_distribuidor,
  fecha_factura,
  numero_documento,
  id_cliente_erp,
  cod_articulo
);

CREATE INDEX IF NOT EXISTS idx_ventas_enriched_v2_dist_fecha
ON public.ventas_enriched_v2 (id_distribuidor, fecha_factura);

-- Tenant tables: ventas_enriched_v2_d{dist}
DO $$
DECLARE
  dist RECORD;
  tbl TEXT;
  idx_uniq TEXT;
  idx_fecha TEXT;
  dist_query TEXT;
BEGIN
  -- Compat: algunos entornos usan distribuidores.id, otros id_distribuidor.
  BEGIN
    PERFORM 1 FROM public.distribuidores LIMIT 1;
    dist_query := 'SELECT id_distribuidor::int AS dist_id FROM public.distribuidores';
    EXECUTE dist_query;
  EXCEPTION WHEN undefined_column THEN
    dist_query := 'SELECT id::int AS dist_id FROM public.distribuidores';
  END;

  FOR dist IN
    EXECUTE dist_query
  LOOP
    tbl := format('ventas_enriched_v2_d%s', dist.dist_id);
    idx_uniq := format('uq_%s_doc_art', tbl);
    idx_fecha := format('idx_%s_dist_fecha', tbl);

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I (LIKE public.ventas_enriched_v2 INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)',
      tbl
    );

    EXECUTE format(
      'INSERT INTO public.%I
       SELECT * FROM public.ventas_enriched_v2 src
       WHERE src.id_distribuidor = %s
       ON CONFLICT DO NOTHING',
      tbl, dist.dist_id
    );

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I
       ON public.%I (id_distribuidor, fecha_factura, numero_documento, id_cliente_erp, cod_articulo)',
      idx_uniq, tbl
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (id_distribuidor, fecha_factura)',
      idx_fecha, tbl
    );
  END LOOP;
END $$;
