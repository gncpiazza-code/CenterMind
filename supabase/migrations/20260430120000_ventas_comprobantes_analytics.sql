-- Ventas CHESS — snapshot de análisis (JSON de extracción / KPIs + agregados)
-- Ejecutar en Supabase SQL Editor o vía CLI: supabase db push
-- Multitenant: todas las filas llevan id_distribuidor (no hay tablas físicas por tenant).

-- Snapshot por corrida (un insert cada vez que se materializa el análisis)
CREATE TABLE IF NOT EXISTS public.ventas_comprobantes_analytics_runs (
    id                    BIGSERIAL PRIMARY KEY,
    id_distribuidor       BIGINT NOT NULL REFERENCES public.distribuidores (id_distribuidor) ON DELETE CASCADE,
    tenant_id             TEXT NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_rango_desde     DATE,
    fecha_rango_hasta     DATE,
    archivo_resumen       TEXT,
    archivo_detallado     TEXT,
    kpi_recaudacion       NUMERIC(20, 4),
    kpi_facturado_ctacte  NUMERIC(20, 4),
    kpi_suma_recibos      NUMERIC(20, 4),
    kpi_suma_fc_contado   NUMERIC(20, 4),
    filas_resumen_activas INTEGER,
    por_comprobante_tipo  JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_financiero        JSONB NOT NULL DEFAULT '{}'::jsonb,
    validacion_fcvtas     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_vca_runs_dist_created
    ON public.ventas_comprobantes_analytics_runs (id_distribuidor, created_at DESC);

COMMENT ON TABLE public.ventas_comprobantes_analytics_runs IS
    'Una fila por ejecución del análisis resumen+detallado CHESS (KPIs y JSON crudo).';

-- Agregados por dimensión (mismo run_id; código + descripción siempre en par)
CREATE TABLE IF NOT EXISTS public.ventas_comprobantes_agg_vendedor (
    id                BIGSERIAL PRIMARY KEY,
    run_id            BIGINT NOT NULL REFERENCES public.ventas_comprobantes_analytics_runs (id) ON DELETE CASCADE,
    id_distribuidor   BIGINT NOT NULL REFERENCES public.distribuidores (id_distribuidor) ON DELETE CASCADE,
    vendedor_codigo   TEXT NOT NULL DEFAULT '',
    vendedor_desc     TEXT,
    total_dolares     NUMERIC(20, 4) NOT NULL DEFAULT 0,
    total_bultos      NUMERIC(20, 8) NOT NULL DEFAULT 0,
    UNIQUE (run_id, vendedor_codigo)
);

CREATE TABLE IF NOT EXISTS public.ventas_comprobantes_agg_articulo (
    id                 BIGSERIAL PRIMARY KEY,
    run_id             BIGINT NOT NULL REFERENCES public.ventas_comprobantes_analytics_runs (id) ON DELETE CASCADE,
    id_distribuidor    BIGINT NOT NULL REFERENCES public.distribuidores (id_distribuidor) ON DELETE CASCADE,
    articulo_codigo    TEXT NOT NULL DEFAULT '',
    articulo_desc      TEXT,
    total_dolares      NUMERIC(20, 4) NOT NULL DEFAULT 0,
    total_bultos       NUMERIC(20, 8) NOT NULL DEFAULT 0,
    UNIQUE (run_id, articulo_codigo)
);

CREATE TABLE IF NOT EXISTS public.ventas_comprobantes_agg_cliente (
    id                BIGSERIAL PRIMARY KEY,
    run_id            BIGINT NOT NULL REFERENCES public.ventas_comprobantes_analytics_runs (id) ON DELETE CASCADE,
    id_distribuidor   BIGINT NOT NULL REFERENCES public.distribuidores (id_distribuidor) ON DELETE CASCADE,
    cliente_codigo    TEXT NOT NULL DEFAULT '',
    cliente_razon     TEXT,
    total_dolares     NUMERIC(20, 4) NOT NULL DEFAULT 0,
    total_bultos      NUMERIC(20, 8) NOT NULL DEFAULT 0,
    UNIQUE (run_id, cliente_codigo)
);

CREATE TABLE IF NOT EXISTS public.ventas_comprobantes_agg_canal (
    id                BIGSERIAL PRIMARY KEY,
    run_id            BIGINT NOT NULL REFERENCES public.ventas_comprobantes_analytics_runs (id) ON DELETE CASCADE,
    id_distribuidor   BIGINT NOT NULL REFERENCES public.distribuidores (id_distribuidor) ON DELETE CASCADE,
    canal_codigo      TEXT NOT NULL DEFAULT '',
    canal_desc        TEXT,
    total_dolares     NUMERIC(20, 4) NOT NULL DEFAULT 0,
    total_bultos      NUMERIC(20, 8) NOT NULL DEFAULT 0,
    UNIQUE (run_id, canal_codigo)
);

CREATE TABLE IF NOT EXISTS public.ventas_comprobantes_agg_subcanal (
    id                 BIGSERIAL PRIMARY KEY,
    run_id             BIGINT NOT NULL REFERENCES public.ventas_comprobantes_analytics_runs (id) ON DELETE CASCADE,
    id_distribuidor    BIGINT NOT NULL REFERENCES public.distribuidores (id_distribuidor) ON DELETE CASCADE,
    subcanal_codigo    TEXT NOT NULL DEFAULT '',
    subcanal_desc      TEXT,
    total_dolares      NUMERIC(20, 4) NOT NULL DEFAULT 0,
    total_bultos       NUMERIC(20, 8) NOT NULL DEFAULT 0,
    UNIQUE (run_id, subcanal_codigo)
);

CREATE INDEX IF NOT EXISTS idx_vca_vend_run ON public.ventas_comprobantes_agg_vendedor (run_id);
CREATE INDEX IF NOT EXISTS idx_vca_art_run ON public.ventas_comprobantes_agg_articulo (run_id);
CREATE INDEX IF NOT EXISTS idx_vca_cli_run ON public.ventas_comprobantes_agg_cliente (run_id);
CREATE INDEX IF NOT EXISTS idx_vca_can_run ON public.ventas_comprobantes_agg_canal (run_id);
CREATE INDEX IF NOT EXISTS idx_vca_sub_run ON public.ventas_comprobantes_agg_subcanal (run_id);
