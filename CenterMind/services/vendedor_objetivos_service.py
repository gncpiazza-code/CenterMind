"""
Servicio de objetivos para la app móvil de vendedores (SHELFYAPP / Flutter).
Usa objetivo_activo_para_vendedor de core/objetivos_filters.py como único filtro.
"""
from __future__ import annotations

import logging
from datetime import date

from supabase import Client

from core.objetivos_filters import objetivo_activo_para_vendedor, hoy_ar

logger = logging.getLogger("ShelfyAPI")

# Columnas a seleccionar de la tabla objetivos
_OBJETIVO_COLS = (
    "id, tipo, descripcion, fecha_objetivo, fecha_inicio, "
    "valor_actual, valor_objetivo, cumplido, lanzado_at, "
    "id_vendedor, nombre_vendedor, origen, mes_referencia"
)


def list_objetivos_vendedor(
    sb: Client,
    dist_id: int,
    id_vendedor_v2: int,
) -> list[dict]:
    """
    Retorna lista de objetivos activos del vendedor, ordenados por fecha_objetivo asc.

    Criterios de actividad (delegados a objetivo_activo_para_vendedor):
    - tipo != 'ruteo'
    - fecha_objetivo >= hoy_AR
    - lanzado_at IS NOT NULL
    - cumplido puede ser True (se muestra el progreso real)
    """
    hoy: date = hoy_ar()

    try:
        # Obtener objetivos del vendedor con paginación
        # La tabla objetivos no tiene sufijo de tenant — es global con id_distribuidor
        PAGE = 1000
        offset = 0
        all_objetivos: list[dict] = []
        while True:
            batch = (
                sb.table("objetivos")
                .select(_OBJETIVO_COLS)
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor", id_vendedor_v2)
                .order("fecha_objetivo", desc=False)
                .range(offset, offset + PAGE - 1)
                .execute().data or []
            )
            all_objetivos.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE

    except Exception as e:
        logger.error(f"list_objetivos_vendedor dist={dist_id} vendor={id_vendedor_v2}: {e}")
        return []

    activos: list[dict] = []
    for o in all_objetivos:
        try:
            if objetivo_activo_para_vendedor(o, hoy):
                activos.append(o)
        except Exception as e:
            logger.warning(f"objetivo_activo skip id={o.get('id')}: {e}")

    # Formatear para la app: solo campos relevantes
    result: list[dict] = []
    for o in activos:
        valor_objetivo = o.get("valor_objetivo") or 0
        valor_actual = o.get("valor_actual") or 0

        # Calcular porcentaje de progreso (puede superar 100%)
        if valor_objetivo > 0:
            progreso_pct = round((valor_actual / valor_objetivo) * 100, 1)
        else:
            progreso_pct = 0.0

        result.append({
            "id": o.get("id"),
            "tipo": (o.get("tipo") or "").strip(),
            "descripcion": (o.get("descripcion") or "").strip() or None,
            "fecha_objetivo": (o.get("fecha_objetivo") or "")[:10] or None,
            "fecha_inicio": (o.get("fecha_inicio") or "")[:10] or None,
            "valor_objetivo": valor_objetivo,
            "valor_actual": valor_actual,
            "progreso_pct": progreso_pct,
            "cumplido": bool(o.get("cumplido", False)),
            "lanzado_at": o.get("lanzado_at"),
            "origen": (o.get("origen") or "").strip() or None,
            "mes_referencia": (o.get("mes_referencia") or "")[:7] or None,
            "nombre_vendedor": (o.get("nombre_vendedor") or "").strip() or None,
        })

    return result


# Columnas extendidas para detalle individual
_OBJETIVO_DETALLE_COLS = (
    "id, tipo, descripcion, fecha_objetivo, fecha_inicio, "
    "valor_actual, valor_objetivo, cumplido, lanzado_at, "
    "id_vendedor, nombre_vendedor, origen, mes_referencia, "
    "created_at, id_target_pdv, desglose_cache, tasa_pendientes, "
    "progreso_diario_updated_at, min_pdvs_distintos"
)


def _fetch_pdv_nombre(sb, dist_id: int, id_pdv: int) -> str | None:
    """Busca nombre_fantasia o nombre_razon_social en clientes_pdv_v2."""
    from core.helpers import tenant_table_name
    pdv_table = tenant_table_name("clientes_pdv_v2", dist_id)
    try:
        res = (
            sb.table(pdv_table)
            .select("nombre_fantasia,nombre_razon_social")
            .eq("id_distribuidor", dist_id)
            .eq("id_cliente_erp", str(id_pdv))
            .limit(1)
            .execute()
        )
        if res.data:
            row = res.data[0]
            return (
                (row.get("nombre_fantasia") or "").strip()
                or (row.get("nombre_razon_social") or "").strip()
                or None
            )
    except Exception:
        pass
    return None


