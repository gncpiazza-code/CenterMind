# -*- coding: utf-8 -*-
"""
Endpoints de reportes, dashboard, bonos y landing pública.
"""
import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.config import AR_OFFSET
from core.helpers import (
    _get_erp_name_map,
    build_qa_exhibicion_integrante_ids,
    is_exhibicion_qa_display_for_dist,
    should_apply_exhibicion_qa_filter,
)
from core.security import verify_auth, check_dist_permission
from db import sb
from models.schemas import BonusConfigPayload, ReporteQuery

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()


# ─── Landing pública ─────────────────────────────────────────────────────────

@router.get("/api/public/landing-stats", summary="Estadísticas públicas para la Landing Page")
def public_landing_stats():
    try:
        result = sb.rpc("fn_landing_stats", {}).execute()
        if result.data:
            return result.data[0]
        return {"auditorias_pdv": 0, "miembros_activos": 0, "sucursales_vinculadas": 0}
    except Exception:
        return {"auditorias_pdv": 2500, "miembros_activos": 150, "sucursales_vinculadas": 50}


# ─── Reports ─────────────────────────────────────────────────────────────────

@router.get("/api/reports/performance/{id_distribuidor}", tags=["Reports"])
def get_reporte_performance(id_distribuidor: int, mes: int = Query(...), anio: int = Query(...), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_reporte_vendedor_objetivos", {"p_dist_id": id_distribuidor, "p_mes": mes, "p_anio": anio}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en reporte performance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/reports/ventas-resumen/{id_distribuidor}", tags=["Reports"])
def get_ventas_resumen(id_distribuidor: int, desde: str = Query(...), hasta: str = Query(...), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_reporte_comprobantes_resumen", {"p_dist_id": id_distribuidor, "p_desde": desde, "p_hasta": hasta}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en reporte ventas resumen: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/reports/ventas-bultos/{id_distribuidor}", tags=["Reports"])
def get_ventas_bultos(id_distribuidor: int, desde: str = Query(...), hasta: str = Query(...), proveedor: str | None = Query(None), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_reporte_comprobantes_detallado", {"p_dist_id": id_distribuidor, "p_desde": desde, "p_hasta": hasta, "p_proveedor_busqueda": proveedor}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en reporte ventas bultos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/reports/auditoria-sigo/{id_distribuidor}", tags=["Reports"])
def get_auditoria_sigo(id_distribuidor: int, desde: str = Query(...), hasta: str = Query(...), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_reporte_sigo_audit", {"p_dist_id": id_distribuidor, "p_desde": desde, "p_hasta": hasta}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en reporte sigo audit: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Alias de reports con path alternativo /api/reports/ventas-* y /dist_id
@router.get("/api/reports/ventas-resumen/{dist_id}")
def report_ventas_resumen(dist_id: int, desde: str = Query(...), hasta: str = Query(...), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    res = sb.rpc("fn_reporte_comprobantes_resumen", {"p_dist_id": dist_id, "p_desde": desde, "p_hasta": hasta}).execute()
    return res.data or []


@router.get("/api/reports/ventas-bultos/{dist_id}")
def report_ventas_bultos(dist_id: int, desde: str = Query(...), hasta: str = Query(...), proveedor: str = Query(None), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    res = sb.rpc("fn_reporte_comprobantes_detallado", {"p_dist_id": dist_id, "p_desde": desde, "p_hasta": hasta, "p_proveedor_busqueda": proveedor}).execute()
    return res.data or []


@router.get("/api/reports/auditoria-sigo/{dist_id}")
def report_auditoria_sigo(dist_id: int, desde: str = Query(...), hasta: str = Query(...), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    res = sb.rpc("fn_reporte_sigo_audit", {"p_dist_id": dist_id, "p_desde": desde, "p_hasta": hasta}).execute()
    return res.data or []


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/api/dashboard/kpis/{distribuidor_id}", summary="KPIs del dashboard por período")
def dashboard_kpis(distribuidor_id: int, periodo: str = "mes", sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    result = sb.rpc("fn_dashboard_kpis", {"p_dist_id": distribuidor_id, "p_periodo": periodo, "p_sucursal_id": sucursal_id}).execute()
    r = result.data[0] if result.data else {}
    return {k: (v or 0) for k, v in r.items()}


@router.get("/api/dashboard/ranking/{distribuidor_id}", summary="Ranking de vendedores por período")
def dashboard_ranking(distribuidor_id: int, periodo: str = "mes", top: int = 999, sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    result = sb.rpc("fn_dashboard_ranking", {"p_dist_id": distribuidor_id, "p_periodo": periodo, "p_top": top, "p_sucursal_id": sucursal_id}).execute()
    rows = result.data or []

    erp_name_map = _get_erp_name_map(distribuidor_id)
    hide_qa = should_apply_exhibicion_qa_filter(distribuidor_id, payload)
    aggregated: dict = {}
    NUMERIC_FIELDS = ("total", "aprobadas", "rechazadas", "destacadas", "pendientes", "total_enviadas", "total_aprobadas", "total_rechazadas", "total_destacadas", "puntos")
    for row in rows:
        tg_name = (row.get("vendedor") or "").strip()
        erp_name = erp_name_map.get(tg_name.lower(), tg_name)
        if hide_qa and (
            is_exhibicion_qa_display_for_dist(distribuidor_id, erp_name)
            or is_exhibicion_qa_display_for_dist(distribuidor_id, tg_name)
        ):
            continue
        if erp_name not in aggregated:
            aggregated[erp_name] = {**row, "vendedor": erp_name}
        else:
            for field in NUMERIC_FIELDS:
                if field in row:
                    val     = row.get(field) or 0
                    current = aggregated[erp_name].get(field) or 0
                    aggregated[erp_name][field] = current + val

    sample   = rows[0] if rows else {}
    sort_key = "puntos" if "puntos" in sample else ("total" if "total" in sample else "total_enviadas")
    sorted_rows = sorted(aggregated.values(), key=lambda x: x.get(sort_key) or 0, reverse=True)
    return sorted_rows[:top]


@router.get("/api/dashboard/ranking-historico/{distribuidor_id}", summary="Ranking histórico diario del mes en curso")
def dashboard_ranking_historico(distribuidor_id: int, sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    ar_now    = datetime.utcnow() - timedelta(hours=3)
    primer_dia = ar_now.date().replace(day=1).isoformat()
    hoy        = ar_now.date().isoformat()

    result = (
        sb.table("exhibiciones")
        .select("timestamp_subida, estado, id_integrante")
        .eq("id_distribuidor", distribuidor_id)
        .gte("timestamp_subida", primer_dia)
        .lte("timestamp_subida", hoy + "T23:59:59")
        .execute()
    )
    rows = result.data or []
    if not rows: return []

    erp_name_map  = _get_erp_name_map(distribuidor_id)
    integrantes_res = sb.table("integrantes_grupo").select("id_integrante, nombre_integrante").eq("id_distribuidor", distribuidor_id).execute()
    int_map = {r["id_integrante"]: r["nombre_integrante"] for r in (integrantes_res.data or [])}

    daily: dict[tuple[str, str], int] = {}
    hide_qa = should_apply_exhibicion_qa_filter(distribuidor_id, payload)
    for r in rows:
        ts     = r.get("timestamp_subida") or ""
        fecha  = ts.split("T")[0]
        id_int = r.get("id_integrante")
        tg_name = int_map.get(id_int, "Desconocido")
        erp_name = erp_name_map.get(tg_name.lower(), tg_name)
        if hide_qa and (
            is_exhibicion_qa_display_for_dist(distribuidor_id, erp_name)
            or is_exhibicion_qa_display_for_dist(distribuidor_id, tg_name)
        ):
            continue
        est = (r.get("estado") or "").lower()
        pts = 2 if "destacad" in est else (1 if "aprobad" in est else 0)
        if pts > 0:
            key = (fecha, erp_name)
            daily[key] = daily.get(key, 0) + pts

    fechas    = sorted({k[0] for k in daily})
    vendedores = sorted({k[1] for k in daily})
    acumulado: dict[str, int] = {v: 0 for v in vendedores}
    resultado = []
    for fecha in fechas:
        for vend in vendedores:
            pts_dia = daily.get((fecha, vend), 0)
            acumulado[vend] += pts_dia
            if pts_dia > 0 or acumulado[vend] > 0:
                resultado.append({"fecha": fecha, "vendedor": vend, "puntos_dia": pts_dia, "puntos_acumulados": acumulado[vend]})
    resultado.sort(key=lambda x: (x["fecha"], -x["puntos_acumulados"]))
    return resultado


@router.get("/api/dashboard/evolucion-tiempo/{distribuidor_id}", summary="Evolución temporal de exhibiciones")
def dashboard_evolucion(distribuidor_id: int, periodo: str = "mes", sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    res = sb.rpc("fn_dashboard_evolucion_tiempo", {"p_dist_id": distribuidor_id, "p_periodo": periodo, "p_sucursal_id": sucursal_id}).execute()
    return res.data or []


@router.get("/api/dashboard/por-ciudad/{distribuidor_id}", summary="Rendimiento agrupado por ciudad")
def dashboard_por_ciudad(distribuidor_id: int, periodo: str = "mes", sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    res = sb.rpc("fn_dashboard_por_ciudad", {"p_dist_id": distribuidor_id, "p_periodo": periodo, "p_sucursal_id": sucursal_id}).execute()
    return res.data or []


@router.get("/api/dashboard/por-empresa", summary="Rendimiento por empresa (Superadmin)")
def dashboard_por_empresa(periodo: str = "mes", sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    if not payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso solo para Superadmins")
    res = sb.rpc("fn_dashboard_por_empresa", {"p_periodo": periodo, "p_sucursal_id": sucursal_id}).execute()
    return res.data or []


@router.get("/api/dashboard/por-sucursal/{distribuidor_id}", summary="Exhibiciones agrupadas por sucursal")
def dashboard_por_sucursal(distribuidor_id: int, periodo: str = "mes", sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    res = sb.rpc("fn_dashboard_por_sucursal", {"p_dist_id": distribuidor_id, "p_periodo": periodo}).execute()
    return res.data or []


@router.get("/api/dashboard/ultimas-evaluadas/{distribuidor_id}", summary="Últimas fotos evaluadas")
def dashboard_ultimas(distribuidor_id: int, n: int = 8, payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    ar_today = (datetime.utcnow() - timedelta(hours=3)).date()
    hide_qa = should_apply_exhibicion_qa_filter(distribuidor_id, payload)
    qa_ids = build_qa_exhibicion_integrante_ids(distribuidor_id) if hide_qa else frozenset()
    erp_name_map = _get_erp_name_map(distribuidor_id) if hide_qa else {}
    for days_back in range(90):
        fecha  = (ar_today - timedelta(days=days_back)).isoformat()
        result = sb.rpc("fn_ultimas_evaluadas", {"p_dist_id": distribuidor_id, "p_fecha": fecha, "p_limit": n}).execute()
        if result.data:
            if not hide_qa:
                return result.data
            out = []
            for row in result.data:
                iid = row.get("id_integrante")
                tg = (row.get("vendedor") or "").strip()
                erp = erp_name_map.get(tg.lower(), tg) if tg else ""
                if iid in qa_ids:
                    continue
                if is_exhibicion_qa_display_for_dist(distribuidor_id, erp) or is_exhibicion_qa_display_for_dist(distribuidor_id, tg):
                    continue
                out.append(row)
            if out:
                return out
    return []


@router.get("/api/dashboard/imagen/{file_id}", summary="Proxy de imagen — Removido")
def dashboard_imagen(file_id: str):
    raise HTTPException(status_code=410, detail="Endpoint removido. Las fotos se sirven directamente desde Supabase Storage.")


# ─── Reportes de exhibiciones / ERP ──────────────────────────────────────────

@router.get("/api/reportes/vendedores/{distribuidor_id}")
def reportes_vendedores(distribuidor_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, distribuidor_id)
    erp_name_map = _get_erp_name_map(distribuidor_id)
    hide_qa = should_apply_exhibicion_qa_filter(distribuidor_id, user_payload)
    qa_ids = build_qa_exhibicion_integrante_ids(distribuidor_id) if hide_qa else frozenset()
    q = sb.table("exhibiciones").select("id_integrante")
    if distribuidor_id > 0: q = q.eq("id_distribuidor", distribuidor_id)
    ex_result = q.execute()
    integrante_ids = list(set(r["id_integrante"] for r in (ex_result.data or []) if r.get("id_integrante")))
    if not integrante_ids: return []
    ig_result = sb.table("integrantes_grupo").select("id_integrante,nombre_integrante").in_("id_integrante", integrante_ids).not_.is_("nombre_integrante", "null").execute()
    vendedores_unicos = set()
    for r in ig_result.data or []:
        if hide_qa and r.get("id_integrante") in qa_ids:
            continue
        tg_name = r["nombre_integrante"]
        if not tg_name: continue
        erp_name = erp_name_map.get(tg_name.lower(), tg_name)
        if hide_qa and (
            is_exhibicion_qa_display_for_dist(distribuidor_id, erp_name)
            or is_exhibicion_qa_display_for_dist(distribuidor_id, tg_name)
        ):
            continue
        vendedores_unicos.add(erp_name)
    return sorted(list(vendedores_unicos))


@router.get("/api/reportes/tipos-pdv/{distribuidor_id}")
def reportes_tipos_pdv(distribuidor_id: int, _=Depends(verify_auth)):
    q = sb.table("exhibiciones").select("tipo_pdv")
    if distribuidor_id > 0: q = q.eq("id_distribuidor", distribuidor_id)
    result = q.not_.is_("tipo_pdv", "null").execute()
    return sorted(set(r["tipo_pdv"] for r in (result.data or []) if r.get("tipo_pdv")))


@router.get("/api/reportes/sucursales/{distribuidor_id}")
def reportes_sucursales(distribuidor_id: int, _=Depends(verify_auth)):
    q = sb.table("sucursales").select("nombre_erp")
    if distribuidor_id > 0: q = q.eq("id_distribuidor", distribuidor_id)
    result = q.execute()
    return sorted(list(set(r["nombre_erp"] for r in (result.data or []) if r.get("nombre_erp"))))


@router.post("/api/reportes/exhibiciones/{distribuidor_id}")
def reportes_exhibiciones(distribuidor_id: int, q_body: ReporteQuery, _=Depends(verify_auth)):
    query = sb.table("exhibiciones").select(
        "id_exhibicion, estado, tipo_pdv, supervisor_nombre, comentario_evaluacion, "
        "timestamp_subida, evaluated_at, url_foto_drive, id_integrante, id_cliente"
    )
    query = query.gte("timestamp_subida", f"{q_body.fecha_desde}T03:00:00Z").lte("timestamp_subida", f"{q_body.fecha_hasta}T23:59:59Z")
    if distribuidor_id > 0: query = query.eq("id_distribuidor", distribuidor_id)
    if q_body.estados:    query = query.in_("estado", q_body.estados)
    if q_body.tipos_pdv:  query = query.in_("tipo_pdv", q_body.tipos_pdv)
    result = query.order("timestamp_subida", desc=True).execute()
    rows   = result.data or []

    erp_name_map = _get_erp_name_map(distribuidor_id)
    integrantes_res = sb.table("integrantes_grupo").select("id_integrante, nombre_integrante").eq("id_distribuidor", distribuidor_id).execute()
    int_map = {r["id_integrante"]: r["nombre_integrante"] for r in (integrantes_res.data or [])}

    filtered_rows = []
    for r in rows:
        id_int  = r.get("id_integrante")
        tg_name = int_map.get(id_int, "Desconocido")
        if distribuidor_id == 3 and tg_name.lower() == "nacho": continue
        erp_name = erp_name_map.get(tg_name.lower(), tg_name)
        if distribuidor_id == 3 and erp_name.lower() == "nacho": continue
        r["vendedor"] = erp_name
        filtered_rows.append(r)
    rows = filtered_rows

    integrante_ids = list(set(r.get("id_integrante") for r in rows if r.get("id_integrante")))
    cliente_ids    = list(set(r["id_cliente"] for r in rows if r.get("id_cliente")))
    vendedores_map: dict = {}
    clientes_map:   dict = {}
    if integrante_ids:
        ig = sb.table("integrantes_grupo").select("id_integrante, nombre_integrante, vendedores_v2(nombre_erp)").in_("id_integrante", integrante_ids).execute()
        for r in ig.data or []:
            vend = r.get("vendedores_v2")
            nombre_erp = None
            if isinstance(vend, dict): nombre_erp = vend.get("nombre_erp")
            elif isinstance(vend, list) and vend: nombre_erp = vend[0].get("nombre_erp")
            vendedores_map[r["id_integrante"]] = nombre_erp or r["nombre_integrante"]
    if cliente_ids:
        cl = sb.table("clientes_pdv_v2").select("id_cliente, id_cliente_erp").in_("id_cliente", cliente_ids).execute()
        clientes_map = {r["id_cliente"]: r["id_cliente_erp"] for r in (cl.data or [])}

    output = []
    for r in rows:
        if q_body.vendedores:
            vendedor_name = vendedores_map.get(r.get("id_integrante"), "")
            if vendedor_name not in q_body.vendedores: continue
        output.append({
            "id_exhibicion": r["id_exhibicion"],
            "vendedor": vendedores_map.get(r.get("id_integrante"), "Sin nombre"),
            "sucursal": "",
            "cliente": clientes_map.get(r.get("id_cliente"), str(r.get("id_cliente", ""))),
            "tipo_pdv": r.get("tipo_pdv", ""), "estado": r["estado"],
            "supervisor": r.get("supervisor_nombre", ""), "comentario": r.get("comentario_evaluacion", ""),
            "fecha_carga": r.get("timestamp_subida"), "fecha_evaluacion": r.get("evaluated_at"),
            "link_foto": r.get("url_foto_drive", ""),
        })
    return output


@router.get("/api/reportes/recaudacion/{dist_id}")
def get_recaudacion_summary(dist_id: int, desde: str = Query(None), hasta: str = Query(None), vendedor: str = Query(None), _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_recaudacion_kpis", {
        "p_dist_id": dist_id,
        "p_desde": desde or (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
        "p_hasta": hasta or datetime.now().strftime("%Y-%m-%d"),
        "p_vendedor": vendedor,
    }).execute()
    return res.data or {}


@router.get("/api/reportes/recaudacion-detallada/{dist_id}")
def get_recaudacion_detallada(dist_id: int, desde: str = Query(None), hasta: str = Query(None), vendedor: str = Query(None), _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_recaudacion_detallada", {
        "p_dist_id": dist_id,
        "p_desde": desde or (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d"),
        "p_hasta": hasta or datetime.now().strftime("%Y-%m-%d"),
        "p_vendedor": vendedor,
    }).execute()
    return res.data or []


@router.get("/api/reportes/clientes-muertos/{dist_id}")
def get_clientes_muertos(dist_id: int, dias: int = 30, _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_clientes_muertos", {"p_dist_id": dist_id, "p_dias": dias}).execute()
    return res.data or []


@router.get("/api/reportes/clientes/listado/{dist_id}", tags=["Reportes"])
def get_clientes_listado(dist_id: int, search: str = "", sucursal_id: str = "", vendedor_id: str = "", limit: int = 200, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        res = sb.rpc("fn_reporte_clientes_maestro", {"p_dist_id": dist_id, "p_search": search, "p_sucursal_id": sucursal_id, "p_vendedor_id": vendedor_id, "p_limit": limit}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en listado de clientes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/reportes/clientes/stats/{dist_id}", tags=["Reportes"])
def get_clientes_stats(dist_id: int, _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_clientes_stats", {"p_dist_id": dist_id}).execute()
    return res.data or {}


@router.get("/api/reportes/clientes/temporal/{dist_id}")
def get_clientes_temporal(dist_id: int, _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_clientes_temporal", {"p_dist_id": dist_id}).execute()
    return res.data or []


@router.get("/api/reportes/clientes/desglose/{dist_id}")
def get_clientes_desglose(dist_id: int, tipo: str = Query("vendedor"), _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_clientes_desglose", {"p_dist_id": dist_id, "p_tipo": tipo}).execute()
    return res.data or []


@router.get("/api/reportes/sucursales/cruce/{dist_id}", tags=["Reportes"])
def get_sucursales_cruce(dist_id: int, periodo: str = Query("mes"), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        res = sb.rpc("fn_reporte_sucursales_cruce", {"p_dist_id": dist_id, "p_periodo": periodo}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en cruce de sucursales: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Bonos ────────────────────────────────────────────────────────────────────

@router.get("/api/bonos/config/{id_distribuidor}", summary="Obtener config de bonos del mes")
def bonos_get_config(id_distribuidor: int, anio: int, mes: int, _=Depends(verify_auth)):
    result = sb.table("bonos_config").select("*").eq("id_distribuidor", id_distribuidor).eq("anio", anio).eq("mes", mes).execute()
    if not result.data:
        return {"id_config": None, "anio": anio, "mes": mes, "umbral": 0, "monto_bono_fijo": 0.0, "monto_por_punto": 0.0, "edicion_bloqueada": 0, "puestos": []}
    cfg = result.data[0]
    puestos_result = sb.table("bonos_ranking").select("puesto, premio_si_llego, premio_si_no_llego").eq("id_config", cfg["id_config"]).order("puesto").execute()
    cfg["puestos"] = puestos_result.data or []
    return cfg


@router.post("/api/bonos/config/{id_distribuidor}/guardar", summary="Guardar config de bonos del mes")
def bonos_guardar_config(id_distribuidor: int, payload: BonusConfigPayload, _=Depends(verify_auth)):
    existing = sb.table("bonos_config").select("id_config, edicion_bloqueada").eq("id_distribuidor", id_distribuidor).eq("anio", payload.anio).eq("mes", payload.mes).execute()
    if existing.data and existing.data[0].get("edicion_bloqueada"):
        raise HTTPException(status_code=403, detail="Configuracion bloqueada por el superadmin")
    config_data = {"id_distribuidor": id_distribuidor, "anio": payload.anio, "mes": payload.mes, "umbral": payload.umbral, "monto_bono_fijo": payload.monto_bono_fijo, "monto_por_punto": payload.monto_por_punto}
    result   = sb.table("bonos_config").upsert(config_data, on_conflict="id_distribuidor,anio,mes").execute()
    id_config = result.data[0]["id_config"]
    sb.table("bonos_ranking").delete().eq("id_config", id_config).execute()
    for p in payload.puestos:
        sb.table("bonos_ranking").insert({"id_config": id_config, "puesto": p["puesto"], "premio_si_llego": p.get("premio_si_llego", 0), "premio_si_no_llego": p.get("premio_si_no_llego", 0)}).execute()
    return {"ok": True, "id_config": id_config}


@router.post("/api/bonos/config/{id_distribuidor}/bloquear")
def bonos_bloquear(id_distribuidor: int, anio: int, mes: int, bloquear: int = 1, _=Depends(verify_auth)):
    sb.table("bonos_config").update({"edicion_bloqueada": bloquear}).eq("id_distribuidor", id_distribuidor).eq("anio", anio).eq("mes", mes).execute()
    return {"ok": True, "edicion_bloqueada": bloquear}


@router.get("/api/bonos/liquidacion/{id_distribuidor}", summary="Liquidacion de bonos del mes")
def bonos_liquidacion(id_distribuidor: int, anio: int, mes: int, _=Depends(verify_auth)):
    cfg_result = sb.table("bonos_config").select("*").eq("id_distribuidor", id_distribuidor).eq("anio", anio).eq("mes", mes).execute()
    cfg        = cfg_result.data[0] if cfg_result.data else None
    umbral     = cfg["umbral"] if cfg else 0
    bono_fijo  = cfg["monto_bono_fijo"] if cfg else 0.0
    por_punto  = cfg["monto_por_punto"] if cfg else 0.0
    id_config  = cfg["id_config"] if cfg else None
    puestos_map: dict = {}
    if id_config:
        for p in (sb.table("bonos_ranking").select("puesto, premio_si_llego, premio_si_no_llego").eq("id_config", id_config).order("puesto").execute().data or []):
            puestos_map[p["puesto"]] = p
    rows_result = sb.rpc("fn_bonos_liquidacion", {"p_dist_id": id_distribuidor, "p_anio": anio, "p_mes": mes}).execute()
    rows = rows_result.data or []
    erp_name_map = _get_erp_name_map(id_distribuidor)
    aggregated: dict = {}
    for d in rows:
        tg_name = (d.get("vendedor") or "").strip()
        if id_distribuidor == 3 and tg_name.lower() == "nacho": continue
        erp_name = erp_name_map.get(tg_name.lower(), tg_name)
        if id_distribuidor == 3 and erp_name.lower() == "nacho": continue
        if erp_name not in aggregated:
            aggregated[erp_name] = {"aprobadas": d["aprobadas"], "destacadas": d["destacadas"], "puntos": d["puntos"]}
        else:
            aggregated[erp_name]["aprobadas"]  += d["aprobadas"]
            aggregated[erp_name]["destacadas"] += d["destacadas"]
            aggregated[erp_name]["puntos"]     += d["puntos"]
    sorted_vends = sorted(aggregated.items(), key=lambda x: x[1]["puntos"], reverse=True)
    resultado = []
    for pos, (vendedor, d) in enumerate(sorted_vends, start=1):
        puntos     = d["puntos"]
        info_puesto = puestos_map.get(pos, {})
        llego      = puntos >= umbral
        bono       = (bono_fijo + info_puesto.get("premio_si_llego", 0.0)) if llego else (puntos * por_punto + info_puesto.get("premio_si_no_llego", 0.0))
        resultado.append({"puesto": pos, "vendedor": vendedor, "aprobadas": d["aprobadas"], "destacadas": d["destacadas"], "puntos": puntos, "llego_umbral": llego, "bono": round(bono, 2)})
    return {"anio": anio, "mes": mes, "umbral": umbral, "monto_bono_fijo": bono_fijo, "monto_por_punto": por_punto, "vendedores": resultado}


@router.get("/api/bonos/detalle/{id_distribuidor}", summary="Detalle exhibiciones de un vendedor")
def bonos_detalle(id_distribuidor: int, id_integrante: int, anio: int, mes: int, _=Depends(verify_auth)):
    result = sb.rpc("fn_bonos_detalle", {"p_dist_id": id_distribuidor, "p_integrante": id_integrante, "p_anio": anio, "p_mes": mes}).execute()
    return result.data or []
