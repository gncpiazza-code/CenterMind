# -*- coding: utf-8 -*-
"""
Persistencia de última y penúltima fecha de compra por PDV.

Reglas:
- fecha_ultima_compra: día más reciente con compra válida.
- fecha_compra_anterior: segundo día distinto (estrictamente anterior a última).
- Nunca guardar ambas iguales (CHECK en DB + validación aquí).
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Iterable

from core.padron_cliente_vitalidad import DIAS_ACTIVO_COMERCIAL
from db import sb
from core.objetivos_compradores import _norm_erp
from core.tenant_tables import tenant_table_name
from core.ultima_compra import PAGE, _venta_cuenta_como_compra

_VENTAS_FECHAS_SELECT = (
    "id_cliente_erp,fecha_factura,importe_final,anulado,nombre_cliente"
)


def _iso(d: Any) -> str | None:
    s = str(d or "").strip()[:10]
    return s if len(s) >= 10 else None


def ultima_compra_antes_de(
    fecha_ultima_compra: str | None,
    fecha_compra_anterior: str | None,
    corte_iso: str,
) -> str | None:
    """
    Última fecha de compra estrictamente antes de `corte` (día calendario).
    Si la última compra cae en/después del corte, usa la penúltima persistida.
    """
    corte = str(corte_iso or "")[:10]
    if len(corte) < 10:
        return None
    u, a = _iso(fecha_ultima_compra), _iso(fecha_compra_anterior)
    if u and u >= corte:
        return a
    if u and u < corte:
        return u
    return a


def inactivo_comercial_en(
    fecha_ultima_compra: str | None,
    fecha_compra_anterior: str | None,
    ref_iso: str,
    *,
    dias_umbral: int = DIAS_ACTIVO_COMERCIAL,
) -> bool:
    """
    PDV inactivo en `ref`: sin compra en los últimos `dias_umbral` días previos a ref.
    Usa las dos fechas persistidas (no consulta ventas).
    """
    ref = str(ref_iso or "")[:10]
    if len(ref) < 10:
        return True
    prev = ultima_compra_antes_de(fecha_ultima_compra, fecha_compra_anterior, ref)
    if not prev:
        return True
    try:
        ref_d = date.fromisoformat(ref)
        prev_d = date.fromisoformat(prev)
    except ValueError:
        return True
    umbral = ref_d - timedelta(days=max(1, dias_umbral))
    return prev_d < umbral


def es_activacion_en_periodo(
    fecha_ultima_compra: str | None,
    fecha_compra_anterior: str | None,
    desde_iso: str,
    hasta_iso: str | None = None,
    *,
    dias_inactivo: int = DIAS_ACTIVO_COMERCIAL,
) -> bool:
    """
    Activación = compra en [desde, hasta] y estaba inactivo al inicio del período (desde).
    """
    desde = str(desde_iso or "")[:10]
    hasta = str(hasta_iso or desde)[:10]
    if len(desde) < 10:
        return False
    u = _iso(fecha_ultima_compra)
    if not u or u < desde or u > hasta:
        return False
    return inactivo_comercial_en(
        fecha_ultima_compra,
        fecha_compra_anterior,
        desde,
        dias_umbral=dias_inactivo,
    )


def _pair_validas(ultima: str | None, anterior: str | None) -> tuple[str | None, str | None]:
    u, a = _iso(ultima), _iso(anterior)
    if not u:
        return None, None
    if a and a >= u:
        a = None
    return u, a


def advance_fechas_compra(
    ultima_actual: str | None,
    anterior_actual: str | None,
    nueva_fecha: str | None,
) -> tuple[str | None, str | None]:
    """
    Avanza última con una compra nueva (p. ej. ingesta ventas o padrón).
    No degrada última; si nueva > última, la anterior pasa a ser la última previa.
    """
    nueva = _iso(nueva_fecha)
    if not nueva:
        return _pair_validas(ultima_actual, anterior_actual)

    ultima, anterior = _pair_validas(ultima_actual, anterior_actual)
    if ultima and nueva < ultima:
        return ultima, anterior
    if ultima == nueva:
        return ultima, anterior

    if ultima:
        anterior = ultima
    ultima = nueva
    return _pair_validas(ultima, anterior)


def resolve_fechas_compra_persistidas(
    padron_ultima: str | None,
    padron_anterior: str | None,
    ventas_ultima: str | None,
    ventas_anterior: str | None,
) -> tuple[str | None, str | None]:
    """Combina padrón + top-2 ventas; prioriza última más reciente y anterior < última."""
    candidatos_ult: list[str] = []
    for c in (padron_ultima, ventas_ultima):
        d = _iso(c)
        if d:
            candidatos_ult.append(d)
    if not candidatos_ult:
        return None, None
    ultima = max(candidatos_ult)

    candidatos_ant: list[str] = []
    for c in (padron_anterior, ventas_anterior, padron_ultima, ventas_ultima):
        d = _iso(c)
        if d and d < ultima:
            candidatos_ant.append(d)
    anterior = max(candidatos_ant) if candidatos_ant else None
    return _pair_validas(ultima, anterior)


def _top2_from_dias(dias: set[str]) -> tuple[str | None, str | None]:
    if not dias:
        return None, None
    orden = sorted(dias, reverse=True)
    ultima = orden[0]
    anterior = orden[1] if len(orden) > 1 and orden[1] < ultima else None
    return _pair_validas(ultima, anterior)


def _padron_nombres_por_erp(
    dist_id: int,
    erp_ids: Iterable[str],
) -> dict[str, dict[str, str | None]]:
    """id_cliente_erp → {nombre_fantasia, nombre_razon_social}."""
    erp_list = list(dict.fromkeys(str(e).strip() for e in erp_ids if str(e or "").strip()))
    if not erp_list:
        return {}
    cli_table = tenant_table_name("clientes_pdv_v2", dist_id)
    out: dict[str, dict[str, str | None]] = {}
    for i in range(0, len(erp_list), 400):
        chunk = erp_list[i : i + 400]
        try:
            res = (
                sb.table(cli_table)
                .select("id_cliente_erp,nombre_fantasia,nombre_razon_social")
                .eq("id_distribuidor", dist_id)
                .in_("id_cliente_erp", chunk)
                .execute()
            )
        except Exception:
            continue
        for row in res.data or []:
            erp = str(row.get("id_cliente_erp") or "").strip()
            if erp:
                out[erp] = {
                    "nombre_fantasia": row.get("nombre_fantasia"),
                    "nombre_razon_social": row.get("nombre_razon_social"),
                }
    return out


def fetch_top2_fechas_compra_por_erp(
    dist_id: int,
    erp_ids: Iterable[str],
    *,
    ventana_dias: int = 730,
    fecha_hasta: date | None = None,
    padron_nombres: dict[str, dict[str, str | None]] | None = None,
    solo_nombre_coincidente: bool = False,
) -> dict[str, tuple[str | None, str | None]]:
    """
    Mapa ERP normalizado → (ultima, anterior) desde ventas_enriched_v2.
    Un día = una fecha distinta (varios comprobantes el mismo día cuentan como uno).
    Si solo_nombre_coincidente: solo filas cuyo nomcli coincide con el padrón del ERP.
    """
    from core.cliente_nombre_match import cliente_nombre_coincide_padron
    erp_raw: list[str] = []
    erp_norm_set: set[str] = set()
    for e in erp_ids:
        s = str(e or "").strip()
        if not s:
            continue
        erp_raw.append(s)
        n = _norm_erp(s)
        if n:
            erp_norm_set.add(n)

    if not erp_norm_set:
        return {}

    if solo_nombre_coincidente and padron_nombres is None:
        padron_nombres = _padron_nombres_por_erp(dist_id, erp_raw)

    hasta = fecha_hasta or date.today()
    desde = (hasta - timedelta(days=max(1, ventana_dias))).isoformat()
    hasta_s = hasta.isoformat()
    t_ventas = tenant_table_name("ventas_enriched_v2", dist_id)
    dias_por_erp: dict[str, set[str]] = {}

    chunk_size = 400
    for i in range(0, len(erp_raw), chunk_size):
        chunk = erp_raw[i : i + chunk_size]
        offset = 0
        while True:
            batch = (
                sb.table(t_ventas)
                .select(_VENTAS_FECHAS_SELECT)
                .eq("id_distribuidor", dist_id)
                .eq("anulado", False)
                .in_("id_cliente_erp", chunk)
                .gte("fecha_factura", desde)
                .lte("fecha_factura", hasta_s)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            for row in batch:
                if not _venta_cuenta_como_compra(row):
                    continue
                erp_raw_row = str(row.get("id_cliente_erp") or "").strip()
                n = _norm_erp(erp_raw_row)
                if not n or n not in erp_norm_set:
                    continue
                if solo_nombre_coincidente and padron_nombres is not None:
                    pnom = padron_nombres.get(erp_raw_row) or padron_nombres.get(n) or {}
                    if not cliente_nombre_coincide_padron(
                        row.get("nombre_cliente"),
                        nombre_fantasia=pnom.get("nombre_fantasia"),
                        nombre_razon_social=pnom.get("nombre_razon_social"),
                    ):
                        continue
                f = _iso(row.get("fecha_factura"))
                if f:
                    dias_por_erp.setdefault(n, set()).add(f)
            if len(batch) < PAGE:
                break
            offset += PAGE

    out: dict[str, tuple[str | None, str | None]] = {}
    for n, dias in dias_por_erp.items():
        out[n] = _top2_from_dias(dias)
    return out


def _tiene_ventas_sin_match_nombre(
    dist_id: int,
    id_cliente_erp: str,
    padron_row: dict[str, str | None],
) -> bool:
    """Hay ventas en informe para el ERP pero ninguna con nomcli = padrón."""
    from core.cliente_nombre_match import cliente_nombre_coincide_padron

    erp = str(id_cliente_erp or "").strip()
    if not erp:
        return False
    t_ventas = tenant_table_name("ventas_enriched_v2", dist_id)
    offset = 0
    tiene_alguna = False
    tiene_match = False
    while True:
        batch = (
            sb.table(t_ventas)
            .select("nombre_cliente,fecha_factura,importe_final,anulado")
            .eq("id_distribuidor", dist_id)
            .eq("id_cliente_erp", erp)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        for row in batch:
            if not _venta_cuenta_como_compra(row):
                continue
            tiene_alguna = True
            if cliente_nombre_coincide_padron(
                row.get("nombre_cliente"),
                nombre_fantasia=padron_row.get("nombre_fantasia"),
                nombre_razon_social=padron_row.get("nombre_razon_social"),
            ):
                tiene_match = True
                break
        if tiene_match or len(batch) < PAGE:
            break
        offset += PAGE
    return tiene_alguna and not tiene_match


def resolve_fecha_compra_operativa(
    dist_id: int,
    *,
    id_cliente_erp: str | None,
    nombre_fantasia: str | None,
    nombre_razon_social: str | None,
    fecha_padron: str | None,
    fecha_padron_anterior: str | None = None,
    top2_cache: dict[str, tuple[str | None, str | None]] | None = None,
) -> tuple[str | None, str | None]:
    """
    Informe de ventas (nomcli = padrón) primero; si no hay match válido, padrón Chess.
    Si hay ventas con otro nombre en el mismo ERP → sin fecha operativa (evita falso activo).
    """
    erp = str(id_cliente_erp or "").strip()
    if not erp:
        return _iso(fecha_padron), _iso(fecha_padron_anterior)

    padron_row = {
        "nombre_fantasia": nombre_fantasia,
        "nombre_razon_social": nombre_razon_social,
    }
    norm = _norm_erp(erp) or erp
    if top2_cache is not None:
        v_u, v_a = top2_cache.get(norm, (None, None))
    else:
        top2 = fetch_top2_fechas_compra_por_erp(
            dist_id,
            [erp],
            padron_nombres={erp: padron_row},
            solo_nombre_coincidente=True,
        )
        v_u, v_a = top2.get(norm, (None, None))

    if v_u:
        return v_u, v_a
    if _tiene_ventas_sin_match_nombre(dist_id, erp, padron_row):
        return None, None
    return _iso(fecha_padron), _iso(fecha_padron_anterior)


def enrich_supervision_fechas_compra(dist_id: int, rows: list[dict]) -> None:
    """In-place: fecha_ultima_compra operativa para mapa (informe validado → padrón)."""
    if not rows:
        return
    erps = [str(r.get("id_cliente_erp") or "").strip() for r in rows if r.get("id_cliente_erp")]
    padron_nombres = _padron_nombres_por_erp(dist_id, erps)
    top2 = fetch_top2_fechas_compra_por_erp(
        dist_id,
        erps,
        padron_nombres=padron_nombres,
        solo_nombre_coincidente=True,
    )
    for r in rows:
        erp = str(r.get("id_cliente_erp") or "").strip()
        pnom = padron_nombres.get(erp) or {}
        u, a = resolve_fecha_compra_operativa(
            dist_id,
            id_cliente_erp=erp,
            nombre_fantasia=pnom.get("nombre_fantasia") or r.get("nombre_fantasia"),
            nombre_razon_social=pnom.get("nombre_razon_social") or r.get("nombre_razon_social"),
            fecha_padron=r.get("fecha_ultima_compra"),
            fecha_padron_anterior=r.get("fecha_compra_anterior"),
            top2_cache=top2,
        )
        r["fecha_ultima_compra_padron"] = r.get("fecha_ultima_compra")
        r["fecha_compra_anterior_padron"] = r.get("fecha_compra_anterior")
        r["fecha_ultima_compra"] = u
        r["fecha_compra_anterior"] = a


def update_cliente_fechas_compra(
    dist_id: int,
    id_cliente_erp: str,
    *,
    nueva_fecha: str | None = None,
    ventas_ultima: str | None = None,
    ventas_anterior: str | None = None,
    force_top2_from_ventas: bool = False,
) -> bool:
    """
    Persiste fecha_ultima_compra y fecha_compra_anterior en clientes_pdv_v2 del tenant.
    Retorna True si hubo UPDATE.
    """
    erp = str(id_cliente_erp or "").strip()
    if not erp:
        return False

    cli_table = tenant_table_name("clientes_pdv_v2", dist_id)
    res = (
        sb.table(cli_table)
        .select("id_cliente,fecha_ultima_compra,fecha_compra_anterior")
        .eq("id_distribuidor", dist_id)
        .eq("id_cliente_erp", erp)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return False

    row = rows[0]
    pk = row.get("id_cliente")
    pad_u = row.get("fecha_ultima_compra")
    pad_a = row.get("fecha_compra_anterior")

    if force_top2_from_ventas or (ventas_ultima is None and ventas_anterior is None):
        norm = _norm_erp(erp) or erp
        top2 = fetch_top2_fechas_compra_por_erp(dist_id, [erp])
        v_u, v_a = top2.get(norm, (None, None))
    else:
        v_u, v_a = ventas_ultima, ventas_anterior

    if nueva_fecha:
        pad_u, pad_a = advance_fechas_compra(pad_u, pad_a, nueva_fecha)

    ultima, anterior = resolve_fechas_compra_persistidas(pad_u, pad_a, v_u, v_a)
    payload: dict[str, Any] = {}
    if ultima:
        payload["fecha_ultima_compra"] = ultima
    else:
        payload["fecha_ultima_compra"] = None
    payload["fecha_compra_anterior"] = anterior

    cur_u, cur_a = _pair_validas(pad_u, pad_a)
    if cur_u == ultima and cur_a == anterior:
        return False

    sb.table(cli_table).update(payload).eq("id_cliente", pk).execute()
    sb.table("clientes_pdv_v2").update(payload).eq("id_cliente", pk).execute()
    return True


def batch_update_fechas_compra_desde_ventas(
    dist_id: int,
    erp_ids: Iterable[str],
    *,
    nuevas_por_erp: dict[str, str] | None = None,
) -> int:
    """Recalcula y persiste fechas para una lista de ERPs (post-ingesta ventas)."""
    erp_list = [str(e).strip() for e in erp_ids if str(e or "").strip()]
    if not erp_list:
        return 0

    padron_nombres = _padron_nombres_por_erp(dist_id, erp_list)
    top2 = fetch_top2_fechas_compra_por_erp(
        dist_id,
        erp_list,
        padron_nombres=padron_nombres,
        solo_nombre_coincidente=True,
    )
    nuevas = nuevas_por_erp or {}
    cli_table = tenant_table_name("clientes_pdv_v2", dist_id)
    actualizados = 0

    for i in range(0, len(erp_list), 400):
        chunk = erp_list[i : i + 400]
        try:
            res = (
                sb.table(cli_table)
                .select("id_cliente,id_cliente_erp,fecha_ultima_compra,fecha_compra_anterior")
                .eq("id_distribuidor", dist_id)
                .in_("id_cliente_erp", chunk)
                .execute()
            )
        except Exception:
            continue

        for row in res.data or []:
            erp = str(row.get("id_cliente_erp") or "").strip()
            if not erp:
                continue
            pk = row.get("id_cliente")
            pad_u = row.get("fecha_ultima_compra")
            pad_a = row.get("fecha_compra_anterior")
            norm = _norm_erp(erp) or erp
            v_u, v_a = top2.get(norm, (None, None))
            nueva = nuevas.get(erp)
            pnom = padron_nombres.get(erp) or {}
            if nueva and not v_u:
                nueva = None
            if nueva:
                pad_u, pad_a = advance_fechas_compra(pad_u, pad_a, nueva)
            if v_u:
                ultima, anterior = resolve_fechas_compra_persistidas(pad_u, pad_a, v_u, v_a)
            elif _tiene_ventas_sin_match_nombre(dist_id, erp, pnom):
                ultima, anterior = None, None
            else:
                ultima, anterior = resolve_fechas_compra_persistidas(pad_u, pad_a, None, None)
            cur_u, cur_a = _pair_validas(row.get("fecha_ultima_compra"), row.get("fecha_compra_anterior"))
            if cur_u == ultima and cur_a == anterior:
                continue
            payload = {"fecha_ultima_compra": ultima, "fecha_compra_anterior": anterior}
            sb.table(cli_table).update(payload).eq("id_cliente", pk).execute()
            sb.table("clientes_pdv_v2").update(payload).eq("id_cliente", pk).execute()
            actualizados += 1

    return actualizados
