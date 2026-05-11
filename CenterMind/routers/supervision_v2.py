from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
from datetime import datetime, timedelta
import logging

from db import sb
from core.tenant_tables import tenant_table_name
from core.security import verify_auth
from routers.supervision import check_dist_permission

logger = logging.getLogger("supervision_v2")

router = APIRouter()

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

        # 2. Build support maps (sucursales, vendedores, altas)
        vendedores_disponibles = set()
        sucursales_disponibles = set()

        def normalize_seller_name(name: str) -> str:
            if not name: return ""
            if "-" in name:
                return name.split("-")[-1].strip().upper()
            return name.strip().upper()

        t_suc = tenant_table_name("sucursales_v2", dist_id)
        res_sucs = sb.table(t_suc).select("id_sucursal, nombre_erp").execute()
        suc_map = {r["id_sucursal"]: r.get("nombre_erp", "") for r in res_sucs.data if r.get("id_sucursal")}

        # Fetch vendedores: id_vendedor needed for altas linkage
        t_vend = tenant_table_name("vendedores_v2", dist_id)
        res_vends = sb.table(t_vend).select("id_vendedor, nombre_erp, id_sucursal").execute()
        vend_to_suc: dict = {}
        vend_id_to_norm: dict = {}
        for r in res_vends.data:
            name = r.get("nombre_erp")
            vid = r.get("id_vendedor")
            if name:
                norm_name = normalize_seller_name(name)
                suc_name = suc_map.get(r.get("id_sucursal"), "").strip()
                vend_to_suc[norm_name] = suc_name.lower() if suc_name else ""
                if suc_name:
                    sucursales_disponibles.add(suc_name)
                if vid is not None:
                    vend_id_to_norm[vid] = norm_name

        # Fetch rutas → vendedor mapping for altas calculation
        t_rutas = tenant_table_name("rutas_v2", dist_id)
        res_rutas = sb.table(t_rutas).select("id_ruta, id_vendedor").execute()
        ruta_to_vend_id = {
            r["id_ruta"]: r["id_vendedor"]
            for r in res_rutas.data
            if r.get("id_ruta") is not None and r.get("id_vendedor") is not None
        }

        # Count altas (new clients with fecha_alta in period) per normalized vendor name
        t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
        vend_norm_to_altas: dict = {}
        altas_offset = 0
        while True:
            altas_batch = (
                sb.table(t_clientes)
                .select("id_ruta")
                .gte("fecha_alta", fecha_desde_str)
                .lte("fecha_alta", fecha_hasta_str)
                .range(altas_offset, altas_offset + PAGE - 1)
                .execute()
                .data or []
            )
            for row in altas_batch:
                rid = row.get("id_ruta")
                if rid is not None and rid in ruta_to_vend_id:
                    vid = ruta_to_vend_id[rid]
                    norm = vend_id_to_norm.get(vid, "")
                    if norm:
                        vend_norm_to_altas[norm] = vend_norm_to_altas.get(norm, 0) + 1
            if len(altas_batch) < PAGE:
                break
            altas_offset += PAGE

        # Collect available vendedores from actual sales data (id_distribuidor already isolates tenant)
        for v in ventas_rows:
            vend = normalize_seller_name(v.get("nombre_vendedor", ""))
            if vend:
                vendedores_disponibles.add(vend)

        # 3. Filter by sucursal and vendedor
        sucursal_norm = (sucursal or "").strip().lower()
        vendedor_norm = (vendedor or "").strip().lower()
        
        filtered_ventas = []
        for v in ventas_rows:
            vend_upper = normalize_seller_name(v.get("nombre_vendedor", ""))
            vend_lower = vend_upper.lower()
            if vendedor_norm and vendedor_norm not in vend_lower:
                continue
            if sucursal_norm:
                suc_for_vend = vend_to_suc.get(vend_upper, "")
                if sucursal_norm not in suc_for_vend:
                    continue
            filtered_ventas.append(v)

        # 4. Aggregate Data
        
        # KPIs
        total_ventas = sum(float(v.get("importe_final") or 0) for v in filtered_ventas)
        total_bultos = sum(float(v.get("bultos_total") or 0) for v in filtered_ventas)
        clientes_con_venta = len(set(v.get("id_cliente_erp") for v in filtered_ventas if v.get("id_cliente_erp")))
        ticket_promedio = total_ventas / len(filtered_ventas) if filtered_ventas else 0

        # Chart Vendedores
        vendedores_agg = {}
        for v in filtered_ventas:
            vend_name = normalize_seller_name(v.get("nombre_vendedor", "")) or "SIN VENDEDOR"
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
                "altas": vend_norm_to_altas.get(val["id"], 0)
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
                    "vendedor": normalize_seller_name(v.get("nombre_vendedor", "")) or "SIN VENDEDOR",
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
            "filtrosDisponibles": {
                "vendedores": sorted(list(vendedores_disponibles)),
                "sucursales": sorted(list(sucursales_disponibles))
            }
        }

    except Exception as e:
        logger.error(f"Error en supervision_v2_dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/supervision/v2/vendedor/{dist_id}/{vendedor_id}/detalle", tags=["Supervisión"])
