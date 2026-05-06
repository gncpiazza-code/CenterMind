# -*- coding: utf-8 -*-
from __future__ import annotations

import datetime as dt
from typing import Any

import numpy as np
import pandas as pd

from ._normalization import _norm, find_col, find_date_col, parse_fecha_robusta, to_numeric_safe

CANONICAL = {
    "numero":           ["numero", "número", "nro comprobante", "nro"],
    "desc_comprobante": ["descripcion comprobante", "descripción comprobante", "tipo comprobante"],
    "anulado":          ["anulado", "estado", "anulado?"],
    "desc_sucursal":    ["descripcion sucursal", "sucursal"],
    "desc_vendedor":    ["descripcion vendedor", "descripción vendedor", "desc vendedor", "vendedor"],
    "razon_social":     ["razon social", "razón social", "nombre cliente", "nombre"],
    "cliente":          ["cliente", "codigo cliente", "cod cliente", "nro cliente"],
    "desc_canal_mkt":   ["descripcion canal mkt", "canal mkt", "canal", "descripcion c subcanal"],
    "desc_subcanal_mkt":["descripcion subcanal mkt", "subcanal mkt", "subcanal"],
    "desc_cond_pago":   ["descripcion condicion de pago", "condicion de pago", "cond pago", "descripcion condicion"],
    "codigo_articulo":  ["codigo articulo", "cod art", "articulo", "codigo de articulo"],
    "desc_articulo":    ["descripcion articulo", "desc art", "descripción artículo", "descripcion de articulo"],
    "subtotal_final":   ["subtotal final", "subtotal", "importe", "total", "monto"],
}

_EXCLUIR_TIPOS = {"devolucion", "devolución", "nota de credito", "nota de crédito", "nota credito"}


