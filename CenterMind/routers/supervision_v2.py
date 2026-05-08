from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
from datetime import datetime, timedelta
import logging

from db import sb
from core.tenant_tables import tenant_table_name
from auth.auth_bearer import verify_auth
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

        # 3. Aggregate Data for Filters (BEFORE filtering by sucursal/vendedor)
        vendedores_disponibles = set()
        sucursales_disponibles = set()
        
        for v in ventas_rows:
            vend = v.get("nombre_vendedor")
            if vend: vendedores_disponibles.add(vend)
            
        for c in cc_rows:
            suc = c.get("sucursal_nombre")
            if suc: sucursales_disponibles.add(suc)
            vend = c.get("vendedor_nombre")
            if vend: vendedores_disponibles.add(vend)

        # 4. Filter by sucursal and vendedor
        # Normalizar nombres para filtrado
        sucursal_norm = (sucursal or "").strip().lower()
        vendedor_norm = (vendedor or "").strip().lower()
        
        # Filtrar ventas
        filtered_ventas = []
        for v in ventas_rows:
            if vendedor_norm and vendedor_norm not in str(v.get("nombre_vendedor", "")).lower():
                continue
            # TODO: Filtrar por sucursal si es necesario (requiere cruce con vendedores_v2 o si viene en la data)
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
        # Agrupar por comprobante
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
                    "condicion": "Contado", # TODO: cruzar con CC
                    "bultos": 0,
                    "total": 0
                }
            comprobantes_agg[comp]["bultos"] += float(v.get("bultos_total") or 0)
            comprobantes_agg[comp]["total"] += float(v.get("importe_final") or 0)
            
        # Determinar condición cruzando con CC
        cc_clientes = {str(c.get("id_cliente_erp")): c for c in cc_rows}
        for comp, data in comprobantes_agg.items():
            # Si el cliente tiene deuda, marcamos como Cta. Cte. (simplificación)
            pass
            
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
            "ventas": ventas_list[:1000], # Limitar a 1000 para no saturar
            "articulos": articulos_list[:500],
            "cc": cc_list,
            "filtrosDisponibles": {
                "vendedores": sorted(list(vendedores_disponibles)),
                "sucursales": sorted(list(sucursales_disponibles))
            }
        }

    except Exception as e:
        logger.error(f"Error en supervision_v2_dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))
