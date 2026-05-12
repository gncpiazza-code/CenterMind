import psycopg2
import os
from dotenv import load_dotenv
from urllib.parse import quote_plus

load_dotenv()

# Configuración Supabase (Pooler Transactional)
PROJECT_REF = "xjwadmzuuzctxbrvgopx"
DB_HOST = "aws-0-sa-east-1.pooler.supabase.com"
DB_NAME = "postgres"
DB_USER = "postgres.xjwadmzuuzctxbrvgopx"
DB_PASS = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br").strip('"').strip("'")
DB_PORT = "6543"

conn_str = f"postgresql://{DB_USER}:{quote_plus(DB_PASS)}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode=require"

try:
    print(f"Connecting to {DB_HOST}:{DB_PORT}...")
    conn = psycopg2.connect(conn_str)
    conn.autocommit = True
    cur = conn.cursor()
    
    sql = """
    DROP FUNCTION IF EXISTS public.fn_dashboard_ranking(bigint, text, int);
    DROP FUNCTION IF EXISTS public.fn_dashboard_ranking(bigint, text, int, bigint);

    CREATE OR REPLACE FUNCTION public.fn_dashboard_ranking(
        p_dist_id bigint, 
        p_periodo text DEFAULT 'mes', 
        p_top int DEFAULT 1000, 
        p_sucursal_id bigint DEFAULT NULL
    )
     RETURNS TABLE(vendedor text, aprobadas bigint, destacadas bigint, rechazadas bigint, puntos bigint, location_id text)
     LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
        RETURN QUERY
        WITH unique_exhibs AS (
            SELECT DISTINCT ON (
                e.id_integrante, 
                COALESCE(e.id_cliente_pdv::text, e.id_cliente::text, e.cliente_sombra_codigo::text, e.url_foto_drive, e.telegram_msg_id::text, e.id_exhibicion::text), 
                e.timestamp_subida::DATE
            ) 
                e.id_exhibicion, e.id_integrante, e.estado, e.id_distribuidor
            FROM public.exhibiciones e
            WHERE (p_dist_id = 0 OR e.id_distribuidor = p_dist_id)
              AND (
                (p_periodo = 'mes' AND e.timestamp_subida >= date_trunc('month', now())) OR
                (p_periodo = 'hoy' AND e.timestamp_subida >= date_trunc('day', now())) OR
                (p_periodo = 'semana' AND e.timestamp_subida >= date_trunc('week', now())) OR
                (p_periodo = 'ayer' AND e.timestamp_subida >= date_trunc('day', now() - interval '1 day') AND e.timestamp_subida < date_trunc('day', now()))
                OR (p_periodo ~ '^\d{4}-\d{2}$' AND to_char(e.timestamp_subida, 'YYYY-MM') = p_periodo)
                OR (p_periodo ~ '^\d{4}-\d{2}-\d{2}$' AND e.timestamp_subida::DATE = p_periodo::DATE)
              )
            ORDER BY 
                e.id_integrante, 
                COALESCE(e.id_cliente_pdv::text, e.id_cliente::text, e.cliente_sombra_codigo::text, e.url_foto_drive, e.telegram_msg_id::text, e.id_exhibicion::text), 
                e.timestamp_subida::DATE,
                CASE 
                    WHEN LOWER(e.estado) IN ('destacado', 'destacada') THEN 1 
                    WHEN LOWER(e.estado) IN ('aprobado', 'aprobada') THEN 2
                    WHEN LOWER(e.estado) IN ('rechazado', 'rechazada') THEN 3
                    ELSE 4 
                END ASC, e.timestamp_subida DESC
        ),
        stats AS (
            SELECT 
                i.id_integrante,
                i.nombre_integrante as nom,
                i.id_vendedor_erp as v_erp,
                i.id_sucursal_erp as s_erp,
                COUNT(ue.id_exhibicion) FILTER (WHERE LOWER(ue.estado) IN ('aprobado', 'aprobada', 'destacada', 'destacado')) as aprob,
                COUNT(ue.id_exhibicion) FILTER (WHERE LOWER(ue.estado) IN ('rechazado', 'rechazada')) as rech,
                COUNT(ue.id_exhibicion) FILTER (WHERE LOWER(ue.estado) IN ('destacada', 'destacado')) as dest,
                (COUNT(ue.id_exhibicion) FILTER (WHERE LOWER(ue.estado) IN ('aprobado', 'aprobada')) * 1 +
                 COUNT(ue.id_exhibicion) FILTER (WHERE LOWER(ue.estado) IN ('destacada', 'destacado')) * 2) as pts
            FROM unique_exhibs ue
            JOIN public.integrantes_grupo i ON ue.id_integrante = i.id_integrante
            LEFT JOIN public.vendedores v ON i.id_vendedor_erp = v.id_vendedor_erp AND i.id_distribuidor = v.id_distribuidor
            WHERE (p_sucursal_id IS NULL OR v.id_sucursal = p_sucursal_id)
            GROUP BY i.id_integrante, i.nombre_integrante, i.id_vendedor_erp, i.id_sucursal_erp
        )
        SELECT 
            COALESCE(NULLIF(s.v_erp, ''), s.nom)::TEXT,
            s.aprob::BIGINT,
            s.dest::BIGINT,
            s.rech::BIGINT,
            s.pts::BIGINT,
            s.s_erp::TEXT
        FROM stats s
        ORDER BY s.pts DESC
        LIMIT p_top;
    END;
    $$;
    """
    
    print("Executing SQL...")
    cur.execute(sql)
    print("✅ SUCCESS: fn_dashboard_ranking updated.")
    cur.close()
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
