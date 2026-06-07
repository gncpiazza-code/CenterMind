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
def _normalize_webhook_url(raw: str | None) -> str | None:
    if not raw:
        return None
    u = raw.strip().rstrip("/")
    if not u:
        return None
    if not u.startswith("http://") and not u.startswith("https://"):
        u = f"https://{u}"
    return u


WEBHOOK_URL = _normalize_webhook_url(os.environ.get("WEBHOOK_URL"))

# Offset UTC → America/Argentina (UTC-3, sin DST)
AR_OFFSET = "-3 hours"

# CORS — orígenes permitidos
_CORS_ORIGINS_BASE = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "https://shelfycenter.com",
    "https://www.shelfycenter.com",
    "https://shelfycenter.vercel.app",
    "https://shelfy.vercel.app",
    # Alias estable de preview para branch development.
    "https://center-mind-git-development-gncpiazza-codes-projects.vercel.app",
]
_extra = os.environ.get("CORS_ORIGINS_EXTRA", "")
CORS_ORIGINS = _CORS_ORIGINS_BASE + [
    o.strip() for o in _extra.split(",") if o.strip()
]

# Regex: previews Vercel + dominio canónico (sin wildcard de subdominios arbitrarios).
CORS_ALLOW_ORIGIN_REGEX = (
    r"^https://center-mind-[a-z0-9-]+-gncpiazza-codes-projects\.vercel\.app$"
    r"|^https://(www\.)?shelfycenter\.com$"
)

# JWT library — opcional; si no está instalada /auth/login no estará disponible
try:
    import jwt as _jwt
    from jwt.exceptions import PyJWTError as JWTError
    JWT_AVAILABLE = True
except ImportError:
    JWT_AVAILABLE = False
    JWTError       = Exception  # type: ignore[assignment,misc]
    _jwt           = None       # type: ignore[assignment]
