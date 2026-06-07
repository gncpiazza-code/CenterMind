"""
Resuelve el label de snapshot para headers de PDF del bot.
Lee motor_runs y cc_detalle para obtener el timestamp de INGESTA (no de generación).
"""
from __future__ import annotations
from supabase import Client
import re


def resolve_snapshot_label(sb: Client, dist_id: int, source: str) -> str:
    """
    source: 'padron' | 'ventas' | 'cc'
    Retorna string como "Snapshot de datos: 07/06/2026 14:30" o "Sin datos de ingesta".
    """
    ts: str | None = None

    if source in ("padron", "ventas"):
        motor = "padron" if source == "padron" else "ventas_enriched"
        try:
            rows = (
                sb.table("motor_runs")
                .select("finalizado_en,iniciado_en")
                .eq("dist_id", dist_id)
                .eq("motor", motor)
                .eq("estado", "ok")
                .order("iniciado_en", desc=True)
                .limit(1)
                .execute().data or []
            )
            if rows:
                ts = rows[0].get("finalizado_en") or rows[0].get("iniciado_en")
        except Exception:
            pass
    elif source == "cc":
        try:
            rows = (
                sb.table("cc_detalle")
                .select("fecha_snapshot")
                .eq("id_distribuidor", dist_id)
                .not_.is_("fecha_snapshot", "null")
                .order("fecha_snapshot", desc=True)
                .limit(1)
                .execute().data or []
            )
            if rows:
                ts = rows[0]["fecha_snapshot"]
        except Exception:
            pass

    if not ts:
        return "Sin datos de ingesta"

    # Formatear: 2026-06-07T14:30:00+00:00 → "07/06/2026 14:30"
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})", ts)
    if m:
        y, mo, d, h, mi = m.groups()
        return f"Snapshot de datos: {d}/{mo}/{y} {h}:{mi}"
    return f"Snapshot de datos: {ts[:16]}"
