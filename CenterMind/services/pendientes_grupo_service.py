# -*- coding: utf-8 -*-
"""
Agrupa filas de fn_pendientes en GrupoPendiente[] (vendedor + fotos[]).

Usado por GET /api/pendientes y snapshot bundle visor.
"""
from __future__ import annotations

import logging

from core.helpers import (
    _get_erp_name_map,
    build_integrante_to_erp_name,
    build_qa_exhibicion_integrante_ids,
    is_exhibicion_qa_display_for_dist,
    load_active_vendedor_ids,
    resolve_exhibicion_vendedor_display,
)
from core.tenant_tables import tenant_table_name
from db import sb

logger = logging.getLogger("pendientes_grupo_service")

# Alineado con GET /api/vendedores y evaluación en supervision.py
PENDIENTES_ESTADOS_DB = (
    "Pendiente",
    "pendiente",
    "Revisión",
    "revisión",
    "Revisión B",
    "revisión b",
    "Revisión A",
    "revisión a",
    "VALIDACION",
)

_EXH_PENDIENTES_SELECT = (
    "id_exhibicion,id_integrante,estado,timestamp_subida,url_foto_drive,"
    "telegram_msg_id,id_cliente_pdv,id_cliente,cliente_sombra_codigo"
)


def _fetch_pendientes_exhibiciones(dist_id: int) -> list[dict]:
    """
    Todas las pendientes del distribuidor (sin corte por mes), más antiguas primero.
    Reemplaza fn_pendientes (DESC + límite PostgREST dejaba fuera backlog del mes anterior).
    """
    PAGE = 1000
    raw: list[dict] = []
    offset = 0
    while True:
        batch = (
            sb.table("exhibiciones")
            .select(_EXH_PENDIENTES_SELECT)
            .eq("id_distribuidor", dist_id)
            .in_("estado", list(PENDIENTES_ESTADOS_DB))
            .order("timestamp_subida", desc=False)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        raw.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE

    integrante_ids: set[int] = set()
    for r in raw:
        iid = r.get("id_integrante")
        if iid is None:
            continue
        try:
            integrante_ids.add(int(iid))
        except (TypeError, ValueError):
            continue

    ig_names: dict[int, str] = {}
    ig_list = list(integrante_ids)
    for i in range(0, len(ig_list), 200):
        batch_ids = ig_list[i : i + 200]
        ig_res = (
            sb.table("integrantes_grupo")
            .select("id_integrante, nombre_integrante")
            .eq("id_distribuidor", dist_id)
            .in_("id_integrante", batch_ids)
            .execute()
        )
        for ig in ig_res.data or []:
            try:
                ig_names[int(ig["id_integrante"])] = (
                    ig.get("nombre_integrante") or "Vendedor S/N"
                )
            except (TypeError, ValueError, KeyError):
                continue

    rows: list[dict] = []
    for r in raw:
        ex_id = r.get("id_exhibicion")
        if not ex_id:
            continue
        iid = r.get("id_integrante")
        try:
            iid_i = int(iid) if iid is not None else None
        except (TypeError, ValueError):
            iid_i = None
        rows.append(
            {
                "id_exhibicion": ex_id,
                "vendedor": ig_names.get(iid_i, "Vendedor S/N") if iid_i else "Vendedor S/N",
                "nro_cliente": "0",
                "tipo_pdv": "S/D",
                "fecha_hora": r.get("timestamp_subida") or "",
                "drive_link": r.get("url_foto_drive") or "",
                "telegram_msg_id": r.get("telegram_msg_id"),
                "estado": r.get("estado"),
                "cliente_sombra_codigo": r.get("cliente_sombra_codigo"),
            }
        )
    return rows


def sort_pendientes_grupos(grupos: list[dict]) -> list[dict]:
    """Cola del visor: siempre la exhibición/grupo más antiguo primero."""
    return sorted(grupos, key=lambda g: (g.get("fecha_hora") or "", g.get("nro_cliente") or ""))


def build_pendientes_grupos(dist_id: int, hide_qa: bool = False) -> list[dict]:
    """Exhibiciones pendientes agrupadas por mensaje/cliente/día."""
    t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
    t_vendedores = tenant_table_name("vendedores_v2", dist_id)
    t_sucursales = tenant_table_name("sucursales_v2", dist_id)
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    rows = _fetch_pendientes_exhibiciones(dist_id)

    qa_ids = build_qa_exhibicion_integrante_ids(dist_id) if hide_qa else frozenset()
    erp_name_map = _get_erp_name_map(dist_id)
    integrante_to_erp = build_integrante_to_erp_name(dist_id)
    ex_to_int: dict[int, int | None] = {}
    if rows:
        ex_ids = [r.get("id_exhibicion") for r in rows if r.get("id_exhibicion")]
        if ex_ids:
            try:
                ex_map_res = (
                    sb.table("exhibiciones")
                    .select("id_exhibicion, id_integrante")
                    .eq("id_distribuidor", dist_id)
                    .in_("id_exhibicion", ex_ids)
                    .execute()
                )
                ex_to_int = {
                    r["id_exhibicion"]: r.get("id_integrante")
                    for r in (ex_map_res.data or [])
                }
            except Exception as _e_map:
                logger.warning(f"[pendientes] map id_integrante: {_e_map}")

        def _row_is_qa_exhibicion(row: dict) -> bool:
            ex_id = row.get("id_exhibicion")
            iid = ex_to_int.get(ex_id)
            tg_v = (row.get("vendedor") or "").strip()
            disp = resolve_exhibicion_vendedor_display(
                dist_id,
                iid,
                tg_v,
                integrante_to_erp=integrante_to_erp,
                erp_name_map=erp_name_map,
            )
            if iid is not None:
                try:
                    if int(iid) in qa_ids:
                        return True
                except (TypeError, ValueError):
                    pass
            if is_exhibicion_qa_display_for_dist(dist_id, tg_v):
                return True
            if is_exhibicion_qa_display_for_dist(dist_id, disp):
                return True
            return False

        rows = [r for r in rows if not _row_is_qa_exhibicion(r)]

    pendientes_sin_nro = [
        r.get("id_exhibicion")
        for r in rows
        if r.get("id_exhibicion") and (not r.get("nro_cliente") or r.get("nro_cliente") == "0")
    ]
    if pendientes_sin_nro:
        try:
            extra_res = (
                sb.table("exhibiciones")
                .select("id_exhibicion, id_cliente_pdv")
                .eq("id_distribuidor", dist_id)
                .in_("id_exhibicion", pendientes_sin_nro)
                .execute()
            )
            exh_cliente = {
                r["id_exhibicion"]: r.get("id_cliente_pdv")
                for r in (extra_res.data or [])
                if r.get("id_cliente_pdv")
            }
            nro_map = {}
            if exh_cliente:
                pdv_res = (
                    sb.table(t_clientes)
                    .select("id_cliente, id_cliente_erp")
                    .eq("id_distribuidor", dist_id)
                    .in_("id_cliente", list(set(exh_cliente.values())))
                    .execute()
                )
                pdv_erp = {r["id_cliente"]: r["id_cliente_erp"] for r in (pdv_res.data or [])}
                nro_map = {ex_id: pdv_erp[cid] for ex_id, cid in exh_cliente.items() if cid in pdv_erp}
            for r in rows:
                if not r.get("nro_cliente") or r.get("nro_cliente") == "0":
                    ex_id = r.get("id_exhibicion")
                    if ex_id in nro_map:
                        r["nro_cliente"] = nro_map[ex_id]
        except Exception as enrich_err:
            logger.error(f"Error en enriquecimiento nro_cliente: {enrich_err}")

    vendedor_sucursal_map: dict[str, str] = {}
    inactive_vendor_names: set[str] = set()
    try:
        vend_res = (
            sb.table(t_vendedores)
            .select("id_vendedor, nombre_erp, id_sucursal")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        active_ids = load_active_vendedor_ids(dist_id)
        suc_ids = list({
            r.get("id_sucursal")
            for r in (vend_res.data or [])
            if r.get("id_sucursal") is not None
        })
        suc_name_map: dict[int, str] = {}
        if suc_ids:
            suc_res = (
                sb.table(t_sucursales)
                .select("id_sucursal, nombre_erp")
                .eq("id_distribuidor", dist_id)
                .in_("id_sucursal", suc_ids)
                .execute()
            )
            suc_name_map = {
                r["id_sucursal"]: (r.get("nombre_erp") or "Sin sucursal")
                for r in (suc_res.data or [])
                if r.get("id_sucursal") is not None
            }
        for v in (vend_res.data or []):
            n = (v.get("nombre_erp") or "").strip().lower()
            if not n:
                continue
            vendedor_sucursal_map[n] = suc_name_map.get(v.get("id_sucursal"), "Sin sucursal")
            vid = v.get("id_vendedor")
            if active_ids and vid is not None:
                try:
                    if int(vid) not in active_ids:
                        inactive_vendor_names.add(n)
                except Exception:
                    continue
    except Exception as e_vs:
        logger.warning(f"[pendientes] vendedor->sucursal map fallback: {e_vs}")

    grupos: dict = {}
    all_ex_ids = [d.get("id_exhibicion") for d in rows if d.get("id_exhibicion")]
    ex_sucursal_map: dict[int, str] = {}

    if all_ex_ids:
        try:
            ex_nro_map = {
                int(d.get("id_exhibicion")): str(d.get("nro_cliente") or "").strip()
                for d in rows
                if d.get("id_exhibicion")
            }
            nro_vals = list({
                nro for nro in ex_nro_map.values()
                if nro and nro not in {"0", "S/C"}
            })

            nro_to_ruta: dict[str, int | None] = {}
            if nro_vals:
                cli_by_nro_res = (
                    sb.table(t_clientes)
                    .select("id_cliente_erp, id_ruta")
                    .eq("id_distribuidor", dist_id)
                    .in_("id_cliente_erp", nro_vals)
                    .execute()
                )
                for r in (cli_by_nro_res.data or []):
                    nro = str(r.get("id_cliente_erp") or "").strip()
                    if not nro or nro in nro_to_ruta:
                        continue
                    nro_to_ruta[nro] = r.get("id_ruta")

            ex_cli_res = (
                sb.table("exhibiciones")
                .select("id_exhibicion, id_cliente_pdv")
                .eq("id_distribuidor", dist_id)
                .in_("id_exhibicion", all_ex_ids)
                .execute()
            )
            ex_to_cli = {
                r["id_exhibicion"]: r.get("id_cliente_pdv")
                for r in (ex_cli_res.data or [])
                if r.get("id_exhibicion") and r.get("id_cliente_pdv")
            }
            cli_ids = list({cid for cid in ex_to_cli.values() if cid is not None})
            if cli_ids:
                cli_res = (
                    sb.table(t_clientes)
                    .select("id_cliente, id_ruta")
                    .eq("id_distribuidor", dist_id)
                    .in_("id_cliente", cli_ids)
                    .execute()
                )
                cli_to_ruta = {
                    r["id_cliente"]: r.get("id_ruta")
                    for r in (cli_res.data or [])
                    if r.get("id_cliente") is not None
                }
                ruta_ids = list({rid for rid in cli_to_ruta.values() if rid is not None})

                ruta_to_vendedor: dict[int, int] = {}
                if ruta_ids:
                    rutas_res = (
                        sb.table(t_rutas)
                        .select("id_ruta, id_vendedor")
                        .in_("id_ruta", ruta_ids)
                        .execute()
                    )
                    ruta_to_vendedor = {
                        r["id_ruta"]: r.get("id_vendedor")
                        for r in (rutas_res.data or [])
                        if r.get("id_ruta") is not None
                    }

                vendedor_ids = list({vid for vid in ruta_to_vendedor.values() if vid is not None})
                vendedor_to_sucursal: dict[int, int] = {}
                if vendedor_ids:
                    vend_res = (
                        sb.table(t_vendedores)
                        .select("id_vendedor, id_sucursal")
                        .eq("id_distribuidor", dist_id)
                        .in_("id_vendedor", vendedor_ids)
                        .execute()
                    )
                    vendedor_to_sucursal = {
                        r["id_vendedor"]: r.get("id_sucursal")
                        for r in (vend_res.data or [])
                        if r.get("id_vendedor") is not None
                    }

                suc_ids = list({sid for sid in vendedor_to_sucursal.values() if sid is not None})
                suc_map: dict[int, str] = {}
                if suc_ids:
                    suc_res = (
                        sb.table(t_sucursales)
                        .select("id_sucursal, nombre_erp")
                        .eq("id_distribuidor", dist_id)
                        .in_("id_sucursal", suc_ids)
                        .execute()
                    )
                    suc_map = {
                        r["id_sucursal"]: (r.get("nombre_erp") or "Sin sucursal")
                        for r in (suc_res.data or [])
                        if r.get("id_sucursal") is not None
                    }

                for ex_id, cli_id in ex_to_cli.items():
                    nro_cliente = ex_nro_map.get(ex_id)
                    id_ruta = nro_to_ruta.get(nro_cliente) if nro_cliente else None
                    if id_ruta is None:
                        id_ruta = cli_to_ruta.get(cli_id)
                    id_vendedor = ruta_to_vendedor.get(id_ruta) if id_ruta is not None else None
                    id_sucursal = vendedor_to_sucursal.get(id_vendedor) if id_vendedor is not None else None
                    ex_sucursal_map[ex_id] = suc_map.get(id_sucursal, "Sin sucursal")
        except Exception as e_suc:
            logger.warning(f"[pendientes] enrich sucursal fallback: {e_suc}")

    obj_id_map: dict[int, str | None] = {}
    if all_ex_ids:
        try:
            obj_res = (
                sb.table("exhibiciones")
                .select("id_exhibicion, id_objetivo")
                .eq("id_distribuidor", dist_id)
                .in_("id_exhibicion", all_ex_ids)
                .execute()
            )
            obj_id_map = {
                r["id_exhibicion"]: r.get("id_objetivo")
                for r in (obj_res.data or [])
            }
        except Exception as e_obj:
            logger.warning(f"[pendientes] Error fetching id_objetivo: {e_obj}")

    for d in rows:
        ex_id = d.get("id_exhibicion")
        if not ex_id:
            continue
        tg_vendedor = (d.get("vendedor") or "S/V").strip()
        iid_row = ex_to_int.get(ex_id)
        vendedor_display = resolve_exhibicion_vendedor_display(
            dist_id,
            iid_row,
            tg_vendedor,
            integrante_to_erp=integrante_to_erp,
            erp_name_map=erp_name_map,
        )
        if hide_qa and (
            is_exhibicion_qa_display_for_dist(dist_id, tg_vendedor)
            or is_exhibicion_qa_display_for_dist(dist_id, vendedor_display)
        ):
            continue

        ts = (d.get("fecha_hora") or "")[:10]
        cli = str(d.get("nro_cliente") or d.get("cliente_sombra_codigo") or "0").strip()

        if ts and cli and cli != "0" and cli != "S/C":
            key = f"{cli}_{ts}_{vendedor_display}"
        else:
            key = (
                f"{d.get('telegram_msg_id')}_{tg_vendedor}"
                if d.get("telegram_msg_id")
                else f"solo_{ex_id}"
            )

        if inactive_vendor_names:
            tg_norm = tg_vendedor.lower()
            disp_norm = vendedor_display.lower()
            if tg_norm in inactive_vendor_names or disp_norm in inactive_vendor_names:
                continue
        sucursal_resuelta = ex_sucursal_map.get(ex_id)
        if not sucursal_resuelta or sucursal_resuelta == "Sin sucursal":
            sucursal_resuelta = (
                vendedor_sucursal_map.get(vendedor_display.lower())
                or vendedor_sucursal_map.get(tg_vendedor.lower())
                or "Sin sucursal"
            )
        if key not in grupos:
            grupos[key] = {
                "vendedor": vendedor_display,
                "sucursal": sucursal_resuelta,
                "nro_cliente": d.get("nro_cliente") or "S/C",
                "tipo_pdv": d.get("tipo_pdv") or "S/D",
                "fecha_hora": d.get("fecha_hora") or "",
                "fotos": [],
            }
        id_obj = obj_id_map.get(ex_id)
        grupos[key]["fotos"].append({
            "id_exhibicion": ex_id,
            "drive_link": d.get("drive_link") or "",
            "estado": d.get("estado"),
            "id_objetivo": id_obj,
            "es_objetivo": id_obj is not None,
        })
    return sort_pendientes_grupos(list(grupos.values()))