def parse_comprobantes_detallado(df: pd.DataFrame, date_from: str, date_to: str) -> dict[str, Any]:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]

    mapping: dict[str, str | None] = {}
    for k, pats in CANONICAL.items():
        mapping[k] = find_col(df, pats)
    df.rename(columns={v: k for k, v in mapping.items() if v is not None}, inplace=True)
    for k in CANONICAL:
        if k not in df.columns:
            df[k] = np.nan

    # Parse fecha
    fecha_col_orig = find_date_col(df)
    if fecha_col_orig and fecha_col_orig in df.columns:
        df["_fecha"] = parse_fecha_robusta(df[fecha_col_orig])
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
    df = df[~excluir_mask & (df["_importe"] > 0)].copy()

    # Articulo final
    cod  = df["codigo_articulo"].astype(str).str.strip().replace({"": np.nan, "nan": np.nan, "None": np.nan})
    desc = df["desc_articulo"].astype(str).str.strip().replace({"": np.nan, "nan": np.nan, "None": np.nan})
    df["_articulo"] = np.where(
        cod.notna(),
        "[" + cod.fillna("") + "] " + desc.fillna(""),
        desc.fillna("SIN ARTICULO"),
    )

    name_col = "razon_social" if "razon_social" in df.columns else "cliente"

    # ── Semanas ────────────────────────────────────────────────────────────────
    if df["_fecha"].notna().any():
        fmin = df["_fecha"].dropna().min().date()
        fmax = df["_fecha"].dropna().max().date()
        semanas = max(1, ((fmax - fmin).days // 7) + 1)
    else:
        semanas = 1

    # ── KPIs globales ──────────────────────────────────────────────────────────
    total_fact = df["_importe"].sum()
    n_ops      = len(df)
    n_cli      = df[name_col].nunique() if name_col in df.columns else 0
    n_art      = df["_articulo"].nunique()
    ticket_prom = total_fact / n_ops if n_ops > 0 else 0.0

    kpis = [
        {"label": "Facturación",       "value": round(total_fact, 0), "unit": ""},
        {"label": "Artículos únicos",  "value": int(n_art)},
        {"label": "Clientes únicos",   "value": int(n_cli)},
        {"label": "Ticket promedio",   "value": round(ticket_prom, 0), "unit": ""},
        {"label": "Operaciones",       "value": int(n_ops)},
    ]

    # ── Serie temporal ─────────────────────────────────────────────────────────
    serie: list[dict] = []
    if df["_fecha"].notna().any():
        daily = df[df["_fecha"].notna()].groupby(df["_fecha"].dt.date)["_importe"].sum().reset_index()
        daily.columns = ["fecha", "valor"]
        serie = [
            {"fecha": str(r["fecha"]), "valor": round(float(r["valor"]), 0)}
            for _, r in daily.iterrows()
        ]

    # ── Por artículo ───────────────────────────────────────────────────────────
    _n_cli_col = name_col if name_col in df.columns else "_articulo"
    art_grp = df.groupby("_articulo").agg(
        importe=("_importe", "sum"),
        n_ops=("_importe", "count"),
        n_clientes=(_n_cli_col, "nunique"),
    ).reset_index().sort_values("importe", ascending=False)
    art_grp["prom_sem"] = (art_grp["importe"] / semanas).round(0)
    por_articulo = [
        {
            "articulo":   str(r["_articulo"]),
            "importe":    round(float(r["importe"]), 0),
            "n_ops":      int(r["n_ops"]),
            "n_clientes": int(r["n_clientes"]),
            "prom_sem":   round(float(r["prom_sem"]), 0),
        }
        for _, r in art_grp.iterrows()
    ]

    # ── Por canal × artículo ───────────────────────────────────────────────────
    por_canal_articulo: list[dict] = []
    if "desc_canal_mkt" in df.columns and df["desc_canal_mkt"].notna().any():
        ca_grp = df.groupby(["desc_canal_mkt", "_articulo"])["_importe"].sum().reset_index()
        por_canal_articulo = [
            {"canal": str(r["desc_canal_mkt"]), "articulo": str(r["_articulo"]), "importe": round(float(r["_importe"]), 0)}
            for _, r in ca_grp.sort_values("_importe", ascending=False).head(200).iterrows()
        ]

    # ── Por vendedor × artículo ───────────────────────────────────────────────
    por_vendedor_articulo: list[dict] = []
    if "desc_vendedor" in df.columns:
        va_grp = df.groupby(["desc_vendedor", "_articulo"]).agg(
            importe=("_importe", "sum"), n_ops=("_importe", "count")
        ).reset_index()
        por_vendedor_articulo = [
            {
                "vendedor": str(r["desc_vendedor"]),
                "articulo": str(r["_articulo"]),
                "importe":  round(float(r["importe"]), 0),
                "n_ops":    int(r["n_ops"]),
            }
            for _, r in va_grp.sort_values("importe", ascending=False).head(500).iterrows()
        ]

    # ── Clientes × artículo ───────────────────────────────────────────────────
    MAX_CLI_ART = 1000
    clientes_x_articulo: list[dict] = []
    if name_col in df.columns:
        cx_grp = df.groupby([name_col, "_articulo"]).agg(
            importe=("_importe", "sum"), n_ops=("_importe", "count")
        ).reset_index()
        clientes_x_articulo = [
            {
                "cliente":  str(r[name_col]),
                "articulo": str(r["_articulo"]),
                "importe":  round(float(r["importe"]), 0),
                "n_ops":    int(r["n_ops"]),
            }
            for _, r in cx_grp.sort_values("importe", ascending=False).head(MAX_CLI_ART).iterrows()
        ]

    # ── Top clientes (global) ──────────────────────────────────────────────────
    top_clientes: list[dict] = []
    if name_col in df.columns:
        by_cli = df.groupby(name_col).agg(
            importe=("_importe", "sum"), cantidad=("_importe", "count")
        ).reset_index().sort_values("importe", ascending=False).head(20)
        vend_map: dict = {}
        suc_map:  dict = {}
        ult_map:  dict = {}
        if "desc_vendedor" in df.columns:
            vend_map = df.groupby(name_col)["desc_vendedor"].first().to_dict()
        if "desc_sucursal" in df.columns:
            suc_map = df.groupby(name_col)["desc_sucursal"].first().to_dict()
        if df["_fecha"].notna().any():
            ult_map = df[df["_fecha"].notna()].groupby(name_col)["_fecha"].max().dt.strftime("%Y-%m-%d").to_dict()
        top_clientes = [
            {
                "nombre_cliente":     str(r[name_col]),
                "vendedor_nombre":    str(vend_map.get(r[name_col], "")),
                "sucursal_nombre":    str(suc_map.get(r[name_col], "")),
                "importe_total":      round(float(r["importe"]), 0),
                "cantidad_facturas":  int(r["cantidad"]),
                "ultimo_comprobante": ult_map.get(r[name_col]),
            }
            for _, r in by_cli.iterrows()
        ]

    # ── Top vendedores ─────────────────────────────────────────────────────────
    top_vendedores: list[dict] = []
    if "desc_vendedor" in df.columns:
        by_vend = df.groupby("desc_vendedor")["_importe"].sum().reset_index().sort_values("_importe", ascending=False).head(12)
        top_vendedores = [
            {"nombre": str(r["desc_vendedor"]), "valor": round(float(r["_importe"]), 0)}
            for _, r in by_vend.iterrows()
        ]

    sucursal = ""
    if "desc_sucursal" in df.columns:
        vals = df["desc_sucursal"].dropna().astype(str)
        sucursal = vals.mode().iloc[0] if not vals.empty else ""

    return {
        "source": "comprobantes_detallado",
        "date_from": date_from,
        "date_to": date_to,
        "kpis": kpis,
        "serie_temporal": serie,
        "top_clientes": top_clientes,
        "top_vendedores": top_vendedores,
        "por_articulo": por_articulo,
        "por_canal_articulo": por_canal_articulo,
        "por_vendedor_articulo": por_vendedor_articulo,
        "clientes_x_articulo": clientes_x_articulo,
        "origen_datos": {
            "fuente": "Comprobantes CHESS — Detallado",
            "menu_referencia": "CHESS → Comprobantes → Detalle por período",
            "filtros_aplicados": [
                f"Desde: {date_from}", f"Hasta: {date_to}",
                *([ f"Sucursal: {sucursal}"] if sucursal else []),
            ],
            "snapshot_at": dt.datetime.now().isoformat(),
        },
    }
