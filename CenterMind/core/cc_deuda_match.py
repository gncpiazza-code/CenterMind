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

# Tolerancia de monto para considerar match "alto".
_TOLERANCE_PCT = 0.15
# Margen extra sobre antiguedad_dias para la ventana de búsqueda.
# CHESS puede reportar antiguedad_dias=0 para facturas de hasta 30 días;
# usamos 35 días para no perder comprobantes recientes.
_VENTANA_MARGEN_DIAS = 35


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
    antiguedad_dias: int = int(cc_row.get("antiguedad_dias") or 0)

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
                "_fecha_obj": fecha_doc,
                "importe_total": 0.0,
                "articulos": [],
            }

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

    # Ordenar por cercanía a la antigüedad (los más probablemente impagos primero)
    ancla = hoy - timedelta(days=antiguedad_dias)
    candidatos.sort(
        key=lambda d: abs((d["_fecha_obj"] - ancla).days) if d["_fecha_obj"] else 999_999
    )

    # Tomar los N más probables
    seleccionados = candidatos[:n_cbtes]
    suma = sum(d["importe_total"] for d in seleccionados)

    # Limpiar campo interno antes de retornar
    for d in seleccionados:
        d.pop("_fecha_obj", None)

    confianza: str
    estado: str
    if deuda_total > 0 and abs(suma - deuda_total) / deuda_total <= _TOLERANCE_PCT:
        estado = "matched"
        confianza = "alta"
        for d in seleccionados:
            d["match_status"] = "matched"
    else:
        estado = "partial"
        confianza = "baja"
        for d in seleccionados:
            d["match_status"] = "estimado"

    return {
        "estado": estado,
        "confianza": confianza,
        "comprobantes": seleccionados,
        "total_deuda": deuda_total,
    }


def _sin_comprobantes(deuda_total: float) -> dict[str, Any]:
    return {
        "estado": "sin_comprobantes",
        "confianza": None,
        "comprobantes": [],
        "total_deuda": deuda_total,
    }
