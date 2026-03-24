import os
import psycopg2
from dotenv import load_dotenv

# Load from CenterMind/.env
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

# Credentials
project_ref = "xjwadmzuuzctxbrvgopx"
password = os.environ.get("PG_PASS")
if password:
    password = password.strip('"').strip("'")
else:
    print("❌ PG_PASS not found")
    exit(1)

host = "aws-0-sa-east-1.pooler.supabase.com"
port = 6543
user = f"postgres.{project_ref}"
dbname = "postgres"

sql = """
CREATE OR REPLACE FUNCTION fn_admin_global_monitoring()
RETURNS TABLE (
    id_dist BIGINT,
    nombre_dist TEXT,
    total_exhibiciones BIGINT,
    total_ventas_erp BIGINT,
    total_clientes_erp BIGINT,
    ultima_actividad TIMESTAMP WITH TIME ZONE,
    estado_bot TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id_distribuidor as id_dist,
        d.nombre_empresa as nombre_dist,
        (SELECT COUNT(*) FROM exhibiciones e WHERE e.id_distribuidor = d.id_distribuidor) as total_exhibiciones,
        (SELECT COUNT(*) FROM erp_ventas_raw v WHERE v.id_distribuidor = d.id_distribuidor) as total_ventas_erp,
        (SELECT COUNT(*) FROM erp_clientes_raw c WHERE c.id_distribuidor = d.id_distribuidor) as total_clientes_erp,
        (SELECT MAX(timestamp_subida) FROM exhibiciones e WHERE e.id_distribuidor = d.id_distribuidor) as ultima_actividad,
        d.estado as estado_bot
    FROM distribuidores d
    ORDER BY total_exhibiciones DESC;
END;
$$ LANGUAGE plpgsql;
"""

print(f"Connecting to {host} as {user}...")
try:
    conn = psycopg2.connect(
        dbname=dbname,
        user=user,
        password=password,
        host=host,
        port=port,
        sslmode="require"
    )
    cur = conn.cursor()
    print("Executing SQL fix for global monitoring...")
    cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()
    print("✅ SUCCESS: fn_admin_global_monitoring updated.")
except Exception as e:
    print(f"❌ Error applying SQL: {e}")
