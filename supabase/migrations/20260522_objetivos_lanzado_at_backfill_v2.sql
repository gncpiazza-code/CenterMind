-- Migration: backfill lanzado_at v2 — cubrir objetivos legacy ya lanzados pero sin lanzado_at

-- 1. Backfill desde tracking: objetivos que recibieron notificación Telegram
UPDATE objetivos o
SET lanzado_at = COALESCE(
    (
        SELECT MIN(ot.created_at)
        FROM objetivos_tracking ot
        WHERE ot.id_objetivo = o.id
          AND ot.tipo_evento = 'telegram_objetivo_asignado'
    ),
    o.created_at
)
WHERE o.lanzado_at IS NULL
  AND o.cumplido = false
  AND EXISTS (
      SELECT 1
      FROM objetivos_tracking ot
      WHERE ot.id_objetivo = o.id
        AND ot.tipo_evento = 'telegram_objetivo_asignado'
  );

-- 2. Backfill por antigüedad: objetivos legacy sin tracking pero con fecha_inicio ya pasada
--    Cutoff = 2026-05-22 (deploy de la feature de planificados)
--    Excluir tipo=ruteo (esos sí pueden ser planificados con fecha futura)
UPDATE objetivos
SET lanzado_at = created_at
WHERE lanzado_at IS NULL
  AND cumplido = false
  AND tipo != 'ruteo'
  AND fecha_inicio <= CURRENT_DATE
  AND created_at < '2026-05-22 00:00:00+00'::timestamptz;
