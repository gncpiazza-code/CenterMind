-- Migration: Plantillas de difusión por usuario
-- Tabla para que cada usuario del portal guarde sus plantillas de mensaje reutilizables.

CREATE TABLE IF NOT EXISTS difusion_plantilla_usuario (
  id bigserial PRIMARY KEY,
  id_usuario bigint NOT NULL REFERENCES usuarios_portal(id_usuario) ON DELETE CASCADE,
  titulo text NOT NULL,
  cuerpo text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_difusion_plantilla_usuario_id ON difusion_plantilla_usuario(id_usuario);
