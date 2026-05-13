-- Ejecuta este script en el SQL Editor de Supabase
-- para agregar las nuevas columnas a cc_detalle

ALTER TABLE public.cc_detalle
ADD COLUMN IF NOT EXISTS deuda_7_dias numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS deuda_15_dias numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS deuda_30_dias numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS deuda_60_dias numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS deuda_mas_60_dias numeric(12,2) DEFAULT 0;
