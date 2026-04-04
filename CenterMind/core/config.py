# -*- coding: utf-8 -*-
"""
Configuración central: constantes, secretos y flags.
Leer siempre desde variables de entorno; los defaults son solo para desarrollo local.
"""
import os

# ── Fix: PostgreSQL setea REQUESTS_CA_BUNDLE a un path inválido en Windows. ────
try:
    import certifi as _certifi
    os.environ["REQUESTS_CA_BUNDLE"] = _certifi.where()
    os.environ["SSL_CERT_FILE"]      = _certifi.where()
except ImportError:
    pass

# API Key — para bots, RPA y scripts
API_KEY = os.environ.get("SHELFY_API_KEY", "shelfy-clave-2025")

# JWT para el frontend React
JWT_SECRET       = os.environ.get("SHELFY_JWT_SECRET", "shelfy-jwt-secret-dev-2025")
JWT_ALGORITHM    = "HS256"
JWT_EXPIRE_HOURS = 8

# URL pública del servidor (para webhooks Telegram)
WEBHOOK_URL = os.environ.get("WEBHOOK_URL")

# Offset UTC → America/Argentina (UTC-3, sin DST)
AR_OFFSET = "-3 hours"

# CORS — orígenes permitidos
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://shelfycenter.vercel.app",
    "https://shelfy.vercel.app",
]

# JWT library — opcional; si no está instalada /auth/login no estará disponible
try:
    from jose import JWTError, jwt as _jwt
    JWT_AVAILABLE = True
except ImportError:
    JWT_AVAILABLE = False
    JWTError       = Exception  # type: ignore[assignment,misc]
    _jwt           = None       # type: ignore[assignment]
