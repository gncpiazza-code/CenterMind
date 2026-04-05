# -*- coding: utf-8 -*-
"""
services/objetivos_watcher_service.py
=======================================
Detecta diferencias (nuevos eventos) para cada objetivo activo y actualiza
valor_actual con precisión de evento, insertando registros en objetivos_tracking
para evitar duplicados y disparar notificaciones solo ante hechos nuevos.

Tipos soportados:
  - ruteo_alteo      → nuevos PDVs incorporados a rutas del vendedor
  - conversion_estado → PDVs que realizaron su primera compra
  - exhibicion       → exhibiciones aprobadas
  - cobranza         → deuda cobrada vs. snapshot inicial (cálculo global)
  - general          → sin actualización automática
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

from db import sb

logger = logging.getLogger("ObjetivosWatcher")


class ObjetivosWatcherService:
    """
    Actualiza valor_actual mediante detección de diferencias.
    Usa objetivos_tracking como tabla de deduplicación para no notificar
    el mismo evento dos veces.
    """

    def run_watcher(self, dist_id: int) -> dict:
        """Entry point. Retorna dict con estadísticas de la ejecución."""
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
            eventos_nuevos = 0

            for obj in objetivos:
                try:
                    result = self._process_objetivo(obj, dist_id)
                    if result is None:
                        continue  # tipo general o sin datos base

                    # exhibicion returns a 3-tuple (display_valor, eventos, approved_valor)
                    # all other types return a 2-tuple (valor, eventos)
                    if len(result) == 3:
                        nuevo_valor, nuevos_eventos, valor_aprobados = result
                    else:
                        nuevo_valor, nuevos_eventos = result
                        valor_aprobados = nuevo_valor
                    eventos_nuevos += nuevos_eventos

                    updates: dict[str, Any] = {
                        "valor_actual": nuevo_valor,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }

                    valor_obj = obj.get("valor_objetivo")
                    ahora = datetime.now(timezone.utc)

                    # ── Cumplido por progreso (meta alcanzada) ─────────────────
                    if (
                        valor_obj
                        and float(valor_obj) > 0
                        and valor_aprobados >= float(valor_obj)
                    ):
                        updates["cumplido"] = True
                        updates["resultado_final"] = "exito"
                        updates["completed_at"] = ahora.isoformat()
                        cumplidos += 1
                        try:
                            from services.objetivos_notification_service import objetivos_notification
                            objetivos_notification.notify_objetivo_cumplido(
                                dist_id=dist_id,
                                id_vendedor=obj.get("id_vendedor"),
                                tipo=obj.get("tipo"),
                                nombre_pdv=obj.get("nombre_pdv"),
                            )
                        except Exception as e_notif:
                            logger.warning(f"[Watcher] Notif cumplido omitida obj={obj.get('id')}: {e_notif}")

                    # ── Expiración automática (fecha_objetivo vencida) ─────────
                    elif not updates.get("cumplido"):
                        fecha_obj_str = obj.get("fecha_objetivo")
                        if fecha_obj_str:
                            try:
                                fecha_limite = date.fromisoformat(str(fecha_obj_str)[:10])
                                if date.today() > fecha_limite:
                                    resultado = (
                                        "exito"
                                        if (valor_obj and float(valor_obj) > 0 and valor_aprobados >= float(valor_obj))
                                        else "falla"
                                    )
                                    updates["cumplido"] = True
                                    updates["resultado_final"] = resultado
                                    updates["completed_at"] = ahora.isoformat()
                                    cumplidos += 1
                                    logger.info(
                                        f"[Watcher] Objetivo {obj.get('id')} expirado → resultado={resultado}"
                                    )
                                    if resultado == "exito":
                                        try:
                                            from services.objetivos_notification_service import objetivos_notification
                                            objetivos_notification.notify_objetivo_cumplido(
                                                dist_id=dist_id,
                                                id_vendedor=obj.get("id_vendedor"),
                                                tipo=obj.get("tipo"),
                                                nombre_pdv=obj.get("nombre_pdv"),
                                            )
                                        except Exception as e_notif:
                                            logger.warning(f"[Watcher] Notif expirado omitida obj={obj.get('id')}: {e_notif}")
                            except (ValueError, TypeError) as e_fecha:
                                logger.warning(f"[Watcher] fecha_objetivo inválida obj={obj.get('id')}: {e_fecha}")

                    sb.table("objetivos").update(updates).eq("id", obj["id"]).execute()
                    actualizados += 1

                except Exception as e:
                    logger.warning(
                        f"[Watcher] Error procesando objetivo {obj.get('id')} "
                        f"tipo={obj.get('tipo')}: {e}"
                    )

            logger.info(
                f"[Watcher] dist={dist_id}: {len(objetivos)} objetivos, "
                f"{actualizados} actualizados, {cumplidos} cumplidos, "
                f"{eventos_nuevos} eventos nuevos"
            )
            return {
                "dist_id": dist_id,
                "procesados": len(objetivos),
                "actualizados": actualizados,
                "cumplidos": cumplidos,
                "eventos_nuevos": eventos_nuevos,
            }

        except Exception as e:
            logger.error(f"[Watcher] Error general dist={dist_id}: {e}")
            return {"dist_id": dist_id, "procesados": 0, "actualizados": 0, "error": str(e)}

    # ── Dispatcher ────────────────────────────────────────────────────────────

    def _process_objetivo(
        self, obj: dict, dist_id: int
    ) -> tuple[float, int] | None:
        """
        Retorna (nuevo_valor_actual, cantidad_eventos_nuevos) o None si
        el tipo no se procesa automáticamente.
        """
        tipo = obj.get("tipo")
        id_vendedor = obj.get("id_vendedor")
        created_at = obj.get("created_at", "")

        if tipo == "ruteo_alteo":
            return self._diff_alteo(obj, id_vendedor, dist_id, created_at)
        if tipo == "conversion_estado":
            return self._diff_activacion(obj, id_vendedor, dist_id, created_at)
        if tipo == "exhibicion":
            return self._diff_exhibicion(obj, id_vendedor, dist_id, created_at)
        if tipo == "cobranza":
            valor = self._compute_cobranza(obj, dist_id)
            if valor is None:
                return None
            return (valor, 0)  # cobranza no tiene eventos discretos
        return None  # "general"

    # ── Alteo ─────────────────────────────────────────────────────────────────

    def _diff_alteo(
        self, obj: dict, id_vendedor: int, dist_id: int, since: str
    ) -> tuple[float, int]:
        """
        Detecta nuevos PDVs en las rutas del vendedor creados después de
        'since' que no estén registrados en objetivos_tracking.
        """
        obj_id = obj["id"]
        try:
            rutas_res = (
                sb.table("rutas_v2")
                .select("id_ruta")
                .eq("id_vendedor", id_vendedor)
                .execute()
            )
            ruta_ids = [r["id_ruta"] for r in (rutas_res.data or [])]
            if not ruta_ids:
                return (float(obj.get("valor_actual") or 0), 0)

            clientes_res = (
                sb.table("clientes_pdv_v2")
                .select("id, id_cliente_erp, nombre_cliente, created_at")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", ruta_ids)
                .gte("created_at", since)
                .execute()
            )
            all_clients = clientes_res.data or []

            ya_trackeados = self._get_tracked_refs(obj_id, "alteo")
            nuevos = [c for c in all_clients if str(c["id"]) not in ya_trackeados]

            if nuevos:
                self._insert_tracking_batch(obj_id, "alteo", nuevos, id_llave="id", dist_id=dist_id, id_vendedor=id_vendedor)

            nuevo_valor = float(len(all_clients))
            return (nuevo_valor, len(nuevos))

        except Exception as e:
            logger.warning(f"[Watcher] alteo vend={id_vendedor}: {e}")
            return (float(obj.get("valor_actual") or 0), 0)

    # ── Activación ────────────────────────────────────────────────────────────

    def _diff_activacion(
        self, obj: dict, id_vendedor: int, dist_id: int, since: str
    ) -> tuple[float, int]:
        """
        Detecta PDVs cuya fecha_ultima_compra >= since que no estén en tracking.
        """
        obj_id = obj["id"]
        try:
            rutas_res = (
                sb.table("rutas_v2")
                .select("id_ruta")
                .eq("id_vendedor", id_vendedor)
                .execute()
            )
            ruta_ids = [r["id_ruta"] for r in (rutas_res.data or [])]
            if not ruta_ids:
                return (float(obj.get("valor_actual") or 0), 0)

            clientes_res = (
                sb.table("clientes_pdv_v2")
                .select("id, id_cliente_erp, nombre_cliente, fecha_ultima_compra")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", ruta_ids)
                .gte("fecha_ultima_compra", since[:10])
                .execute()
            )
            all_clients = clientes_res.data or []

            ya_trackeados = self._get_tracked_refs(obj_id, "activacion")
            nuevos = [c for c in all_clients if str(c["id"]) not in ya_trackeados]

            if nuevos:
                self._insert_tracking_batch(obj_id, "activacion", nuevos, id_llave="id", dist_id=dist_id, id_vendedor=id_vendedor)

            nuevo_valor = float(len(all_clients))
            return (nuevo_valor, len(nuevos))

        except Exception as e:
            logger.warning(f"[Watcher] activacion vend={id_vendedor}: {e}")
            return (float(obj.get("valor_actual") or 0), 0)

    # ── Exhibición ────────────────────────────────────────────────────────────

    def _diff_exhibicion(
        self, obj: dict, id_vendedor_v2: int, dist_id: int, since: str
    ) -> tuple[float, int]:
        """
        Detección dual de exhibiciones:
          Fase 1 (Pendiente): foto subida pero aún no aprobada — notifica "Foto recibida".
          Fase 2 (Aprobado):  foto aprobada — incrementa valor_actual y puede marcar cumplido.
        """
        obj_id = obj["id"]
        try:
            # Mapear id_vendedor_v2 → id_integrante
            int_res = (
                sb.table("integrantes_grupo")
                .select("id_integrante")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor_v2", id_vendedor_v2)
                .limit(1)
                .execute()
            )
            if not int_res.data:
                logger.warning(
                    f"[Watcher] No id_integrante para id_vendedor_v2={id_vendedor_v2}"
                )
                return (float(obj.get("valor_actual") or 0), 0)

            id_integrante = int_res.data[0]["id_integrante"]

            # ── Fase 1: fotos Pendientes ──────────────────────────────────────
            pend_res = (
                sb.table("exhibiciones")
                .select("id_exhibicion, id_cliente, timestamp_subida")
                .eq("id_distribuidor", dist_id)
                .eq("id_integrante", id_integrante)
                .eq("estado", "Pendiente")
                .gte("timestamp_subida", since)
                .execute()
            )
            pendientes = pend_res.data or []
            ya_pend = self._get_tracked_refs(obj_id, "exhibicion_pendiente")
            nuevas_pend = [e for e in pendientes if str(e["id_exhibicion"]) not in ya_pend]
            if nuevas_pend:
                self._insert_tracking_batch(
                    obj_id, "exhibicion_pendiente", nuevas_pend,
                    id_llave="id_exhibicion",
                    dist_id=dist_id,
                    id_vendedor=id_vendedor_v2,
                )

            # ── Fase 2: fotos Aprobadas ───────────────────────────────────────
            aprov_res = (
                sb.table("exhibiciones")
                .select("id_exhibicion, id_cliente, timestamp_subida")
                .eq("id_distribuidor", dist_id)
                .eq("id_integrante", id_integrante)
                .eq("estado", "Aprobado")
                .gte("timestamp_subida", since)
                .execute()
            )
            all_exhibs = aprov_res.data or []

            ya_trackeados = self._get_tracked_refs(obj_id, "exhibicion")
            nuevas = [e for e in all_exhibs if str(e["id_exhibicion"]) not in ya_trackeados]
            if nuevas:
                self._insert_tracking_batch(
                    obj_id, "exhibicion", nuevas,
                    id_llave="id_exhibicion",
                    dist_id=dist_id,
                    id_vendedor=id_vendedor_v2,
                )

            # Display valor includes pending photos so the UI shows immediate progress.
            # The third element (approved count) is used exclusively for the cumplido check.
            nuevo_valor = float(len(all_exhibs) + len(pendientes))
            return (nuevo_valor, len(nuevas) + len(nuevas_pend), float(len(all_exhibs)))

        except Exception as e:
            logger.error(f"[Watcher] exhibicion vend={id_vendedor_v2}: {e}")
            return (float(obj.get("valor_actual") or 0), 0)

    # ── Cobranza ──────────────────────────────────────────────────────────────

    def _compute_cobranza(self, obj: dict, dist_id: int) -> float | None:
        """Calcula cuánto se cobró (deuda_inicial - deuda_actual)."""
        estado_inicial = obj.get("estado_inicial")
        if not estado_inicial:
            return None
        try:
            deuda_inicial = float(estado_inicial)
        except (ValueError, TypeError):
            return None

        id_vendedor = obj.get("id_vendedor")
        try:
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
            return max(0.0, deuda_inicial - deuda_actual)
        except Exception as e:
            logger.warning(f"[Watcher] cobranza obj={obj.get('id')}: {e}")
            return None

    # ── Tracking helpers ──────────────────────────────────────────────────────

    def _get_tracked_refs(self, obj_id: str, tipo_evento: str) -> set[str]:
        """Devuelve el conjunto de id_referencia ya registrados en tracking."""
        try:
            res = (
                sb.table("objetivos_tracking")
                .select("id_referencia")
                .eq("id_objetivo", obj_id)
                .eq("tipo_evento", tipo_evento)
                .execute()
            )
            return {r["id_referencia"] for r in (res.data or [])}
        except Exception as e:
            logger.warning(f"[Watcher] _get_tracked_refs obj={obj_id}: {e}")
            return set()

    def _insert_tracking_batch(
        self,
        obj_id: str,
        tipo_evento: str,
        items: list[dict],
        id_llave: str,
        dist_id: int,
        id_vendedor: int,
    ) -> None:
        """
        Inserta registros nuevos en objetivos_tracking y dispara notificaciones.
        Usa upsert con on_conflict para evitar duplicados en race conditions.
        """
        from services.objetivos_notification_service import objetivos_notification

        rows = [
            {
                "id_objetivo": obj_id,
                "id_referencia": str(item[id_llave]),
                "tipo_evento": tipo_evento,
                "metadata": {
                    k: v for k, v in item.items()
                    if k not in (id_llave, "created_at")
                },
            }
            for item in items
        ]

        try:
            sb.table("objetivos_tracking").upsert(
                rows, on_conflict="id_objetivo,id_referencia,tipo_evento"
            ).execute()
            logger.info(
                f"[Watcher] tracking insertado: obj={obj_id} "
                f"tipo={tipo_evento} count={len(rows)}"
            )
        except Exception as e:
            logger.warning(f"[Watcher] upsert tracking: {e}")
            return

        # Notificar por cada evento nuevo
        for item in items:
            try:
                # Telegram al grupo del vendedor
                objetivos_notification.notify_vendor_telegram(
                    dist_id=dist_id,
                    id_objetivo=obj_id,
                    id_vendedor=id_vendedor,
                    tipo_evento=tipo_evento,
                    pdv_data=item,
                )
                # WebSocket al supervisor
                objetivos_notification.notify_supervisor_ws(
                    dist_id=dist_id,
                    event_data={
                        "tipo_evento": tipo_evento,
                        "id_objetivo": obj_id,
                        "pdv": item,
                    },
                )
            except Exception as e:
                logger.warning(f"[Watcher] Notificación fallida para item={item}: {e}")


# Singleton
objetivos_watcher = ObjetivosWatcherService()
