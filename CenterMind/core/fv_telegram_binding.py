"""Helpers de vinculación Telegram ↔ vendedor ERP (Fuerza de Ventas)."""
from __future__ import annotations

from db import sb


def _safe_int_local(v) -> int | None:
    try:
        if v is None or v == "":
            return None
        return int(v)
    except (TypeError, ValueError):
        return None


def propagate_telegram_users_to_vendedor(
    dist_id: int,
    id_vendedor_v2: int,
    vendedor_erp: str | None,
    telegram_user_ids: list[int],
    telegram_group_id: int | None = None,
) -> None:
    """
    Asigna id_vendedor_v2 a todos los telegram_user_id indicados y
    desasigna otros integrantes que tenían el mismo vendedor fuera de esa lista.
    """
    uids: list[int] = []
    seen: set[int] = set()
    for raw in telegram_user_ids:
        uid = _safe_int_local(raw)
        if uid is None or uid in seen:
            continue
        seen.add(uid)
        uids.append(uid)
    if not uids:
        return

    for uid in uids:
        upd: dict = {"id_vendedor_v2": id_vendedor_v2}
        if vendedor_erp:
            upd["id_vendedor_erp"] = vendedor_erp
        # Propagar vendedor a todas las filas del UID (puede estar en varios grupos).
        # No tocar telegram_group_id: cada fila conserva su chat de origen.
        (
            sb.table("integrantes_grupo")
            .update(upd)
            .eq("id_distribuidor", dist_id)
            .eq("telegram_user_id", uid)
            .execute()
        )

    clear_q = (
        sb.table("integrantes_grupo")
        .update({"id_vendedor_v2": None})
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor_v2", id_vendedor_v2)
    )
    if len(uids) == 1:
        clear_q.neq("telegram_user_id", uids[0]).execute()
    else:
        clear_q.not_.in_("telegram_user_id", uids).execute()
