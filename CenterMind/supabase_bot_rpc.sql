-- ================================================================
-- SHELFY -- Funciones RPC exclusivas para el Bot (Capa 4)
-- ================================================================
-- Pegar en Supabase SQL Editor y ejecutar
-- ================================================================

-- 16. Bot: Registrar Exhibición (Lógica transaccional de SQLite)
CREATE OR REPLACE FUNCTION fn_bot_registrar_exhibicion(
    p_distribuidor_id BIGINT,
    p_vendedor_id BIGINT,
    p_nro_cliente TEXT,
    p_tipo_pdv TEXT,
    p_drive_link TEXT,
    p_telegram_msg_id BIGINT,
    p_telegram_chat_id BIGINT
) RETURNS BIGINT AS $$
DECLARE
    v_id_integrante BIGINT;
    v_id_cliente BIGINT;
    v_id_exhibicion BIGINT;
BEGIN
    -- 1. Get id_integrante from telegram_user_id
    SELECT id_integrante INTO v_id_integrante
    FROM integrantes_grupo
    WHERE id_distribuidor = p_distribuidor_id AND telegram_user_id = p_vendedor_id
    LIMIT 1;

    IF v_id_integrante IS NULL THEN
        RAISE EXCEPTION 'Vendedor % no encontrado', p_vendedor_id;
    END IF;

    -- 2. Find or create cliente
    SELECT id_cliente INTO v_id_cliente
    FROM clientes
    WHERE id_distribuidor = p_distribuidor_id AND numero_cliente_local = p_nro_cliente
    LIMIT 1;

    IF v_id_cliente IS NULL THEN
        INSERT INTO clientes (id_distribuidor, numero_cliente_local)
        VALUES (p_distribuidor_id, p_nro_cliente)
        RETURNING id_cliente INTO v_id_cliente;
    END IF;

    -- 3. Insert exhibicion
    INSERT INTO exhibiciones (
        id_distribuidor, id_integrante, id_cliente,
        tipo_pdv, url_foto_drive, estado,
        telegram_msg_id, telegram_chat_id, synced_telegram
    ) VALUES (
        p_distribuidor_id, v_id_integrante, v_id_cliente,
        p_tipo_pdv, p_drive_link, 'Pendiente',
        p_telegram_msg_id, p_telegram_chat_id, 0
    ) RETURNING id_exhibicion INTO v_id_exhibicion;

    RETURN v_id_exhibicion;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 17. Bot: Pendientes de Sincronización (JOIN Complejo)
CREATE OR REPLACE FUNCTION fn_bot_pendientes_sync(p_distribuidor_id BIGINT)
RETURNS TABLE (
    id BIGINT,
    id_distribuidor BIGINT,
    chat_id BIGINT,
    vendedor_id BIGINT,
    nro_cliente TEXT,
    tipo_pdv TEXT,
    drive_link TEXT,
    estado TEXT,
    supervisor_nombre TEXT,
    comentarios TEXT,
    telegram_msg_id BIGINT,
    telegram_chat_id BIGINT,
    vendedor_nombre TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id_exhibicion AS id,
        e.id_distribuidor,
        e.telegram_chat_id AS chat_id,
        e.id_integrante AS vendedor_id,
        c.numero_cliente_local AS nro_cliente,
        e.tipo_pdv,
        e.url_foto_drive AS drive_link,
        e.estado,
        e.supervisor_nombre,
        COALESCE(e.comentario_evaluacion, '') AS comentarios,
        e.telegram_msg_id,
        e.telegram_chat_id,
        COALESCE(i.nombre_integrante, 'Vendedor') AS vendedor_nombre
    FROM exhibiciones e
    LEFT JOIN clientes c ON e.id_cliente = c.id_cliente
    LEFT JOIN integrantes_grupo i ON e.id_integrante = i.id_integrante AND e.id_distribuidor = i.id_distribuidor
    WHERE e.id_distribuidor = p_distribuidor_id
      AND e.estado != 'Pendiente'
      AND e.synced_telegram = 0
      AND e.telegram_msg_id IS NOT NULL
      AND e.telegram_chat_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 18. Bot: Historial Cliente
CREATE OR REPLACE FUNCTION fn_bot_historial_cliente(
    p_distribuidor_id BIGINT,
    p_chat_id BIGINT,
    p_nro_cliente TEXT,
    p_limit INT
)
RETURNS TABLE (
    tipo_pdv TEXT,
    estado TEXT,
    fecha TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(e.tipo_pdv, '') as tipo_pdv,
        e.estado,
        TO_CHAR(e.timestamp_subida AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM')::TEXT AS fecha
    FROM exhibiciones e
    JOIN clientes c ON e.id_cliente = c.id_cliente
    WHERE e.id_distribuidor = p_distribuidor_id
      AND e.telegram_chat_id = p_chat_id
      AND c.numero_cliente_local = p_nro_cliente
    ORDER BY e.timestamp_subida DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 19. Bot: Stats Vendedor (Mes e Histórico)
CREATE OR REPLACE FUNCTION fn_bot_stats_vendedor(p_distribuidor_id BIGINT, p_vendedor_id BIGINT)
RETURNS TABLE (
    rango TEXT,
    aprobadas BIGINT,
    destacadas BIGINT,
    rechazadas BIGINT,
    pendientes BIGINT,
    total BIGINT,
    puntos BIGINT
) AS $$
DECLARE
    v_hoy_ar TIMESTAMP := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires');
    v_mes_inicio DATE := DATE_TRUNC('month', v_hoy_ar)::DATE;
BEGIN
    -- Histórico
    RETURN QUERY
    SELECT 'historico'::TEXT as rango,
           COUNT(*) FILTER (WHERE estado = 'Aprobado') AS aprobadas,
           COUNT(*) FILTER (WHERE estado = 'Destacado') AS destacadas,
           COUNT(*) FILTER (WHERE estado = 'Rechazado') AS rechazadas,
           COUNT(*) FILTER (WHERE estado = 'Pendiente') AS pendientes,
           COUNT(*) AS total,
           (COUNT(*) FILTER (WHERE estado = 'Aprobado') * 1 +
            COUNT(*) FILTER (WHERE estado = 'Destacado') * 2) AS puntos
    FROM exhibiciones
    WHERE id_distribuidor = p_distribuidor_id AND id_integrante = p_vendedor_id;

    -- Mes actual
    RETURN QUERY
    SELECT 'mes'::TEXT as rango,
           COUNT(*) FILTER (WHERE estado = 'Aprobado') AS aprobadas,
           COUNT(*) FILTER (WHERE estado = 'Destacado') AS destacadas,
           COUNT(*) FILTER (WHERE estado = 'Rechazado') AS rechazadas,
           COUNT(*) FILTER (WHERE estado = 'Pendiente') AS pendientes,
           COUNT(*) AS total,
           (COUNT(*) FILTER (WHERE estado = 'Aprobado') * 1 +
            COUNT(*) FILTER (WHERE estado = 'Destacado') * 2) AS puntos
    FROM exhibiciones
    WHERE id_distribuidor = p_distribuidor_id AND id_integrante = p_vendedor_id
      AND (timestamp_subida AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE >= v_mes_inicio;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
