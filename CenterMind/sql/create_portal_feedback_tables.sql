-- Ejecutar en Supabase SQL editor (PostgreSQL).
-- Métricas de lectura del comunicado CC + DIFusión (iframe guiá).

CREATE TABLE IF NOT EXISTS portal_guia_cc_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    id_usuario INTEGER NOT NULL,
    id_distribuidor INTEGER,
    usuario_snapshot TEXT,
    scroll_max_pct INTEGER NOT NULL DEFAULT 0 CHECK (scroll_max_pct >= 0 AND scroll_max_pct <= 100),
    active_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
    guia_version TEXT,
    cerrado_modal BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_portal_guia_events_created
    ON portal_guia_cc_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_guia_events_user
    ON portal_guia_cc_events (id_usuario);

-- Tickets / mensajes al desarrollador (respuesta solo superadmin vía portal).

CREATE TABLE IF NOT EXISTS portal_feedback_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    id_usuario INTEGER NOT NULL,
    id_distribuidor INTEGER,
    usuario_snapshot TEXT,
    rol_snapshot TEXT,
    contenido TEXT NOT NULL,
    respuesta TEXT,
    responded_at TIMESTAMPTZ,
    id_usuario_respuesta INTEGER
);

CREATE INDEX IF NOT EXISTS idx_portal_feedback_created
    ON portal_feedback_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_feedback_respuesta_null
    ON portal_feedback_messages (created_at DESC)
    WHERE respuesta IS NULL;

COMMENT ON TABLE portal_guia_cc_events IS 'Telemetría lectura comunicado CC/Difusión (scroll %, tiempo activo).';
COMMENT ON TABLE portal_feedback_messages IS 'Mensajes de usuarios del portal al desarrollador / superadmin.';

