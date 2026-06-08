DROP FUNCTION IF EXISTS fn_admin_global_monitoring();

CREATE OR REPLACE FUNCTION fn_admin_global_monitoring()
RETURNS TABLE (
    id_distribuidor INT,
    nombre_dist TEXT,
    total_vendedores INT,
    total_clientes_erp BIGINT,
    total_exhibiciones_hoy BIGINT,
    stress_score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id_distribuidor,
        d.nombre_empresa AS nombre_dist,
        (SELECT COUNT(*)::INT FROM integrantes_grupo ig WHERE ig.id_distribuidor = d.id_distribuidor) AS total_vendedores,
        (SELECT COUNT(*)::BIGINT FROM erp_clientes_raw c WHERE c.id_distribuidor = d.id_distribuidor) AS total_clientes_erp,
        (SELECT COUNT(*)::BIGINT FROM exhibiciones e WHERE e.id_distribuidor = d.id_distribuidor AND DATE(e.timestamp_subida) = CURRENT_DATE) AS total_exhibiciones_hoy,
        0.0::NUMERIC AS stress_score
    FROM distribuidores d
    ORDER BY d.id_distribuidor;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
