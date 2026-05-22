"""
Definición canónica de exhibición lógica única para Shelfy.

REGLA DE ORO (ranking, KPIs, stats bot, objetivos compañía exhibición):
    máximo 1 conteo por (vendedor_erp, cliente_key, calendar_day_AR)

Usar aggregate_ranking_by_vendor / aggregate_exhibicion_counts_vendor_scope.
NO contar filas crudas ni fotos. NO usar fn_dashboard_ranking.

Por integrante (casos no-ranking):
    (id_integrante, cliente_key, calendar_day_AR) via build_logic_key.

- cliente_key: id_cliente_pdv → id_cliente → cliente_sombra_codigo
- calendar_day_AR: primeros 10 chars de timestamp_subida (TZ AR)
- Si faltan cliente o día: fallback url → (chat, msg) → id_exhibicion
- Si hay varias filas con la misma clave: ganador por score
  (Destacado 3 > Aprobado 2 > Rechazado 1 > Pendiente 0)

Documentación: CLAUDE.md §5/§9, arquitectura.md § Invariantes.
"""
from __future__ import annotations

from collections import defaultdict

EXHIBICION_ROW_COLS = (
    "id_exhibicion,id_integrante,estado,timestamp_subida,"
    "id_cliente_pdv,id_cliente,cliente_sombra_codigo,"
    "url_foto_drive,telegram_msg_id,telegram_chat_id"
)


def exhibicion_score(estado: str) -> int:
    """Score de una exhibición según su estado."""
    e = (estado or "").strip().lower()
    if "destacad" in e:
        return 3
    if "aprobad" in e:
        return 2
    if "rechaz" in e:
        return 1
    return 0


def resolve_client_key(row: dict) -> str:
    """Clave canónica de cliente para la llave lógica."""
    raw = (
        row.get("id_cliente_pdv")
        or row.get("id_cliente")
        or row.get("cliente_sombra_codigo")
    )
    return str(raw).strip() if raw is not None else ""


def resolve_day_key(row: dict) -> str:
    """Día del evento (primeros 10 chars de timestamp_subida)."""
    ts = (row.get("timestamp_subida") or "").strip()
    return ts[:10] if len(ts) >= 10 else ""


def build_logic_key(iid: int | None, client_key: str, day_key: str, row: dict) -> str:
    """
    Construye la clave de dedup lógico.
    Usa fallback URL → msg/chat → id_exhibicion si no hay cliente o día.
    """
    if iid is not None and client_key and day_key:
        return f"{iid}_{client_key}_{day_key}"
    url = (row.get("url_foto_drive") or "").strip()
    if url:
        return f"url_{url}"
    msg = row.get("telegram_msg_id")
    chat = row.get("telegram_chat_id")
    if msg is not None and chat is not None:
        return f"msg_{chat}_{msg}"
    return f"id_{row.get('id_exhibicion')}"


def aggregate_exhibicion_counts(rows: list[dict]) -> dict[str, int]:
    """
    Conteos por estado tras dedup lógico (integrante + cliente + día).
    Si hay varias filas para la misma clave, gana la de mayor exhibicion_score.
    """
    best: dict[str, dict] = {}
    for row in rows:
        iid_raw = row.get("id_integrante")
        iid = int(iid_raw) if iid_raw is not None else None
        client_key = resolve_client_key(row)
        day_key = resolve_day_key(row)
        key = build_logic_key(iid, client_key, day_key, row)
        estado = (row.get("estado") or "")
        score = exhibicion_score(estado)
        if key not in best or score > best[key]["score"]:
            best[key] = {"estado": estado, "score": score}

    counts = {
        "aprobadas": 0,
        "destacadas": 0,
        "rechazadas": 0,
        "pendientes": 0,
        "puntos": 0,
        "total_logicas": 0,
    }
    for v in best.values():
        counts["total_logicas"] += 1
        est = (v["estado"] or "").lower()
        if "aprobad" in est:
            counts["aprobadas"] += 1
            counts["puntos"] += 1
        elif "destacad" in est:
            counts["destacadas"] += 1
            counts["puntos"] += 2
        elif "rechaz" in est:
            counts["rechazadas"] += 1
        else:
            counts["pendientes"] += 1
    return counts


def vendor_logic_key(row: dict) -> str:
    """Clave lógica por vendedor (todos los integrantes): cliente + día."""
    client_key = resolve_client_key(row)
    day_key = resolve_day_key(row)
    if client_key and day_key:
        return f"v_{client_key}_{day_key}"
    return build_logic_key(None, client_key, day_key, row)


def aggregate_exhibicion_counts_vendor_scope(rows: list[dict]) -> dict[str, int]:
    """
    Conteos para objetivos compañía / exhibición global del vendedor.
    Dedup por (cliente_key, día) sin separar por integrante — misma visita lógica
    aunque haya varias fotos o varios grupos Telegram.
    """
    best: dict[str, dict] = {}
    for row in rows:
        key = vendor_logic_key(row)
        estado = (row.get("estado") or "")
        score = exhibicion_score(estado)
        if key not in best or score > best[key]["score"]:
            best[key] = {"estado": estado, "score": score}

    counts = {
        "aprobadas": 0,
        "destacadas": 0,
        "rechazadas": 0,
        "pendientes": 0,
        "puntos": 0,
        "total_logicas": 0,
    }
    for v in best.values():
        counts["total_logicas"] += 1
        est = (v["estado"] or "").lower()
        if "aprobad" in est:
            counts["aprobadas"] += 1
            counts["puntos"] += 1
        elif "destacad" in est:
            counts["destacadas"] += 1
            counts["puntos"] += 2
        elif "rechaz" in est:
            counts["rechazadas"] += 1
        else:
            counts["pendientes"] += 1
    return counts


