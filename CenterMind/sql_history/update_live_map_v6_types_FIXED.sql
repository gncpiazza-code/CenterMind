-- DROP versiones viejas para evitar conflictos de tipos
DROP FUNCTION IF EXISTS public.fn_get_live_map_events(integer);
DROP FUNCTION IF EXISTS public.fn_get_live_map_events(integer, date);

-- CREAR VERSIÓN CORREGIDA (v6) con bigint para IDs
CREATE OR REPLACE FUNCTION public.fn_get_live_map_events(
    p_minutes_back integer DEFAULT 60,
    p_date date DEFAULT NULL
)
RETURNS TABLE(
    id_ex bigint,
    id_dist bigint,
    nombre_dist text,
    vendedor_nombre text,
    lat numeric,
    lon numeric,
    timestamp_evento timestamp with time zone,
    nro_cliente text,
    cliente_nombre text,
    drive_link text,
    id_vendedor bigint
) AS $$
BEGIN
    IF p_date IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            e.id_exhibicion::bigint,
            e.id_distribuidor::bigint,
            COALESCE(d.nombre_empresa, 'Desconocida')::text,
            COALESCE(v.nombre_integrante, 'Vendedor Desconocido')::text,
            e.latitud_gps::numeric,
            e.longitud_gps::numeric,
            e.timestamp_subida,
            COALESCE(c.numero_cliente_local, '0')::text,
            COALESCE(c.nombre_fantasia, 'Cliente S/N')::text,
            e.url_foto_drive::text,
            e.id_integrante::bigint
        FROM exhibiciones e
        LEFT JOIN integrantes_grupo v ON e.id_integrante = v.id_integrante
        LEFT JOIN clientes c ON e.id_cliente = c.id_cliente
        LEFT JOIN distribuidores d ON e.id_distribuidor = d.id_distribuidor
        WHERE e.timestamp_subida::date = p_date
        ORDER BY e.timestamp_subida DESC;
    ELSE
        RETURN QUERY
        SELECT 
            e.id_exhibicion::bigint,
            e.id_distribuidor::bigint,
            COALESCE(d.nombre_empresa, 'Desconocida')::text,
            COALESCE(v.nombre_integrante, 'Vendedor Desconocido')::text,
            e.latitud_gps::numeric,
            e.longitud_gps::numeric,
            e.timestamp_subida,
            COALESCE(c.numero_cliente_local, '0')::text,
            COALESCE(c.nombre_fantasia, 'Cliente S/N')::text,
            e.url_foto_drive::text,
            e.id_integrante::bigint
        FROM exhibiciones e
        LEFT JOIN integrantes_grupo v ON e.id_integrante = v.id_integrante
        LEFT JOIN clientes c ON e.id_cliente = c.id_cliente
        LEFT JOIN distribuidores d ON e.id_distribuidor = d.id_distribuidor
        WHERE e.timestamp_subida >= (now() - (p_minutes_back || ' minutes')::interval)
        ORDER BY e.timestamp_subida DESC;
    END IF;
END;
$$ LANGUAGE plpgsql;
