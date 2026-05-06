# -*- coding: utf-8 -*-
from __future__ import annotations

import datetime as dt
from typing import Any

import numpy as np
import pandas as pd

from ._normalization import _norm, find_col, find_date_col, parse_fecha_robusta

CANONICAL = {
    "numero":           ["numero", "número", "nro comprobante", "nro"],
    "desc_comprobante": ["descripcion comprobante", "descripción comprobante", "tipo comprobante"],
    "fecha_comprobante":["fecha comprobante", "fecha"],
    "anulado":          ["anulado", "estado", "anulado?"],
    "desc_sucursal":    ["descripcion sucursal", "sucursal"],
    "desc_vendedor":    ["descripcion vendedor", "descripción vendedor", "desc vendedor", "vendedor"],
    "proveedor":        ["proveedor", "proovedor", "desc proveedor", "descripcion proveedor",
                         "descripción proveedor", "prov"],
    "cliente":          ["cliente", "codigo cliente", "cod cliente", "nro cliente"],
    "razon_social":     ["razon social", "razón social", "nombre cliente", "nombre"],
    "desc_canal_mkt":   ["descripcion canal mkt", "canal mkt", "canal", "descripcion c subcanal"],
    "desc_subcanal_mkt":["descripcion subcanal mkt", "subcanal mkt", "subcanal"],
    "codigo_articulo":  ["codigo articulo", "cod art", "articulo", "codigo de articulo"],
    "desc_articulo":    ["descripcion articulo", "desc art", "descripción artículo",
                         "descripcion de articulo"],
    "bultos_cargo":     ["bultos con cargo", "bultos", "bultos cargo"],
    "subtotal_final":   ["subtotal final", "importe", "total"],
}


def _parse_bultos(series: pd.Series) -> pd.Series:
    def _to_float(x) -> float:
        if pd.isna(x):
            return 0.0
        s = str(x).strip().replace(",", ".")
        if s in ("", "nan", "none"):
            return 0.0
        if s.startswith("-."):
            s = "-0" + s[1:]
        elif s.startswith("."):
            s = "0" + s
        try:
            return abs(float(s))
        except Exception:
            return 0.0
    return series.map(_to_float).astype(float)


def _find_proveedor_col(df: pd.DataFrame) -> str | None:
    candidates = [c for c in df.columns
                  if "provee" in _norm(c) or _norm(c).startswith("prov") or _norm(c) == "proveedor"]
    if not candidates:
        return None
    # prefer the one with "real tabacalera" values
    best, best_score = candidates[0], -1.0
    for c in candidates:
        s = df[c].astype(str).apply(_norm)
        score = (s.str.contains(r"\breal\b", na=False) & s.str.contains(r"\btabacalera\b", na=False)).mean()
        if score > best_score:
            best_score, best = score, c
    return best


