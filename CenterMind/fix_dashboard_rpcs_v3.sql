-- Drop old versions first to avoid signature conflicts
DROP FUNCTION IF EXISTS public.fn_dashboard_ranking(bigint, text, int);
DROP FUNCTION IF EXISTS public.fn_dashboard_ranking(bigint, text, int, bigint);
DROP FUNCTION IF EXISTS public.fn_dashboard_kpis(bigint, text);
DROP FUNCTION IF EXISTS public.fn_dashboard_kpis(bigint, text, bigint);

-- Fix for fn_dashboard_ranking: uses correct join chain to sucursales via vendedores
CREATE OR REPLACE FUNCTION public.fn_dashboard_ranking(
    p_dist_id bigint, 
    p_periodo text DEFAULT 'mes', 
    p_top int DEFAULT 15, 
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
                WHEN LOWER(e.estado) IN ('destacada', 'destacado') THEN 1 
                WHEN LOWER(e.estado) IN ('aprobado', 'aprobada') THEN 2
                WHEN LOWER(e.estado) IN ('rechazado', 'rechazada') THEN 3
                ELSE 4 
            END ASC, e.timestamp_subida DESC
    ),
    stats AS (
        SELECT 
            i.id_integrante,
            i.nombre_integrante as member_name,
            i.id_vendedor_erp as v_erp_id,
            i.id_sucursal_erp as s_erp_id,
            COUNT(ue.id_exhibicion) FILTER (WHERE LOWER(ue.estado) IN ('aprobado', 'aprobada', 'destacada', 'destacado')) as total_aprob,
            COUNT(ue.id_exhibicion) FILTER (WHERE LOWER(ue.estado) IN ('rechazado', 'rechazada')) as total_rech,
            COUNT(ue.id_exhibicion) FILTER (WHERE LOWER(ue.estado) IN ('destacada', 'destacado')) as total_dest,
            (COUNT(ue.id_exhibicion) FILTER (WHERE LOWER(ue.estado) IN ('aprobado', 'aprobada')) * 1 +
             COUNT(ue.id_exhibicion) FILTER (WHERE LOWER(ue.estado) IN ('destacada', 'destacado')) * 2) as total_pts
        FROM unique_exhibs ue
        JOIN public.integrantes_grupo i ON i.id_integrante = ue.id_integrante
        LEFT JOIN public.vendedores v ON v.id_vendedor_erp = i.id_vendedor_erp
        LEFT JOIN public.sucursales s ON s.id_sucursal = v.id_sucursal AND s.id_distribuidor = ue.id_distribuidor
        WHERE (p_sucursal_id IS NULL OR s.id_sucursal = p_sucursal_id)
        GROUP BY i.id_integrante, i.nombre_integrante, i.id_vendedor_erp, i.id_sucursal_erp
    )
    SELECT 
        COALESCE(NULLIF(st.v_erp_id, ''), st.member_name)::TEXT as vendedor,
        st.total_aprob::BIGINT as aprobadas,
        st.total_dest::BIGINT as destacadas,
        st.total_rech::BIGINT as rechazadas,
        st.total_pts::BIGINT as puntos,
        st.s_erp_id::TEXT as location_id
    FROM stats st
    ORDER BY st.total_pts DESC
    LIMIT p_top;
END;
$$;

-- Fix for fn_dashboard_kpis: ensures correct join chain for sucursal filtering
CREATE OR REPLACE FUNCTION public.fn_dashboard_kpis(
    p_dist_id bigint, 
    p_periodo text DEFAULT 'mes', 
    p_sucursal_id bigint DEFAULT NULL
)
 RETURNS TABLE(total bigint, pendientes bigint, aprobadas bigint, rechazadas bigint, destacadas bigint)
 LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(e.id_exhibicion)::BIGINT,
        COUNT(e.id_exhibicion) FILTER (WHERE LOWER(e.estado) IN ('pendiente', 'revisión', 'revisión b'))::BIGINT,
        COUNT(e.id_exhibicion) FILTER (WHERE LOWER(e.estado) IN ('aprobado', 'aprobada', 'destacada', 'destacado'))::BIGINT,
        COUNT(e.id_exhibicion) FILTER (WHERE LOWER(e.estado) IN ('rechazado', 'rechazada'))::BIGINT,
        COUNT(e.id_exhibicion) FILTER (WHERE LOWER(e.estado) IN ('destacada', 'destacado'))::BIGINT
    FROM public.exhibiciones e
    JOIN public.integrantes_grupo i ON i.id_integrante = e.id_integrante
    LEFT JOIN public.vendedores v ON v.id_vendedor_erp = i.id_vendedor_erp
    LEFT JOIN public.sucursales s ON s.id_sucursal = v.id_sucursal AND s.id_distribuidor = e.id_distribuidor
    WHERE (p_dist_id = 0 OR e.id_distribuidor = p_dist_id)
      AND (p_sucursal_id IS NULL OR s.id_sucursal = p_sucursal_id)
      AND (
        (p_periodo = 'mes' AND e.timestamp_subida >= date_trunc('month', now())) OR
        (p_periodo = 'hoy' AND e.timestamp_subida >= date_trunc('day', now())) OR
        (p_periodo = 'semana' AND e.timestamp_subida >= date_trunc('week', now())) OR
        (p_periodo = 'ayer' AND e.timestamp_subida >= date_trunc('day', now() - interval '1 day') AND e.timestamp_subida < date_trunc('day', now()))
        OR (p_periodo ~ '^\d{4}-\d{2}$' AND to_char(e.timestamp_subida, 'YYYY-MM') = p_periodo)
        OR (p_periodo ~ '^\d{4}-\d{2}-\d{2}$' AND e.timestamp_subida::DATE = p_periodo::DATE)
      );
END;
$$;
