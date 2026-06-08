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
