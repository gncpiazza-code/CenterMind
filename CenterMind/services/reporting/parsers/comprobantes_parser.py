# -*- coding: utf-8 -*-
from __future__ import annotations

import datetime as dt
from typing import Any

import numpy as np
import pandas as pd

from ._normalization import _norm, find_col, find_date_col, parse_fecha_robusta, to_numeric_safe

# Tipos que se excluyen del análisis
_EXCLUIR_TIPOS = {"devolucion", "devolución", "nota de credito", "nota de crédito", "nota credito"}

# Clasificación condición de pago
_COND_RECIBO   = {"recibo", "recibo imputado", "recibos", "recibo imp"}
_COND_CC       = {"cuenta corriente", "cuentacorriente", "cta cte", "cta. cte.", "cc",
                  "cta. corriente", "cuenta cte"}
_COND_CONTADO  = {"contado", "cont.", "efectivo", "transferencia", "tarjeta"}


def _classify_cond(val: str) -> str:
    v = _norm(str(val or ""))
    if any(k in v for k in _COND_RECIBO):
        return "recibo"
    if any(k in v for k in _COND_CC):
        return "cc"
    if any(k in v for k in _COND_CONTADO):
        return "contado"
    return "otro"


CANONICAL = {
    "desc_comprobante": ["descripcion comprobante", "tipo comprobante", "comprobante"],
    "numero":           ["numero", "nro", "número", "nro comprobante"],
    "anulado":          ["anulado", "estado", "anulado?"],
    "desc_sucursal":    ["descripcion sucursal", "sucursal"],
    "desc_vendedor":    ["descripcion vendedor", "descripción vendedor", "desc vendedor", "vendedor"],
    "razon_social":     ["razon social", "razón social", "nombre cliente", "descripcion cliente"],
    "cliente":          ["cliente", "codigo cliente", "cod cliente", "nro cliente"],
    "desc_cond_pago":   ["descripcion condicion de pago", "condicion de pago", "cond pago",
                         "descripcion condicion", "condicion"],
    "desc_canal_mkt":   ["descripcion canal mkt", "canal marketing", "canal mkt", "canal"],
    "desc_subcanal_mkt":["descripcion subcanal mkt", "subcanal marketing", "subcanal mkt", "subcanal"],
    "subtotal_final":   ["subtotal final", "subtotal", "importe", "total", "monto"],
}


def _map_columns(df: pd.DataFrame) -> dict[str, str | None]:
    from ._normalization import _norm, find_col
    cols = list(df.columns)
    mapping: dict[str, str | None] = {}
    for k, pats in CANONICAL.items():
        mapping[k] = find_col(df, pats)
    return mapping


