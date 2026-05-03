# Plan Técnico Detallado: Automatización y Rediseño de Objetivos

Este plan detalla la reingeniería del sistema de objetivos para incluir seguimiento individual de PDVs, notificaciones automáticas y una interfaz Kanban profesional.

## [Componente] Backend: Base de Datos y Trazabilidad

### [NUEVO] Tabla `objetivos_tracking`
Para evitar notificaciones duplicadas y permitir que el sistema informe *qué* PDV cumplió el objetivo, necesitamos persistir el vínculo entre el objetivo y el evento.

- **Columnas**:
  - `id`: UUID (PK)
  - `id_objetivo`: UUID (FK a `objetivos.id`)
  - `id_referencia`: String (ej: `id_cliente_erp` o `id_exhibicion`)
  - `tipo_evento`: String (`alteo`, `activacion`, `exhibicion`, `cobranza`)
  - `metadata`: JSON (datos del PDV en el momento del evento para el mensaje)

## [Componente] Backend: Servicio de Notificaciones

### [NUEVO] `ObjetivosNotificationService`
Un servicio centralizado que gestionará el envío de mensajes a diferentes canales.

- **`notify_vendor_group(dist_id, obj_id, pdv_data)`**:
  - Busca el `telegram_chat_id` del grupo del vendedor.
  - Genera un mensaje formateado (ej: "🚀 **¡Objetivo en Marcha!** Se ha detectado un [Alteo/Activación] en el PDV **[Nombre]** (#[Código]).").
- **`notify_supervisor_realtime(dist_id, obj_id, event_data)`**:
  - Emite un evento vía `WebSocket` para que la web del supervisor muestre un "Toast" o alerta instantánea.

## [Componente] Backend: Watcher Service (Automatización)

### [MODIFICAR] `ObjetivosWatcherService`
Pasaremos de una lógica de "conteo global" a una de "detección de diferencias".

- **Flujo de Ejecución**:
  1. Identificar objetivos activos.
  2. Para cada objetivo:
     - **Alteo**: Buscar clientes en la ruta del vendedor creados después de `creado_at` del objetivo que **no** estén en `objetivos_tracking`.
     - **Activación**: Buscar clientes en la ruta cuya `fecha_ultima_compra` sea reciente y no tengan registro en `objetivos_tracking`.
     - **Cobranza**: Monitorizar cambios en `cc_detalle` y registrar pagos vinculados.
  3. Por cada nuevo evento detectado:
     - Insertar en `objetivos_tracking`.
     - Incrementar `valor_actual` en `objetivos`.
     - **Disparar `ObjetivosNotificationService`**.

## [Componente] Telegram Bot: Flujo de Exhibición

### [MODIFICAR] `bot_worker.py`
Integración del bot con la lógica de objetivos específicos.

- **Intercepción de Carga**:
  - En el `button_callback` (luego de que el vendedor elija el tipo de PDV y el `nro_cliente` esté validado):
  - Ejecutar query: `SELECT id FROM objetivos WHERE id_vendedor = ? AND id_cliente_pdv = ? AND tipo = 'exhibicion' AND cumplido = False`.
  - **Si hay match**:
    - Cambiar el mensaje de respuesta: "✅ Foto recibida. ¡Este es un **Objetivo de Exhibición** para **[PDV]**! Ha pasado a revisión del supervisor."
    - Notificar al supervisor de inmediato.

## [Componente] Frontend: Dashboard de Objetivos (V2)

### [MODIFICAR] `shelfy-frontend/src/app/objetivos/page.tsx`
Rediseño total para priorizar el seguimiento visual.

#### 1. Vista KANBAN (Principal)
- **Columna "Pendiente"**: Objetivos con `valor_actual == 0` y sin fotos pendientes.
- **Columna "En Progreso"**: 
  - Para Exhibición: Si existen fotos en `exhibiciones` con estado `Pendiente` para ese PDV.
  - Para Otros: Si `valor_actual > 0` pero `< valor_objetivo`.
- **Columna "Completado"**: Objetivos con `cumplido == True`.

#### 2. Vista ESTADÍSTICA (Secundaria)
- Un panel numérico que muestre:
  - **Eficiencia**: % de objetivos cumplidos vs creados.
  - **Ranking**: Vendedores con más objetivos cumplidos.
  - **Distribución**: Gráfico de torta por tipo de objetivo.

#### 3. Toggle de Navegación
- Implementar un componente de pestañas (Tabs) con animaciones suaves (Framermotion/CSS) para alternar vistas: `[` `📋 Kanban` `|` `📊 Estadísticas` `]`.

## Plan de Verificación

1. **Test de Alteo**: Crear un objetivo de alteo, insertar manualmente un cliente en la ruta en Supabase, y ejecutar el script `run_watcher`. Verificar el mensaje en Telegram.
2. **Test de Exhibición**: Iniciar el flujo del bot, subir foto de un cliente bajo objetivo. Verificar que el bot responde con el "badge" de objetivo y que en la web el card se mueve a "En Progreso".
3. **Validación de UI**: Asegurar que el cambio entre Kanban y Estadísticas no pierda el estado de los filtros.
