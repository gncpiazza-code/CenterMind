# -*- coding: utf-8 -*-
"""
services/ventas_detalle_ingestion_service.py
============================================
Parsea el Excel DETALLADO de Comprobantes de Ventas (CHESS ERP) y lo persiste
en ventas_detalle_v2 — una fila por artículo por comprobante.

Estructura de la tabla ventas_detalle_v2 (ver migration SQL):
  id_distribuidor, fecha, vendedor, comprobante, numero,
  codigo_articulo, descripcion_articulo, bultos, monto_linea
  UNIQUE (id_distribuidor, fecha, comprobante, numero, codigo_articulo)
"""

import io
import logging
import re
import unicodedata

import numpy as np
import pandas as pd

from db import sb
from services.ventas_ingestion_service import TENANT_DIST_MAP

logger = logging.getLogger("VentasDetalleIngestion")

COL_SERIE = "Serie \\ Punto de venta"


def _norm(s) -> str:
    if not s or not isinstance(s, str):
        return ""
    s = "".join(ch for ch in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(ch))
    s = s.lower().strip()
    s = re.sub(r"[\W_]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _safe_str(val) -> str | None:
    if val is None:
        return None
    if isinstance(val, float) and np.isnan(val):
        return None
    s = str(val).strip()
    return s if s and s.lower() not in ("nan", "none", "") else None


def _safe_float(val) -> float:
    try:
        f = float(val)
        return 0.0 if (isinstance(f, float) and np.isnan(f)) else f
    except Exception:
        return 0.0


def _parse_detallado(file_bytes: bytes) -> list[dict]:
    """
    Parsea el Excel detallado de CHESS y devuelve filas normalizadas.
    Una fila por artículo por comprobante.
    """
    try:
        df = pd.read_excel(
            io.BytesIO(file_bytes),
            sheet_name="Datos",
            header=0,
            engine="openpyxl",
            dtype=str,
        )
    except Exception:
        df = pd.read_excel(io.BytesIO(file_bytes), header=0, engine="openpyxl", dtype=str)

    df.columns = [str(c).strip() for c in df.columns]

    # Normalizar nombre de columna serie (el backslash puede variar según la versión del Excel)
    for c in list(df.columns):
        if c != COL_SERIE and ("punto de venta" in c.lower() or (c.startswith("Serie") and "\\" in c)):
            df = df.rename(columns={c: COL_SERIE})
            break

    # Detectar columna de fecha
    fecha_col = None
    for candidate in ("Fecha Comprobante", "fecha comprobante", "Fecha", "fecha"):
        if candidate in df.columns:
            fecha_col = candidate
            break

    rows: list[dict] = []
    for _, r in df.iterrows():
        # Excluir anulados
        anulado = _norm(str(r.get("Anulado", "") or ""))
        if anulado == "si":
            continue

        # Parsear fecha
        fecha_raw = r.get(fecha_col) if fecha_col else None
        if fecha_raw is None:
            continue
        try:
            fecha = pd.to_datetime(str(fecha_raw), dayfirst=True, errors="coerce")
            if pd.isna(fecha):
                continue
            fecha_iso = fecha.strftime("%Y-%m-%d")
        except Exception:
            continue

        comprobante = _safe_str(r.get("Comprobante"))
        numero = _safe_str(r.get("Numero"))
        if not comprobante or not numero:
            continue

        # Vendedor: preferir Descripcion Vendedor (nombre), fallback al código
        vendedor = _safe_str(r.get("Descripcion Vendedor")) or _safe_str(r.get("Vendedor"))

        codigo_articulo = _safe_str(r.get("Codigo de Articulo")) or ""
        descripcion_articulo = _safe_str(r.get("Descripcion de Articulo"))
        bultos = _safe_float(r.get("Bultos Total"))
        monto_linea = _safe_float(r.get("Subtotal Final"))

        rows.append({
            "fecha": fecha_iso,
            "vendedor": vendedor,
            "comprobante": comprobante,
            "numero": numero,
            "codigo_articulo": codigo_articulo,
            "descripcion_articulo": descripcion_articulo,
            "bultos": bultos,
            "monto_linea": monto_linea,
        })

    return rows


def ingest_detallado(tenant_id: str, file_bytes: bytes) -> dict:
    """
    Parsea el Excel detallado y upserta en ventas_detalle_v2.
    Devuelve dict con registros, errores, id_distribuidor.
    """
    dist_id = TENANT_DIST_MAP.get(tenant_id)
    if not dist_id:
        raise ValueError(f"tenant_id desconocido: {tenant_id}")

    logger.info(f"[VentasDetalle] Ingesta detallado para {tenant_id} (dist {dist_id})")

    filas = _parse_detallado(file_bytes)
    logger.info(f"[VentasDetalle] Filas parseadas: {len(filas)}")

    if not filas:
        return {"registros": 0, "errores": 0, "id_distribuidor": dist_id}

    # Colapsar posibles duplicados por clave única dentro del mismo archivo/lote.
    # Si una misma (fecha, comprobante, numero, codigo_articulo) aparece varias veces,
    # sumamos métricas numéricas para evitar error 21000 en ON CONFLICT DO UPDATE.
    merged: dict[tuple[str, str, str, str], dict] = {}
    for f in filas:
        key = (
            str(f.get("fecha") or ""),
            str(f.get("comprobante") or ""),
            str(f.get("numero") or ""),
            str(f.get("codigo_articulo") or ""),
        )
        cur = merged.get(key)
        if cur is None:
            merged[key] = dict(f)
            continue

        cur["bultos"] = float(cur.get("bultos") or 0.0) + float(f.get("bultos") or 0.0)
        cur["monto_linea"] = float(cur.get("monto_linea") or 0.0) + float(f.get("monto_linea") or 0.0)
        if not cur.get("descripcion_articulo") and f.get("descripcion_articulo"):
            cur["descripcion_articulo"] = f.get("descripcion_articulo")
        if not cur.get("vendedor") and f.get("vendedor"):
            cur["vendedor"] = f.get("vendedor")

    registros = [{"id_distribuidor": dist_id, **f} for f in merged.values()]
    logger.info(
        f"[VentasDetalle] Filas normalizadas para upsert: {len(registros)} "
        f"(original={len(filas)}, colapsadas={len(filas)-len(registros)})"
    )

    BATCH = 500
    upserted = 0
    errores = 0
    for i in range(0, len(registros), BATCH):
        lote = registros[i : i + BATCH]
        try:
            sb.table("ventas_detalle_v2").upsert(
                lote,
                on_conflict="id_distribuidor,fecha,comprobante,numero,codigo_articulo",
            ).execute()
            upserted += len(lote)
        except Exception as e:
            logger.error(f"[VentasDetalle] Error upsert lote {i}-{i + BATCH}: {e}")
            errores += len(lote)

    logger.info(f"[VentasDetalle] Upserted: {upserted}, errores: {errores}")

    return {
        "registros": upserted,
        "errores": errores,
        "id_distribuidor": dist_id,
    }
