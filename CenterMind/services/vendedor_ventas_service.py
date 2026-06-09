"""Ventas MTD vendor-scoped para la app móvil."""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

from supabase import Client

logger = logging.getLogger("ShelfyAPI")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def get_ventas_vendedor(
    sb: Client,
    dist_id: int,
    id_vendedor_v2: int,
    modo: str = "mtd",
) -> dict:
    """Ventas MTD del vendedor agrupadas por PDV, con bultos y top compradores."""
    from services.estadisticas_service import (
        _build_bultos_desglose,
        _fetch_ventas_rows_vendedor,
        _vendor_context,
    )
    from services.bot_ventas_pdf_service import _build_top_compradores_por_articulo
    from core.bot_snapshot_meta import resolve_snapshot_label

    hoy = datetime.now(AR_TZ)
    fecha_desde = f"{hoy.year}-{hoy.month:02d}-01"
    fecha_hasta = hoy.date().isoformat()
    periodo = f"{hoy.year}-{hoy.month:02d}"

    snapshot_label = resolve_snapshot_label(sb, dist_id, "ventas")

    try:
        vctx = _vendor_context(dist_id, str(id_vendedor_v2))
        rows = _fetch_ventas_rows_vendedor(dist_id, vctx, fecha_desde, fecha_hasta)
    except Exception as e:
        logger.warning(f"get_ventas_vendedor dist={dist_id} vendor={id_vendedor_v2}: {e}")
        return {
            "periodo": periodo,
            "snapshot_label": snapshot_label,
            "total_importe": 0.0,
            "total_facturas": 0,
            "por_pdv": [],
            "bultos_desglose": [],
            "top_compradores": [],
        }

    meses_set: set[str] = {periodo}

    pdv_agg: dict[str, dict] = defaultdict(lambda: {"importe": 0.0, "facturas": 0, "nombre": ""})
    total_importe = 0.0
    total_facturas = 0
    for r in rows:
        cid = str(r.get("id_cliente_erp") or r.get("cod_cliente") or "").strip()
        importe = float(r.get("importe_neto") or r.get("importe") or 0)
        pdv_agg[cid]["importe"] += importe
        pdv_agg[cid]["facturas"] += 1
        if not pdv_agg[cid]["nombre"]:
            pdv_agg[cid]["nombre"] = str(
                r.get("razon_social") or r.get("nombre_cliente") or cid
            ).strip()
        total_importe += importe
        total_facturas += 1

    por_pdv = [
        {
            "id_cliente_erp": cid,
            "nombre_display": v["nombre"],
            "importe": round(v["importe"], 2),
            "facturas": v["facturas"],
        }
        for cid, v in sorted(pdv_agg.items(), key=lambda x: -x[1]["importe"])
    ]

    bultos_desglose: list[dict] = []
    top_compradores: list[dict] = []
    try:
        raw_bultos, _ = _build_bultos_desglose(rows, meses_set)
        bultos_desglose = [
            {
                "articulo": r.get("articulo", ""),
                "cod_articulo": r.get("cod_articulo"),
                "bultos": r.get("bultos", 0),
            }
            for r in raw_bultos
        ]
        top_compradores = [
            {
                "rank": r.get("rank", 0),
                "id_cliente_erp": r.get("id_cliente_erp", ""),
                "nombre_cliente": r.get("nombre_cliente", ""),
                "total_bultos": r.get("total_bultos", 0),
            }
            for r in _build_top_compradores_por_articulo(rows, meses_set, limit=15)
        ]
    except Exception as e:
        logger.warning(f"get_ventas_vendedor bultos dist={dist_id}: {e}")

    return {
        "periodo": periodo,
        "snapshot_label": snapshot_label,
        "total_importe": round(total_importe, 2),
        "total_facturas": total_facturas,
        "por_pdv": por_pdv,
        "bultos_desglose": bultos_desglose,
        "top_compradores": top_compradores,
    }


def get_ventas_pdf_bytes(sb: Client, dist_id: int, id_vendedor_v2: int) -> bytes:
    try:
        from services.bot_ventas_pdf_service import build_ventas_pdf
        pdf_bytes, _ = build_ventas_pdf(sb, dist_id, id_vendedor_v2)
        return pdf_bytes
    except Exception as e:
        logger.warning(f"get_ventas_pdf_bytes dist={dist_id} vendor={id_vendedor_v2}: {e}")
        return b""
