-- ================================================================
-- HIERARCHY MIGRATION - PHASE 2: RPC UPDATES
-- ================================================================

-- 1. Actualizar fn_usuarios_telegram
-- Ahora usa id_sucursal_erp y maestro_jerarquia para el label
DROP FUNCTION IF EXISTS fn_usuarios_telegram(bigint);
CREATE OR REPLACE FUNCTION fn_usuarios_telegram(p_dist_id BIGINT)
RETURNS TABLE(
    id_integrante BIGINT,
    telegram_user_id BIGINT,
    nombre_integrante TEXT,
    rol_telegram TEXT,
    location_id TEXT, -- Cambiado a TEXT para id_sucursal_erp
    telegram_group_id BIGINT,
    nombre_grupo TEXT,
    sucursal_label TEXT,
    id_vendedor_erp TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT i.id_integrante, 
           i.telegram_user_id, 
           i.nombre_integrante,
           i.rol_telegram, 
           i.id_sucursal_erp, 
           i.telegram_group_id,
           COALESCE(g.nombre_grupo, '') AS nombre_grupo,
           COALESCE(mj."SUCURSAL", '') AS sucursal_label,
           i.id_vendedor_erp
    FROM integrantes_grupo i
    LEFT JOIN grupos g ON g.telegram_chat_id = i.telegram_group_id
    LEFT JOIN (
        SELECT DISTINCT ON ("id suc", "ID_DIST") "id suc", "SUCURSAL", "ID_DIST"
        FROM maestro_jerarquia
    ) mj ON (mj."id suc" = i.id_sucursal_erp AND mj."ID_DIST" = i.id_distribuidor)
    WHERE (p_dist_id = 0 OR i.id_distribuidor = p_dist_id)
    ORDER BY i.nombre_integrante;
END;
$$;

-- 2. Actualizar fn_dashboard_por_sucursal
-- Agrupa por id_sucursal_erp y obtiene el nombre del maestro
DROP FUNCTION IF EXISTS fn_dashboard_por_sucursal(bigint, text);
CREATE OR REPLACE FUNCTION fn_dashboard_por_sucursal(p_dist_id BIGINT, p_periodo TEXT DEFAULT 'mes')
RETURNS TABLE(
    location_id TEXT,
    sucursal TEXT,
    aprobadas BIGINT,
    rechazadas BIGINT,
    total BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            i.id_sucursal_erp,
            COUNT(*) FILTER (WHERE e.estado = 'Aprobado') as aprob,
            COUNT(*) FILTER (WHERE e.estado = 'Rechazado') as rech,
            COUNT(*) as tot
        FROM exhibiciones e
        JOIN integrantes_grupo i ON e.id_integrante = i.id_integrante
        WHERE e.id_distribuidor = p_dist_id
          AND (
            (p_periodo = 'mes' AND e.timestamp_subida >= date_trunc('month', now())) OR
            (p_periodo = 'hoy' AND e.timestamp_subida >= date_trunc('day', now())) OR
            (p_periodo = 'semana' AND e.timestamp_subida >= date_trunc('week', now())) OR
            (p_periodo = 'ayer' AND e.timestamp_subida >= date_trunc('day', now() - interval '1 day') AND e.timestamp_subida < date_trunc('day', now()))
          )
        GROUP BY i.id_sucursal_erp
    )
    SELECT 
        s.id_sucursal_erp as location_id,
        COALESCE(mj."SUCURSAL", 'Sin Sucursal') as sucursal,
        COALESCE(s.aprob, 0)::bigint,
        COALESCE(s.rech, 0)::bigint,
        COALESCE(s.tot, 0)::bigint
    FROM stats s
    LEFT JOIN (
        SELECT DISTINCT ON ("id suc", "ID_DIST") "id suc", "SUCURSAL", "ID_DIST"
        FROM maestro_jerarquia
    ) mj ON (mj."id suc" = s.id_sucursal_erp AND mj."ID_DIST" = p_dist_id);
END;
$$;

-- 3. Actualizar fn_reporte_sucursales_cruce
-- Cruce de ERP vs Exhibiciones usando el maestro
DROP FUNCTION IF EXISTS fn_reporte_sucursales_cruce(bigint, text);
CREATE OR REPLACE FUNCTION fn_reporte_sucursales_cruce(p_dist_id BIGINT, p_periodo TEXT DEFAULT 'mes')
RETURNS TABLE(
    location_id TEXT,
    sucursal_name TEXT,
    total_clientes_erp BIGINT,
    total_exhibiciones BIGINT,
    clientes_visitados BIGINT,
    aprobadas BIGINT,
    cobertura_pct NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH erp_stats AS (
        SELECT 
            "id suc" as sid,
            "SUCURSAL" as sname,
            COUNT(DISTINCT "NRO CLIENTE") as clientes_tot
        FROM maestro_jerarquia
        WHERE "ID_DIST" = p_dist_id
        GROUP BY "id suc", "SUCURSAL"
    ),
    ex_stats AS (
        SELECT 
            i.id_sucursal_erp as sid,
            COUNT(*) as total_ex,
            COUNT(DISTINCT e.id_cliente) as visitados,
            COUNT(*) FILTER (WHERE e.estado = 'Aprobado') as aprob
        FROM exhibiciones e
        JOIN integrantes_grupo i ON e.id_integrante = i.id_integrante
        WHERE e.id_distribuidor = p_dist_id
          AND (
            (p_periodo = 'mes' AND e.timestamp_subida >= date_trunc('month', now())) OR
            (p_periodo = 'hoy' AND e.timestamp_subida >= date_trunc('day', now()))
          )
        GROUP BY i.id_sucursal_erp
    )
    SELECT 
        erp.sid as location_id,
        erp.sname as sucursal_name,
        erp.clientes_tot::bigint as total_clientes_erp,
        COALESCE(ex.total_ex, 0)::bigint as total_exhibiciones,
        COALESCE(ex.visitados, 0)::bigint as clientes_visitados,
        COALESCE(ex.aprob, 0)::bigint as aprobadas,
        ROUND(COALESCE(ex.visitados, 0) * 100.0 / NULLIF(erp.clientes_tot, 0), 2)::numeric as cobertura_pct
    FROM erp_stats erp
    LEFT JOIN ex_stats ex ON erp.sid = ex.sid;
END;
$$;

-- 4. Actualizar fn_dashboard_ranking
-- Agrega location_id (ERP branch) para poder filtrar el ranking en el dashboard
DROP FUNCTION IF EXISTS fn_dashboard_ranking(bigint, text, int);
CREATE OR REPLACE FUNCTION fn_dashboard_ranking(p_dist_id BIGINT, p_periodo TEXT DEFAULT 'mes', p_top INT DEFAULT 15)
RETURNS TABLE(
    vendedor TEXT,
    aprobadas BIGINT,
    destacadas BIGINT,
    rechazadas BIGINT,
    puntos BIGINT,
    location_id TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            i.id_integrante,
            CASE 
                WHEN UPPER(i.id_vendedor_erp) IN ('IVAN SOTO', 'IVAN WUTRICH', 'MATIAS WUTRICH') THEN i.nombre_integrante
                ELSE COALESCE(i.id_vendedor_erp, i.nombre_integrante)
            END as vendedor,
            i.id_sucursal_erp,
            COUNT(*) FILTER (WHERE e.estado = 'Aprobado') as aprob,
            COUNT(*) FILTER (WHERE e.estado = 'Rechazado') as rech,
            COUNT(*) FILTER (WHERE e.estado = 'Destacado') as dest,
            (COUNT(*) FILTER (WHERE e.estado = 'Aprobado') * 1 +
             COUNT(*) FILTER (WHERE e.estado = 'Destacado') * 2) as pts
        FROM exhibiciones e
        JOIN integrantes_grupo i ON e.id_integrante = i.id_integrante
        WHERE e.id_distribuidor = p_dist_id
          AND (
            (p_periodo = 'mes' AND e.timestamp_subida >= date_trunc('month', now())) OR
            (p_periodo = 'hoy' AND e.timestamp_subida >= date_trunc('day', now())) OR
            (p_periodo = 'semana' AND e.timestamp_subida >= date_trunc('week', now())) OR
            (p_periodo = 'ayer' AND e.timestamp_subida >= date_trunc('day', now() - interval '1 day') AND e.timestamp_subida < date_trunc('day', now()))
          )
        GROUP BY i.id_integrante, i.nombre_integrante, i.id_sucursal_erp
    )
    SELECT 
        s.vendedor,
        COALESCE(s.aprob, 0)::bigint as aprobadas,
        COALESCE(s.dest, 0)::bigint as destacadas,
        COALESCE(s.rech, 0)::bigint as rechazadas,
        COALESCE(s.pts, 0)::bigint as puntos,
        s.id_sucursal_erp as location_id
    FROM stats s
    ORDER BY s.pts DESC NULLS LAST
    LIMIT p_top;
END;
$$;

-- 5. Rendimiento en el Tiempo (Crecimiento/Evolucion)
-- Muestra la agupacion temporal dependiendo del periodo
DROP FUNCTION IF EXISTS fn_dashboard_evolucion_tiempo(bigint, text);
CREATE OR REPLACE FUNCTION fn_dashboard_evolucion_tiempo(p_dist_id BIGINT, p_periodo TEXT DEFAULT 'mes')
RETURNS TABLE(
    fecha TEXT,
    aprobadas BIGINT,
    rechazadas BIGINT,
    total BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH base_data AS (
        SELECT 
            -- Si es semana, ayer o hoy agrupa por nombre del dia. Si es mes o historia agrupa por semana.
            CASE 
                WHEN p_periodo IN ('hoy', 'ayer') THEN to_char(e.timestamp_subida, 'HH24:00')
                WHEN p_periodo IN ('semana') THEN to_char(e.timestamp_subida, 'day')
                ELSE to_char(e.timestamp_subida, 'DD/MM/YYYY')
            END as grouping_date,
            e.timestamp_subida as raw_date,
            e.estado
        FROM exhibiciones e
        WHERE e.id_distribuidor = p_dist_id
          AND (
            (p_periodo = 'mes' AND e.timestamp_subida >= date_trunc('month', now())) OR
            (p_periodo = 'hoy' AND e.timestamp_subida >= date_trunc('day', now())) OR
            (p_periodo = 'semana' AND e.timestamp_subida >= date_trunc('week', now())) OR
            (p_periodo = 'ayer' AND e.timestamp_subida >= date_trunc('day', now() - interval '1 day') AND e.timestamp_subida < date_trunc('day', now()))
          )
    )
    SELECT 
        b.grouping_date as fecha,
        COUNT(*) FILTER (WHERE b.estado = 'Aprobado') as aprobadas,
        COUNT(*) FILTER (WHERE b.estado = 'Rechazado') as rechazadas,
        COUNT(*) as total
    FROM base_data b
    GROUP BY b.grouping_date, date_trunc('day', b.raw_date) -- sort mathematically
    ORDER BY MIN(b.raw_date) ASC;
END;
$$;

-- 6. Rendimiento por Ciudad (usando la localidad del ERP)
DROP FUNCTION IF EXISTS fn_dashboard_por_ciudad(bigint, text);
CREATE OR REPLACE FUNCTION fn_dashboard_por_ciudad(p_dist_id BIGINT, p_periodo TEXT DEFAULT 'mes')
RETURNS TABLE(
    ciudad TEXT,
    aprobadas BIGINT,
    rechazadas BIGINT,
    total BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH ex_clientes AS (
        SELECT 
            l.ciudad,
            e.estado
        FROM exhibiciones e
        JOIN clientes c ON e.id_cliente = c.id_cliente
        LEFT JOIN locations l ON c.location_id = l.location_id
        WHERE e.id_distribuidor = p_dist_id
          AND (
            (p_periodo = 'mes' AND e.timestamp_subida >= date_trunc('month', now())) OR
            (p_periodo = 'hoy' AND e.timestamp_subida >= date_trunc('day', now())) OR
            (p_periodo = 'semana' AND e.timestamp_subida >= date_trunc('week', now())) OR
            (p_periodo = 'ayer' AND e.timestamp_subida >= date_trunc('day', now() - interval '1 day') AND e.timestamp_subida < date_trunc('day', now()))
          )
    )
    SELECT 
        COALESCE(l.ciudad, 'Desconocida')::TEXT as ciudad_nombre,
        COUNT(*) FILTER (WHERE c.estado = 'Aprobado')::BIGINT as aprobadas,
        COUNT(*) FILTER (WHERE c.estado = 'Rechazado')::BIGINT as rechazadas,
        COUNT(*)::BIGINT as total
    FROM ex_clientes c
    GROUP BY COALESCE(l.ciudad, 'Desconocida')
    ORDER BY total DESC;
END;
$$;
