-- ================================================================
-- FIX: RESOLVE RPC AMBIGUITY & JOINS (COMPLETE DASHBOARD FIX)
-- This script drops all versions of dashboard functions and recreates 
-- them with the correct multi-table joins for the new hierarchy.
-- ================================================================

-- 1. DROP ALL VARIATIONS FIRST
DROP FUNCTION IF EXISTS public.fn_dashboard_kpis(bigint, text);
DROP FUNCTION IF EXISTS public.fn_dashboard_kpis(bigint, text, bigint);

DROP FUNCTION IF EXISTS public.fn_dashboard_ranking(bigint, text, int);
DROP FUNCTION IF EXISTS public.fn_dashboard_ranking(bigint, text, int, bigint);

DROP FUNCTION IF EXISTS public.fn_dashboard_por_empresa(text);
DROP FUNCTION IF EXISTS public.fn_dashboard_por_empresa(text, bigint);

DROP FUNCTION IF EXISTS public.fn_dashboard_evolucion_tiempo(bigint, text);
DROP FUNCTION IF EXISTS public.fn_dashboard_evolucion_tiempo(bigint, text, bigint);

DROP FUNCTION IF EXISTS public.fn_dashboard_por_ciudad(bigint, text);
DROP FUNCTION IF EXISTS public.fn_dashboard_por_ciudad(bigint, text, bigint);

DROP FUNCTION IF EXISTS public.fn_dashboard_por_sucursal(bigint, text);
DROP FUNCTION IF EXISTS public.fn_dashboard_por_sucursal(bigint, text, bigint);

-- 2. RE-CREATE WITH CLEAN SIGNATURES & CORRECT JOINS

-- KPIs
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
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('pendiente', 'revisión', 'revisión b'))::BIGINT,
        COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('aprobado', 'aprobada', 'destacada', 'destacado'))::BIGINT,
        COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('rechazado', 'rechazada'))::BIGINT,
        COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('destacada', 'destacado'))::BIGINT
    FROM public.exhibiciones e
    LEFT JOIN public.clientes_pdv c ON e.id_cliente_pdv = c.id_cliente
    LEFT JOIN public.rutas r ON c.id_ruta = r.id_ruta
    LEFT JOIN public.vendedores v ON r.id_vendedor = v.id_vendedor
    WHERE (p_dist_id = 0 OR e.id_distribuidor = p_dist_id)
      AND (p_sucursal_id IS NULL OR v.id_sucursal = p_sucursal_id)
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

-- Ranking
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
    WITH stats AS (
        SELECT 
            i.id_integrante,
            i.nombre_integrante as nom,
            i.id_vendedor_erp as v_erp,
            i.id_sucursal_erp as s_erp,
            COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('aprobado', 'aprobada', 'destacada', 'destacado')) as aprob,
            COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('rechazado', 'rechazada')) as rech,
            COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('destacada', 'destacado')) as dest,
            (COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('aprobado', 'aprobada')) * 1 +
             COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('destacada', 'destacado')) * 2) as pts
        FROM public.exhibiciones e
        JOIN public.integrantes_grupo i ON e.id_integrante = i.id_integrante
        LEFT JOIN public.clientes_pdv c ON e.id_cliente_pdv = c.id_cliente
        LEFT JOIN public.rutas r ON c.id_ruta = r.id_ruta
        LEFT JOIN public.vendedores v ON r.id_vendedor = v.id_vendedor
        WHERE (p_dist_id = 0 OR e.id_distribuidor = p_dist_id)
          AND (p_sucursal_id IS NULL OR v.id_sucursal = p_sucursal_id)
          AND (
            (p_periodo = 'mes' AND e.timestamp_subida >= date_trunc('month', now())) OR
            (p_periodo = 'hoy' AND e.timestamp_subida >= date_trunc('day', now())) OR
            (p_periodo = 'semana' AND e.timestamp_subida >= date_trunc('week', now())) OR
            (p_periodo = 'ayer' AND e.timestamp_subida >= date_trunc('day', now() - interval '1 day') AND e.timestamp_subida < date_trunc('day', now()))
            OR (p_periodo ~ '^\d{4}-\d{2}$' AND to_char(e.timestamp_subida, 'YYYY-MM') = p_periodo)
            OR (p_periodo ~ '^\d{4}-\d{2}-\d{2}$' AND e.timestamp_subida::DATE = p_periodo::DATE)
          )
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

