# -*- coding: utf-8 -*-
"""
CRR — Customer Retention / estado de cartera del vendedor.

Métricas de movimiento en un período [desde, hasta]:
- nuevos: altas en el período (fecha_alta).
- reactivados: compra en el período tras inactividad (>30d) con fecha de compra anterior en DB.
- perdidos: activos al inicio del período, inactivos al cierre sin recompra.
- proximos_caer: activos comerciales pero con última compra en ventana 23–29 días.
- balance: (nuevos + reactivados) - perdidos
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from core.compras_fechas import _iso, es_activacion_en_periodo, inactivo_comercial_en
from core.padron_cliente_vitalidad import DIAS_ACTIVO_COMERCIAL, activo_comercial_por_fecha

DIAS_PROXIMO_CAER_MIN = 23


def _parse_iso(d: str | None) -> date | None:
    s = _iso(d)
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def es_alta_en_periodo(fecha_alta: str | None, desde: str, hasta: str) -> bool:
    fa = _iso(fecha_alta)
    if not fa:
        return False
    return desde <= fa <= hasta


def es_reactivado_en_periodo(
    fecha_ultima_compra: str | None,
    fecha_compra_anterior: str | None,
    fecha_alta: str | None,
    desde: str,
    hasta: str,
    *,
    compro_en_periodo: bool,
) -> bool:
    """
    Reactivado = compró en el período, compra actual activa (<30d) y con fecha anterior
    en DB que demuestre inactividad previa. Sin penúltima compra no se clasifica.
    """
    if not compro_en_periodo:
        return False
    fuc = _iso(fecha_ultima_compra)
    fca = _iso(fecha_compra_anterior)
    if not fuc or not fca:
        return False
    if fuc < desde or fuc > hasta:
        return False
    if not activo_comercial_por_fecha(fuc):
        return False
    return es_activacion_en_periodo(fuc, fca, desde, hasta)


def es_perdido_en_periodo(
    fecha_ultima_compra: str | None,
    fecha_compra_anterior: str | None,
    desde: str,
    hasta: str,
    *,
    compro_en_periodo: bool,
) -> bool:
    """Activo al inicio, inactivo al cierre, sin recompra en el período."""
    if compro_en_periodo:
        return False
    activo_inicio = not inactivo_comercial_en(
        fecha_ultima_compra, fecha_compra_anterior, desde
    )
    inactivo_fin = inactivo_comercial_en(
        fecha_ultima_compra, fecha_compra_anterior, hasta
    )
    return activo_inicio and inactivo_fin


def es_proximo_caer(
    fecha_ultima_compra: str | None,
    ref_iso: str,
    *,
    dias_umbral: int = DIAS_ACTIVO_COMERCIAL,
    dias_min: int = DIAS_PROXIMO_CAER_MIN,
) -> bool:
    """Activo comercial pero con compra en los últimos días antes del umbral de inactividad."""
    if not activo_comercial_por_fecha(fecha_ultima_compra, dias_umbral=dias_umbral):
        return False
    fuc = _parse_iso(fecha_ultima_compra)
    ref = _parse_iso(ref_iso)
    if not fuc or not ref:
        return False
    dias = (ref - fuc).days
    return dias_min <= dias < dias_umbral


def dias_desde(fecha_iso: str | None, ref_iso: str) -> int | None:
    f = _parse_iso(fecha_iso)
    r = _parse_iso(ref_iso)
    if not f or not r:
        return None
    return max(0, (r - f).days)


def _cliente_row(
    row: dict[str, Any],
    *,
    categoria: str,
    fecha_evento: str | None = None,
    ref_iso: str | None = None,
    compro_en_periodo: bool = False,
    ultima_exhibicion: str | None = None,
    anomalia_exhibicion_compra: bool = False,
    ruta_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fuc = _iso(row.get("fecha_ultima_compra"))
    fca = _iso(row.get("fecha_compra_anterior"))
    ref = _iso(ref_iso) or date.today().isoformat()
    dias_sin = dias_desde(fuc, ref)
    dias_para_caer = None
    if fuc and dias_sin is not None and activo_comercial_por_fecha(fuc):
        dias_para_caer = max(0, DIAS_ACTIVO_COMERCIAL - dias_sin)
    tel = str(row.get("telefono") or "").strip()
    cel = str(row.get("celular") or "").strip()
    meta = ruta_meta or {}
    rid = row.get("id_ruta")
    return {
        "id_cliente_erp": str(row.get("id_cliente_erp") or ""),
        "razon_social": (row.get("nombre_razon_social") or row.get("razon_social") or "").strip(),
        "nombre_fantasia": (row.get("nombre_fantasia") or "").strip(),
        "localidad": (row.get("localidad") or "").strip(),
        "categoria": categoria,
        "fecha_evento": fecha_evento or fuc or _iso(row.get("fecha_alta")),
        "fecha_ultima_compra": fuc,
        "fecha_compra_anterior": fca,
        "dias_sin_compra": dias_sin,
        "dias_para_caer": dias_para_caer,
        "dias_desde_penultima_compra": dias_desde(fca, ref) if fca else None,
        "compro_en_periodo": compro_en_periodo,
        "ultima_exhibicion": _iso(ultima_exhibicion),
        "dias_desde_exhibicion": dias_desde(_iso(ultima_exhibicion), ref) if ultima_exhibicion else None,
        "anomalia_exhibicion_compra": anomalia_exhibicion_compra,
        "telefono": tel,
        "celular": cel,
        "contacto": cel or tel or "",
        "id_ruta": rid,
        "ruta_nombre": str(meta.get("nombre") or "").strip(),
        "dia_visita": str(meta.get("dia") or "").strip(),
    }


def es_inactivo_comercial(fecha_ultima_compra: str | None) -> bool:
    """Sin compra o última compra hace +30 días."""
    return not activo_comercial_por_fecha(fecha_ultima_compra)


def es_anomalia_exhibicion_compra(
    fecha_ultima_compra: str | None,
    fecha_compra_anterior: str | None,
    ultima_exhibicion: str | None,
    ref_iso: str,
    *,
    exhibido_en_periodo: bool,
) -> bool:
    """Exhibido en el período pero compra antigua (+30d) o sin compra."""
    if not exhibido_en_periodo or not _iso(ultima_exhibicion):
        return False
    fuc = _iso(fecha_ultima_compra)
    if not fuc:
        return True
    return inactivo_comercial_en(
        fecha_ultima_compra, fecha_compra_anterior, ref_iso
    )


def build_crr_cartera(
    pdvs: list[dict[str, Any]],
    *,
    compradores_erp: set[str],
    altas_erp: set[str],
    exhibidos_erp: set[str],
    ultima_exhibicion_por_erp: dict[str, str],
    ruta_meta_by_id: dict[int, dict[str, str]] | None = None,
    desde: str,
    hasta: str,
    ref_proximo_caer: str | None = None,
) -> dict[str, Any]:
    """
    Calcula resumen CRR y listas de clientes para un vendedor.
    `pdvs`: filas de clientes_pdv_v2 del vendedor (con fechas de compra).
    """
    ref_pc = _iso(ref_proximo_caer) or _iso(hasta) or date.today().isoformat()
    ruta_lookup = ruta_meta_by_id or {}

    reactivados: list[dict] = []
    perdidos: list[dict] = []
    proximos: list[dict] = []
    anomalias: list[dict] = []
    inactivos_list: list[dict] = []
    activos = 0
    inactivos = 0

    for row in pdvs:
        erp = str(row.get("id_cliente_erp") or "").strip()
        if not erp:
            continue
        fuc = _iso(row.get("fecha_ultima_compra"))
        fca = _iso(row.get("fecha_compra_anterior"))
        falta = _iso(row.get("fecha_alta"))
        compro = erp in compradores_erp
        ult_ex = ultima_exhibicion_por_erp.get(erp)
        exhibido = erp in exhibidos_erp
        rid = row.get("id_ruta")
        ruta_meta = ruta_lookup.get(int(rid)) if rid is not None else {}
        row_kw = dict(
            ref_iso=ref_pc,
            compro_en_periodo=compro,
            ultima_exhibicion=ult_ex,
            anomalia_exhibicion_compra=es_anomalia_exhibicion_compra(
                fuc, fca, ult_ex, ref_pc, exhibido_en_periodo=exhibido
            ),
            ruta_meta=ruta_meta,
        )

        if activo_comercial_por_fecha(fuc):
            activos += 1
        else:
            inactivos += 1
            inactivos_list.append(
                _cliente_row(row, categoria="inactivo", fecha_evento=fuc, **row_kw)
            )

        if row_kw["anomalia_exhibicion_compra"]:
            anomalias.append(_cliente_row(row, categoria="anomalia", **row_kw))

        if es_reactivado_en_periodo(fuc, fca, falta, desde, hasta, compro_en_periodo=compro):
            if erp not in altas_erp and fca:
                reactivados.append(_cliente_row(row, categoria="reactivado", fecha_evento=fuc, **row_kw))

        if es_perdido_en_periodo(fuc, fca, desde, hasta, compro_en_periodo=compro):
            perdidos.append(_cliente_row(row, categoria="perdido", fecha_evento=fuc or hasta, **row_kw))

        if es_proximo_caer(fuc, ref_pc):
            proximos.append(_cliente_row(row, categoria="proximo_caer", fecha_evento=fuc, **row_kw))

    reactivados = [r for r in reactivados if _iso(r.get("fecha_compra_anterior"))]

    nuevos = len(altas_erp)
    n_react = len(reactivados)
    n_perd = len(perdidos)
    balance = (nuevos + n_react) - n_perd

    inactivos_list.sort(
        key=lambda x: (
            x.get("dias_sin_compra") is None,
            -(x.get("dias_sin_compra") or 0),
            (x.get("razon_social") or "").lower(),
        ),
    )

    return {
        "balance": balance,
        "nuevos": nuevos,
        "reactivados": n_react,
        "perdidos": n_perd,
        "proximos_caer": len(proximos),
        "anomalias_exhibicion": len(anomalias),
        "activos": activos,
        "inactivos": inactivos,
        "clientes": {
            "reactivados": reactivados[:80],
            "perdidos": perdidos[:80],
            "proximos_caer": proximos[:80],
            "anomalias": anomalias[:80],
            "inactivos": inactivos_list[:120],
        },
    }


def build_composicion_exhibicion_compradores(
    exhibidos_erp: set[str],
    compradores_erp: set[str],
) -> dict[str, int | float]:
    ambos = exhibidos_erp & compradores_erp
    solo_exhibidos = exhibidos_erp - compradores_erp
    solo_compradores = compradores_erp - exhibidos_erp
    total_ex = len(exhibidos_erp)
    cobertura = round(100.0 * len(ambos) / total_ex, 1) if total_ex else 0.0
    return {
        "total_exhibidos": total_ex,
        "total_compradores": len(compradores_erp),
        "ambos": len(ambos),
        "solo_exhibidos": len(solo_exhibidos),
        "solo_compradores": len(solo_compradores),
        "cobertura_exhibicion_pct": cobertura,
    }
