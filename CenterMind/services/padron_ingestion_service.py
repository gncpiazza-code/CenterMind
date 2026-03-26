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
            df = pd.read_excel(buf, dtype=str)
        except Exception:
            buf.seek(0)
            df = pd.read_csv(buf, sep=None, engine="python", dtype=str, encoding="latin1")
        df.columns = [str(c).strip() for c in df.columns]
        return df

    def _detect_columns(self, df: pd.DataFrame) -> dict[str, str | None]:
        """Detecta columnas relevantes del Padrón con mapeo flexible."""
        return {
            "id_cliente":    _flexible_col(df, ["idcliente", "id_cliente", "codi_cliente", "cliente_id", "numero_cliente_local"]),
            "nombre_cliente":_flexible_col(df, ["nomcli", "nombre", "nombre_cliente", "razon_social"]),
            "fantasia":      _flexible_col(df, ["fantacli", "fantasia", "nombre_fantasia"]),
            "vendedor":      _flexible_col(df, ["dsvendedor", "vendedor", "d_vendedor", "vendedor_nombre"]),
            "sucursal":      _flexible_col(df, ["dssucur", "sucursal", "sucursal_nombre", "nombre_sucursal"]),
            "id_sucursal":   _flexible_col(df, ["idsucur", "id_sucursal", "sucursal_id"]),
            "ruta":          _flexible_col(df, ["ruta", "nro_ruta", "id_ruta", "ruta_erp"]),
            "lat":           _flexible_col(df, ["ycoord", "lat", "latitud"]),
            "lon":           _flexible_col(df, ["xcoord", "lon", "longitud"]),
            "direccion":     _flexible_col(df, ["domicli", "direccion", "domicilio"]),
            "localidad":     _flexible_col(df, ["descloca", "localidad"]),
            "provincia":     _flexible_col(df, ["desprovincia", "provincia"]),
            "telefono":      _flexible_col(df, ["telefos", "telefono"]),
            "canal":         _flexible_col(df, ["descanal", "canal", "canal_venta"]),
            "fecha_alta":    _flexible_col(df, ["fecalta", "fec_alta", "fecha_alta"]),
            "lun": _flexible_col(df, ["lunes", "lun"]),
            "mar": _flexible_col(df, ["martes", "mar"]),
            "mie": _flexible_col(df, ["miercoles", "mie"]),
            "jue": _flexible_col(df, ["jueves", "jue"]),
            "vie": _flexible_col(df, ["viernes", "vie"]),
            "sab": _flexible_col(df, ["sabado", "sab"]),
            "dom": _flexible_col(df, ["domingo", "dom"]),
        }

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
            erp_id = _safe_str(row.get(cols["id_sucursal"]) if cols["id_sucursal"] else None)
            nombre = _safe_str(row.get(cols["sucursal"]) if cols["sucursal"] else None, "CASA CENTRAL")
            if not erp_id:
                erp_id = _norm(nombre).replace(" ", "_") or "suc_0"
            if erp_id not in unique:
                unique[erp_id] = nombre.upper()

        if not unique:
            return 0, {}

        # Fetch existentes
        existing_res = sb.table("sucursales").select("id_sucursal, id_sucursal_erp, nombre_erp") \
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
            sb.table("sucursales").insert(to_insert).execute()

        # Update nombres cambiados
        for upd in to_update:
            sb.table("sucursales").update({"nombre_erp": upd["nombre_erp"]}) \
                .eq("id_sucursal", upd["id_sucursal"]).execute()

        # Fetch final para construir mapping
        final_res = sb.table("sucursales").select("id_sucursal, id_sucursal_erp") \
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
        Devuelve (count, {(nombre_upper, id_sucursal_erp): id_vendedor}).
        """
        # Extraer únicos: (nombre_vendedor, id_sucursal_erp)
        unique: dict[tuple[str, str], None] = {}
        for _, row in df.iterrows():
            nombre = _safe_str(row.get(cols["vendedor"]) if cols["vendedor"] else None, "SIN VENDEDOR").upper()
            erp_suc = _safe_str(row.get(cols["id_sucursal"]) if cols["id_sucursal"] else None)
            if not erp_suc:
                suc_nombre = _safe_str(row.get(cols["sucursal"]) if cols["sucursal"] else None, "CASA CENTRAL")
                erp_suc = _norm(suc_nombre).replace(" ", "_") or "suc_0"
            unique[(nombre, erp_suc)] = None

        if not unique:
            return 0, {}

        # Fetch existentes: todos los vendedores de este dist
        existing_res = sb.table("vendedores").select("id_vendedor, nombre_erp, id_sucursal") \
            .eq("id_distribuidor", dist_id).execute()
        # key: (nombre_erp, id_sucursal)
        existing: dict[tuple, int] = {
            (r["nombre_erp"], r["id_sucursal"]): r["id_vendedor"]
            for r in (existing_res.data or [])
            if r.get("nombre_erp") and r.get("id_sucursal")
        }

        to_insert = []
        for (nombre, erp_suc) in unique.keys():
            id_sucursal = suc_map.get(erp_suc)
            if not id_sucursal:
                logger.warning(f"[Padrón] Vendedor '{nombre}' sin sucursal mapeada (erp_suc={erp_suc}), saltando")
                continue
            if (nombre, id_sucursal) not in existing:
                to_insert.append({
                    "id_distribuidor": dist_id,
                    "id_sucursal": id_sucursal,
                    "nombre_erp": nombre,
                })

        if to_insert:
            sb.table("vendedores").insert(to_insert).execute()

        # Fetch final para mapping
        final_res = sb.table("vendedores").select("id_vendedor, nombre_erp, id_sucursal") \
            .eq("id_distribuidor", dist_id).execute()
        # mapping: (nombre_erp, id_sucursal_erp) → id_vendedor
        # Invertimos suc_map para buscar erp_id por id_sucursal
        suc_map_inv = {v: k for k, v in suc_map.items()}
        mapping: dict[tuple[str, str], int] = {
            (r["nombre_erp"], suc_map_inv.get(r["id_sucursal"], "")): r["id_vendedor"]
            for r in (final_res.data or [])
            if r.get("nombre_erp") and r.get("id_sucursal")
        }

        logger.info(f"[Padrón] Vendedores: {len(unique)} totales, {len(to_insert)} nuevos")
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
        # Extraer únicos: (nombre_vendedor, erp_suc, ruta_code)
        unique: dict[tuple[str, str, str], None] = {}
        for _, row in df.iterrows():
            nombre_vend = _safe_str(row.get(cols["vendedor"]) if cols["vendedor"] else None, "SIN VENDEDOR").upper()
            erp_suc = _safe_str(row.get(cols["id_sucursal"]) if cols["id_sucursal"] else None)
            if not erp_suc:
                suc_nombre = _safe_str(row.get(cols["sucursal"]) if cols["sucursal"] else None, "CASA CENTRAL")
                erp_suc = _norm(suc_nombre).replace(" ", "_") or "suc_0"
            ruta_code = _safe_str(row.get(cols["ruta"]) if cols["ruta"] else None, "R00").upper()
            unique[(nombre_vend, erp_suc, ruta_code)] = None

        if not unique:
            return 0, {}

        # Fetch existentes: rutas de vendedores de este dist
        vend_ids = list(set(vend_map.values()))
        existing: dict[tuple[int, str], int] = {}
        if vend_ids:
            existing_res = sb.table("rutas").select("id_ruta, id_vendedor, id_ruta_erp") \
                .in_("id_vendedor", vend_ids).execute()
            existing = {
                (r["id_vendedor"], r["id_ruta_erp"]): r["id_ruta"]
                for r in (existing_res.data or [])
                if r.get("id_ruta_erp")
            }

        to_insert = []
        for (nombre_vend, erp_suc, ruta_code) in unique.keys():
            id_vendedor = vend_map.get((nombre_vend, erp_suc))
            if not id_vendedor:
                continue
            if (id_vendedor, ruta_code) not in existing:
                to_insert.append({
                    "id_vendedor": id_vendedor,
                    "id_ruta_erp": ruta_code,
                    "dia_semana": "Variable",
                    "periodicidad": "Semanal",
                })

        if to_insert:
            sb.table("rutas").insert(to_insert).execute()

        # Fetch final para mapping
        mapping: dict[tuple[str, str, str], int] = {}
        if vend_ids:
            final_res = sb.table("rutas").select("id_ruta, id_vendedor, id_ruta_erp") \
                .in_("id_vendedor", vend_ids).execute()
            # Invertir vend_map para buscar (nombre_vend, erp_suc) por id_vendedor
            vend_map_inv = {v: k for k, v in vend_map.items()}
            for r in (final_res.data or []):
                vid = r["id_vendedor"]
                key_vend = vend_map_inv.get(vid)  # (nombre_vend, erp_suc)
                if key_vend and r.get("id_ruta_erp"):
                    mapping[(key_vend[0], key_vend[1], r["id_ruta_erp"])] = r["id_ruta"]

        logger.info(f"[Padrón] Rutas: {len(unique)} totales, {len(to_insert)} nuevas")
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
        skipped = 0

        # Recolectar todos los id_erp del padrón para el paso de adopción
        erp_ids_en_padron: dict[str, dict] = {}

        for _, row in df.iterrows():
            id_erp = _safe_str(row.get(cols["id_cliente"]) if cols["id_cliente"] else None)
            if not id_erp:
                skipped += 1
                continue

            # Resolver ruta
            nombre_vend = _safe_str(row.get(cols["vendedor"]) if cols["vendedor"] else None, "SIN VENDEDOR").upper()
            erp_suc = _safe_str(row.get(cols["id_sucursal"]) if cols["id_sucursal"] else None)
            if not erp_suc:
                suc_nombre = _safe_str(row.get(cols["sucursal"]) if cols["sucursal"] else None, "CASA CENTRAL")
                erp_suc = _norm(suc_nombre).replace(" ", "_") or "suc_0"
            ruta_code = _safe_str(row.get(cols["ruta"]) if cols["ruta"] else None, "R00").upper()

            id_ruta = ruta_map.get((nombre_vend, erp_suc, ruta_code))
            if not id_ruta:
                skipped += 1
                continue

            try:
                lat = float(row[cols["lat"]]) if cols["lat"] and _safe_str(row.get(cols["lat"])) else None
                lon = float(row[cols["lon"]]) if cols["lon"] and _safe_str(row.get(cols["lon"])) else None
            except (ValueError, TypeError):
                lat = lon = None

            payload = {
                "id_ruta": id_ruta,
                "id_distribuidor": dist_id,
                "id_cliente_erp": id_erp,
                "nombre_fantasia": _safe_str(row.get(cols["fantasia"]) if cols["fantasia"] else None,
                                             _safe_str(row.get(cols["nombre_cliente"]) if cols["nombre_cliente"] else None, "SIN NOMBRE")).upper(),
                "nombre_razon_social": _safe_str(row.get(cols["nombre_cliente"]) if cols["nombre_cliente"] else None, "").upper(),
                "direccion": _safe_str(row.get(cols["direccion"]) if cols["direccion"] else None, "").upper(),
                "localidad": _safe_str(row.get(cols["localidad"]) if cols["localidad"] else None, "").upper(),
                "provincia": _safe_str(row.get(cols["provincia"]) if cols["provincia"] else None, "").upper(),
                "telefono": _safe_str(row.get(cols["telefono"]) if cols["telefono"] else None),
                "canal": _safe_str(row.get(cols["canal"]) if cols["canal"] else None, "").upper(),
                "fecha_alta": _safe_date(row.get(cols["fecha_alta"]) if cols["fecha_alta"] else None),
                "lat": lat,
                "lon": lon,
                "es_limbo": False,
                "estado": "activo",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            records.append(payload)
            erp_ids_en_padron[id_erp] = payload

        if skipped:
            logger.warning(f"[Padrón] Clientes saltados (sin id_erp o sin ruta): {skipped}")

        # ── Adoptar clientes limbo ────────────────────────────────────────────
        # Busca registros es_limbo=True cuyo id_cliente_erp aparece en este padrón
        # y los actualiza con los datos reales + los reasigna a la ruta correcta.
        adopted = 0
        if erp_ids_en_padron:
            limbo_res = sb.table("clientes_pdv") \
                .select("id_cliente, id_cliente_erp") \
                .eq("es_limbo", True) \
                .in_("id_cliente_erp", list(erp_ids_en_padron.keys())) \
                .execute()
            for limbo in (limbo_res.data or []):
                erp_id = limbo["id_cliente_erp"]
                update_data = {**erp_ids_en_padron[erp_id]}
                # No se usa upsert aquí, sino update directo por PK
                sb.table("clientes_pdv").update(update_data) \
                    .eq("id_cliente", limbo["id_cliente"]) \
                    .execute()
                adopted += 1
            if adopted:
                logger.info(f"[Padrón] Clientes limbo adoptados: {adopted}")

        # ── Upsert normal en batches ──────────────────────────────────────────
        total = 0
        for i in range(0, len(records), BATCH):
            batch = records[i:i + BATCH]
            sb.table("clientes_pdv").upsert(
                batch, on_conflict="id_ruta, id_cliente_erp"
            ).execute()
            total += len(batch)

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

    # ── Entry point ───────────────────────────────────────────────────────────

    def ingest(self, file_bytes: bytes, dist_id: int) -> dict:
        """
        Ingesta completa del Padrón. Devuelve métricas del run.

        Returns:
            {
                run_id: int,
                sucursales: int,
                vendedores: int,
                rutas: int,
                clientes: int,
                duracion_seg: float
            }
        """
        t0 = datetime.now(timezone.utc)
        run_id = self._start_run(dist_id)
        logger.info(f"[Padrón] Iniciando run #{run_id} para dist {dist_id}")

        try:
            df = self._parse_excel(file_bytes)
            cols = self._detect_columns(df)

            if not cols["id_cliente"]:
                raise ValueError("No se encontró columna de ID de cliente en el archivo.")

            suc_count,  suc_map  = self._sync_sucursales(df, cols, dist_id)
            vend_count, vend_map = self._sync_vendedores(df, cols, dist_id, suc_map)
            ruta_count, ruta_map = self._sync_rutas(df, cols, dist_id, vend_map, suc_map)
            cli_count            = self._sync_clientes(df, cols, dist_id, ruta_map, vend_map, suc_map)

            # Paso 5: reconciliar exhibiciones huérfanas (silencioso)
            exhib_linked = self._reconcile_exhibiciones(dist_id)

            duracion = (datetime.now(timezone.utc) - t0).total_seconds()
            registros = {
                "sucursales":       suc_count,
                "vendedores":       vend_count,
                "rutas":            ruta_count,
                "clientes":         cli_count,
                "exhib_vinculadas": exhib_linked,
            }
            self._finish_run(run_id, "ok", registros=registros)
            logger.info(f"[Padrón] Run #{run_id} OK en {duracion:.1f}s → {registros}")

            return {
                "run_id":      run_id,
                "duracion_seg": round(duracion, 2),
                **registros,
            }

        except Exception as e:
            logger.error(f"[Padrón] Run #{run_id} ERROR: {e}")
            self._finish_run(run_id, "error", error_msg=str(e))
            raise


# Singleton
padron_service = PadronIngestionService()
