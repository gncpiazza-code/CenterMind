# -*- coding: utf-8 -*-
"""
PadronIngestionService — Fase 1.2
==================================
Ingesta atómica del Padrón de Clientes.

Flujo: un Excel (el Padrón) → jerarquía limpia en Supabase
  distribuidor → sucursales → vendedores → rutas → clientes_pdv

Características:
- Idempotente: correr N veces con el mismo archivo produce el mismo resultado
- Registra cada ejecución en motor_runs (ok / error)
- Rollback lógico: si falla, el run queda marcado como 'error' con el mensaje
- No modifica exhibiciones ni ninguna tabla legacy
"""

from __future__ import annotations

import io
import logging
import unicodedata
import re
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from db import sb

logger = logging.getLogger("PadronIngestion")


# ─── Configuración de filtros por distribuidor ───────────────────────────────
# Para un distribuidor dado, sólo se ingerirán las filas cuya sucursal ERP
# (id numérico o nombre) esté en la lista ALLOWED.
# Formato: { id_distribuidor: { "ids": [...], "nombres": [...] } }
# Los nombres se comparan normalizados (sin acentos, minúsculas).
# Si un distribuidor NO aparece aquí, se toman TODAS sus sucursales.

SUCURSAL_FILTER: dict[int, dict] = {
    2: {  # Real Tabacalera de Santiago S.A. (id_distribuidor=2)
        "ids":     ["8"],             # id_sucursal_erp numérico como string
        "nombres": ["uequin rodrigo"],  # nombre normalizado (sin acentos, minúsculas)
    },
}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    """Normaliza texto: quita acentos, minúsculas, colapsa espacios."""
    if not s or not isinstance(s, str):
        return ""
    s = "".join(
        ch for ch in unicodedata.normalize("NFKD", s)
        if not unicodedata.combining(ch)
    )
    return re.sub(r"\s+", " ", s.lower().strip())


def _flexible_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    """Devuelve el nombre de columna del DataFrame que coincida con algún candidato."""
    norm_cols = {c: _norm(c) for c in df.columns}
    norm_cands = [_norm(c) for c in candidates]
    # Exacta primero
    for pat in norm_cands:
        for col, nc in norm_cols.items():
            if pat == nc:
                return col
    # Parcial
    for pat in norm_cands:
        for col, nc in norm_cols.items():
            if pat in nc:
                return col
    return None


def _safe_str(val: Any, default: str = "") -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return default
    s = str(val).strip()
    return default if s.lower() in ("nan", "none", "null", "") else s


def _safe_date(val: Any) -> str | None:
    try:
        dt = pd.to_datetime(val, dayfirst=True, errors="coerce")
        if pd.notna(dt):
            return dt.strftime("%Y-%m-%d")
    except Exception:
        pass
    return None


_DIA_KEYS = [
    ("dia_lunes",     "Lunes"),
    ("dia_martes",    "Martes"),
    ("dia_miercoles", "Miércoles"),
    ("dia_jueves",    "Jueves"),
    ("dia_viernes",   "Viernes"),
    ("dia_sabado",    "Sábado"),
    ("dia_domingo",   "Domingo"),
]

def _detect_dia(row: Any, cols: dict) -> str:
    """Devuelve el día de la semana leyendo las columnas booleanas del Excel."""
    for key, nombre in _DIA_KEYS:
        col = cols.get(key)
        if col:
            val = _safe_str(row.get(col), "").strip().upper()
            if val and val not in ("0", "NO", "N", "NAN", "FALSE", ""):
                return nombre
    return "Variable"


# ─── Servicio ─────────────────────────────────────────────────────────────────

