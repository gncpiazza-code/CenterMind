import psycopg2

print("Connecting to Supabase DB to run migration...")
conn_str = "postgresql://postgres:*7#qyZ5btqW2&br@db.xjwadmzuuzctxbrvgopx.supabase.co:5432/postgres"

sql = """
CREATE TABLE IF NOT EXISTS cuentas_corrientes_data (
    id              BIGSERIAL PRIMARY KEY,
    id_distribuidor INTEGER,
    tenant_id       TEXT NOT NULL,
    fecha           DATE NOT NULL,
    data            JSONB,
    file_b64        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, fecha)
);
"""

try:
    with psycopg2.connect(conn_str) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            conn.commit()
    print("Migration successful.")
except Exception as e:
    print(f"Migration failed: {e}")
