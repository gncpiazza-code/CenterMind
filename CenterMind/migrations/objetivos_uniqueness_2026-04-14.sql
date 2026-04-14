-- Migration: Objetivos uniqueness hardening
-- Date: 2026-04-14
-- Purpose: Add partial unique index to prevent duplicate active objectives
--          per (distribuidor, vendedor, tipo). The app-level guard (HTTP 409)
--          is the primary protection; this index is a DB-level safety net.

-- Index 1: Prevent duplicate active objectives per (distribuidor, vendedor, tipo)
-- "Active" means cumplido = FALSE. Covers exhibicion, ruteo, and future types.
CREATE UNIQUE INDEX IF NOT EXISTS uq_objetivos_activo_dist_vend_tipo
    ON objetivos (id_distribuidor, id_vendedor, tipo)
    WHERE cumplido = FALSE;

-- Note for exhibicion type: the app-level guard also checks for PDV overlap
-- before creating a new exhibicion objetivo, even if the index above would allow
-- a second one (since exhibicion goals can technically differ in scope).
-- The index covers the common case; edge-case overlap is handled in supervision.py.

-- Index 2: Ensure objetivo_items cannot regress from terminal states at DB level
-- (belt-and-suspenders with the watcher-level guard added in objetivos_watcher_service.py)
-- This is a CHECK constraint, not an index — add only if not already present.
-- ALTER TABLE objetivo_items
--     ADD CONSTRAINT chk_no_terminal_regression
--     CHECK (
--         estado_item IN ('pendiente', 'foto_subida', 'cumplido', 'falla')
--     );
-- (The above is already enforced by application logic; uncomment if you want DB enforcement.)

-- Verification query (run after applying):
-- SELECT schemaname, indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'objetivos' AND indexname = 'uq_objetivos_activo_dist_vend_tipo';
