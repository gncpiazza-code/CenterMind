"""Cuentas corrientes vendor-scoped para la app móvil."""
from __future__ import annotations

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from supabase import Client

logger = logging.getLogger("ShelfyAPI")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def _get_vendor_erp_id(sb: Client, dist_id: int, id_vendedor_v2: int) -> str | None:
    """Obtiene el id_vendedor ERP del vendedor."""
    from core.helpers import tenant_table_name
    t = tenant_table_name("vendedores_v2", dist_id)
    res = (
        sb.table(t)
        .select("id_vendedor_erp")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor", id_vendedor_v2)
        .limit(1)
        .execute()
    )
    if res.data:
        return str(res.data[0].get("id_vendedor_erp") or "").strip() or None
    return None


def get_cc_vendedor(
    sb: Client,
    dist_id: int,
    id_vendedor_v2: int,
    modo: str = "general",
) -> dict:
    """
    CC del vendedor filtrado a sus clientes.
    modo='hoy': solo clientes de la ruta de hoy. modo='general': todo.
    """
    erp_id = _get_vendor_erp_id(sb, dist_id, id_vendedor_v2)

    PAGE = 1000
    offset = 0
    rows: list[dict] = []
    while True:
        q = (
            sb.table("cc_detalle")
            .select(
                "id_vendedor,vendedor_nombre,cliente_nombre,id_cliente_erp,"
                "id_cliente,deuda_total,antiguedad_dias,cantidad_comprobantes,"
                "deuda_7_dias,deuda_15_dias,deuda_30_dias,deuda_60_dias,deuda_mas_60_dias"
            )
            .eq("id_distribuidor", dist_id)
            .gt("deuda_total", 0)
        )
        if erp_id:
            q = q.eq("id_vendedor", erp_id)
        batch = q.range(offset, offset + PAGE - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE

    if modo == "hoy" and rows:
        rows = _filter_cc_hoy(sb, dist_id, id_vendedor_v2, rows)

    total_saldo = sum(float(r.get("deuda_total") or 0) for r in rows)
    clientes = [
        {
            "id_cliente_erp": str(r.get("id_cliente_erp") or ""),
            "nombre": str(r.get("cliente_nombre") or "").strip(),
            "saldo": round(float(r.get("deuda_total") or 0), 2),
            "dias_vencido": int(r.get("antiguedad_dias") or 0),
            "cantidad_comprobantes": int(r.get("cantidad_comprobantes") or 0),
        }
        for r in sorted(rows, key=lambda x: float(x.get("deuda_total") or 0), reverse=True)
    ]

    return {
        "modo": modo,
        "total_saldo": round(total_saldo, 2),
        "total_clientes": len(clientes),
        "clientes": clientes,
    }


def _filter_cc_hoy(sb: Client, dist_id: int, id_vendedor_v2: int, rows: list[dict]) -> list[dict]:
    """Filtra CC a solo los clientes de la ruta del día AR."""
    from core.helpers import tenant_table_name
    from datetime import datetime
    from zoneinfo import ZoneInfo

    DIA_MAP = {0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado"}
    hoy_nombre = DIA_MAP.get(datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).weekday(), "")

    rutas_table = tenant_table_name("rutas_v2", dist_id)
    rutas = (
        sb.table(rutas_table)
        .select("id_ruta")
        .eq("id_vendedor", id_vendedor_v2)
        .eq("dia_semana", hoy_nombre)
        .execute().data or []
    )
    ruta_ids = [r["id_ruta"] for r in rutas]
    if not ruta_ids:
        return []

    pdv_table = tenant_table_name("clientes_pdv_v2", dist_id)
    erps_hoy: set[str] = set()
    PAGE = 1000
    offset = 0
    while True:
        batch = (
            sb.table(pdv_table)
            .select("id_cliente_erp")
            .eq("id_distribuidor", dist_id)
            .in_("id_ruta", ruta_ids)
            .range(offset, offset + PAGE - 1)
            .execute().data or []
        )
        for r in batch:
            v = str(r.get("id_cliente_erp") or "").strip()
            if v:
                erps_hoy.add(v)
        if len(batch) < PAGE:
            break
        offset += PAGE

    return [r for r in rows if str(r.get("id_cliente_erp") or "").strip() in erps_hoy]


def get_cc_pdf_bytes(sb: Client, dist_id: int, id_vendedor_v2: int) -> bytes:
    try:
        from services.cc_difusion_service import export_cc_pdf_supervision
        content, _, _ = export_cc_pdf_supervision(
            dist_id,
            id_vendedor=id_vendedor_v2,
            modo="general",
        )
        return content
    except Exception as e:
        logger.warning(f"get_cc_pdf_bytes dist={dist_id} vendor={id_vendedor_v2}: {e}")
        return b""
