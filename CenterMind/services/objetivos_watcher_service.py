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
import unicodedata
from datetime import date, datetime, timedelta, timezone
from typing import Any

from db import sb
from core.tenant_tables import tenant_table_name

logger = logging.getLogger("ObjetivosWatcher")


def _norm_origen(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    txt = "".join(
        c for c in unicodedata.normalize("NFD", raw)
        if unicodedata.category(c) != "Mn"
    )
    txt = " ".join(txt.split())
    if txt in {"compania", "company"}:
        return "compania"
    if txt in {"distribuidora", "distributor"}:
        return "distribuidora"
    return txt


def _compania_retro_since(
    obj: dict,
    default_since: str,
    *,
    as_timestamp: bool = False,
) -> str:
    """
    Objetivos compañía: contar desde el 1° del mes_referencia (retroactividad mensual).
    Fallback: fecha_objetivo → created_at → default_since.
    """
    if _norm_origen(obj.get("origen")) != "compania":
        return default_since
    try:
        mes_referencia = obj.get("mes_referencia")
        base_raw = (
            str(mes_referencia)[:10]
            if mes_referencia
            else str(obj.get("fecha_objetivo") or obj.get("created_at") or "")[:10]
        )
        if not base_raw:
            return default_since
        first_day = date.fromisoformat(base_raw).replace(day=1)
        if as_timestamp:
            return f"{first_day.isoformat()}T00:00:00"
        return first_day.isoformat()
    except Exception as e_retro:
        logger.warning(
            f"[Watcher] Retroactividad compañía inválida obj={obj.get('id')}: {e_retro}"
        )
        return default_since


def _objetivo_listo_para_watcher(obj: dict) -> bool:
    """
    Distribuidora: requiere lanzado_at (objetivo notificado / activo).
    Compañía: retroactividad desde mes_referencia si fecha_inicio <= hoy,
    aunque aún no haya Telegram (lanzado_at NULL).
    """
    if obj.get("lanzado_at"):
        return True
    if _norm_origen(obj.get("origen")) != "compania":
        return False
    fi = str(obj.get("fecha_inicio") or "")[:10]
    if not fi:
        return True
    try:
        return date.fromisoformat(fi) <= date.today()
    except ValueError:
        return True


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
                    if not _objetivo_listo_para_watcher(obj):
                        continue

                    result = self._process_objetivo(obj, dist_id)
                    if result is None:
                        continue  # tipo general o sin datos base

                    progreso_diario = {}
                    if len(result) == 4:
                        nuevo_valor, nuevos_eventos, valor_aprobados, progreso_diario = result
                    elif len(result) == 3:
                        nuevo_valor, nuevos_eventos, valor_aprobados = result
                    else:
                        nuevo_valor, nuevos_eventos = result
                        valor_aprobados = nuevo_valor
                    eventos_nuevos += nuevos_eventos

                    updates: dict[str, Any] = {
                        "valor_actual": nuevo_valor,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }

                    if progreso_diario:
                        dc = obj.get("desglose_cache") or {}
                        dc["progreso_diario"] = progreso_diario
                        dc["progreso_diario_updated_at"] = date.today().isoformat()
                        updates["desglose_cache"] = dc

                    valor_obj = obj.get("valor_objetivo")
                    ahora = datetime.now(timezone.utc)
                    tasa_p = obj.get("tasa_pendientes")
                    umbral_meta = float(valor_obj) if valor_obj else 0.0
                    tasa_p_efectiva = tasa_p
                    if valor_obj and tasa_p is not None:
                        tasa_val = float(tasa_p)
                        meta_val = float(valor_obj)
                        if tasa_val >= meta_val:
                            logger.warning(
                                f"[Watcher] tasa_pendientes={tasa_p} >= meta={valor_obj} en "
                                f"obj={obj.get('id')} — se trata como P=0 (sin margen)"
                            )
                            tasa_p_efectiva = 0
                        elif tasa_val > 0:
                            umbral_meta = max(0.0, meta_val - tasa_val)

                    # Calcular pendientes para desglose_cache (tipos con ítems).
                    # Se escribe SIEMPRE para mantener estado de pendientes actualizado,
                    # incluso cuando la barra llega al 100% (cumplido=True se setea aparte).
                    if obj.get("tipo") in ("conversion_estado", "ruteo_alteo") and obj.get("id"):
                        try:
                            items_pend_res = (
                                sb.table("objetivo_items")
                                .select("id_cliente_pdv, nombre_pdv, estado_item")
                                .eq("id_objetivo", obj["id"])
                                .neq("estado_item", "cumplido")
                                .limit(21)
                                .execute()
                            )
                            pend_items = items_pend_res.data or []
                            pendientes_count = len(pend_items)
                            pendientes_ids = [
                                str(it.get("id_cliente_pdv") or it.get("nombre_pdv") or "")
                                for it in pend_items[:20]
                            ]
                            updates["desglose_cache"] = {
                                **updates.get("desglose_cache", {}),
                                "tasa_pendientes": tasa_p_efectiva,
                                "pendientes_count": pendientes_count,
                                "pendientes_items": pendientes_ids,
                            }
                        except Exception as e_pend:
                            logger.warning(f"[Watcher] desglose_cache pendientes obj={obj.get('id')}: {e_pend}")

                    # ── Cumplido por progreso (meta alcanzada con umbral tasa) ──
                    if (
                        valor_obj
                        and float(valor_obj) > 0
                        and valor_aprobados >= umbral_meta
                    ):
                        updates["cumplido"] = True
                        updates["resultado_final"] = "exito"
                        updates["completed_at"] = ahora.isoformat()
                        cumplidos += 1

                    # ── Expiración automática (fecha_objetivo vencida) ─────────
                    elif not updates.get("cumplido"):
                        fecha_obj_str = obj.get("fecha_objetivo")
                        if fecha_obj_str:
                            try:
                                fecha_limite = date.fromisoformat(str(fecha_obj_str)[:10])
                                if date.today() > fecha_limite:
                                    resultado = (
                                        "exito"
                                        if (valor_obj and float(valor_obj) > 0 and valor_aprobados >= umbral_meta)
                                        else "falla"
                                    )
                                    updates["cumplido"] = True
                                    updates["resultado_final"] = resultado
                                    updates["completed_at"] = ahora.isoformat()
                                    cumplidos += 1
                                    logger.info(
                                        f"[Watcher] Objetivo {obj.get('id')} expirado → resultado={resultado}"
                                    )
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
        origen = _norm_origen(obj.get("origen"))

        if tipo == "ruteo_alteo":
            since = created_at[:10] if created_at else ""
            since = _compania_retro_since(obj, since, as_timestamp=False)
            return self._diff_alteo(obj, id_vendedor, dist_id, since)
            
        if tipo == "conversion_estado":
            since = created_at[:10] if created_at else ""
            # Sin retroactividad para activación
            return self._diff_activacion(obj, id_vendedor, dist_id, since)
            
        if tipo == "exhibicion":
            # Retroactividad solo para objetivos de compañía:
            # si la meta se crea a mitad de mes, tomar exhibiciones desde el 1er día del mes.
            since = _compania_retro_since(obj, created_at or "", as_timestamp=True)
            return self._diff_exhibicion(obj, id_vendedor, dist_id, since)
        if tipo == "compradores":
            from core.objetivos_compradores import compradores_en_periodo, periodo_desde_hasta_objetivo
            desde, hasta = periodo_desde_hasta_objetivo(obj)
            if origen == "compania":
                desde = _compania_retro_since(obj, desde, as_timestamp=False)
            return self._diff_compradores(obj, id_vendedor, dist_id, desde, hasta)

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
        Detecta nuevos PDVs por FECHA DE ALTA (padrón) posteriores a `since`
        que no estén registrados en objetivos_tracking.

        Si el objetivo tiene objetivo_items, sólo evalúa esos PDVs específicos
        y marca como cumplido cada ítem cuya fecha_alta es posterior al objetivo.

        Si obj["alteo_con_venta"] es True, solo cuentan los PDVs que además
        tienen al menos una venta (importe > 0) desde su fecha_alta hasta la
        fecha_objetivo del objetivo.
        """
        obj_id = obj["id"]
        try:
            # Multi-PDV con ítems: scope a los PDVs listados en objetivo_items
            item_pdv_ids = self._get_item_pdv_ids(obj_id)
            if item_pdv_ids is not None and len(item_pdv_ids) == 0:
                return (float(obj.get("valor_actual") or 0), 0)

            if item_pdv_ids or obj.get("id_target_pdv") is not None:
                # En alteo NO se usa cambio de ruta como señal de cumplimiento:
                # solo fecha_alta posterior al alta del objetivo.
                q = (
                    sb.table(tenant_table_name("clientes_pdv_v2", dist_id))
                    .select("id_cliente, id_cliente_erp, nombre_fantasia, fecha_alta")
                    .eq("id_distribuidor", dist_id)
                    .gte("fecha_alta", since)
                )
                if item_pdv_ids:
                    q = q.in_("id_cliente", item_pdv_ids)
                else:
                    q = q.eq("id_cliente", obj.get("id_target_pdv"))
                
                clientes_res = q.execute()
                all_clients = clientes_res.data or []

                progreso_diario: dict[str, int] = {}
                for c in all_clients:
                    dkey = str(c.get("fecha_alta") or "")[:10]
                    if dkey:
                        progreso_diario[dkey] = progreso_diario.get(dkey, 0) + 1

                # ── alteo_con_venta: filtrar solo PDVs con venta válida ────────
                alteo_con_venta = bool(obj.get("alteo_con_venta"))
                if alteo_con_venta and all_clients:
                    try:
                        from core.objetivos_alteo_venta import split_alteos_con_sin_venta
                        hasta_obj = str(obj.get("fecha_objetivo") or date.today().isoformat())[:10]
                        con_venta, sin_venta_list, progreso_diario_con, progreso_diario_total = (
                            split_alteos_con_sin_venta(all_clients, dist_id, id_vendedor, hasta=hasta_obj)
                        )
                        progreso_diario = progreso_diario_con
                        # Sobrescribir all_clients solo para el conteo de valor_aprobados
                        _all_clients_con_venta = con_venta
                        _alteos_totales = len(all_clients)
                        _alteos_con_venta = len(con_venta)
                        _alteos_sin_venta = len(sin_venta_list)
                    except Exception as e_av:
                        logger.warning(f"[Watcher] alteo_con_venta split obj={obj_id}: {e_av}")
                        _all_clients_con_venta = all_clients
                        _alteos_totales = len(all_clients)
                        _alteos_con_venta = len(all_clients)
                        _alteos_sin_venta = 0
                else:
                    _all_clients_con_venta = all_clients
                    _alteos_totales = len(all_clients)
                    _alteos_con_venta = len(all_clients)
                    _alteos_sin_venta = 0

                # cumplidos = PDVs nuevos (no trackeados) que cumplen la condición final
                effective_clients = _all_clients_con_venta if alteo_con_venta else all_clients
                ya_trackeados_this = self._get_globally_tracked_refs(dist_id, "alteo") if not item_pdv_ids else self._get_tracked_refs(obj_id, "alteo")
                cumplidos_effective = [c for c in effective_clients if str(c["id_cliente"]) not in ya_trackeados_this]
                cumplidos = cumplidos_effective

                if cumplidos:
                    self._insert_tracking_batch(obj_id, "alteo", cumplidos, id_llave="id_cliente", dist_id=dist_id, id_vendedor=id_vendedor, obj_created_at=obj.get("created_at"))
                    if item_pdv_ids:
                        for c in cumplidos:
                            self._update_item_estado(obj_id, c["id_cliente"], "cumplido")

                if item_pdv_ids:
                    try:
                        items_res = sb.table("objetivo_items").select("estado_item").eq("id_objetivo", obj_id).execute()
                        items = items_res.data or []
                        cumplidos_count = sum(1 for it in items if it.get("estado_item") == "cumplido")
                        _valor_aprobados = float(len(effective_clients)) if alteo_con_venta else float(cumplidos_count)
                        # Enriquecer desglose_cache si alteo_con_venta
                        if alteo_con_venta:
                            try:
                                dc = obj.get("desglose_cache") or {}
                                dc["alteos_totales"] = _alteos_totales
                                dc["alteos_con_venta"] = _alteos_con_venta
                                dc["alteos_sin_venta"] = _alteos_sin_venta
                                sb.table("objetivos").update({"desglose_cache": dc}).eq("id", obj_id).execute()
                            except Exception as e_dc:
                                logger.warning(f"[Watcher] alteo_con_venta desglose_cache obj={obj_id}: {e_dc}")
                        return (float(cumplidos_count), len(cumplidos), _valor_aprobados, progreso_diario)
                    except Exception as e_items:
                        logger.warning(f"[Watcher] alteo items relecture obj={obj_id}: {e_items}")
                    return (float(obj.get("valor_actual") or 0), len(cumplidos), float(obj.get("valor_actual") or 0), progreso_diario)
                else:
                    # Single PDV target
                    valor_aprobados_single = float(len(effective_clients)) if alteo_con_venta else float(obj.get("valor_actual") or 0) + len(cumplidos)
                    nuevo_valor = float(obj.get("valor_actual") or 0) + len(cumplidos)
                    return (nuevo_valor, len(cumplidos), valor_aprobados_single, progreso_diario)

            # Sin ítems y sin target PDV: comportamiento original (todas las rutas del vendedor)
            rutas_res = (
                sb.table(tenant_table_name("rutas_v2", dist_id))
                .select("id_ruta")
                .eq("id_vendedor", id_vendedor)
                .execute()
            )
            ruta_ids = [r["id_ruta"] for r in (rutas_res.data or [])]
            if not ruta_ids:
                return (float(obj.get("valor_actual") or 0), 0)

            clientes_res = (
                sb.table(tenant_table_name("clientes_pdv_v2", dist_id))
                .select("id_cliente, id_cliente_erp, nombre_fantasia, fecha_alta")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", ruta_ids)
                .gte("fecha_alta", since)
                .execute()
            )
            all_clients = clientes_res.data or []

            # ── alteo_con_venta: filtrar solo PDVs con venta válida ────────
            alteo_con_venta_global = bool(obj.get("alteo_con_venta"))
            progreso_diario: dict[str, int] = {}
            alteos_totales_g = len(all_clients)

            if alteo_con_venta_global and all_clients:
                try:
                    from core.objetivos_alteo_venta import split_alteos_con_sin_venta
                    hasta_obj_g = str(obj.get("fecha_objetivo") or date.today().isoformat())[:10]
                    con_venta_g, sin_venta_g, progreso_diario_con_g, progreso_diario_total_g = (
                        split_alteos_con_sin_venta(all_clients, dist_id, id_vendedor, hasta=hasta_obj_g)
                    )
                    progreso_diario = progreso_diario_con_g
                    effective_clients_g = con_venta_g
                    alteos_con_venta_g = len(con_venta_g)
                    alteos_sin_venta_g = len(sin_venta_g)
                except Exception as e_av_g:
                    logger.warning(f"[Watcher] alteo_con_venta global split obj={obj_id}: {e_av_g}")
                    effective_clients_g = all_clients
                    alteos_con_venta_g = len(all_clients)
                    alteos_sin_venta_g = 0
            else:
                for c in all_clients:
                    dkey = str(c.get("fecha_alta") or "")[:10]
                    if dkey:
                        progreso_diario[dkey] = progreso_diario.get(dkey, 0) + 1
                effective_clients_g = all_clients
                alteos_con_venta_g = len(all_clients)
                alteos_sin_venta_g = 0

            ya_trackeados = self._get_globally_tracked_refs(dist_id, "alteo")
            nuevos = [c for c in effective_clients_g if str(c["id_cliente"]) not in ya_trackeados]

            if nuevos:
                self._insert_tracking_batch(obj_id, "alteo", nuevos, id_llave="id_cliente", dist_id=dist_id, id_vendedor=id_vendedor, obj_created_at=obj.get("created_at"))

            valor_aprobados_g = float(len(effective_clients_g))
            nuevo_valor = float(len(all_clients)) if not alteo_con_venta_global else valor_aprobados_g

            # Enriquecer desglose_cache con métricas alteo_con_venta
            if alteo_con_venta_global:
                try:
                    dc_g = obj.get("desglose_cache") or {}
                    dc_g["alteos_totales"] = alteos_totales_g
                    dc_g["alteos_con_venta"] = alteos_con_venta_g
                    dc_g["alteos_sin_venta"] = alteos_sin_venta_g
                    sb.table("objetivos").update({"desglose_cache": dc_g}).eq("id", obj_id).execute()
                except Exception as e_dc_g:
                    logger.warning(f"[Watcher] alteo_con_venta desglose_cache global obj={obj_id}: {e_dc_g}")

            return (nuevo_valor, len(nuevos), valor_aprobados_g, progreso_diario)

        except Exception as e:
            logger.warning(f"[Watcher] alteo vend={id_vendedor}: {e}")
            return (float(obj.get("valor_actual") or 0), 0)

    # ── Activación ────────────────────────────────────────────────────────────

    def _diff_activacion(
        self, obj: dict, id_vendedor: int, dist_id: int, since: str
    ) -> tuple[float, int]:
        """
        Detecta PDVs reactivados en el período (conversion_estado / activación).

        Regla canónica: core.compras_fechas.es_activacion_en_periodo
        (inactivo +30d al inicio, compra en [since, hasta], no comprador previo del mes).
        """
        obj_id = obj["id"]
        desde_d = str(since or "")[:10]
        hasta_d = str(obj.get("fecha_objetivo") or date.today().isoformat())[:10]

        def _filter_activaciones_validas(clients: list[dict]) -> list[dict]:
            if not clients:
                return clients
            try:
                from core.compras_fechas import es_activacion_en_periodo

                return [
                    c
                    for c in clients
                    if es_activacion_en_periodo(
                        c.get("fecha_ultima_compra"),
                        c.get("fecha_compra_anterior"),
                        desde_d,
                        hasta_d,
                    )
                ]
            except Exception as filter_err:
                logger.warning(f"[Watcher] Error filtrando activacion valida: {filter_err}")
                return []

        def _filter_sales_before_objective(clients: list[dict], since_str: str) -> list[dict]:
            # Evita contar ventas que se ingirieron ANTES de la creación del objetivo
            if not clients:
                return clients
            try:
                since_date = since_str[:10]
                
                erp_ids = [str(c["id_cliente_erp"]) for c in clients if c.get("id_cliente_erp")]
                valid_erps = set()
                if erp_ids:
                    ventas_enr_res = (
                        sb.table(tenant_table_name("ventas_enriched_v2", dist_id))
                        .select("id_cliente_erp")
                        .eq("id_distribuidor", dist_id)
                        .in_("id_cliente_erp", erp_ids)
                        .gte("fecha_factura", since_date)
                        .gte("created_at", since_str)
                        .execute()
                    )
                    valid_erps = {str(v["id_cliente_erp"]) for v in (ventas_enr_res.data or []) if v.get("id_cliente_erp")}
                    
                    # Fallback para ventas recientes que no estén en ventas_enriched_v2
                    try:
                        agg_res = (
                            sb.table("ventas_comprobantes_agg_cliente")
                            .select("cliente_codigo, ventas_comprobantes_analytics_runs!inner(fecha_rango_desde, created_at)")
                            .eq("id_distribuidor", dist_id)
                            .in_("cliente_codigo", erp_ids)
                            .gte("ventas_comprobantes_analytics_runs.fecha_rango_desde", since_date)
                            .gte("ventas_comprobantes_analytics_runs.created_at", since_str)
                            .execute()
                        )
                        valid_erps.update(str(v["cliente_codigo"]) for v in (agg_res.data or []) if v.get("cliente_codigo"))
                    except Exception as e_agg:
                        logger.warning(f"[Watcher] Error consultando ventas_comprobantes_agg_cliente para valid_erps: {e_agg}")
                
                client_ids = [int(c["id_cliente"]) for c in clients if c.get("id_cliente")]
                valid_ids = set()
                if client_ids:
                    ventas_res = (
                        sb.table("ventas_v2")
                        .select("id_cliente")
                        .eq("id_distribuidor", dist_id)
                        .in_("id_cliente", client_ids)
                        .gte("fecha", since_date)
                        .gte("created_at", since_str)
                        .execute()
                    )
                    valid_ids = {int(v["id_cliente"]) for v in (ventas_res.data or []) if v.get("id_cliente")}
                    
                return [
                    c
                    for c in clients
                    if (str(c.get("id_cliente_erp")) in valid_erps)
                    or (c.get("id_cliente") and int(c["id_cliente"]) in valid_ids)
                ]
            except Exception as filter_err:
                logger.warning(f"[Watcher] Error filtrando ventas previas a objetivo: {filter_err}")
                # Fallback: si falla, no filtramos para no romper el flujo
                return clients

        try:
            item_pdv_ids = self._get_item_pdv_ids(obj_id)
            if item_pdv_ids is not None and len(item_pdv_ids) == 0:
                return (float(obj.get("valor_actual") or 0), 0)

            if item_pdv_ids or obj.get("id_target_pdv") is not None:
                q = (
                    sb.table(tenant_table_name("clientes_pdv_v2", dist_id))
                    .select(
                        "id_cliente, id_cliente_erp, nombre_fantasia, "
                        "fecha_ultima_compra, fecha_compra_anterior"
                    )
                    .eq("id_distribuidor", dist_id)
                    .gte("fecha_ultima_compra", since)
                )
                if item_pdv_ids:
                    q = q.in_("id_cliente", item_pdv_ids)
                else:
                    q = q.eq("id_cliente", obj.get("id_target_pdv"))
                
                clientes_res = q.execute()
                all_clients = clientes_res.data or []
                all_clients = _filter_activaciones_validas(all_clients)
                all_clients = _filter_sales_before_objective(all_clients, since)

                ya_trackeados = self._get_tracked_refs(obj_id, "activacion")
                nuevos = [c for c in all_clients if str(c["id_cliente"]) not in ya_trackeados]

                progreso_diario = {}
                for c in all_clients:
                    dkey = str(c.get("fecha_ultima_compra") or "")[:10]
                    if dkey:
                        progreso_diario[dkey] = progreso_diario.get(dkey, 0) + 1

                if nuevos:
                    self._insert_tracking_batch(obj_id, "activacion", nuevos, id_llave="id_cliente", dist_id=dist_id, id_vendedor=id_vendedor, obj_created_at=obj.get("created_at"))
                    if item_pdv_ids:
                        for c in nuevos:
                            self._update_item_estado(obj_id, c["id_cliente"], "cumplido")

                if item_pdv_ids:
                    try:
                        items_res = sb.table("objetivo_items").select("estado_item").eq("id_objetivo", obj_id).execute()
                        items = items_res.data or []
                        cumplidos_count = sum(1 for it in items if it.get("estado_item") == "cumplido")
                        return (float(cumplidos_count), len(nuevos), float(cumplidos_count), progreso_diario)
                    except Exception as e_items:
                        logger.warning(f"[Watcher] activacion items relecture obj={obj_id}: {e_items}")
                    return (float(obj.get("valor_actual") or 0), len(nuevos), float(obj.get("valor_actual") or 0), progreso_diario)
                else:
                    nuevo_valor = float(obj.get("valor_actual") or 0) + len(nuevos)
                    return (nuevo_valor, len(nuevos), nuevo_valor, progreso_diario)

            # Sin ítems y sin target PDV: comportamiento original (todas las rutas del vendedor)
            rutas_res = (
                sb.table(tenant_table_name("rutas_v2", dist_id))
                .select("id_ruta")
                .eq("id_vendedor", id_vendedor)
                .execute()
            )
            ruta_ids = [r["id_ruta"] for r in (rutas_res.data or [])]
            if not ruta_ids:
                return (float(obj.get("valor_actual") or 0), 0)

            clientes_res = (
                sb.table(tenant_table_name("clientes_pdv_v2", dist_id))
                .select(
                    "id_cliente, id_cliente_erp, nombre_fantasia, "
                    "fecha_ultima_compra, fecha_compra_anterior"
                )
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", ruta_ids)
                .gte("fecha_ultima_compra", since)
                .execute()
            )
            all_clients = clientes_res.data or []
            all_clients = _filter_activaciones_validas(all_clients)
            all_clients = _filter_sales_before_objective(all_clients, since)

            ya_trackeados = self._get_tracked_refs(obj_id, "activacion")
            nuevos = [c for c in all_clients if str(c["id_cliente"]) not in ya_trackeados]

            progreso_diario = {}
            for c in all_clients:
                dkey = str(c.get("fecha_ultima_compra") or "")[:10]
                if dkey:
                    progreso_diario[dkey] = progreso_diario.get(dkey, 0) + 1

            if nuevos:
                self._insert_tracking_batch(obj_id, "activacion", nuevos, id_llave="id_cliente", dist_id=dist_id, id_vendedor=id_vendedor, obj_created_at=obj.get("created_at"))

            nuevo_valor = float(len(all_clients))
            return (nuevo_valor, len(nuevos), nuevo_valor, progreso_diario)

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

            # Todos los integrantes del vendedor (v2 + código ERP sin v2 — misma regla que /stats)
            from core.helpers import resolve_integrante_ids_for_vendor_v2

            id_integrantes = resolve_integrante_ids_for_vendor_v2(dist_id, id_vendedor_v2)

            if not id_integrantes:
                logger.warning(
                    f"[Watcher] No id_integrante para id_vendedor_v2={id_vendedor_v2} "
                    f"dist={dist_id} — revisá integrantes_grupo"
                )
                return (float(obj.get("valor_actual") or 0), 0)

            from core.exhibicion_aggregate import (
                EXHIBICION_ROW_COLS,
                aggregate_exhibicion_counts_vendor_scope,
                exhibicion_score,
                vendor_logic_key,
            )

            def _fetch_exhibiciones_all_states():
                q = (
                    sb.table("exhibiciones")
                    .select(EXHIBICION_ROW_COLS)
                    .eq("id_distribuidor", dist_id)
                    .in_("id_integrante", id_integrantes)
                    .gte("timestamp_subida", since)
                )
                if item_pdv_ids:
                    q = q.in_("id_cliente_pdv", item_pdv_ids)
                elif obj.get("id_target_pdv") is not None:
                    q = q.eq("id_cliente_pdv", obj.get("id_target_pdv"))
                elif obj.get("origen") != "compania":
                    # Exhibición global de distribuidora: requiere que la foto se haya sacado
                    # específicamente para este objetivo (id_objetivo = obj_id).
                    q = q.eq("id_objetivo", obj_id)
                # Si es global de compañía (origen == "compania" y no hay PDVs target),
                # no filtramos más: cuentan TODAS las exhibiciones del vendedor desde `since`.
                return q.execute().data or []

            all_raw = _fetch_exhibiciones_all_states()

            # Dedup por cliente+día a nivel vendedor (retroactividad compañía alineada a ranking).
            vendor_counts = aggregate_exhibicion_counts_vendor_scope(all_raw)
            best_exhib_per_logic: dict[str, dict] = {}
            pendientes: list[dict] = []
            aprobados_list: list[dict] = []

            for e in all_raw:
                key = vendor_logic_key(e)
                estado = (e.get("estado") or "").strip().lower()
                score = exhibicion_score(e.get("estado") or "")
                if key not in best_exhib_per_logic or score > best_exhib_per_logic[key]["score"]:
                    best_exhib_per_logic[key] = {"exhib": e, "score": score}

            for v in best_exhib_per_logic.values():
                est = (v["exhib"].get("estado") or "").lower()
                if "pendient" in est and "aprobad" not in est and "destacad" not in est:
                    pendientes.append(v["exhib"])
                elif v["score"] > 0:
                    aprobados_list.append(v["exhib"])
            
            # ── Fase 1: fotos Pendientes ──────────────────────────────────────
            ya_pend = self._get_tracked_refs(obj_id, "exhibicion_pendiente")
            nuevas_pend = [e for e in pendientes if str(e["id_exhibicion"]) not in ya_pend]
            if nuevas_pend:
                self._insert_tracking_batch(
                    obj_id, "exhibicion_pendiente", nuevas_pend,
                    id_llave="id_exhibicion",
                    dist_id=dist_id,
                    id_vendedor=id_vendedor_v2,
                    obj_created_at=obj.get("created_at")
                )
                # Marcar ítems como foto_subida
                if item_pdv_ids:
                    for exhib in nuevas_pend:
                        pdv = exhib.get("id_cliente_pdv")
                        if pdv and pdv in item_pdv_ids:
                            self._update_item_estado(obj_id, pdv, "foto_subida")

            # ── Fase 2: fotos Aprobadas ───────────────────────────────────────
            ya_trackeados = self._get_tracked_refs(obj_id, "exhibicion")
            nuevas = [e for e in aprobados_list if str(e["id_exhibicion"]) not in ya_trackeados]
            if nuevas:
                self._insert_tracking_batch(
                    obj_id, "exhibicion", nuevas,
                    id_llave="id_exhibicion",
                    dist_id=dist_id,
                    id_vendedor=id_vendedor_v2,
                    obj_created_at=obj.get("created_at")
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

            # Meta global (compañía o distribuidora): puntos = exhibiciones lógicas aprobadas/destacadas.
            puntos = vendor_counts["puntos"]
            progreso_diario: dict[str, int] = {}
            for v in best_exhib_per_logic.values():
                score = v["score"]
                pt = 2 if score == 3 else 1 if score == 2 else 0
                if pt > 0:
                    dkey = str(v["exhib"].get("timestamp_subida") or "")[:10]
                    if dkey:
                        progreso_diario[dkey] = progreso_diario.get(dkey, 0) + pt

            # ── min_pdvs_distintos: doble condición (puntos + PDVs únicos) ────
            min_pdvs_distintos = obj.get("min_pdvs_distintos")
            valor_aprobados = float(puntos)
            if min_pdvs_distintos is not None and int(min_pdvs_distintos) > 0:
                try:
                    from core.objetivos_exhibicion_pdvs import (
                        ajustar_valor_aprobados_con_pdvs,
                        metricas_exhibicion_global,
                    )
                    # Recolectar id_cliente únicos de exhibiciones aprobadas/destacadas
                    pdv_ids_aprobados: list[int] = []
                    for v in best_exhib_per_logic.values():
                        if v["score"] >= 2:  # aprobado (2) o destacado (3)
                            pdv = v["exhib"].get("id_cliente_pdv")
                            if pdv is not None:
                                pdv_ids_aprobados.append(int(pdv))

                    metricas = metricas_exhibicion_global(puntos, pdv_ids_aprobados, int(min_pdvs_distintos))
                    valor_aprobados = ajustar_valor_aprobados_con_pdvs(
                        puntos, pdv_ids_aprobados,
                        obj.get("valor_objetivo"),
                        int(min_pdvs_distintos),
                    )

                    # Enriquecer desglose_cache con métricas PDVs distintos
                    try:
                        dc_exhib = obj.get("desglose_cache") or {}
                        dc_exhib["pdvs_distintos_count"] = metricas["pdvs_distintos"]
                        dc_exhib["min_pdvs_distintos"] = int(min_pdvs_distintos)
                        dc_exhib["cumple_pdvs"] = metricas["cumple_pdvs"]
                        sb.table("objetivos").update({"desglose_cache": dc_exhib}).eq("id", obj_id).execute()
                    except Exception as e_dc_exhib:
                        logger.warning(f"[Watcher] min_pdvs_distintos desglose_cache obj={obj_id}: {e_dc_exhib}")
                except Exception as e_pdvs:
                    logger.warning(f"[Watcher] min_pdvs_distintos cálculo obj={obj_id}: {e_pdvs}")

            nuevo_valor = valor_aprobados + float(vendor_counts["pendientes"])
            return (nuevo_valor, len(nuevas) + len(nuevas_pend), valor_aprobados, progreso_diario)

        except Exception as e:
            logger.error(f"[Watcher] exhibicion vend={id_vendedor_v2}: {e}")
            return (float(obj.get("valor_actual") or 0), 0)

    # ── Compradores ───────────────────────────────────────────────────────────

    def _diff_compradores(
        self,
        obj: dict,
        id_vendedor: int,
        dist_id: int,
        desde: str,
        hasta: str,
    ) -> tuple[float, int, float, dict]:
        """
        Detecta PDVs compradores nuevos en [desde, hasta] que no estén en tracking.

        Un PDV cuenta como comprador si realizó >= 1 venta (importe >= 0) en el período,
        o si fecha_ultima_compra del padrón cae en el rango (fallback sin motor ventas).

        Regla de dedup: un id_cliente = 1 comprador, sin importar cuántas facturas emitió.
        """
        obj_id = obj["id"]
        try:
            from core.objetivos_compradores import compradores_en_periodo

            comprador_ids = compradores_en_periodo(dist_id, id_vendedor, desde, hasta)

            ya_trackeados = self._get_tracked_refs(obj_id, "comprador")
            nuevos_ids = [cid for cid in comprador_ids if str(cid) not in ya_trackeados]

            from core.objetivos_compradores import compradores_progreso_diario_en_periodo

            progreso_diario = compradores_progreso_diario_en_periodo(
                dist_id, id_vendedor, desde, hasta
            )

            if nuevos_ids:
                items = [{"id_cliente": cid} for cid in nuevos_ids]
                self._insert_tracking_batch(
                    obj_id,
                    "comprador",
                    items,
                    id_llave="id_cliente",
                    dist_id=dist_id,
                    id_vendedor=id_vendedor,
                    obj_created_at=obj.get("created_at"),
                )

            valor_actual = float(len(comprador_ids))
            return (valor_actual, len(nuevos_ids), valor_actual, progreso_diario)

        except Exception as e:
            logger.warning(f"[Watcher] compradores vend={id_vendedor} obj={obj.get('id')}: {e}")
            return (float(obj.get("valor_actual") or 0), 0, float(obj.get("valor_actual") or 0), {})

    # ── Cobranza ──────────────────────────────────────────────────────────────

    def _compute_cobranza(self, obj: dict, dist_id: int) -> float | None:
        """Calcula cuánto se cobró (deuda_inicial - deuda_actual).

        Fix: Si estado_inicial es None/vacío y el objetivo tiene < 1 hora de
        vida, intenta capturar la deuda actual como snapshot inicial para evitar
        que el objetivo quede en valor_actual=0 eternamente por una CC vacía al
        momento de creación.
        """
        estado_inicial = obj.get("estado_inicial")
        id_vendedor = obj.get("id_vendedor")

        if not estado_inicial:
            # Intentar auto-inicializar si el objetivo es reciente (< 1 hora)
            try:
                created_at_str = obj.get("created_at", "")
                if created_at_str:
                    from datetime import timezone as _tz
                    created = datetime.fromisoformat(
                        created_at_str.replace("Z", "+00:00")
                    )
                    age_minutes = (
                        datetime.now(_tz.utc) - created
                    ).total_seconds() / 60
                    if age_minutes < 60:
                        # Intentar snapshot de la deuda actual
                        cc_res = (
                            sb.table("cc_detalle")
                            .select("deuda_total")
                            .eq("id_distribuidor", dist_id)
                            .eq("id_vendedor", id_vendedor)
                            .execute()
                        )
                        deuda_snapshot = sum(
                            float(r.get("deuda_total") or 0)
                            for r in (cc_res.data or [])
                        )
                        if deuda_snapshot > 0:
                            sb.table("objetivos").update(
                                {"estado_inicial": str(deuda_snapshot)}
                            ).eq("id", obj.get("id")).execute()
                            logger.info(
                                f"[Watcher] cobranza auto-snapshot "
                                f"obj={obj.get('id')} deuda={deuda_snapshot}"
                            )
                            # No comparar contra sí mismo en primera corrida —
                            # en la siguiente el watcher usará el snapshot.
                            return None
            except Exception as e_init:
                logger.warning(
                    f"[Watcher] cobranza auto-init obj={obj.get('id')}: {e_init}"
                )
            return None

        try:
            deuda_inicial = float(estado_inicial)
        except (ValueError, TypeError):
            return None

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

    def _get_globally_tracked_refs(self, dist_id: int, tipo_evento: str) -> set[str]:
        """Devuelve el conjunto de id_referencia ya registrados en tracking para cualquier objetivo del tenant."""
        try:
            # Primero obtenemos todos los IDs de objetivos del tenant
            objs_res = sb.table("objetivos").select("id").eq("id_distribuidor", dist_id).execute()
            obj_ids = [o["id"] for o in (objs_res.data or [])]
            
            if not obj_ids:
                return set()
                
            # Luego buscamos los trackings de esos objetivos
            # PostgREST in_ filter has a limit, so we might need to chunk it if there are thousands of objectives,
            # but usually there aren't that many active/recent objectives.
            # To be safe, we can just fetch all tracking for the tipo_evento and filter in memory if needed,
            # but let's try with in_ first for up to 200 objectives.
            
            # Mejor enfoque: obtener todos los trackings del tipo_evento y filtrar los que pertenecen a nuestros objetivos
            # Para evitar el límite de in_()
            res = (
                sb.table("objetivos_tracking")
                .select("id_referencia, id_objetivo")
                .eq("tipo_evento", tipo_evento)
                .execute()
            )
            
            obj_ids_set = set(obj_ids)
            return {r["id_referencia"] for r in (res.data or []) if r["id_objetivo"] in obj_ids_set}
        except Exception as e:
            logger.warning(f"[Watcher] _get_globally_tracked_refs dist={dist_id}: {e}")
            return set()

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
        obj_created_at: str | None = None,
    ) -> None:
        """
        Inserta registros nuevos en objetivos_tracking (sin Telegram ni WS).
        El único mensaje al vendedor es al asignar el objetivo (notify_new_objective_telegram).
        """
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


# Singleton
objetivos_watcher = ObjetivosWatcherService()
