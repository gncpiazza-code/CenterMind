# -*- coding: utf-8 -*-
from __future__ import annotations

import re
import datetime as dt
from typing import Any

import pandas as pd

from ._normalization import _norm, find_col, find_date_col, parse_fecha_robusta


def _parse_time(val) -> dt.time | None:
    if pd.isna(val):
        return None
    if isinstance(val, (dt.datetime, pd.Timestamp)):
        return val.time()
    if isinstance(val, dt.time):
        return val
    s = str(val).strip()
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return dt.datetime.strptime(s, fmt).time()
        except ValueError:
            pass
    return None


def parse_sigo(df: pd.DataFrame, date_from: str, date_to: str) -> dict[str, Any]:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]

    col_vendedor  = find_col(df, ["Sector", "vendedor", "descripcion vendedor", "desc vendedor"])
    col_fecha     = find_date_col(df) or find_col(df, ["fecha"])
    col_visitado  = find_col(df, ["visitado", "estado visita"])
    col_hora_vis  = find_col(df, ["hora visita", "hora_visita", "hora de visita"])
    col_hora_ven  = find_col(df, ["hora venta", "hora_venta", "hora de venta"])
    col_cli_id    = find_col(df, ["Id cliente erp", "id cliente", "codigo cliente"])
    col_cli_nom   = find_col(df, ["descripcion cliente", "Cliente", "Razon Social", "nombre cliente"])
    col_motivo    = find_col(df, ["motivo", "motivo de visita"])
    col_ruta      = find_col(df, ["Ruta", "nombre ruta", "id ruta"])

    missing = [k for k, v in {"vendedor": col_vendedor, "fecha": col_fecha, "visitado": col_visitado}.items() if v is None]
    if missing:
        raise ValueError(f"El archivo SIGO no tiene las columnas obligatorias: {missing}. "
                         f"Columnas detectadas: {list(df.columns[:15])}")

    dfp = df.copy()
    dfp["_fecha"] = parse_fecha_robusta(dfp[col_fecha]).dt.date
    dfp["_vendedor"] = dfp[col_vendedor].astype(str).str.strip()
    dfp["_visitado_norm"] = dfp[col_visitado].apply(_norm).apply(
        lambda s: "si" if s in {"si", "sı", "s", "yes", "1", "true", "x"} else "no"
    )
    dfp["_hora_vis"] = dfp[col_hora_vis].apply(_parse_time) if col_hora_vis else None
    dfp["_hora_ven"] = dfp[col_hora_ven].apply(_parse_time) if col_hora_ven else None

    dfp = dfp.dropna(subset=["_fecha", "_vendedor"]).copy()
    dfp = dfp[dfp["_vendedor"].ne("nan") & dfp["_vendedor"].ne("")].copy()

    # ── KPIs globales ─────────────────────────────────────────────────────────
    total      = len(dfp)
    visitados  = (dfp["_visitado_norm"] == "si").sum()
    ventas     = dfp["_hora_ven"].notna().sum() if col_hora_ven else 0
    sin_venta  = visitados - ventas
    cobertura  = round(visitados / total * 100, 1) if total > 0 else 0.0
    efectiv    = round(ventas / visitados * 100, 1) if visitados > 0 else 0.0

    antes_14 = 0
    if col_hora_vis:
        def _es_antes_14(t) -> bool:
            if t is None:
                return False
            return t.hour < 14
        antes_14 = int(dfp[dfp["_visitado_norm"] == "si"]["_hora_vis"].apply(_es_antes_14).sum())

    pct_antes_14 = round(antes_14 / visitados * 100, 1) if visitados > 0 else 0.0

    kpis = [
        {"label": "Cobertura",       "value": cobertura,        "unit": "%"},
        {"label": "Efectividad",     "value": efectiv,          "unit": "%"},
        {"label": "Visitados",       "value": int(visitados)},
        {"label": "Sin venta",       "value": int(sin_venta)},
        {"label": "Visitas <14hs",   "value": int(antes_14)},
        {"label": "% Visitas <14hs", "value": pct_antes_14,     "unit": "%"},
    ]

    # ── Serie temporal: visitados por día ─────────────────────────────────────
    daily = (
        dfp.groupby("_fecha")["_visitado_norm"]
        .apply(lambda s: (s == "si").sum())
        .reset_index()
    )
    serie = [
        {"fecha": str(r["_fecha"]), "valor": int(r["_visitado_norm"])}
        for _, r in daily.iterrows()
    ]

    # ── Por vendedor ───────────────────────────────────────────────────────────
    def _vend_stats(g: pd.DataFrame):
        t  = len(g)
        v  = (g["_visitado_norm"] == "si").sum()
        vn = g["_hora_ven"].notna().sum() if col_hora_ven else 0
        cob = round(v / t * 100, 1) if t > 0 else 0.0
        efe = round(vn / v * 100, 1) if v > 0 else 0.0
        vis_grp = g[g["_visitado_norm"] == "si"]
        hrs = vis_grp["_hora_vis"].dropna().tolist() if col_hora_vis else []
        h1 = min(hrs).strftime("%H:%M") if hrs else "-"
        hN = max(hrs).strftime("%H:%M") if hrs else "-"
        return pd.Series({"total": t, "visitados": int(v), "ventas": int(vn),
                          "cobertura": cob, "efectividad": efe, "hora_ini": h1, "hora_fin": hN})

    by_vend = dfp.groupby("_vendedor").apply(_vend_stats).reset_index()
    by_vend = by_vend.sort_values("cobertura", ascending=False)

    top_vendedores = [
        {"nombre": str(r["_vendedor"]), "valor": float(r["cobertura"])}
        for _, r in by_vend.iterrows()
    ]

    # top_clientes reutilizado para tabla de vendedores (cobertura por vendedor)
    top_clientes = [
        {
            "nombre_cliente": str(r["_vendedor"]),
            "vendedor_nombre": f"{r['visitados']}/{r['total']} visitados",
            "sucursal_nombre": f"Efectividad: {r['efectividad']}%",
            "importe_total": float(r["cobertura"]),
            "cantidad_facturas": int(r["ventas"]),
            "ultimo_comprobante": None,
        }
        for _, r in by_vend.iterrows()
    ]

    return {
        "source": "sigo",
        "date_from": date_from,
        "date_to": date_to,
        "kpis": kpis,
        "serie_temporal": serie,
        "top_clientes": top_clientes,
        "top_vendedores": top_vendedores,
        "origen_datos": {
            "fuente": "SIGO",
            "menu_referencia": "SIGO → Módulo de Gestión → Visitas por rango",
            "filtros_aplicados": [f"Desde: {date_from}", f"Hasta: {date_to}",
                                  f"Vendedores detectados: {dfp['_vendedor'].nunique()}"],
            "snapshot_at": dt.datetime.now().isoformat(),
        },
    }
