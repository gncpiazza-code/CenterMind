# -*- coding: utf-8 -*-
"""
Panel de supervisión: vendedores, rutas, clientes PDV, ventas, cuentas corrientes,
objetivos, PDVs cercanos, evaluación de exhibiciones.
"""
import io
import json
import logging
import math
import re
import tempfile
import unicodedata
from datetime import date, datetime, timedelta
from typing import Optional, Set

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile

from core.helpers import (
    _get_erp_name_map,
    _enrich_and_store_cc,
    build_qa_exhibicion_integrante_ids,
    cc_row_matches_vendedor_erp,
    is_exhibicion_qa_display_for_dist,
    should_apply_exhibicion_qa_filter,
    is_vendedor_excluido_objetivos,
    load_active_vendedor_ids,
)
from core.exhibicion_aggregate import count_logical_per_client
from core.lifespan import broadcast_sync
from core.security import verify_auth, check_dist_permission
from core.tenant_tables import (
    tenant_table_name,
    load_dist_ids,
    find_dist_by_vendedor,
    find_dist_by_ruta,
)
from db import sb
from models.schemas import EvaluarRequest, ObjetivoCreate, ObjetivoItemCreate, ObjetivoPreviewTelegramIn, ObjetivoUpdate, ObjetivoTimeline, ObjetivoTimelineEvent, RevertirRequest

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()

# Padrón operativo en mapa: inactivos por `sin_compra_*` siguen visibles; se excluyen
# `padron_anulado` (Consolido anulado + “fuera de padrón” luego del tombstone) y `padron_absent` legado.
_SUPERVISION_PADRON_VISIBLE_OR = (
    "motivo_inactivo.is.null,motivo_inactivo.not.in.(padron_absent,padron_anulado)"
)


def _iso_ts_latest(*candidates: object | None) -> str | None:
    """El timestamp ISO más reciente entre candidatos (Postgres devuelve ISO ordenable)."""
    best: str | None = None
    for c in candidates:
        if c is None:
            continue
        s = str(c).strip()
        if not s:
            continue
        if best is None or s > best:
            best = s
    return best


def _padron_global_last_ts_for_dist(dist_id: int) -> str | None:
    """Último run padron_global OK cuyo payload incluyó este id_distribuidor."""
    try:
        res_g = (
            sb.table("motor_runs")
            .select("finalizado_en,iniciado_en,registros")
            .eq("motor", "padron_global")
            .eq("estado", "ok")
            .order("finalizado_en", desc=True)
            .limit(80)
            .execute()
        )
        for row in res_g.data or []:
            regs = row.get("registros")
            if isinstance(regs, str):
                try:
                    regs = json.loads(regs)
                except Exception:
                    continue
            if not isinstance(regs, dict):
                continue
            for did in regs.get("dist_ids") or []:
                try:
                    if int(did) == int(dist_id):
                        return row.get("finalizado_en") or row.get("iniciado_en")
                except (TypeError, ValueError):
                    continue
    except Exception as e:
        logger.debug("[sync-status] padron_global lookup dist=%s: %s", dist_id, e)
    return None


def _norm_name(s) -> str:
    """Normaliza nombres de clientes para matching robusto entre distintos ERPs.
    Quita acentos, puntuación y colapsa espacios. Retorna MAYÚSCULAS.
    Ejemplo: "Martínez S.R.L." → "MARTINEZ SRL"
    """
    if not s:
        return ""
    s = str(s).strip().upper()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^A-Z0-9 ]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _norm_erp_cliente_id(erp_id: object | None) -> str | None:
    """Normaliza id_cliente_erp: quita .0 de float y ceros a la izquierda."""
    if erp_id is None:
        return None
    s = str(erp_id).strip()
    if not s:
        return None
    if s.endswith(".0"):
        s = s[:-2]
    return (s.lstrip("0") or "0").upper()


def _parse_cc_cliente_label(cliente_nombre: str | None) -> tuple[str | None, str | None]:
    """
    CHESS/CC: '050014 - GABRIELA INGALINA' → (erp '50014', nombre_norm 'GABRIELA INGALINA').
    """
    raw = (cliente_nombre or "").strip()
    if not raw:
        return None, None
    if " - " in raw:
        code_part, name_part = raw.split(" - ", 1)
        return _norm_erp_cliente_id(code_part), _norm_name(name_part)
    return None, _norm_name(raw)


def _dedupe_pdvs_latest_by_erp(rows: list[dict]) -> list[dict]:
    """
    Una fila por id_cliente_erp. Prioriza la fila con fecha_ultima_compra **no nula**
    y, si hay varias, la de **fecha más reciente** (padrón), luego updated_at.
    Evita quedarse con una fila duplicada “nueva” pero sin FUC que borre la vista del mapa.
    """
    if not rows:
        return rows

    def _fuc_key(row: dict) -> str:
        s = row.get("fecha_ultima_compra")
        if not s:
            return ""
        return str(s)[:10]

    def _better(prev: dict, row: dict) -> dict:
        fp, fr = _fuc_key(prev), _fuc_key(row)
        if bool(fr) != bool(fp):
            return row if fr else prev
        if fp and fr and fp != fr:
            return row if fr > fp else prev
        pu = str(prev.get("updated_at") or "")
        ru = str(row.get("updated_at") or "")
        if ru != pu:
            return row if ru > pu else prev
        return row if int(row.get("id_cliente") or 0) > int(prev.get("id_cliente") or 0) else prev

    chosen_by_erp: dict[str, dict] = {}
    no_erp_rows: list[dict] = []
    for row in rows:
        erp = str(row.get("id_cliente_erp") or "").strip()
        if not erp:
            no_erp_rows.append(row)
            continue
        prev = chosen_by_erp.get(erp)
        if prev is None:
            chosen_by_erp[erp] = row
        else:
            chosen_by_erp[erp] = _better(prev, row)
    return list(chosen_by_erp.values()) + no_erp_rows


