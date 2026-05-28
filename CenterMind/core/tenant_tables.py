from __future__ import annotations

from typing import Iterable


PARTITIONED_BASES = {
    "clientes_pdv_v2",
    "sucursales_v2",
    "vendedores_v2",
    "rutas_v2",
    "ventas_enriched_v2",
}

# Tablas *_d{dist} sin columna id_distribuidor (el tenant es el sufijo _dN).
# No usar sb.table("rutas_v2") en runtime: siempre tenant_table_name("rutas_v2", dist_id).
TENANT_TABLES_WITHOUT_DISTRIBUIDOR_COLUMN = frozenset({"rutas_v2"})

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
    Resuelve el nombre de tabla por tenant (NUNCA la tabla base legacy en lecturas de padrón).

    Ej:
      tenant_table_name("rutas_v2", 3) -> "rutas_v2_d3"
      tenant_table_name("clientes_pdv_v2", 3) -> "clientes_pdv_v2_d3"

    Las tablas base sin sufijo (rutas_v2, vendedores_v2, …) solo las usa la ingesta RPA
    como blueprint/serial; el portal, dashboard y bots deben pasar siempre dist_id aquí.
    """
    if dist_id is None or base_table not in PARTITIONED_BASES:
        return base_table
    return f"{base_table}_d{int(dist_id)}"


def tenant_table_supports_distribuidor_filter(base_table: str) -> bool:
    """False para rutas_v2_* (no tienen id_distribuidor)."""
    return base_table not in TENANT_TABLES_WITHOUT_DISTRIBUIDOR_COLUMN


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


def build_tenant_tables_sql(dist_id: int, dist_nombre: str | None = None) -> str:
    """
    SQL manual para Supabase cuando exec_sql no está disponible.
    Copia de esquema (LIKE), NO particiones PostgreSQL (las tablas base no son PARTITIONED).
    """
    did = int(dist_id)
    if dist_nombre:
        header = f"-- Tenant: {dist_nombre.strip()} (ID: {did})"
    else:
        header = f"-- Tenant ID: {did}"
    lines = [
        f"-- Ejecutar en el SQL Editor de Supabase",
        header,
        "-- Crea tablas *_d{N} clonando el esquema de las tablas blueprint.",
        "-- NO usar: CREATE TABLE ... PARTITION OF ... (error 42P17: tabla no particionada).",
        "",
    ]
    for base, blueprint in TENANT_TABLE_BLUEPRINTS.items():
        target = tenant_table_name(base, did)
        lines.append(
            f"CREATE TABLE IF NOT EXISTS public.{target} "
            f"(LIKE public.{blueprint} INCLUDING ALL);"
        )
    lines.append("")
    return "\n".join(lines)


def ensure_tenant_partition_tables(sb, dist_id: int) -> None:
    """
    Crea tablas tenant *_d{dist} si no existen, clonando el esquema
    desde un tenant blueprint conocido.
    """
    sql = build_tenant_tables_sql(dist_id).replace("\n", " ")
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

