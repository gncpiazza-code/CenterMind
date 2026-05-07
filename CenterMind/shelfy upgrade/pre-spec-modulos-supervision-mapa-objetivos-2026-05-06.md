# Pre-especificación de producto — Supervisión · Mapa · Objetivos · Galería · Difusión / Soporte

**Fecha:** 2026-05-06  
**Tipo:** marco funcional previo a implementación detallada  
**Referencia normativa:** `SPEC-MAESTRO-modulos-2026-05-06.md` + specs hijos

---

## 1) Contexto y problema que se resuelve

El flujo operativo actual mezcla información útil con ruido técnico (estado de motores, controles sin efecto, etiquetas ambiguas), lo que dificulta tomar decisiones rápidas de campo.  
El objetivo de este epic es transformar ese flujo en una experiencia orientada a operación real:

- Supervisión: foco en **CC útil** + nuevo panel de **Altas y Activaciones** por **mes calendario**.
- Mapa: foco en ejecución de calle (sin deudores en capa mapa), interacción clara (clic/doble clic), impresión fiel al viewport.
- Objetivos: separación explícita entre metas **Compañía** y **Distribuidora**, reglas de activación con **tasa de pendientes configurable**, y mensajes Telegram completos.
- Galería: consistencia de layout y eliminación total de IDs internos.
- Difusión y soporte: SIGO solo superadmin, plantillas por usuario y ticket flotante con contexto técnico útil.

---

## 2) Decisiones de negocio ya cerradas (no reabrir en implementación)

1. **Panel Altas/Activaciones** usa **mes calendario** (`YYYY-MM`) y no ventana rodante.  
2. **Alta** y **Activación** son conceptos distintos y no se mezclan en métricas ni etiquetas.  
3. Objetivos de **Compañía** los crean solo **Directorio** y **Superadmin**.  
4. Para Compañía se muestra **una card por vendedor y tipo** (sin duplicados).  
5. Prorrateo de metas mensuales: **lunes a sábado** (domingo fuera del reparto).  
6. La **tasa de pendientes** en activación es **configurable al asignar**.  
7. En difusión, **SIGO solo superadmin**.  
8. Plantillas de difusión guardadas **por usuario**.  
9. En galería, **nunca** mostrar ID interno de PDV (solo ERP o fallback textual).  
10. Logs adjuntos de tickets con retención de **30 días**.  
11. Impresión de mapa = exactamente el **viewport visible** en pantalla.

---

## 3) Alcance funcional por módulo

### 3.1 Supervisión

- Ocultar indicadores de padrón en esa pantalla; dejar solo estado claro de cuentas corrientes.
- Rediseñar layout operativo: izquierda CC y derecha panel **Altas y Activaciones**.
- Panel derecho con **listado enriquecido** (no solo KPIs): PDV, ubicación, categoría, estado de exhibición, fechas relevantes.
- Reordenar selectores con jerarquía inequívoca y eliminar controles sin efecto.

### 3.2 Mapa

- Eliminar modo deudores del mapa.
- Aumentar tamaño y legibilidad de pictogramas por tipo PDV y alinearlos con leyenda/toggles.
- Simplificar métricas por vendedor en mapa a dos badges: nuevos y activados (últimos 7 días corridos).
- Diferenciar interacción: clic simple (ver) vs doble clic (selección para objetivo).
- Mejorar popup (densidad, scroll, límites visuales) y experiencia Street View.
- Impresión con mapa fiel al estado visual actual + bloque de resumen por día y rutas hijas.

### 3.3 Objetivos

- Dos familias coexistentes:
  - **Compañía** (mensual calendario, con desglose semanal/diario).
  - **Distribuidora** (plazos operativos actuales).
- Renombres solo de UI; sin cambiar valores de base de datos.
- Ocultar cobranza en UI estándar; ruteo pasa a guía de armado.
- En Alteo, agrupar por día (padre) y rutas (hijas).
- Activación con tasa configurable y semántica “pendiente” hasta cierre temporal.
- Telegram con contexto completo y comando `/objetivos` enriquecido.

### 3.4 Galería

- Recuperar comportamiento estándar del shell (toolbar/topbar/navigation consistentes).
- Eliminar por completo visualización de ID interno de PDV.

### 3.5 Difusión y soporte

- SIGO restringido a superadmin.
- Envíos de CC con pin de mensaje en Telegram.
- Plantillas personalizadas persistidas por usuario.
- Nuevo acceso a tickets desde ícono sobre junto al avatar.
- Ticket flotante arrastrable con adjuntos, pegar imagen, captura y respuesta en el mismo módulo.

---

## 4) Consideraciones técnicas clave (alto nivel)

- Mantener estrictamente aislamiento multi-tenant (`id_distribuidor` en todo query relevante).
- Reutilizar helpers y convenciones actuales (`tenant_table_name`, paginación `.range()` en tablas grandes).
- Evitar introducir lógica conflictiva entre padrón, objetivos y mapa: una sola definición para alta/activación y una sola semántica de estados pendientes.
- Cualquier UI nueva debe respetar design system vigente (light-violet + componentes shadcn existentes).

---

## 5) Riesgos identificados

1. **Ambigüedad temporal** entre “evento de negocio” y fecha técnica de update si no se registra evento explícito.  
2. **Volumen de datos** en listados por vendedor/mes (especialmente Tabaco).  
3. **Regresión de hábitos UX** al cambiar interacción de clic/doble clic en mapa.  
4. **Límites de Telegram** por tamaño de mensaje en notificaciones de objetivos.

---

## 6) Estrategia de entrega recomendada

1. Reglas de datos y contratos backend (supervisión/objetivos/difusión).  
2. Mapa (modo, interacción, popup, impresión).  
3. Supervisión (layout + panel Altas/Activaciones).  
4. Objetivos y Telegram.  
5. Galería y ticket flotante.  
6. QA cruzado por rol (superadmin/directorio/admin/supervisor) y por tenant.

---

## 7) Criterio de éxito de este epic

El epic se considera exitoso cuando un supervisor/directorio puede, sin entrenamiento extra:

- Identificar rápido **qué cambió en su cartera** (altas y activaciones por mes).
- Operar el mapa sin ruido ni confusiones de selección.
- Entender y ejecutar objetivos con reglas claras de compañía/distribuidora.
- Trabajar con difusión y soporte desde un flujo único y consistente.

---

*Nota:* el detalle de contratos, tablas, endpoints y QA por módulo queda normado en los `SPEC-*.md` hijos vinculados desde el maestro, incluyendo el plan integral `SPEC-qa-smoke-playwright-epic-modulos-2026-05-06.md`.
