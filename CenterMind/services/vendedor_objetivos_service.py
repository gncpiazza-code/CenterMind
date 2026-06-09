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


def _fetch_objetivo_items(sb, objetivo_id: str) -> list[int]:
    """IDs internos de PDV asociados al objetivo (paridad cmd_objetivos)."""
    ids: list[int] = []
    try:
        res = (
            sb.table("objetivo_items")
            .select("id_cliente_pdv")
            .eq("id_objetivo", objetivo_id)
            .execute()
        )
        for row in res.data or []:
                cid = row.get("id_cliente_pdv")
                if cid is not None:
                    try:
                        ids.append(int(cid))
                    except (TypeError, ValueError):
                        pass
    except Exception as e:
        logger.warning(f"_fetch_objetivo_items obj={objetivo_id}: {e}")
    return ids


def _fetch_pdv_map(
    sb, dist_id: int, pdv_ids: list[int]
) -> dict[int, dict]:
    """Mapa id_cliente → datos PDV + ruta (paridad bot /objetivos)."""
    from core.helpers import tenant_table_name

    if not pdv_ids:
        return {}

    pdv_table = tenant_table_name("clientes_pdv_v2", dist_id)
    rutas_table = tenant_table_name("rutas_v2", dist_id)
    result: dict[int, dict] = {}

    for i in range(0, len(pdv_ids), 200):
        chunk = pdv_ids[i : i + 200]
        try:
            rows = (
                sb.table(pdv_table)
                .select(
                    "id_cliente,id_cliente_erp,id_ruta,nombre_fantasia,nombre_razon_social"
                )
                .eq("id_distribuidor", dist_id)
                .in_("id_cliente", chunk)
                .execute()
                .data or []
            )
        except Exception as e:
            logger.warning(f"_fetch_pdv_map dist={dist_id}: {e}")
            continue

        ruta_ids = {int(r["id_ruta"]) for r in rows if r.get("id_ruta") is not None}
        rutas_map: dict[int, str] = {}
        if ruta_ids:
            try:
                rutas_rows = (
                    sb.table(rutas_table)
                    .select("id_ruta,id_ruta_erp,dia_semana")
                    .in_("id_ruta", list(ruta_ids))
                    .execute()
                    .data or []
                )
                for rr in rutas_rows:
                    rid = int(rr["id_ruta"])
                    rid_erp = rr.get("id_ruta_erp")
                    dia = (rr.get("dia_semana") or "").capitalize()
                    if rid_erp and dia:
                        rutas_map[rid] = f"Ruta {rid_erp} — {dia}"
                    elif rid_erp:
                        rutas_map[rid] = f"Ruta {rid_erp}"
                    elif dia:
                        rutas_map[rid] = dia
            except Exception:
                pass

        for row in rows:
            cid = int(row["id_cliente"])
            nombre = (
                (row.get("nombre_fantasia") or "").strip()
                or (row.get("nombre_razon_social") or "").strip()
                or None
            )
            rid = row.get("id_ruta")
            ruta_label = rutas_map.get(int(rid)) if rid is not None else None
            result[cid] = {
                "id_cliente": cid,
                "id_cliente_erp": str(row.get("id_cliente_erp") or "").strip(),
                "nombre": nombre,
                "ruta_label": ruta_label,
            }
    return result


