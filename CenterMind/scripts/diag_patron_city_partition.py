# -*- coding: utf-8 -*-
"""Diagnóstico partición patrón por ciudad (read-only)."""
import os
import sys
from collections import Counter, defaultdict

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from supabase import create_client

from core.estadisticas_tabaco_rollup import IVAN_SOTO_V2_ID, TABACO_DIST_ID
from core.vendedor_app_patron_scope import list_patron_cuentas
from services.vendedor_patron_cartera_service import (
    LOOKBACK_DAYS_DEFAULT,
    _assign_pdv_owner,
    _build_city_owner_by_ex,
    _build_ex_count_by_integrante_erp,
    _default_fecha_bounds,
    _fetch_leader_cartera_erps,
    _load_erp_localidad_map,
    _score_cuenta,
    build_erp_canonical_lookup,
    build_patron_cartera_partition,
)


def main() -> None:
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    dist_id, leader = TABACO_DIST_ID, IVAN_SOTO_V2_ID
    monchi_iids = {300}
    jorge_iids = {352}
    fd, fh = _default_fecha_bounds(LOOKBACK_DAYS_DEFAULT)

    all_erps, erp_to_ruta, _ = _fetch_leader_cartera_erps(sb, dist_id, leader)
    erp_canonical = build_erp_canonical_lookup(all_erps)
    ex_count = _build_ex_count_by_integrante_erp(
        sb, dist_id, [300, 352, 30], fd, fh, erp_to_ruta, erp_canonical=erp_canonical
    )
    erp_localidad = _load_erp_localidad_map(sb, dist_id, all_erps)
    city_owner = _build_city_owner_by_ex(ex_count, erp_localidad, monchi_iids, jorge_iids)
    for city in set(erp_localidad.values()):
        city_owner.setdefault(city, "monchi")

    jorge_cities = {c for c, o in city_owner.items() if o == "jorge_coronel"}
    wrong_m: list[tuple] = []
    wrong_j: list[tuple] = []

    for erp in sorted(all_erps):
        city = erp_localidad.get(erp, "SIN_CIUDAD")
        owner, reason = _assign_pdv_owner(
            erp, monchi_iids, jorge_iids, ex_count, erp_localidad, city_owner
        )
        m = _score_cuenta(erp, monchi_iids, ex_count)
        j = _score_cuenta(erp, jorge_iids, ex_count)
        expected = city_owner.get(city, "monchi")
        if expected == "jorge_coronel" and owner == "monchi":
            wrong_m.append((erp, city, m, j, reason))
        if expected == "monchi" and owner == "jorge_coronel":
            wrong_j.append((erp, city, m, j, reason))

    city_counts = Counter(erp_localidad.get(e, "SIN_CIUDAD") for e in all_erps)
    print("=== Ciudades Jorge (dueño por ex agregada) ===")
    for c in sorted(jorge_cities):
        print(f"  {c}: {city_counts.get(c, 0)} PDVs en cartera")

    print(f"\n=== PDVs en ciudad Jorge → asignados a Monchi (override PDV): {len(wrong_m)} ===")
    for row in wrong_m:
        print(" ", row)

    print(f"\n=== PDVs en ciudad Monchi → asignados a Jorge (override PDV): {len(wrong_j)} ===")
    for row in wrong_j:
        print(" ", row)

    pure: dict[str, int] = defaultdict(int)
    for erp in all_erps:
        city = erp_localidad.get(erp, "SIN_CIUDAD")
        pure[city_owner.get(city, "monchi")] += 1
    print(f"\nSolo ciudad (sin override PDV): Monchi={pure['monchi']} Jorge={pure['jorge_coronel']}")

    part = build_patron_cartera_partition(
        sb, dist_id, leader, list_patron_cuentas(sb, dist_id, leader)
    )
    meta = part["asignacion_cartera"]
    print(
        f"\nActual: Monchi={meta['pdv_count_monchi']} Jorge={meta['pdv_count_jorge_coronel']} "
        f"(pdv_override={meta['desde_exhibiciones_pdv']} ciudad={meta['desde_ciudad']})"
    )


if __name__ == "__main__":
    main()
