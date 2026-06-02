-- Ejecutar en Supabase SQL Editor (una vez)
-- Migra el rol 'directorio' (nombre histórico) a 'compania' (nombre canónico del producto).
--
-- ROLLBACK:
--   UPDATE usuarios SET rol = 'directorio' WHERE rol = 'compania';
--   UPDATE roles_permisos SET rol = 'directorio' WHERE rol = 'compania';

UPDATE usuarios SET rol = 'compania' WHERE rol = 'directorio';
UPDATE roles_permisos SET rol = 'compania' WHERE rol = 'directorio';