def get_objetivo_detalle(
    sb,
    dist_id: int,
    id_vendedor_v2: int,
    objetivo_id: str,
) -> dict | None:
    """
    Objetivo específico con campos extendidos para la pantalla de detalle.
    Retorna None si no existe; lanza HTTPException(403) si no pertenece al vendedor.
    """
    from fastapi import HTTPException

    try:
        res = (
            sb.table("objetivos")
            .select(_OBJETIVO_DETALLE_COLS)
            .eq("id_distribuidor", dist_id)
            .eq("id", objetivo_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.error(f"get_objetivo_detalle dist={dist_id} obj={objetivo_id}: {e}")
        return None

    if not res.data:
        return None

    o = res.data[0]

    if o.get("id_vendedor") != id_vendedor_v2:
        raise HTTPException(status_code=403, detail="No autorizado")

    valor_objetivo = o.get("valor_objetivo") or 0
    valor_actual = o.get("valor_actual") or 0
    progreso_pct = round((valor_actual / valor_objetivo) * 100, 1) if valor_objetivo > 0 else 0.0

    # Enriquecer con nombre del PDV target si existe
    id_target_pdv = o.get("id_target_pdv")
    items_pdv = None
    if id_target_pdv is not None:
        nombre_pdv = _fetch_pdv_nombre(sb, dist_id, id_target_pdv)
        items_pdv = [{"id": id_target_pdv, "nombre": nombre_pdv}]

    # Generar recomendaciones accionables (texto desde BE, no lógica en Flutter)
    cumplido = bool(o.get("cumplido", False))
    tipo_str = (o.get("tipo") or "").strip()
    recomendaciones: list[str] = []
    if not cumplido:
        gap = valor_objetivo - valor_actual
        if gap > 0:
            if tipo_str == "exhibicion":
                unidad = "exhibición" if gap == 1 else "exhibiciones"
                recomendaciones.append(f"Necesitás {gap} {unidad} más para cumplir el objetivo.")
            elif tipo_str == "compradores":
                unidad = "comprador" if gap == 1 else "compradores"
                recomendaciones.append(f"Necesitás {gap} {unidad} más para cumplir el objetivo.")
            elif tipo_str in ("ruteo_alteo", "alteo"):
                unidad = "alta" if gap == 1 else "altas"
                recomendaciones.append(f"Necesitás {gap} {unidad} más para cumplir el objetivo.")
            else:
                recomendaciones.append(f"Faltan {gap} unidades para cumplir el objetivo.")
        if id_target_pdv is not None:
            nombre = (items_pdv[0]["nombre"] or "") if items_pdv else ""
            pdv_label = f"{nombre} (NRO {id_target_pdv})" if nombre else f"NRO {id_target_pdv}"
            recomendaciones.append(f"El objetivo es en el PDV {pdv_label}.")

    # resumen_mobile: campos tipados — Flutter solo pinta, nunca parsea descripcion
    _tipo_labels = {
        "exhibicion": "Exhibición", "compradores": "Compradores",
        "ruteo_alteo": "Alteo", "alteo": "Alteo",
    }
    _tipo_acciones = {
        "exhibicion": "Registrá exhibiciones",
        "compradores": "Sumá compradores",
        "ruteo_alteo": "Completá altas en PDVs",
    }
    mes_ref = (o.get("mes_referencia") or "")[:7]
    origen_str = (o.get("origen") or "").strip() or None
    resumen_mobile = {
        "titulo": _tipo_labels.get(tipo_str, tipo_str.capitalize()),
        "origen": origen_str,
        "mes": mes_ref or None,
        "meta_label": f"{valor_actual} de {valor_objetivo}",
        "progreso_pct": progreso_pct,
        "accion": _tipo_acciones.get(tipo_str, "Completá el objetivo"),
        "tip": recomendaciones[0] if recomendaciones else None,
    }

    return {
        "id": o.get("id"),
        "tipo": tipo_str,
        "descripcion": (o.get("descripcion") or "").strip() or None,
        "fecha_objetivo": (o.get("fecha_objetivo") or "")[:10] or None,
        "fecha_inicio": (o.get("fecha_inicio") or "")[:10] or None,
        "valor_objetivo": valor_objetivo,
        "valor_actual": valor_actual,
        "progreso_pct": progreso_pct,
        "cumplido": cumplido,
        "lanzado_at": o.get("lanzado_at"),
        "origen": origen_str,
        "mes_referencia": mes_ref or None,
        "nombre_vendedor": (o.get("nombre_vendedor") or "").strip() or None,
        "tasa_pendientes": o.get("tasa_pendientes"),
        "progreso_diario_updated_at": o.get("progreso_diario_updated_at"),
        "min_pdvs_distintos": o.get("min_pdvs_distintos"),
        "desglose": o.get("desglose_cache"),
        "items_pdv": items_pdv,
        "recomendaciones": recomendaciones,
        "resumen_mobile": resumen_mobile,
    }
