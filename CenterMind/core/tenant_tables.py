from __future__ import annotations

from typing import Iterable


PARTITIONED_BASES = {
    "clientes_pdv_v2",
    "sucursales_v2",
    "vendedores_v2",
    "rutas_v2",
}


def tenant_table_name(base_table: str, dist_id: int | None) -> str:
    """
    Resuelve el nombre de tabla por tenant.
    Ej:
      clientes_pdv_v2 + dist=3 -> clientes_pdv_v2_d3
    """
    if dist_id is None or base_table not in PARTITIONED_BASES:
        return base_table
    return f"{base_table}_d{int(dist_id)}"


def load_dist_ids(sb) -> list[int]:
    """
    Devuelve IDs de distribuidores existentes (activos e inactivos).
    """
    out: list[int] = []
    # Compat: algunos ambientes usan distribuidores.id y otros id_distribuidor
    for col in ("id", "id_distribuidor"):
        try:
            res = sb.table("distribuidores").select(col).order(col).execute()
            rows = res.data or []
            out = []
            for r in rows:
                try:
                    value = r.get(col)
                    if value is not None:
                        out.append(int(value))
                except Exception:
                    continue
            if out:
                return out
        except Exception:
            continue
    return out


def find_dist_by_vendedor(sb, id_vendedor: int, dist_ids: Iterable[int]) -> int | None:
    """
    Busca en qué tenant existe el id_vendedor.
    """
    for dist_id in dist_ids:
        t_vend = tenant_table_name("vendedores_v2", dist_id)
        try:
            res = (
                sb.table(t_vend)
                .select("id_vendedor")
                .eq("id_vendedor", id_vendedor)
                .limit(1)
                .execute()
            )
            if res.data:
                return int(dist_id)
        except Exception:
            continue
    return None


def find_dist_by_ruta(sb, id_ruta: int, dist_ids: Iterable[int]) -> int | None:
    """
    Busca en qué tenant existe el id_ruta.
    """
    for dist_id in dist_ids:
        t_rutas = tenant_table_name("rutas_v2", dist_id)
        try:
            res = (
                sb.table(t_rutas)
                .select("id_ruta")
                .eq("id_ruta", id_ruta)
                .limit(1)
                .execute()
            )
            if res.data:
                return int(dist_id)
        except Exception:
            continue
    return None

