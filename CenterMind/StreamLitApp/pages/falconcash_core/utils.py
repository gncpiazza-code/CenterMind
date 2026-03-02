# path: utils.py
# -*- coding: utf-8 -*-
from __future__ import annotations
from pathlib import Path
import datetime as dt
import pandas as pd
from xlrd import XLRDError

__all__ = ["leer_excel", "parse_fecha_robusta"]

def leer_excel(path: str | Path):
    """
    Lector robusto para XLS/XLSX/CSV/TXT.
    Por qué: exportes ERP a veces son .xls falsos o TSV.
    """
    p = Path(path)
    ext = p.suffix.lower()

    if ext in {".xlsx", ".xlsm"}:
        return pd.read_excel(p, engine="openpyxl", dtype=str)

    if ext == ".xls":
        try:
            return pd.read_excel(p, engine="xlrd", dtype=str)
        except Exception as e_xlrd:
            print(f"Advertencia: '{p.name}' falló con xlrd. Probando openpyxl. Detalle: {e_xlrd}")
            try:
                return pd.read_excel(p, engine="openpyxl", dtype=str)
            except Exception as e_openpyxl:
                print(f"Advertencia: '{p.name}' falló con openpyxl. Probando TSV/CSV. Detalle: {e_openpyxl}")
                # Intento TSV primero (muy común en exportes a “Excel”)
                for enc in ("latin1", "cp1252", "utf-8", "utf-8-sig"):
                    try:
                        return pd.read_csv(p, sep="\t", engine="python", dtype=str, encoding=enc)
                    except (UnicodeDecodeError, LookupError):
                        continue
                    except Exception:
                        break
                # Auto-separador
                for enc in ("latin1", "cp1252", "utf-8", "utf-8-sig"):
                    try:
                        return pd.read_csv(p, sep=None, engine="python", dtype=str, encoding=enc)
                    except Exception:
                        continue
                raise ValueError(
                    f"No se pudo leer '{p.name}' como XLS/XLSX ni TSV/CSV."
                )

    if ext in {".csv", ".txt"}:
        try:
            return pd.read_csv(p, sep="\t", engine="python", dtype=str)
        except Exception:
            try:
                return pd.read_csv(p, sep=None, engine="python", dtype=str)
            except UnicodeDecodeError:
                for enc in ("latin1", "cp1252", "utf-8-sig"):
                    try:
                        return pd.read_csv(p, sep="\t", engine="python", dtype=str, encoding=enc)
                    except Exception:
                        try:
                            return pd.read_csv(p, sep=None, engine="python", dtype=str, encoding=enc)
                        except Exception:
                            continue
                raise
            except Exception as e:
                raise ValueError(f"Error leyendo CSV/TXT '{p.name}'. Detalle: {e}") from e

    # Último intento
    try:
        print(f"Advertencia: extensión '{ext}' no reconocida; intenta pandas.")
        return pd.read_excel(p, dtype=str)
    except Exception as e:
        raise ValueError(f"No se pudo leer '{p.name}'. Detalle: {e}") from e


def parse_fecha_robusta(s: pd.Series) -> pd.Series:
    """
    Parser tolerante de fechas.
    Acepta: serial Excel, datetime, ISO YYYY-MM-DD(/hh:mm:ss),
            DD/MM/YYYY, DD/MM/YY, variantes con/sin hora.
    Nunca lanza; devuelve NaT en inválidos.
    """
    out = pd.Series(pd.NaT, index=s.index, dtype="datetime64[ns]")

    # A) datetime-like
    mask_dtlike = s.apply(lambda x: isinstance(x, (pd.Timestamp, dt.datetime, dt.date)))
    if mask_dtlike.any():
        out.loc[mask_dtlike] = pd.to_datetime(s[mask_dtlike], errors="coerce")

    # B) serial Excel
    numeric = pd.to_numeric(s, errors="coerce")
    mask_num = numeric.notna()
    if mask_num.any():
        out.loc[mask_num] = pd.to_datetime(numeric[mask_num], unit="D", origin="1899-12-30", errors="coerce")

    # C) strings
    mask_str = s.notna() & ~mask_dtlike & ~mask_num
    if mask_str.any():
        st = s[mask_str].astype(str).str.strip()
        
        # --- INICIO DE LA CORRECCIÓN ---
        # 1. Quitar la hora PRIMERO (antes de que el espacio se convierta en '/')
        st = st.str.replace(r"\s+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(AM|PM|am|pm)?", "", regex=True)
        
        # 2. Normalizar separadores de fecha (punto y guión) a /
        #    (Importante: Ya NO reemplazamos el espacio)
        st = st.str.replace(r"[.\-]", "/", regex=True) 
        
        # 3. Limpiar cualquier espacio sobrante
        st = st.str.replace(r"\s+", " ", regex=True).str.strip()
        # --- FIN DE LA CORRECCIÓN ---

        # ISO: YYYY/MM/DD
        iso_mask = st.str.match(r"^\d{4}/\d{1,2}/\d{1,2}$", na=False)
        if iso_mask.any():
            out.loc[iso_mask.index[iso_mask]] = pd.to_datetime(st[iso_mask], format="%Y/%m/%d", errors="coerce")

        # DD/MM/YYYY y DD/MM/YY
        rest = st[~iso_mask]
        parsed = pd.to_datetime(rest, format="%d/%m/%Y", errors="coerce", dayfirst=True)
        miss = parsed.isna()
        if miss.any():
            parsed2 = pd.to_datetime(rest[miss], format="%d/%m/%y", errors="coerce", dayfirst=True)
            parsed.loc[miss] = parsed2

        # Fallback inferido
        still = parsed.isna()
        if still.any():
            parsed3 = pd.to_datetime(rest[still], errors="coerce", dayfirst=True)
            parsed.loc[still] = parsed3

        out.loc[rest.index] = out.loc[rest.index].fillna(parsed)

    return out