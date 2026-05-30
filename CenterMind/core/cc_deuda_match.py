# -*- coding: utf-8 -*-
"""
Heurística de matcheo deuda CC ↔ comprobantes de ventas.

Entrada por cliente:
  - cc_row   : fila de cc_detalle (deuda_total, cantidad_comprobantes, antiguedad_dias, buckets)
  - ventas   : lista de filas de ventas_enriched_v2 del mismo (id_distribuidor, id_cliente_erp)

Retorna un dict con:
  estado      : "matched" | "partial" | "sin_comprobantes"
  comprobantes: list de comprobantes candidatos (vacios si sin_comprobantes)
  total_deuda : autoritativo = cc_row["deuda_total"]
  confianza   : "alta" | "baja" | None
"""

from datetime import date, timedelta
from typing import Any

from db import sb
from core.tenant_tables import tenant_table_name

PAGE = 1000

# Tolerancia de monto para considerar match "alto".
_TOLERANCE_PCT = 0.15
# Margen extra sobre antiguedad_dias para la ventana de búsqueda.
# CHESS puede reportar antiguedad_dias=0 para facturas de hasta 30 días;
# usamos 35 días para no perder comprobantes recientes.
_VENTANA_MARGEN_DIAS = 35

# Antigüedad representativa por bucket cuando CHESS reporta 0d pero hay saldo en el rango.
_BUCKET_ANTIGUEDAD_DIAS = (
    ("deuda_mas_60_dias", 61),
    ("deuda_60_dias", 45),
    ("deuda_30_dias", 22),
    ("deuda_15_dias", 12),
    ("deuda_7_dias", 4),
)


def _infer_antiguedad_efectiva(cc_row: dict[str, Any]) -> int:
    """Antigüedad para ventana/ancla de matcheo (buckets CC si CHESS marca 0d)."""
    antig = int(cc_row.get("antiguedad_dias") or 0)
    if antig > 0:
        return antig
    deuda_total = float(cc_row.get("deuda_total") or 0)
    if deuda_total <= 0:
        return 0
    for field, dias in _BUCKET_ANTIGUEDAD_DIAS:
        if float(cc_row.get(field) or 0) > 0:
            return dias
    return antig


def _antiguedad_para_match(cc_row: dict[str, Any]) -> int:
    """Prioriza antigüedad explícita de supervisión (padrón) si viene en cc_row."""
    explicit = cc_row.get("antiguedad_dias_match")
    if explicit is not None:
        try:
            return max(0, int(explicit))
        except (TypeError, ValueError):
            pass
    return _infer_antiguedad_efectiva(cc_row)


def _ventas_es_recaudacion(tipo: str | None) -> bool:
    if not tipo:
        return False
    t = tipo.upper()
    return any(k in t for k in ("RECIBO", "RECAUDACION", "COBRO", "PAGO"))


def _ventas_es_devolucion(tipo: str | None, importe: float) -> bool:
    if importe < 0:
        return True
    if tipo:
        t = tipo.upper()
        return any(k in t for k in ("DEVOLUCION", "DEVOLUCIÓN", "NOTA DE CREDITO", "NOTA DE CRÉDITO"))
    return False