def parse_bultos(df: pd.DataFrame, date_from: str, date_to: str) -> dict[str, Any]:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]

    # map columns
    mapping: dict[str, str | None] = {}
    for k, pats in CANONICAL.items():
        mapping[k] = find_col(df, pats)

    df.rename(columns={v: k for k, v in mapping.items() if v is not None}, inplace=True)
    for k in CANONICAL:
        if k not in df.columns:
            df[k] = np.nan

    # parse fecha
    fecha_col_orig = find_date_col(df)
    if fecha_col_orig and fecha_col_orig in df.columns:
        df["_fecha"] = parse_fecha_robusta(df[fecha_col_orig])
    else:
        df["_fecha"] = pd.NaT

    # parse bultos
    df["bultos_cargo"] = _parse_bultos(df["bultos_cargo"])

    # normalize
    df["_norm_comprobante"] = df["desc_comprobante"].astype(str).apply(_norm)
    df["_norm_anulado"]     = df["anulado"].astype(str).apply(_norm)

    # find proveedor column (might have been renamed already)
    prov_col = "proveedor" if "proveedor" in df.columns else _find_proveedor_col(df)
    if prov_col and prov_col in df.columns:
        df["_norm_proveedor"] = df[prov_col].astype(str).apply(_norm)
        mask_prov = (
            df["_norm_proveedor"].str.contains(r"\breal tabacalera\b", na=False) |
            (df["_norm_proveedor"].str.contains(r"\breal\b", na=False) &
             df["_norm_proveedor"].str.contains(r"\btabacalera\b", na=False))
        )
        if mask_prov.sum() > 0:
            df = df[mask_prov].copy()

    mask_tipo = (
        df["_norm_comprobante"].str.contains(r"\bfactura\b", na=False) |
        df["_norm_comprobante"].str.contains(r"\bfactura presupuesto\b", na=False)
    )
    if mask_tipo.sum() > 0:
        df = df[mask_tipo].copy()

    mask_anulado = ~df["_norm_anulado"].isin({"si", "sı", "s", "anulado", "true", "1"})
    df = df[mask_anulado & (df["bultos_cargo"] > 0)].copy()

    # ── Semanas ────────────────────────────────────────────────────────────────
    if df["_fecha"].notna().any():
        fmin = df["_fecha"].dropna().min().date()
        fmax = df["_fecha"].dropna().max().date()
        semanas = max(1, ((fmax - fmin).days // 7) + 1)
    else:
        semanas = 1

    # ── Artículo final (código + descripción) ──────────────────────────────────
    cod  = df["codigo_articulo"].astype(str).str.strip().replace({"": np.nan, "nan": np.nan, "None": np.nan})
    desc = df["desc_articulo"].astype(str).str.strip().replace({"": np.nan, "nan": np.nan, "None": np.nan})
    df["_articulo"] = np.where(
        cod.notna(),
        "[" + cod.fillna("") + "] " + desc.fillna(""),
        desc.fillna("SIN ARTICULO")
    )

    # cliente final
    cli_num = df["cliente"].astype(str).str.strip().replace({"": np.nan, "nan": np.nan, "None": np.nan})
    cli_rs  = df["razon_social"].astype(str).str.strip().replace({"": np.nan, "nan": np.nan, "None": np.nan})
    df["_cliente_final"] = np.where(
        cli_num.notna(),
        "[" + cli_num.fillna("") + "] " + cli_rs.fillna(""),
        cli_rs.fillna("SIN CLIENTE")
    )

    total_bultos     = df["bultos_cargo"].sum()
    articulos_unicos = df["_articulo"].nunique()
    vendedores_unicos = df["desc_vendedor"].nunique() if "desc_vendedor" in df.columns else 0
    prom_sem_total   = round(total_bultos / semanas, 1)

    # clientes >2.5 cajas/semana
    by_cli_bultos = df.groupby("_cliente_final")["bultos_cargo"].sum()
    clientes_25   = int((by_cli_bultos / semanas > 2.5).sum())

    kpis = [
        {"label": "Bultos Totales",   "value": int(total_bultos)},
        {"label": "Artículos únicos", "value": int(articulos_unicos)},
        {"label": "Semanas",          "value": int(semanas)},
        {"label": "Prom. Semanal",    "value": prom_sem_total, "unit": " blts/sem"},
        {"label": "PDVs >2.5/sem",    "value": int(clientes_25)},
        {"label": "Vendedores",       "value": int(vendedores_unicos)},
    ]

    # ── Serie temporal ─────────────────────────────────────────────────────────
    serie: list[dict] = []
    if df["_fecha"].notna().any():
        daily = (
            df[df["_fecha"].notna()]
            .groupby(df["_fecha"].dt.date)["bultos_cargo"]
            .sum()
            .reset_index()
        )
        daily.columns = ["fecha", "valor"]
        serie = [
            {"fecha": str(r["fecha"]), "valor": round(float(r["valor"]), 1)}
            for _, r in daily.iterrows()
        ]

    # ── Top artículos (en top_vendedores) ──────────────────────────────────────
    by_art = (
        df.groupby("_articulo")["bultos_cargo"]
        .sum()
        .reset_index()
        .sort_values("bultos_cargo", ascending=False)
        .head(15)
    )
    by_art["prom"] = (by_art["bultos_cargo"] / semanas).round(1)
    top_vendedores = [
        {"nombre": str(r["_articulo"]), "valor": round(float(r["bultos_cargo"]), 1)}
        for _, r in by_art.iterrows()
    ]

    # ── Top PDVs (en top_clientes) ─────────────────────────────────────────────
    by_pdv = (
        df.groupby("_cliente_final")["bultos_cargo"]
        .sum()
        .reset_index()
        .sort_values("bultos_cargo", ascending=False)
        .head(20)
    )
    by_pdv["prom_sem"] = (by_pdv["bultos_cargo"] / semanas).round(1)

    vend_map = {}
    suc_map  = {}
    if "desc_vendedor" in df.columns:
        vend_map = df.groupby("_cliente_final")["desc_vendedor"].first().to_dict()
    if "desc_sucursal" in df.columns:
        suc_map = df.groupby("_cliente_final")["desc_sucursal"].first().to_dict()

    top_clientes = [
        {
            "nombre_cliente":    str(r["_cliente_final"]),
            "vendedor_nombre":   str(vend_map.get(r["_cliente_final"], "")),
            "sucursal_nombre":   str(suc_map.get(r["_cliente_final"], "")),
            "importe_total":     float(r["prom_sem"]),   # promedio semanal de bultos
            "cantidad_facturas": int(r["bultos_cargo"]),  # total bultos
            "ultimo_comprobante": None,
        }
        for _, r in by_pdv.iterrows()
    ]

    # ── Semana serie ──────────────────────────────────────────────────────────
    semana_serie_bultos: list[dict] = []
    if df["_fecha"].notna().any():
        _df_w = df.copy()
        _df_w["_semana"] = _df_w["_fecha"].dt.isocalendar().year.astype(str) + "-W" + \
                           _df_w["_fecha"].dt.isocalendar().week.astype(str).str.zfill(2)
        _sw_grp = _df_w[_df_w["_fecha"].notna()].groupby("_semana")["bultos_cargo"].sum().reset_index()
        semana_serie_bultos = [
            {"semana": str(r["_semana"]), "bultos": round(float(r["bultos_cargo"]), 1)}
            for _, r in _sw_grp.sort_values("_semana").iterrows()
        ]

    # ── Por vendedor bultos ────────────────────────────────────────────────────
    por_vendedor_bultos: list[dict] = []
    if "desc_vendedor" in df.columns:
        for _vend_name, _vg in df.groupby("desc_vendedor"):
            _total_v = _vg["bultos_cargo"].sum()
            _n_cli_v = _vg["_cliente_final"].nunique()
            _prom_v  = round(_total_v / semanas, 1)
            _by_cli_v = _vg.groupby("_cliente_final")["bultos_cargo"].sum()
            _pct_25_v = round((_by_cli_v / semanas > 2.5).sum() / max(len(_by_cli_v), 1), 2)
            por_vendedor_bultos.append({
                "vendedor":   str(_vend_name),
                "bultos":     round(float(_total_v), 1),
                "prom_sem":   _prom_v,
                "n_clientes": int(_n_cli_v),
                "pct_25":     float(_pct_25_v),
            })
        por_vendedor_bultos.sort(key=lambda x: x["bultos"], reverse=True)

    # ── Clientes semana pivot ─────────────────────────────────────────────────
    MAX_SEMANAS = 13
    clientes_semana_pivot: list[dict] = []
    if df["_fecha"].notna().any():
        _df_piv = df.copy()
        _df_piv["_semana"] = _df_piv["_fecha"].dt.isocalendar().year.astype(str) + "-W" + \
                             _df_piv["_fecha"].dt.isocalendar().week.astype(str).str.zfill(2)
        _all_semanas = sorted(_df_piv["_semana"].dropna().unique())[-MAX_SEMANAS:]
        _df_piv = _df_piv[_df_piv["_semana"].isin(_all_semanas)]
        _pivot_grp = _df_piv.groupby(["_cliente_final", "_semana"])["bultos_cargo"].sum()
        _pivot_dict: dict[str, dict] = {}
        for (_cli, _sem), _val in _pivot_grp.items():
            _pivot_dict.setdefault(_cli, {})[_sem] = round(float(_val), 1)
        _vend_map_p = {}
        if "desc_vendedor" in df.columns:
            _vend_map_p = df.groupby("_cliente_final")["desc_vendedor"].first().to_dict()
        for _cli, _semanas_d in sorted(_pivot_dict.items(), key=lambda x: sum(x[1].values()), reverse=True)[:200]:
            clientes_semana_pivot.append({
                "cliente":  _cli,
                "vendedor": str(_vend_map_p.get(_cli, "")),
                "semanas":  _semanas_d,
            })

    # ── Artículos por vendedor ────────────────────────────────────────────────
    articulos_por_vendedor: list[dict] = []
    if "desc_vendedor" in df.columns:
        _av_grp = df.groupby(["desc_vendedor", "_articulo"])["bultos_cargo"].sum().reset_index()
        _av_grp["prom_sem"] = (_av_grp["bultos_cargo"] / semanas).round(1)
        for _, r in _av_grp.sort_values("bultos_cargo", ascending=False).head(300).iterrows():
            articulos_por_vendedor.append({
                "vendedor":  str(r["desc_vendedor"]),
                "articulo":  str(r["_articulo"]),
                "bultos":    round(float(r["bultos_cargo"]), 1),
                "prom_sem":  float(r["prom_sem"]),
            })

    return {
        "source": "bultos",
        "date_from": date_from,
        "date_to": date_to,
        "kpis": kpis,
        "serie_temporal": serie,
        "top_clientes": top_clientes,
        "top_vendedores": top_vendedores,
        "semana_serie_bultos":     semana_serie_bultos,
        "por_vendedor_bultos":     por_vendedor_bultos,
        "clientes_semana_pivot":   clientes_semana_pivot,
        "articulos_por_vendedor":  articulos_por_vendedor,
        "origen_datos": {
            "fuente": "Bultos / Análisis Unificado CHESS",
            "menu_referencia": "CHESS → Comprobantes → Detalle por artículo",
            "filtros_aplicados": [
                f"Desde: {date_from}", f"Hasta: {date_to}",
                "Proveedor: Real Tabacalera",
            ],
            "snapshot_at": dt.datetime.now().isoformat(),
        },
    }
