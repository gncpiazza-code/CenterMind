-- Sesiones multi-paso del bot (foto → NRO CLIENTE → tipo PDV).
-- Sobreviven redeploy de la API; TTL ~10 min (limpieza en bot + expires_at).

CREATE TABLE IF NOT EXISTS bot_upload_sessions (
    id_distribuidor   INTEGER NOT NULL,
    telegram_user_id  BIGINT  NOT NULL,
    payload           JSONB   NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id_distribuidor, telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_bot_upload_sessions_expires
    ON bot_upload_sessions (expires_at);

COMMENT ON TABLE bot_upload_sessions IS
    'Estado de carga de exhibición por vendedor Telegram (foto + NRO + tipo PDV).';
