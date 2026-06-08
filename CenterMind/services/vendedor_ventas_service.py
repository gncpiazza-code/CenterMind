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
    """Ventas MTD del vendedor agrupadas por PDV."""
    from services.estadisticas_service import _vendor_context, _fetch_ventas_rows_vendedor

    hoy = datetime.now(AR_TZ)
    fecha_desde = f"{hoy.year}-{hoy.month:02d}-01"
    fecha_hasta = hoy.date().isoformat()
    periodo = f"{hoy.year}-{hoy.month:02d}"

    try:
        vctx = _vendor_context(dist_id, str(id_vendedor_v2))
        rows = _fetch_ventas_rows_vendedor(dist_id, vctx, fecha_desde, fecha_hasta)
    except Exception as e:
        logger.warning(f"get_ventas_vendedor dist={dist_id} vendor={id_vendedor_v2}: {e}")
        return {"periodo": periodo, "total_importe": 0.0, "total_facturas": 0, "por_pdv": []}

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
            "nombre": v["nombre"],
            "importe": round(v["importe"], 2),
            "facturas": v["facturas"],
        }
        for cid, v in sorted(pdv_agg.items(), key=lambda x: -x[1]["importe"])
    ]

    return {
        "periodo": periodo,
        "total_importe": round(total_importe, 2),
        "total_facturas": total_facturas,
        "por_pdv": por_pdv,
    }


def get_ventas_pdf_bytes(sb: Client, dist_id: int, id_vendedor_v2: int) -> bytes:
    try:
        from services.bot_ventas_pdf_service import build_ventas_pdf
        pdf_bytes, _ = build_ventas_pdf(sb, dist_id, id_vendedor_v2)
        return pdf_bytes
    except Exception as e:
        logger.warning(f"get_ventas_pdf_bytes dist={dist_id} vendor={id_vendedor_v2}: {e}")
        return b""
