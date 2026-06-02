# -*- coding: utf-8 -*-
"""
Constantes y helpers de roles para Shelfy.

'directorio' es el nombre histórico del rol; 'compania' es el nombre canónico.
Durante la ventana de compatibilidad (1 release) ambos se tratan como equivalentes
mediante normalize_rol().
"""

ROL_COMPANIA = "compania"
ROL_SUPERADMIN = "superadmin"
ROLES_COMPANIA_SCOPE = frozenset({"superadmin", "compania"})


def normalize_rol(rol: str) -> str:
    """Normaliza 'directorio' → 'compania' para compat con JWT legacy.

    Todos los demás roles pasan sin cambio (en minúsculas).
    """
    normalized = (rol or "").lower()
    if normalized == "directorio":
        return ROL_COMPANIA
    return normalized
