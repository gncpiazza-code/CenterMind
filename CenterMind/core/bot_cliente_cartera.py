# -*- coding: utf-8 -*-
"""
core/bot_cliente_cartera.py
============================
Validación de cartera del vendedor para el bot Telegram.

Determina si un NRO de cliente (ERP) pertenece a la cartera de rutas
asignadas al vendedor. Sin cache — consulta en vivo para reflejar el
padrón más reciente.
"""
from __future__ import annotations

import logging
from typing import Any

from core.tenant_tables import tenant_table_name

logger = logging.getLogger("bot_cliente_cartera")


def normalize_erp(erp_str: Any) -> str:
    """
    Normaliza id_cliente_erp: quita .0 de float, espacios y ceros a la izquierda.
    Retorna "0" si queda vacío.
    """
    if erp_str is None:
        return "0"
    s = str(erp_str).strip()
    if not s:
        return "0"
    if s.endswith(".0"):
        s = s[:-2]
    return (s.lstrip("0") or "0")


def cliente_en_cartera_vendedor(
    dist_id: int,
    id_vendedor_v2: int,
    erp_str: str,
    sb_client,
) -> bool:
    """
    Retorna True si el cliente ERP está en alguna ruta asignada al vendedor.

    Pasos:
    1. Obtener rutas del vendedor en rutas_v2_d{dist_id}.
    2. Buscar el ERP en clientes_pdv_v2_d{dist_id} filtrando por esas rutas.
    3. Si no se encuentra, consultar matcheo_rutas_excepciones (franquiciados).

    En caso de error de infra retorna False (fail-open; el flujo legacy sigue).
    """
    erp_norm = normalize_erp(erp_str)

    try:
        # 1. Rutas del vendedor
        t_rutas = tenant_table_name("rutas_v2", dist_id)
        # rutas_v2_d* no tiene id_distribuidor (tabla ya es por tenant)
        rutas_res = (
            sb_client.table(t_rutas)
            .select("id_ruta")
            .eq("id_vendedor", id_vendedor_v2)
            .execute()
        )
        ruta_ids = [r["id_ruta"] for r in (rutas_res.data or []) if r.get("id_ruta")]

        if not ruta_ids:
            return False

        # 2. Buscar cliente en esas rutas (en chunks de 100 si hace falta)
        t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
        for offset in range(0, len(ruta_ids), 100):
            chunk = ruta_ids[offset: offset + 100]
            cli_res = (
                sb_client.table(t_clientes)
                .select("id_cliente")
                .eq("id_distribuidor", dist_id)
                .eq("id_cliente_erp", erp_norm)
                .in_("id_ruta", chunk)
                .limit(1)
                .execute()
            )
            if cli_res.data:
                return True

        # Fallback: intentar sin normalización (por si el padrón guarda con ceros)
        erp_raw = str(erp_str).strip()
        if erp_raw != erp_norm:
            for offset in range(0, len(ruta_ids), 100):
                chunk = ruta_ids[offset: offset + 100]
                cli_res = (
                    sb_client.table(t_clientes)
                    .select("id_cliente")
                    .eq("id_distribuidor", dist_id)
                    .eq("id_cliente_erp", erp_raw)
                    .in_("id_ruta", chunk)
                    .limit(1)
                    .execute()
                )
                if cli_res.data:
                    return True

        # 3. Excepción franquiciados en matcheo_rutas_excepciones
        exc_res = (
            sb_client.table("matcheo_rutas_excepciones")
            .select("id")
            .eq("id_distribuidor", dist_id)
            .eq("id_cliente_erp", erp_norm)
            .limit(1)
            .execute()
        )
        if exc_res.data:
            return True

        return False

    except Exception as e:
        logger.warning(
            f"[CarteraBot] Error validando dist={dist_id} vendedor={id_vendedor_v2} "
            f"erp={erp_str}: {e}"
        )
        return False


def get_pdv_display_row(dist_id: int, erp_str: str, sb_client) -> dict:
    """
    Busca datos completos del PDV en clientes_pdv_v2 y enriquece con
    dia_semana de rutas_v2. Retorna {} si no existe.
    """
    erp_norm = normalize_erp(erp_str)
    try:
        t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
        res = (
            sb_client.table(t_clientes)
            .select("id_cliente, nombre_fantasia, nombre_razon_social, domicilio, localidad, fecha_alta, id_ruta")
            .eq("id_distribuidor", dist_id)
            .eq("id_cliente_erp", erp_norm)
            .limit(1)
            .execute()
        )
        if not res.data:
            return {}

        row = dict(res.data[0])

        # Enriquecer con dia_semana de la ruta
        if row.get("id_ruta"):
            t_rutas = tenant_table_name("rutas_v2", dist_id)
            ruta_res = (
                sb_client.table(t_rutas)
                .select("dia_semana")
                .eq("id_ruta", row["id_ruta"])
                .limit(1)
                .execute()
            )
            if ruta_res.data:
                row["dia_semana"] = ruta_res.data[0].get("dia_semana")

        return row

    except Exception as e:
        logger.warning(f"[CarteraBot] get_pdv_display_row dist={dist_id} erp={erp_str}: {e}")
        return {}
