-- 1. Actualizar KPIs de Clientes con Jerarquía
CREATE OR REPLACE FUNCTION fn_reporte_clientes_stats(p_dist_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total INT;
    v_activos INT;
    v_inactivos INT;
    v_sucursales INT;
    v_vendedores INT;
    v_sin_coords INT;
    v_hoy DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE;
BEGIN
    -- Base Counts
    SELECT COUNT(*) INTO v_total FROM erp_clientes_raw WHERE id_distribuidor = p_dist_id;
    
    SELECT COUNT(*) INTO v_activos FROM erp_clientes_raw 
    WHERE id_distribuidor = p_dist_id AND fecha_ultima_compra >= (v_hoy - INTERVAL '30 days');

    SELECT COUNT(*) INTO v_inactivos FROM erp_clientes_raw 
    WHERE id_distribuidor = p_dist_id AND (fecha_ultima_compra < (v_hoy - INTERVAL '30 days') OR fecha_ultima_compra IS NULL);

    SELECT COUNT(*) INTO v_sin_coords FROM erp_clientes_raw 
    WHERE id_distribuidor = p_dist_id AND (lat IS NULL OR lon IS NULL OR lat = 0 OR lon = 0);

    -- Hierarchical Counts (from Maestro)
    SELECT COUNT(DISTINCT "id suc") INTO v_sucursales FROM maestro_jerarquia WHERE "ID_DIST" = p_dist_id;
    SELECT COUNT(DISTINCT "ID_VENDEDOR") INTO v_vendedores FROM maestro_jerarquia WHERE "ID_DIST" = p_dist_id;

    RETURN jsonb_build_object(
        'total', v_total,
        'activos', v_activos,
        'inactivos', v_inactivos,
        'sin_coords', v_sin_coords,
        'sucursales', v_sucursales,
        'vendedores', v_vendedores,
        'pct_activacion', CASE WHEN v_total > 0 THEN (v_activos::FLOAT / v_total * 100) ELSE 0 END
    );
END;
$$;

-- 2. Desglose avanzado por Sucursal o Vendedor real
CREATE OR REPLACE FUNCTION fn_reporte_clientes_desglose(p_dist_id BIGINT, p_tipo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF p_tipo = 'sucursal' THEN
        SELECT jsonb_agg(sub) INTO v_result FROM (
            SELECT 
                COALESCE(m."SUCURSAL", c.sucursal_erp, 'SIN SUCURSAL') as etiqueta,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE c.fecha_ultima_compra >= (CURRENT_DATE - INTERVAL '30 days')) as activos
            FROM erp_clientes_raw c
            LEFT JOIN (SELECT DISTINCT "ID_DIST", "id suc", "SUCURSAL" FROM maestro_jerarquia) m 
                ON c.id_distribuidor = m."ID_DIST" AND c.id_sucursal_erp = m."id suc"
            WHERE c.id_distribuidor = p_dist_id
            GROUP BY 1 ORDER BY 2 DESC
        ) sub;
        
    ELSIF p_tipo = 'vendedor' THEN
        SELECT jsonb_agg(sub) INTO v_result FROM (
            SELECT 
                COALESCE(m."Vendedor", c.vendedor_erp, 'VENDEDOR ' || c.vendedor_erp) as etiqueta,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE c.fecha_ultima_compra >= (CURRENT_DATE - INTERVAL '30 days')) as activos
            FROM erp_clientes_raw c
            LEFT JOIN (SELECT DISTINCT "ID_DIST", "id suc", "ID_VENDEDOR", "Vendedor" FROM maestro_jerarquia) m 
                ON c.id_distribuidor = m."ID_DIST" AND c.vendedor_erp = m."ID_VENDEDOR" AND c.id_sucursal_erp = m."id suc"
            WHERE c.id_distribuidor = p_dist_id
            GROUP BY 1 ORDER BY 2 DESC LIMIT 30
        ) sub;
        
    ELSE -- localidad, provincia
        SELECT jsonb_agg(sub) INTO v_result FROM (
            SELECT 
                CASE WHEN p_tipo = 'localidad' THEN localidad ELSE provincia END as etiqueta,
                COUNT(*) as total
            FROM erp_clientes_raw
            WHERE id_distribuidor = p_dist_id
            GROUP BY 1 ORDER BY 2 DESC LIMIT 20
        ) sub;
    END IF;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 3. MASTER RPC: Padrón de Clientes con Jerarquía Completa
CREATE OR REPLACE FUNCTION fn_reporte_clientes_maestro(
    p_dist_id BIGINT,
    p_search TEXT DEFAULT '',
    p_sucursal_id TEXT DEFAULT '',
    p_vendedor_id TEXT DEFAULT '',
    p_limit INT DEFAULT 200
)
RETURNS TABLE (
    id_cliente_erp_local TEXT,
    nombre_cliente TEXT,
    nombre_fantasia TEXT,
    razon_social TEXT,
    localidad TEXT,
    provincia TEXT,
    domicilio TEXT,
    sucursal_nombre TEXT,
    vendedor_nombre TEXT,
    vendedor_id TEXT,
    sucursal_id TEXT,
    estado TEXT,
    lat FLOAT,
    lon FLOAT,
    fecha_ultima_compra DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id_cliente_erp_local,
        c.nombre_cliente,
        c.nombre_fantasia,
        c.razon_social,
        c.localidad,
        c.provincia,
        c.domicilio,
        COALESCE(m."SUCURSAL", c.sucursal_erp, 'SIN SUCURSAL'),
        COALESCE(m."Vendedor", 'VENDEDOR ' || c.vendedor_erp),
        c.vendedor_erp as vendedor_id,
        c.id_sucursal_erp as sucursal_id,
        CASE 
            WHEN c.fecha_ultima_compra >= (CURRENT_DATE - INTERVAL '30 days') THEN 'activo'
            ELSE 'inactivo'
        END as estado,
        COALESCE(c.lat, 0)::FLOAT,
        COALESCE(c.lon, 0)::FLOAT,
        c.fecha_ultima_compra
    FROM erp_clientes_raw c
    LEFT JOIN maestro_jerarquia m 
        ON c.id_distribuidor = m."ID_DIST" 
        AND c.id_sucursal_erp = m."id suc" 
        AND c.vendedor_erp = m."ID_VENDEDOR"
    WHERE c.id_distribuidor = p_dist_id
      AND (p_search = '' OR c.nombre_cliente ILIKE '%' || p_search || '%' OR c.id_cliente_erp_local ILIKE '%' || p_search || '%')
      AND (p_sucursal_id = '' OR c.id_sucursal_erp = p_sucursal_id)
      AND (p_vendedor_id = '' OR c.vendedor_erp = ANY(string_to_array(p_vendedor_id, ',')))
    ORDER BY c.nombre_cliente ASC
    LIMIT p_limit;
END;
$$;