def _build_recomendaciones(
    o: dict,
    tipo_str: str,
    cumplido: bool,
    valor_objetivo: float,
    valor_actual: float,
    items_pdv: list[dict],
    prorrateo: dict | None,
    desglose: dict,
) -> list[str]:
    """Textos accionables generados en BE (sin lógica en Flutter)."""
    if cumplido:
        return ["Objetivo cumplido."]

    recs: list[str] = []
    gap = valor_objetivo - valor_actual
    if gap > 0:
        unidades = {
            "exhibicion": ("exhibición", "exhibiciones"),
            "compradores": ("comprador", "compradores"),
            "ruteo_alteo": ("alta", "altas"),
            "alteo": ("alta", "altas"),
        }
        sing, plur = unidades.get(tipo_str, ("unidad", "unidades"))
        unidad = sing if gap == 1 else plur
        recs.append(f"Necesitás {int(gap) if gap == int(gap) else gap} {unidad} más para cumplir el objetivo.")

    if prorrateo:
        avance_vs = prorrateo.get("avance_vs_meta", 0)
        if avance_vs < -0.5:
            recs.append(
                f"Vas atrasado respecto al ritmo esperado (Δ {abs(round(avance_vs, 1))} unidades)."
            )
        elif avance_vs > 0.5:
            recs.append(f"Vas adelantado respecto al ritmo esperado (+{round(avance_vs, 1)} unidades).")
        meta_futura = prorrateo.get("meta_diaria_futura", 0)
        if meta_futura > 0 and gap > 0:
            recs.append(
                f"Para cumplir a tiempo, apuntá a {meta_futura} por día hábil (lun–sáb)."
            )

    tasa_p = o.get("tasa_pendientes")
    if tasa_p is not None and desglose:
        pend_count = desglose.get("pendientes_count")
        if pend_count is not None:
            recs.append(
                f"Tasa pendientes P={tasa_p} · {pend_count} pendiente"
                f"{'s' if pend_count != 1 else ''}."
            )

    id_target = o.get("id_target_pdv")
    pdv_candidates = []
    if id_target is not None:
        try:
            pdv_candidates.append(int(id_target))
        except (TypeError, ValueError):
            pass

    verbo = {
        "exhibicion": "Exhibí en",
        "compradores": "Activá al comprador",
        "ruteo_alteo": "Dale de alta",
        "alteo": "Dale de alta",
        "conversion_estado": "Activá",
        "activacion": "Activá",
    }.get(tipo_str, "Visitá")

    shown = 0
    for item in items_pdv:
        if shown >= 3:
            break
        erp = item.get("id_cliente_erp") or ""
        nombre = item.get("nombre") or ""
        ruta = item.get("ruta_label") or ""
        if not erp and not nombre:
            continue
        label = f"{nombre} (NRO {erp})" if nombre else f"NRO {erp}"
        line = f"{verbo} {label}"
        if ruta:
            line += f" · {ruta}"
        recs.append(line)
        shown += 1

    if not shown and id_target is not None:
        for item in items_pdv:
            if item.get("id_cliente") == id_target or str(item.get("id_cliente_erp")) == str(id_target):
                erp = item.get("id_cliente_erp") or str(id_target)
                nombre = item.get("nombre") or ""
                label = f"{nombre} (NRO {erp})" if nombre else f"NRO {erp}"
                recs.append(f"El objetivo es en el PDV {label}.")
                break

    return recs


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

    oid = (objetivo_id or "").strip()
    if not oid:
        return None

    try:
        res = (
            sb.table("objetivos")
            .select(_OBJETIVO_DETALLE_COLS)
            .eq("id_distribuidor", dist_id)
            .eq("id", oid)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.error(f"get_objetivo_detalle dist={dist_id} obj={oid}: {e}")
        return None

    if not res.data:
        return None

    o = res.data[0]

    if o.get("id_vendedor") != id_vendedor_v2:
        raise HTTPException(status_code=403, detail="No autorizado")

    valor_objetivo = o.get("valor_objetivo") or 0
    valor_actual = o.get("valor_actual") or 0
    progreso_pct = round((valor_actual / valor_objetivo) * 100, 1) if valor_objetivo > 0 else 0.0

    cumplido = bool(o.get("cumplido", False))
    tipo_str = (o.get("tipo") or "").strip()

    desglose_raw = o.get("desglose_cache")
    desglose: dict = {}
    if isinstance(desglose_raw, dict):
        desglose = desglose_raw
    elif isinstance(desglose_raw, str):
        import json
        try:
            desglose = json.loads(desglose_raw)
        except Exception:
            desglose = {}

    # Items PDV — paridad cmd_objetivos (objetivo_items + id_target_pdv)
    pdv_ids: list[int] = []
    id_target_pdv = o.get("id_target_pdv")
    if id_target_pdv is not None:
        try:
            pdv_ids.append(int(id_target_pdv))
        except (TypeError, ValueError):
            pass
    for cid in _fetch_objetivo_items(sb, objetivo_id):
        if cid not in pdv_ids:
            pdv_ids.append(cid)

    pdv_map = _fetch_pdv_map(sb, dist_id, pdv_ids)
    items_pdv = list(pdv_map.values())

    from core.objetivos_prorrateo import build_prorrateo_grid

    prorrateo = build_prorrateo_grid(o)

    recomendaciones = _build_recomendaciones(
        o,
        tipo_str,
        cumplido,
        float(valor_objetivo),
        float(valor_actual),
        items_pdv,
        prorrateo,
        desglose,
    )

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
        "origen": (o.get("origen") or "").strip() or None,
        "mes_referencia": (o.get("mes_referencia") or "")[:7] or None,
        "nombre_vendedor": (o.get("nombre_vendedor") or "").strip() or None,
        "tasa_pendientes": o.get("tasa_pendientes"),
        "progreso_diario_updated_at": o.get("progreso_diario_updated_at"),
        "min_pdvs_distintos": o.get("min_pdvs_distintos"),
        "desglose": desglose_raw,
        "items_pdv": items_pdv,
        "prorrateo": prorrateo,
        "recomendaciones": recomendaciones,
    }
