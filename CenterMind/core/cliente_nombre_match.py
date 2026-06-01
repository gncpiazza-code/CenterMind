# -*- coding: utf-8 -*-
"""Cruce nombre padrón ↔ Informe de Ventas (nomcli) por id_cliente_erp."""
from __future__ import annotations

import re
import unicodedata


def norm_cliente_nombre(s: str | None) -> str:
    if not s:
        return ""
    t = str(s).strip().upper()
    t = "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^A-Z0-9 ]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def cliente_nombre_coincide_padron(
    nombre_informe: str | None,
    *,
    nombre_fantasia: str | None = None,
    nombre_razon_social: str | None = None,
) -> bool:
    """
    True si el nombre del informe corresponde al PDV del padrón.
    Evita aplicar ventas del ERP 509 de un comercio distinto al del padrón.
    """
    ni = norm_cliente_nombre(nombre_informe)
    if not ni:
        return False
    candidatos = [
        norm_cliente_nombre(nombre_fantasia),
        norm_cliente_nombre(nombre_razon_social),
    ]
    candidatos = [c for c in candidatos if c]
    if not candidatos:
        return False
    for cp in candidatos:
        if ni == cp:
            return True
        if len(ni) >= 4 and len(cp) >= 4 and (ni in cp or cp in ni):
            return True
        tokens_i = [t for t in ni.split() if len(t) >= 3]
        tokens_p = [t for t in cp.split() if len(t) >= 3]
        if tokens_i and tokens_p and all(t in tokens_p for t in tokens_i):
            return True
        if tokens_i and tokens_p and all(t in tokens_i for t in tokens_p):
            return True
    return False
