# -*- coding: utf-8 -*-
"""
Cartera y rutas inferidas por integrante (patrón multi-cuenta).

Asigna PDVs a Monchi / Jorge / etc. según dónde exhiben y venden (ventana móvil).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from supabase import Client

from core.exhibicion_aggregate import EXHIBICION_ROW_COLS
from core.helpers import tenant_table_name
from core.ivan_soto_zona_geografica import (
    build_ivan_soto_city_owner,
    is_ivan_soto_geographic_partition,
    normalize_localidad_zona,
    resolve_ivan_soto_localidad_cuenta,
)

logger = logging.getLogger("ShelfyAPI")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")
PAGE = 1000
LOOKBACK_DAYS_DEFAULT = 120


def _default_fecha_bounds(lookback_days: int = LOOKBACK_DAYS_DEFAULT) -> tuple[str, str]:
    hoy = datetime.now(AR_TZ).date()
    desde = hoy - timedelta(days=max(1, lookback_days))
    return desde.isoformat(), hoy.isoformat()


def normalize_cliente_erp_key(erp: str) -> str:
    """Unifica ERP numérico (ej. 03434 → 3434) para matchear sombra vs padrón."""
    s = str(erp or "").strip()
    if not s:
        return s
    if s.isdigit():
        return s.lstrip("0") or "0"
    return s


def build_erp_canonical_lookup(cartera_erps: set[str]) -> dict[str, str]:
    """Mapea variantes de sombra/padrón al id_cliente_erp canónico de la cartera."""
    lookup: dict[str, str] = {}
    for erp in cartera_erps:
        lookup[erp] = erp
        lookup.setdefault(normalize_cliente_erp_key(erp), erp)
        if erp.isdigit():
            for width in (4, 5, 6):
                lookup.setdefault(erp.zfill(width), erp)
    return lookup


def resolve_canonical_erp(erp: str, lookup: dict[str, str] | None) -> str:
    s = str(erp or "").strip()
    if not s:
        return s
    if not lookup:
        return s
    return lookup.get(s) or lookup.get(normalize_cliente_erp_key(s)) or s


def normalize_localidad(localidad: str | None) -> str:
    return (localidad or "").strip().upper() or "SIN_CIUDAD"


def _load_erp_localidad_map(
    sb: Client,
    dist_id: int,
    erps: set[str],
) -> dict[str, str]:
    """id_cliente_erp → localidad normalizada."""
    if not erps:
        return {}
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    out: dict[str, str] = {}
    erp_list = list(erps)
    for i in range(0, len(erp_list), 200):
        batch = erp_list[i : i + 200]
        offset = 0
        while True:
            chunk = (
                sb.table(t_pdv)
                .select("id_cliente_erp,localidad")
                .eq("id_distribuidor", dist_id)
                .in_("id_cliente_erp", batch)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data
                or []
            )
            for row in chunk:
                erp = str(row.get("id_cliente_erp") or "").strip()
                if erp:
                    out[erp] = normalize_localidad(row.get("localidad"))
            if len(chunk) < PAGE:
                break
            offset += PAGE
    return out


def _build_city_owner_by_ex(
    ex_count: dict[tuple[int, str], int],
    erp_localidad: dict[str, str],
    monchi_iids: set[int],
    jorge_iids: set[int],
) -> dict[str, str]:
    """Integrante dominante por ciudad según volumen de exhibiciones."""
    city_monchi: dict[str, int] = defaultdict(int)
    city_jorge: dict[str, int] = defaultdict(int)
    for (iid, erp), cnt in ex_count.items():
        city = erp_localidad.get(erp, "SIN_CIUDAD")
        if iid in monchi_iids:
            city_monchi[city] += cnt
        elif iid in jorge_iids:
            city_jorge[city] += cnt
    owners: dict[str, str] = {}
    for city in set(city_monchi.keys()) | set(city_jorge.keys()):
        m = city_monchi.get(city, 0)
        j = city_jorge.get(city, 0)
        owners[city] = "monchi" if m >= j else "jorge_coronel"
    return owners


def _paginate_exhibiciones(
    sb: Client,
    dist_id: int,
    integrante_ids: list[int],
    fecha_desde: str,
    fecha_hasta: str,
) -> list[dict]:
    if not integrante_ids:
        return []
    t_ex = tenant_table_name("exhibiciones", dist_id)
    fin_iso = f"{fecha_hasta}T23:59:59-03:00"
    inicio_iso = f"{fecha_desde}T00:00:00-03:00"
    rows: list[dict] = []
    for i in range(0, len(integrante_ids), 50):
        batch = integrante_ids[i : i + 50]
        offset = 0
        while True:
            chunk = (
                sb.table(t_ex)
                .select(EXHIBICION_ROW_COLS)
                .eq("id_distribuidor", dist_id)
                .in_("id_integrante", batch)
                .gte("timestamp_subida", inicio_iso)
                .lte("timestamp_subida", fin_iso)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data
                or []
            )
            rows.extend(chunk)
            if len(chunk) < PAGE:
                break
            offset += PAGE
    return rows


def _pdv_keys_from_exhibiciones(ex_rows: list[dict]) -> tuple[set[int], set[str]]:
    pdv_ids: set[int] = set()
    erp_shadow: set[str] = set()
    for r in ex_rows:
        cid = r.get("id_cliente_pdv") or r.get("id_cliente")
        if cid is not None:
            try:
                pdv_ids.add(int(cid))
            except (TypeError, ValueError):
                pass
        sombra = str(r.get("cliente_sombra_codigo") or "").strip()
        if sombra:
            erp_shadow.add(sombra)
    return pdv_ids, erp_shadow


def _load_pdv_maps(
    sb: Client,
    dist_id: int,
    leader_vid: int,
    pdv_ids: set[int],
    erp_extra: set[str],
) -> tuple[dict[int, str], dict[str, int], set[int]]:
    """id_pdv→erp, erp→id_ruta, ruta_ids detectadas."""
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    rutas_leader = (
        sb.table(t_rutas)
        .select("id_ruta")
        .eq("id_vendedor", leader_vid)
        .execute()
        .data
        or []
    )
    ruta_ids_leader = {int(r["id_ruta"]) for r in rutas_leader if r.get("id_ruta") is not None}

    pdv_to_erp: dict[int, str] = {}
    erp_to_ruta: dict[str, int] = {}
    rutas_detectadas: set[int] = set()

    ids_list = list(pdv_ids)
    for i in range(0, max(len(ids_list), 1), 200):
        batch_ids = ids_list[i : i + 200] if ids_list else []
        if not batch_ids and not erp_extra:
            break
        q = sb.table(t_pdv).select("id_cliente,id_cliente_erp,id_ruta").eq(
            "id_distribuidor", dist_id
        )
        if batch_ids:
            q = q.in_("id_cliente", batch_ids)
        elif erp_extra:
            q = q.in_("id_cliente_erp", list(erp_extra)[:200])
        if ruta_ids_leader:
            q = q.in_("id_ruta", list(ruta_ids_leader))
        for row in q.execute().data or []:
            try:
                pid = int(row["id_cliente"])
            except (TypeError, ValueError, KeyError):
                continue
            erp = str(row.get("id_cliente_erp") or "").strip()
            rid = row.get("id_ruta")
            if erp:
                pdv_to_erp[pid] = erp
            if rid is not None and erp:
                try:
                    r_int = int(rid)
                    erp_to_ruta[erp] = r_int
                    if r_int in ruta_ids_leader:
                        rutas_detectadas.add(r_int)
                except (TypeError, ValueError):
                    pass

    if erp_extra:
        erp_pending = erp_extra - set(erp_to_ruta.keys())
        for i in range(0, len(erp_pending), 200):
            chunk = list(erp_pending)[i : i + 200]
            if not chunk:
                break
            q = (
                sb.table(t_pdv)
                .select("id_cliente_erp,id_ruta")
                .eq("id_distribuidor", dist_id)
                .in_("id_cliente_erp", chunk)
            )
            if ruta_ids_leader:
                q = q.in_("id_ruta", list(ruta_ids_leader))
            for row in q.execute().data or []:
                erp = str(row.get("id_cliente_erp") or "").strip()
                rid = row.get("id_ruta")
                if erp and rid is not None:
                    try:
                        r_int = int(rid)
                        erp_to_ruta[erp] = r_int
                        if r_int in ruta_ids_leader:
                            rutas_detectadas.add(r_int)
                    except (TypeError, ValueError):
                        pass

    return pdv_to_erp, erp_to_ruta, rutas_detectadas


def _fetch_leader_cartera_erps(
    sb: Client,
    dist_id: int,
    leader_vid: int,
) -> tuple[set[str], dict[str, int], set[int]]:
    """Todos los id_cliente_erp en rutas del líder ERP (universo Equipo)."""
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    rutas_leader = (
        sb.table(t_rutas)
        .select("id_ruta")
        .eq("id_vendedor", leader_vid)
        .execute()
        .data
        or []
    )
    ruta_ids = [int(r["id_ruta"]) for r in rutas_leader if r.get("id_ruta") is not None]
    if not ruta_ids:
        return set(), {}, set()

    all_erps: set[str] = set()
    erp_to_ruta: dict[str, int] = {}
    for i in range(0, len(ruta_ids), 50):
        batch_rutas = ruta_ids[i : i + 50]
        offset = 0
        while True:
            chunk = (
                sb.table(t_pdv)
                .select("id_cliente_erp,id_ruta")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", batch_rutas)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data
                or []
            )
            for row in chunk:
                erp = str(row.get("id_cliente_erp") or "").strip()
                rid = row.get("id_ruta")
                if not erp or rid is None:
                    continue
                try:
                    r_int = int(rid)
                except (TypeError, ValueError):
                    continue
                all_erps.add(erp)
                erp_to_ruta.setdefault(erp, r_int)
            if len(chunk) < PAGE:
                break
            offset += PAGE
    return all_erps, erp_to_ruta, set(ruta_ids)


def _build_ex_count_by_integrante_erp(
    sb: Client,
    dist_id: int,
    integrante_ids: list[int],
    fecha_desde: str,
    fecha_hasta: str,
    erp_to_ruta: dict[str, int],
    *,
    erp_canonical: dict[str, str] | None = None,
) -> dict[tuple[int, str], int]:
    """Conteo exhibiciones (integrante, erp) en ventana."""
    if not integrante_ids:
        return {}
    ex_rows = _paginate_exhibiciones(sb, dist_id, integrante_ids, fecha_desde, fecha_hasta)
    ex_count: dict[tuple[int, str], int] = defaultdict(int)
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    pdv_to_erp_cache: dict[int, str] = {}

    for ex in ex_rows:
        try:
            iid = int(ex.get("id_integrante"))
        except (TypeError, ValueError):
            continue
        erp = str(ex.get("cliente_sombra_codigo") or "").strip()
        cid = ex.get("id_cliente_pdv") or ex.get("id_cliente")
        if cid is not None:
            try:
                pid = int(cid)
                erp = pdv_to_erp_cache.get(pid) or erp
                if not erp:
                    res = (
                        sb.table(t_pdv)
                        .select("id_cliente_erp")
                        .eq("id_distribuidor", dist_id)
                        .eq("id_cliente", pid)
                        .limit(1)
                        .execute()
                    )
                    if res.data:
                        erp = str(res.data[0].get("id_cliente_erp") or "").strip()
                        pdv_to_erp_cache[pid] = erp
            except (TypeError, ValueError):
                pass
        if erp:
            erp = resolve_canonical_erp(erp, erp_canonical)
            ex_count[(iid, erp)] += 1
            if erp not in erp_to_ruta:
                rid = ex.get("id_ruta")
                if rid is not None:
                    try:
                        erp_to_ruta.setdefault(erp, int(rid))
                    except (TypeError, ValueError):
                        pass
    return ex_count


def _build_ruta_owner_by_ex(
    ex_count: dict[tuple[int, str], int],
    monchi_iids: set[int],
    jorge_iids: set[int],
    erp_to_ruta: dict[str, int],
) -> dict[int, str]:
    """Integrante dominante por ruta según exhibiciones en ventana."""
    ruta_monchi: dict[int, int] = defaultdict(int)
    ruta_jorge: dict[int, int] = defaultdict(int)
    for (iid, erp), cnt in ex_count.items():
        rid = erp_to_ruta.get(erp)
        if rid is None:
            continue
        if iid in monchi_iids:
            ruta_monchi[rid] += cnt
        elif iid in jorge_iids:
            ruta_jorge[rid] += cnt
    owners: dict[int, str] = {}
    all_rutas = set(ruta_monchi.keys()) | set(ruta_jorge.keys())
    for rid in all_rutas:
        m = ruta_monchi.get(rid, 0)
        j = ruta_jorge.get(rid, 0)
        owners[rid] = "monchi" if m >= j else "jorge_coronel"
    return owners


def _score_cuenta(
    erp: str,
    integrante_ids: set[int],
    ex_count: dict[tuple[int, str], int],
) -> int:
    return sum(ex_count.get((iid, erp), 0) for iid in integrante_ids)


def _assign_pdv_owner(
    erp: str,
    monchi_iids: set[int],
    jorge_iids: set[int],
    ex_count: dict[tuple[int, str], int],
    erp_localidad: dict[str, str],
    city_owner: dict[str, str],
    *,
    geographic: bool = False,
) -> tuple[str, str]:
    """
    Dueño del PDV por localidad. Ivan Soto usa zonas fijas (geographic=True).
    Otros patrones: exhibición en el PDV, si no dueño de la ciudad por ex agregada.
    """
    city = normalize_localidad_zona(erp_localidad.get(erp))
    if geographic:
        owner = city_owner.get(city)
        if not owner:
            owner = resolve_ivan_soto_localidad_cuenta(city) or "monchi"
        return owner, "geografia"

    m_score = _score_cuenta(erp, monchi_iids, ex_count)
    j_score = _score_cuenta(erp, jorge_iids, ex_count)
    if m_score > j_score:
        return "monchi", "exhibiciones_pdv"
    if j_score > m_score:
        return "jorge_coronel", "exhibiciones_pdv"
    owner = city_owner.get(city, "monchi")
    return owner, "ciudad"


def build_patron_cartera_partition(
    sb: Client,
    dist_id: int,
    leader_vid: int,
    cuenta_specs: list[dict],
    *,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    lookback_days: int = LOOKBACK_DAYS_DEFAULT,
) -> dict:
    """
    Partición exhaustiva y disjunta de la cartera ERP del líder entre cuentas
    operativas (Monchi / Jorge). Monchi + Jorge = Equipo.

    Ivan Soto (Tabaco): partición geográfica por localidad — Monchi Tacuarendí→Basail,
    Jorge Villa Ocampo sur/oeste. Otros patrones: dueño por exhibiciones en la ciudad.
    """
    if not fecha_desde or not fecha_hasta:
        fecha_desde, fecha_hasta = _default_fecha_bounds(lookback_days)

    partition_cuentas = [
        c for c in cuenta_specs if c.get("id") in ("monchi", "jorge_coronel")
    ]
    if not partition_cuentas:
        return {
            "equipo_erps": set(),
            "by_cuenta": {},
            "ruta_ids": set(),
            "asignacion_cartera": {
                "pdv_count_equipo": 0,
                "lookback_dias": lookback_days,
                "actualizado_at": datetime.now(AR_TZ).isoformat(),
            },
        }

    monchi_iids: set[int] = set()
    jorge_iids: set[int] = set()
    for spec in partition_cuentas:
        if spec["id"] == "monchi":
            monchi_iids = set(spec["integrante_ids"])
        elif spec["id"] == "jorge_coronel":
            jorge_iids = set(spec["integrante_ids"])

    all_erps, erp_to_ruta, ruta_ids = _fetch_leader_cartera_erps(sb, dist_id, leader_vid)
    erp_localidad_raw = _load_erp_localidad_map(sb, dist_id, all_erps)
    erp_localidad = {
        erp: normalize_localidad_zona(loc) for erp, loc in erp_localidad_raw.items()
    }
    geographic = is_ivan_soto_geographic_partition(dist_id, leader_vid)
    ex_count: dict[tuple[int, str], int] = {}

    if geographic:
        city_owner = build_ivan_soto_city_owner(set(erp_localidad.values()))
    else:
        erp_canonical = build_erp_canonical_lookup(all_erps)
        team_ids: list[int] = []
        for spec in partition_cuentas:
            if spec.get("integrante_ids"):
                team_ids.append(int(spec["integrante_ids"][0]))
        ivan_spec = next((c for c in cuenta_specs if c.get("id") == "ivan_soto"), None)
        if ivan_spec and ivan_spec.get("integrante_ids"):
            team_ids.extend(int(x) for x in ivan_spec["integrante_ids"])
        team_ids = list(dict.fromkeys(team_ids))
        ex_count = _build_ex_count_by_integrante_erp(
            sb,
            dist_id,
            team_ids,
            fecha_desde,
            fecha_hasta,
            erp_to_ruta,
            erp_canonical=erp_canonical,
        )
        city_owner = _build_city_owner_by_ex(
            ex_count, erp_localidad, monchi_iids, jorge_iids
        )
        for city in set(erp_localidad.values()):
            city_owner.setdefault(city, "monchi")

    by_cuenta: dict[str, set[str]] = {spec["id"]: set() for spec in partition_cuentas}
    desde_exhibiciones_pdv = 0
    desde_ciudad = 0
    desde_geografia = 0
    ciudades_monchi: list[str] = []
    ciudades_jorge: list[str] = []
    localidades_sin_catalogar: list[str] = []

    for city, owner in sorted(city_owner.items()):
        if owner == "jorge_coronel":
            ciudades_jorge.append(city)
        else:
            ciudades_monchi.append(city)

    for erp in all_erps:
        owner, reason = _assign_pdv_owner(
            erp,
            monchi_iids,
            jorge_iids,
            ex_count,
            erp_localidad,
            city_owner,
            geographic=geographic,
        )
        by_cuenta[owner].add(erp)
        if reason == "geografia":
            desde_geografia += 1
            city = erp_localidad.get(erp, "SIN_CIUDAD")
            if city not in city_owner and city not in localidades_sin_catalogar:
                localidades_sin_catalogar.append(city)
        elif reason == "exhibiciones_pdv":
            desde_exhibiciones_pdv += 1
        else:
            desde_ciudad += 1

    monchi_n = len(by_cuenta.get("monchi", set()))
    jorge_n = len(by_cuenta.get("jorge_coronel", set()))
    asignacion: dict = {
        "pdv_count_equipo": len(all_erps),
        "pdv_count_monchi": monchi_n,
        "pdv_count_jorge_coronel": jorge_n,
        "ciudades_monchi": ciudades_monchi,
        "ciudades_jorge_coronel": ciudades_jorge,
        "lookback_dias": lookback_days,
        "periodo_desde": fecha_desde,
        "periodo_hasta": fecha_hasta,
        "actualizado_at": datetime.now(AR_TZ).isoformat(),
    }
    if geographic:
        asignacion["modo"] = "geografia_ivan_soto"
        asignacion["desde_geografia"] = desde_geografia
        if localidades_sin_catalogar:
            asignacion["localidades_sin_catalogar"] = localidades_sin_catalogar
    else:
        asignacion["desde_exhibiciones_pdv"] = desde_exhibiciones_pdv
        asignacion["desde_ciudad"] = desde_ciudad

    return {
        "equipo_erps": all_erps,
        "by_cuenta": by_cuenta,
        "ruta_ids": ruta_ids,
        "asignacion_cartera": asignacion,
    }


def get_patron_cartera_for_cuenta(
    sb: Client,
    dist_id: int,
    leader_vid: int,
    cuenta_id: str,
    *,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    lookback_days: int = LOOKBACK_DAYS_DEFAULT,
) -> tuple[set[str], dict]:
    """ERP ids de una cuenta patrón + metadata (partición completa)."""
    from core.vendedor_app_patron_scope import list_patron_cuentas

    cuentas = list_patron_cuentas(sb, dist_id, leader_vid)
    partition = build_patron_cartera_partition(
        sb,
        dist_id,
        leader_vid,
        cuentas,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        lookback_days=lookback_days,
    )
    meta = dict(partition["asignacion_cartera"])
    meta["cuenta_id"] = cuenta_id
    if cuenta_id == "equipo":
        meta["pdv_count"] = meta.get("pdv_count_equipo", 0)
        return set(partition["equipo_erps"]), meta

    erps = partition["by_cuenta"].get(cuenta_id, set())
    meta["pdv_count"] = len(erps)
    meta["ruta_count"] = len(partition.get("ruta_ids") or set())
    return erps, meta


def _assign_ventas_pdvs_to_integrante(
    sb: Client,
    dist_id: int,
    leader_vid: int,
    target_integrante_ids: list[int],
    all_team_integrante_ids: list[int],
    fecha_desde: str,
    fecha_hasta: str,
    erp_from_exhibiciones: set[str],
) -> set[str]:
    """PDVs con venta asignados al integrante con más exhibiciones en ese PDV."""
    from services.estadisticas_service import _fetch_ventas_rows_vendedor, _vendor_context

    if not target_integrante_ids:
        return set()

    vctx = _vendor_context(dist_id, str(leader_vid))
    try:
        ventas = _fetch_ventas_rows_vendedor(dist_id, vctx, fecha_desde, fecha_hasta)
    except Exception as e:
        logger.warning(f"assign_ventas_pdvs dist={dist_id} leader={leader_vid}: {e}")
        return set()

    venta_erps = {
        str(r.get("id_cliente_erp") or r.get("cod_cliente") or "").strip()
        for r in ventas
        if str(r.get("id_cliente_erp") or r.get("cod_cliente") or "").strip()
    }
    venta_erps -= erp_from_exhibiciones
    if not venta_erps:
        return set()

    team_ex = _paginate_exhibiciones(
        sb, dist_id, all_team_integrante_ids, fecha_desde, fecha_hasta
    )
    ex_count: dict[tuple[int, str], int] = defaultdict(int)
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    pdv_to_erp_cache: dict[int, str] = {}

    for ex in team_ex:
        try:
            iid = int(ex.get("id_integrante"))
        except (TypeError, ValueError):
            continue
        erp = str(ex.get("cliente_sombra_codigo") or "").strip()
        cid = ex.get("id_cliente_pdv") or ex.get("id_cliente")
        if cid is not None:
            try:
                pid = int(cid)
                erp = pdv_to_erp_cache.get(pid) or erp
                if not erp:
                    res = (
                        sb.table(t_pdv)
                        .select("id_cliente_erp")
                        .eq("id_distribuidor", dist_id)
                        .eq("id_cliente", pid)
                        .limit(1)
                        .execute()
                    )
                    if res.data:
                        erp = str(res.data[0].get("id_cliente_erp") or "").strip()
                        pdv_to_erp_cache[pid] = erp
            except (TypeError, ValueError):
                pass
        if erp:
            ex_count[(iid, erp)] += 1

    target_set = {int(x) for x in target_integrante_ids}
    won: set[str] = set()
    for erp in venta_erps:
        scores = [(iid, ex_count.get((iid, erp), 0)) for iid in all_team_integrante_ids]
        scores = [(i, c) for i, c in scores if c > 0]
        if not scores:
            continue
        best_iid = max(scores, key=lambda x: x[1])[0]
        if best_iid in target_set:
            won.add(erp)
    return won


def infer_patron_cartera_scope(
    sb: Client,
    dist_id: int,
    leader_vid: int,
    integrante_ids: list[int],
    *,
    all_team_integrante_ids: list[int] | None = None,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    lookback_days: int = LOOKBACK_DAYS_DEFAULT,
) -> dict:
    """Cartera operativa de un integrante = partición disjunta sobre cartera Equipo."""
    if not integrante_ids:
        return {
            "erp_ids": set(),
            "ruta_ids": set(),
            "asignacion_cartera": {
                "pdv_count": 0,
                "ruta_count": 0,
                "lookback_dias": lookback_days,
                "actualizado_at": datetime.now(AR_TZ).isoformat(),
            },
        }

    from core.vendedor_app_patron_scope import list_patron_cuentas

    cuentas = list_patron_cuentas(sb, dist_id, leader_vid)
    target_iid = int(integrante_ids[0])
    cuenta_id = next(
        (c["id"] for c in cuentas if target_iid in c.get("integrante_ids", [])),
        None,
    )
    if not cuenta_id:
        return {
            "erp_ids": set(),
            "ruta_ids": set(),
            "asignacion_cartera": {
                "pdv_count": 0,
                "ruta_count": 0,
                "lookback_dias": lookback_days,
                "actualizado_at": datetime.now(AR_TZ).isoformat(),
            },
        }

    erp_ids, meta = get_patron_cartera_for_cuenta(
        sb,
        dist_id,
        leader_vid,
        cuenta_id,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        lookback_days=lookback_days,
    )
    _, erp_to_ruta, _ = _fetch_leader_cartera_erps(sb, dist_id, leader_vid)
    rutas_detectadas = {
        erp_to_ruta[erp] for erp in erp_ids if erp in erp_to_ruta
    }

    asignacion = dict(meta)
    asignacion.setdefault("pdv_count", len(erp_ids))
    asignacion.setdefault("ruta_count", len(rutas_detectadas))

    return {
        "erp_ids": erp_ids,
        "ruta_ids": rutas_detectadas,
        "asignacion_cartera": asignacion,
    }


def list_team_integrante_ids(sb: Client, dist_id: int, leader_vid: int) -> list[int]:
    res = (
        sb.table("integrantes_grupo")
        .select("id_integrante")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor_v2", leader_vid)
        .execute()
    )
    out: list[int] = []
    for r in res.data or []:
        try:
            out.append(int(r["id_integrante"]))
        except (TypeError, ValueError):
            continue
    return out
