"""
Definición canónica de exhibición lógica única para Shelfy.

Una exhibición lógica = máximo un conteo por:
    (id_integrante, cliente_key, calendar_day_AR)

- cliente_key: id_cliente_pdv → id_cliente → cliente_sombra_codigo
- calendar_day_AR: primeros 10 chars de timestamp_subida (TZ AR)
- Si faltan cliente o día: fallback url → (chat, msg) → id_exhibicion
- Si hay varias filas con la misma clave: ganador por score
  (Destacado 3 > Aprobado 2 > Rechazado 1 > Pendiente 0)
"""
from __future__ import annotations


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
