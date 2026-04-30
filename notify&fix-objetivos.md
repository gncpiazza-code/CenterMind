# Protocolo de Seguimiento y Notificación de Objetivos

Este plan aborda la falta de notificaciones en la creación de objetivos y el fallo en la detección automática de progresos (especialmente en exhibiciones recién subidas).

## User Review Required

> [!IMPORTANT]
> Se agregará una nueva columna `tiene_exhibicion_pendiente` a la tabla `objetivos` para sincronizar con la lógica esperada del Frontend (Kanban "En progreso").

> [!WARNING]
> La lógica de detección de exhibiciones cambiará: un objetivo de exhibición pasará a "En progreso" al subir una foto (estado Pendiente) y se considerará "Cumplido" solo cuando sea Aprobada por el supervisor.

## Proposed Changes

### [Database]
#### [MODIFY] [sb.table('objetivos')](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/db.py)
*   Ejecutar migración para añadir la columna `tiene_exhibicion_pendiente` (boolean, default false).

---

### [Backend: Notificaciones]
#### [MODIFY] [objetivos_notification_service.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/services/objetivos_notification_service.py)
*   **Depuración**: Añadir logs detallados en `notify_new_objective_telegram` para verificar el `chat_id` y el resultado de la petición `requests`.
*   **Unificación**: Asegurar que las etiquetas y emojis sean consistentes para Alteo, Activación, Cobranza y Exhibición.

---

### [Backend: Seguimiento Automático (Watcher)]
#### [MODIFY] [objetivos_watcher_service.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/services/objetivos_watcher_service.py)
*   **Exhibición (Detección Dual)**:
    *   **Fase 1 (Pendiente)**: Si hay foto subida pero pendiente de aprobación, marcar `tiene_exhibicion_pendiente = True`. Notificar: "¡Foto recibida! 📸 Pendiente de evaluación por el supervisor."
    *   **Fase 2 (Cumplido)**: Si el estado es 'Aprobado', marcar `cumplido = True`. Notificar: "¡Objetivo CUMPLIDO! 🏆 Foto aprobada."
*   **Alteo (Nuevos PDVs)**:
    *   Verificar por qué `_diff_alteo` no está alertando. Auditar el filtro `.gte("created_at", since)`.
    *   Asegurar que el mensaje incluya nombre y código del nuevo PDV.
*   **Activación (Primera Compra)**:
    *   Auditar `_diff_activacion`. Verificar el mapeo de `fecha_ultima_compra`.
    *   Asegurar que la notificación se dispare en cuanto se actualiza el padrón de clientes (`clientes_pdv_v2`).
*   **Cobranza (Reducción de Deuda)**:
    *   Implementar un sistema de "Progreso Parcial" para Cobranza. Actualmente es cálculo global (todo o nada).
    *   Notificar cuando se detecte un cobro parcial (ej: "¡Se cobraron $50k del objetivo de $100k! 💰").

---

### [Backend: Bot Worker]
#### [MODIFY] [bot_worker.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/bot_worker.py)
*   **Auditoría de Ingesta**: Verificar que los mensajes recibidos para Alteo/Activación (si los hay) o la actualización del padrón disparen correctamente el `run_watcher`.
*   **Validación de Vendedor**: Asegurar que `id_vendedor_v2` sea el estándar para todas las búsquedas de Telegram.

## Verification Plan

### Automated Tests
*   **Simulador de Ciclo Completo** (`tests/test_objetivos_full.py`):
    *   `test_exhibicion_lifecycle`: Crea -> Sube -> Pendiente -> Aprueba -> Cumplido.
    *   `test_alteo_lifecycle`: Crea -> Inserta PDV -> Detecta -> Notifica.
    *   `test_activacion_lifecycle`: Crea -> Update `fecha_ultima_compra` -> Detecta -> Notifica.
    *   `test_cobranza_lifecycle`: Crea -> Reduce deuda en `cc_detalle` -> Detecta progreso parcial -> Notifica.

### Manual Verification
1.  **Telegram Logs**: Monitorear el output de `CenterMind` para ver errores 403/400 de la API de Telegram durante las pruebas.
2.  **Dashboard Visual**: Confirmar que los objetivos se mueven entre columnas (Pendiente -> En Progreso -> Cumplido) en tiempo real.

## Open Questions
*   ¿Deseas que la notificación de "Objetivo Cumplido" (al aprobar la foto) también incluya quién fue el supervisor que la aprobó?

## Verification Plan

### Automated Tests
*   Ejecutar script de simulación (`simulate_test_cycle.py`) que:
    1.  Cree un objetivo de prueba para Nacho.
    2.  Verifique el log de notificación de creación.
    3.  Inyecte una exhibición 'Pendiente'.
    4.  Verifique que el objetivo pase a "En progreso" y se reciba el mensaje.
    5.  Actualice la exhibición a 'Aprobado'.
    6.  Verifique que el objetivo pase a "Cumplido".

### Manual Verification
1.  Crear objetivo manualmente en la Web.
2.  Verificar llegada de mensaje "🚀 Nuevo Objetivo Asignado".
3.  Simular subida de foto desde Telegram (o inyección directa).
4.  Verificar cambio de color/estado en el Kanban a "En progreso".
5.  Aprobar foto en el visor y verificar paso a columna "Cumplido".
