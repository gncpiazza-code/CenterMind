#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Análisis de pareja Resumen + Detallado (CHESS comprobantes de ventas).

Lee los dos Excel descargados por el motor ventas, cruza por clave de comprobante
y arma KPIs + tablas agregadas.

Documentación de columnas: docs/VENTAS_COMPROBANTES_COLUMNAS.md

Ejemplo:
  python scripts/analizar_ventas_comprobantes.py \\
    downloads/20260429221124-ReporteComprobantesResumen.xlsx \\
    downloads/20260429221127-ReporteComprobantesDetallado.xlsx

  python scripts/analizar_ventas_comprobantes.py res.xlsx det.xlsx --json salida.json
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

SHEET = "Datos"
COL_SERIE = "Serie \\ Punto de venta"


def _norm_txt(x: Any) -> str:
    if pd.isna(x):
        return ""
    return str(x).strip().upper()


def _money(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").fillna(0.0)


def _bultos(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").fillna(0.0)


def _comp_key_row(r: pd.Series) -> str:
    def z(v: Any) -> str:
        if pd.isna(v):
            return ""
        if isinstance(v, float) and v == int(v):
            return str(int(v))
        return str(v).strip()

    emp = z(r.get("Empresa"))
    comp = z(r.get("Comprobante"))
    letra = z(r.get("Letra"))
    serie = z(r.get(COL_SERIE))
    num = z(r.get("Numero"))
    return f"{emp}|{comp}|{letra}|{serie}|{num}"


def _cargar(ruta: Path) -> pd.DataFrame:
    df = pd.read_excel(ruta, sheet_name=SHEET, header=0, engine="openpyxl")
    df.columns = [str(c).strip() for c in df.columns]
    if COL_SERIE not in df.columns:
        alt = [c for c in df.columns if "punto de venta" in c.lower() or c.startswith("Serie")]
        if len(alt) == 1:
            df = df.rename(columns={alt[0]: COL_SERIE})
    return df


def _filtro_activo(df: pd.DataFrame) -> pd.Series:
    """Excluye filas claramente anuladas si la columna existe."""
    if "Anulado" not in df.columns:
        return pd.Series(True, index=df.index)
    a = df["Anulado"].map(lambda x: _norm_txt(x))
    return ~(a == "SI")


def _es_recibo(row: pd.Series) -> bool:
    c = _norm_txt(row.get("Comprobante"))
    d = _norm_txt(row.get("Descripcion Comprobante"))
    if c.startswith("REC") or "RECIB" in d:
        return True
    return False


def _es_fcvtas(row: pd.Series) -> bool:
    return _norm_txt(row.get("Comprobante")) == "FCVTA"


def _es_contado(row: pd.Series) -> bool:
    s = _norm_txt(row.get("Descripcion Condicion de pago"))
    return "CONTADO" in s and "CTA" not in s and "CTE" not in s


def _es_cta_cte(row: pd.Series) -> bool:
    s = _norm_txt(row.get("Descripcion Condicion de pago"))
    if not s:
        return False
    if "CONTADO" in s and "CTA" not in s:
        return False
    return bool(re.search(r"CTA|CTE|CUENTA\s+CORRIENTE|CORRIENTE", s))


def kpis_financieros_resumen(df: pd.DataFrame) -> dict[str, Any]:
    df = df.copy()
    df["_key"] = df.apply(_comp_key_row, axis=1)
    act = _filtro_activo(df)
    mny = _money(df["Subtotal Final"]) if "Subtotal Final" in df.columns else pd.Series(0.0, index=df.index)

    mask_recibo = df.apply(_es_recibo, axis=1) & act
    mask_fc = df.apply(_es_fcvtas, axis=1) & act
    mask_contado = df.apply(_es_contado, axis=1) & mask_fc
    mask_cc = df.apply(_es_cta_cte, axis=1) & mask_fc

    recaudacion = float(mny[mask_recibo | mask_contado].sum())
    fact_cc = float(mny[mask_cc].sum())
    recibos = float(mny[mask_recibo].sum())
    fc_contado = float(mny[mask_contado].sum())

    por_codigo = df.loc[act, ["Comprobante", "Descripcion Comprobante"]].copy()
    por_codigo["Subtotal Final"] = mny[act]
    agg_tipo = (
        por_codigo.groupby(["Comprobante", "Descripcion Comprobante"], dropna=False)["Subtotal Final"]
        .sum()
        .reset_index(name="total")
        .sort_values("total", ascending=False)
    )

    return {
        "recaudacion_dia_contado_mas_recibos": recaudacion,
        "desglose_recaudacion": {
            "suma_recibos": recibos,
            "suma_facturas_contado_FCVTA": fc_contado,
        },
        "facturado_cta_cte_FCVTA": fact_cc,
        "filas_resumen_activas": int(act.sum()),
        "por_comprobante_tipo": agg_tipo.head(40).to_dict(orient="records"),
    }


def agregados_detallado(
    df: pd.DataFrame,
    *,
    solo_fcvtas: bool,
    incluir_nc: bool,
    activos_cabecera: pd.Series | None,
) -> dict[str, Any]:
    d = df.copy()
    d["_key"] = d.apply(_comp_key_row, axis=1)

    if activos_cabecera is not None and len(activos_cabecera) == len(df):
        d = d.loc[activos_cabecera].copy()

    c = d["Comprobante"].map(_norm_txt) if "Comprobante" in d.columns else pd.Series("", index=d.index)
    mask = pd.Series(True, index=d.index)
    if solo_fcvtas and not incluir_nc:
        mask = c == "FCVTA"
    elif solo_fcvtas and incluir_nc:
        mask = c.isin(["FCVTA", "DVVTA"])

    dd = d.loc[mask].copy()
    mul = dd.apply(lambda r: -1.0 if _norm_txt(r.get("Comprobante")) == "DVVTA" else 1.0, axis=1)

    dol = _money(dd["Subtotal Final"]) * mul if "Subtotal Final" in dd.columns else pd.Series(0.0, index=dd.index)
    bul = _bultos(dd["Bultos Total"]) * mul if "Bultos Total" in dd.columns else pd.Series(0.0, index=dd.index)

    tmp = dd.copy()
    tmp["_dol"] = dol
    tmp["_bul"] = bul

    def agg_group(by: list[str], top: int) -> list[dict[str, Any]]:
        cols = [c for c in by if c in tmp.columns]
        if not cols:
            return []
        g = tmp.groupby(cols, dropna=False).agg(total_dolares=("_dol", "sum"), total_bultos=("_bul", "sum")).reset_index()
        g = g.assign(_abs=g["total_dolares"].abs()).sort_values("_abs", ascending=False).drop(columns=["_abs"]).head(top)
        return g.to_dict(orient="records")

    return {
        "filas_detallado_usadas": int(len(dd)),
        "por_vendedor": agg_group(["Vendedor", "Descripcion Vendedor"], 80),
        "por_articulo": agg_group(["Codigo de Articulo", "Descripcion de Articulo"], 120),
        "por_cliente": agg_group(["Cliente", "Razon Social"], 80),
        "por_canal_mkt": agg_group(["Canal MKT", "Descripcion Canal MKT"], 40),
        "por_subcanal_mkt": agg_group(["Subcanal", "Descripcion Subcanal MKT"], 40),
    }


def _sanitize_json(x: Any) -> Any:
    """pandas/NumPy NA → None; NaN → null para JSON válido."""
    if isinstance(x, dict):
        return {k: _sanitize_json(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_sanitize_json(v) for v in x]
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None
    if x is pd.NA:  # type: ignore
        return None
    try:
        if pd.isna(x):  # type: ignore[arg-type]
            return None
    except (TypeError, ValueError):
        pass
    return x


def cruce_validacion(df_r: pd.DataFrame, df_d: pd.DataFrame) -> dict[str, Any]:
    """Suma líneas FCVTA en detalle vs resumen FCVTA."""
    df_r = df_r.copy()
    df_d = df_d.copy()
    act = _filtro_activo(df_r)

    mr = df_r.apply(_es_fcvtas, axis=1) & act
    keys_r = set(df_r.loc[mr].apply(_comp_key_row, axis=1))

    d = df_d[df_d["Comprobante"].map(_norm_txt) == "FCVTA"].copy()
    dol = _money(d["Subtotal Final"])
    sum_lineas_por_doc = (
        d.assign(_k=d.apply(_comp_key_row, axis=1), _d=dol)
        .groupby("_k")["_d"]
        .sum()
        .reindex(keys_r)
        .fillna(0)
    )
    sr = df_r.loc[mr]
    sr = sr.assign(_k=sr.apply(_comp_key_row, axis=1), _ci=_money(sr["Subtotal Final"]))
    sum_cab_por_doc = sr.groupby("_k")["_ci"].first()

    comunes = sum_lineas_por_doc.index.intersection(sum_cab_por_doc.index)
    diff = sum_lineas_por_doc[comunes] - sum_cab_por_doc[comunes]

    return {
        "documentos_fcvtas_resumen": int(mr.sum()),
        "filas_fcvtas_detallado": int(len(d)),
        "diff_por_documento_fcvtas_muestra": diff.abs().nlargest(10).to_dict(),
        "diff_max_abs": float(diff.abs().max()) if len(diff) else 0.0,
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Análisis KPI ventas CHESS (resumen + detallado)")
    p.add_argument("resumen_xlsx", type=Path, help="Reporte Comprobantes Resumen .xlsx")
    p.add_argument("detallado_xlsx", type=Path, help="Reporte Comprobantes Detallado .xlsx")
    p.add_argument("--json", type=Path, default=None, help="Volcar resultado JSON aquí")
    p.add_argument(
        "--incluir-nc",
        action="store_true",
        help="En detallado, incluir DVVTA como importe/bultos negativos además de FCVTA",
    )
    p.add_argument(
        "--todas-lineas",
        action="store_true",
        help="No filtrar solo FCVTA en detallado (útil para auditoría; mezcla anticipos, etc.)",
    )
    args = p.parse_args()

    df_r = _cargar(args.resumen_xlsx)
    df_d = _cargar(args.detallado_xlsx)

    act_r = _filtro_activo(df_r)
    keys_activos = set(df_r.loc[act_r].apply(_comp_key_row, axis=1))
    d_key = df_d.apply(_comp_key_row, axis=1)
    act_d = d_key.isin(keys_activos)

    k_fin = kpis_financieros_resumen(df_r)
    solo_fc = not args.todas_lineas
    agg = agregados_detallado(
        df_d,
        solo_fcvtas=solo_fc,
        incluir_nc=args.incluir_nc,
        activos_cabecera=act_d if act_d.any() else None,
    )
    val = cruce_validacion(df_r, df_d)

    out: dict[str, Any] = _sanitize_json(
        {
            "archivos": {"resumen": str(args.resumen_xlsx), "detallado": str(args.detallado_xlsx)},
            "financiero_resumen": k_fin,
            "lineas_detallado": agg,
            "validacion_fcvtas": val,
        }
    )

    print(json.dumps(out, indent=2, ensure_ascii=False, allow_nan=False))

    if args.json:
        args.json.write_text(json.dumps(out, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        print(f"\n[OK] JSON escrito en {args.json}", file=sys.stderr)


if __name__ == "__main__":
    main()