-- Rendimiento por Empresa (Superadmin)
CREATE OR REPLACE FUNCTION public.fn_dashboard_por_empresa(
    p_periodo text DEFAULT 'mes', 
    p_sucursal_id bigint DEFAULT NULL
)
 RETURNS TABLE(empresa text, aprobadas bigint, rechazadas bigint, total bigint)
 LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.nombre_empresa::TEXT,
        COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('aprobado', 'aprobada'))::BIGINT,
        COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('rechazado', 'rechazada'))::BIGINT,
        COUNT(*)::BIGINT
    FROM public.exhibiciones e
    JOIN public.distribuidores d ON e.id_distribuidor = d.id_distribuidor
    LEFT JOIN public.clientes_pdv c ON e.id_cliente_pdv = c.id_cliente
    LEFT JOIN public.rutas r ON c.id_ruta = r.id_ruta
    LEFT JOIN public.vendedores v ON r.id_vendedor = v.id_vendedor
    WHERE (p_sucursal_id IS NULL OR v.id_sucursal = p_sucursal_id)
      AND (
        (p_periodo = 'mes' AND e.timestamp_subida >= date_trunc('month', now())) OR
        (p_periodo = 'hoy' AND e.timestamp_subida >= date_trunc('day', now())) OR
        (p_periodo = 'semana' AND e.timestamp_subida >= date_trunc('week', now())) OR
        (p_periodo = 'ayer' AND e.timestamp_subida >= date_trunc('day', now() - interval '1 day') AND e.timestamp_subida < date_trunc('day', now()))
        OR (p_periodo ~ '^\d{4}-\d{2}$' AND to_char(e.timestamp_subida, 'YYYY-MM') = p_periodo)
        OR (p_periodo ~ '^\d{4}-\d{2}-\d{2}$' AND e.timestamp_subida::DATE = p_periodo::DATE)
      )
    GROUP BY d.nombre_empresa
    ORDER BY 4 DESC;
END;
$$;

-- Evolucion Tiempo
CREATE OR REPLACE FUNCTION public.fn_dashboard_evolucion_tiempo(
    p_dist_id bigint, 
    p_periodo text DEFAULT 'mes', 
    p_sucursal_id bigint DEFAULT NULL
)
 RETURNS TABLE(fecha text, aprobadas bigint, rechazadas bigint, total bigint)
 LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH base_data AS (
        SELECT 
            CASE 
                WHEN p_periodo IN ('hoy', 'ayer') OR p_periodo ~ '^\d{4}-\d{2}-\d{2}$' THEN to_char(e.timestamp_subida, 'HH24:00')
                WHEN p_periodo IN ('semana') THEN to_char(e.timestamp_subida, 'dy')
                ELSE to_char(e.timestamp_subida, 'DD/MM')
            END as grouping_date,
            e.timestamp_subida as raw_date,
            e.estado
        FROM public.exhibiciones e
        LEFT JOIN public.clientes_pdv c ON e.id_cliente_pdv = c.id_cliente
        LEFT JOIN public.rutas r ON c.id_ruta = r.id_ruta
        LEFT JOIN public.vendedores v ON r.id_vendedor = v.id_vendedor
        WHERE (p_dist_id = 0 OR e.id_distribuidor = p_dist_id)
          AND (p_sucursal_id IS NULL OR v.id_sucursal = p_sucursal_id)
          AND (
            (p_periodo = 'mes' AND e.timestamp_subida >= date_trunc('month', now())) OR
            (p_periodo = 'hoy' AND e.timestamp_subida >= date_trunc('day', now())) OR
            (p_periodo = 'semana' AND e.timestamp_subida >= date_trunc('week', now())) OR
            (p_periodo = 'ayer' AND e.timestamp_subida >= date_trunc('day', now() - interval '1 day') AND e.timestamp_subida < date_trunc('day', now()))
            OR (p_periodo ~ '^\d{4}-\d{2}$' AND to_char(e.timestamp_subida, 'YYYY-MM') = p_periodo)
            OR (p_periodo ~ '^\d{4}-\d{2}-\d{2}$' AND e.timestamp_subida::DATE = p_periodo::DATE)
          )
    )
    SELECT 
        b.grouping_date::TEXT,
        COUNT(*) FILTER (WHERE LOWER(b.estado) IN ('aprobado', 'aprobada'))::BIGINT,
        COUNT(*) FILTER (WHERE LOWER(b.estado) IN ('rechazado', 'rechazada'))::BIGINT,
        COUNT(*)::BIGINT
    FROM base_data b
    GROUP BY b.grouping_date, date_trunc('day', b.raw_date)
    ORDER BY MIN(b.raw_date) ASC;
END;
$$;

