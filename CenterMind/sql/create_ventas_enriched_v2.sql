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
