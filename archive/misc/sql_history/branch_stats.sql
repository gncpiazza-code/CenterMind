-- Cruce de datos: Clientes ERP vs Exhibiciones Shelfy por Sucursal
CREATE OR REPLACE FUNCTION fn_reporte_sucursales_cruce(p_dist_id BIGINT, p_periodo TEXT)
RETURNS TABLE (
    location_id BIGINT,
    sucursal_name TEXT,
    total_clientes_erp BIGINT,
    total_exhibiciones BIGINT,
    clientes_visitados BIGINT,
    aprobadas BIGINT,
    cobertura_pct NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH erp_counts AS (
        -- Conteos desde la raw del ERP
        SELECT 
            sucursal_erp,
            COUNT(*)::BIGINT as total_erp
        FROM erp_clientes_raw
        WHERE id_distribuidor = p_dist_id
        GROUP BY sucursal_erp
    ),
    shelfy_stats AS (
        -- Estadísticas desde la plataforma Shelfy
        SELECT 
            l.location_id,
            l.label as sucursal_label,
            COUNT(e.id_exhibicion)::BIGINT as total_ex,
            COUNT(DISTINCT e.id_cliente)::BIGINT as visitados,
            COUNT(*) FILTER (WHERE e.estado IN ('Aprobado', 'Destacado'))::BIGINT as aprob
        FROM locations l
        LEFT JOIN integrantes_grupo ig ON ig.location_id = l.location_id
        LEFT JOIN exhibiciones e ON e.id_integrante = ig.id_integrante
        WHERE l.dist_id = p_dist_id
          AND (
            CASE 
              WHEN p_periodo = 'hoy' THEN DATE(e.timestamp_subida AT TIME ZONE 'America/Argentina/Buenos_Aires') = CURRENT_DATE
              WHEN p_periodo = 'mes' THEN TO_CHAR(e.timestamp_subida AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM') = TO_CHAR(NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM')
              WHEN LENGTH(p_periodo) = 7 THEN TO_CHAR(e.timestamp_subida AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM') = p_periodo
              ELSE TRUE
            END
          )
        GROUP BY l.location_id, l.label
    )
    SELECT 
        l.location_id,
        COALESCE(l.label, 'Sin Nombre') as sucursal_name,
        COALESCE(ec.total_erp, 0)::BIGINT as total_clientes_erp,
        COALESCE(ss.total_ex, 0)::BIGINT as total_exhibiciones,
        COALESCE(ss.visitados, 0)::BIGINT as clientes_visitados,
        COALESCE(ss.aprob, 0)::BIGINT as aprobadas,
        CASE 
            WHEN COALESCE(ec.total_erp, 0) > 0 THEN 
                ROUND((COALESCE(ss.visitados, 0)::NUMERIC / ec.total_erp::NUMERIC) * 100, 2)
            ELSE 0 
        END as cobertura_pct
    FROM locations l
    LEFT JOIN erp_counts ec ON ec.sucursal_erp = l.label
    LEFT JOIN shelfy_stats ss ON ss.location_id = l.location_id
    WHERE l.dist_id = p_dist_id
    ORDER BY cobertura_pct DESC, sucursal_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
