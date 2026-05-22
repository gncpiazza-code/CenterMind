-- Tabla de auditoría para re-evaluaciones de compañía sobre exhibiciones ya evaluadas.
-- Tabla global (no por tenant): columna id_distribuidor obligatoria.
-- NO modifica exhibiciones.estado → los KPIs/ranking del distribuidor quedan intactos.

CREATE TABLE IF NOT EXISTS exhibicion_reevaluacion_compania (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_exhibicion INT NOT NULL,
    id_distribuidor INT NOT NULL,
    estado_anterior TEXT NOT NULL,
    estado_nuevo TEXT NOT NULL CHECK (estado_nuevo IN ('Aprobada', 'Rechazada', 'Destacada')),
    motivo TEXT NOT NULL CHECK (char_length(motivo) >= 20),
    id_usuario INT,
    nombre_usuario TEXT NOT NULL DEFAULT '',
    rol_usuario TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice principal: batch lookup por distribuidor + set de exhibiciones (galería, ranking)
CREATE INDEX IF NOT EXISTS idx_reevalcomp_dist_ex
    ON exhibicion_reevaluacion_compania (id_distribuidor, id_exhibicion);

-- Índice para historial cronológico por distribuidor
CREATE INDEX IF NOT EXISTS idx_reevalcomp_dist_date
    ON exhibicion_reevaluacion_compania (id_distribuidor, created_at DESC);

-- RLS: solo service_role puede escribir/leer (FastAPI usa service_role)
ALTER TABLE exhibicion_reevaluacion_compania ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON exhibicion_reevaluacion_compania
    FOR ALL TO service_role USING (true) WITH CHECK (true);
