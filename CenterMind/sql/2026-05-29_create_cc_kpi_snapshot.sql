-- Snapshot diario de KPIs de cuentas corrientes por vendedor.
-- Escrito por _enrich_and_store_cc tras cada sync de CC (07:00 / 14:30 AR).
-- Historial por corrida: ver 2026-05-29_cc_kpi_snapshot_per_corrida.sql (insert por sync, no upsert diario).

CREATE TABLE IF NOT EXISTS cc_kpi_snapshot (
    id               BIGSERIAL PRIMARY KEY,
    id_distribuidor  INTEGER      NOT NULL,
    -- NULL = fila global (toda la distribuidora)
    id_vendedor      INTEGER      NULL,
    fecha_snapshot   DATE         NOT NULL,
    total_deuda      NUMERIC      NOT NULL DEFAULT 0,
    clientes_deudores INTEGER     NOT NULL DEFAULT 0,
    pdvs_atraso_15   INTEGER      NOT NULL DEFAULT 0,
    dias_promedio_atraso NUMERIC  NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_cc_kpi_snapshot
        UNIQUE (id_distribuidor, id_vendedor, fecha_snapshot)
);

-- Índice principal para leer las 2 últimas fechas por vendedor.
CREATE INDEX IF NOT EXISTS idx_cc_kpi_snapshot_dist_vend_fecha
    ON cc_kpi_snapshot (id_distribuidor, id_vendedor, fecha_snapshot DESC);
