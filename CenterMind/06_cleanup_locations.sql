-- ==========================================
-- SCRIPT LIMPIEZA TABLA LOCATIONS (OBSOLETA)
-- Ejecutar en SQL Editor de Supabase
-- ==========================================

-- 1. Quitar dependencias de la tabla clientes
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_location_id_fkey;
ALTER TABLE public.clientes DROP COLUMN IF EXISTS location_id;

-- 2. Quitar dependencias de la tabla integrantes_grupo
ALTER TABLE public.integrantes_grupo DROP CONSTRAINT IF EXISTS integrantes_grupo_location_id_fkey;
ALTER TABLE public.integrantes_grupo DROP COLUMN IF EXISTS location_id;

-- 3. Quitar la tabla locations y cualquier vista/dependencia en cascada
DROP TABLE IF EXISTS public.locations CASCADE;

-- FINAL. Ya hemos migrado a erp_sucursales, así que el diagrama de Supabase debería verse más limpio ahora y sin "locations".