class PadronIngestionService:
    """
    Ingesta el Padrón de Clientes y actualiza la jerarquía limpia en Supabase.

    Uso:
        service = PadronIngestionService()
        result = service.ingest(file_bytes, dist_id)
        # result = { sucursales, vendedores, rutas, clientes, run_id }
    """

    # ── motor_runs ────────────────────────────────────────────────────────────

    def _start_run(self, dist_id: int) -> int:
        res = sb.table("motor_runs").insert({
            "motor": "padron",
            "dist_id": dist_id,
            "estado": "en_curso",
            "iniciado_en": datetime.now(timezone.utc).isoformat(),
        }).execute()
        return res.data[0]["id"]

    def _finish_run(
        self,
        run_id: int,
        estado: str,
        registros: dict | None = None,
        error_msg: str | None = None,
    ) -> None:
        sb.table("motor_runs").update({
            "estado": estado,
            "finalizado_en": datetime.now(timezone.utc).isoformat(),
            "registros": registros,
            "error_msg": error_msg,
        }).eq("id", run_id).execute()

    # ── Parseo del Excel ──────────────────────────────────────────────────────

    def _parse_excel(self, file_bytes: bytes) -> pd.DataFrame:
        """Lee el Excel del Padrón con tolerancia a distintos formatos."""
        buf = io.BytesIO(file_bytes)
        try:
            # engine='openpyxl' explícito; keep_default_na=False evita que celdas
            # vacías detengan la lectura en algunas versiones de openpyxl.
            df = pd.read_excel(buf, dtype=str, engine="openpyxl", keep_default_na=False)
        except Exception as exc:
            logger.warning(f"[Padrón] Fallo lectura XLSX ({exc}), intentando CSV...")
            buf.seek(0)
            df = pd.read_csv(buf, sep=None, engine="python", dtype=str, encoding="latin1")
        df.columns = [str(c).strip() for c in df.columns]
        # Eliminar filas completamente vacías (son frecuentes en exports de ERP)
        df = df.replace("", float("nan"))
        df = df.dropna(how="all")
        df = df.fillna("")
        logger.info(f"[Padrón] Excel parseado: {len(df)} filas útiles, {len(df.columns)} columnas")
        logger.info(f"[Padrón] Columnas: {list(df.columns)}")
        return df

    def _detect_columns(self, df: pd.DataFrame) -> dict[str, str | None]:
        """Detecta columnas relevantes del Padrón con mapeo flexible.
        Las claves de este dict son nombres lógicos usados internamente;
        los nombres de columna de Supabase se aplican en _sync_clientes.

        Convención ERP Aloma:
          'vendedor'   → código numérico ERP  (e.g. 1010)  → id_vendedor_erp en DB
          'd_vendedor' → nombre visible        (e.g. "10-MARCHE FERNANDO") → nombre_erp en DB
        """
        cols = {
            "id_cliente":       _flexible_col(df, ["idcliente", "id_cliente", "codi_cliente", "cliente_id", "numero_cliente_local"]),
            "nombre_cliente":   _flexible_col(df, ["nomcli", "nombre", "nombre_cliente", "razon_social"]),
            "fantasia":         _flexible_col(df, ["fantacli", "fantasia", "nombre_fantasia"]),
            # Nombre del vendedor para mostrar (d_vendedor tiene prioridad sobre vendedor)
            "vendedor_nombre":  _flexible_col(df, ["d_vendedor", "dsvendedor", "vendedor_nombre", "nombre_vendedor"]),
            # Código ERP del vendedor (número) para deduplicación estable
            "vendedor_erp_cod": _flexible_col(df, ["vendedor", "id_vendedor_erp", "codi_vendedor"]),
            "sucursal":         _flexible_col(df, ["dssucur", "sucursal", "sucursal_nombre", "nombre_sucursal"]),
            "id_sucursal":      _flexible_col(df, ["idsucur", "id_sucursal", "sucursal_id"]),
            "ruta":             _flexible_col(df, ["ruta", "nro_ruta", "id_ruta", "ruta_erp"]),
            # Coordenadas — claves internas, se escriben como latitud/longitud en Supabase
            "latitud":          _flexible_col(df, ["ycoord", "lat", "latitud"]),
            "longitud":         _flexible_col(df, ["xcoord", "lon", "longitud"]),
            # Dirección — se escribe como domicilio en Supabase
            "domicilio":        _flexible_col(df, ["domicli", "direccion", "domicilio"]),
            "localidad":        _flexible_col(df, ["descloca", "localidad"]),
            "provincia":        _flexible_col(df, ["desprovincia", "provincia"]),
            "canal":            _flexible_col(df, ["descanal", "canal", "canal_venta"]),
            # Fecha última compra y fecha de alta
            "fecha_ultima_compra": _flexible_col(df, ["fecha_ultima_compra", "fec_ult", "fecultcom", "ultima_compra"]),
            "fecha_alta":          _flexible_col(df, ["fecalta", "fecha_alta", "fec_alta"]),
            # Columnas de día de visita (booleanas)
            "dia_lunes":     _flexible_col(df, ["lunes"]),
            "dia_martes":    _flexible_col(df, ["martes"]),
            "dia_miercoles": _flexible_col(df, ["miercoles"]),
            "dia_jueves":    _flexible_col(df, ["jueves"]),
            "dia_viernes":   _flexible_col(df, ["viernes"]),
            "dia_sabado":    _flexible_col(df, ["sabado"]),
            "dia_domingo":   _flexible_col(df, ["domingo"]),
        }
        logger.info(f"[Padrón] Mapeo columnas: { {k: v for k, v in cols.items() if v} }")
        missing = [k for k, v in cols.items() if v is None]
        if missing:
            logger.warning(f"[Padrón] Columnas no encontradas: {missing}")
        return cols

    # ── Paso 1: Sucursales ────────────────────────────────────────────────────

    def _sync_sucursales(
        self, df: pd.DataFrame, cols: dict, dist_id: int
    ) -> tuple[int, dict[str, int]]:
        """
        Upsert de sucursales únicas.
        Devuelve (count, {id_sucursal_erp: id_sucursal}).
        """
        # Extraer únicas del Excel
        unique: dict[str, str] = {}  # erp_id → nombre
        for _, row in df.iterrows():
            erp_id = _safe_str(row.get(cols["id_sucursal"]) if cols.get("id_sucursal") else None, "")
            # Limpiar ".0" de floats convertidos a str (ej. "1.0" → "1")
            if erp_id.endswith(".0"):
                erp_id = erp_id[:-2]
            nombre = _safe_str(row.get(cols["sucursal"]) if cols.get("sucursal") else None, "CASA CENTRAL")
            if not erp_id:
                erp_id = _norm(nombre).replace(" ", "_") or "suc_0"
            if erp_id not in unique:
                unique[erp_id] = nombre.upper()

        logger.info(f"[Padrón] Sucursales únicas en Excel: {len(unique)} → {list(unique.keys())}")

        if not unique:
            return 0, {}

        # Fetch existentes
        existing_res = sb.table("sucursales_v2").select("id_sucursal, id_sucursal_erp, nombre_erp") \
            .eq("id_distribuidor", dist_id).execute()
        existing: dict[str, dict] = {
            r["id_sucursal_erp"]: r for r in (existing_res.data or [])
            if r.get("id_sucursal_erp")
        }

        to_insert = []
        to_update = []
        for erp_id, nombre in unique.items():
            if erp_id in existing:
                if existing[erp_id]["nombre_erp"] != nombre:
                    to_update.append({"id_sucursal": existing[erp_id]["id_sucursal"], "nombre_erp": nombre})
            else:
                to_insert.append({
                    "id_distribuidor": dist_id,
                    "id_sucursal_erp": erp_id,
                    "nombre_erp": nombre,
                })

        # Insert nuevas
        if to_insert:
            sb.table("sucursales_v2").insert(to_insert).execute()

        # Update nombres cambiados
        for upd in to_update:
            sb.table("sucursales_v2").update({"nombre_erp": upd["nombre_erp"]}) \
                .eq("id_sucursal", upd["id_sucursal"]).execute()

        # Fetch final para construir mapping
        final_res = sb.table("sucursales_v2").select("id_sucursal, id_sucursal_erp") \
            .eq("id_distribuidor", dist_id).execute()
        mapping = {
            r["id_sucursal_erp"]: r["id_sucursal"]
            for r in (final_res.data or [])
            if r.get("id_sucursal_erp")
        }

        count = len(to_insert) + len(to_update)
        logger.info(f"[Padrón] Sucursales: {len(unique)} totales, {len(to_insert)} nuevas, {len(to_update)} actualizadas")
        return len(unique), mapping

    # ── Paso 2: Vendedores ────────────────────────────────────────────────────

    def _sync_vendedores(
        self, df: pd.DataFrame, cols: dict, dist_id: int, suc_map: dict[str, int]
    ) -> tuple[int, dict[tuple, int]]:
        """
        Upsert de vendedores únicos por sucursal.
        Clave de deduplicación: (id_vendedor_erp, erp_suc) — el código numérico ERP es estable.
        Si no hay código ERP disponible, se usa el nombre como fallback.
        Devuelve (count, {(vend_key, id_sucursal_erp): id_vendedor}).
        """
        # unique: { (vend_key, erp_suc): nombre_display }
        # vend_key = código ERP si existe, sino nombre uppercased
        unique: dict[tuple[str, str], str] = {}
        for _, row in df.iterrows():
            # Nombre para mostrar
            nombre = _safe_str(row.get(cols["vendedor_nombre"]) if cols.get("vendedor_nombre") else None, "").upper()
            # Código ERP para deduplicación
            cod = _safe_str(row.get(cols["vendedor_erp_cod"]) if cols.get("vendedor_erp_cod") else None, "")
            # Limpiar ".0" de los floats convertidos a str (ej. "1010.0" → "1010")
            if cod.endswith(".0"):
                cod = cod[:-2]
            vend_key = cod if cod else (nombre or "SIN VENDEDOR")
            if not nombre:
                nombre = vend_key

            erp_suc = _safe_str(row.get(cols["id_sucursal"]) if cols.get("id_sucursal") else None, "")
            if erp_suc.endswith(".0"):
                erp_suc = erp_suc[:-2]
            if not erp_suc:
                suc_nombre = _safe_str(row.get(cols["sucursal"]) if cols.get("sucursal") else None, "CASA CENTRAL")
                erp_suc = _norm(suc_nombre).replace(" ", "_") or "suc_0"

            if (vend_key, erp_suc) not in unique:
                unique[(vend_key, erp_suc)] = nombre

        logger.info(f"[Padrón] Vendedores únicos en Excel: {len(unique)}")
        if not unique:
            return 0, {}

        # Fetch existentes por id_vendedor_erp (código)
        existing_res = sb.table("vendedores_v2") \
            .select("id_vendedor, id_vendedor_erp, nombre_erp, id_sucursal") \
            .eq("id_distribuidor", dist_id).execute()
        # key: (id_vendedor_erp, id_sucursal)
        existing_by_erp: dict[tuple, int] = {
            (str(r["id_vendedor_erp"]), r["id_sucursal"]): r["id_vendedor"]
            for r in (existing_res.data or [])
            if r.get("id_vendedor_erp") is not None and r.get("id_sucursal")
        }

        to_insert = []
        skipped_suc = 0
        for (vend_key, erp_suc), nombre in unique.items():
            id_sucursal = suc_map.get(erp_suc)
            if not id_sucursal:
                skipped_suc += 1
                logger.debug(f"[Padrón] Vendedor '{nombre}' (key={vend_key}) sin sucursal mapeada (erp_suc='{erp_suc}'), saltando")
                continue
            if (vend_key, id_sucursal) not in existing_by_erp:
                to_insert.append({
                    "id_distribuidor": dist_id,
                    "id_sucursal": id_sucursal,
                    "nombre_erp": nombre,
                    "id_vendedor_erp": vend_key,
                })

        if skipped_suc:
            logger.warning(f"[Padrón] Vendedores saltados por sucursal no mapeada: {skipped_suc}")

        if to_insert:
            # Insertar en lotes para evitar límites de URL/body
            BATCH = 200
            for i in range(0, len(to_insert), BATCH):
                sb.table("vendedores_v2").insert(to_insert[i:i + BATCH]).execute()
            logger.info(f"[Padrón] Vendedores insertados: {len(to_insert)}")

        # Fetch final para construir el mapping
        final_res = sb.table("vendedores_v2") \
            .select("id_vendedor, id_vendedor_erp, nombre_erp, id_sucursal") \
            .eq("id_distribuidor", dist_id).execute()
        suc_map_inv = {v: k for k, v in suc_map.items()}
        mapping: dict[tuple[str, str], int] = {}
        for r in (final_res.data or []):
            if not r.get("id_sucursal"):
                continue
            erp_suc_rev = suc_map_inv.get(r["id_sucursal"], "")
            vk = str(r["id_vendedor_erp"]) if r.get("id_vendedor_erp") is not None else (r.get("nombre_erp") or "")
            if vk:
                mapping[(vk, erp_suc_rev)] = r["id_vendedor"]

        logger.info(f"[Padrón] Vendedores: {len(unique)} en Excel, {len(to_insert)} nuevos, {len(mapping)} en mapping final")
        return len(unique), mapping

    # ── Paso 3: Rutas ─────────────────────────────────────────────────────────

    def _sync_rutas(
        self, df: pd.DataFrame, cols: dict, dist_id: int,
        vend_map: dict[tuple, int], suc_map: dict[str, int]
    ) -> tuple[int, dict[tuple, int]]:
        """
        Upsert de rutas únicas por vendedor.
        Devuelve (count, {(id_vendedor, ruta_erp): id_ruta}).
        """
        # Extraer únicos: (vend_key, erp_suc, ruta_code) → dia_semana
        # Primer paso: construir el mapa de día por ruta desde la primera fila encontrada
        unique: dict[tuple[str, str, str], None] = {}
        ruta_dia: dict[tuple[str, str, str], str] = {}
        for _, row in df.iterrows():
            cod = _safe_str(row.get(cols["vendedor_erp_cod"]) if cols.get("vendedor_erp_cod") else None, "")
            if cod.endswith(".0"):
                cod = cod[:-2]
            nombre_vend = _safe_str(row.get(cols["vendedor_nombre"]) if cols.get("vendedor_nombre") else None, "").upper()
            vend_key = cod if cod else (nombre_vend or "SIN VENDEDOR")

            erp_suc = _safe_str(row.get(cols["id_sucursal"]) if cols.get("id_sucursal") else None, "")
            if erp_suc.endswith(".0"):
                erp_suc = erp_suc[:-2]
            if not erp_suc:
                suc_nombre = _safe_str(row.get(cols["sucursal"]) if cols.get("sucursal") else None, "CASA CENTRAL")
                erp_suc = _norm(suc_nombre).replace(" ", "_") or "suc_0"

            ruta_code = _safe_str(row.get(cols["ruta"]) if cols.get("ruta") else None, "R00").upper()
            if ruta_code.endswith(".0"):
                ruta_code = ruta_code[:-2]

            key = (vend_key, erp_suc, ruta_code)
            unique[key] = None
            if key not in ruta_dia:
                ruta_dia[key] = _detect_dia(row, cols)

        logger.info(f"[Padrón] Rutas únicas en Excel: {len(unique)}")
        if not unique:
            return 0, {}

        # Upsert rutas (insert + actualiza dia_semana en existentes)
        skipped_vend = 0
        to_upsert = []
        for (vend_key, erp_suc, ruta_code) in unique.keys():
            id_vendedor = vend_map.get((vend_key, erp_suc))
            if not id_vendedor:
                skipped_vend += 1
                continue
            to_upsert.append({
                "id_vendedor": id_vendedor,
                "id_ruta_erp": ruta_code,
                "dia_semana":  ruta_dia.get((vend_key, erp_suc, ruta_code), "Variable"),
            })

        if skipped_vend:
            logger.warning(f"[Padrón] Rutas saltadas por vendedor no mapeado: {skipped_vend}/{len(unique)}")

        nuevas = 0
        if to_upsert:
            BATCH = 200
            for i in range(0, len(to_upsert), BATCH):
                sb.table("rutas_v2").upsert(
                    to_upsert[i:i + BATCH], on_conflict="id_vendedor,id_ruta_erp"
                ).execute()
            nuevas = len(to_upsert)
            logger.info(f"[Padrón] Rutas upserted: {nuevas}")

        # Fetch final para mapping — paginar también
        vend_ids = list(set(vend_map.values()))
        mapping: dict[tuple[str, str, str], int] = {}
        if vend_ids:
            vend_map_inv = {v: k for k, v in vend_map.items()}
            for i in range(0, len(vend_ids), 500):
                chunk = vend_ids[i:i+500]
                final_res = sb.table("rutas_v2").select("id_ruta, id_vendedor, id_ruta_erp") \
                    .in_("id_vendedor", chunk).execute()
                for r in (final_res.data or []):
                    vid = r["id_vendedor"]
                    key_vend = vend_map_inv.get(vid)
                    if key_vend and r.get("id_ruta_erp"):
                        mapping[(key_vend[0], key_vend[1], r["id_ruta_erp"])] = r["id_ruta"]

        logger.info(f"[Padrón] Rutas: {len(unique)} en Excel, {nuevas} upserted, {len(mapping)} en mapping final")
        return len(unique), mapping

    # ── Paso 4: Clientes PDV ──────────────────────────────────────────────────

    def _sync_clientes(
        self, df: pd.DataFrame, cols: dict, dist_id: int,
        ruta_map: dict[tuple, int], vend_map: dict[tuple, int], suc_map: dict[str, int]
    ) -> int:
        """
        Upsert masivo de clientes PDV.

        Además, adopta clientes 'limbo' existentes: si hay un cliente en
        clientes_pdv con es_limbo=True cuyo id_cliente_erp aparece en este
        padrón, lo reasigna a la ruta correcta y marca es_limbo=False.
        """
        BATCH = 300
        records = []
        skip_no_id = 0
        skip_no_ruta = 0

        # Recolectar todos los id_erp del padrón para el paso de adopción
        erp_ids_en_padron: dict[str, dict] = {}

        for _, row in df.iterrows():
            id_erp = _safe_str(row.get(cols["id_cliente"]) if cols.get("id_cliente") else None, "")
            # Limpiar ".0" de floats (ej. "4366.0" → "4366")
            if id_erp.endswith(".0"):
                id_erp = id_erp[:-2]
            if not id_erp:
                skip_no_id += 1
                continue

            # Resolver ruta usando los mismos keys que en _sync_rutas
            cod = _safe_str(row.get(cols["vendedor_erp_cod"]) if cols.get("vendedor_erp_cod") else None, "")
            if cod.endswith(".0"):
                cod = cod[:-2]
            nombre_vend = _safe_str(row.get(cols["vendedor_nombre"]) if cols.get("vendedor_nombre") else None, "").upper()
            vend_key = cod if cod else (nombre_vend or "SIN VENDEDOR")

            erp_suc = _safe_str(row.get(cols["id_sucursal"]) if cols.get("id_sucursal") else None, "")
            if erp_suc.endswith(".0"):
                erp_suc = erp_suc[:-2]
            if not erp_suc:
                suc_nombre = _safe_str(row.get(cols["sucursal"]) if cols.get("sucursal") else None, "CASA CENTRAL")
                erp_suc = _norm(suc_nombre).replace(" ", "_") or "suc_0"

            ruta_code = _safe_str(row.get(cols["ruta"]) if cols.get("ruta") else None, "R00").upper()
            if ruta_code.endswith(".0"):
                ruta_code = ruta_code[:-2]

            id_ruta = ruta_map.get((vend_key, erp_suc, ruta_code))
            if not id_ruta:
                skip_no_ruta += 1
                continue

            try:
                latitud  = float(row[cols["latitud"]])  if cols.get("latitud")  and _safe_str(row.get(cols["latitud"]))  else None
                longitud = float(row[cols["longitud"]]) if cols.get("longitud") and _safe_str(row.get(cols["longitud"])) else None
            except (ValueError, TypeError):
                latitud = longitud = None

            payload = {
                "id_ruta":             id_ruta,
                "id_distribuidor":     dist_id,
                "id_cliente_erp":      id_erp,
                "nombre_fantasia":     _safe_str(row.get(cols["fantasia"]) if cols.get("fantasia") else None,
                                                 _safe_str(row.get(cols["nombre_cliente"]) if cols.get("nombre_cliente") else None, "SIN NOMBRE")).upper(),
                "nombre_razon_social": _safe_str(row.get(cols["nombre_cliente"]) if cols.get("nombre_cliente") else None, "").upper(),
                "domicilio":           _safe_str(row.get(cols["domicilio"]) if cols.get("domicilio") else None, "").upper(),
                "localidad":           _safe_str(row.get(cols["localidad"]) if cols.get("localidad") else None, "").upper(),
                "provincia":           _safe_str(row.get(cols["provincia"]) if cols.get("provincia") else None, "").upper(),
                "canal":               _safe_str(row.get(cols["canal"]) if cols.get("canal") else None, "").upper(),
                "fecha_ultima_compra": _safe_date(row.get(cols["fecha_ultima_compra"]) if cols.get("fecha_ultima_compra") else None),
                "fecha_alta":          _safe_date(row.get(cols["fecha_alta"]) if cols.get("fecha_alta") else None),
                "latitud":             latitud,
                "longitud":            longitud,
                "es_limbo":            False,
                "estado":              "activo",
                "updated_at":          datetime.now(timezone.utc).isoformat(),
            }
            records.append(payload)
            erp_ids_en_padron[id_erp] = payload

        logger.info(f"[Padrón] Clientes: {len(records)} a procesar, {skip_no_id} sin id_erp, {skip_no_ruta} sin ruta mapeada")

        # ── Adoptar clientes limbo ────────────────────────────────────────────
        # Busca registros es_limbo=True cuyo id_cliente_erp aparece en este padrón
        # y los actualiza con los datos reales + los reasigna a la ruta correcta.
        adopted = 0
        if erp_ids_en_padron:
            # Filtramos por dist + limbo en DB, luego cruzamos en Python
            # (evita URL too long con miles de ids en .in_())
            limbo_res = sb.table("clientes_pdv_v2") \
                .select("id_cliente, id_cliente_erp") \
                .eq("id_distribuidor", dist_id) \
                .eq("es_limbo", True) \
                .execute()
            for limbo in (limbo_res.data or []):
                if limbo.get("id_cliente_erp") not in erp_ids_en_padron:
                    continue
                erp_id = limbo["id_cliente_erp"]
                # update directo por PK con todos los campos reales
                update_data = {**erp_ids_en_padron[erp_id]}
                sb.table("clientes_pdv_v2").update(update_data) \
                    .eq("id_cliente", limbo["id_cliente"]) \
                    .execute()
                adopted += 1
            if adopted:
                logger.info(f"[Padrón] Clientes limbo adoptados: {adopted}")

        # ── Upsert normal en batches ──────────────────────────────────────────
        # Nota: on_conflict requiere un UNIQUE INDEX completo (sin WHERE parcial).
        # Si el índice fue creado con WHERE, usar ignore_duplicates=False y
        # dejar que Supabase maneje el conflicto vía la constraint.
        total = 0
        for i in range(0, len(records), BATCH):
            batch = records[i:i + BATCH]
            try:
                sb.table("clientes_pdv_v2").upsert(
                    batch, on_conflict="id_ruta,id_cliente_erp"
                ).execute()
            except Exception as e_upsert:
                # Fallback: intentar insert ignorando duplicados
                logger.warning(f"[Padrón] Upsert falló en batch {i//BATCH} ({e_upsert}), intentando insert...")
                try:
                    sb.table("clientes_pdv_v2").insert(batch, count="exact").execute()
                except Exception as e_insert:
                    logger.error(f"[Padrón] Insert batch {i//BATCH} también falló: {e_insert}")
                    continue
            total += len(batch)
            if (i // BATCH) % 10 == 0:
                logger.info(f"[Padrón] Clientes procesados: {total}/{len(records)}...")

        logger.info(f"[Padrón] Clientes upserted: {total} (adoptados del limbo: {adopted})")
        return total

    # ── Paso 5: Reconciliación retroactiva de exhibiciones ───────────────────

    def _reconcile_exhibiciones(self, dist_id: int) -> int:
        """
        Llama al RPC fn_reconcile_exhibiciones que completa id_cliente_pdv
        en exhibiciones donde el cliente ya existe en clientes_pdv pero el
        link estaba vacío (clientes subidos "en el limbo" entre actualizaciones
        del padrón o desde antes de tener la columna id_cliente_pdv).

        Silencioso: si el RPC no existe o falla, solo deja un log de debug.
        Devuelve el número de exhibiciones actualizadas.
        """
        try:
            res = sb.rpc("fn_reconcile_exhibiciones", {"p_dist_id": dist_id}).execute()
            updated = 0
            if isinstance(res.data, dict):
                updated = res.data.get("updated", 0)
            elif isinstance(res.data, list) and res.data:
                updated = res.data[0].get("updated", 0)
            if updated:
                logger.info(f"[Padrón] Reconciliación: {updated} exhibiciones vinculadas a clientes_pdv")
            return updated
        except Exception as e:
            logger.debug(f"[Padrón] Reconciliación omitida (RPC no disponible o sin datos): {e}")
            return 0

    # ── Helpers multi-tenant ──────────────────────────────────────────────────

    def _load_dist_map(self) -> dict[str, int]:
        """Carga {id_empresa_erp → id_distribuidor} desde distribuidores."""
        res = sb.table("distribuidores").select("id_distribuidor, id_empresa_erp").execute()
        return {
            str(r["id_empresa_erp"]): r["id_distribuidor"]
            for r in (res.data or [])
            if r.get("id_empresa_erp")
        }

    # ── Entry point ───────────────────────────────────────────────────────────

    def ingest(self, file_bytes: bytes) -> list[dict]:
        """
        Ingesta global del Padrón. Procesa TODOS los tenants del archivo,
        agrupando por idempresa y mapeando al id_distribuidor correspondiente.

        Returns:
            Lista de métricas por distribuidor procesado.
        """
        df = self._parse_excel(file_bytes)
        cols = self._detect_columns(df)

        if not cols["id_cliente"]:
            raise ValueError("No se encontró columna de ID de cliente en el archivo.")

        # Detectar columna de empresa
        empresa_col = _flexible_col(df, ["idempresa", "id_empresa", "empresa_id"])
        if not empresa_col:
            raise ValueError("No se encontró columna idempresa en el archivo.")

        # Limpiar y normalizar el código de empresa por fila
        def _clean_erp(v: Any) -> str:
            s = _safe_str(v, "")
            return s[:-2] if s.endswith(".0") else s

        df = df.copy()
        df["_empresa_key"] = df[empresa_col].apply(_clean_erp)

        # Cargar mapping empresa_erp → dist_id
        dist_map = self._load_dist_map()
        if not dist_map:
            raise ValueError(
                "No hay distribuidores con id_empresa_erp configurado. "
                "Ejecute: UPDATE distribuidores SET id_empresa_erp = id_erp WHERE id_erp IS NOT NULL;"
            )

        resultados = []
        for empresa_erp, df_dist in df.groupby("_empresa_key"):
            empresa_erp = str(empresa_erp)
            dist_id = dist_map.get(empresa_erp)
            if not dist_id:
                logger.warning(
                    f"[Padrón] Empresa ERP '{empresa_erp}' sin distribuidor mapeado "
                    f"— saltando {len(df_dist)} filas"
                )
                continue

            resultado = self._ingest_for_dist(df_dist.copy(), cols, dist_id, empresa_erp)
            resultados.append(resultado)

        logger.info(f"[Padrón] Global OK — {len(resultados)} distribuidores procesados")
        return resultados

    def _ingest_for_dist(
        self, df: pd.DataFrame, cols: dict, dist_id: int, empresa_erp: str
    ) -> dict:
        """Procesa el padrón para un único distribuidor."""
        t0 = datetime.now(timezone.utc)
        run_id = self._start_run(dist_id)
        logger.info(
            f"[Padrón] Iniciando run #{run_id} para dist {dist_id} "
            f"(empresa ERP: {empresa_erp}, {len(df)} filas)"
        )

        try:
            # ── Filtro de sucursales por distribuidor ─────────────────────────
            # Si el distribuidor tiene una lista de sucursales permitidas,
            # descartar filas de otras sucursales ANTES de procesar cualquier dato.
            suc_filter = SUCURSAL_FILTER.get(dist_id)
            if suc_filter:
                id_suc_col  = cols.get("id_sucursal")
                nom_suc_col = cols.get("sucursal")
                allowed_ids     = {str(s).strip() for s in suc_filter.get("ids", [])}
                allowed_nombres = {_norm(n) for n in suc_filter.get("nombres", [])}

                def _row_allowed(row: Any) -> bool:
                    # Chequeo por id numérico
                    if id_suc_col:
                        raw_id = _safe_str(row.get(id_suc_col), "")
                        if raw_id.endswith(".0"):
                            raw_id = raw_id[:-2]
                        if raw_id in allowed_ids:
                            return True
                    # Chequeo por nombre normalizado
                    if nom_suc_col:
                        raw_nom = _norm(_safe_str(row.get(nom_suc_col), ""))
                        if raw_nom in allowed_nombres:
                            return True
                    return False

                df_antes = len(df)
                df = df[df.apply(_row_allowed, axis=1)].copy()
                logger.info(
                    f"[Padrón] Filtro de sucursales para dist {dist_id}: "
                    f"{df_antes} → {len(df)} filas "
                    f"(ids permitidos: {allowed_ids}, nombres: {allowed_nombres})"
                )
                if df.empty:
                    raise ValueError(
                        f"El filtro de sucursales para dist {dist_id} resultó en 0 filas. "
                        f"Verifica que el Excel contenga la sucursal id={allowed_ids} / nombre={allowed_nombres}."
                    )
            # ─────────────────────────────────────────────────────────────────

            suc_count,  suc_map  = self._sync_sucursales(df, cols, dist_id)
            vend_count, vend_map = self._sync_vendedores(df, cols, dist_id, suc_map)
            ruta_count, ruta_map = self._sync_rutas(df, cols, dist_id, vend_map, suc_map)
            cli_count            = self._sync_clientes(df, cols, dist_id, ruta_map, vend_map, suc_map)
            exhib_linked         = self._reconcile_exhibiciones(dist_id)

            duracion = (datetime.now(timezone.utc) - t0).total_seconds()
            registros = {
                "sucursales":       suc_count,
                "vendedores":       vend_count,
                "rutas":            ruta_count,
                "clientes":         cli_count,
                "exhib_vinculadas": exhib_linked,
            }
            self._finish_run(run_id, "ok", registros=registros)
            logger.info(f"[Padrón] Run #{run_id} dist {dist_id} OK en {duracion:.1f}s → {registros}")

            return {"dist_id": dist_id, "run_id": run_id, "duracion_seg": round(duracion, 2), **registros}

        except Exception as e:
            logger.error(f"[Padrón] Run #{run_id} dist {dist_id} ERROR: {e}")
            self._finish_run(run_id, "error", error_msg=str(e))
            raise


# Singleton
padron_service = PadronIngestionService()
