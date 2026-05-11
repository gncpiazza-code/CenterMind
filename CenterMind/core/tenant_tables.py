from __future__ import annotations

from typing import Iterable


PARTITIONED_BASES = {
    "clientes_pdv_v2",
    "sucursales_v2",
    "vendedores_v2",
    "rutas_v2",
    "ventas_enriched_v2",
}

# Tablas base a clonar cuando se da de alta un nuevo tenant.
TENANT_TABLE_BLUEPRINTS = {
    "sucursales_v2": "sucursales_v2",
    "vendedores_v2": "vendedores_v2",
    "rutas_v2": "rutas_v2",
    "clientes_pdv_v2": "clientes_pdv_v2",
    "ventas_enriched_v2": "ventas_enriched_v2",
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


def ensure_tenant_partition_tables(sb, dist_id: int) -> None:
    """
    Crea tablas tenant *_d{dist} si no existen, clonando el esquema
    desde un tenant blueprint conocido.
    """
    did = int(dist_id)
    statements: list[str] = []
    for base, blueprint in TENANT_TABLE_BLUEPRINTS.items():
        target = tenant_table_name(base, did)
        statements.append(
            f"CREATE TABLE IF NOT EXISTS public.{target} "
            f"(LIKE public.{blueprint} INCLUDING ALL);"
        )

    sql = " ".join(statements)
    last_err: Exception | None = None
    for payload in ({"sql": sql}, {"p_sql": sql}):
        try:
            # We try to use exec_sql if it exists, otherwise we just try to execute the query directly if possible
            # or skip if not supported
            sb.rpc("exec_sql", payload).execute()
            return
        except Exception as e:
            last_err = e
            
    # If exec_sql fails, we can't create the tables automatically.
    # This is a known issue with some Supabase instances that don't have the exec_sql function.
    # We'll just log the error and continue, the tables will need to be created manually.
    import logging
    logger = logging.getLogger("tenant_tables")
    logger.error(f"Could not create tenant tables for dist_id {dist_id}. Please create them manually. Error: {last_err}")