def supervision_v2_vendedor_detalle(
    dist_id: int,
    vendedor_id: str, # Puede ser el nombre normalizado
    user_payload=Depends(verify_auth),
):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo superadmin")
    check_dist_permission(user_payload, dist_id)
    try:
        # Simplificamos: traer últimos 30 días de ventas de este vendedor
        fecha_desde_str = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        t_ventas = tenant_table_name("ventas_enriched_v2", dist_id)
        
        ventas_rows = []
        offset = 0
        while True:
            batch = (
                sb.table(t_ventas)
                .select("*")
                .eq("id_distribuidor", dist_id)
                .gte("fecha_factura", fecha_desde_str)
                .eq("anulado", False)
                .range(offset, offset + 1000 - 1)
                .execute()
                .data or []
            )
            ventas_rows.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000

        def normalize_seller_name(name: str) -> str:
            if not name: return ""
            if "-" in name:
                return name.split("-")[-1].strip().upper()
            return name.strip().upper()
            
        target_vend = normalize_seller_name(vendedor_id)
        filtered_ventas = []
        for v in ventas_rows:
            vend_upper = normalize_seller_name(v.get("nombre_vendedor", ""))
            if target_vend and target_vend in vend_upper:
                filtered_ventas.append(v)
                
        # Calcular kpis basicos del vendedor
        total_ventas = sum(float(v.get("importe_final") or 0) for v in filtered_ventas)
        total_bultos = sum(float(v.get("bultos_total") or 0) for v in filtered_ventas)
        clientes_unicos = len(set(v.get("id_cliente_erp") for v in filtered_ventas if v.get("id_cliente_erp")))
        
        return {
            "nombre": target_vend,
            "ventas_30d": total_ventas,
            "bultos_30d": total_bultos,
            "clientes_activos": clientes_unicos,
            "cantidad_comprobantes": len(set(v.get("numero_documento") for v in filtered_ventas))
        }

    except Exception as e:
        logger.error(f"Error detalle vendedor: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/supervision/v2/venta/{dist_id}/{comprobante_id}/detalle", tags=["Supervisión"])
def supervision_v2_venta_detalle(
    dist_id: int,
    comprobante_id: str,
    user_payload=Depends(verify_auth),
):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo superadmin")
    check_dist_permission(user_payload, dist_id)
    try:
        t_ventas = tenant_table_name("ventas_enriched_v2", dist_id)
        res = (
            sb.table(t_ventas)
            .select("*")
            .eq("id_distribuidor", dist_id)
            .eq("numero_documento", comprobante_id)
            .execute()
        )
        rows = res.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Comprobante no encontrado")
            
        # Agrupar items
        items = []
        total = 0
        bultos = 0
        for r in rows:
            importe = float(r.get("importe_final") or 0)
            b = float(r.get("bultos_total") or 0)
            total += importe
            bultos += b
            items.append({
                "codigo": r.get("cod_articulo"),
                "descripcion": r.get("descripcion_articulo"),
                "cantidad": b,
                "importe": importe
            })
            
        base = rows[0]
        return {
            "comprobante": comprobante_id,
            "fecha": base.get("fecha_factura"),
            "cliente": base.get("nombre_cliente"),
            "vendedor": base.get("nombre_vendedor"),
            "total": total,
            "bultos": bultos,
            "items": items
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error detalle venta: {e}")
        raise HTTPException(status_code=500, detail=str(e))
