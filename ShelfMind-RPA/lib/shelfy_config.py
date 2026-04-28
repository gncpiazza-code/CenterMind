# -*- coding: utf-8 -*-
"""
Resolución de URL y clave de la API Shelfy para RPA: variables de entorno, Vault, defaults.

Orden (URL):
  1. SHELFY_API_URL, SHELFY_BASE_URL, API_URL, BACKEND_URL, PUBLIC_API_URL
  2. Secreto vault: shelfy_api_url
  3. https://api.shelfycenter.com  (producción por defecto)

Orden (clave):
  1. SHELFY_API_KEY, SHELFY_KEY, RPA_API_KEY
  2. Secreto vault: shelfy_api_key
"""
from __future__ import annotations

import os

from lib.vault_client import get_secret

# URL pública de producción (mismo default que en CLAUDE.md / despliegues típicos)
_DEFAULT_PUBLIC_API = "https://api.shelfycenter.com"

_URL_ENV_KEYS = (
    "SHELFY_API_URL",
    "SHELFY_BASE_URL",
    "API_URL",
    "BACKEND_URL",
    "PUBLIC_API_URL",
)

_KEY_ENV_KEYS = (
    "SHELFY_API_KEY",
    "SHELFY_KEY",
    "RPA_API_KEY",
)


def get_shelfy_base_url() -> str:
    for k in _URL_ENV_KEYS:
        v = os.environ.get(k) or os.environ.get(k.lower())
        if v and str(v).strip():
            return str(v).rstrip("/")
    v = get_secret("shelfy_api_url")
    if v and str(v).strip():
        return str(v).rstrip("/")
    return _DEFAULT_PUBLIC_API


def get_shelfy_api_key() -> str:
    for k in _KEY_ENV_KEYS:
        v = os.environ.get(k) or os.environ.get(k.lower())
        if v and str(v).strip():
            return str(v).strip()
    return (get_secret("shelfy_api_key") or "").strip()