def _objetivo_belongs_to_dist(obj_id: str, dist_id: int) -> bool:
    """True si el objetivo existe y pertenece al distribuidor (tenant-safe)."""
    try:
        r = (
            sb.table("objetivos")
            .select("id")
            .eq("id", obj_id)
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        return bool(r.data)
    except Exception as e:
        logger.warning(f"[objetivos] _objetivo_belongs_to_dist obj={obj_id} dist={dist_id}: {e}")
        return False


def _resolve_pdv_id_from_nro_cliente(dist_id: int, nro: str | None) -> int | None:
    """Resuelve id_cliente (PK clientes_pdv_v2) desde nro_cliente / id_cliente_erp."""
    if not nro or str(nro).strip() in ("", "0", "S/C", "—"):
        return None
    raw = str(nro).strip()
    for cand in (raw, raw.lstrip("0") or raw):
        try:
            t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
            r = (
                sb.table(t_clientes)
                .select("id_cliente")
                .eq("id_distribuidor", dist_id)
                .eq("id_cliente_erp", cand)
                .limit(1)
                .execute()
            )
            if r.data:
                return int(r.data[0]["id_cliente"])
        except (TypeError, ValueError, KeyError):
            continue
    return None


def _resolve_vendedor_v2_from_integrante(dist_id: int, id_integrante: int | None) -> int | None:
    if id_integrante is None:
        return None
    try:
        r = (
            sb.table("integrantes_grupo")
            .select("id_vendedor_v2")
            .eq("id_distribuidor", dist_id)
            .eq("id_integrante", id_integrante)
            .limit(1)
            .execute()
        )
        if not r.data:
            return None
        v = r.data[0].get("id_vendedor_v2")
        return int(v) if v is not None else None
    except (TypeError, ValueError, KeyError) as e:
        logger.warning(f"[evaluar] id_vendedor_v2 desde integrante={id_integrante}: {e}")
        return None


def _fetch_rutas_rows(
    dist_id: int,
    select_cols: str,
    id_vendedor: int | None = None,
    ruta_ids: list[int] | None = None,
) -> list[dict]:
    """
    Lee rutas priorizando tabla tenant. Si falla (p.ej. schema/policy legacy),
    cae a tabla legacy `rutas` filtrada por distribuidor.
    """
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    try:
        q = sb.table(t_rutas).select(select_cols)
        if id_vendedor is not None:
            q = q.eq("id_vendedor", id_vendedor)
        if ruta_ids:
            q = q.in_("id_ruta", ruta_ids)
        res = q.execute()
        return res.data or []
    except Exception as e_tenant:
        logger.warning(f"[supervision] rutas tenant fallback dist={dist_id}: {e_tenant}")
        try:
            q = sb.table("rutas").select(select_cols).eq("id_distribuidor", dist_id)
            if id_vendedor is not None:
                q = q.eq("id_vendedor", id_vendedor)
            if ruta_ids:
                q = q.in_("id_ruta", ruta_ids)
            res = q.execute()
            return res.data or []
        except Exception as e_legacy:
            logger.warning(f"[supervision] rutas legacy fallback también falló dist={dist_id}: {e_legacy}")
            return []


def _resolve_objetivo_exhibicion_id(
    dist_id: int, id_vendedor_v2: int, id_cliente_pdv: int
) -> str | None:
    """
    Alineado con bot_worker ObjInterceptor: id_target_pdv → objetivo_items → global sin ítems.
    """
    if not id_vendedor_v2 or not id_cliente_pdv:
        return None
    try:
        base = (
            sb.table("objetivos")
            .select("id")
            .eq("id_distribuidor", dist_id)
            .eq("tipo", "exhibicion")
            .eq("cumplido", False)
            .eq("id_vendedor", id_vendedor_v2)
        )
        r1 = base.eq("id_target_pdv", id_cliente_pdv).limit(1).execute()
        if r1.data:
            return str(r1.data[0]["id"])

        items = (
            sb.table("objetivo_items")
            .select("id_objetivo")
            .eq("id_cliente_pdv", id_cliente_pdv)
            .execute()
        )
        oids = list(
            {str(x["id_objetivo"]) for x in (items.data or []) if x.get("id_objetivo")}
        )
        if oids:
            r2 = (
                sb.table("objetivos")
                .select("id")
                .eq("id_distribuidor", dist_id)
                .eq("tipo", "exhibicion")
                .eq("cumplido", False)
                .eq("id_vendedor", id_vendedor_v2)
                .in_("id", oids)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if r2.data:
                return str(r2.data[0]["id"])

        cands = (
            sb.table("objetivos")
            .select("id")
            .eq("id_distribuidor", dist_id)
            .eq("tipo", "exhibicion")
            .eq("cumplido", False)
            .eq("id_vendedor", id_vendedor_v2)
            .is_("id_target_pdv", "null")
            .order("created_at", desc=True)
            .limit(25)
            .execute()
        )
        for row in cands.data or []:
            oid = row.get("id")
            if not oid:
                continue
            it_chk = (
                sb.table("objetivo_items")
                .select("id")
                .eq("id_objetivo", oid)
                .limit(1)
                .execute()
            )
            if it_chk.data:
                continue
            return str(oid)
    except Exception as e:
        logger.warning(
            f"[evaluar] _resolve_objetivo_exhibicion_id dist={dist_id} "
            f"vend={id_vendedor_v2} pdv={id_cliente_pdv}: {e}"
        )
    return None


def _enrich_exhibicion_objetivo_vinculos(dist_id: int, ids_exhibicion: list[int]) -> None:
    """
    Si la fila de exhibición perdió o nunca tuvo id_objetivo / id_cliente_pdv,
    los recalcula y persiste para que evaluar y el Kanban retomen el rastro.
    """
    if not ids_exhibicion:
        return
    try:
        rows = (
            sb.table("exhibiciones")
            .select(
                "id_exhibicion, id_cliente_pdv, id_objetivo, id_integrante, "
                "id_cliente, cliente_sombra_codigo"
            )
            .in_("id_exhibicion", ids_exhibicion)
            .execute()
        )
        for ex in rows.data or []:
            id_ex = ex.get("id_exhibicion")
            if not id_ex:
                continue
            pid = ex.get("id_cliente_pdv")
            oid = ex.get("id_objetivo")
            # En tabla real no hay nro_cliente (fn_pendientes lo expone como alias).
            ic = ex.get("id_cliente")
            if ic is not None and str(ic).strip() not in ("", "0"):
                raw_nro = ic
            else:
                raw_nro = ex.get("cliente_sombra_codigo")
            nro = str(raw_nro).strip() if raw_nro is not None and str(raw_nro).strip() else None
            id_int = ex.get("id_integrante")

            patch: dict = {}
            if not pid:
                resolved = _resolve_pdv_id_from_nro_cliente(dist_id, nro)
                if resolved:
                    patch["id_cliente_pdv"] = resolved
                    pid = resolved

            id_v2 = _resolve_vendedor_v2_from_integrante(dist_id, id_int)
            if not oid and id_v2 and pid:
                oid_s = _resolve_objetivo_exhibicion_id(dist_id, id_v2, int(pid))
                if oid_s:
                    patch["id_objetivo"] = oid_s

            if patch:
                sb.table("exhibiciones").update(patch).eq("id_exhibicion", id_ex).execute()
                logger.info(
                    f"[evaluar] Vínculo exhibición→objetivo reparado id_ex={id_ex} patch={patch}"
                )
    except Exception as e:
        logger.warning(f"[evaluar] _enrich_exhibicion_objetivo_vinculos: {e}")


# ─── Exhibiciones: pendientes, evaluar, revertir ──────────────────────────────

@router.get("/api/pendientes/{id_distribuidor}", summary="Exhibiciones pendientes agrupadas por mensaje")
def get_pendientes(id_distribuidor: int, payload=Depends(verify_auth)):
    check_dist_permission(payload, id_distribuidor)
    try:
        t_clientes = tenant_table_name("clientes_pdv_v2", id_distribuidor)
        t_vendedores = tenant_table_name("vendedores_v2", id_distribuidor)
        t_sucursales = tenant_table_name("sucursales_v2", id_distribuidor)
        t_rutas = tenant_table_name("rutas_v2", id_distribuidor)
        result = sb.rpc("fn_pendientes", {"p_dist_id": id_distribuidor}).execute()
        rows = result.data or []

        hide_qa = should_apply_exhibicion_qa_filter(id_distribuidor, payload)
        qa_ids = build_qa_exhibicion_integrante_ids(id_distribuidor) if hide_qa else frozenset()
        erp_name_map = _get_erp_name_map(id_distribuidor)
        ex_to_int: dict[int, int | None] = {}
        if rows and hide_qa:
            ex_ids = [r.get("id_exhibicion") for r in rows if r.get("id_exhibicion")]
            if ex_ids:
                try:
                    ex_map_res = (
                        sb.table("exhibiciones")
                        .select("id_exhibicion, id_integrante")
                        .eq("id_distribuidor", id_distribuidor)
                        .in_("id_exhibicion", ex_ids)
                        .execute()
                    )
                    ex_to_int = {
                        r["id_exhibicion"]: r.get("id_integrante")
                        for r in (ex_map_res.data or [])
                    }
                except Exception as _e_map:
                    logger.warning(f"[pendientes] map id_integrante QA: {_e_map}")

            def _row_is_qa_exhibicion(row: dict) -> bool:
                ex_id = row.get("id_exhibicion")
                iid = ex_to_int.get(ex_id)
                if iid is not None:
                    try:
                        if int(iid) in qa_ids:
                            return True
                    except (TypeError, ValueError):
                        pass
                tg_v = (row.get("vendedor") or "").strip()
                disp = erp_name_map.get(tg_v.lower(), tg_v)
                if is_exhibicion_qa_display_for_dist(id_distribuidor, tg_v):
                    return True
                if is_exhibicion_qa_display_for_dist(id_distribuidor, disp):
                    return True
                return False

            rows = [r for r in rows if not _row_is_qa_exhibicion(r)]

        pendientes_sin_nro = [r.get("id_exhibicion") for r in rows if r.get("id_exhibicion") and (not r.get("nro_cliente") or r.get("nro_cliente") == "0")]
        if pendientes_sin_nro:
            try:
                extra_res = (
                    sb.table("exhibiciones")
                    .select("id_exhibicion, id_cliente_pdv")
                    .eq("id_distribuidor", id_distribuidor)
                    .in_("id_exhibicion", pendientes_sin_nro)
                    .execute()
                )
                exh_cliente = {r["id_exhibicion"]: r.get("id_cliente_pdv") for r in (extra_res.data or []) if r.get("id_cliente_pdv")}
                nro_map = {}
                if exh_cliente:
                    pdv_res = (
                        sb.table(t_clientes)
                        .select("id_cliente, id_cliente_erp")
                        .eq("id_distribuidor", id_distribuidor)
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
                .eq("id_distribuidor", id_distribuidor)
                .execute()
            )
            active_ids = load_active_vendedor_ids(id_distribuidor)
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
                    .eq("id_distribuidor", id_distribuidor)
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

        # Enriquecer sucursal por exhibición (id_exhibicion -> sucursal_erp)
        # Prioriza match por nro_cliente ERP (más robusto que id_cliente_pdv legacy).
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
                        .eq("id_distribuidor", id_distribuidor)
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
                    .eq("id_distribuidor", id_distribuidor)
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
                        .eq("id_distribuidor", id_distribuidor)
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
                            .eq("id_distribuidor", id_distribuidor)
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
                            .eq("id_distribuidor", id_distribuidor)
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
                        # 1) preferir ruta por id_cliente_erp; 2) fallback id_cliente_pdv
                        id_ruta = nro_to_ruta.get(nro_cliente) if nro_cliente else None
                        if id_ruta is None:
                            id_ruta = cli_to_ruta.get(cli_id)
                        id_vendedor = ruta_to_vendedor.get(id_ruta) if id_ruta is not None else None
                        id_sucursal = vendedor_to_sucursal.get(id_vendedor) if id_vendedor is not None else None
                        ex_sucursal_map[ex_id] = suc_map.get(id_sucursal, "Sin sucursal")
            except Exception as e_suc:
                logger.warning(f"[pendientes] enrich sucursal fallback: {e_suc}")

        # Batch-fetch id_objetivo para marcar exhibiciones de objetivo
        obj_id_map: dict[int, str | None] = {}
        if all_ex_ids:
            try:
                obj_res = sb.table("exhibiciones") \
                    .select("id_exhibicion, id_objetivo") \
                    .eq("id_distribuidor", id_distribuidor) \
                    .in_("id_exhibicion", all_ex_ids) \
                    .execute()
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
            vendedor_display = erp_name_map.get(tg_vendedor.lower(), tg_vendedor)
            if hide_qa and (
                is_exhibicion_qa_display_for_dist(id_distribuidor, tg_vendedor)
                or is_exhibicion_qa_display_for_dist(id_distribuidor, vendedor_display)
            ):
                continue

            ts = (d.get("fecha_hora") or "")[:10]
            cli = str(d.get("nro_cliente") or d.get("cliente_sombra_codigo") or "0").strip()
            
            if ts and cli and cli != "0" and cli != "S/C":
                key = f"{cli}_{ts}_{vendedor_display}"
            else:
                key = f"{d.get('telegram_msg_id')}_{tg_vendedor}" if d.get("telegram_msg_id") else f"solo_{ex_id}"

            if inactive_vendor_names:
                tg_norm = tg_vendedor.lower()
                disp_norm = vendedor_display.lower()
                if tg_norm in inactive_vendor_names or disp_norm in inactive_vendor_names:
                    continue
            sucursal_resuelta = ex_sucursal_map.get(ex_id)
            if not sucursal_resuelta or sucursal_resuelta == "Sin sucursal":
                sucursal_resuelta = vendedor_sucursal_map.get(vendedor_display.lower()) \
                    or vendedor_sucursal_map.get(tg_vendedor.lower()) \
                    or "Sin sucursal"
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
        return list(grupos.values())
    except Exception as e:
        logger.error(f"Error en get_pendientes dist={id_distribuidor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/stats/{id_distribuidor}", summary="Estadisticas del dia actual")
def get_stats(id_distribuidor: int, payload=Depends(verify_auth)):
    check_dist_permission(payload, id_distribuidor)
    try:
        hoy = datetime.now().strftime("%Y-%m-%d")
        result = sb.rpc("fn_stats_hoy", {"p_dist_id": id_distribuidor, "p_fecha": hoy}).execute()
        r = result.data[0] if result.data else {}
        return {k: (v or 0) for k, v in r.items()}
    except Exception as e:
        logger.error(f"Error en get_stats dist={id_distribuidor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/vendedores/{id_distribuidor}", summary="Lista de vendedores con pendientes")
def get_vendedores(id_distribuidor: int, payload=Depends(verify_auth)):
    check_dist_permission(payload, id_distribuidor)
    try:
        result = sb.rpc("fn_vendedores_pendientes", {"p_dist_id": id_distribuidor}).execute()
        erp_name_map = _get_erp_name_map(id_distribuidor)
        hide_qa = should_apply_exhibicion_qa_filter(id_distribuidor, payload)
        nombres = []
        seen = set()
        for r in result.data or []:
            tg_name = (r.get("nombre_integrante") or "").strip()
            display = erp_name_map.get(tg_name.lower(), tg_name)
            if hide_qa and (
                is_exhibicion_qa_display_for_dist(id_distribuidor, display)
                or is_exhibicion_qa_display_for_dist(id_distribuidor, tg_name)
            ):
                continue
            if display and display not in seen:
                nombres.append(display)
                seen.add(display)
        return nombres
    except Exception as e:
        logger.error(f"Error en get_vendedores dist={id_distribuidor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/evaluar", summary="Aprobar / Destacar / Rechazar una exhibicion")
def evaluar(req: EvaluarRequest, user_payload=Depends(verify_auth)):
    try:
        if not req.ids_exhibicion:
            return {"affected": 0}
        first_id = req.ids_exhibicion[0]
        ex_res = sb.table("exhibiciones").select("id_distribuidor").eq("id_exhibicion", first_id).execute()
        if not ex_res.data:
            raise HTTPException(status_code=404, detail="Exhibición no encontrada")
        dist_id = ex_res.data[0]["id_distribuidor"]
        check_dist_permission(user_payload, dist_id)

        from core.security import check_distributor_status
        check_distributor_status(dist_id, user_payload)

        if should_apply_exhibicion_qa_filter(dist_id, user_payload):
            qa_ids = build_qa_exhibicion_integrante_ids(dist_id)
            if qa_ids:
                ex_chk = (
                    sb.table("exhibiciones")
                    .select("id_integrante")
                    .in_("id_exhibicion", req.ids_exhibicion)
                    .execute()
                )
                for row in ex_chk.data or []:
                    if row.get("id_integrante") in qa_ids:
                        raise HTTPException(
                            status_code=403,
                            detail="Estas exhibiciones son de cuentas de prueba y solo el superadmin puede evaluarlas.",
                        )

        r = sb.table("exhibiciones").update({
            "estado": req.estado,
            "supervisor_nombre": req.supervisor,
            "comentario_evaluacion": req.comentario or None,
            "evaluated_at": datetime.utcnow().isoformat(),
            "evaluado_por_id": user_payload.get("id_usuario"),
            "synced_telegram": 0,
        }).in_("id_exhibicion", req.ids_exhibicion).eq("estado", "Pendiente").execute()
        affected = len(r.data) if r.data else 0

        # Reparar id_objetivo / id_cliente_pdv si el bot no alcanzó a persistirlos (ítems con
        # id_distribuidor NULL no matcheaban, race, etc.) — sin esto el objetivo "pierde" la foto.
        if affected > 0:
            try:
                _enrich_exhibicion_objetivo_vinculos(dist_id, req.ids_exhibicion)
            except Exception as e_vin:
                logger.warning(f"[evaluar] enrich vínculo exhibición-objetivo: {e_vin}")

        # Aprobado / Destacado: cerrar ítems de objetivo vinculados a la exhibición
        estados_avance_objetivo = ("Aprobado", "Destacado")
        # Rechazado: marcar ítem como falla para que la meta pueda cerrarse (terminado / falla)
        estados_cierre_objetivo = ("Aprobado", "Destacado", "Rechazado")
        if affected > 0 and req.estado in estados_cierre_objetivo:
            try:
                from datetime import timezone
                exhib_data = sb.table("exhibiciones").select(
                    "id_cliente_pdv, id_objetivo"
                ).in_("id_exhibicion", req.ids_exhibicion).execute()
                obj_ids_watch: set[str] = set()
                nuevo_estado_item = (
                    "cumplido" if req.estado in estados_avance_objetivo else "falla"
                )
                for ex in exhib_data.data or []:
                    oid = ex.get("id_objetivo")
                    pid = ex.get("id_cliente_pdv")
                    if not oid or not pid:
                        continue
                    oid_s = str(oid).strip()
                    if not _objetivo_belongs_to_dist(oid_s, dist_id):
                        logger.warning(
                            f"[evaluar] Objetivo {oid_s} no pertenece a dist={dist_id}, "
                            "omitido cierre de ítem"
                        )
                        continue
                    obj_ids_watch.add(oid_s)
                    # No filtrar por id_distribuidor en ítems: filas legacy pueden tener NULL
                    # y el UPDATE no matcheaba → el Kanban quedaba eternamente "en progreso".
                    sb.table("objetivo_items").update({
                        "estado_item": nuevo_estado_item,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("id_objetivo", oid_s).eq("id_cliente_pdv", pid).in_(
                        "estado_item", ["pendiente", "foto_subida"]
                    ).execute()
                # Sin id_objetivo en la fila: cerrar por PDV + estado foto_subida (comportamiento previo)
                if not obj_ids_watch:
                    pdv_ids = [
                        e["id_cliente_pdv"]
                        for e in (exhib_data.data or [])
                        if e.get("id_cliente_pdv")
                    ]
                    if pdv_ids:
                        items_res = sb.table("objetivo_items") \
                            .select("id, id_objetivo, id_cliente_pdv") \
                            .in_("id_cliente_pdv", pdv_ids) \
                            .eq("estado_item", "foto_subida") \
                            .execute()
                        for item in (items_res.data or []):
                            oid_item = str(item["id_objetivo"])
                            if not _objetivo_belongs_to_dist(oid_item, dist_id):
                                continue
                            sb.table("objetivo_items").update({
                                "estado_item": nuevo_estado_item,
                                "updated_at": datetime.now(timezone.utc).isoformat(),
                            }).eq("id", item["id"]).execute()
                            obj_ids_watch.add(oid_item)
                if obj_ids_watch:
                    import threading
                    from services.objetivos_watcher_service import objetivos_watcher

                    def _run_evaluar_watchers():
                        try:
                            for oid_w in obj_ids_watch:
                                objetivos_watcher.run_watcher(dist_id, obj_id=oid_w)
                        except Exception as _we:
                            logger.warning(f"[evaluar] Watcher batch: {_we}")

                    threading.Thread(target=_run_evaluar_watchers, daemon=True).start()
                else:
                    try:
                        import threading
                        from services.objetivos_watcher_service import objetivos_watcher
                        threading.Thread(
                            target=objetivos_watcher.run_watcher,
                            args=(dist_id,),
                            daemon=True,
                        ).start()
                    except Exception as e_watch:
                        logger.warning(f"[evaluar] Watcher global omitido: {e_watch}")
            except Exception as e_items:
                logger.warning(f"[evaluar] No se pudo actualizar objetivo_items: {e_items}")

        if affected > 0:
            try:
                broadcast_sync(dist_id, {
                    "type": "evaluation_updated",
                    "payload": {
                        "dist_id": dist_id,
                        "estado": req.estado,
                        "ids_exhibicion": req.ids_exhibicion,
                        "affected": affected,
                    },
                })
            except Exception as e_ws:
                logger.debug(f"[evaluar] WS notify skipped: {e_ws}")

        return {"affected": affected}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en evaluar batch: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/revertir", summary="Revertir evaluacion a Pendiente")
def revertir(req: RevertirRequest, user_payload=Depends(verify_auth)):
    try:
        if not req.ids_exhibicion:
            return {"affected": 0}
        first = req.ids_exhibicion[0]
        ex0 = sb.table("exhibiciones").select("id_distribuidor").eq("id_exhibicion", first).execute()
        if not ex0.data:
            raise HTTPException(status_code=404, detail="Exhibición no encontrada")
        dist_id = ex0.data[0]["id_distribuidor"]
        check_dist_permission(user_payload, dist_id)
        if should_apply_exhibicion_qa_filter(dist_id, user_payload):
            qa_ids = build_qa_exhibicion_integrante_ids(dist_id)
            if qa_ids:
                ex_chk = (
                    sb.table("exhibiciones")
                    .select("id_integrante")
                    .in_("id_exhibicion", req.ids_exhibicion)
                    .execute()
                )
                for row in ex_chk.data or []:
                    if row.get("id_integrante") in qa_ids:
                        raise HTTPException(
                            status_code=403,
                            detail="Solo el superadmin puede revertir exhibiciones de cuentas de prueba.",
                        )
        affected = 0
        for id_ex in req.ids_exhibicion:
            r = sb.table("exhibiciones").update({
                "estado": "Pendiente",
                "supervisor_nombre": None,
                "comentario_evaluacion": None,
                "evaluated_at": None,
                "synced_telegram": 0,
            }).eq("id_exhibicion", id_ex).execute()
            affected += len(r.data) if r.data else 0
        if affected > 0:
            try:
                broadcast_sync(dist_id, {
                    "type": "evaluation_updated",
                    "payload": {
                        "dist_id": dist_id,
                        "estado": "Pendiente",
                        "ids_exhibicion": req.ids_exhibicion,
                        "affected": affected,
                    },
                })
            except Exception as e_ws:
                logger.debug(f"[revertir] WS notify skipped: {e_ws}")

        return {"affected": affected}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Supervisión: vendedores, rutas, clientes ─────────────────────────────────

def _vendor_display_names_for_sucursal_erp(dist_id: int, sucursal_param: Optional[str]) -> Optional[Set[str]]:
    """
    Conjunto de nombres de vendedor tal como llegan/consolidan desde ventas (post _get_erp_name_map),
    filtrados por nombre ERP de sucursal (mismo valor que usa el frontend al elegir sucursal).
    None = sin filtro de sucursal.
    """
    if sucursal_param is None:
        return None
    needle = str(sucursal_param).strip().lower()
    if not needle:
        return None
    t_vendedores = tenant_table_name("vendedores_v2", dist_id)
    t_sucursales = tenant_table_name("sucursales_v2", dist_id)
    suc_res = (
        sb.table(t_sucursales)
        .select("id_sucursal,nombre_erp")
        .eq("id_distribuidor", dist_id)
        .execute()
    )
    matching_ids = set()
    for r in suc_res.data or []:
        name = ((r.get("nombre_erp") or "").strip().lower())
        if name == needle:
            try:
                matching_ids.add(int(r["id_sucursal"]))
            except Exception:
                continue
    if not matching_ids:
        return set()

    vend_res = (
        sb.table(t_vendedores)
        .select("nombre_erp,id_sucursal")
        .eq("id_distribuidor", dist_id)
        .execute()
    )
    erp_map = _get_erp_name_map(dist_id)
    names: Set[str] = set()
    for v in vend_res.data or []:
        try:
            sid = v.get("id_sucursal")
            sid_int = int(sid) if sid is not None else None
        except Exception:
            sid_int = None
        if sid_int is None or sid_int not in matching_ids:
            continue
        tg = (v.get("nombre_erp") or "").strip()
        names.add(erp_map.get(tg.lower(), tg))
    return names


@router.get("/api/supervision/vendedores/{dist_id}", tags=["Supervisión"])
def supervision_vendedores(
    dist_id: int,
    lite: bool = Query(False, description="Omite scan de exhibiciones 30d (carga inicial rápida)"),
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    try:
        t_vendedores = tenant_table_name("vendedores_v2", dist_id)
        t_sucursales = tenant_table_name("sucursales_v2", dist_id)
        t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)

        vend_res = (
            sb.table(t_vendedores)
            .select("id_vendedor,id_vendedor_erp,nombre_erp,id_sucursal")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        suc_res = (
            sb.table(t_sucursales)
            .select("id_sucursal,nombre_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        rutas_data = _fetch_rutas_rows(dist_id, "id_ruta,id_vendedor")

        # Fetch ALL clients with pagination — Supabase defaults to 1000 rows which
        # would truncate large distributors (Tabaco has 13k+ PDVs).
        # Excluye anulados + fuera de padrón; NO excluye inactivos por sin_compra (siguen en mapa).
        PAGE = 1000
        all_clients: list[dict] = []
        offset = 0
        while True:
            page_res = (
                sb.table(t_clientes)
                .select("id_cliente,id_cliente_erp,id_ruta,fecha_ultima_compra,fecha_alta")
                .eq("id_distribuidor", dist_id)
                .or_(_SUPERVISION_PADRON_VISIBLE_OR)
                .range(offset, offset + PAGE - 1)
                .execute()
            )
            batch = page_res.data or []
            all_clients.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE

        suc_map = {int(r["id_sucursal"]): (r.get("nombre_erp") or "Sin sucursal") for r in (suc_res.data or [])}
        rutas_por_vend: dict[int, list[int]] = {}
        vend_por_ruta: dict[int, int] = {}
        for r in rutas_data:
            try:
                rid = int(r["id_ruta"])
                vid = int(r["id_vendedor"])
            except Exception:
                continue
            vend_por_ruta[rid] = vid
            rutas_por_vend.setdefault(vid, []).append(rid)

        exhibidos_30d: set[int] = set()
        primera_exhibicion_7d: set[int] = set()
        if not lite:
            exh_since = (datetime.now() - timedelta(days=30)).isoformat()
            all_exh: list[dict] = []
            exh_offset = 0
            while True:
                exh_batch = (
                    sb.table("exhibiciones")
                    .select("id_cliente_pdv,timestamp_subida")
                    .eq("id_distribuidor", dist_id)
                    .gte("timestamp_subida", exh_since)
                    .range(exh_offset, exh_offset + PAGE - 1)
                    .execute()
                ).data or []
                all_exh.extend(exh_batch)
                if len(exh_batch) < PAGE:
                    break
                exh_offset += PAGE
            primera_exhibicion: dict[int, str] = {}
            for exh in all_exh:
                cid = exh.get("id_cliente_pdv")
                if cid is None:
                    continue
                cid_int = int(cid)
                exhibidos_30d.add(cid_int)
                ts = exh.get("timestamp_subida") or ""
                if cid_int not in primera_exhibicion or ts < primera_exhibicion[cid_int]:
                    primera_exhibicion[cid_int] = ts
            threshold_7d_iso = (datetime.now() - timedelta(days=7)).isoformat()
            primera_exhibicion_7d = {
                cid for cid, ts in primera_exhibicion.items() if ts >= threshold_7d_iso
            }

        # Contar PDVs igual que el mapa: deduplicar por id_cliente_erp y
        # usar regla de 30 días sin compra para clasificar activo/inactivo.
        threshold_30d = (datetime.now() - timedelta(days=30)).isoformat()[:10]
        threshold_7d = (datetime.now() - timedelta(days=7)).isoformat()[:10]
        pdv_activos: dict[int, int] = {}
        pdv_inactivos: dict[int, int] = {}
        pdv_nuevos_7d_dict: dict[int, int] = {}
        pdv_activados_7d_dict: dict[int, int] = {}
        pdv_ids_per_vend: dict[int, set[int]] = {}
        seen_per_vend: dict[int, set] = {}
        for c in all_clients:
            rid = c.get("id_ruta")
            if rid is None:
                continue
            try:
                vid = vend_por_ruta.get(int(rid))
            except Exception:
                vid = None
            if not vid:
                continue
            # Deduplicar por ERP ID (igual que _dedupe_pdvs_latest_by_erp en el mapa)
            erp = str(c.get("id_cliente_erp") or "").strip()
            dedup_key = f"erp:{erp}" if erp else f"pk:{c.get('id_cliente')}"
            if dedup_key in seen_per_vend.setdefault(vid, set()):
                continue
            seen_per_vend[vid].add(dedup_key)
            pk = c.get("id_cliente")
            if pk is not None:
                pdv_ids_per_vend.setdefault(vid, set()).add(int(pk))
            # Activo = compra en los últimos 30 días (misma regla que isInactivo30 en el frontend)
            fecha_uc = (c.get("fecha_ultima_compra") or "")[:10]
            if fecha_uc and fecha_uc >= threshold_30d:
                pdv_activos[vid] = pdv_activos.get(vid, 0) + 1
            else:
                pdv_inactivos[vid] = pdv_inactivos.get(vid, 0) + 1
            # PDVs activados en los últimos 7 días (subset de activos)
            if fecha_uc and fecha_uc >= threshold_7d:
                pdv_activados_7d_dict[vid] = pdv_activados_7d_dict.get(vid, 0) + 1
            # PDVs nuevos en los últimos 7 días (por fecha_alta)
            fecha_alta = (c.get("fecha_alta") or "")[:10]
            if fecha_alta and fecha_alta >= threshold_7d:
                pdv_nuevos_7d_dict[vid] = pdv_nuevos_7d_dict.get(vid, 0) + 1

        rows = []
        for v in (vend_res.data or []):
            try:
                vid = int(v["id_vendedor"])
            except Exception:
                continue
            sid = v.get("id_sucursal")
            sid_int = int(sid) if sid is not None else None
            rutas_ids = rutas_por_vend.get(vid, [])
            total_act = pdv_activos.get(vid, 0)
            total_inact = pdv_inactivos.get(vid, 0)
            vend_pdv_ids = pdv_ids_per_vend.get(vid, set())
            rows.append(
                {
                    "id_vendedor": vid,
                    "id_vendedor_erp": v.get("id_vendedor_erp"),
                    "nombre_vendedor": v.get("nombre_erp") or "Sin vendedor",
                    "sucursal_nombre": suc_map.get(sid_int, "Sin sucursal"),
                    "total_rutas": len(rutas_ids),
                    "total_pdv": total_act + total_inact,
                    "pdv_activos": total_act,
                    "pdv_inactivos": total_inact,
                    "pdv_nuevos_7d": pdv_nuevos_7d_dict.get(vid, 0),
                    "pdv_activados_7d": pdv_activados_7d_dict.get(vid, 0),
                    "pdv_exhibidos": len(vend_pdv_ids & exhibidos_30d),
                    "pdv_exhibidos_nuevos_7d": len(vend_pdv_ids & primera_exhibicion_7d),
                }
            )

        erp_name_map = _get_erp_name_map(dist_id)
        active_ids = load_active_vendedor_ids(dist_id)
        filtered = []
        hide_qa = should_apply_exhibicion_qa_filter(dist_id, user_payload)
        for r in rows:
            # Exclude vendedores marked inactive in vendedores_perfil
            vid = r.get("id_vendedor")
            if active_ids and vid is not None and int(vid) not in active_ids:
                continue
            # Padrón ingest no elimina rutas/vendedores huérfanos: si no hay ningún PDV
            # visible (misma consulta que KPIs/mapa), ocultar — evita bajas CHESS con rutas
            # fantasma en rutas_v2.
            if int(r.get("total_pdv") or 0) == 0:
                continue
            tg_name = (r.get("nombre_vendedor") or "").strip()
            if is_vendedor_excluido_objetivos(tg_name):
                continue
            erp_name = erp_name_map.get(tg_name.lower(), tg_name)
            if hide_qa and is_exhibicion_qa_display_for_dist(dist_id, erp_name):
                continue
            r["nombre_vendedor"] = erp_name
            filtered.append(r)
        return filtered
    except Exception as e:
        logger.error(f"Error en supervision_vendedores: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/rutas/{id_vendedor}", tags=["Supervisión"])
def supervision_rutas(id_vendedor: int, user_payload=Depends(verify_auth)):
    try:
        dist_ids = load_dist_ids(sb)
        dist_id = find_dist_by_vendedor(sb, id_vendedor, dist_ids)
        if dist_id is None:
            return []
        check_dist_permission(user_payload, dist_id)

        t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
        rutas = _fetch_rutas_rows(dist_id, "id_ruta,id_ruta_erp,dia_semana", id_vendedor=id_vendedor)
        if not rutas:
            return []

        rutas_ids = [r["id_ruta"] for r in rutas]
        cli_res = sb.table(t_clientes).select("id_ruta").in_("id_ruta", rutas_ids).execute()
        cnt: dict[int, int] = {}
        for c in (cli_res.data or []):
            rid = c.get("id_ruta")
            if rid is None:
                continue
            cnt[int(rid)] = cnt.get(int(rid), 0) + 1

        out = []
        for r in rutas:
            rid = int(r["id_ruta"])
            ruta_erp = str(r.get("id_ruta_erp") or "").strip()
            out.append(
                {
                    "id_ruta": rid,
                    "nombre_ruta": ruta_erp or f"Ruta {rid}",
                    "dia_semana": r.get("dia_semana") or "Variable",
                    "total_pdv": cnt.get(rid, 0),
                }
            )
        return out
    except Exception as e:
        logger.error(f"Error en supervision_rutas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/clientes/{id_ruta}", tags=["Supervisión"])
def supervision_clientes(id_ruta: int, user_payload=Depends(verify_auth)):
    try:
        dist_ids = load_dist_ids(sb)
        dist_id = find_dist_by_ruta(sb, id_ruta, dist_ids)
        if dist_id is None:
            return []
        check_dist_permission(user_payload, dist_id)
        t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
        res = (
            sb.table(t_clientes)
            .select(
                "id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social, "
                "domicilio, localidad, provincia, canal, latitud, longitud, "
                "fecha_ultima_compra, fecha_alta, id_distribuidor, id_ruta, estado, updated_at"
            )
            .eq("id_ruta", id_ruta)
            # Excluye anulados + fuera de padrón; sin_compra_* permanecen para pin inactivo.
            # NOTE: OR con is.null — NULL not in (...) falla en SQL sin esta rama.
            .or_(_SUPERVISION_PADRON_VISIBLE_OR)
            .order("nombre_fantasia")
            .execute()
        )
        # In supervisión we need to keep active + inactive PDVs visible (sin_compra_30d etc.)
        rows = _dedupe_pdvs_latest_by_erp(res.data or [])

        if rows:
            ids_pdv  = [r["id_cliente"] for r in rows]
            erp_map  = {r["id_cliente_erp"]: r["id_cliente"] for r in rows if r.get("id_cliente_erp")}
            dist_id  = rows[0].get("id_distribuidor")
            exh_map:       dict = {}
            exh_foto_map:  dict = {}
            exh_count_map: dict = {}
            threshold_date = (datetime.now() - timedelta(days=30)).isoformat()

            try:
                # Incluir id_integrante para dedup lógico (una exhibición por integrante+cliente+día)
                exh_res = (
                    sb.table("exhibiciones")
                    .select("id_exhibicion, id_integrante, id_cliente_pdv, cliente_sombra_codigo, timestamp_subida, url_foto_drive")
                    .eq("id_distribuidor", dist_id)
                    .in_("id_cliente_pdv", ids_pdv)
                    .order("timestamp_subida", desc=True)
                    .execute()
                )
                seen_logic: set[str] = set()
                for e in exh_res.data or []:
                    cid = e.get("id_cliente_pdv")
                    if cid:
                        if cid not in exh_map:
                            exh_map[cid]      = e.get("timestamp_subida")
                            exh_foto_map[cid] = e.get("url_foto_drive")
                logical_counts = count_logical_per_client(exh_res.data or [], seen=seen_logic)
                for cid, cnt in logical_counts.items():
                    exh_count_map[cid] = exh_count_map.get(cid, 0) + cnt

                erps_pending = [erp for erp, vid in erp_map.items() if vid not in exh_map]
                if erps_pending:
                    exh_erp_res = (
                        sb.table("exhibiciones")
                        .select("id_exhibicion, id_integrante, id_cliente_pdv, cliente_sombra_codigo, timestamp_subida, url_foto_drive")
                        .eq("id_distribuidor", dist_id)
                        .in_("cliente_sombra_codigo", erps_pending)
                        .order("timestamp_subida", desc=True)
                        .execute()
                    )
                    for e in exh_erp_res.data or []:
                        erp = e.get("cliente_sombra_codigo")
                        vid = erp_map.get(erp)
                        if vid:
                            if vid not in exh_map:
                                exh_map[vid]      = e.get("timestamp_subida")
                                exh_foto_map[vid] = e.get("url_foto_drive")
                    # Dedup lógico para el fallback ERP (mapear sombra → cliente_pk antes de contar)
                    erp_rows_mapped = [
                        {**e, "id_cliente_pdv": erp_map.get(e.get("cliente_sombra_codigo"))}
                        for e in (exh_erp_res.data or [])
                        if erp_map.get(e.get("cliente_sombra_codigo"))
                    ]
                    logical_erp = count_logical_per_client(erp_rows_mapped, seen=seen_logic)
                    for cid, cnt in logical_erp.items():
                        exh_count_map[cid] = exh_count_map.get(cid, 0) + cnt
            except Exception as e:
                logger.error(f"Error en join exhibiciones: {e}")

            for r in rows:
                fecha_exh = exh_map.get(r["id_cliente"])
                r["fecha_ultima_exhibicion"]   = fecha_exh
                r["url_ultima_exhibicion"]     = exh_foto_map.get(r["id_cliente"])
                r["total_exhibiciones"]        = exh_count_map.get(r["id_cliente"], 0)
                r["tiene_exhibicion_reciente"] = bool(fecha_exh and fecha_exh >= threshold_date)
        return rows
    except Exception as e:
        logger.error(f"Error en supervision_clientes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _ventas_enriched_es_recaudacion(tipo_documento: str | None) -> bool:
    s = (tipo_documento or "").strip().upper()
    return "RECIB" in s or s in {"RECCC"}


def _ventas_enriched_es_devolucion(tipo_documento: str | None, importe: float) -> bool:
    if importe < 0:
        return True
    s = (tipo_documento or "").strip().upper()
    return "DEVOL" in s or ("NOTA" in s and "CRED" in s)


@router.get("/api/supervision/ventas/{dist_id}", tags=["Supervisión"])
def supervision_ventas(
    dist_id: int,
    dias: int = 30,
    fecha_hasta: Optional[str] = Query(None),
    sucursal: Optional[str] = Query(None),
    vendedor: Optional[str] = Query(None),
    user_payload=Depends(verify_auth),
):
    """Ventas de supervisión desde Informe de Ventas Consolido (ventas_enriched_v2)."""
    check_dist_permission(user_payload, dist_id)
    try:
        if fecha_hasta:
            base_hasta = datetime.strptime(fecha_hasta, "%Y-%m-%d")
        else:
            base_hasta = datetime.now()
        fecha_hasta_str = base_hasta.strftime("%Y-%m-%d")
        fecha_desde = (base_hasta - timedelta(days=max(1, dias) - 1)).strftime("%Y-%m-%d")

        t_ventas = tenant_table_name("ventas_enriched_v2", dist_id)
        PAGE = 1000
        raw_lines: list[dict] = []
        offset = 0
        while True:
            batch = (
                sb.table(t_ventas)
                .select(
                    "fecha_factura,nombre_vendedor,nombre_cliente,id_cliente_erp,"
                    "tipo_documento,numero_documento,cod_articulo,descripcion_articulo,"
                    "bultos_total,importe_final,anulado,ruta,agrupacion_art_1"
                )
                .eq("id_distribuidor", dist_id)
                .eq("anulado", False)
                .gte("fecha_factura", fecha_desde)
                .lte("fecha_factura", fecha_hasta_str)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            raw_lines.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE

        erp_name_map = _get_erp_name_map(dist_id)
        sucursal_norm = (sucursal or "").strip().lower()
        vendedor_norm = (vendedor or "").strip().lower()
        vend_branch = (
            _vendor_display_names_for_sucursal_erp(dist_id, sucursal) or set()
            if sucursal_norm
            else None
        )

        lines: list[dict] = []
        for row in raw_lines:
            v_raw = (row.get("nombre_vendedor") or "Sin Vendedor").strip()
            v_disp = erp_name_map.get(v_raw.lower(), v_raw)
            if vendedor_norm and v_raw.lower() != vendedor_norm and v_disp.lower() != vendedor_norm:
                continue
            if sucursal_norm and vend_branch is not None:
                if v_disp not in vend_branch:
                    ruta = (row.get("ruta") or "").strip().lower()
                    agr = (row.get("agrupacion_art_1") or "").strip().lower()
                    if sucursal_norm not in ruta and sucursal_norm not in agr:
                        continue
            lines.append({**row, "_vendedor": v_disp, "_vendedor_raw": v_raw})

        # Agregar por comprobante (cabecera lógica) y acumular líneas/artículos.
        docs: dict[tuple, dict] = {}
        detalles_by_vendor_client: dict[tuple[str, str], dict] = {}
        top_articulos_by_vendor: dict[str, dict[str, float]] = {}

        for row in lines:
            f = str(row.get("fecha_factura") or "")[:10]
            tipo = (row.get("tipo_documento") or "").strip()
            num = (row.get("numero_documento") or "").strip()
            erp = (row.get("id_cliente_erp") or "").strip()
            cli = (row.get("nombre_cliente") or "").strip()
            v_disp = row["_vendedor"]
            doc_key = (f, tipo, num, erp)
            imp = float(row.get("importe_final") or 0)
            bultos = float(row.get("bultos_total") or 0)
            cod = (row.get("cod_articulo") or "").strip()
            desc = (row.get("descripcion_articulo") or "").strip()
            art_label = desc or cod or "Artículo sin descripción"

            doc = docs.get(doc_key)
            if doc is None:
                es_dev = _ventas_enriched_es_devolucion(tipo, imp)
                es_rec = _ventas_enriched_es_recaudacion(tipo)
                doc = {
                    "fecha": f,
                    "cliente": cli,
                    "comprobante": tipo,
                    "numero": num,
                    "vendedor": v_disp,
                    "tipo_operacion": "RECAUDACION" if es_rec else ("DEVOLUCION" if es_dev else "VENTA"),
                    "es_devolucion": es_dev,
                    "monto_total": 0.0,
                    "monto_recaudado": 0.0,
                    "articulos_map": {},
                }
                docs[doc_key] = doc
            if _ventas_enriched_es_recaudacion(tipo):
                doc["monto_recaudado"] += imp
            else:
                doc["monto_total"] += imp
            if art_label:
                doc["articulos_map"][art_label] = float(doc["articulos_map"].get(art_label, 0.0)) + bultos
                va = top_articulos_by_vendor.setdefault(v_disp, {})
                va[art_label] = float(va.get(art_label, 0.0)) + bultos
            if cli:
                vc_key = (v_disp, cli)
                bucket = detalles_by_vendor_client.setdefault(
                    vc_key, {"cliente": cli, "total_bultos": 0.0, "articulos": {}}
                )
                bucket["total_bultos"] += bultos
                if art_label:
                    bucket["articulos"][art_label] = float(bucket["articulos"].get(art_label, 0.0)) + bultos

        vendors: dict[str, dict] = {}
        is_sa = user_payload.get("is_superadmin")
        for doc in docs.values():
            v = doc["vendedor"]
            v_raw_lower = (v or "").lower()
            if not is_sa and dist_id == 3 and v_raw_lower == "nacho":
                continue
            if v not in vendors:
                vendors[v] = {
                    "vendedor": v,
                    "total_facturas": 0,
                    "monto_total": 0.0,
                    "monto_recaudado": 0.0,
                    "total_bultos": 0.0,
                    "clientes_bultos": [],
                    "top_articulos": [],
                    "transacciones": [],
                }
            vd = vendors[v]
            vd["total_facturas"] += 1
            vd["monto_total"] += float(doc["monto_total"] or 0)
            vd["monto_recaudado"] += float(doc["monto_recaudado"] or 0)
            articulos_list = [
                {
                    "codigo": None,
                    "articulo": a,
                    "bultos": round(float(b), 4),
                    "monto": 0.0,
                }
                for a, b in (doc.get("articulos_map") or {}).items()
            ]
            if len(vd["transacciones"]) < 100:
                vd["transacciones"].append({
                    "fecha": doc["fecha"],
                    "cliente": doc.get("cliente"),
                    "comprobante": doc.get("comprobante"),
                    "numero": doc.get("numero"),
                    "tipo_operacion": doc.get("tipo_operacion"),
                    "es_devolucion": doc.get("es_devolucion", False),
                    "monto_total": round(float(doc["monto_total"] or 0), 2),
                    "monto_recaudado": round(float(doc["monto_recaudado"] or 0), 2),
                    "articulos": articulos_list,
                })

        for vend_name, vend_payload in vendors.items():
            clientes_rows = []
            for (vv, _cli), data in detalles_by_vendor_client.items():
                if vv != vend_name:
                    continue
                top_cli_art = sorted(
                    [
                        {"articulo": a, "bultos": round(float(b), 2)}
                        for a, b in (data.get("articulos") or {}).items()
                    ],
                    key=lambda x: x["bultos"],
                    reverse=True,
                )[:5]
                clientes_rows.append(
                    {
                        "cliente": data["cliente"],
                        "total_bultos": round(float(data.get("total_bultos") or 0), 2),
                        "top_articulos": top_cli_art,
                    }
                )
            clientes_rows.sort(key=lambda x: x["total_bultos"], reverse=True)
            vend_payload["clientes_bultos"] = clientes_rows
            vend_payload["total_bultos"] = round(sum(x["total_bultos"] for x in clientes_rows), 2)
            vend_payload["top_articulos"] = sorted(
                [
                    {"articulo": a, "bultos": round(float(b), 2)}
                    for a, b in (top_articulos_by_vendor.get(vend_name) or {}).items()
                ],
                key=lambda x: x["bultos"],
                reverse=True,
            )[:10]

        result = sorted(vendors.values(), key=lambda x: x["monto_total"], reverse=True)
        return {
            "dias": dias,
            "fecha_desde": fecha_desde,
            "fecha_hasta": fecha_hasta_str,
            "total_facturado": round(sum(v["monto_total"] for v in result), 2),
            "total_recaudado": round(sum(v["monto_recaudado"] for v in result), 2),
            "total_facturas": sum(v["total_facturas"] for v in result),
            "fuente": {
                "ventas": tenant_table_name("ventas_enriched_v2", dist_id),
                "origen": "consolido_informe_ventas",
            },
            "vendedores": result,
        }
    except Exception as e:
        logger.error(f"Error en supervision_ventas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


_CC_DETALLE_COLS = (
    "id_vendedor, vendedor_nombre, sucursal_nombre, cliente_nombre, id_cliente_erp, "
    "id_cliente, deuda_total, deuda_7_dias, deuda_15_dias, deuda_30_dias, "
    "deuda_60_dias, deuda_mas_60_dias, antiguedad_dias, rango_antiguedad, "
    "cantidad_comprobantes, alerta_credito"
)


def _paginate_supabase(query_fn, page_size: int = 1000) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        batch = query_fn(offset, page_size).execute().data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def _resolve_sucursal_vendedor_ids(d_id: int, sucursal: str) -> tuple[set[int], str]:
    """id_vendedor válidos para una sucursal (nombre_erp en sucursales_v2)."""
    t_sucursales = tenant_table_name("sucursales_v2", d_id)
    t_vendedores = tenant_table_name("vendedores_v2", d_id)
    sucursal_exact = sucursal.strip()
    suc_q = (
        sb.table(t_sucursales)
        .select("id_sucursal")
        .eq("id_distribuidor", d_id)
        .ilike("nombre_erp", sucursal_exact)
        .execute()
    )
    valid_suc_ids = {s["id_sucursal"] for s in (suc_q.data or [])}
    valid_vend_ids: set[int] = set()
    if valid_suc_ids:
        vend_q = (
            sb.table(t_vendedores)
            .select("id_vendedor")
            .eq("id_distribuidor", d_id)
            .in_("id_sucursal", list(valid_suc_ids))
            .execute()
        )
        valid_vend_ids = {int(v["id_vendedor"]) for v in (vend_q.data or []) if v.get("id_vendedor") is not None}
    return valid_vend_ids, sucursal_exact.upper()


def _fetch_cc_detalle_rows(
    d_id: int,
    fecha_snapshot: str,
    *,
    id_vendedor: int | None = None,
    valid_vend_ids: set[int] | None = None,
    sucursal_norm_upper: str | None = None,
) -> list[dict]:
    """Lee cc_detalle con filtros en SQL (evita cargar todo el snapshot)."""

    def _base():
        return (
            sb.table("cc_detalle")
            .select(_CC_DETALLE_COLS)
            .eq("id_distribuidor", d_id)
            .eq("fecha_snapshot", fecha_snapshot)
        )

    rows: list[dict] = []
    if id_vendedor is not None:
        rows = _paginate_supabase(
            lambda o, p: _base().eq("id_vendedor", int(id_vendedor)).range(o, o + p - 1)
        )
    elif valid_vend_ids:
        vend_list = list(valid_vend_ids)
        for i in range(0, len(vend_list), 200):
            chunk = vend_list[i : i + 200]
            rows.extend(
                _paginate_supabase(
                    lambda o, p, ch=chunk: _base().in_("id_vendedor", ch).range(o, o + p - 1)
                )
            )
        if sucursal_norm_upper:
            orphans = _paginate_supabase(
                lambda o, p: _base().is_("id_vendedor", "null").range(o, o + p - 1)
            )
            rows.extend(
                r
                for r in orphans
                if (r.get("sucursal_nombre") or "").strip().upper() == sucursal_norm_upper
            )
    else:
        rows = _paginate_supabase(lambda o, p: _base().range(o, o + p - 1))
    return rows


def _today_ar() -> date:
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date()
    except Exception:
        return datetime.now().date()


def _parse_fecha_iso(s) -> date | None:
    if not s:
        return None
    raw = str(s).strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except ValueError:
        pass
    for fmt in ("%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw[:10], fmt).date()
        except ValueError:
            continue
    return None


def _antiguedad_rango_label(dias: int) -> str:
    d = max(0, int(dias or 0))
    if d <= 7:
        return "1-7 Días"
    if d <= 15:
        return "8-15 Días"
    if d <= 21:
        return "16-21 Días"
    if d <= 30:
        return "22-30 Días"
    return "+30 Días"


def _antiguedad_supervision_display(
    antig_cc: int, dias_uc: int | None, deuda: float
) -> tuple[int, str, bool]:
    """
    Antigüedad mostrada en supervisión.
    Si CHESS marca 0d pero el padrón tiene compra más antigua, usamos días desde última compra.
    """
    antig_cc = int(antig_cc or 0)
    if deuda <= 0 or dias_uc is None:
        return antig_cc, _antiguedad_rango_label(antig_cc), False
    if dias_uc > antig_cc:
        return dias_uc, _antiguedad_rango_label(dias_uc), True
    return antig_cc, _antiguedad_rango_label(antig_cc), False


def _dias_desde_fecha(fecha_ref, hasta: date | None = None) -> int | None:
    f = _parse_fecha_iso(fecha_ref)
    if not f:
        return None
    ref = hasta or datetime.now().date()
    return max(0, (ref - f).days)


def _resolve_cc_fecha_ultima_compra(
    item: dict,
    *,
    id_cliente_pk,
    erp_label: str | None,
    erp_norm_resolved: str | None,
    name_label: str | None,
    nombre_norm: str,
    nombre_raw_upper: str,
    id_cliente_fuc_map: dict,
    erp_fuc_map: dict,
    fecha_uc_map: dict,
) -> str | None:
    """
    FUC del padrón para fila CC. Si hay ERP, solo por id_cliente / ERP (nunca por nombre homónimo).
    """
    fuc = None
    if id_cliente_pk is not None:
        try:
            fuc = id_cliente_fuc_map.get(int(id_cliente_pk))
        except (TypeError, ValueError):
            fuc = None
    erp_key = (
        _norm_erp_cliente_id(item.get("id_cliente_erp"))
        or erp_norm_resolved
        or (_norm_erp_cliente_id(erp_label) if erp_label else None)
    )
    if not fuc and erp_key:
        fuc = erp_fuc_map.get(erp_key)
    if not fuc and not erp_key:
        fuc = (
            (fecha_uc_map.get(name_label) if name_label else None)
            or fecha_uc_map.get(nombre_norm)
            or fecha_uc_map.get(nombre_raw_upper)
        )
    return fuc


def _cc_padron_incoherente(deuda: float, antiguedad_dias: int, dias_desde_compra: int | None) -> bool:
    """
    Deuda con mora baja en CC implica facturación reciente; si el padrón marca compra mucho más
    antigua, el vínculo ERP/nombre probablemente es incorrecto o el padrón está desactualizado.
    """
    if deuda <= 0 or dias_desde_compra is None:
        return False
    antig = int(antiguedad_dias or 0)
    if antig > 7:
        return False
    return dias_desde_compra > max(antig + 7, 10)


def _fuc_iso_key(fuc) -> str:
    if not fuc:
        return ""
    return str(fuc).strip()[:10]


def _merge_fuc_latest(existing, new):
    """Conserva la fecha_ultima_compra más reciente (misma regla que dedupe padrón)."""
    if not new:
        return existing
    if not existing:
        return new
    en, nn = _fuc_iso_key(existing), _fuc_iso_key(new)
    if bool(nn) != bool(en):
        return new if nn else existing
    if en and nn and nn != en:
        return new if nn > en else existing
    return existing


def _build_pdv_metadata_maps(d_id: int, cc_rows: list[dict]) -> tuple[dict, dict, dict, dict, dict, dict]:
    """
    Maps para enriquecer CC: solo PDVs referenciados en filas CC (no scan completo).
    Retorna: fecha_uc_map, erp_fuc_map, erp_id_map, id_cliente_map, erp_to_id_cliente, id_cliente_fuc_map
    """
    fecha_uc_map: dict = {}
    erp_fuc_map: dict = {}
    erp_id_map: dict = {}
    id_cliente_map: dict = {}
    erp_to_id_cliente: dict = {}
    id_cliente_fuc_map: dict = {}

    erp_values: set[str] = set()
    id_clientes: set[int] = set()
    for item in cc_rows:
        erp_norm = _norm_erp_cliente_id(item.get("id_cliente_erp"))
        if erp_norm:
            erp_values.add(erp_norm)
        pk = item.get("id_cliente")
        if pk is not None:
            try:
                id_clientes.add(int(pk))
            except (TypeError, ValueError):
                pass

    if not erp_values and not id_clientes:
        return fecha_uc_map, erp_fuc_map, erp_id_map, id_cliente_map, erp_to_id_cliente, id_cliente_fuc_map

    t_clientes = tenant_table_name("clientes_pdv_v2", d_id)

    def _ingest_pdv(p: dict) -> None:
        erp_id = p.get("id_cliente_erp")
        fuc = p.get("fecha_ultima_compra")
        pk = p.get("id_cliente")
        erp_norm = _norm_erp_cliente_id(erp_id)
        if pk is not None and fuc:
            try:
                ipk = int(pk)
                id_cliente_fuc_map[ipk] = _merge_fuc_latest(id_cliente_fuc_map.get(ipk), fuc)
            except (TypeError, ValueError):
                pass
        for key in [p.get("nombre_fantasia"), p.get("nombre_razon_social")]:
            if key:
                for norm_key in {key.strip().upper(), _norm_name(key)}:
                    if not norm_key:
                        continue
                    if fuc:
                        fecha_uc_map[norm_key] = _merge_fuc_latest(fecha_uc_map.get(norm_key), fuc)
                    if erp_id and norm_key not in erp_id_map:
                        erp_id_map[norm_key] = str(erp_id).strip()
                    if pk and norm_key not in id_cliente_map:
                        id_cliente_map[norm_key] = pk
        if erp_norm and pk and erp_norm not in erp_to_id_cliente:
            erp_to_id_cliente[erp_norm] = pk
        if erp_norm and fuc:
            erp_fuc_map[erp_norm] = _merge_fuc_latest(erp_fuc_map.get(erp_norm), fuc)

    def _fetch_by_erp_chunk(chunk: list[str]) -> None:
        offset = 0
        while True:
            batch = (
                sb.table(t_clientes)
                .select("id_cliente, nombre_fantasia, nombre_razon_social, id_cliente_erp, fecha_ultima_compra")
                .eq("id_distribuidor", d_id)
                .in_("id_cliente_erp", chunk)
                .range(offset, offset + 999)
                .execute()
                .data or []
            )
            for p in batch:
                _ingest_pdv(p)
            if len(batch) < 1000:
                break
            offset += 1000

    def _fetch_by_id_chunk(chunk: list[int]) -> None:
        batch = (
            sb.table(t_clientes)
            .select("id_cliente, nombre_fantasia, nombre_razon_social, id_cliente_erp, fecha_ultima_compra")
            .eq("id_distribuidor", d_id)
            .in_("id_cliente", chunk)
            .execute()
            .data or []
        )
        for p in batch:
            _ingest_pdv(p)

    erp_list = sorted(erp_values)
    for i in range(0, len(erp_list), 400):
        _fetch_by_erp_chunk(erp_list[i : i + 400])

    id_list = sorted(id_clientes)
    for i in range(0, len(id_list), 400):
        _fetch_by_id_chunk(id_list[i : i + 400])

    return fecha_uc_map, erp_fuc_map, erp_id_map, id_cliente_map, erp_to_id_cliente, id_cliente_fuc_map


def _exhibido_cliente_ids_en_mes(
    dist_id: int,
    client_ids: list[int],
    fecha_inicio: str,
    fecha_fin: str,
) -> set[int]:
    """Una o pocas queries batch en lugar de N× limit(1)."""
    if not client_ids:
        return set()
    out: set[int] = set()
    uniq = list({int(c) for c in client_ids})
    for i in range(0, len(uniq), 400):
        chunk = uniq[i : i + 400]
        offset = 0
        while True:
            batch = (
                sb.table("exhibiciones")
                .select("id_cliente_pdv")
                .eq("id_distribuidor", dist_id)
                .in_("id_cliente_pdv", chunk)
                .gte("timestamp_subida", fecha_inicio)
                .lte("timestamp_subida", fecha_fin)
                .range(offset, offset + 999)
                .execute()
                .data or []
            )
            for row in batch:
                cid = row.get("id_cliente_pdv")
                if cid is not None:
                    out.add(int(cid))
            if len(batch) < 1000:
                break
            offset += 1000
    return out


@router.get("/api/supervision/cuentas/{dist_id}", tags=["Supervisión"])
def supervision_cuentas(
    dist_id: int,
    sucursal: Optional[str] = Query(None),
    fecha: Optional[str] = Query(None),
    vendedor: Optional[str] = Query(None),
    id_vendedor: Optional[int] = Query(None, description="Filtrar por PK vendedores_v2 (más fiable que nombre)"),
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    try:
        try:
            d_id = int(dist_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="ID de distribuidor inválido")

        q_snap = (
            sb.table("cc_detalle")
            .select("fecha_snapshot")
            .eq("id_distribuidor", d_id)
        )
        if fecha:
            q_snap = q_snap.lte("fecha_snapshot", fecha)
        snap_res = q_snap.order("fecha_snapshot", desc=True).limit(1).execute()
        if not snap_res.data:
            logger.warning(f"No se encontró fecha_snapshot en cc_detalle para dist_id={d_id}")
            return {"fecha": None, "metadatos": {}, "vendedores": []}

        fecha_snapshot = snap_res.data[0]["fecha_snapshot"]

        sucursal_norm = sucursal
        valid_vend_ids: set[int] | None = None
        sucursal_upper: str | None = None
        if sucursal_norm:
            valid_vend_ids, sucursal_upper = _resolve_sucursal_vendedor_ids(d_id, sucursal_norm)

        vid_filtro_sql: int | None = None
        if id_vendedor is not None:
            try:
                vid_filtro_sql = int(id_vendedor)
            except (TypeError, ValueError):
                vid_filtro_sql = None

        rows = _fetch_cc_detalle_rows(
            d_id,
            fecha_snapshot,
            id_vendedor=vid_filtro_sql,
            valid_vend_ids=valid_vend_ids if sucursal_norm and not vid_filtro_sql else None,
            sucursal_norm_upper=sucursal_upper if sucursal_norm and not vid_filtro_sql else None,
        )

        # Filtrar por vendedor (nombre legacy cuando no hay id_vendedor en query).
        # cc_detalle.vendedor_nombre viene de CHESS ("717 0717 - LUCIANO GONZALEZ");
        # vendedores_v2.nombre_erp puede diferir ("LUCIANO AID") — matchear por id_vendedor_erp / id_vendedor.
        if id_vendedor is not None or vendedor:
            vend_row: dict | None = None
            try:
                t_vend_filter = tenant_table_name("vendedores_v2", d_id)
                vend_lookup = (
                    sb.table(t_vend_filter)
                    .select("id_vendedor, id_vendedor_erp, nombre_erp")
                    .eq("id_distribuidor", d_id)
                    .execute()
                )
                if id_vendedor is not None:
                    for vr in vend_lookup.data or []:
                        try:
                            if int(vr.get("id_vendedor")) == int(id_vendedor):
                                vend_row = vr
                                break
                        except (TypeError, ValueError):
                            continue
                if not vend_row and vendedor:
                    target = _norm_name(vendedor)
                    for vr in vend_lookup.data or []:
                        if _norm_name(vr.get("nombre_erp") or "") == target:
                            vend_row = vr
                            break
            except Exception as e:
                logger.warning(f"[supervision_cuentas] lookup vendedor dist={d_id}: {e}")

            nombre_filtro = (vend_row or {}).get("nombre_erp") or vendedor or ""
            vid_filtro = (vend_row or {}).get("id_vendedor") or id_vendedor
            erp_filtro = (vend_row or {}).get("id_vendedor_erp")
            rows = [
                r for r in rows
                if cc_row_matches_vendedor_erp(
                    r.get("vendedor_nombre") or "",
                    r.get("id_vendedor"),
                    nombre_filtro,
                    id_vendedor=vid_filtro,
                    id_vendedor_erp=erp_filtro,
                )
            ]

        try:
            fecha_uc_map, erp_fuc_map, erp_id_map, id_cliente_map, erp_to_id_cliente, id_cliente_fuc_map = _build_pdv_metadata_maps(
                d_id, rows
            )
        except Exception as e:
            logger.warning(f"[supervision_cuentas] PDV metadata scoped error dist={d_id}: {e}")
            fecha_uc_map, erp_fuc_map, erp_id_map, id_cliente_map, erp_to_id_cliente, id_cliente_fuc_map = {}, {}, {}, {}, {}, {}

        vendors: dict = {}
        for item in rows:
            # Normalize vendor keys for grouping
            raw_v_name = (item.get("vendedor_nombre") or "Sin Vendedor").strip()
            v_key = str(item.get("id_vendedor") or raw_v_name.upper())

            if v_key not in vendors:
                vendors[v_key] = {
                    "id_vendedor": item.get("id_vendedor"),
                    "vendedor": raw_v_name,
                    "sucursal": item.get("sucursal_nombre") or "",
                    "deuda_total": 0.0, "cantidad_clientes": 0, "clientes": [],
                }
            vd = vendors[v_key]
            deuda = float(item.get("deuda_total") or 0)
            vd["deuda_total"]     += deuda
            vd["cantidad_clientes"] += 1
            # Lookup: CC trae "050014 - RAZON SOCIAL"; padrón indexa por nombre_fantasia/razón y erp 50014.
            nombre_norm = _norm_name(item.get("cliente_nombre"))
            nombre_raw_upper = (item.get("cliente_nombre") or "").strip().upper()
            erp_label, name_label = _parse_cc_cliente_label(item.get("cliente_nombre"))
            erp_resolved = (
                item.get("id_cliente_erp")
                or (erp_label if erp_label else None)
                or erp_id_map.get(name_label or "")
                or erp_id_map.get(nombre_norm)
                or erp_id_map.get(nombre_raw_upper)
            )
            erp_norm_resolved = _norm_erp_cliente_id(erp_resolved)
            id_cliente_pk = item.get("id_cliente")
            if not id_cliente_pk:
                id_cliente_pk = (
                    (erp_to_id_cliente.get(erp_label) if erp_label else None)
                    or (id_cliente_map.get(name_label) if name_label else None)
                    or id_cliente_map.get(nombre_norm)
                    or id_cliente_map.get(nombre_raw_upper)
                    or (erp_to_id_cliente.get(erp_norm_resolved) if erp_norm_resolved else None)
                )
            fuc = _resolve_cc_fecha_ultima_compra(
                item,
                id_cliente_pk=id_cliente_pk,
                erp_label=erp_label,
                erp_norm_resolved=erp_norm_resolved,
                name_label=name_label,
                nombre_norm=nombre_norm,
                nombre_raw_upper=nombre_raw_upper,
                id_cliente_fuc_map=id_cliente_fuc_map,
                erp_fuc_map=erp_fuc_map,
                fecha_uc_map=fecha_uc_map,
            )
            hoy_ar = _today_ar()
            dias_uc = _dias_desde_fecha(fuc, hoy_ar) if fuc else None
            antig_cc = int(item.get("antiguedad_dias") or 0)
            antig_show, rango_show, desde_padron = _antiguedad_supervision_display(
                antig_cc, dias_uc, deuda
            )
            erp_cc = (
                _norm_erp_cliente_id(item.get("id_cliente_erp"))
                or erp_norm_resolved
                or (_norm_erp_cliente_id(erp_label) if erp_label else None)
            )
            incoherente = _cc_padron_incoherente(deuda, antig_cc, dias_uc) and not erp_cc
            vd["clientes"].append({
                "cliente": item.get("cliente_nombre"), "id_cliente_erp": erp_resolved,
                "id_cliente": id_cliente_pk,
                "sucursal": item.get("sucursal_nombre"), "deuda_total": deuda,
                "deuda_7_dias": float(item.get("deuda_7_dias") or 0),
                "deuda_15_dias": float(item.get("deuda_15_dias") or 0),
                "deuda_30_dias": float(item.get("deuda_30_dias") or 0),
                "deuda_60_dias": float(item.get("deuda_60_dias") or 0),
                "deuda_mas_60_dias": float(item.get("deuda_mas_60_dias") or 0),
                "antiguedad": antig_show,
                "antiguedad_cc": antig_cc,
                "antiguedad_desde_padron": desde_padron,
                "rango_antiguedad": rango_show,
                "cantidad_comprobantes": item.get("cantidad_comprobantes"),
                "fecha_ultima_compra": fuc,
                "dias_desde_ultima_compra": dias_uc,
                "padron_cc_alerta": incoherente,
            })

        for vd in vendors.values():
            vd["clientes"].sort(key=lambda x: x["antiguedad"] or 0, reverse=True)
        result = sorted(vendors.values(), key=lambda x: x["deuda_total"], reverse=True)

        all_clientes = [c for v in result for c in v["clientes"]]
        total_deuda  = sum(v["deuda_total"] for v in result)
        total_cli    = sum(v["cantidad_clientes"] for v in result)
        avg_dias     = (sum(c["antiguedad"] or 0 for c in all_clientes) / len(all_clientes) if all_clientes else 0)

        return {
            "fecha": fecha_snapshot,
            "metadatos": {
                "total_deuda": round(total_deuda, 2),
                "clientes_deudores": total_cli,
                "promedio_dias_retraso": round(avg_dias, 1),
            },
            "vendedores": result,
        }
    except Exception as e:
        logger.error(f"Error en supervision_cuentas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _supervision_parse_mes(mes: str) -> tuple[int, int, int, str, str]:
    """Año, mes, último día, fecha_inicio y fecha_fin (AR) para un mes calendario YYYY-MM."""
    import calendar as _cal

    try:
        year, month = int(mes[:4]), int(mes[5:7])
    except Exception:
        raise HTTPException(status_code=422, detail="mes debe ser YYYY-MM")
    if month < 1 or month > 12:
        raise HTTPException(status_code=422, detail="mes debe ser YYYY-MM")
    last_day = _cal.monthrange(year, month)[1]
    fecha_inicio = f"{year}-{month:02d}-01T00:00:00-03:00"
    fecha_fin = f"{year}-{month:02d}-{last_day:02d}T23:59:59-03:00"
    return year, month, last_day, fecha_inicio, fecha_fin


def _supervision_route_ids(dist_id: int, id_vendedor: int) -> list[int]:
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    try:
        try:
            rr = (
                sb.table(t_rutas)
                .select("id_ruta")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor", id_vendedor)
                .execute()
            )
        except Exception:
            rr = (
                sb.table(t_rutas)
                .select("id_ruta")
                .eq("id_vendedor", id_vendedor)
                .execute()
            )
        return [int(r.get("id_ruta")) for r in (rr.data or []) if r.get("id_ruta") is not None]
    except Exception:
        return []


def _supervision_clients_by_route(
    dist_id: int, route_ids: list[int], select_cols: str,
) -> dict[int, dict]:
    """Mapa id_cliente → fila de clientes_pdv_v2 en las rutas del vendedor."""
    if not route_ids:
        return {}
    t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
    out: dict[int, dict] = {}
    PAGE = 1000
    offset = 0
    while True:
        batch = (
            sb.table(t_clientes)
            .select(select_cols)
            .eq("id_distribuidor", dist_id)
            .in_("id_ruta", route_ids)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data or []
        )
        for r in batch:
            cid = r.get("id_cliente")
            if isinstance(cid, int):
                out[cid] = r
        if len(batch) < PAGE:
            break
        offset += PAGE
    return out


def _supervision_compradores_mes(
    dist_id: int,
    client_by_id: dict[int, dict],
    fecha_desde: str,
    fecha_hasta: str,
) -> tuple[Set[int], dict[int, str]]:
    """
    PDVs compradores en mes calendario:
    1) ventas_enriched_v2 (Informe de Ventas Consolido), si hay ingesta.
    2) Fallback padrón: fecha_ultima_compra en el mes (distribuidoras sin motor ventas).

    Delega el cálculo del conjunto a core/objetivos_compradores.py y construye
    localmente ultima_compra_mes (necesario para el panel de supervisión).
    """
    from core.objetivos_compradores import compradores_en_periodo_for_clients

    comprador_ids: Set[int] = compradores_en_periodo_for_clients(
        dist_id, client_by_id, fecha_desde, fecha_hasta
    )

    # Construir ultima_compra_mes para el panel (info extra que supervision necesita)
    ultima_compra_mes: dict[int, str] = {}
    desde = fecha_desde[:10]
    hasta = fecha_hasta[:10]
    for cid in comprador_ids:
        row = client_by_id.get(cid) or {}
        fuc = str(row.get("fecha_ultima_compra") or "")[:10]
        if len(fuc) >= 10 and desde <= fuc <= hasta:
            ultima_compra_mes[int(cid)] = fuc

    return comprador_ids, ultima_compra_mes


def _supervision_exhibido_en_mes(dist_id: int, id_cl: int, fecha_inicio: str, fecha_fin: str) -> bool:
    ex = (
        sb.table("exhibiciones")
        .select("id_exhibicion")
        .eq("id_distribuidor", dist_id)
        .eq("id_cliente_pdv", id_cl)
        .gte("timestamp_subida", fecha_inicio)
        .lte("timestamp_subida", fecha_fin)
        .limit(1)
        .execute()
    )
    return bool(ex.data)


@router.get("/api/supervision/vendedor/{dist_id}/{id_vendedor}/pdvs-movimiento", tags=["Supervisión"])
def supervision_pdvs_movimiento(
    dist_id: int,
    id_vendedor: int,
    mes: str = Query(..., description="Mes en formato YYYY-MM"),
    categorias: str = Query("alta,comprador"),
    user_payload=Depends(verify_auth),
):
    """Retorna PDVs dados de alta o compradores (venta en mes calendario) para un vendedor."""
    try:
        check_dist_permission(user_payload, dist_id)
        _, _, _, fecha_inicio, fecha_fin = _supervision_parse_mes(mes)

        cats = [c.strip() for c in categorias.split(",")]
        t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
        t_exhib    = "exhibiciones"

        items = []
        seen_ids: set[int] = set()
        item_index_by_cid: dict[int, int] = {}
        comprador_ids: Set[int] = set()

        route_ids = _supervision_route_ids(dist_id, id_vendedor)

        def _fetch_client_rows(select_cols: str, date_col: str) -> list[dict]:
            PAGE = 1000
            all_rows: list[dict] = []
            # clientes_pdv_v2 no tiene `id_vendedor`; resolvemos el vínculo por `id_ruta`.
            if not route_ids:
                return []

            offset = 0
            while True:
                q = (
                    sb.table(t_clientes)
                    .select(select_cols)
                    .eq("id_distribuidor", dist_id)
                    .in_("id_ruta", route_ids)
                    .gte(date_col, fecha_inicio if date_col == "created_at" else fecha_inicio[:10])
                    .lte(date_col, fecha_fin if date_col == "created_at" else fecha_fin[:10])
                    .range(offset, offset + PAGE - 1)
                )
                batch = q.execute().data or []
                all_rows.extend(batch)
                if len(batch) < PAGE:
                    break
                offset += PAGE
            return all_rows

        pending_exhib: list[tuple[int, int]] = []

        if "alta" in cats:
            rows = _fetch_client_rows(
                "id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social, domicilio, localidad, fecha_alta, id_ruta",
                "fecha_alta",
            )
            for r in rows:
                id_cl = r.get("id_cliente")
                if isinstance(id_cl, int) and id_cl in seen_ids:
                    continue
                idx = len(items)
                if isinstance(id_cl, int):
                    pending_exhib.append((int(id_cl), idx))
                items.append({
                    "id_cliente_erp": r.get("id_cliente_erp"),
                    "nombre": (r.get("nombre_fantasia") or r.get("nombre_razon_social") or "").strip(),
                    "razon_social": (r.get("nombre_razon_social") or "").strip(),
                    "direccion": r.get("domicilio", ""),
                    "localidad": r.get("localidad", ""),
                    "categoria": "alta",
                    "exhibido": False,
                    "fecha_evento": r.get("fecha_alta"),
                    "es_comprador_mes": False,
                })
                if isinstance(id_cl, int):
                    seen_ids.add(id_cl)
                    item_index_by_cid[id_cl] = len(items) - 1

        if "activacion" in cats:
            rows = _fetch_client_rows(
                "id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social, domicilio, localidad, fecha_ultima_compra, fecha_alta, id_ruta",
                "fecha_ultima_compra",
            )
            # Activación real: compra en mes + no haber estado activo al inicio del mes.
            start_dt = datetime.fromisoformat(f"{fecha_inicio[:10]}T00:00:00")
            threshold_prev = (start_dt - timedelta(days=30)).date().isoformat()
            erp_for_prev: dict[str, int] = {}
            for r in rows:
                cid = r.get("id_cliente")
                erp = str(r.get("id_cliente_erp") or "").strip()
                if isinstance(cid, int) and erp:
                    erp_for_prev[erp] = int(cid)
            prev_last_by_id: dict[int, str] = {}
            if erp_for_prev:
                t_ventas = tenant_table_name("ventas_enriched_v2", dist_id)
                erp_list = list(erp_for_prev.keys())
                for i in range(0, len(erp_list), 400):
                    chunk = erp_list[i:i + 400]
                    try:
                        vr = (
                            sb.table(t_ventas)
                            .select("id_cliente_erp,fecha_factura")
                            .eq("id_distribuidor", dist_id)
                            .eq("anulado", False)
                            .in_("id_cliente_erp", chunk)
                            .lt("fecha_factura", fecha_inicio[:10])
                            .order("fecha_factura", desc=True)
                            .execute()
                        )
                        for v in (vr.data or []):
                            erp = str(v.get("id_cliente_erp") or "").strip()
                            cid = erp_for_prev.get(erp)
                            f = str(v.get("fecha_factura") or "")[:10]
                            if cid is not None and f and cid not in prev_last_by_id:
                                prev_last_by_id[cid] = f
                    except Exception as e_prev:
                        logger.warning(f"[pdvs-movimiento] lookup ventas prev falló: {e_prev}")
            for r in rows:
                falta = (r.get("fecha_alta") or "")[:10]
                fuc = r.get("fecha_ultima_compra", "") or ""
                is_alta = (falta >= fecha_inicio[:10] and falta <= fecha_fin[:10])
                if is_alta:
                    continue
                id_cl = r.get("id_cliente")
                if isinstance(id_cl, int) and id_cl in seen_ids:
                    continue
                # Solo activaciones (transición): sin compra previa o con previa vieja (>30d al inicio mes).
                prev_f = prev_last_by_id.get(id_cl) if isinstance(id_cl, int) else None
                if prev_f and prev_f > threshold_prev:
                    continue
                idx = len(items)
                if isinstance(id_cl, int):
                    pending_exhib.append((int(id_cl), idx))
                items.append({
                    "id_cliente_erp": r.get("id_cliente_erp"),
                    "nombre": (r.get("nombre_fantasia") or r.get("nombre_razon_social") or "").strip(),
                    "razon_social": (r.get("nombre_razon_social") or "").strip(),
                    "direccion": r.get("domicilio", ""),
                    "localidad": r.get("localidad", ""),
                    "categoria": "activacion",
                    "exhibido": False,
                    "fecha_evento": fuc,
                    "es_comprador_mes": False,
                })
                if isinstance(id_cl, int):
                    seen_ids.add(id_cl)
                    item_index_by_cid[id_cl] = len(items) - 1

        if "comprador" in cats:
            client_by_id = _supervision_clients_by_route(
                dist_id,
                route_ids,
                "id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social, domicilio, localidad, fecha_ultima_compra",
            )
            comprador_ids, ultima_compra_mes = _supervision_compradores_mes(
                dist_id,
                client_by_id,
                fecha_inicio,
                fecha_fin,
            )
            comprador_exhib = _exhibido_cliente_ids_en_mes(
                dist_id, list(comprador_ids), fecha_inicio, fecha_fin
            )
            for id_cl in sorted(comprador_ids):
                f_compra = ultima_compra_mes.get(id_cl)
                if id_cl in seen_ids:
                    idx = item_index_by_cid.get(id_cl)
                    if idx is not None:
                        items[idx]["es_comprador_mes"] = True
                        if f_compra:
                            items[idx]["fecha_compra_mes"] = f_compra
                    continue
                r = client_by_id.get(id_cl) or {}
                items.append({
                    "id_cliente_erp": r.get("id_cliente_erp"),
                    "nombre": (r.get("nombre_fantasia") or r.get("nombre_razon_social") or "").strip(),
                    "razon_social": (r.get("nombre_razon_social") or "").strip(),
                    "direccion": r.get("domicilio", ""),
                    "localidad": r.get("localidad", ""),
                    "categoria": "comprador",
                    "exhibido": id_cl in comprador_exhib,
                    "fecha_evento": f_compra,
                    "es_comprador_mes": True,
                })
                seen_ids.add(id_cl)
                item_index_by_cid[id_cl] = len(items) - 1

        if pending_exhib:
            exhib_ids = _exhibido_cliente_ids_en_mes(
                dist_id,
                [cid for cid, _ in pending_exhib],
                fecha_inicio,
                fecha_fin,
            )
            for cid, idx in pending_exhib:
                if cid in exhib_ids:
                    items[idx]["exhibido"] = True

        total_altas = sum(1 for i in items if i["categoria"] == "alta")
        total_activaciones = sum(1 for i in items if i["categoria"] == "activacion")
        total_compradores = len(comprador_ids)
        return {
            "items": items,
            "total_altas": total_altas,
            "total_activaciones": total_activaciones,
            "total_compradores": total_compradores,
            "has_more": False,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en supervision_pdvs_movimiento: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/cliente-info/{dist_id}", tags=["Supervisión"])
def supervision_cliente_info(
    dist_id: int, nombre: str,
    id_cliente_erp: Optional[str] = Query(None),
    user_payload=Depends(verify_auth),
):
    def _strip_accents(s: str) -> str:
        return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

    try:
        check_dist_permission(user_payload, dist_id)
        fields       = "id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social, domicilio, localidad, provincia, canal, latitud, longitud, fecha_ultima_compra, estado"
        nombre_s     = nombre.strip()
        nombre_plain = _strip_accents(nombre_s)

        if id_cliente_erp:
            t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
            r = sb.table(t_clientes).select(fields).eq("id_distribuidor", dist_id).eq("id_cliente_erp", id_cliente_erp.strip()).limit(3).execute()
            if r.data:
                return r.data

        def _search(col: str, val: str, substring: bool = False) -> list:
            pattern = f"%{val}%" if substring else val
            t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
            r = sb.table(t_clientes).select(fields).eq("id_distribuidor", dist_id).ilike(col, pattern).limit(3).execute()
            return r.data or []

        for col in ("nombre_razon_social", "nombre_fantasia"):
            data = _search(col, nombre_s)
            if data: return data
        for col in ("nombre_razon_social", "nombre_fantasia"):
            data = _search(col, nombre_plain)
            if data: return data
        for col in ("nombre_razon_social", "nombre_fantasia"):
            data = _search(col, nombre_s, substring=True)
            if data: return data
        for col in ("nombre_razon_social", "nombre_fantasia"):
            data = _search(col, nombre_plain, substring=True)
            if data: return data

        words = [w for w in _strip_accents(nombre_s).split() if len(w) > 2]
        if words:
            for col in ("nombre_razon_social", "nombre_fantasia"):
                try:
                    t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
                    q = sb.table(t_clientes).select(fields).eq("id_distribuidor", dist_id)
                    for w in words:
                        q = q.ilike(col, f"%{w}%")
                    r = q.limit(3).execute()
                    if r.data: return r.data
                except Exception:
                    pass
        return []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en supervision_cliente_info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Scanner GPS ──────────────────────────────────────────────────────────────

def haversine_metros(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi       = math.radians(lat2 - lat1)
    dlambda    = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.get("/api/supervision/pdvs-cercanos", tags=["Supervisión"], deprecated=True)
def pdvs_cercanos(
    lat: float, lng: float, radio: int = 500, dist_id: int = 0,
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, int(dist_id))
    radio = min(radio, 5000)

    def parse_coord(v):
        if v is None: return None
        try: return float(str(v).replace(",", "."))
        except (ValueError, TypeError): return None

    try:
        todos = []
        PAGE, offset = 1000, 0
        while True:
            t_clientes = tenant_table_name("clientes_pdv_v2", int(dist_id))
            page_res = (
                sb.table(t_clientes)
                .select("id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social, domicilio, localidad, provincia, canal, latitud, longitud, fecha_alta, fecha_ultima_compra, id_ruta")
                .eq("id_distribuidor", int(dist_id))
                .neq("es_limbo", True)
                .limit(PAGE).offset(offset)
                .execute()
            )
            batch = page_res.data or []
            todos.extend(batch)
            if len(batch) < PAGE: break
            offset += PAGE
            if offset >= 20000: break
        logger.info(f"[SCANNER] dist_id={dist_id} lat={lat} lng={lng} radio={radio} — total_pdvs={len(todos)}")

        todos_con_dist = []
        for row in todos:
            plat = parse_coord(row.get("latitud"))
            plng = parse_coord(row.get("longitud"))
            if plat is None or plng is None: continue
            if plat == 0.0 and plng == 0.0:  continue
            try:
                d = haversine_metros(lat, lng, plat, plng)
            except (TypeError, ValueError):
                continue
            todos_con_dist.append((row, d))
        todos_con_dist.sort(key=lambda x: x[1])

        fallback = False
        cercanos = [(r, d) for r, d in todos_con_dist if d <= radio]
        if not cercanos:
            cercanos = todos_con_dist[:5]
            fallback = True
        if not cercanos:
            return {"fallback": False, "pdvs": []}

        ids_ruta = list({r[0]["id_ruta"] for r in cercanos if r[0].get("id_ruta")})
        ruta_map: dict = {}
        vendedor_map: dict = {}
        if ids_ruta:
            t_rutas = tenant_table_name("rutas_v2", int(dist_id))
            t_vendedores = tenant_table_name("vendedores_v2", int(dist_id))
            rutas_res = sb.table(t_rutas).select("id_ruta, id_ruta_erp, id_vendedor").in_("id_ruta", ids_ruta).execute()
            for r in rutas_res.data or []:
                ruta_map[r["id_ruta"]] = r
            ids_vend = list({r["id_vendedor"] for r in (rutas_res.data or []) if r.get("id_vendedor")})
            if ids_vend:
                vend_res = sb.table(t_vendedores).select("id_vendedor, nombre_erp").in_("id_vendedor", ids_vend).execute()
                for v in vend_res.data or []:
                    vendedor_map[v["id_vendedor"]] = v["nombre_erp"]

        ids_cercanos = [r[0]["id_cliente"] for r in cercanos]
        ultima_exhibicion_map: dict = {}
        try:
            exh_res = (
                sb.table("exhibiciones")
                .select("id_cliente_pdv, created_at")
                .eq("id_distribuidor", dist_id)
                .in_("id_cliente_pdv", ids_cercanos)
                .order("created_at", desc=True)
                .execute()
            )
            for e in exh_res.data or []:
                cid = e.get("id_cliente_pdv")
                if cid and cid not in ultima_exhibicion_map:
                    ultima_exhibicion_map[cid] = e.get("created_at")
        except Exception:
            pass

        result = []
        for row, dist in cercanos:
            ruta_info = ruta_map.get(row.get("id_ruta") or 0, {})
            result.append({
                "id_cliente": row["id_cliente"], "id_cliente_erp": row.get("id_cliente_erp"),
                "nombre_fantasia": row.get("nombre_fantasia"), "nombre_razon_social": row.get("nombre_razon_social"),
                "domicilio": row.get("domicilio"), "localidad": row.get("localidad"),
                "provincia": row.get("provincia"), "canal": row.get("canal"),
                "latitud": row.get("latitud"), "longitud": row.get("longitud"),
                "fecha_alta": row.get("fecha_alta"), "fecha_ultima_compra": row.get("fecha_ultima_compra"),
                "fecha_ultima_exhibicion": ultima_exhibicion_map.get(row["id_cliente"]),
                "vendedor_nombre": vendedor_map.get(ruta_info.get("id_vendedor")),
                "ruta_nombre": ruta_info.get("id_ruta_erp"),
                "distancia_metros": round(dist, 1),
            })
        return {"fallback": fallback, "pdvs": result}
    except Exception as e:
        logger.error(f"Error en pdvs_cercanos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Objetivos ────────────────────────────────────────────────────────────────

def _compute_kanban_phase(obj: dict) -> str:
    """
    Deriva la columna Kanban de un objetivo a partir de su estado y sus ítems.
    Retorna: 'planificado' | 'pendiente' | 'en_progreso' | 'terminado'
    """
    # Planificado solo si: sin lanzar AND fecha_inicio aún en futuro AR AND no cumplido
    if not obj.get("lanzado_at") and not obj.get("cumplido"):
        from datetime import datetime, timezone, timedelta
        _tz_ar = timezone(timedelta(hours=-3))
        hoy_ar = datetime.now(_tz_ar).date().isoformat()
        fecha_inicio = obj.get("fecha_inicio")
        if fecha_inicio:
            fecha_inicio_str = str(fecha_inicio)[:10]
            if fecha_inicio_str > hoy_ar:
                return "planificado"
        else:
            # sin fecha_inicio → legacy, tratar como ya activo
            pass
        # lanzado_at NULL pero fecha_inicio <= hoy: tratar como activo (caen al bloque siguiente)

    if obj.get("cumplido"):
        return "terminado"

    tipo = obj.get("tipo")
    obj_items = obj.get("items", [])
    items_count = obj.get("items_count", 0)
    items_cumplidos = obj.get("items_cumplidos", 0)

    if tipo == "exhibicion":
        # En progreso: al menos un ítem con foto subida o cumplido, no todos terminados
        items_con_foto = sum(
            1 for it in obj_items
            if it.get("estado_item") in ("foto_subida", "cumplido")
        )
        if items_count > 0:
            resolved = sum(
                1
                for it in obj_items
                if it.get("estado_item") in ("cumplido", "falla")
            )
            if resolved >= items_count:
                return "terminado"
            if items_con_foto > 0:
                return "en_progreso"
            return "pendiente"
        # Fallback sin ítems: usa tiene_exhibicion_pendiente o valor_actual
        if obj.get("tiene_exhibicion_pendiente"):
            return "en_progreso"
        if (obj.get("valor_actual") or 0) > 0:
            return "en_progreso"
        return "pendiente"

    # Alteo / activación / cobranza
    valor_actual = obj.get("valor_actual") or 0
    valor_objetivo = obj.get("valor_objetivo")

    if items_count > 0:
        if items_count == 1:
            # Un solo ítem: Pendiente → Terminado directamente
            return "terminado" if items_cumplidos >= 1 else "pendiente"
        # Multi-PDV: En progreso si al menos uno cumplió
        if items_cumplidos >= items_count:
            return "terminado"
        if items_cumplidos > 0:
            return "en_progreso"
        return "pendiente"

    # Fallback sin ítems: valor_actual > 0 → en_progreso
    if valor_actual > 0:
        if valor_objetivo and valor_actual >= float(valor_objetivo):
            return "terminado"
        return "en_progreso"
    return "pendiente"

@router.post("/api/supervision/objetivos", tags=["Supervisión"])
def crear_objetivo(body: ObjetivoCreate, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, body.id_distribuidor)
    TIPOS_VALIDOS = {"conversion_estado", "cobranza", "ruteo_alteo", "exhibicion", "ruteo", "compradores"}
    if body.tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"tipo inválido. Valores permitidos: {sorted(TIPOS_VALIDOS)}")

    # Para tipo compradores: valor_objetivo (N PDVs) es obligatorio y >= 1
    if body.tipo == "compradores":
        if not body.valor_objetivo or float(body.valor_objetivo) < 1:
            raise HTTPException(status_code=422, detail="tipo 'compradores' requiere valor_objetivo >= 1 (cantidad de PDVs distintos)")

    # Para tipo ruteo: pdv_items es obligatorio y cada ítem debe tener accion_ruteo válida
    if body.tipo == "ruteo":
        if not body.pdv_items:
            raise HTTPException(status_code=400, detail="tipo 'ruteo' requiere pdv_items con al menos 1 PDV")
        ACCIONES_VALIDAS = {"cambio_ruta", "baja"}
        for item in body.pdv_items:
            if not item.accion_ruteo or item.accion_ruteo not in ACCIONES_VALIDAS:
                raise HTTPException(status_code=400, detail=f"Cada ítem de ruteo debe tener accion_ruteo en {ACCIONES_VALIDAS}")
            if item.accion_ruteo == "cambio_ruta" and not item.id_ruta_destino:
                raise HTTPException(status_code=400, detail=f"PDV {item.id_cliente_pdv}: accion 'cambio_ruta' requiere id_ruta_destino")
            if item.accion_ruteo == "baja" and not (item.motivo_baja and item.motivo_baja.strip()):
                raise HTTPException(status_code=400, detail=f"PDV {item.id_cliente_pdv}: accion 'baja' requiere motivo_baja")

    # Validar roles para objetivos de compañía
    if body.origen == "compania":
        rol = user_payload.get("rol", "")
        is_superadmin = user_payload.get("is_superadmin", False)
        if not is_superadmin and rol not in ("directorio", "superadmin"):
            raise HTTPException(status_code=403, detail="Solo directorio y superadmin pueden crear objetivos de compañía")
        if not body.mes_referencia:
            raise HTTPException(status_code=422, detail="mes_referencia requerido para objetivos de compañía")
        # Validar unicidad de objetivo de compañía activo para ese vendedor/tipo/mes
        try:
            dup_q = (
                sb.table("objetivos")
                .select("id")
                .eq("id_distribuidor", body.id_distribuidor)
                .eq("id_vendedor", body.id_vendedor)
                .eq("tipo", body.tipo)
                .eq("origen", "compania")
                .eq("mes_referencia", body.mes_referencia.isoformat())
                .neq("estado", "archivado")
                .limit(1)
                .execute()
            )
            if dup_q.data:
                raise HTTPException(
                    status_code=409,
                    detail="Ya existe un objetivo de compañía activo para este vendedor/tipo/mes",
                )
        except HTTPException:
            raise
        except Exception as e_dup_compania:
            logger.warning(f"[Objetivo] Error al verificar unicidad compañía: {e_dup_compania}")
    else:
        if not body.fecha_objetivo:
            raise HTTPException(status_code=422, detail="fecha_objetivo es obligatoria")

    if body.fecha_objetivo and body.fecha_inicio:
        fi = str(body.fecha_inicio)[:10]
        ff = str(body.fecha_objetivo)[:10]
        if fi > ff:
            raise HTTPException(
                status_code=422,
                detail=f"fecha_inicio ({fi}) no puede ser posterior a fecha_objetivo ({ff})",
            )

    # Validar que el vendedor pertenece a la distribuidora + no es bucket
    t_vendedores = tenant_table_name("vendedores_v2", body.id_distribuidor)
    vend_check = sb.table(t_vendedores).select("id_vendedor, nombre_erp").eq("id_vendedor", body.id_vendedor).eq("id_distribuidor", body.id_distribuidor).limit(1).execute()
    if not user_payload.get("is_superadmin") and not vend_check.data:
        raise HTTPException(status_code=400, detail="El vendedor no pertenece a la distribuidora indicada")
    if vend_check.data:
        nombre_erp_vendedor = (vend_check.data[0].get("nombre_erp") or "").strip()
        if is_vendedor_excluido_objetivos(nombre_erp_vendedor):
            raise HTTPException(status_code=400, detail=f"El vendedor '{nombre_erp_vendedor}' es un bucket operativo y no puede recibir objetivos")

    # Validar que todos los PDV ítems pertenecen a la distribuidora
    if not user_payload.get("is_superadmin") and body.pdv_items:
        pdv_ids = [item.id_cliente_pdv for item in body.pdv_items]
        t_clientes = tenant_table_name("clientes_pdv_v2", body.id_distribuidor)
        pdv_check = sb.table(t_clientes).select("id_cliente").in_("id_cliente", pdv_ids).eq("id_distribuidor", body.id_distribuidor).execute()
        found_ids = {r["id_cliente"] for r in (pdv_check.data or [])}
        invalid = set(pdv_ids) - found_ids
        if invalid:
            raise HTTPException(status_code=400, detail=f"PDV(s) {invalid} no pertenecen a la distribuidora indicada")

    # ── Guard de duplicados ───────────────────────────────────────────────────
    # Previene crear dos objetivos activos del mismo tipo/vendedor que colisionen.
    # Excepción de negocio: tipos de ruteo ('ruteo' y 'ruteo_alteo') funcionan
    # como ayuda operativa y se permite crear múltiples objetivos simultáneos
    # para el mismo vendedor.
    # Para exhibición, adicionalmente verifica solapamiento de PDV ítems.
    try:
        if body.tipo not in {"ruteo", "ruteo_alteo"}:
            existing_q = (
                sb.table("objetivos")
                .select("id, tipo, descripcion")
                .eq("id_distribuidor", body.id_distribuidor)
                .eq("id_vendedor", body.id_vendedor)
                .eq("tipo", body.tipo)
                .eq("origen", body.origen)
                .eq("cumplido", False)
                .limit(1)
                .execute()
            )
            existing = (existing_q.data or [])
            if existing:
                existing_id = existing[0]["id"]
                # Para exhibición con ítems PDV: solo es duplicado si hay solapamiento
                if body.tipo == "exhibicion" and body.pdv_items:
                    pdv_ids_new = {item.id_cliente_pdv for item in body.pdv_items}
                    items_existing = (
                        sb.table("objetivo_items")
                        .select("id_cliente_pdv")
                        .eq("id_objetivo", existing_id)
                        .execute()
                    )
                    pdv_ids_existing = {r["id_cliente_pdv"] for r in (items_existing.data or [])}
                    overlap = pdv_ids_new & pdv_ids_existing
                    if not overlap:
                        pass  # Sin solapamiento: permitir crear nuevo objetivo
                    else:
                        raise HTTPException(
                            status_code=409,
                            detail={
                                "code": "OBJETIVO_DUPLICADO",
                                "id_existente": str(existing_id),
                                "mensaje": f"Ya existe un objetivo de tipo '{body.tipo}' activo para este vendedor con PDVs en común. Editá el existente.",
                            },
                        )
                else:
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "code": "OBJETIVO_DUPLICADO",
                            "id_existente": str(existing_id),
                            "mensaje": f"Ya existe un objetivo de tipo '{body.tipo}' activo para este vendedor. Editá el existente o esperá a que se cierre.",
                        },
                    )
    except HTTPException:
        raise
    except Exception as e_dup:
        logger.warning(f"[Objetivo] Error al verificar duplicados: {e_dup}")
        # Si el check falla, no bloquear la creación

    try:
        estado_inicial = body.estado_inicial

        # Para cobranza: snapshot de la deuda actual del vendedor como baseline.
        # Se ejecuta siempre (incluso si valor_objetivo es una cantidad parcial)
        # para que el watcher pueda calcular cobrado = deuda_inicial - deuda_actual.
        if body.tipo == "cobranza" and not estado_inicial:
            try:
                cc_res = sb.table("cc_detalle").select("deuda_total") \
                    .eq("id_distribuidor", body.id_distribuidor) \
                    .eq("id_vendedor", body.id_vendedor).execute()
                deuda_actual = sum(float(r.get("deuda_total") or 0) for r in (cc_res.data or []))
                estado_inicial = str(deuda_actual)
                logger.info(
                    f"[Objetivo] Cobranza snapshot vend={body.id_vendedor}: "
                    f"deuda_inicial={deuda_actual}"
                )
            except Exception as e_cc:
                logger.warning(f"[Objetivo] No se pudo snapshotear deuda para cobranza: {e_cc}")

        # Para tipos multi-PDV: si vienen ítems, valor_objetivo = cantidad de ítems
        TIPOS_MULTI_PDV = {"exhibicion", "ruteo_alteo", "conversion_estado", "ruteo"}
        valor_objetivo = body.valor_objetivo
        if body.pdv_items and body.tipo in TIPOS_MULTI_PDV and not valor_objetivo:
            valor_objetivo = float(len(body.pdv_items))

        from zoneinfo import ZoneInfo as _ZoneInfo
        hoy_ar_str = datetime.now(_ZoneInfo("America/Argentina/Buenos_Aires")).date().isoformat()
        fecha_inicio_str = (body.fecha_inicio or hoy_ar_str) or hoy_ar_str
        es_planificado = fecha_inicio_str > hoy_ar_str if fecha_inicio_str else False

        payload = {
            "id_distribuidor": body.id_distribuidor, "id_vendedor": body.id_vendedor,
            "tipo": body.tipo, "id_target_pdv": body.id_target_pdv, "id_target_ruta": body.id_target_ruta,
            "descripcion": body.descripcion, "nombre_pdv": body.nombre_pdv, "nombre_vendedor": body.nombre_vendedor,
            "estado_inicial": estado_inicial, "estado_objetivo": body.estado_objetivo,
            "valor_objetivo": valor_objetivo, "fecha_objetivo": body.fecha_objetivo,
            "origen": body.origen,
            "mes_referencia": body.mes_referencia.isoformat() if body.mes_referencia else None,
            "tasa_pendientes": body.tasa_pendientes,
            "fecha_inicio": fecha_inicio_str,
        }
        res = sb.table("objetivos").insert(payload).execute()
        rows = res.data or []
        if not rows:
            raise HTTPException(status_code=500, detail="No se pudo crear el objetivo")

        # Insertar ítems en objetivo_items si vienen en el payload
        obj_id = str(rows[0]["id"])
        if body.pdv_items:
            item_rows = []
            for idx, item in enumerate(body.pdv_items):
                row: dict = {
                    "id_objetivo": obj_id,
                    "id_distribuidor": body.id_distribuidor,
                    "id_cliente_pdv": item.id_cliente_pdv,
                    "nombre_pdv": item.nombre_pdv,
                    "estado_item": "pendiente",
                }
                md_ruteo = dict(item.metadata_ruteo or {})
                if item.id_cliente_erp:
                    md_ruteo["id_cliente_erp"] = item.id_cliente_erp
                if item.dia_visita:
                    md_ruteo["dia_visita"] = item.dia_visita
                # Campos de ruteo (solo para tipo='ruteo')
                if body.tipo == "ruteo":
                    # Persistir metadata del modo "Armar Ruta" (selección por polígono)
                    if item.group_id:
                        md_ruteo["group_id"] = item.group_id
                    if item.group_name:
                        md_ruteo["group_name"] = item.group_name
                    if item.polygon_geojson:
                        md_ruteo["polygon_geojson"] = item.polygon_geojson
                    row["accion_ruteo"]    = item.accion_ruteo
                    row["id_ruta_destino"] = item.id_ruta_destino
                    row["motivo_baja"]     = item.motivo_baja
                    row["orden_sugerido"]  = item.orden_sugerido if item.orden_sugerido is not None else idx + 1
                    row["metadata_ruteo"]  = md_ruteo if md_ruteo else None
                elif md_ruteo:
                    row["metadata_ruteo"] = md_ruteo
                item_rows.append(row)
            try:
                sb.table("objetivo_items").upsert(
                    item_rows, on_conflict="id_objetivo,id_cliente_pdv"
                ).execute()
                logger.info(f"[Objetivo] {len(item_rows)} ítems creados para objetivo {obj_id}")
            except Exception as e_items:
                logger.warning(f"[Objetivo] Error al crear ítems objetivo {obj_id}: {e_items}")

        # Para tipo ruteo: generar PDF y registrar en objetivo_documentos
        if body.tipo == "ruteo":
            try:
                from services.objetivos_ruteo_pdf_service import objetivos_ruteo_pdf_service
                pdf_result = objetivos_ruteo_pdf_service.generate_and_store(
                    dist_id=body.id_distribuidor,
                    objetivo_id=obj_id,
                    nombre_vendedor=body.nombre_vendedor or "",
                    pdv_items=body.pdv_items or [],
                )
                if pdf_result.get("url"):
                    sb.table("objetivo_documentos").insert({
                        "id_objetivo": obj_id,
                        "id_distribuidor": body.id_distribuidor,
                        "tipo_documento": "ruteo_pdf",
                        "url_documento": pdf_result["url"],
                    }).execute()
                    rows[0]["url_pdf_ruteo"] = pdf_result["url"]
            except Exception as e_pdf:
                logger.warning(f"[Objetivo] PDF ruteo omitido: {e_pdf}")

        # Telegram Notification for NEW objective (enriched: supervisor + timestamps)
        # Regla de negocio: objetivos de tipo ruteo NO se notifican por Telegram.
        # Regla de planificación: si fecha_inicio > hoy, NO notificar — lanzamiento diferido.
        if body.tipo != "ruteo" and not es_planificado:
            try:
                from services.objetivos_notification_service import objetivos_notification
                notify_payload = {
                    **payload,
                    "created_at": rows[0].get("created_at"),
                    "asignado_por_usuario": user_payload.get("sub"),
                    "pdv_items": [item.model_dump() for item in (body.pdv_items or [])],
                }
                notif_meta = objetivos_notification.notify_new_objective_telegram(
                    body.id_distribuidor, notify_payload, obj_id=obj_id
                )
                if notif_meta and notif_meta.get("chat_id") and notif_meta.get("message_id"):
                    try:
                        from datetime import timezone as _tz
                        # Marcar lanzado_at inmediatamente al notificar
                        sb.table("objetivos").update(
                            {"lanzado_at": datetime.now(_tz.utc).isoformat()}
                        ).eq("id", obj_id).execute()
                        sb.table("objetivos_tracking").upsert(
                            {
                                "id_objetivo": obj_id,
                                "id_referencia": str(notif_meta["message_id"]),
                                "tipo_evento": "telegram_objetivo_asignado",
                                "metadata": {
                                    "chat_id": int(notif_meta["chat_id"]),
                                    "message_id": int(notif_meta["message_id"]),
                                },
                            },
                            on_conflict="id_objetivo,id_referencia,tipo_evento",
                        ).execute()
                    except Exception as e_track_tg:
                        logger.warning(f"[Objetivo] No se pudo guardar ref Telegram objetivo {obj_id}: {e_track_tg}")
            except Exception as e_notif:
                logger.warning(f"[Objetivo] Notificación inicial omitida: {e_notif}")

        # Watcher refresh: compute valor_actual immediately SÓLO para el nuevo
        # objetivo (no todos), para no pisar valor_actual de objetivos en progreso.
        try:
            from services.objetivos_watcher_service import objetivos_watcher
            objetivos_watcher.run_watcher(body.id_distribuidor, obj_id=obj_id)
        except Exception as e_watch:
            logger.warning(f"[Objetivo] Watcher post-create omitido: {e_watch}")

        # Re-fetch to return the row with updated valor_actual
        try:
            refreshed = sb.table("objetivos").select("*").eq("id", rows[0]["id"]).execute()
            if refreshed.data:
                return refreshed.data[0]
        except Exception:
            pass
        return rows[0]
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        if "uq_objetivos_activo_dist_vend_tipo" in msg and body.tipo in {"ruteo", "ruteo_alteo"}:
            # DB-level safety net still blocks duplicates for this tipo.
            # Business rule allows multiple active ruteo objectives; migrate the
            # partial unique index predicate to exclude ruteo/ruteo_alteo.
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "RUTEO_INDEX_BLOCK",
                    "mensaje": (
                        "La base aún tiene un índice único que bloquea objetivos "
                        "ruteo/ruteo_alteo activos duplicados por vendedor. "
                        "Aplicá la migración de objetivos_uniqueness para excluir "
                        "estos tipos y reintentá."
                    ),
                },
            )
        logger.error(f"Error en crear_objetivo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/supervision/objetivos/{obj_id}/lanzar", tags=["Supervisión"])
def lanzar_objetivo_now(obj_id: str, user_payload=Depends(verify_auth)):
    """Lanza manualmente un objetivo planificado: envía Telegram y setea lanzado_at."""
    dist_id = user_payload.get("id_distribuidor")
    if not dist_id and not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Sin distribuidora asignada")
    # Resolver dist_id desde el objetivo si es superadmin
    if not dist_id:
        obj_res = sb.table("objetivos").select("id_distribuidor").eq("id", obj_id).limit(1).execute()
        if not obj_res.data:
            raise HTTPException(status_code=404, detail="Objetivo no encontrado")
        dist_id = obj_res.data[0]["id_distribuidor"]
    check_dist_permission(user_payload, dist_id)
    try:
        from services.objetivos_launch_service import lanzar_un_objetivo
        result = lanzar_un_objetivo(obj_id, int(dist_id), asignado_por=user_payload.get("sub"))
        if not result.get("ok"):
            raise HTTPException(status_code=400, detail=result.get("error", "No se pudo lanzar"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[lanzar_objetivo_now] {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/supervision/objetivos/preview-telegram", tags=["Supervisión"])
def preview_telegram_objetivo(body: ObjetivoPreviewTelegramIn, user_payload=Depends(verify_auth)):
    """Retorna el texto HTML del mensaje Telegram que se enviaría para un objetivo (draft)."""
    check_dist_permission(user_payload, body.id_distribuidor)
    try:
        from services.objetivos_notification_service import objetivos_notification
        obj_data = {
            "id_distribuidor": body.id_distribuidor,
            "id_vendedor": body.id_vendedor,
            "tipo": body.tipo,
            "descripcion": body.descripcion,
            "fecha_objetivo": body.fecha_objetivo,
            "fecha_inicio": body.fecha_inicio,
            "valor_objetivo": body.valor_objetivo,
            "estado_inicial": body.estado_inicial,
            "origen": body.origen,
            "mes_referencia": body.mes_referencia,
            "nombre_vendedor": body.nombre_vendedor,
            "pdv_items": [item.model_dump() for item in body.pdv_items] if body.pdv_items else None,
        }
        text = objetivos_notification.build_new_objective_message(body.id_distribuidor, obj_data, obj_id=None)
        return {"preview_html": text}
    except Exception as e:
        logger.error(f"[preview_telegram] {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/objetivos/vendedor/{vendedor_id}", tags=["Supervisión"])
def objetivos_por_vendedor(vendedor_id: int, user_payload=Depends(verify_auth)):
    try:
        q = sb.table("objetivos").select("*").eq("id_vendedor", vendedor_id)
        if not user_payload.get("is_superadmin"):
            dist_id = user_payload.get("id_distribuidor")
            if not dist_id:
                raise HTTPException(status_code=403, detail="Sin distribuidora asignada")
            q = q.eq("id_distribuidor", dist_id)
        res = q.order("created_at", desc=True).execute()
        return res.data or []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en objetivos_por_vendedor vendedor_id={vendedor_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/objetivos/{dist_id}/resumen-supervisor", tags=["Supervisión"])
def resumen_supervisor_objetivos(dist_id: int, user_payload=Depends(verify_auth)):
    """
    Devuelve un resumen agregado de objetivos por vendedor para que el supervisor
    vea el total combinado. Suma valor_objetivo y valor_actual por vendedor,
    y calcula el progreso agregado del conjunto.
    """
    check_dist_permission(user_payload, dist_id)
    try:
        res = sb.table("objetivos").select(
            "id_vendedor, nombre_vendedor, tipo, valor_objetivo, valor_actual, cumplido, fecha_objetivo, descripcion, estado_inicial, estado_objetivo"
        ).eq("id_distribuidor", dist_id).eq("cumplido", False).execute()
        rows = res.data or []

        # Aggregate by vendedor
        vendedores_map: dict = {}
        for r in rows:
            vid = r["id_vendedor"]
            if vid not in vendedores_map:
                vendedores_map[vid] = {
                    "id_vendedor": vid,
                    "nombre_vendedor": r.get("nombre_vendedor") or f"Vendedor {vid}",
                    "cantidad_objetivo_total": 0.0,
                    "cantidad_actual_total": 0.0,
                    "objetivos_count": 0,
                    "objetivos_cumplidos": 0,
                    "proxima_fecha": None,
                    "tipos": set(),
                }
            entry = vendedores_map[vid]
            entry["cantidad_objetivo_total"] += r.get("valor_objetivo") or 0
            entry["cantidad_actual_total"]   += r.get("valor_actual")   or 0
            entry["objetivos_count"]         += 1
            if r.get("cumplido"):
                entry["objetivos_cumplidos"] += 1
            if r.get("tipo"):
                entry["tipos"].add(r["tipo"])
            # Track earliest upcoming deadline
            fecha = r.get("fecha_objetivo")
            if fecha:
                if entry["proxima_fecha"] is None or fecha < entry["proxima_fecha"]:
                    entry["proxima_fecha"] = fecha

        # Compute grand totals and serialize sets
        result_list = []
        grand_objetivo = 0.0
        grand_actual   = 0.0
        for entry in vendedores_map.values():
            entry["tipos"] = sorted(entry["tipos"])
            pct = 0
            if entry["cantidad_objetivo_total"] > 0:
                pct = round(entry["cantidad_actual_total"] / entry["cantidad_objetivo_total"] * 100)
            entry["pct_progreso"] = min(100, pct)
            grand_objetivo += entry["cantidad_objetivo_total"]
            grand_actual   += entry["cantidad_actual_total"]
            result_list.append(entry)

        grand_pct = round(grand_actual / grand_objetivo * 100) if grand_objetivo > 0 else 0

        return {
            "vendedores": result_list,
            "totales": {
                "cantidad_objetivo_total": grand_objetivo,
                "cantidad_actual_total": grand_actual,
                "pct_progreso": min(100, grand_pct),
                "vendedores_count": len(result_list),
            },
        }
    except Exception as e:
        logger.error(f"Error en resumen_supervisor_objetivos dist_id={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/objetivos/{dist_id}/timeline", tags=["Supervisión"])
def objetivos_timeline(
    dist_id: int,
    vendedor_id: Optional[int] = Query(None),
    sucursal_nombre: Optional[str] = Query(None),
    user_payload=Depends(verify_auth),
):
    """Devuelve objetivos con su historial de eventos de tracking, filtrable por vendedor y/o sucursal."""
    check_dist_permission(user_payload, dist_id)
    try:
        # Resolver sucursal → lista de id_vendedor
        vendedor_ids_filtro: list[int] | None = None
        if sucursal_nombre:
            t_sucursales = tenant_table_name("sucursales_v2", dist_id)
            t_vendedores = tenant_table_name("vendedores_v2", dist_id)
            suc_res = sb.table(t_sucursales) \
                .select("id_sucursal") \
                .eq("id_distribuidor", dist_id) \
                .ilike("nombre_erp", f"%{sucursal_nombre}%") \
                .execute()
            suc_ids = [r["id_sucursal"] for r in (suc_res.data or [])]
            if suc_ids:
                vend_res = sb.table(t_vendedores) \
                    .select("id_vendedor") \
                    .in_("id_sucursal", suc_ids) \
                    .execute()
                vendedor_ids_filtro = [r["id_vendedor"] for r in (vend_res.data or [])]
            else:
                return []

        # Query objetivos
        q = sb.table("objetivos").select(
            "id, id_vendedor, nombre_vendedor, tipo, descripcion, fecha_objetivo, "
            "cumplido, kanban_phase, resultado_final, id_objetivo_padre, valor_actual, valor_objetivo, created_at"
        ).eq("id_distribuidor", dist_id)
        if vendedor_ids_filtro is not None:
            if not vendedor_ids_filtro:
                return []
            q = q.in_("id_vendedor", vendedor_ids_filtro)
        if vendedor_id is not None:
            q = q.eq("id_vendedor", vendedor_id)
        res = q.order("created_at", desc=True).execute()
        obj_list = res.data or []

        if not obj_list:
            return []

        obj_ids = [str(o["id"]) for o in obj_list]

        # Cargar eventos de tracking
        tracking_by_obj: dict[str, list] = {}
        try:
            track_res = sb.table("objetivos_tracking") \
                .select("id, id_objetivo, tipo_evento, id_referencia, metadata, created_at") \
                .in_("id_objetivo", obj_ids) \
                .order("created_at", desc=True) \
                .execute()
            for t in (track_res.data or []):
                oid = str(t["id_objetivo"])
                tracking_by_obj.setdefault(oid, []).append(t)
        except Exception as e_track:
            logger.warning(f"[objetivos_timeline] Error cargando tracking: {e_track}")

        # Cargar items para _compute_kanban_phase
        items_by_obj: dict[str, list] = {}
        try:
            items_res = sb.table("objetivo_items") \
                .select("id_objetivo, id_cliente_pdv, nombre_pdv, estado_item") \
                .in_("id_objetivo", obj_ids) \
                .execute()
            for it in (items_res.data or []):
                items_by_obj.setdefault(str(it["id_objetivo"]), []).append(it)
        except Exception as e_items:
            logger.warning(f"[objetivos_timeline] Error cargando items: {e_items}")

        result = []
        for obj in obj_list:
            oid = str(obj["id"])
            obj["items"] = items_by_obj.get(oid, [])
            obj["items_count"] = len(obj["items"])
            obj["items_cumplidos"] = sum(1 for it in obj["items"] if it.get("estado_item") == "cumplido")
            kanban = _compute_kanban_phase(obj)

            eventos = [
                ObjetivoTimelineEvent(
                    id=str(e.get("id")) if e.get("id") else None,
                    id_objetivo=oid,
                    tipo_evento=e.get("tipo_evento", ""),
                    id_referencia=e.get("id_referencia"),
                    metadata=e.get("metadata"),
                    created_at=e.get("created_at"),
                )
                for e in tracking_by_obj.get(oid, [])
            ]

            result.append(ObjetivoTimeline(
                id_objetivo=oid,
                nombre_vendedor=obj.get("nombre_vendedor"),
                tipo=obj.get("tipo"),
                descripcion=obj.get("descripcion"),
                fecha_objetivo=obj.get("fecha_objetivo"),
                kanban_phase=kanban,
                resultado_final=obj.get("resultado_final"),
                eventos=eventos,
            ))

        return result
    except Exception as e:
        logger.error(f"Error en objetivos_timeline dist_id={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/pdvs-catalog/{dist_id}", tags=["Supervisión"])
def get_pdvs_catalog(
    dist_id: int,
    vendedor_id: int = None,
    limit: int = 35,
    offset: int = 0,
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    try:
        def _fetch_clients_paginated(base_query, page_size: int = 1000) -> list[dict]:
            out: list[dict] = []
            offset_i = 0
            while True:
                res = base_query.range(offset_i, offset_i + page_size - 1).execute()
                chunk = res.data or []
                if not chunk:
                    break
                out.extend(chunk)
                if len(chunk) < page_size:
                    break
                offset_i += page_size
            return out

        # Obtener clientes filtrados por vendedor (vía rutas_v2) o todos
        if vendedor_id is not None:
            t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
            rutas_data = _fetch_rutas_rows(dist_id, "id_ruta", id_vendedor=vendedor_id)
            route_ids = [r["id_ruta"] for r in rutas_data]
            if not route_ids:
                return []
            clients_res = (
                sb.table(t_clientes)
                .select(
                    "id_cliente, nombre_fantasia, nombre_razon_social, id_cliente_erp, "
                    "domicilio, estado, fecha_ultima_compra, updated_at, id_ruta"
                )
                .in_("id_ruta", route_ids)
                .eq("id_distribuidor", dist_id)
            )
            clients_data = _fetch_clients_paginated(clients_res)
        else:
            t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
            clients_res = (
                sb.table(t_clientes)
                .select(
                    "id_cliente, nombre_fantasia, nombre_razon_social, id_cliente_erp, "
                    "domicilio, estado, fecha_ultima_compra, updated_at, id_ruta"
                )
                .eq("id_distribuidor", dist_id)
            )
            clients_data = _fetch_clients_paginated(clients_res)
        # Objetivos must be able to target active and inactive PDVs.
        clients = _dedupe_pdvs_latest_by_erp(clients_data or [])

        ruta_dia_map: dict[int, str] = {}
        ruta_ids = list({int(c["id_ruta"]) for c in clients if c.get("id_ruta") is not None})
        if ruta_ids:
            t_rutas = tenant_table_name("rutas_v2", dist_id)
            rutas_res = (
                sb.table(t_rutas)
                .select("id_ruta, dia_semana")
                .in_("id_ruta", ruta_ids)
                .execute()
            )
            for r in (rutas_res.data or []):
                rid = r.get("id_ruta")
                if rid is not None:
                    ruta_dia_map[int(rid)] = (r.get("dia_semana") or "").strip()

        # Obtener la exhibición más reciente por nro_cliente (id_cliente_erp)
        fecha_map: dict[str, str] = {}
        erp_ids = [c["id_cliente_erp"] for c in clients if c.get("id_cliente_erp")]
        if erp_ids:
            exh_res = (
                sb.table("exhibiciones")
                .select("id_cliente, cliente_sombra_codigo, timestamp_subida")
                .eq("id_distribuidor", dist_id)
                .execute()
            )
            erp_set = {str(x).strip() for x in erp_ids if str(x).strip()}
            for row in (exh_res.data or []):
                raw_key = row.get("id_cliente") or row.get("cliente_sombra_codigo")
                key = str(raw_key).strip() if raw_key is not None else ""
                ts = row.get("timestamp_subida")
                if key and key in erp_set and ts:
                    if key not in fecha_map or ts > fecha_map[key]:
                        fecha_map[key] = ts

        # Enriquecer y ordenar: sin exhibición primero, luego más antiguo
        enriched = []
        for c in clients:
            erp = c.get("id_cliente_erp")
            fecha = fecha_map.get(erp) if erp else None
            id_ruta = c.get("id_ruta")
            dia_visita = ruta_dia_map.get(int(id_ruta)) if id_ruta is not None else None
            enriched.append({
                "id_cliente": c["id_cliente"],
                "nombre_cliente": c.get("nombre_fantasia") or c.get("nombre_razon_social"),
                "nombre_razon_social": c.get("nombre_razon_social"),
                "id_cliente_erp": erp,
                "dia_visita": dia_visita or None,
                "domicilio": c.get("domicilio"),
                "estado": c.get("estado"),
                "fecha_ultima_compra": c.get("fecha_ultima_compra"),
                "fecha_ultima_exhibicion": fecha,
            })

        enriched.sort(key=lambda x: (x["fecha_ultima_exhibicion"] is not None, x["fecha_ultima_exhibicion"] or ""))

        return enriched[offset: offset + limit]
    except Exception as e:
        logger.error(f"Error en get_pdvs_catalog dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/objetivos/{dist_id}", tags=["Supervisión"])
def listar_objetivos(
    dist_id: int,
    vendedor_id: Optional[int] = Query(None),
    cumplido: Optional[bool]   = Query(None),
    tipo: Optional[str]        = Query(None),
    sucursal_nombre: Optional[str] = Query(None),
    mes: Optional[str]             = Query(None),     # YYYY-MM — filtro aplicado client-side en frontend
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    try:
        # Si se filtra por sucursal, resolver los id_vendedor de esa sucursal primero
        vendedor_ids_filtro: list[int] | None = None
        if sucursal_nombre:
            t_sucursales = tenant_table_name("sucursales_v2", dist_id)
            t_vendedores = tenant_table_name("vendedores_v2", dist_id)
            suc_res = sb.table(t_sucursales) \
                .select("id_sucursal") \
                .eq("id_distribuidor", dist_id) \
                .ilike("nombre_erp", f"%{sucursal_nombre}%") \
                .execute()
            suc_ids = [r["id_sucursal"] for r in (suc_res.data or [])]
            if suc_ids:
                vend_res = sb.table(t_vendedores) \
                    .select("id_vendedor") \
                    .in_("id_sucursal", suc_ids) \
                    .execute()
                vendedor_ids_filtro = [r["id_vendedor"] for r in (vend_res.data or [])]
            else:
                vendedor_ids_filtro = []  # sucursal no encontrada → sin resultados

        q = sb.table("objetivos").select("*").eq("id_distribuidor", dist_id)
        if vendedor_ids_filtro is not None:
            if not vendedor_ids_filtro:
                return []
            q = q.in_("id_vendedor", vendedor_ids_filtro)
        if vendedor_id is not None: q = q.eq("id_vendedor", vendedor_id)
        if cumplido   is not None: q = q.eq("cumplido", cumplido)
        if tipo       is not None: q = q.eq("tipo", tipo)
        res = q.order("created_at", desc=True).execute()
        items = res.data or []

        # Enrich with id_cliente_erp from clientes_pdv_v2
        pdv_ids = list({o["id_target_pdv"] for o in items if o.get("id_target_pdv")})
        if pdv_ids:
            t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
            pdv_res = sb.table(t_clientes) \
                .select("id_cliente, id_cliente_erp") \
                .in_("id_cliente", pdv_ids) \
                .execute()
            pdv_erp_map = {p["id_cliente"]: p.get("id_cliente_erp") for p in (pdv_res.data or [])}
            for obj in items:
                if obj.get("id_target_pdv"):
                    obj["id_cliente_erp"] = pdv_erp_map.get(obj["id_target_pdv"])

        # Enrich exhibicion objectives with tiene_exhibicion_pendiente flag.
        # A pending upload (estado='Pendiente') exists for the target PDV → show as "En progreso"
        # even before the supervisor approves the photo.
        exhibicion_pdv_ids = [
            o["id_target_pdv"] for o in items
            if o.get("tipo") == "exhibicion" and o.get("id_target_pdv") and not o.get("cumplido")
        ]
        pdvs_con_pendiente: set = set()
        if exhibicion_pdv_ids:
            try:
                pend_res = sb.table("exhibiciones") \
                    .select("id_cliente_pdv") \
                    .eq("id_distribuidor", dist_id) \
                    .in_("id_cliente_pdv", list(set(exhibicion_pdv_ids))) \
                    .eq("estado", "Pendiente") \
                    .execute()
                pdvs_con_pendiente = {r["id_cliente_pdv"] for r in (pend_res.data or [])}
            except Exception as e_pend:
                logger.warning(f"[listar_objetivos] No se pudo consultar exhibiciones pendientes: {e_pend}")
        for obj in items:
            if obj.get("tipo") == "exhibicion":
                obj["tiene_exhibicion_pendiente"] = (
                    obj.get("id_target_pdv") in pdvs_con_pendiente
                    if obj.get("id_target_pdv")
                    else False
                )

        # ── Enriquecer con ítems de objetivo_items ───────────────────────────
        obj_ids = [o["id"] for o in items]
        if obj_ids:
            try:
                items_res = sb.table("objetivo_items") \
                    .select("id_objetivo, id_cliente_pdv, nombre_pdv, estado_item, accion_ruteo, id_ruta_destino, motivo_baja, orden_sugerido, metadata_ruteo") \
                    .in_("id_objetivo", obj_ids) \
                    .execute()
                items_by_obj: dict[str, list] = {}
                for it in (items_res.data or []):
                    items_by_obj.setdefault(str(it["id_objetivo"]), []).append(it)
                for obj in items:
                    oid = str(obj["id"])
                    obj_items = items_by_obj.get(oid, [])
                    obj["items"] = obj_items
                    obj["items_count"] = len(obj_items)
                    obj["items_cumplidos"] = sum(1 for it in obj_items if it.get("estado_item") == "cumplido")
            except Exception as e_items:
                logger.warning(f"[listar_objetivos] Error cargando objetivo_items: {e_items}")
                for obj in items:
                    obj["items"] = []
                    obj["items_count"] = 0
                    obj["items_cumplidos"] = 0

        # ── Enriquecer con tracking_events para objetivos genéricos ──
        try:
            generic_obj_ids = [str(o["id"]) for o in items if (o.get("items_count") or 0) == 0 and (o.get("valor_actual") or 0) > 0 and o.get("tipo") in ("conversion_estado", "ruteo_alteo")]
            if generic_obj_ids:
                track_res = sb.table("objetivos_tracking") \
                    .select("id_objetivo, id_referencia, metadata") \
                    .in_("id_objetivo", generic_obj_ids) \
                    .in_("tipo_evento", ["activacion", "alteo"]) \
                    .execute()
                
                track_by_obj: dict[str, list] = {}
                for t in (track_res.data or []):
                    track_by_obj.setdefault(str(t["id_objetivo"]), []).append(t)
                    
                for obj in items:
                    oid = str(obj["id"])
                    if oid in track_by_obj:
                        synthetic_items = []
                        for t in track_by_obj[oid]:
                            md = t.get("metadata") or {}
                            synthetic_items.append({
                                "id_objetivo": oid,
                                "id_cliente_pdv": t.get("id_referencia"),
                                "id_cliente_erp": md.get("id_cliente_erp"),
                                "nombre_pdv": md.get("nombre_fantasia") or md.get("nombre_razon_social") or "Cliente",
                                "estado_item": "cumplido",
                                "metadata_ruteo": md
                            })
                        obj["items"] = synthetic_items
                        vo = obj.get("valor_objetivo")
                        obj["items_count"] = int(float(vo)) if vo and float(vo) > 0 else len(synthetic_items)
                        obj["items_cumplidos"] = len(synthetic_items)
        except Exception as e_track:
            logger.warning(f"[listar_objetivos] Error cargando tracking para genéricos: {e_track}")

        # Exhibición global (sin id_target_pdv ni ítems): pendiente de evaluación
        # si existe al menos una exhibición Pendiente vinculada por id_objetivo.
        try:
            global_exhib_ids = [
                str(o["id"])
                for o in items
                if o.get("tipo") == "exhibicion"
                and not o.get("id_target_pdv")
                and (o.get("items_count") or 0) == 0
            ]
            objs_con_foto_pend_global: set[str] = set()
            exhib_by_obj: dict[str, list] = {}
            if global_exhib_ids:
                pend_g = (
                    sb.table("exhibiciones")
                    .select("id_objetivo, estado, id_cliente_pdv, id_cliente_erp, nombre_fantasia, razon_social")
                    .eq("id_distribuidor", dist_id)
                    .in_("id_objetivo", global_exhib_ids)
                    .execute()
                )
                for r in pend_g.data or []:
                    oid = r.get("id_objetivo")
                    if oid is not None:
                        exhib_by_obj.setdefault(str(oid), []).append(r)
                        if r.get("estado") == "Pendiente":
                            objs_con_foto_pend_global.add(str(oid))
            for obj in items:
                if (
                    obj.get("tipo") == "exhibicion"
                    and not obj.get("id_target_pdv")
                    and (obj.get("items_count") or 0) == 0
                ):
                    obj["tiene_exhibicion_pendiente"] = str(obj["id"]) in objs_con_foto_pend_global
                    # Synthesize items for global exhibicion
                    oid = str(obj["id"])
                    if oid in exhib_by_obj:
                        synthetic_items = []
                        for e in exhib_by_obj[oid]:
                            synthetic_items.append({
                                "id_objetivo": oid,
                                "id_cliente_pdv": e.get("id_cliente_pdv"),
                                "id_cliente_erp": e.get("id_cliente_erp"),
                                "nombre_pdv": e.get("nombre_fantasia") or e.get("razon_social") or "Cliente",
                                "estado_item": "foto_subida" if e.get("estado") == "Pendiente" else "cumplido",
                                "metadata_ruteo": {
                                    "id_cliente_erp": e.get("id_cliente_erp"),
                                    "nombre_fantasia": e.get("nombre_fantasia"),
                                    "nombre_razon_social": e.get("razon_social")
                                }
                            })
                        obj["items"] = synthetic_items
                        vo = obj.get("valor_objetivo")
                        obj["items_count"] = int(float(vo)) if vo and float(vo) > 0 else len(synthetic_items)
                        obj["items_cumplidos"] = sum(1 for it in synthetic_items if it["estado_item"] == "cumplido")
        except Exception as e_pend_g:
            logger.warning(f"[listar_objetivos] exhibiciones pendientes (global): {e_pend_g}")

        # ── Para objetivos de tipo ruteo: adjuntar último PDF ────────────────
        ruteo_ids = [o["id"] for o in items if o.get("tipo") == "ruteo"]
        if ruteo_ids:
            try:
                docs_res = sb.table("objetivo_documentos") \
                    .select("id_objetivo, url_documento, created_at") \
                    .in_("id_objetivo", ruteo_ids) \
                    .eq("tipo_documento", "ruteo_pdf") \
                    .order("created_at", desc=True) \
                    .execute()
                last_doc: dict[str, str] = {}
                for doc in (docs_res.data or []):
                    oid = str(doc["id_objetivo"])
                    if oid not in last_doc:
                        last_doc[oid] = doc["url_documento"]
                for obj in items:
                    if obj.get("tipo") == "ruteo":
                        obj["url_pdf_ruteo"] = last_doc.get(str(obj["id"]))
            except Exception as e_docs:
                logger.warning(f"[listar_objetivos] Error cargando documentos ruteo: {e_docs}")

        # ── Calcular kanban_phase por objetivo ───────────────────────────────
        for obj in items:
            obj["kanban_phase"] = _compute_kanban_phase(obj)

        return items
    except Exception as e:
        logger.error(f"Error en listar_objetivos dist_id={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/supervision/objetivos/{objetivo_id}", tags=["Supervisión"])
def actualizar_objetivo(objetivo_id: str, body: ObjetivoUpdate, user_payload=Depends(verify_auth)):
    try:
        existing = sb.table("objetivos").select("id_distribuidor").eq("id", objetivo_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Objetivo no encontrado")
        dist_id = existing.data[0]["id_distribuidor"]
        check_dist_permission(user_payload, dist_id)
        updates: dict = {}
        if body.valor_actual  is not None: updates["valor_actual"]   = body.valor_actual
        if body.descripcion   is not None: updates["descripcion"]    = body.descripcion
        if body.estado_objetivo is not None: updates["estado_objetivo"] = body.estado_objetivo
        if body.fecha_objetivo  is not None: updates["fecha_objetivo"]  = body.fecha_objetivo
        if body.resultado_final is not None: updates["resultado_final"] = body.resultado_final
        if body.kanban_phase    is not None: updates["kanban_phase"]    = body.kanban_phase
        if not updates:
            raise HTTPException(status_code=400, detail="No hay campos para actualizar")
        updates["updated_at"] = datetime.utcnow().isoformat()
        res = sb.table("objetivos").update(updates).eq("id", objetivo_id).execute()
        rows = res.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Objetivo no encontrado o sin cambios")
        return rows[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en actualizar_objetivo objetivo_id={objetivo_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/objetivos/{objetivo_id}/documentos", tags=["Supervisión"])
def listar_objetivo_documentos(objetivo_id: str, user_payload=Depends(verify_auth)):
    """Devuelve todos los documentos (PDFs) generados para un objetivo de ruteo."""
    try:
        existing = sb.table("objetivos").select("id_distribuidor, tipo").eq("id", objetivo_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Objetivo no encontrado")
        dist_id = existing.data[0]["id_distribuidor"]
        check_dist_permission(user_payload, dist_id)
        docs_res = sb.table("objetivo_documentos") \
            .select("id, tipo_documento, url_documento, created_at") \
            .eq("id_objetivo", objetivo_id) \
            .order("created_at", desc=True) \
            .execute()
        return docs_res.data or []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en listar_objetivo_documentos objetivo_id={objetivo_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/supervision/objetivos/{objetivo_id}/regenerar-pdf-ruteo", tags=["Supervisión"])
def regenerar_pdf_ruteo(objetivo_id: str, user_payload=Depends(verify_auth)):
    """Regenera el PDF operativo de un objetivo de ruteo y devuelve la nueva URL."""
    try:
        existing = (
            sb.table("objetivos")
            .select("id, id_distribuidor, tipo, nombre_vendedor")
            .eq("id", objetivo_id)
            .limit(1)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Objetivo no encontrado")

        obj = existing.data[0]
        dist_id = obj["id_distribuidor"]
        check_dist_permission(user_payload, dist_id)
        if obj.get("tipo") != "ruteo":
            raise HTTPException(status_code=400, detail="Solo aplica a objetivos tipo ruteo")

        items_res = (
            sb.table("objetivo_items")
            .select(
                "id_cliente_pdv, nombre_pdv, accion_ruteo, id_ruta_destino, "
                "motivo_baja, orden_sugerido, metadata_ruteo"
            )
            .eq("id_objetivo", objetivo_id)
            .order("orden_sugerido")
            .execute()
        )
        items = items_res.data or []
        if not items:
            raise HTTPException(status_code=400, detail="El objetivo no tiene PDVs para generar PDF")

        from services.objetivos_ruteo_pdf_service import objetivos_ruteo_pdf_service

        pdf_result = objetivos_ruteo_pdf_service.generate_and_store(
            dist_id=dist_id,
            objetivo_id=objetivo_id,
            nombre_vendedor=obj.get("nombre_vendedor") or "",
            pdv_items=items,
        )
        url = pdf_result.get("url")
        if not url:
            raise HTTPException(status_code=500, detail="No se pudo generar el PDF de ruteo")

        sb.table("objetivo_documentos").insert({
            "id_objetivo": objetivo_id,
            "id_distribuidor": dist_id,
            "tipo_documento": "ruteo_pdf",
            "url_documento": url,
        }).execute()

        return {"ok": True, "url": url}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en regenerar_pdf_ruteo objetivo_id={objetivo_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/supervision/objetivos/{objetivo_id}", tags=["Supervisión"])
def eliminar_objetivo(objetivo_id: str, user_payload=Depends(verify_auth)):
    try:
        existing = sb.table("objetivos").select("id_distribuidor").eq("id", objetivo_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Objetivo no encontrado")
        dist_id = existing.data[0]["id_distribuidor"]
        check_dist_permission(user_payload, dist_id)

        # Best-effort: borrar el mensaje de Telegram asociado al alta del objetivo.
        try:
            tg_ref = (
                sb.table("objetivos_tracking")
                .select("metadata, id_referencia")
                .eq("id_objetivo", objetivo_id)
                .eq("tipo_evento", "telegram_objetivo_asignado")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            ref_row = (tg_ref.data or [{}])[0] if tg_ref.data else {}
            metadata = ref_row.get("metadata") or {}
            chat_id = metadata.get("chat_id")
            msg_id = metadata.get("message_id") or ref_row.get("id_referencia")
            if chat_id and msg_id:
                from services.objetivos_notification_service import objetivos_notification
                objetivos_notification.delete_objective_telegram_message(
                    dist_id=dist_id,
                    chat_id=int(chat_id),
                    message_id=int(msg_id),
                )
        except Exception as e_tg:
            logger.warning(f"[Objetivo] No se pudo borrar mensaje Telegram para objetivo {objetivo_id}: {e_tg}")

        sb.table("objetivos").delete().eq("id", objetivo_id).execute()
        return {"ok": True, "id": objetivo_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en eliminar_objetivo objetivo_id={objetivo_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Watcher manual ───────────────────────────────────────────────────────────

@router.post("/api/supervision/run-watcher/{dist_id}", tags=["Supervisión"])
def run_watcher_manual(
    dist_id: int,
    obj_id: Optional[str] = Query(None, description="UUID del objetivo a procesar; si se omite procesa todos los activos"),
    user_payload=Depends(verify_auth),
):
    """
    Dispara el watcher de objetivos manualmente para un distribuidor.
    Requiere permiso de superadmin o autenticación JWT del distribuidor.
    Si se pasa obj_id, sólo procesa ese objetivo específico.
    """
    check_dist_permission(user_payload, dist_id)
    try:
        from services.objetivos_watcher_service import objetivos_watcher
        result = objetivos_watcher.run_watcher(dist_id, obj_id=obj_id)
        return result
    except Exception as e:
        logger.error(f"[run_watcher_manual] dist={dist_id} obj_id={obj_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Actualizar Cuentas Corrientes (desde /supervision) ───────────────────────

# Mapeo inverso dist_id → tenant_id para el procesamiento de CC
_DIST_TENANT_MAP: dict[int, str] = {3: "tabaco", 4: "aloma", 5: "liver", 2: "real"}


@router.post("/api/supervision/upload-cc/{dist_id}", tags=["Supervisión"])
async def supervision_upload_cc(
    dist_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_payload=Depends(verify_auth),
):
    """
    Carga un Excel de Cuentas Corrientes para un distribuidor específico.
    Procesa el archivo en segundo plano y actualiza cc_detalle.
    Devuelve inmediatamente un job_id para que el frontend pueda consultar el estado.
    """
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo superadmin puede actualizar cuentas corrientes.")
    check_dist_permission(user_payload, dist_id)

    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx o .xls")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    # Registrar inicio de motor_run
    try:
        run_res = sb.table("motor_runs").insert({
            "motor": "cuentas_corrientes",
            "dist_id": dist_id,
            "estado": "iniciado",
            "iniciado_en": datetime.utcnow().isoformat(),
        }).execute()
        job_id = run_res.data[0]["id"] if run_res.data else None
    except Exception as e:
        logger.warning(f"No se pudo registrar motor_run para dist={dist_id}: {e}")
        job_id = None

    def _run_cc_background(fb: bytes, d_id: int, run_id: int | None) -> None:
        """Proceso de fondo: parsea el Excel CC y guarda en cc_detalle."""
        from services.cuentas_corrientes_service import procesar_cuentas_corrientes_service
        try:
            with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                tmp.write(fb)
                tmp_path = tmp.name

            import os
            try:
                _, json_data = procesar_cuentas_corrientes_service(tmp_path, "/tmp", {"reglas_generales": {}})
            finally:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass

            rows_cc = json_data.get("detalle_cuentas", []) if json_data else []
            saved = 0
            if rows_cc:
                fecha_str = datetime.utcnow().strftime("%Y-%m-%d")
                saved = _enrich_and_store_cc(d_id, fecha_str, rows_cc)

            if run_id:
                sb.table("motor_runs").update({
                    "estado": "completado",
                    "finalizado_en": datetime.utcnow().isoformat(),
                    "registros": saved,
                }).eq("id", run_id).execute()

            logger.info(f"[upload-cc] dist={d_id} — {saved} registros guardados en cc_detalle.")

        except Exception as e:
            logger.error(f"[upload-cc] Error procesando CC dist={d_id}: {e}")
            if run_id:
                try:
                    sb.table("motor_runs").update({
                        "estado": "error",
                        "finalizado_en": datetime.utcnow().isoformat(),
                        "error_msg": str(e)[:500],
                    }).eq("id", run_id).execute()
                except Exception:
                    pass

    background_tasks.add_task(_run_cc_background, file_bytes, dist_id, job_id)

    return {
        "ok": True,
        "status": "accepted",
        "message": f"Archivo CC recibido para dist {dist_id}. Procesando en segundo plano.",
        "job_id": job_id,
    }


@router.get("/api/supervision/cc-status/{dist_id}", tags=["Supervisión"])
def supervision_cc_status(dist_id: int, user_payload=Depends(verify_auth)):
    """Estado del último motor_run de cuentas corrientes para un distribuidor."""
    check_dist_permission(user_payload, dist_id)
    try:
        res = (
            sb.table("motor_runs")
            .select("id, estado, iniciado_en, finalizado_en, registros, error_msg")
            .eq("motor", "cuentas_corrientes")
            .eq("dist_id", dist_id)
            .order("iniciado_en", desc=True)
            .limit(1)
            .execute()
        )
        if not res.data:
            return {"estado": "sin_ejecuciones"}
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Sync status: última actualización de padrón y CC por distribuidor ────────

@router.get("/api/supervision/sync-status/{dist_id}", tags=["Supervisión"])
def supervision_sync_status(dist_id: int, user_payload=Depends(verify_auth)):
    """
    Devuelve el timestamp y conteo de la última ingesta de padrón y CC.
    Incluye breakdown de estados del padrón (activos/anulados/ausentes) y
    detección de zombie runs (motor_runs en_curso > 2h — §10.1 del spec padrón).
    """
    check_dist_permission(user_payload, dist_id)
    try:
        t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)

        padron_data: dict = {
            "last_updated": None, "count": 0,
            "activos": 0, "anulados": 0, "ausentes": 0,
            "last_run_estado": None, "has_zombie": False,
        }
        try:
            # ── Timestamps de frescura ──────────────────────────────────────────
            run_ok = (
                sb.table("motor_runs")
                .select("finalizado_en,iniciado_en,estado,registros")
                .eq("motor", "padron")
                .eq("dist_id", dist_id)
                .eq("estado", "ok")
                .order("finalizado_en", desc=True)
                .limit(1)
                .execute()
            )
            run_ts: str | None = None
            if run_ok.data:
                row = run_ok.data[0]
                run_ts = row.get("finalizado_en") or row.get("iniciado_en")
                regs = row.get("registros")
                if isinstance(regs, str):
                    try:
                        regs = json.loads(regs)
                    except Exception:
                        regs = None
                padron_data["last_run_estado"] = (
                    "sin_cambios"
                    if isinstance(regs, dict) and regs.get("sin_cambios")
                    else "ok"
                )

            res_p = (
                sb.table(t_clientes)
                .select("updated_at")
                .order("updated_at", desc=True)
                .limit(1)
                .execute()
            )
            cliente_ts: str | None = res_p.data[0]["updated_at"] if res_p.data else None
            global_ts = _padron_global_last_ts_for_dist(dist_id)
            padron_data["last_updated"] = _iso_ts_latest(run_ts, global_ts, cliente_ts)

            # ── Total count ────────────────────────────────────────────────────
            count_res = sb.table(t_clientes).select("id_cliente", count="exact").execute()
            padron_data["count"] = count_res.count or 0

            # ── Breakdown por estado/motivo ────────────────────────────────────
            try:
                activos_res = (
                    sb.table(t_clientes)
                    .select("id_cliente", count="exact")
                    .eq("estado", "activo")
                    .execute()
                )
                padron_data["activos"] = activos_res.count or 0
            except Exception:
                pass

            try:
                anulados_res = (
                    sb.table(t_clientes)
                    .select("id_cliente", count="exact")
                    .eq("motivo_inactivo", "padron_anulado")
                    .execute()
                )
                padron_data["anulados"] = anulados_res.count or 0
            except Exception:
                pass

            try:
                ausentes_res = (
                    sb.table(t_clientes)
                    .select("id_cliente", count="exact")
                    .eq("motivo_inactivo", "padron_absent")
                    .execute()
                )
                padron_data["ausentes"] = ausentes_res.count or 0
            except Exception:
                pass

            # ── Detección de zombie runs (§10.1: motor_runs en_curso > 2h) ────
            try:
                from datetime import timezone
                two_hours_ago = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
                zombie_res = (
                    sb.table("motor_runs")
                    .select("id_run", count="exact")
                    .eq("motor", "padron")
                    .eq("dist_id", dist_id)
                    .eq("estado", "en_curso")
                    .lt("iniciado_en", two_hours_ago)
                    .execute()
                )
                padron_data["has_zombie"] = (zombie_res.count or 0) > 0
                if not padron_data["last_run_estado"]:
                    # Detectar si hay run reciente en_curso (no zombie) como señal de procesando
                    recent_res = (
                        sb.table("motor_runs")
                        .select("id_run")
                        .eq("motor", "padron")
                        .eq("dist_id", dist_id)
                        .eq("estado", "en_curso")
                        .execute()
                    )
                    if recent_res.data:
                        padron_data["last_run_estado"] = "en_curso"
            except Exception:
                pass

        except Exception as e:
            logger.warning(f"[sync-status] error leyendo padrón dist={dist_id}: {e}")

        cc_data: dict = {"last_updated": None, "count": 0}
        try:
            res_cc = (
                sb.table("cc_detalle")
                .select("created_at")
                .eq("id_distribuidor", dist_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            count_cc = (
                sb.table("cc_detalle")
                .select("id", count="exact")
                .eq("id_distribuidor", dist_id)
                .execute()
            )
            if res_cc.data:
                cc_data["last_updated"] = res_cc.data[0]["created_at"]
            cc_data["count"] = count_cc.count or 0
        except Exception as e:
            logger.warning(f"[sync-status] error leyendo CC dist={dist_id}: {e}")

        ventas_data: dict = {"last_updated": None, "count": 0}
        try:
            run_ventas = (
                sb.table("motor_runs")
                .select("finalizado_en,iniciado_en,registros")
                .eq("motor", "ventas_enriched")
                .eq("dist_id", dist_id)
                .eq("estado", "ok")
                .order("finalizado_en", desc=True)
                .limit(1)
                .execute()
            )
            if run_ventas.data:
                row = run_ventas.data[0]
                ventas_data["last_updated"] = row.get("finalizado_en") or row.get("iniciado_en")
                try:
                    reg = row.get("registros") or {}
                    if isinstance(reg, dict):
                        ventas_data["count"] = int(reg.get("upserted") or reg.get("rows") or 0)
                    else:
                        ventas_data["count"] = int(reg or 0)
                except Exception:
                    ventas_data["count"] = 0
            if not ventas_data["last_updated"]:
                t_ventas = tenant_table_name("ventas_enriched_v2", dist_id)
                res_v = (
                    sb.table(t_ventas)
                    .select("created_at")
                    .eq("id_distribuidor", dist_id)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if res_v.data:
                    ventas_data["last_updated"] = res_v.data[0]["created_at"]
        except Exception as e:
            logger.warning(f"[sync-status] error leyendo ventas dist={dist_id}: {e}")

        return {"padron": padron_data, "cuentas_corrientes": cc_data, "ventas": ventas_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/vendedor/{dist_id}/{id_vendedor}/kpi-mapa", tags=["Supervisión"])
def supervision_vendedor_kpi_mapa(
    dist_id: int,
    id_vendedor: int,
    mes: Optional[str] = Query(None, description="YYYY-MM: altas y compradores del mes calendario"),
    user_payload=Depends(verify_auth),
):
    """KPIs de mapa: con `mes` devuelve altas/compradores del mes calendario; sin `mes`, ventana 7d."""
    try:
        check_dist_permission(user_payload, dist_id)

        out: dict = {"pdv_nuevos_7d": 0, "pdv_activados_7d": 0}

        if mes:
            _, _, _, fecha_inicio, fecha_fin = _supervision_parse_mes(mes)
            route_ids = _supervision_route_ids(dist_id, id_vendedor)
            t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
            pdv_altas_mes = 0
            if route_ids:
                PAGE = 1000
                offset = 0
                while True:
                    batch = (
                        sb.table(t_clientes)
                        .select("id_cliente")
                        .eq("id_distribuidor", dist_id)
                        .in_("id_ruta", route_ids)
                        .gte("fecha_alta", fecha_inicio[:10])
                        .lte("fecha_alta", fecha_fin[:10])
                        .range(offset, offset + PAGE - 1)
                        .execute()
                        .data or []
                    )
                    pdv_altas_mes += len(batch)
                    if len(batch) < PAGE:
                        break
                    offset += PAGE
            client_by_id = _supervision_clients_by_route(
                dist_id,
                route_ids,
                "id_cliente,id_cliente_erp,fecha_ultima_compra",
            )
            compradores, _ = _supervision_compradores_mes(
                dist_id, client_by_id, fecha_inicio, fecha_fin,
            )
            out["mes"] = mes
            out["pdv_altas_mes"] = pdv_altas_mes
            out["pdv_compradores_mes"] = len(compradores)

        # Ventana 7d (retrocompat): hoy 00:00 AR → hace 7 días 00:00 AR.
        from datetime import timezone as _tz
        now_utc = datetime.now(_tz.utc)
        ar_offset = timedelta(hours=-3)
        now_ar = now_utc + ar_offset
        desde_ar = (now_ar - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
        desde_iso = desde_ar.strftime("%Y-%m-%dT%H:%M:%S-03:00")
        hasta_iso = now_ar.strftime("%Y-%m-%dT%H:%M:%S-03:00")
        desde_date = desde_ar.strftime("%Y-%m-%d")
        hasta_date = now_ar.strftime("%Y-%m-%d")

        t = tenant_table_name("clientes_pdv_v2", dist_id)
        nuevos_ids: set[int] = set()
        PAGE = 1000
        offset = 0
        while True:
            rows = (
                sb.table(t)
                .select("id_cliente")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor", id_vendedor)
                .gte("created_at", desde_iso)
                .lte("created_at", hasta_iso)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            for r in rows:
                nuevos_ids.add(r["id_cliente"])
            if len(rows) < PAGE:
                break
            offset += PAGE

        activados = 0
        offset = 0
        while True:
            rows = (
                sb.table(t)
                .select("id_cliente")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor", id_vendedor)
                .gte("fecha_ultima_compra", desde_date)
                .lte("fecha_ultima_compra", hasta_date)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            activados += sum(1 for r in rows if r["id_cliente"] not in nuevos_ids)
            if len(rows) < PAGE:
                break
            offset += PAGE

        out["pdv_nuevos_7d"] = len(nuevos_ids)
        out["pdv_activados_7d"] = activados
        return out
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en supervision_vendedor_kpi_mapa: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/supervision/v2/dashboard/{dist_id}", tags=["Supervisión"])
def supervision_v2_dashboard(
    dist_id: int,
    dias: int = 30,
    fecha_hasta: Optional[str] = Query(None),
    sucursal: Optional[str] = Query(None),
    vendedor: Optional[str] = Query(None),
    user_payload=Depends(verify_auth),
):
    # Solo superadmin
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo superadmin puede acceder a este dashboard.")
    check_dist_permission(user_payload, dist_id)

    try:
        if fecha_hasta:
            base_hasta = datetime.strptime(fecha_hasta, "%Y-%m-%d")
        else:
            base_hasta = datetime.now()
        fecha_hasta_str = base_hasta.strftime("%Y-%m-%d")
        fecha_desde_str = (base_hasta - timedelta(days=max(1, dias) - 1)).strftime("%Y-%m-%d")

        t_ventas = tenant_table_name("ventas_enriched_v2", dist_id)
        
        # 1. Fetch Ventas
        PAGE = 1000
        ventas_rows = []
        offset = 0
        while True:
            q = (
                sb.table(t_ventas)
                .select("*")
                .eq("id_distribuidor", dist_id)
                .gte("fecha_factura", fecha_desde_str)
                .lte("fecha_factura", fecha_hasta_str)
                .eq("anulado", False)
            )
            batch = q.range(offset, offset + PAGE - 1).execute().data or []
            ventas_rows.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE

        # 2. Fetch CC Detalle (latest snapshot)
        q_snap = (
            sb.table("cc_detalle")
            .select("fecha_snapshot")
            .eq("id_distribuidor", dist_id)
            .order("fecha_snapshot", desc=True)
            .limit(1)
            .execute()
        )
        cc_rows = []
        if q_snap.data:
            fecha_snapshot = q_snap.data[0]["fecha_snapshot"]
            offset = 0
            while True:
                batch = (
                    sb.table("cc_detalle")
                    .select("*")
                    .eq("id_distribuidor", dist_id)
                    .eq("fecha_snapshot", fecha_snapshot)
                    .range(offset, offset + PAGE - 1)
                    .execute()
                    .data or []
                )
                cc_rows.extend(batch)
                if len(batch) < PAGE:
                    break
                offset += PAGE

        # 3. Filter by sucursal and vendedor
        # Normalizar nombres para filtrado
        sucursal_norm = (sucursal or "").strip().lower()
        vendedor_norm = (vendedor or "").strip().lower()
        
        # Filtrar ventas
        filtered_ventas = []
        for v in ventas_rows:
            if vendedor_norm and vendedor_norm not in str(v.get("nombre_vendedor", "")).lower():
                continue
            if sucursal_norm and sucursal_norm not in str(v.get("ruta", "")).lower() and sucursal_norm not in str(v.get("agrupacion_art_1", "")).lower():
                # Simplificación: si la sucursal viene, buscarla en la ruta o agrupación
                pass # TODO: Mejorar cruce
            filtered_ventas.append(v)
            
        # Filtrar CC
        filtered_cc = []
        for c in cc_rows:
            if sucursal_norm and sucursal_norm not in str(c.get("sucursal_nombre", "")).lower():
                continue
            if vendedor_norm and vendedor_norm not in str(c.get("vendedor_nombre", "")).lower():
                continue
            filtered_cc.append(c)

        # 4. Aggregate Data
        
        # KPIs
        total_ventas = sum(float(v.get("importe_final") or 0) for v in filtered_ventas)
        total_bultos = sum(float(v.get("bultos_total") or 0) for v in filtered_ventas)
        clientes_con_venta = len(set(v.get("id_cliente_erp") for v in filtered_ventas if v.get("id_cliente_erp")))
        ticket_promedio = total_ventas / len(filtered_ventas) if filtered_ventas else 0

        # Chart Vendedores
        vendedores_agg = {}
        for v in filtered_ventas:
            vend_name = v.get("nombre_vendedor") or "Sin Vendedor"
            if vend_name not in vendedores_agg:
                vendedores_agg[vend_name] = {"id": vend_name, "name": vend_name, "ventas": 0, "bultos": 0, "ticketPromedio": 0, "count": 0}
            vendedores_agg[vend_name]["ventas"] += float(v.get("importe_final") or 0)
            vendedores_agg[vend_name]["bultos"] += float(v.get("bultos_total") or 0)
            vendedores_agg[vend_name]["count"] += 1

        chart_vendedores = []
        ranking_vendedores = []
        for k, val in vendedores_agg.items():
            val["ticketPromedio"] = val["ventas"] / val["count"] if val["count"] > 0 else 0
            chart_vendedores.append({"id": val["id"], "name": val["name"], "ventas": val["ventas"], "bultos": val["bultos"]})
            ranking_vendedores.append({
                "id": val["id"], 
                "nombre": val["name"], 
                "ventas": val["ventas"], 
                "bultos": val["bultos"], 
                "ticketPromedio": val["ticketPromedio"],
                "altas": 0 # TODO: cruzar con altas
            })
            
        chart_vendedores.sort(key=lambda x: x["ventas"], reverse=True)
        ranking_vendedores.sort(key=lambda x: x["ventas"], reverse=True)

        # Chart Tendencia
        tendencia_agg = {}
        for v in filtered_ventas:
            fecha = v.get("fecha_factura")
            if not fecha: continue
            fecha_str = fecha[:10]
            if fecha_str not in tendencia_agg:
                tendencia_agg[fecha_str] = {"date": fecha_str, "ventas": 0, "bultos": 0}
            tendencia_agg[fecha_str]["ventas"] += float(v.get("importe_final") or 0)
            tendencia_agg[fecha_str]["bultos"] += float(v.get("bultos_total") or 0)
            
        chart_tendencia = list(tendencia_agg.values())
        chart_tendencia.sort(key=lambda x: x["date"])

        # Transacciones (Comprobantes)
        comprobantes_agg = {}
        for v in filtered_ventas:
            comp = v.get("numero_documento")
            if not comp: continue
            if comp not in comprobantes_agg:
                comprobantes_agg[comp] = {
                    "id": comp,
                    "comprobante": comp,
                    "fecha": v.get("fecha_factura"),
                    "pdv": v.get("nombre_cliente"),
                    "vendedorId": v.get("codigo_vendedor"),
                    "vendedor": v.get("nombre_vendedor"),
                    "condicion": "Contado",
                    "bultos": 0,
                    "total": 0
                }
            comprobantes_agg[comp]["bultos"] += float(v.get("bultos_total") or 0)
            comprobantes_agg[comp]["total"] += float(v.get("importe_final") or 0)
            
        ventas_list = list(comprobantes_agg.values())
        ventas_list.sort(key=lambda x: x["fecha"] or "", reverse=True)

        # Artículos
        articulos_agg = {}
        for v in filtered_ventas:
            cod = v.get("cod_articulo")
            if not cod: continue
            if cod not in articulos_agg:
                articulos_agg[cod] = {
                    "id": cod,
                    "codigo": cod,
                    "descripcion": v.get("descripcion_articulo"),
                    "bultos": 0,
                    "total": 0
                }
            articulos_agg[cod]["bultos"] += float(v.get("bultos_total") or 0)
            articulos_agg[cod]["total"] += float(v.get("importe_final") or 0)
            
        articulos_list = list(articulos_agg.values())
        articulos_list.sort(key=lambda x: x["total"], reverse=True)

        # CC
        cc_list = []
        for c in filtered_cc:
            cc_list.append({
                "id": c.get("id_cliente_erp"),
                "erp": c.get("id_cliente_erp"),
                "fantasia": c.get("cliente_nombre"),
                "deuda": float(c.get("deuda_total") or 0),
                "antiguedad": c.get("antiguedad_dias"),
                "comprobantes": c.get("cantidad_comprobantes"),
                "mora": c.get("rango_antiguedad")
            })
        cc_list.sort(key=lambda x: x["deuda"], reverse=True)

        return {
            "kpis": {
                "ventas": total_ventas,
                "bultos": total_bultos,
                "ticketPromedio": ticket_promedio,
                "clientesConVenta": clientes_con_venta
            },
            "chartVendedores": chart_vendedores,
            "chartTendencia": chart_tendencia,
            "rankingVendedores": ranking_vendedores,
            "ventas": ventas_list[:1000],
            "articulos": articulos_list[:500],
            "cc": cc_list
        }

    except Exception as e:
        logger.error(f"Error en supervision_v2_dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))
