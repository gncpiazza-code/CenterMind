-- Objetivos v9: DB hardening for multi-PDV objectives
-- Run in Supabase SQL Editor

-- 1. objetivos: add new columns if not exist
ALTER TABLE objetivos ADD COLUMN IF NOT EXISTS resultado_final TEXT;
ALTER TABLE objetivos ADD COLUMN IF NOT EXISTS id_objetivo_padre UUID REFERENCES objetivos(id);
ALTER TABLE objetivos ADD COLUMN IF NOT EXISTS kanban_phase TEXT;

-- 2. objetivo_items: ensure updated_at exists
ALTER TABLE objetivo_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. objetivo_items: enforce UNIQUE constraint on (id_objetivo, id_cliente_pdv)
ALTER TABLE objetivo_items
ADD CONSTRAINT IF NOT EXISTS objetivo_items_unique_pdv
UNIQUE (id_objetivo, id_cliente_pdv);

-- 4. objetivo_items: performance indexes
CREATE INDEX IF NOT EXISTS idx_objetivo_items_id_objetivo    ON objetivo_items(id_objetivo);
CREATE INDEX IF NOT EXISTS idx_objetivo_items_id_distribuidor ON objetivo_items(id_distribuidor);
CREATE INDEX IF NOT EXISTS idx_objetivo_items_id_cliente_pdv  ON objetivo_items(id_cliente_pdv);
CREATE INDEX IF NOT EXISTS idx_objetivo_items_estado_item     ON objetivo_items(estado_item);

-- 5. objetivos_tracking: composite index for timeline queries
CREATE INDEX IF NOT EXISTS idx_objetivos_tracking_obj_created
ON objetivos_tracking(id_objetivo, created_at DESC);

-- 6. objetivos: index on id_objetivo_padre for re-schedule chains
CREATE INDEX IF NOT EXISTS idx_objetivos_padre
ON objetivos(id_objetivo_padre)
WHERE id_objetivo_padre IS NOT NULL;