def integrante_ids_for_erp_vendors(
    seed_iids: list[int],
    iid_to_erp: dict[int, str],
) -> list[int]:
    """
    Todos los id_integrante que comparten nombre ERP con los integrantes semilla.
    Un vendedor puede tener varios grupos Telegram (varios id_integrante) con el mismo ERP.
    """
    names: set[str] = set()
    for raw in seed_iids:
        try:
            iid = int(raw)
        except (TypeError, ValueError):
            continue
        name = (iid_to_erp.get(iid) or "").strip()
        if name and name != "Desconocido":
            names.add(name)
    if not names:
        out: list[int] = []
        seen: set[int] = set()
        for raw in seed_iids:
            try:
                iid = int(raw)
            except (TypeError, ValueError):
                continue
            if iid not in seen:
                seen.add(iid)
                out.append(iid)
        return out
    result: list[int] = []
    seen: set[int] = set()
    for iid, name in iid_to_erp.items():
        if name in names and iid not in seen:
            seen.add(iid)
            result.append(iid)
    return result


def _ranking_logic_key(row: dict, vendor: str) -> str:
    """Clave de dedup a nivel vendedor ERP (cliente + día), con prefijo si no hay cliente/día."""
    client_key = resolve_client_key(row)
    day_key = resolve_day_key(row)
    base = vendor_logic_key(row)
    if client_key and day_key:
        return base
    return f"{vendor}_{base}"


def aggregate_ranking_by_vendor(
    rows: list[dict],
    iid_to_erp: dict[int, str],
) -> dict[str, dict[str, int]]:
    """
    Ranking por nombre ERP: dedup lógico por vendedor (cliente + día, sin separar integrante)
    + puntos (aprobada +1, destacada +2). Mismo criterio que objetivos y stats Telegram.
    """
    best: dict[str, dict] = {}
    for row in rows:
        iid_raw = row.get("id_integrante")
        if iid_raw is None:
            continue
        try:
            iid = int(iid_raw)
        except (TypeError, ValueError):
            continue
        vendor = iid_to_erp.get(iid, "Desconocido")
        key = _ranking_logic_key(row, vendor)
        estado = (row.get("estado") or "")
        score = exhibicion_score(estado)
        if key not in best or score > best[key]["score"]:
            best[key] = {
                "estado": estado,
                "score": score,
                "vendedor": vendor,
            }

    stats: dict[str, dict[str, int]] = defaultdict(
        lambda: {"aprobadas": 0, "destacadas": 0, "rechazadas": 0, "puntos": 0}
    )
    for v in best.values():
        vn = v["vendedor"]
        est = (v["estado"] or "").lower()
        if "aprobad" in est:
            stats[vn]["aprobadas"] += 1
            stats[vn]["puntos"] += 1
        elif "destacad" in est:
            stats[vn]["destacadas"] += 1
            stats[vn]["puntos"] += 2
        elif "rechaz" in est:
            stats[vn]["rechazadas"] += 1
    return dict(stats)


def apply_compania_estado_overlay(
    rows: list[dict],
    latest_by_ex_id: dict[int, str],
) -> list[dict]:
    """
    Devuelve una copia de las filas con `estado` reemplazado por la última
    re-evaluación de compañía cuando existe. No muta las filas originales.
    latest_by_ex_id: {id_exhibicion -> estado_nuevo} (sólo la fila más reciente).
    """
    result = []
    for row in rows:
        ex_id = row.get("id_exhibicion")
        if ex_id is not None and int(ex_id) in latest_by_ex_id:
            row = {**row, "estado": latest_by_ex_id[int(ex_id)]}
        result.append(row)
    return result


def aggregate_ranking_by_vendor_compania(
    rows: list[dict],
    iid_to_erp: dict[int, str],
    latest_by_ex_id: dict[int, str],
) -> dict[str, dict[str, int]]:
    """
    Ranking paralelo compañía: aplica overlay de re-evaluaciones y luego
    reutiliza aggregate_ranking_by_vendor con dedup estándar.
    """
    overlaid = apply_compania_estado_overlay(rows, latest_by_ex_id)
    return aggregate_ranking_by_vendor(overlaid, iid_to_erp)


def aggregate_kpi_totals(rows: list[dict]) -> dict[str, int]:
    """KPIs globales del periodo con dedup lógico (misma clave que ranking)."""
    counts = aggregate_exhibicion_counts(rows)
    return {
        "total": counts["total_logicas"],
        "pendientes": counts["pendientes"],
        "aprobadas": counts["aprobadas"],
        "rechazadas": counts["rechazadas"],
        "destacadas": counts["destacadas"],
    }


def count_logical_per_client(
    rows: list[dict],
    *,
    seen: set[str] | None = None,
) -> dict:
    """
    Dado un iterable de filas de exhibiciones (con id_cliente_pdv,
    id_integrante, timestamp_subida), devuelve un dict:
        {id_cliente_pdv: count_logical}

    Si se pasa `seen`, se reutiliza para acumular claves (útil cuando
    se procesan múltiples queries por el mismo distribuidor).
    """
    if seen is None:
        seen = set()
    counts: dict = {}
    for row in rows:
        cid = row.get("id_cliente_pdv")
        if cid is None:
            continue
        iid_raw = row.get("id_integrante")
        iid = int(iid_raw) if iid_raw is not None else None
        client_key = resolve_client_key(row)
        day_key = resolve_day_key(row)
        key = build_logic_key(iid, client_key, day_key, row)
        if key in seen:
            continue
        seen.add(key)
        counts[cid] = counts.get(cid, 0) + 1
    return counts
