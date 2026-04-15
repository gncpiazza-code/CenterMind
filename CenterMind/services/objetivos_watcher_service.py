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
from datetime import date, datetime, timedelta, timezone
from typing import Any

from db import sb

logger = logging.getLogger("ObjetivosWatcher")


class ObjetivosWatcherService:
    """
    Actualiza valor_actual mediante detección de diferencias.
    Usa objetivos_tracking como tabla de deduplicación para no notificar
    el mismo evento dos veces.
    """

    def run_watcher(self, dist_id: int, obj_id: str | None = None) -> dict:
        """Entry point. Retorna dict con estadísticas de la ejecución.

        Si se pasa obj_id, sólo procesa ese objetivo (evita tocar objetivos
        ya en progreso cuando se crea uno nuevo).
        """
        try:
            q = (
                sb.table("objetivos")
                .select("*")
                .eq("id_distribuidor", dist_id)
                .eq("cumplido", False)
            )
            if obj_id is not None:
                q = q.eq("id", obj_id)
            else:
                # Omitir objetivos vencidos hace más de 1 día — los maneja la expiración
                cutoff = (date.today() - timedelta(days=1)).isoformat()
                q = q.or_(f"fecha_objetivo.is.null,fecha_objetivo.gte.{cutoff}")
            res = q.execute()
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
                                    else:
                                        try:
                                            from services.objetivos_notification_service import objetivos_notification
                                            objetivos_notification.notify_objetivo_fallido(
                                                dist_id=dist_id,
                                                id_vendedor=obj.get("id_vendedor"),
                                                tipo=obj.get("tipo"),
                                                nombre_pdv=obj.get("nombre_pdv"),
                                            )
                                        except Exception as e_notif:
                                            logger.warning(f"[Watcher] Notif fallido omitida obj={obj.get('id')}: {e_notif}")
                            except (ValueError, TypeError) as e_fecha:
                                logger.warning(f"[Watcher] fecha_objetivo inválida obj={obj.get('id')}: {e_fecha}")

                    # ── Exhibición con ítems: cerrar cabecera cuando cada PDV tiene desenlace ──
                    if obj.get("tipo") == "exhibicion" and not updates.get("cumplido"):
                        try:
                            items_rx = (
                                sb.table("objetivo_items")
                                .select("estado_item")
                                .eq("id_objetivo", obj["id"])
                                .execute()
                            )
                            its = items_rx.data or []
                            if its:
                                n_pend = sum(
                                    1
                                    for it in its
                                    if it.get("estado_item") in ("pendiente", "foto_subida")
                                )
                                n_falla = sum(
                                    1 for it in its if it.get("estado_item") == "falla"
                                )
                                n_ok = sum(
                                    1 for it in its if it.get("estado_item") == "cumplido"
                                )
                                if n_pend == 0 and (n_ok + n_falla) == len(its):
                                    updates["cumplido"] = True
                                    updates["resultado_final"] = (
                                        "falla" if n_falla else "exito"
                                    )
                                    updates["completed_at"] = ahora.isoformat()
                                    cumplidos += 1
                                    if n_falla == 0:
                                        try:
                                            from services.objetivos_notification_service import (
                                                objetivos_notification,
                                            )
                                            objetivos_notification.notify_objetivo_cumplido(
                                                dist_id=dist_id,
                                                id_vendedor=obj.get("id_vendedor"),
                                                tipo=obj.get("tipo"),
                                                nombre_pdv=obj.get("nombre_pdv"),
                                            )
                                        except Exception as e_notif:
                                            logger.warning(
                                                f"[Watcher] Notif cierre exhibición omitida "
                                                f"obj={obj.get('id')}: {e_notif}"
                                            )
                                    else:
                                        try:
                                            from services.objetivos_notification_service import (
                                                objetivos_notification,
                                            )
                                            objetivos_notification.notify_objetivo_fallido(
                                                dist_id=dist_id,
                                                id_vendedor=obj.get("id_vendedor"),
                                                tipo=obj.get("tipo"),
                                                nombre_pdv=obj.get("nombre_pdv"),
                                            )
                                        except Exception as e_notif:
                                            logger.warning(
                                                f"[Watcher] Notif cierre exhibición falla omitida "
                                                f"obj={obj.get('id')}: {e_notif}"
                                            )
                        except Exception as e_te:
                            logger.warning(
                                f"[Watcher] Cierre terminal exhibición obj={obj.get('id')}: {e_te}"
                            )

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

        Si el objetivo tiene objetivo_items, sólo evalúa esos PDVs específicos
        y marca como cumplido cada ítem cuyo PDV ya aparece en la ruta.
        """
        obj_id = obj["id"]
        try:
            # Multi-PDV con ítems: scope a los PDVs listados en objetivo_items
            item_pdv_ids = self._get_item_pdv_ids(obj_id)
            if item_pdv_ids is not None and len(item_pdv_ids) == 0:
                return (float(obj.get("valor_actual") or 0), 0)

            if item_pdv_ids:
                # Verificar qué ítems ya están en la ruta del vendedor
                clientes_res = (
                    sb.table("clientes_pdv_v2")
                    .select("id_cliente, id_cliente_erp, nombre_fantasia, fecha_alta, id_ruta")
                    .eq("id_distribuidor", dist_id)
                    .in_("id_cliente", item_pdv_ids)
                    .execute()
                )
                all_clients = clientes_res.data or []

                # Filtrar los que tienen una ruta asignada al vendedor
                rutas_res = sb.table("rutas_v2").select("id_ruta").eq("id_vendedor", id_vendedor).execute()
                ruta_ids = {r["id_ruta"] for r in (rutas_res.data or [])}

                ya_trackeados = self._get_tracked_refs(obj_id, "alteo")
                cumplidos = [c for c in all_clients if c.get("id_ruta") in ruta_ids and str(c["id_cliente"]) not in ya_trackeados]

                if cumplidos:
                    self._insert_tracking_batch(obj_id, "alteo", cumplidos, id_llave="id_cliente", dist_id=dist_id, id_vendedor=id_vendedor)
                    for c in cumplidos:
                        self._update_item_estado(obj_id, c["id_cliente"], "cumplido")

                # valor_actual = count de ítems cumplidos (por estado_item)
                try:
                    items_res = sb.table("objetivo_items").select("estado_item").eq("id_objetivo", obj_id).execute()
                    items = items_res.data or []
                    cumplidos_count = sum(1 for it in items if it.get("estado_item") == "cumplido")
                    return (float(cumplidos_count), len(cumplidos))
                except Exception as e_items:
                    logger.warning(f"[Watcher] alteo items relecture obj={obj_id}: {e_items}")
                return (float(obj.get("valor_actual") or 0), len(cumplidos))

            # Sin ítems: comportamiento original — contar PDVs nuevos en ruta
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
                .select("id_cliente, id_cliente_erp, nombre_fantasia, fecha_alta")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", ruta_ids)
                .gte("fecha_alta", since[:10])
                .execute()
            )
            all_clients = clientes_res.data or []

            ya_trackeados = self._get_tracked_refs(obj_id, "alteo")
            nuevos = [c for c in all_clients if str(c["id_cliente"]) not in ya_trackeados]

            if nuevos:
                self._insert_tracking_batch(obj_id, "alteo", nuevos, id_llave="id_cliente", dist_id=dist_id, id_vendedor=id_vendedor)

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

        Si el objetivo tiene objetivo_items, sólo evalúa esos PDVs específicos
        y marca como cumplido cada ítem cuyo PDV realizó una compra reciente.
        """
        obj_id = obj["id"]
        try:
            item_pdv_ids = self._get_item_pdv_ids(obj_id)
            if item_pdv_ids is not None and len(item_pdv_ids) == 0:
                return (float(obj.get("valor_actual") or 0), 0)

            if item_pdv_ids:
                clientes_res = (
                    sb.table("clientes_pdv_v2")
                    .select("id_cliente, id_cliente_erp, nombre_fantasia, fecha_ultima_compra")
                    .eq("id_distribuidor", dist_id)
                    .in_("id_cliente", item_pdv_ids)
                    .gte("fecha_ultima_compra", since[:10])
                    .execute()
                )
                all_clients = clientes_res.data or []

                ya_trackeados = self._get_tracked_refs(obj_id, "activacion")
                nuevos = [c for c in all_clients if str(c["id_cliente"]) not in ya_trackeados]

                if nuevos:
                    self._insert_tracking_batch(obj_id, "activacion", nuevos, id_llave="id_cliente", dist_id=dist_id, id_vendedor=id_vendedor)
                    for c in nuevos:
                        self._update_item_estado(obj_id, c["id_cliente"], "cumplido")

                # valor_actual = count de ítems cumplidos
                try:
                    items_res = sb.table("objetivo_items").select("estado_item").eq("id_objetivo", obj_id).execute()
                    items = items_res.data or []
                    cumplidos_count = sum(1 for it in items if it.get("estado_item") == "cumplido")
                    return (float(cumplidos_count), len(nuevos))
                except Exception as e_items:
                    logger.warning(f"[Watcher] activacion items relecture obj={obj_id}: {e_items}")
                return (float(obj.get("valor_actual") or 0), len(nuevos))

            # Sin ítems: comportamiento original
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
                .select("id_cliente, id_cliente_erp, nombre_fantasia, fecha_ultima_compra")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", ruta_ids)
                .gte("fecha_ultima_compra", since[:10])
                .execute()
            )
            all_clients = clientes_res.data or []

            ya_trackeados = self._get_tracked_refs(obj_id, "activacion")
            nuevos = [c for c in all_clients if str(c["id_cliente"]) not in ya_trackeados]

            if nuevos:
                self._insert_tracking_batch(obj_id, "activacion", nuevos, id_llave="id_cliente", dist_id=dist_id, id_vendedor=id_vendedor)

            nuevo_valor = float(len(all_clients))
            return (nuevo_valor, len(nuevos))

        except Exception as e:
            logger.warning(f"[Watcher] activacion vend={id_vendedor}: {e}")
            return (float(obj.get("valor_actual") or 0), 0)

    # ── Exhibición ────────────────────────────────────────────────────────────

    def _get_item_pdv_ids(self, obj_id: str) -> list[int] | None:
        """Devuelve los id_cliente_pdv de objetivo_items para un objetivo, o None si no hay ítems."""
        try:
            res = (
                sb.table("objetivo_items")
                .select("id_cliente_pdv")
                .eq("id_objetivo", obj_id)
                .execute()
            )
            if res.data:
                return [r["id_cliente_pdv"] for r in res.data if r.get("id_cliente_pdv")]
            return None
        except Exception as e:
            logger.warning(f"[Watcher] _get_item_pdv_ids obj={obj_id}: {e}")
            return None

    # Orden de estados de ítem: menor índice = estado más temprano
    _ITEM_STATE_ORDER = {"pendiente": 0, "foto_subida": 1, "cumplido": 2, "falla": 2}

    def _update_item_estado(self, obj_id: str, id_cliente_pdv: int, estado_item: str) -> None:
        """Actualiza el estado_item de un ítem específico.

        Guard: los estados terminales ('cumplido', 'falla') no pueden retroceder a
        estados anteriores. Esto evita que el watcher revierta evaluaciones ya cerradas.
        """
        TERMINAL = {"cumplido", "falla"}
        try:
            from datetime import datetime, timezone
            # Verificar estado actual antes de sobreescribir
            existing = (
                sb.table("objetivo_items")
                .select("estado_item")
                .eq("id_objetivo", obj_id)
                .eq("id_cliente_pdv", id_cliente_pdv)
                .limit(1)
                .execute()
            )
            current = (existing.data or [{}])[0].get("estado_item", "")
            if current in TERMINAL and estado_item not in TERMINAL:
                # No retroceder desde un estado terminal
                logger.debug(
                    f"[Watcher] Guard: ítem obj={obj_id} pdv={id_cliente_pdv} "
                    f"permanece en '{current}' (ignorando '{estado_item}')"
                )
                return
            sb.table("objetivo_items").update({
                "estado_item": estado_item,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id_objetivo", obj_id).eq("id_cliente_pdv", id_cliente_pdv).execute()
        except Exception as e:
            logger.warning(f"[Watcher] _update_item_estado obj={obj_id} pdv={id_cliente_pdv}: {e}")

    def _diff_exhibicion(
        self, obj: dict, id_vendedor_v2: int, dist_id: int, since: str
    ) -> tuple[float, int]:
        """
        Detección dual de exhibiciones:
          Fase 1 (Pendiente): foto subida pero aún no aprobada — notifica "Foto recibida".
          Fase 2 (Aprobado):  foto aprobada — incrementa valor_actual y puede marcar cumplido.

        Si el objetivo tiene ítems en objetivo_items, scope a esos PDVs específicamente.
        Si no hay ítems ni id_target_pdv (meta global de exhibición), sólo cuenta exhibiciones
        con id_objetivo = esta meta (seteado por el bot al subir la foto).
        """
        obj_id = obj["id"]
        try:
            # Resolver ítems PDV (si existen)
            item_pdv_ids = self._get_item_pdv_ids(obj_id)
            # Guard: lista explícitamente vacía significa 0 PDVs asignados → nada que trackear
            if item_pdv_ids is not None and len(item_pdv_ids) == 0:
                return (float(obj.get("valor_actual") or 0), 0)

            # Mapear vendedor → id_integrante (v2, luego ERP / paginado — misma lógica que Telegram)
            from services.objetivos_notification_service import (
                resolve_integrante_for_objetivos,
            )

            ig_row = resolve_integrante_for_objetivos(dist_id, id_vendedor_v2)
            if not ig_row or ig_row.get("id_integrante") is None:
                logger.warning(
                    f"[Watcher] No id_integrante para id_vendedor_v2={id_vendedor_v2} "
                    f"dist={dist_id} — revisá integrantes_grupo (id_vendedor_v2 / id_vendedor_erp)"
                )
                return (float(obj.get("valor_actual") or 0), 0)

            id_integrante = ig_row["id_integrante"]

            def _build_exhibicion_query(estado: str):
                q = (
                    sb.table("exhibiciones")
                    .select("id_exhibicion, id_cliente_pdv, timestamp_subida")
                    .eq("id_distribuidor", dist_id)
                    .eq("id_integrante", id_integrante)
                    .eq("estado", estado)
                    .gte("timestamp_subida", since)
                )
                if item_pdv_ids:
                    q = q.in_("id_cliente_pdv", item_pdv_ids)
                elif obj.get("id_target_pdv") is None:
                    # Exhibición global: no mezclar con otras metas ni fotos sin enlazar.
                    q = q.eq("id_objetivo", obj_id)
                return q.execute()

            # ── Fase 1: fotos Pendientes ──────────────────────────────────────
            pend_res = _build_exhibicion_query("Pendiente")
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
                # Marcar ítems como foto_subida
                if item_pdv_ids:
                    for exhib in nuevas_pend:
                        pdv = exhib.get("id_cliente_pdv")
                        if pdv and pdv in item_pdv_ids:
                            self._update_item_estado(obj_id, pdv, "foto_subida")

            # ── Fase 2: fotos Aprobadas ───────────────────────────────────────
            aprov_res = _build_exhibicion_query("Aprobado")
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
                # Marcar ítems como cumplido
                if item_pdv_ids:
                    for exhib in nuevas:
                        pdv = exhib.get("id_cliente_pdv")
                        if pdv and pdv in item_pdv_ids:
                            self._update_item_estado(obj_id, pdv, "cumplido")

            # Si hay ítems: valor_actual = ítems con foto o cumplidos
            if item_pdv_ids:
                try:
                    items_res = sb.table("objetivo_items") \
                        .select("estado_item") \
                        .eq("id_objetivo", obj_id) \
                        .execute()
                    items = items_res.data or []
                    con_foto = sum(1 for it in items if it.get("estado_item") in ("foto_subida", "cumplido"))
                    aprobados = sum(1 for it in items if it.get("estado_item") == "cumplido")
                    return (float(con_foto), len(nuevas) + len(nuevas_pend), float(aprobados))
                except Exception as e_items:
                    logger.warning(f"[Watcher] Error releyendo items exhibicion obj={obj_id}: {e_items}")
                    # Caer al conteo por exhibiciones acotado a item_pdv_ids (único PDV)

            # Sin filas en objetivo_items (item_pdv_ids es None), o falló la relecutura de ítems:
            # contar PDVs únicos, no filas de exhibiciones.
            # no filas de exhibiciones — varias fotos al mismo cliente no duplican progreso.
            pdv_con_actividad: set[int] = set()
            for e in pendientes:
                pid = e.get("id_cliente_pdv")
                if pid is not None:
                    pdv_con_actividad.add(int(pid))
            for e in all_exhibs:
                pid = e.get("id_cliente_pdv")
                if pid is not None:
                    pdv_con_actividad.add(int(pid))
            nuevo_valor = float(len(pdv_con_actividad))
            pdv_solo_aprob = {
                int(e["id_cliente_pdv"])
                for e in all_exhibs
                if e.get("id_cliente_pdv") is not None
            }
            valor_aprobados = float(len(pdv_solo_aprob))
            return (nuevo_valor, len(nuevas) + len(nuevas_pend), valor_aprobados)

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
