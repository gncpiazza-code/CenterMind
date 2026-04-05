# -*- coding: utf-8 -*-
"""
Panel de supervisión: vendedores, rutas, clientes PDV, ventas, cuentas corrientes,
objetivos, PDVs cercanos, evaluación de exhibiciones.
"""
import io
import logging
import math
import tempfile
import unicodedata
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile

from core.helpers import _get_erp_name_map, _enrich_and_store_cc
from core.security import verify_auth, check_dist_permission
from db import sb
from models.schemas import EvaluarRequest, ObjetivoCreate, ObjetivoUpdate, RevertirRequest

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()


# ─── Exhibiciones: pendientes, evaluar, revertir ──────────────────────────────

@router.get("/api/pendientes/{id_distribuidor}", summary="Exhibiciones pendientes agrupadas por mensaje")
def get_pendientes(id_distribuidor: int, payload=Depends(verify_auth)):
    check_dist_permission(payload, id_distribuidor)
    try:
        result = sb.rpc("fn_pendientes", {"p_dist_id": id_distribuidor}).execute()
        rows = result.data or []

        pendientes_sin_nro = [r.get("id_exhibicion") for r in rows if r.get("id_exhibicion") and (not r.get("nro_cliente") or r.get("nro_cliente") == "0")]
        if pendientes_sin_nro:
            try:
                extra_res = sb.table("exhibiciones").select("id_exhibicion, id_cliente_pdv").in_("id_exhibicion", pendientes_sin_nro).execute()
                exh_cliente = {r["id_exhibicion"]: r.get("id_cliente_pdv") for r in (extra_res.data or []) if r.get("id_cliente_pdv")}
                nro_map = {}
                if exh_cliente:
                    pdv_res = sb.table("clientes_pdv_v2").select("id_cliente, id_cliente_erp").in_("id_cliente", list(set(exh_cliente.values()))).execute()
                    pdv_erp = {r["id_cliente"]: r["id_cliente_erp"] for r in (pdv_res.data or [])}
                    nro_map = {ex_id: pdv_erp[cid] for ex_id, cid in exh_cliente.items() if cid in pdv_erp}
                for r in rows:
                    if not r.get("nro_cliente") or r.get("nro_cliente") == "0":
                        ex_id = r.get("id_exhibicion")
                        if ex_id in nro_map:
                            r["nro_cliente"] = nro_map[ex_id]
            except Exception as enrich_err:
                logger.error(f"Error en enriquecimiento nro_cliente: {enrich_err}")

        erp_name_map = _get_erp_name_map(id_distribuidor)
        grupos: dict = {}
        for d in rows:
            ex_id = d.get("id_exhibicion")
            if not ex_id:
                continue
            key = str(d.get("telegram_msg_id")) if d.get("telegram_msg_id") else f"solo_{ex_id}"
            tg_vendedor = (d.get("vendedor") or "S/V").strip()
            vendedor_display = erp_name_map.get(tg_vendedor.lower(), tg_vendedor)
            if key not in grupos:
                grupos[key] = {
                    "vendedor": vendedor_display,
                    "nro_cliente": d.get("nro_cliente") or "S/C",
                    "tipo_pdv": d.get("tipo_pdv") or "S/D",
                    "fecha_hora": d.get("fecha_hora") or "",
                    "fotos": [],
                }
            grupos[key]["fotos"].append({"id_exhibicion": ex_id, "drive_link": d.get("drive_link") or "", "estado": d.get("estado")})
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
        nombres = []
        seen = set()
        for r in result.data or []:
            tg_name = (r.get("nombre_integrante") or "").strip()
            display = erp_name_map.get(tg_name.lower(), tg_name)
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

        r = sb.table("exhibiciones").update({
            "estado": req.estado,
            "supervisor_nombre": req.supervisor,
            "comentario_evaluacion": req.comentario or None,
            "evaluated_at": datetime.utcnow().isoformat(),
            "evaluado_por_id": user_payload.get("id_usuario"),
            "synced_telegram": 0,
        }).in_("id_exhibicion", req.ids_exhibicion).eq("estado", "Pendiente").execute()
        affected = len(r.data) if r.data else 0
        return {"affected": affected}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en evaluar batch: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/revertir", summary="Revertir evaluacion a Pendiente")
