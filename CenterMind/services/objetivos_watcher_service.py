# -*- coding: utf-8 -*-
"""
services/objetivos_watcher_service.py
=======================================
Recalcula valor_actual de los objetivos activos a partir de datos reales.
Se invoca automáticamente después de cada ingesta de padrón o ventas.

Tipos soportados:
  - ruteo_alteo      → cuenta nuevos PDVs agregados a las rutas del vendedor
  - conversion_estado → cuenta clientes que realizaron su primera compra
  - exhibicion       → cuenta exhibiciones aprobadas del vendedor
  - cobranza         → calcula deuda cobrada vs. snapshot inicial
  - general          → no se actualiza automáticamente (control manual)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from db import sb

logger = logging.getLogger("ObjetivosWatcher")


class ObjetivosWatcherService:
    """
    Actualiza valor_actual para todos los objetivos activos de un distribuidor.
    No lanza excepciones — errores individuales quedan en logs de warning.
    """

    def run_watcher(self, dist_id: int) -> dict:
        """
        Entry point. Retorna dict con estadísticas de la ejecución.
        """
        try:
            res = (
                sb.table("objetivos")
                .select("*")
                .eq("id_distribuidor", dist_id)
                .eq("cumplido", False)
                .execute()
            )
            objetivos = res.data or []

            if not objetivos:
                return {"dist_id": dist_id, "procesados": 0, "actualizados": 0}

            actualizados = 0
            cumplidos = 0

            for obj in objetivos:
                try:
                    nuevo_valor = self._compute_valor_actual(obj, dist_id)
                    if nuevo_valor is None:
                        continue  # tipo general o sin snapshot

                    updates: dict = {
                        "valor_actual": nuevo_valor,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }

                    valor_obj = obj.get("valor_objetivo")
                    if valor_obj and float(valor_obj) > 0 and nuevo_valor >= float(valor_obj):
                        updates["cumplido"] = True
                        updates["completed_at"] = datetime.now(timezone.utc).isoformat()
                        cumplidos += 1

                    sb.table("objetivos").update(updates).eq("id", obj["id"]).execute()
                    actualizados += 1

                except Exception as e:
                    logger.warning(
                        f"[Watcher] Error procesando objetivo {obj.get('id')} "
                        f"tipo={obj.get('tipo')}: {e}"
                    )

            logger.info(
                f"[Watcher] dist={dist_id}: {len(objetivos)} objetivos, "
                f"{actualizados} actualizados, {cumplidos} marcados cumplidos"
            )
            return {
                "dist_id": dist_id,
                "procesados": len(objetivos),
                "actualizados": actualizados,
                "cumplidos": cumplidos,
            }

        except Exception as e:
            logger.error(f"[Watcher] Error general dist={dist_id}: {e}")
            return {"dist_id": dist_id, "procesados": 0, "actualizados": 0, "error": str(e)}

    # ── Dispatcher ────────────────────────────────────────────────────────────

    def _compute_valor_actual(self, obj: dict, dist_id: int) -> float | None:
        tipo = obj.get("tipo")
        id_vendedor = obj.get("id_vendedor")
        created_at = obj.get("created_at", "")

        if tipo == "ruteo_alteo":
            return self._count_nuevos_pdvs(id_vendedor, dist_id, created_at)
        if tipo == "conversion_estado":
            return self._count_conversiones(id_vendedor, dist_id, created_at)
        if tipo == "exhibicion":
            return self._count_exhibiciones(id_vendedor, dist_id, created_at)
        if tipo == "cobranza":
            return self._compute_cobranza(obj, dist_id)
        # "general" → sin actualización automática
        return None

    # ── Implementaciones por tipo ─────────────────────────────────────────────

    def _count_nuevos_pdvs(
        self, id_vendedor: int, dist_id: int, since: str
    ) -> float:
        """
        Cuenta PDVs incorporados a las rutas del vendedor después de que
        se creó el objetivo (ruteo de altas).
        """
        try:
            rutas_res = (
                sb.table("rutas_v2")
                .select("id_ruta")
                .eq("id_vendedor", id_vendedor)
                .execute()
            )
            ruta_ids = [r["id_ruta"] for r in (rutas_res.data or [])]
            if not ruta_ids:
                return 0.0

            clientes_res = (
                sb.table("clientes_pdv_v2")
                .select("id_cliente", count="exact")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", ruta_ids)
                .gte("created_at", since)
                .execute()
            )
            return float(clientes_res.count or 0)

        except Exception as e:
            logger.warning(f"[Watcher] ruteo_alteo vend={id_vendedor}: {e}")
            return 0.0

    def _count_conversiones(
        self, id_vendedor: int, dist_id: int, since: str
    ) -> float:
        """
        Cuenta PDVs que realizaron su primera compra (activación) desde
        que se creó el objetivo.
        """
        try:
            rutas_res = (
                sb.table("rutas_v2")
                .select("id_ruta")
                .eq("id_vendedor", id_vendedor)
                .execute()
            )
            ruta_ids = [r["id_ruta"] for r in (rutas_res.data or [])]
            if not ruta_ids:
                return 0.0

            clientes_res = (
                sb.table("clientes_pdv_v2")
                .select("id_cliente", count="exact")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", ruta_ids)
                .gte("fecha_ultima_compra", since[:10])  # date only
                .execute()
            )
            return float(clientes_res.count or 0)

        except Exception as e:
            logger.warning(f"[Watcher] conversion_estado vend={id_vendedor}: {e}")
            return 0.0

    def _count_exhibiciones(
        self, id_vendedor: int, dist_id: int, since: str
    ) -> float:
        """
        Cuenta exhibiciones aprobadas del vendedor desde que se creó
        el objetivo.
        """
        try:
            res = (
                sb.table("exhibiciones")
                .select("id_exhibicion", count="exact")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor", id_vendedor)
                .eq("estado", "Aprobada")
                .gte("created_at", since)
                .execute()
            )
            return float(res.count or 0)

        except Exception as e:
            logger.warning(f"[Watcher] exhibicion vend={id_vendedor}: {e}")
            return 0.0

    def _compute_cobranza(self, obj: dict, dist_id: int) -> float | None:
        """
        Calcula cuánto se cobró (deuda_inicial - deuda_actual).

        La deuda inicial queda en estado_inicial como número al crear
        el objetivo (snapshot automático de cc_detalle).
        """
        estado_inicial = obj.get("estado_inicial")
        if not estado_inicial:
            return None  # Sin snapshot no hay base

        try:
            deuda_inicial = float(estado_inicial)
        except (ValueError, TypeError):
            return None

        id_vendedor = obj.get("id_vendedor")

        try:
            # Deuda actual: última snapshot en cc_detalle (suma de filas del vendedor)
            res = (
                sb.table("cc_detalle")
                .select("deuda_total")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor", id_vendedor)
                .execute()
            )
            deuda_actual = sum(
                float(r.get("deuda_total") or 0) for r in (res.data or [])
            )
            cobrado = max(0.0, deuda_inicial - deuda_actual)
            return cobrado

        except Exception as e:
            logger.warning(f"[Watcher] cobranza obj={obj.get('id')}: {e}")
            return None


# Singleton
objetivos_watcher = ObjetivosWatcherService()
