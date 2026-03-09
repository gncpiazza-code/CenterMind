import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

migration_sql = """
-- Actualizar fn_get_live_map_events para incluir drive_link y cliente_nombre (v2)
CREATE OR REPLACE FUNCTION fn_get_live_map_events(p_minutes_back int DEFAULT 60)
RETURNS TABLE (
    id_ex int,
    id_dist int,
    nombre_dist text,
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

print("Executing live map migration...")
try:
    pg_pass = os.environ.get("PG_PASS")
    if not pg_pass:
        print("Error: PG_PASS not found in .env")
        exit(1)
        
    conn = psycopg2.connect(
        dbname="postgres",
        user="postgres",
        password=pg_pass.replace('"', ''),
        host="db.xjwadmzuuzctxbrvgopx.supabase.co",
        port="5432"
    )
    cur = conn.cursor()
    cur.execute(migration_sql)
    conn.commit()
    cur.close()
    conn.close()
    print("Migration successful!")
except Exception as e:
    print(f"Migration failed: {e}")
