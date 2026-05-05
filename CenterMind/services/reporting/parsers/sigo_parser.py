# -*- coding: utf-8 -*-
from __future__ import annotations

import math
import re
import datetime as dt
from typing import Any

import pandas as pd

from ._normalization import _norm, find_col, find_date_col, parse_fecha_robusta


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


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

    col_vendedor   = find_col(df, ["Sector", "vendedor", "descripcion vendedor", "desc vendedor"])
    col_fecha      = find_date_col(df) or find_col(df, ["fecha"])
    col_visitado   = find_col(df, ["visitado", "estado visita"])
    col_hora_vis   = find_col(df, ["hora visita", "hora_visita", "hora de visita"])
    col_hora_ven   = find_col(df, ["hora venta", "hora_venta", "hora de venta"])
    col_hora_mot   = find_col(df, ["hora motivo", "hora_motivo", "hora de motivo no venta"])
    col_cli_id     = find_col(df, ["Id cliente erp", "id cliente", "codigo cliente"])
    col_cli_nom    = find_col(df, ["descripcion cliente", "Cliente", "Razon Social", "nombre cliente"])
    col_motivo     = find_col(df, ["motivo", "motivo de visita"])
    col_ruta       = find_col(df, ["Ruta", "nombre ruta", "id ruta"])
    col_lat        = find_col(df, ["lat", "latitud", "latitude"])
    col_lon        = find_col(df, ["lon", "lng", "longitud", "longitude"])

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
    dfp["_hora_vis"] = dfp[col_hora_vis].apply(_parse_time) if col_hora_vis else pd.Series([None] * len(dfp), index=dfp.index)
    dfp["_hora_ven"] = dfp[col_hora_ven].apply(_parse_time) if col_hora_ven else pd.Series([None] * len(dfp), index=dfp.index)
    dfp["_hora_mot"] = dfp[col_hora_mot].apply(_parse_time) if col_hora_mot else pd.Series([None] * len(dfp), index=dfp.index)
    dfp["_motivo"]   = dfp[col_motivo].astype(str).str.strip() if col_motivo else pd.Series([""] * len(dfp), index=dfp.index)

    if col_lat:
        import numpy as np
        dfp["_lat"] = pd.to_numeric(dfp[col_lat], errors="coerce")
    else:
        dfp["_lat"] = float("nan")
    if col_lon:
        dfp["_lon"] = pd.to_numeric(dfp[col_lon], errors="coerce")
    else:
        dfp["_lon"] = float("nan")

    dfp = dfp.dropna(subset=["_fecha", "_vendedor"]).copy()
    dfp = dfp[dfp["_vendedor"].ne("nan") & dfp["_vendedor"].ne("")].copy()

    # Derived visit categories (row-level booleans)
    mask_visitado = dfp["_visitado_norm"] == "si"
    mask_con_venta = dfp["_hora_ven"].notna()
    mask_con_motivo = (
        mask_visitado
        & ~mask_con_venta
        & dfp["_hora_mot"].notna()
        & dfp["_motivo"].ne("").ne(False)
        & dfp["_motivo"].ne("nan")
    )
    mask_sin_info = mask_visitado & ~mask_con_venta & ~mask_con_motivo

    # ── KPIs globales ─────────────────────────────────────────────────────────
    total          = len(dfp)
    planeadas      = total
    visitados      = int(mask_visitado.sum())
    sin_visita     = total - visitados
    ventas         = int(mask_con_venta.sum())
    motivo_no_venta = int(mask_con_motivo.sum())
    sin_info       = int(mask_sin_info.sum())
    sin_venta      = visitados - ventas
    cobertura      = round(visitados / total * 100, 1) if total > 0 else 0.0
    efectiv        = round(ventas / visitados * 100, 1) if visitados > 0 else 0.0

    pct_planeadas_ejecutadas  = round(visitados / planeadas * 100, 1) if planeadas > 0 else 0.0
    pct_ejecutadas_con_venta  = round(ventas / visitados * 100, 1) if visitados > 0 else 0.0
    pct_ejecutadas_con_motivo = round(motivo_no_venta / visitados * 100, 1) if visitados > 0 else 0.0
    pct_ejecutadas_sin_info   = round(sin_info / visitados * 100, 1) if visitados > 0 else 0.0

    antes_14 = 0
    if col_hora_vis:
        def _es_antes_14(t) -> bool:
            if t is None:
                return False
            return t.hour < 14
        antes_14 = int(dfp[mask_visitado]["_hora_vis"].apply(_es_antes_14).sum())

    pct_antes_14 = round(antes_14 / visitados * 100, 1) if visitados > 0 else 0.0

    # hora_primera_visita / hora_primera_venta (global)
    vis_times = dfp[mask_visitado]["_hora_vis"].dropna().tolist()
    hora_primera_visita_global = min(vis_times).strftime("%H:%M") if vis_times else None
    ven_times = dfp[mask_con_venta]["_hora_ven"].dropna().tolist()
    hora_primera_venta_global  = min(ven_times).strftime("%H:%M") if ven_times else None

    # tiempo_promedio_para_venta (global)
    def _time_diff_minutes(t_vis, t_ven) -> float | None:
        if t_vis is None or t_ven is None:
            return None
        d_vis = dt.timedelta(hours=t_vis.hour, minutes=t_vis.minute, seconds=t_vis.second)
        d_ven = dt.timedelta(hours=t_ven.hour, minutes=t_ven.minute, seconds=t_ven.second)
        diff = (d_ven - d_vis).total_seconds() / 60
        return diff if diff >= 0 else None

    if col_hora_vis and col_hora_ven:
        venta_rows = dfp[mask_con_venta].copy()
        diffs = venta_rows.apply(lambda r: _time_diff_minutes(r["_hora_vis"], r["_hora_ven"]), axis=1).dropna().tolist()
        tiempo_promedio_venta = round(sum(diffs) / len(diffs), 1) if diffs else None
    else:
        tiempo_promedio_venta = None

    # km_recorridos_hasta_primera_venta (global)
    km_hasta_primera_venta = None
    if col_lat and col_lon and col_hora_vis:
        try:
            coords_df = dfp[mask_visitado & dfp["_lat"].notna() & dfp["_lon"].notna()].copy()
            coords_df = coords_df.sort_values("_hora_vis")
            primera_venta_idx = dfp[mask_con_venta]["_hora_ven"].dropna().idxmin() if ven_times else None
            if primera_venta_idx is not None and len(coords_df) >= 2:
                subset = coords_df.loc[:primera_venta_idx]
                km_total = 0.0
                for i in range(1, len(subset)):
                    prev = subset.iloc[i - 1]
                    curr = subset.iloc[i]
                    km_total += _haversine_km(prev["_lat"], prev["_lon"], curr["_lat"], curr["_lon"])
                km_hasta_primera_venta = round(km_total, 2)
        except Exception:
            km_hasta_primera_venta = None

    kpis = [
        {"label": "Cobertura",                      "value": cobertura,                     "unit": "%"},
        {"label": "Efectividad",                     "value": efectiv,                       "unit": "%"},
        {"label": "Planeadas",                       "value": int(planeadas)},
        {"label": "Visitados",                       "value": int(visitados)},
        {"label": "Sin visita",                      "value": int(sin_visita)},
        {"label": "Con venta",                       "value": int(ventas)},
        {"label": "Sin venta",                       "value": int(sin_venta)},
        {"label": "Motivo no venta",                 "value": int(motivo_no_venta)},
        {"label": "Sin info",                        "value": int(sin_info)},
        {"label": "Visitas <14hs",                   "value": int(antes_14)},
        {"label": "% Visitas <14hs",                 "value": pct_antes_14,                  "unit": "%"},
        {"label": "% Planeadas ejecutadas",          "value": pct_planeadas_ejecutadas,      "unit": "%"},
        {"label": "% Ejecutadas con venta",          "value": pct_ejecutadas_con_venta,      "unit": "%"},
        {"label": "% Ejecutadas con motivo",         "value": pct_ejecutadas_con_motivo,     "unit": "%"},
        {"label": "% Ejecutadas sin info",           "value": pct_ejecutadas_sin_info,       "unit": "%"},
        {"label": "Hora primera visita",             "value": hora_primera_visita_global},
        {"label": "Hora primera venta",              "value": hora_primera_venta_global},
        {"label": "Tiempo promedio para venta (min)","value": tiempo_promedio_venta},
        {"label": "Km hasta primera venta",          "value": km_hasta_primera_venta},
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
        t   = len(g)
        v   = int((g["_visitado_norm"] == "si").sum())
        vn  = int(g["_hora_ven"].notna().sum())
        mv  = int((
            (g["_visitado_norm"] == "si")
            & ~g["_hora_ven"].notna()
            & g["_hora_mot"].notna()
            & g["_motivo"].ne("").ne(False)
            & g["_motivo"].ne("nan")
        ).sum())
        si_ = int(((g["_visitado_norm"] == "si") & ~g["_hora_ven"].notna() & ~(
            g["_hora_mot"].notna()
            & g["_motivo"].ne("").ne(False)
            & g["_motivo"].ne("nan")
        )).sum())
        cob = round(v / t * 100, 1) if t > 0 else 0.0
        efe = round(vn / v * 100, 1) if v > 0 else 0.0
        vis_grp = g[g["_visitado_norm"] == "si"]
        hrs = vis_grp["_hora_vis"].dropna().tolist()
        h1 = min(hrs).strftime("%H:%M") if hrs else "-"
        hN = max(hrs).strftime("%H:%M") if hrs else "-"
        return pd.Series({
            "total": t, "visitados": v, "ventas": vn,
            "motivo_no_venta": mv, "sin_info": si_,
            "cobertura": cob, "efectividad": efe, "hora_ini": h1, "hora_fin": hN,
        })

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

    # ── Por vendedor y día ────────────────────────────────────────────────────
    por_vendedor_y_dia: list[dict] = []

    def _vend_dia_stats(g: pd.DataFrame) -> dict:
        vendedor_val = g["_vendedor"].iloc[0] if len(g) else ""
        fecha_val    = str(g["_fecha"].iloc[0]) if len(g) else ""
        t_   = len(g)
        v_   = int((g["_visitado_norm"] == "si").sum())
        sv_  = t_ - v_
        vn_  = int(g["_hora_ven"].notna().sum())
        mv_  = int((
            (g["_visitado_norm"] == "si")
            & ~g["_hora_ven"].notna()
            & g["_hora_mot"].notna()
            & g["_motivo"].ne("").ne(False)
            & g["_motivo"].ne("nan")
        ).sum())
        si_  = int(((g["_visitado_norm"] == "si") & ~g["_hora_ven"].notna() & ~(
            g["_hora_mot"].notna()
            & g["_motivo"].ne("").ne(False)
            & g["_motivo"].ne("nan")
        )).sum())
        vis_times_ = g[g["_visitado_norm"] == "si"]["_hora_vis"].dropna().tolist()
        ven_times_ = g["_hora_ven"].dropna().tolist()
        h1_vis = min(vis_times_).strftime("%H:%M") if vis_times_ else None
        h1_ven = min(ven_times_).strftime("%H:%M") if ven_times_ else None
        # tiempo_promedio_venta
        if col_hora_vis and col_hora_ven:
            venta_g = g[g["_hora_ven"].notna()].copy()
            diffs_ = venta_g.apply(lambda r: _time_diff_minutes(r["_hora_vis"], r["_hora_ven"]), axis=1).dropna().tolist()
            tpv = round(sum(diffs_) / len(diffs_), 1) if diffs_ else None
        else:
            tpv = None
        return {
            "vendedor":                   str(vendedor_val),
            "fecha":                      fecha_val,
            "planeadas":                  t_,
            "ejecutadas":                 v_,
            "sin_visita":                 sv_,
            "con_venta":                  vn_,
            "motivo_no_venta":            mv_,
            "sin_info":                   si_,
            "hora_primera_visita":        h1_vis,
            "hora_primera_venta":         h1_ven,
            "tiempo_promedio_venta_min":  tpv,
        }

    for (vendedor_key, fecha_key), grp in dfp.groupby(["_vendedor", "_fecha"]):
        por_vendedor_y_dia.append(_vend_dia_stats(grp))

    # Sort by vendedor, then fecha
    por_vendedor_y_dia.sort(key=lambda x: (x["vendedor"], x["fecha"]))

    return {
        "source": "sigo",
        "date_from": date_from,
        "date_to": date_to,
        "kpis": kpis,
        "serie_temporal": serie,
        "top_clientes": top_clientes,
        "top_vendedores": top_vendedores,
        "por_vendedor_y_dia": por_vendedor_y_dia,
        "origen_datos": {
            "fuente": "SIGO",
            "menu_referencia": "SIGO → Módulo de Gestión → Visitas por rango",
            "filtros_aplicados": [f"Desde: {date_from}", f"Hasta: {date_to}",
                                  f"Vendedores detectados: {dfp['_vendedor'].nunique()}"],
            "snapshot_at": dt.datetime.now().isoformat(),
        },
    }
