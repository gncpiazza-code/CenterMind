-- Capas de planificación de ruteo (estilo Google My Maps) — tenant-wide por id_distribuidor
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.mapa_capas_planificacion (
    id                BIGSERIAL PRIMARY KEY,
    id_distribuidor   INTEGER NOT NULL,
    id_vendedor       INTEGER NOT NULL,
    id_ruta_anclada   INTEGER,
    nombre            TEXT NOT NULL,
    geojson           JSONB NOT NULL,
    pdv_ids           INTEGER[] NOT NULL DEFAULT '{}',
    color             TEXT NOT NULL DEFAULT '#8b5cf6',
    orden             INTEGER NOT NULL DEFAULT 0,
    estado            TEXT NOT NULL DEFAULT 'activo'
                      CHECK (estado IN ('activo', 'archivado')),
    created_by        TEXT,
    updated_by        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mapa_capas_planificacion_dist_vend_idx
    ON public.mapa_capas_planificacion (id_distribuidor, id_vendedor);

CREATE INDEX IF NOT EXISTS mapa_capas_planificacion_dist_estado_idx
    ON public.mapa_capas_planificacion (id_distribuidor, estado);

COMMENT ON TABLE public.mapa_capas_planificacion IS
    'Polígonos de planificación de ruteo supervisión (My Maps). Anclaje referencial a rutas_v2.';
