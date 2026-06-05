-- Migración: tabla objetivo_jobs para creación async de objetivos
-- 2026-06-05

CREATE TABLE IF NOT EXISTS objetivo_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_objetivo TEXT NOT NULL,
    id_distribuidor INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pending'
        CHECK (estado IN ('pending', 'running', 'done', 'error')),
    paso INTEGER NOT NULL DEFAULT 0,
    pct INTEGER NOT NULL DEFAULT 0 CHECK (pct >= 0 AND pct <= 100),
    mensaje TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_objetivo_jobs_id_objetivo ON objetivo_jobs(id_objetivo);
CREATE INDEX IF NOT EXISTS idx_objetivo_jobs_estado ON objetivo_jobs(estado);
CREATE INDEX IF NOT EXISTS idx_objetivo_jobs_dist_estado ON objetivo_jobs(id_distribuidor, estado);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_objetivo_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_objetivo_jobs_updated_at ON objetivo_jobs;
CREATE TRIGGER trg_objetivo_jobs_updated_at
    BEFORE UPDATE ON objetivo_jobs
    FOR EACH ROW EXECUTE FUNCTION update_objetivo_jobs_updated_at();
