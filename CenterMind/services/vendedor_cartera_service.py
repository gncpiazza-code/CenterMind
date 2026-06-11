"""
Servicio de cartera JSON para la app móvil (SHELFYAPP / Flutter).
Fuente: rutas_v2 + clientes_pdv_v2 + padron_cliente_vitalidad.
Modos: 'general' (toda la semana) | 'hoy' (solo día actual AR).

Misma lógica de consulta que bot_cartera_pdf_service pero retorna JSON
con campos extendidos (latitud, longitud, telefono, canal, etc.)
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from supabase import Client

from core.helpers import tenant_table_name
from core.padron_cliente_vitalidad import activo_comercial_por_fecha, DIAS_ACTIVO_COMERCIAL
from core.bot_snapshot_meta import resolve_snapshot_label
from services.bot_cartera_pdf_service import DIA_MAP, _norm_dia

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

# Días umbral para "próximo a caer"
DIAS_PROXIMO_CAER_MIN = 23


def build_cartera_json(
    sb: Client,
    dist_id: int,
    id_vendedor: int,
    mode: str = "general",
    *,
    pdv_erp_filter: set[str] | None = None,
) -> dict:
    """
    Genera JSON de cartera del vendedor con campos extendidos.
    mode: 'general' | 'hoy'
    Retorna dict con estructura:
        {
            "mode": ...,
            "snapshot_label": ...,
            "rutas": [{"id_ruta": ..., "dia_semana": ..., "pdvs": [...]}]
        }
    """
    # 1. Obtener rutas del vendedor
    rutas_table = tenant_table_name("rutas_v2", dist_id)
    rutas = (
        sb.table(rutas_table)
        .select("id_ruta,dia_semana")
        .eq("id_vendedor", id_vendedor)
        .execute().data or []
    )

    # 2. Filtrar por hoy si mode='hoy'
    if mode == "hoy":
        hoy_norm = _norm_dia(DIA_MAP.get(datetime.now(AR_TZ).weekday(), ""))
        rutas = [r for r in rutas if _norm_dia(r.get("dia_semana") or "") == hoy_norm]

    # 3. Para cada ruta, obtener PDVs con campos extendidos
    pdv_table = tenant_table_name("clientes_pdv_v2", dist_id)
    ruta_ids = [r["id_ruta"] for r in rutas]

    pdvs_by_ruta: dict[int, list[dict]] = {}
    if ruta_ids:
        PAGE = 1000
        offset = 0
        all_pdvs: list[dict] = []
        while True:
            batch = (
                sb.table(pdv_table)
                .select(
                    "id_ruta,id_cliente_erp,nombre_razon_social,nombre_fantasia,"
                    "domicilio,localidad,telefono,canal,"
                    "latitud,longitud,fecha_ultima_compra,fecha_alta"
                )
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", ruta_ids)
                .range(offset, offset + PAGE - 1)
                .execute().data or []
            )
            all_pdvs.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE

        hoy_iso = datetime.now(AR_TZ).date().isoformat()
        for pdv in all_pdvs:
            rid = pdv.get("id_ruta")
            fuc = pdv.get("fecha_ultima_compra")
            es_activo = activo_comercial_por_fecha(fuc, ref_iso=hoy_iso)
            es_proximo_caer = (
                not es_activo
                and activo_comercial_por_fecha(
                    fuc, dias_umbral=DIAS_ACTIVO_COMERCIAL + 7, ref_iso=hoy_iso
                )
            )

            if es_activo:
                vitalidad = "activo"
            elif es_proximo_caer:
                vitalidad = "por_caer"
            else:
                vitalidad = "inactivo"

            nombre_display = (
                (pdv.get("nombre_fantasia") or "").strip()
                or (pdv.get("nombre_razon_social") or "").strip()
                or "—"
            )

            # Normalizar latitud/longitud a float o None
            lat_raw = pdv.get("latitud")
            lng_raw = pdv.get("longitud")
            try:
                lat_val: float | None = float(lat_raw) if lat_raw is not None else None
            except (TypeError, ValueError):
                lat_val = None
            try:
                lng_val: float | None = float(lng_raw) if lng_raw is not None else None
            except (TypeError, ValueError):
                lng_val = None

            pdv_json = {
                "id_cliente_erp": str(pdv.get("id_cliente_erp") or ""),
                "nombre_display": nombre_display,
                "nombre_fantasia": (pdv.get("nombre_fantasia") or "").strip() or None,
                "nombre_razon_social": (pdv.get("nombre_razon_social") or "").strip() or None,
                "domicilio": (pdv.get("domicilio") or "").strip() or None,
                "localidad": (pdv.get("localidad") or "").strip() or None,
                "telefono": (pdv.get("telefono") or "").strip() or None,
                "canal": (pdv.get("canal") or "").strip() or None,
                "latitud": lat_val,
                "longitud": lng_val,
                "vitalidad": vitalidad,
                "fecha_ultima_compra": (pdv.get("fecha_ultima_compra") or "")[:10] or None,
                "fecha_alta": (pdv.get("fecha_alta") or "")[:10] or None,
            }
            erp_key = pdv_json["id_cliente_erp"]
            if pdv_erp_filter is not None and erp_key not in pdv_erp_filter:
                continue
            pdvs_by_ruta.setdefault(rid, []).append(pdv_json)

    # 4. Snapshot label
    snapshot_label = resolve_snapshot_label(sb, dist_id, "padron")

    # 5. Construir respuesta JSON
    rutas_out = []
    for ruta in rutas:
        pdvs = pdvs_by_ruta.get(ruta["id_ruta"], [])
        if pdv_erp_filter is not None and not pdvs:
            continue
        rutas_out.append({
            "id_ruta": ruta["id_ruta"],
            "dia_semana": ruta.get("dia_semana", "—"),
            "pdvs": pdvs,
        })

    return {
        "mode": mode,
        "snapshot_label": snapshot_label,
        "rutas": rutas_out,
    }


def get_ruta_hoy_summary(
    sb: Client,
    dist_id: int,
    id_vendedor: int,
    *,
    pdv_erp_filter: set[str] | None = None,
) -> dict:
    """
    Resumen rápido de la ruta del día: conteos por vitalidad.
    Retorna: {"total": N, "activos": N, "por_caer": N, "inactivos": N, "dia_semana": "Lunes"}
    """
    cartera = build_cartera_json(
        sb, dist_id, id_vendedor, mode="hoy", pdv_erp_filter=pdv_erp_filter
    )
    all_pdvs = [pdv for ruta in cartera["rutas"] for pdv in ruta["pdvs"]]

    activos = sum(1 for p in all_pdvs if p.get("vitalidad") == "activo")
    por_caer = sum(1 for p in all_pdvs if p.get("vitalidad") == "por_caer")
    inactivos = sum(1 for p in all_pdvs if p.get("vitalidad") == "inactivo")

    from datetime import datetime
    dia_semana = DIA_MAP.get(datetime.now(AR_TZ).weekday(), "")

    return {
        "total": len(all_pdvs),
        "activos": activos,
        "por_caer": por_caer,
        "inactivos": inactivos,
        "dia_semana": dia_semana,
        "snapshot_label": cartera.get("snapshot_label"),
    }