-- Por Ciudad
CREATE OR REPLACE FUNCTION public.fn_dashboard_por_ciudad(
    p_dist_id bigint, 
    p_periodo text DEFAULT 'mes', 
    p_sucursal_id bigint DEFAULT NULL
)
 RETURNS TABLE(ciudad text, aprobadas bigint, rechazadas bigint, total bigint)
 LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH ex_stats AS (
        SELECT 
            c.localidad as ciu_val,
            e.estado
        FROM public.exhibiciones e
        JOIN public.clientes_pdv c ON e.id_cliente_pdv = c.id_cliente
        LEFT JOIN public.rutas r ON c.id_ruta = r.id_ruta
        LEFT JOIN public.vendedores v ON r.id_vendedor = v.id_vendedor
        WHERE (p_dist_id = 0 OR e.id_distribuidor = p_dist_id)
          AND (p_sucursal_id IS NULL OR v.id_sucursal = p_sucursal_id)
          AND (
            (p_periodo = 'mes' AND e.timestamp_subida >= date_trunc('month', now())) OR
            (p_periodo = 'hoy' AND e.timestamp_subida >= date_trunc('day', now())) OR
            (p_periodo = 'semana' AND e.timestamp_subida >= date_trunc('week', now())) OR
            (p_periodo = 'ayer' AND e.timestamp_subida >= date_trunc('day', now() - interval '1 day') AND e.timestamp_subida < date_trunc('day', now()))
            OR (p_periodo ~ '^\d{4}-\d{2}$' AND to_char(e.timestamp_subida, 'YYYY-MM') = p_periodo)
            OR (p_periodo ~ '^\d{4}-\d{2}-\d{2}$' AND e.timestamp_subida::DATE = p_periodo::DATE)
          )
    )
    SELECT 
        COALESCE(ciu_val, 'Desconocida')::TEXT as ciudad,
        COUNT(*) FILTER (WHERE LOWER(estado) IN ('aprobado', 'aprobada'))::BIGINT,
        COUNT(*) FILTER (WHERE LOWER(estado) IN ('rechazado', 'rechazada'))::BIGINT,
        COUNT(*)::BIGINT
    FROM ex_stats
    GROUP BY ciu_val
    ORDER BY 4 DESC;
END;
$$;

-- Por Sucursal
CREATE OR REPLACE FUNCTION public.fn_dashboard_por_sucursal(
    p_dist_id bigint, 
    p_periodo text DEFAULT 'mes', 
    p_sucursal_id bigint DEFAULT NULL
)
 RETURNS TABLE(location_id text, sucursal text, aprobadas bigint, rechazadas bigint, total bigint)
 LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            s.id_sucursal_erp,
            s.nombre_erp,
            COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('aprobado', 'aprobada')) as aprob,
            COUNT(*) FILTER (WHERE LOWER(e.estado) IN ('rechazado', 'rechazada')) as rech,
            COUNT(*) as tot
        FROM public.exhibiciones e
        JOIN public.clientes_pdv c ON e.id_cliente_pdv = c.id_cliente
        JOIN public.rutas r ON c.id_ruta = r.id_ruta
        JOIN public.vendedores v ON r.id_vendedor = v.id_vendedor
        JOIN public.sucursales s ON v.id_sucursal = s.id_sucursal
        WHERE (p_dist_id = 0 OR e.id_distribuidor = p_dist_id)
          AND (p_sucursal_id IS NULL OR s.id_sucursal = p_sucursal_id)
          AND (
            (p_periodo = 'mes' AND e.timestamp_subida >= date_trunc('month', now())) OR
            (p_periodo = 'hoy' AND e.timestamp_subida >= date_trunc('day', now())) OR
            (p_periodo = 'semana' AND e.timestamp_subida >= date_trunc('week', now())) OR
            (p_periodo = 'ayer' AND e.timestamp_subida >= date_trunc('day', now() - interval '1 day') AND e.timestamp_subida < date_trunc('day', now()))
            OR (p_periodo ~ '^\d{4}-\d{2}$' AND to_char(e.timestamp_subida, 'YYYY-MM') = p_periodo)
            OR (p_periodo ~ '^\d{4}-\d{2}-\d{2}$' AND e.timestamp_subida::DATE = p_periodo::DATE)
          )
        GROUP BY s.id_sucursal_erp, s.nombre_erp
    )
    SELECT 
        id_sucursal_erp::TEXT,
        nombre_erp::TEXT,
        aprob::BIGINT,
        rech::BIGINT,
        tot::BIGINT
    FROM stats
    ORDER BY tot DESC;
END;
$$;
