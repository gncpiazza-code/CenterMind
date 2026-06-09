-- Catálogo Consolido (padrón + informe ventas) ↔ id_distribuidor Shelfy.
-- Mantener alineado con CenterMind/core/rpa_tenant_registry.py
-- Tras editar: python scripts/sync_rpa_tenant_registry.py --apply

CREATE TABLE IF NOT EXISTS public.rpa_consolido_tenants (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    id_empresa TEXT NOT NULL,
    id_distribuidor INTEGER NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    orden INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rpa_consolido_tenants_activo_orden
    ON public.rpa_consolido_tenants (activo, orden);

CREATE INDEX IF NOT EXISTS idx_rpa_consolido_tenants_dist
    ON public.rpa_consolido_tenants (id_distribuidor);

INSERT INTO public.rpa_consolido_tenants
    (tenant_id, nombre, id_empresa, id_distribuidor, activo, orden)
VALUES
    ('tabaco',    'Tabaco & Hnos S.R.L.',              '3154', 3,  TRUE, 10),
    ('real',      'Real Tabacalera de Santiago S.A.',  '5597', 2,  TRUE, 20),
    ('aloma',     'Aloma Distribuidores Oficiales',    '3442', 4,  TRUE, 30),
    ('liver',     'Liver SRL',                         '3534', 5,  TRUE, 40),
    ('extra',     'GyG (Gomez Marcos Ariel)',          '3562', 6,  TRUE, 50),
    ('beltrocco', 'SILVINA RIBERO',                    '3559', 11, TRUE, 60),
    ('hugo_cena', 'CENA HUGO MARIO',                   '3561', 12, TRUE, 70),
    ('ippolibaz', 'Ippolibaz SAS',                     '3536', 13, TRUE, 75)
ON CONFLICT (tenant_id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    id_empresa = EXCLUDED.id_empresa,
    id_distribuidor = EXCLUDED.id_distribuidor,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden,
    updated_at = now();