def parse_comprobantes(df: pd.DataFrame, date_from: str, date_to: str) -> dict[str, Any]:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]

    mapping = _map_columns(df)
    df.rename(columns={v: k for k, v in mapping.items() if v is not None}, inplace=True)
    for k in CANONICAL:
        if k not in df.columns:
            df[k] = np.nan

    # Parse fecha
    fecha_col_orig = find_date_col(df)
    if fecha_col_orig and fecha_col_orig in df.columns:
        df["_fecha"] = parse_fecha_robusta(df[fecha_col_orig])
    elif "desc_comprobante" in df.columns:
        # fallback: no date column found
        df["_fecha"] = pd.NaT
    else:
        df["_fecha"] = pd.NaT

    # Parse importe
    df["_importe"] = to_numeric_safe(df["subtotal_final"].fillna("0"))

    # Filter anulados
    df["_anulado_norm"] = df["anulado"].apply(lambda x: _norm(str(x or "")))
    df = df[~df["_anulado_norm"].isin({"si", "sı", "s", "anulado", "true", "1"})].copy()

    # Filter tipos excluidos
    df["_tipo_norm"] = df["desc_comprobante"].apply(lambda x: _norm(str(x or "")))
    excluir_mask = df["_tipo_norm"].apply(lambda t: any(e in t for e in _EXCLUIR_TIPOS))
    df = df[~excluir_mask].copy()

    # Classify condición de pago
    df["_cond"] = df["desc_cond_pago"].apply(_classify_cond)

    # ── KPIs globales ──────────────────────────────────────────────────────────
    total_fact    = df["_importe"].sum()
    total_cc      = df[df["_cond"] == "cc"]["_importe"].sum()
    total_contado = df[df["_cond"] == "contado"]["_importe"].sum()
    total_recibos = df[df["_cond"] == "recibo"]["_importe"].sum()
    n_ops         = int((df["_importe"] > 0).sum())
    ticket_prom   = total_fact / n_ops if n_ops > 0 else 0.0

    kpis = [
        {"label": "Facturación",  "value": round(total_fact, 0),     "unit": ""},
        {"label": "Contado",      "value": round(total_contado, 0),  "unit": ""},
        {"label": "Cta. Cte.",    "value": round(total_cc, 0),       "unit": ""},
        {"label": "Recibos",      "value": round(total_recibos, 0),  "unit": ""},
        {"label": "Operaciones",  "value": n_ops},
        {"label": "Ticket Prom.", "value": round(ticket_prom, 0),    "unit": ""},
    ]

    # ── Serie temporal ─────────────────────────────────────────────────────────
    serie: list[dict] = []
    if df["_fecha"].notna().any():
        daily = (
            df[df["_fecha"].notna()]
            .groupby(df["_fecha"].dt.date)["_importe"]
            .sum()
            .reset_index()
        )
        daily.columns = ["fecha", "valor"]
        serie = [
            {"fecha": str(r["fecha"]), "valor": round(float(r["valor"]), 0)}
            for _, r in daily.iterrows()
        ]

    # ── Top clientes ───────────────────────────────────────────────────────────
    name_col = "razon_social" if "razon_social" in df.columns else "cliente"
    top_clientes: list[dict] = []
    if name_col in df.columns:
        by_cli = (
            df[df["_importe"] > 0]
            .groupby(name_col)
            .agg(importe=("_importe", "sum"), cantidad=("_importe", "count"))
            .reset_index()
            .sort_values("importe", ascending=False)
            .head(20)
        )
        vend_map = {}
        suc_map  = {}
        ult_map  = {}
        if "desc_vendedor" in df.columns:
            vend_map = df.groupby(name_col)["desc_vendedor"].first().to_dict()
        if "desc_sucursal" in df.columns:
            suc_map = df.groupby(name_col)["desc_sucursal"].first().to_dict()
        if df["_fecha"].notna().any():
            ult_map = df[df["_fecha"].notna()].groupby(name_col)["_fecha"].max().dt.strftime("%Y-%m-%d").to_dict()

        top_clientes = [
            {
                "nombre_cliente":  str(r[name_col]),
                "vendedor_nombre": str(vend_map.get(r[name_col], "")),
                "sucursal_nombre": str(suc_map.get(r[name_col], "")),
                "importe_total":   round(float(r["importe"]), 0),
                "cantidad_facturas": int(r["cantidad"]),
                "ultimo_comprobante": ult_map.get(r[name_col]),
            }
            for _, r in by_cli.iterrows()
        ]

    # ── Top vendedores ─────────────────────────────────────────────────────────
    top_vendedores: list[dict] = []
    if "desc_vendedor" in df.columns:
        by_vend = (
            df[df["_importe"] > 0]
            .groupby("desc_vendedor")["_importe"]
            .sum()
            .reset_index()
            .sort_values("_importe", ascending=False)
            .head(12)
        )
        top_vendedores = [
            {"nombre": str(r["desc_vendedor"]), "valor": round(float(r["_importe"]), 0)}
            for _, r in by_vend.iterrows()
        ]

    sucursal = ""
    if "desc_sucursal" in df.columns:
        vals = df["desc_sucursal"].dropna().astype(str)
        sucursal = vals.mode().iloc[0] if not vals.empty else ""

    return {
        "source": "comprobantes",
        "date_from": date_from,
        "date_to": date_to,
        "kpis": kpis,
        "serie_temporal": serie,
        "top_clientes": top_clientes,
        "top_vendedores": top_vendedores,
        "origen_datos": {
            "fuente": "Comprobantes CHESS",
            "menu_referencia": "CHESS → Comprobantes → Resumen por período",
            "filtros_aplicados": [
                f"Desde: {date_from}", f"Hasta: {date_to}",
                *([ f"Sucursal: {sucursal}"] if sucursal else []),
            ],
            "snapshot_at": dt.datetime.now().isoformat(),
        },
    }
