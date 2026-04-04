# -*- coding: utf-8 -*-
"""
services/ventas_ingestion_service.py
=====================================
Recibe el Excel de Comprobantes de Ventas (resumido o detallado) descargado
por el motor RPA de CHESS y lo persiste en la tabla ventas_v2 de Supabase.

Flujo:
  1. Parsear el Excel con la lógica de ventas_parser
  2. Resolver id_distribuidor desde el tenant_id
  3. Para cada fila: intentar vincular id_cliente via nombre en vendedores_v2/clientes_pdv_v2
  4. Upsert en ventas_v2 (clave: id_distribuidor + fecha + numero + comprobante)
  5. Actualizar fecha_ultima_compra en clientes_pdv_v2 (si id_cliente resuelto)
  6. Registrar en motor_runs
"""

import io
import logging
import unicodedata
import re
import pandas as pd
import numpy as np
from datetime import datetime, date
from typing import Optional
from db import sb

logger = logging.getLogger("VentasIngestion")

# Mapeo tenant_id (RPA) → id_distribuidor en Supabase
TENANT_DIST_MAP = {
    "tabaco": 3,
    "aloma":  4,
    "liver":  5,
    "real":   2,
}

# ─── helpers ──────────────────────────────────────────────────────────────────

def _norm(s) -> str:
    if not s or not isinstance(s, str):
        return ""
    s = "".join(ch for ch in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(ch))
    s = s.lower().strip()
    s = re.sub(r"[\W_]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _safe(val):
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return val


# ─── parser inline (evita importar desde RPA) ─────────────────────────────────

_CANONICAL = {
    "desc_comprobante":  ["descripcion comprobante", "comprobante"],
    "numero":            ["numero", "nro"],
    "anulado":           ["anulado", "estado"],
    "desc_sucursal":     ["descripcion sucursal", "sucursal"],
    "desc_vendedor":     ["descripcion vendedor", "descripcion vendedor", "desc vendedor", "vendedor"],
    "razon_social":      ["razon social", "nombre"],
    "cliente":           ["cliente", "codigo cliente", "cod cliente"],
    "desc_cond_pago":    ["descripcion condicion de pago", "condicion de pago", "cond pago"],
    "desc_canal_mkt":    ["descripcion canal mkt", "canal marketing", "canal"],
    "desc_subcanal_mkt": ["descripcion subcanal mkt", "subcanal marketing", "subcanal"],
    "subtotal":          ["subtotal"],
    "subtotal_final":    ["subtotal final", "importe", "total", "monto"],
    "fecha_raw":         ["fecha comprobante", "fecha cobro", "fecha"],
}


def _first_match(cols, patterns):
    ncols = {c: _norm(c) for c in cols}
    npats = [_norm(p) for p in patterns]
    for p in npats:
        for c, nc in ncols.items():
            if p == nc:
                return c
    for p in npats:
        for c, nc in ncols.items():
            if p in nc:
                return c
    return None


def _parse_excel(file_bytes: bytes) -> list[dict]:
    df = pd.read_excel(io.BytesIO(file_bytes), dtype=str)
    mapping = {k: _first_match(list(df.columns), pats) for k, pats in _CANONICAL.items()}
    df.rename(columns={v: k for k, v in mapping.items() if v}, inplace=True)
    for k in _CANONICAL:
        if k not in df.columns:
            df[k] = np.nan

    # Fecha
    df["fecha"] = pd.to_datetime(df["fecha_raw"], errors="coerce", dayfirst=True).dt.strftime("%Y-%m-%d")
    df = df.dropna(subset=["fecha"])

    # Importes
    df["subtotal"]       = pd.to_numeric(df["subtotal"],       errors="coerce").fillna(0.0)
    df["subtotal_final"] = pd.to_numeric(df["subtotal_final"], errors="coerce").fillna(0.0)

    # Normalizar condición pago
    cond = df["desc_cond_pago"].astype(object).replace({
        "nan": None, "NaN": None, "None": None, "": None,
        "0": "CONTADO", "0.0": "CONTADO", "1": "CTA CTE", "1.0": "CTA CTE",
    })
    df["desc_cond_pago"] = cond
    df["norm_cond_pago"] = df["desc_cond_pago"].astype(str).apply(_norm)
    df["norm_comprobante"] = df["desc_comprobante"].astype(str).apply(_norm)

    # Anulado / devolución
    anulado_norm = df["anulado"].astype(str).apply(_norm)
    df["es_anulado"]    = anulado_norm.isin({"si", "anulado", "true", "1"})
    df["es_devolucion"] = df["norm_comprobante"].str.contains("devolucion", na=False)
    df["excluida"]      = df["es_anulado"] | df["es_devolucion"]

    # Tipo operación
    es_recibo  = (~df["excluida"]) & (df["norm_comprobante"] == "recibo")
    es_contado = (~df["excluida"]) & (~es_recibo) & (df["norm_cond_pago"] == "contado")
    es_ctacte  = (~df["excluida"]) & (~es_recibo) & (df["norm_cond_pago"] == "cta cte")
    df["tipo_operacion"] = np.select(
        [df["excluida"], es_recibo, es_contado, es_ctacte],
        ["EXCLUIDA",     "RECIBO",  "CONTADO",  "CTA CTE"],
        default="OTRO",
    )

    df["monto_total"]    = df["subtotal_final"]
    df["monto_contado"]  = np.where(es_contado, df["subtotal_final"], 0.0)
    df["monto_ctacte"]   = np.where(es_ctacte,  df["subtotal_final"], 0.0)
    df["monto_recibo"]   = np.where(es_recibo,  df["subtotal_final"], 0.0)
    df["monto_recaudado"]= df["monto_contado"] + df["monto_recibo"]

    df["cliente_str"]  = df["razon_social"].fillna(df["cliente"]).fillna("").astype(str).str.strip()
    df["vendedor_str"] = df["desc_vendedor"].fillna("").astype(str).str.strip()
    df["sucursal_str"] = df["desc_sucursal"].fillna("").astype(str).str.strip()
    df["numero_str"]   = df["numero"].fillna("").astype(str).str.strip()

    df = df.replace({np.nan: None})
    return df.to_dict(orient="records")


# ─── resolución de id_cliente ──────────────────────────────────────────────────

def _build_cliente_map(dist_id: int) -> dict[str, int]:
    """
    Carga nombre_fantasia y nombre_razon_social de clientes_pdv_v2 para el dist.
    Devuelve {nombre_normalizado: id_cliente}.
    """
    res = sb.table("clientes_pdv_v2") \
        .select("id_cliente, nombre_fantasia, nombre_razon_social") \
        .eq("id_distribuidor", dist_id) \
        .execute()
    mapa = {}
    for row in (res.data or []):
        for campo in ("nombre_fantasia", "nombre_razon_social"):
            v = row.get(campo) or ""
            k = _norm(v)
            if k:
                mapa[k] = row["id_cliente"]
    return mapa


# ─── función principal ─────────────────────────────────────────────────────────

def ingest(tenant_id: str, tipo: str, file_bytes: bytes) -> dict:
    """
    Parsea el Excel de ventas y upserta en ventas_v2.

    Args:
        tenant_id  : "tabaco" | "aloma" | "liver" | "real"
        tipo       : "resumido" | "detallado"
        file_bytes : contenido del Excel

    Returns:
        dict con registros, vinculados, actualizados, errores
    """
    dist_id = TENANT_DIST_MAP.get(tenant_id)
    if not dist_id:
        raise ValueError(f"tenant_id desconocido: {tenant_id}")

    logger.info(f"[Ventas] Ingesta {tipo} para {tenant_id} (dist {dist_id})")

    # 1. Parsear
    filas = _parse_excel(file_bytes)
    logger.info(f"[Ventas] Filas parseadas: {len(filas)}")

    # 2. Mapa de clientes para vinculación por nombre
    cliente_map = _build_cliente_map(dist_id)

    # 3. Construir registros para upsert
    registros = []
    ids_cliente_actualizados: dict[int, str] = {}  # id_cliente → fecha más reciente

    for f in filas:
        fecha = f.get("fecha")
        if not fecha:
            continue

        # Intentar vincular cliente
        nombre_norm = _norm(f.get("cliente_str", ""))
        id_cliente = cliente_map.get(nombre_norm)

        # Acumular fecha más reciente por cliente (para actualizar fecha_ultima_compra)
        if id_cliente and f.get("tipo_operacion") not in ("EXCLUIDA", "DEVOLUCION"):
            prev = ids_cliente_actualizados.get(id_cliente)
            if not prev or fecha > prev:
                ids_cliente_actualizados[id_cliente] = fecha

        registros.append({
            "id_distribuidor":  dist_id,
            "tenant_id":        tenant_id,
            "tipo_archivo":     tipo,
            "fecha":            fecha,
            "sucursal":         _safe(f.get("sucursal_str")) or None,
            "vendedor":         _safe(f.get("vendedor_str")) or None,
            "cliente":          _safe(f.get("cliente_str")) or None,
            "id_cliente":       id_cliente,
            "canal":            _safe(f.get("desc_canal_mkt")) or None,
            "subcanal":         _safe(f.get("desc_subcanal_mkt")) or None,
            "comprobante":      _safe(f.get("desc_comprobante")) or None,
            "numero":           _safe(f.get("numero_str")) or None,
            "tipo_operacion":   f.get("tipo_operacion", "OTRO"),
            "es_anulado":       bool(f.get("es_anulado", False)),
            "es_devolucion":    bool(f.get("es_devolucion", False)),
            "monto_total":      float(f.get("monto_total") or 0),
            "monto_contado":    float(f.get("monto_contado") or 0),
            "monto_ctacte":     float(f.get("monto_ctacte") or 0),
            "monto_recibo":     float(f.get("monto_recibo") or 0),
            "monto_recaudado":  float(f.get("monto_recaudado") or 0),
        })

    # 4. Upsert en ventas_v2 (en lotes de 500)
    upserted = 0
    errores = 0
    BATCH = 500
    for i in range(0, len(registros), BATCH):
        lote = registros[i:i+BATCH]
        try:
            sb.table("ventas_v2").upsert(
                lote,
                on_conflict="id_distribuidor,fecha,numero,comprobante"
            ).execute()
            upserted += len(lote)
        except Exception as e:
            logger.error(f"[Ventas] Error upsert lote {i}-{i+BATCH}: {e}")
            errores += len(lote)

    logger.info(f"[Ventas] Upserted: {upserted}, errores: {errores}")

    # 5. Actualizar fecha_ultima_compra en clientes_pdv_v2
    actualizados = 0
    for id_cliente, fecha_str in ids_cliente_actualizados.items():
        try:
            sb.table("clientes_pdv_v2") \
                .update({"fecha_ultima_compra": fecha_str}) \
                .eq("id_cliente", id_cliente) \
                .lt("fecha_ultima_compra", fecha_str) \
                .execute()
            actualizados += 1
        except Exception as e:
            logger.warning(f"[Ventas] No se pudo actualizar cliente {id_cliente}: {e}")

    logger.info(f"[Ventas] fecha_ultima_compra actualizada: {actualizados} clientes")

    # Actualizar progreso de objetivos activos
    try:
        from services.objetivos_watcher_service import objetivos_watcher
        objetivos_watcher.run_watcher(dist_id)
    except Exception as e_watch:
        logger.warning(f"[Ventas] Watcher de objetivos omitido: {e_watch}")

    return {
        "registros":   upserted,
        "vinculados":  len(ids_cliente_actualizados),
        "actualizados": actualizados,
        "errores":     errores,
        "id_distribuidor": dist_id,
    }
