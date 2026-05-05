# -*- coding: utf-8 -*-
from __future__ import annotations

import io
import re
import unicodedata
import datetime as dt
from typing import Optional

import numpy as np
import pandas as pd

_PANDAS_MAX_YEAR = 2262


def _strip_accents(text: str) -> str:
    if not isinstance(text, str):
        return ""
    return "".join(ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch))


def _norm(s: str) -> str:
    s = _strip_accents(str(s)).lower().strip()
    s = re.sub(r"[\W_]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def find_col(df: pd.DataFrame, candidates: list[str]) -> Optional[str]:
    ncols = {c: _norm(c) for c in df.columns}
    pats = [_norm(p) for p in candidates]
    # exact match first
    for p in pats:
        for c, nc in ncols.items():
            if p == nc:
                return c
    # partial match
    for p in pats:
        for c, nc in ncols.items():
            if p in nc:
                return c
    return None


def find_date_col(df: pd.DataFrame) -> Optional[str]:
    # prefer "Fecha Comprobante" exact
    if "Fecha Comprobante" in df.columns:
        return "Fecha Comprobante"
    candidates = [c for c in df.columns if "fecha" in _norm(str(c))]
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    # pick column with most parseable values
    sample = df[candidates].head(400)
    best_col, best_ratio = candidates[0], 0.0
    for c in candidates:
        ratio = parse_fecha_robusta(sample[c]).notna().mean()
        if ratio > best_ratio:
            best_ratio, best_col = ratio, c
    return best_col if best_ratio >= 0.3 else candidates[0]


def parse_fecha_robusta(series: pd.Series) -> pd.Series:
    out = pd.Series(pd.NaT, index=series.index, dtype="datetime64[ns]")

    # numeric (Excel serial)
    num = pd.to_numeric(series, errors="coerce")
    mask_num = num.notna() & num.between(1, 120_000)
    if mask_num.any():
        out.loc[mask_num] = pd.to_datetime(
            num[mask_num], unit="D", origin="1899-12-30", errors="coerce"
        )

    # already datetime/Timestamp
    mask_dt = series.apply(lambda x: isinstance(x, (pd.Timestamp, dt.datetime, dt.date)))
    if mask_dt.any():
        safe_vals = []
        for raw in series[mask_dt]:
            try:
                if isinstance(raw, pd.Timestamp):
                    ts = raw.to_pydatetime()
                elif isinstance(raw, dt.datetime):
                    ts = raw
                elif isinstance(raw, dt.date):
                    ts = dt.datetime(raw.year, raw.month, raw.day)
                else:
                    safe_vals.append(pd.NaT)
                    continue
                # pandas datetime64[ns] upper bound ~2262-04-11
                if ts.year > _PANDAS_MAX_YEAR:
                    safe_vals.append(pd.NaT)
                else:
                    safe_vals.append(ts)
            except Exception:
                safe_vals.append(pd.NaT)
        out.loc[mask_dt] = pd.to_datetime(pd.Series(safe_vals, index=series[mask_dt].index), errors="coerce")

    # string
    mask_str = series.apply(lambda x: isinstance(x, str)) & out.isna()
    if mask_str.any():
        st = series[mask_str].str.strip()
        # Sentinel values commonly used by ERP exports (outside pandas bounds)
        st = st.mask(st.str.contains(r"^9999[-/]12[-/]31", regex=True, na=False), "")
        st = st.str.replace(r"[.\- ]", "/", regex=True)
        p1 = pd.to_datetime(st, errors="coerce", dayfirst=True)
        miss = p1.isna() & st.ne("")
        if miss.any():
            p2 = pd.to_datetime(st[miss], errors="coerce", dayfirst=False)
            p1.loc[miss] = p2
        out.loc[mask_str] = out.loc[mask_str].fillna(p1)

    return out


def to_numeric_safe(series: pd.Series) -> pd.Series:
    cleaned = (
        series.astype(str)
        .str.strip()
        .str.replace(r"[$\s]", "", regex=True)
        .str.replace(",", ".")
        .str.replace(r"[^0-9.\-]", "", regex=True)
    )
    return pd.to_numeric(cleaned, errors="coerce").fillna(0.0)


def read_excel_robust(file_bytes: bytes, filename: str) -> pd.DataFrame:
    name = (filename or "").lower()
    if name.endswith(".csv") or name.endswith(".txt"):
        for sep in ["\t", ",", ";"]:
            for enc in ["latin1", "cp1252", "utf-8", "utf-8-sig"]:
                try:
                    df = pd.read_csv(
                        io.BytesIO(file_bytes), sep=sep, encoding=enc, dtype=str
                    )
                    if len(df.columns) > 1:
                        return df
                except Exception:
                    pass
        return pd.read_csv(io.BytesIO(file_bytes), dtype=str)

    # Excel: try openpyxl then xlrd
    for engine in ("openpyxl", "xlrd", None):
        try:
            kwargs = {"dtype": str}
            if engine:
                kwargs["engine"] = engine
            return pd.read_excel(io.BytesIO(file_bytes), **kwargs)
        except Exception:
            pass

    raise ValueError("No se pudo leer el archivo. Usá .xlsx, .xls o .csv.")
