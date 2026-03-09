import os
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

# Relative path to .env
env_path = Path("CenterMind/.env")

def load_env(path):
    if not path.exists():
        print(f"Error: {path} not found")
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                key, value = line.strip().split("=", 1)
                os.environ[key] = value.strip('"').strip("'")

load_env(env_path)

migration_sql = """
-- Actualizar fn_get_live_map_events para incluir id_vendedor (v3)
CREATE OR REPLACE FUNCTION fn_get_live_map_events(p_minutes_back int DEFAULT 60)
RETURNS TABLE (
    id_ex int,
    id_dist int,
    nombre_dist text,
    id_vendedor int,
    vendedor_nombre text,
    lat numeric,
    lon numeric,
    timestamp_evento timestamptz,
    nro_cliente text,
    cliente_nombre text,
    drive_link text
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id_exhibicion as id_ex,
        e.id_distribuidor as id_dist,
        d.nombre_empresa as nombre_dist,
        ig.id_integrante as id_vendedor,
        ig.nombre_integrante as vendedor_nombre,
        e.latitud as lat,
        e.longitud as lon,
        e.timestamp_subida as timestamp_evento,
        e.numero_cliente_local as nro_cliente,
        COALESCE(c.nombre_cliente, 'Cliente ' || e.numero_cliente_local) as cliente_nombre,
        e.drive_link as drive_link
    FROM exhibiciones e
    JOIN distribuidores d ON e.id_distribuidor = d.id_distribuidor
    JOIN integrantes_grupo ig ON e.id_integrante = ig.id_integrante
    LEFT JOIN erp_clientes_raw c ON (e.numero_cliente_local = c.id_cliente_erp_local AND e.id_distribuidor = c.id_distribuidor)
    WHERE e.latitud IS NOT NULL 
      AND e.longitud IS NOT NULL
      AND e.timestamp_subida >= NOW() - (p_minutes_back || ' minutes')::interval
    ORDER BY e.timestamp_subida DESC;
END;
$$;
"""

def run_migration():
    project_ref = "xjwadmzuuzctxbrvgopx"
    # Try the password from apply_rpc_fix.py if env fails
    password = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br")
    
    # Try the pooler host
    host = "aws-0-sa-east-1.pooler.supabase.com"
    port = 6543
    user = f"postgres.{project_ref}"

    print(f"Executing live map migration on {host} with user {user}...")
    try:
        conn = psycopg2.connect(
            dbname="postgres",
            user=user,
            password=password,
            host=host,
            port=port,
            sslmode="require",
            connect_timeout=10
        )
        cur = conn.cursor()
        cur.execute(migration_sql)
        conn.commit()
        cur.close()
        conn.close()
        print("✅ Migration successful (v3)!")
    except Exception as e:
        print(f"❌ Migration failed: {e}")

if __name__ == "__main__":
    run_migration()