def revertir(req: RevertirRequest, _=Depends(verify_auth)):
    try:
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
        return {"affected": affected}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Supervisión: vendedores, rutas, clientes ─────────────────────────────────

@router.get("/api/supervision/vendedores/{dist_id}", tags=["Supervisión"])
def supervision_vendedores(dist_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        res = sb.rpc("fn_supervision_vendedores", {"p_dist_id": dist_id}).execute()
        rows = res.data or []
        erp_name_map = _get_erp_name_map(dist_id)
        filtered = []
        for r in rows:
            tg_name = (r.get("nombre_vendedor") or "").strip()
            if dist_id == 3 and tg_name.lower() == "nacho":
                continue
            erp_name = erp_name_map.get(tg_name.lower(), tg_name)
            if dist_id == 3 and erp_name.lower() == "nacho":
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
        res = sb.rpc("fn_supervision_rutas", {"p_id_vendedor": id_vendedor}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en supervision_rutas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/clientes/{id_ruta}", tags=["Supervisión"])
def supervision_clientes(id_ruta: int, user_payload=Depends(verify_auth)):
    try:
        res = (
            sb.table("clientes_pdv_v2")
            .select(
                "id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social, "
                "domicilio, localidad, provincia, canal, latitud, longitud, "
                "fecha_ultima_compra, fecha_alta, id_distribuidor, id_ruta"
            )
            .eq("id_ruta", id_ruta)
            .order("nombre_fantasia")
            .execute()
        )
        rows = res.data or []

        if rows:
            ids_pdv  = [r["id_cliente"] for r in rows]
            erp_map  = {r["id_cliente_erp"]: r["id_cliente"] for r in rows if r.get("id_cliente_erp")}
            dist_id  = rows[0].get("id_distribuidor")
            exh_map:       dict = {}
            exh_foto_map:  dict = {}
            exh_count_map: dict = {}
            threshold_date = (datetime.now() - timedelta(days=30)).isoformat()

            try:
                exh_res = (
                    sb.table("exhibiciones")
                    .select("id_cliente_pdv, cliente_sombra_codigo, timestamp_subida, url_foto_drive")
                    .eq("id_distribuidor", dist_id)
                    .in_("id_cliente_pdv", ids_pdv)
                    .order("timestamp_subida", desc=True)
                    .execute()
                )
                for e in exh_res.data or []:
                    cid = e.get("id_cliente_pdv")
                    if cid:
                        exh_count_map[cid] = exh_count_map.get(cid, 0) + 1
                        if cid not in exh_map:
                            exh_map[cid]      = e.get("timestamp_subida")
                            exh_foto_map[cid] = e.get("url_foto_drive")

                erps_pending = [erp for erp, vid in erp_map.items() if vid not in exh_map]
                if erps_pending:
                    exh_erp_res = (
                        sb.table("exhibiciones")
                        .select("cliente_sombra_codigo, timestamp_subida, url_foto_drive")
                        .eq("id_distribuidor", dist_id)
                        .in_("cliente_sombra_codigo", erps_pending)
                        .order("timestamp_subida", desc=True)
                        .execute()
                    )
                    for e in exh_erp_res.data or []:
                        erp = e.get("cliente_sombra_codigo")
                        vid = erp_map.get(erp)
                        if vid:
                            exh_count_map[vid] = exh_count_map.get(vid, 0) + 1
                            if vid not in exh_map:
                                exh_map[vid]      = e.get("timestamp_subida")
                                exh_foto_map[vid] = e.get("url_foto_drive")
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


@router.get("/api/supervision/ventas/{dist_id}", tags=["Supervisión"])
def supervision_ventas(dist_id: int, dias: int = 30, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        fecha_desde = (datetime.now() - timedelta(days=dias)).strftime("%Y-%m-%d")

        res = (
            sb.table("ventas_v2")
            .select("vendedor, sucursal, tipo_operacion, es_devolucion, monto_total, monto_recaudado, fecha, cliente, comprobante, numero")
            .eq("id_distribuidor", int(dist_id))
            .eq("es_anulado", False)
            .gte("fecha", fecha_desde)
            .order("fecha", desc=True)
            .execute()
        )

        erp_name_map = _get_erp_name_map(dist_id)
        vendors: dict = {}
        for row in rows:
            v_raw = row.get("vendedor") or "Sin Vendedor"
            if dist_id == 3 and v_raw.lower() == "nacho":
                continue
            v = erp_name_map.get(v_raw.lower(), v_raw)
            if dist_id == 3 and v.lower() == "nacho":
                continue
            if v not in vendors:
                vendors[v] = {"vendedor": v, "total_facturas": 0, "monto_total": 0.0, "monto_recaudado": 0.0, "transacciones": []}
            vd = vendors[v]
            vd["total_facturas"] += 1
            vd["monto_total"]    += float(row.get("monto_total") or 0)
            vd["monto_recaudado"] += float(row.get("monto_recaudado") or 0)
            if len(vd["transacciones"]) < 100:
                vd["transacciones"].append({
                    "fecha": row["fecha"], "cliente": row.get("cliente"),
                    "comprobante": row.get("comprobante"), "numero": row.get("numero"),
                    "tipo_operacion": row.get("tipo_operacion"),
                    "es_devolucion": row.get("es_devolucion", False),
                    "monto_total": float(row.get("monto_total") or 0),
                    "monto_recaudado": float(row.get("monto_recaudado") or 0),
                })

        result = sorted(vendors.values(), key=lambda x: x["monto_total"], reverse=True)
        return {
            "dias": dias, "fecha_desde": fecha_desde,
            "total_facturado": round(sum(v["monto_total"] for v in result), 2),
            "total_recaudado": round(sum(v["monto_recaudado"] for v in result), 2),
            "total_facturas": sum(v["total_facturas"] for v in result),
            "vendedores": result,
        }
    except Exception as e:
        logger.error(f"Error en supervision_ventas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/cuentas/{dist_id}", tags=["Supervisión"])
def supervision_cuentas(dist_id: int, sucursal: Optional[str] = Query(None), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        try:
            d_id = int(dist_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="ID de distribuidor inválido")

        snap_res = (
            sb.table("cc_detalle")
            .select("fecha_snapshot")
            .eq("id_distribuidor", d_id)
            .order("fecha_snapshot", desc=True)
            .limit(1)
            .execute()
        )
        if not snap_res.data:
            logger.warning(f"No se encontró fecha_snapshot en cc_detalle para dist_id={d_id}")
            return {"fecha": None, "metadatos": {}, "vendedores": []}

        fecha_snapshot = snap_res.data[0]["fecha_snapshot"]

        sucursal_norm = sucursal
        if d_id == 3 and sucursal:
            mapping = {"1": "RECONQUISTA", "2": "RESISTENCIA", "3": "SAENZ PEÑA", "4": "CORRIENTES", "5": "CORDOBA"}
            sucursal_norm = mapping.get(str(sucursal).strip(), sucursal)

        # Load all rows without sucursal filter (filter in Python to handle unmatched enrichments)
        def build_query():
            return (
                sb.table("cc_detalle")
                .select("id_vendedor, vendedor_nombre, sucursal_nombre, cliente_nombre, id_cliente_erp, deuda_total, antiguedad_dias, rango_antiguedad, cantidad_comprobantes, alerta_credito")
                .eq("id_distribuidor", d_id)
                .eq("fecha_snapshot", fecha_snapshot)
            )

        rows = []
        page_size, page_offset = 1000, 0
        while True:
            batch = (build_query().range(page_offset, page_offset + page_size - 1).execute().data or [])
            rows.extend(batch)
            if len(batch) < page_size:
                break
            page_offset += page_size

        # Python-level sucursal filter: match by sucursal_nombre OR by id_vendedor membership
        if sucursal_norm:
            suc_q = (
                sb.table("sucursales_v2")
                .select("id_sucursal")
                .eq("id_distribuidor", d_id)
                .ilike("nombre_erp", f"%{sucursal_norm.strip()}%")
                .execute()
            )
            valid_suc_ids = {s["id_sucursal"] for s in (suc_q.data or [])}
            valid_vend_ids: set = set()
            if valid_suc_ids:
                vend_q = (
                    sb.table("vendedores_v2")
                    .select("id_vendedor")
                    .eq("id_distribuidor", d_id)
                    .in_("id_sucursal", list(valid_suc_ids))
                    .execute()
                )
                valid_vend_ids = {v["id_vendedor"] for v in (vend_q.data or [])}

            norm_filter = sucursal_norm.strip().upper()
            rows = [
                r for r in rows
                if (r.get("id_vendedor") and r["id_vendedor"] in valid_vend_ids)
                or norm_filter in (r.get("sucursal_nombre") or "").upper()
            ]

        # Cache PDV info for extra metadata (last purchase date)
        fecha_uc_map: dict = {}
        erp_id_map:   dict = {}
        try:
            pdv_offset = 0
            while True:
                pdv_res = (
                    sb.table("clientes_pdv_v2")
                    .select("nombre_fantasia, nombre_razon_social, id_cliente_erp, fecha_ultima_compra")
                    .eq("id_distribuidor", d_id)
                    .range(pdv_offset, pdv_offset + 999)
                    .execute()
                )
                pdv_batch = pdv_res.data or []
                for p in pdv_batch:
                    erp_id = p.get("id_cliente_erp")
                    fuc    = p.get("fecha_ultima_compra")
                    for key in [p.get("nombre_fantasia"), p.get("nombre_razon_social")]:
                        if key:
                            norm_key = key.strip().upper()
                            if fuc and norm_key not in fecha_uc_map:
                                fecha_uc_map[norm_key] = fuc
                            if erp_id and norm_key not in erp_id_map:
                                erp_id_map[norm_key] = str(erp_id).strip()
                if len(pdv_batch) < 1000:
                    break
                pdv_offset += 1000
        except Exception:
            pass

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
            nombre_norm = (item.get("cliente_nombre") or "").strip().upper()
            erp_id = item.get("id_cliente_erp") or erp_id_map.get(nombre_norm)
            vd["clientes"].append({
                "cliente": item.get("cliente_nombre"), "id_cliente_erp": erp_id,
                "sucursal": item.get("sucursal_nombre"), "deuda_total": deuda,
                "antiguedad": item.get("antiguedad_dias"), "rango_antiguedad": item.get("rango_antiguedad"),
                "cantidad_comprobantes": item.get("cantidad_comprobantes"),
                "fecha_ultima_compra": fecha_uc_map.get(nombre_norm),
            })

        for vd in vendors.values():
            vd["clientes"].sort(key=lambda x: x["deuda_total"], reverse=True)
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
        fields       = "id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social, domicilio, localidad, provincia, canal, latitud, longitud"
        nombre_s     = nombre.strip()
        nombre_plain = _strip_accents(nombre_s)

        if id_cliente_erp:
            r = sb.table("clientes_pdv_v2").select(fields).eq("id_distribuidor", dist_id).eq("id_cliente_erp", id_cliente_erp.strip()).limit(3).execute()
            if r.data:
                return r.data

        def _search(col: str, val: str, substring: bool = False) -> list:
            pattern = f"%{val}%" if substring else val
            r = sb.table("clientes_pdv_v2").select(fields).eq("id_distribuidor", dist_id).ilike(col, pattern).limit(3).execute()
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
                    q = sb.table("clientes_pdv_v2").select(fields).eq("id_distribuidor", dist_id)
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


@router.get("/api/supervision/pdvs-cercanos", tags=["Supervisión"])
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
            page_res = (
                sb.table("clientes_pdv_v2")
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
            rutas_res = sb.table("rutas_v2").select("id_ruta, id_ruta_erp, id_vendedor").in_("id_ruta", ids_ruta).execute()
            for r in rutas_res.data or []:
                ruta_map[r["id_ruta"]] = r
            ids_vend = list({r["id_vendedor"] for r in (rutas_res.data or []) if r.get("id_vendedor")})
            if ids_vend:
                vend_res = sb.table("vendedores_v2").select("id_vendedor, nombre_erp").in_("id_vendedor", ids_vend).execute()
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

@router.post("/api/supervision/objetivos", tags=["Supervisión"])
def crear_objetivo(body: ObjetivoCreate, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, body.id_distribuidor)
    TIPOS_VALIDOS = {"conversion_estado", "cobranza", "ruteo_alteo", "exhibicion", "general"}
    if body.tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"tipo inválido. Valores permitidos: {sorted(TIPOS_VALIDOS)}")
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

        payload = {
            "id_distribuidor": body.id_distribuidor, "id_vendedor": body.id_vendedor,
            "tipo": body.tipo, "id_target_pdv": body.id_target_pdv, "id_target_ruta": body.id_target_ruta,
            "descripcion": body.descripcion, "nombre_pdv": body.nombre_pdv, "nombre_vendedor": body.nombre_vendedor,
            "estado_inicial": estado_inicial, "estado_objetivo": body.estado_objetivo,
            "valor_objetivo": body.valor_objetivo, "fecha_objetivo": body.fecha_objetivo,
        }
        res = sb.table("objetivos").insert(payload).execute()
        rows = res.data or []
        if not rows:
            raise HTTPException(status_code=500, detail="No se pudo crear el objetivo")

        # Watcher refresh: compute valor_actual immediately so the UI shows
        # the correct starting state (e.g. 0 cobrado, N PDVs ya en ruta, etc.)
        try:
            from services.objetivos_watcher_service import objetivos_watcher
            objetivos_watcher.run_watcher(body.id_distribuidor)
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
        logger.error(f"Error en crear_objetivo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervision/objetivos/vendedor/{vendedor_id}", tags=["Supervisión"])
def objetivos_por_vendedor(vendedor_id: int, user_payload=Depends(verify_auth)):
    try:
        q = sb.table("objetivos").select("*").eq("id_vendedor", vendedor_id)
        if not user_payload.get("is_superadmin"):
            dist_id = user_payload.get("id_distribuidor")
            if dist_id:
                q = q.eq("id_distribuidor", dist_id)
        res = q.order("created_at", desc=True).execute()
        return res.data or []
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


@router.get("/api/supervision/objetivos/{dist_id}", tags=["Supervisión"])
def listar_objetivos(
    dist_id: int,
    vendedor_id: Optional[int] = Query(None),
    cumplido: Optional[bool]   = Query(None),
    tipo: Optional[str]        = Query(None),
    sucursal_nombre: Optional[str] = Query(None),
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    try:
        # Si se filtra por sucursal, resolver los id_vendedor de esa sucursal primero
        vendedor_ids_filtro: list[int] | None = None
        if sucursal_nombre:
            suc_res = sb.table("sucursales_v2") \
                .select("id_sucursal") \
                .eq("id_distribuidor", dist_id) \
                .ilike("nombre_erp", f"%{sucursal_nombre}%") \
                .execute()
            suc_ids = [r["id_sucursal"] for r in (suc_res.data or [])]
            if suc_ids:
                vend_res = sb.table("vendedores_v2") \
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
            pdv_res = sb.table("clientes_pdv_v2") \
                .select("id, id_cliente_erp") \
                .in_("id", pdv_ids) \
                .execute()
            pdv_erp_map = {p["id"]: p.get("id_cliente_erp") for p in (pdv_res.data or [])}
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
                obj["tiene_exhibicion_pendiente"] = obj.get("id_target_pdv") in pdvs_con_pendiente

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
        if body.cumplido      is not None:
            updates["cumplido"] = body.cumplido
            if body.cumplido:
                updates["completed_at"] = datetime.utcnow().isoformat()
        if body.descripcion   is not None: updates["descripcion"]    = body.descripcion
        if body.estado_objetivo is not None: updates["estado_objetivo"] = body.estado_objetivo
        if body.fecha_objetivo is not None: updates["fecha_objetivo"] = body.fecha_objetivo
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


@router.delete("/api/supervision/objetivos/{objetivo_id}", tags=["Supervisión"])
def eliminar_objetivo(objetivo_id: str, user_payload=Depends(verify_auth)):
    try:
        existing = sb.table("objetivos").select("id_distribuidor").eq("id", objetivo_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Objetivo no encontrado")
        dist_id = existing.data[0]["id_distribuidor"]
        check_dist_permission(user_payload, dist_id)
        sb.table("objetivos").delete().eq("id", objetivo_id).execute()
        return {"ok": True, "id": objetivo_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en eliminar_objetivo objetivo_id={objetivo_id}: {e}")
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