def match_deuda_comprobantes(
    cc_row: dict[str, Any],
    ventas_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Relaciona la deuda de un cliente con comprobantes de ventas.

    Invariante: el total_deuda retornado SIEMPRE es cc_row["deuda_total"].
    Los comprobantes son candidatos (best-effort).
    """
    deuda_total: float = float(cc_row.get("deuda_total") or 0)
    n_cbtes: int = int(cc_row.get("cantidad_comprobantes") or 0)
    antiguedad_dias: int = _antiguedad_para_match(cc_row)

    # Sin datos suficientes → sin_comprobantes
    if n_cbtes == 0 or not ventas_rows:
        return _sin_comprobantes(deuda_total)

    hoy = date.today()
    ventana_inicio = hoy - timedelta(days=antiguedad_dias + _VENTANA_MARGEN_DIAS)

    # Agrupar ventas por numero_documento, excluyendo recibos/devoluciones/anulados.
    by_doc: dict[str, dict[str, Any]] = {}
    for row in ventas_rows:
        if row.get("anulado"):
            continue
        tipo = row.get("tipo_documento")
        importe = float(row.get("importe_final") or 0)
        if _ventas_es_recaudacion(tipo) or _ventas_es_devolucion(tipo, importe):
            continue

        num = (row.get("numero_documento") or "").strip()
        if not num:
            continue

        fecha_str = (row.get("fecha_factura") or "")[:10]
        try:
            fecha_doc = date.fromisoformat(fecha_str)
        except ValueError:
            fecha_doc = None

        if num not in by_doc:
            by_doc[num] = {
                "numero": num,
                "fecha": fecha_str,
                "tipo_documento": (tipo or "").strip() or None,
                "_fecha_obj": fecha_doc,
                "importe_total": 0.0,
                "articulos": [],
            }
        elif tipo and not by_doc[num].get("tipo_documento"):
            by_doc[num]["tipo_documento"] = (tipo or "").strip()

        by_doc[num]["importe_total"] += importe

        cod = (row.get("cod_articulo") or "").strip()
        desc = (row.get("descripcion_articulo") or "").strip()
        if cod or desc:
            by_doc[num]["articulos"].append({
                "cod_articulo": cod,
                "descripcion": desc,
                "bultos_total": float(row.get("bultos_total") or 0),
                "importe_final": importe,
            })

    if not by_doc:
        return _sin_comprobantes(deuda_total)

    # Filtrar por ventana temporal
    candidatos = [
        d for d in by_doc.values()
        if d["_fecha_obj"] is None or d["_fecha_obj"] >= ventana_inicio
    ]

    if not candidatos:
        # Sin ventas en ventana → sin_comprobantes
        return _sin_comprobantes(deuda_total)

    ancla = hoy - timedelta(days=antiguedad_dias)

    def _sort_key(d: dict[str, Any]) -> tuple[float, int]:
        amt = abs(d["importe_total"] - deuda_total) if deuda_total > 0 else d["importe_total"]
        if d["_fecha_obj"] is not None:
            date_dist = abs((d["_fecha_obj"] - ancla).days)
        else:
            date_dist = 999_999
        return (amt, date_dist)

    candidatos.sort(key=_sort_key)

    # Elegir hasta N comprobantes cuya suma mejor aproxime la deuda (greedy por monto).
    seleccionados: list[dict[str, Any]] = []
    restantes = list(candidatos)
    while len(seleccionados) < n_cbtes and restantes:
        if n_cbtes == 1:
            seleccionados.append(restantes.pop(0))
            break
        best_idx = 0
        best_gap = float("inf")
        acum = sum(d["importe_total"] for d in seleccionados)
        for i, cand in enumerate(restantes):
            gap = abs((acum + cand["importe_total"]) - deuda_total)
            if gap < best_gap:
                best_gap = gap
                best_idx = i
        seleccionados.append(restantes.pop(best_idx))

    suma = sum(d["importe_total"] for d in seleccionados)

    for d in seleccionados:
        d.pop("_fecha_obj", None)

    if deuda_total <= 0 or abs(suma - deuda_total) / deuda_total > _TOLERANCE_PCT:
        return _sin_comprobantes(deuda_total)

    for d in seleccionados:
        d["match_status"] = "matched"
        d["label"] = _comprobante_label(d.get("tipo_documento"), d.get("numero"))

    return {
        "estado": "matched",
        "confianza": "alta",
        "comprobantes": seleccionados,
        "total_deuda": deuda_total,
        "resumen": _resumen_comprobantes(seleccionados),
    }


def _comprobante_label(tipo: str | None, numero: str | None) -> str:
    parts = [(tipo or "").strip(), (numero or "").strip()]
    return " ".join(p for p in parts if p)


def _resumen_comprobantes(comprobantes: list[dict[str, Any]], max_items: int = 3) -> str | None:
    labels = [c.get("label") or _comprobante_label(c.get("tipo_documento"), c.get("numero")) for c in comprobantes]
    labels = [x for x in labels if x]
    if not labels:
        return None
    if len(labels) <= max_items:
        return ", ".join(labels)
    return ", ".join(labels[:max_items]) + f" (+{len(labels) - max_items})"


def fetch_ventas_enriched_para_match(
    dist_id: int,
    id_cliente_erp: str,
    ventana_inicio: str,
) -> list[dict[str, Any]]:
    """Filas ventas_enriched_v2 para matchear deuda CC (no altera montos CHESS)."""
    t_ventas = tenant_table_name("ventas_enriched_v2", dist_id)
    erp_raw = str(id_cliente_erp).strip()
    rows: list[dict] = []
    offset = 0
    while True:
        batch = (
            sb.table(t_ventas)
            .select(
                "fecha_factura, tipo_documento, numero_documento, serie, "
                "cod_articulo, descripcion_articulo, bultos_total, importe_final, anulado"
            )
            .eq("id_distribuidor", dist_id)
            .eq("id_cliente_erp", erp_raw)
            .gte("fecha_factura", ventana_inicio)
            .order("fecha_factura", desc=True)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data or []
        )
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def match_comprobantes_adeudo_cc(
    cc_row: dict[str, Any],
    dist_id: int,
    id_cliente_erp: str,
    *,
    hoy: date | None = None,
) -> dict[str, Any]:
    """
    Deuda autoritativa = cc_row (CHESS). Comprobantes candidatos = ventas_enriched_v2.
    """
    hoy = hoy or date.today()
    antig_cc = int(cc_row.get("antiguedad_dias") or 0)
    antig_match = max(antig_cc, int(cc_row.get("antiguedad_dias_match") or antig_cc))
    ventana_inicio = (hoy - timedelta(days=antig_match + _VENTANA_MARGEN_DIAS)).isoformat()
    ventas_rows = fetch_ventas_enriched_para_match(dist_id, id_cliente_erp, ventana_inicio)
    match_row = {**cc_row, "antiguedad_dias_match": antig_match}
    out = match_deuda_comprobantes(match_row, ventas_rows)
    if "resumen" not in out:
        out["resumen"] = _resumen_comprobantes(out.get("comprobantes") or [])
    return out


def _sin_comprobantes(deuda_total: float) -> dict[str, Any]:
    return {
        "estado": "sin_comprobantes",
        "confianza": None,
        "comprobantes": [],
        "total_deuda": deuda_total,
        "resumen": None,
    }
