"""Bundle offline para la app móvil (snapshot para cache local)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from supabase import Client

from core.helpers import tenant_table_name
from core.exhibicion_aggregate import EXHIBICION_ROW_COLS

logger = logging.getLogger("ShelfyAPI")
AR_TZ = timezone(timedelta(hours=-3))


def get_offline_bundle(
    sb: Client,
    dist_id: int,
    id_vendedor_v2: int,
    *,
    integrante_ids: list[int] | None = None,
    ranking_nombre: str | None = None,
    pdv_erp_filter: set[str] | None = None,
) -> dict:
    """
    Bundle completo para cache offline: cartera_hoy + objetivos + stats + exhibiciones recientes.
    Pensado para sincronizar al arrancar la app y trabajar sin red.
    """
    from services.vendedor_cartera_service import build_cartera_json
    from services.vendedor_objetivos_service import list_objetivos_vendedor
    from services.vendedor_stats_service import get_stats_vendedor_app

    generated_at = datetime.now(AR_TZ).isoformat()

    # Cartera del día (ruta hoy)
    try:
        cartera_hoy = build_cartera_json(
            sb, dist_id, id_vendedor_v2, mode="hoy", pdv_erp_filter=pdv_erp_filter
        )
    except Exception as e:
        logger.warning(f"bundle cartera dist={dist_id} vendor={id_vendedor_v2}: {e}")
        cartera_hoy = {"mode": "hoy", "snapshot_label": None, "rutas": []}

    # Objetivos activos
    try:
        objetivos = list_objetivos_vendedor(sb, dist_id, id_vendedor_v2)
    except Exception as e:
        logger.warning(f"bundle objetivos dist={dist_id} vendor={id_vendedor_v2}: {e}")
        objetivos = []

    # Stats mes actual
    try:
        stats = get_stats_vendedor_app(
            sb,
            dist_id,
            id_vendedor_v2,
            integrante_ids=integrante_ids,
            ranking_nombre=ranking_nombre,
        )
    except Exception as e:
        logger.warning(f"bundle stats dist={dist_id} vendor={id_vendedor_v2}: {e}")
        stats = {}

    # Últimas 20 exhibiciones del vendedor
    exhibiciones_recientes: list[dict] = []
    try:
        if integrante_ids is None:
            integrantes_res = (
                sb.table("integrantes_grupo")
                .select("id_integrante")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor_v2", id_vendedor_v2)
                .execute()
            )
            scope_ids = [r["id_integrante"] for r in (integrantes_res.data or [])]
        else:
            scope_ids = integrante_ids
        if scope_ids:
            exh_table = tenant_table_name("exhibiciones", dist_id)
            rows = (
                sb.table(exh_table)
                .select(EXHIBICION_ROW_COLS + ",timestamp_subida")
                .eq("id_distribuidor", dist_id)
                .in_("id_integrante", scope_ids)
                .order("timestamp_subida", desc=True)
                .limit(20)
                .execute().data or []
            )
            exhibiciones_recientes = [
                {
                    "id_exhibicion": r.get("id_exhibicion"),
                    "id_cliente_pdv": r.get("id_cliente_pdv"),
                    "estado": r.get("estado"),
                    "timestamp_subida": r.get("timestamp_subida"),
                    "url_foto": r.get("url_foto_drive"),
                }
                for r in rows
            ]
    except Exception as e:
        logger.warning(f"bundle exhibiciones dist={dist_id} vendor={id_vendedor_v2}: {e}")

    return {
        "generated_at": generated_at,
        "cartera_hoy": cartera_hoy,
        "objetivos": objetivos,
        "stats": stats,
        "exhibiciones_recientes": exhibiciones_recientes,
    }
