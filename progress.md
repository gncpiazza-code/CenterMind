# Progress — Shelfy CenterMind

**Última actualización: 4 de Abril, 2026 (10)**

Este archivo detalla el estado actual del proyecto, las funcionalidades operativas y los pendientes técnicos.

## Estado General
El proyecto se encuentra en una fase de expansión de funcionalidades de supervisión ("Phase 1 - Abril 2026"). La infraestructura core (backend Railway, frontend Vercel, DB Supabase) es estable.

---

## 🟢 Funcionalidades Operativas (Lo que funciona)

### 1. Panel de Supervisión (Módulo Principal)
- **Mapa de Rutas**: Visualización de PDVs con MapLibre GL. Marcadores estables (sin drift).
- **Modos de Mapa**:
    - **Activos/Exhibidos**: Filtro por última fecha de compra y exhibiciones realizadas.
    - **Deudores**: Integración con `cc_detalle`. Popup con deuda total y días de antigüedad.
    - **Ruteo**: Visualización de secuencia de visitas por vendedor.
- **Detección de Coordenadas**: Filtrado automático de coordenadas inválidas fuera de Argentina.
- **Popup Enriquecido**: Muestra foto de última exhibición (desde Supabase Storage), datos de contacto del ERP y Nº de Cliente.

### 2. Sistema de Objetivos ("Objetivación") — **OPERATIVO**
- **Interfaz de Selección**: "Carrito flotante" en el mapa para seleccionar múltiples PDVs.
- **Asignación Masiva**: Permite asignar objetivos (Activación, Exhibición, Cobranza) con fechas límite y observaciones.
- **Formato de Frase**: `Vendedor + Actividad + Cantidad + Tiempo`.
- **Modal Inteligente**: Al crear un objetivo tipo Alteo, Cobranza o Activación desde el mapa, el panel carga automáticamente datos contextuales (rutas del vendedor, lista de deudores, PDVs inactivos). Alteo incluye selector de cantidad. Cobranza incluye selección de deudor específico + modo Total/Parcial.
- **Watcher Inmediato**: `crear_objetivo` ejecuta el watcher tras la inserción para que `valor_actual` refleje el estado real desde el primer momento.
- **Popup con Peek Fotográfico**: Los pines del mapa muestran popup con auto-close (2s en click) y carga de foto de exhibición tras 3s de hover.
- **Módulo de Impresión**: La página de objetivos incluye vista de impresión A4 con un objetivo por página y checkbox de seguimiento manual.
- **Jerarquía y Contención**: Los objetivos de Supervisores/Gerentes reflejan la suma del progreso de sus subordinados.
- **Tracking Automático**: Persistencia en Supabase para seguimiento de cumplimiento en tiempo real.

### 3. Sistema de Roles y Permisos (RBAC) — **OPERATIVO**
- **Roles Definidos**: Superadmin, Directorio (acceso multi-tenant global), Administrador, Supervisor, Vendedor.
- **Matriz de Accesos Editable**: Interfaz interactiva en `/admin/permissions` que permite a los Superadmins alternar permisos de módulos y acciones en tiempo real.
- **Seguridad en Frontend**: Hooks de protección (`hasPermiso`) para ocultar/bloquear elementos de la UI según la configuración de la matriz.

### 3. Ingesta de Datos ERP
- **RPA (ShelfMind-RPA)**: Sincronización automática de Clientes, Ventas y Cuentas Corrientes desde CHESS ERP (distribuidores: Tabaco, Aloma, Liver, Real).
- **Upload Manual**: Interfaz en `/admin/erp/upload-global` para ingesta vía Excel.
- **Deduplicación**: Upsert idempotente basado en `id_cliente_erp` y `id_distribuidor`.

### 4. Bots de Telegram
- **Bot Multi-tenant**: Registro de exhibiciones por vendedor.
- **Interceptor de Franquiciados**: Mapeo automático de exhibiciones subidas por "canal" (ej. Ivan Soto) al vendedor real (ej. Monchi Ayala).
- **Almacenamiento**: Fotos almacenadas directamente en Supabase Storage.

### 5. Reportes y KPIs
- **Ranking Vendedores**: Cálculo de puntos basado en exhibiciones aprobadas y destacadas.
- **Reportes de Ventas**: Resumen de últimos 7/30/90 días.
- **Auditoría SIGO**: Seguimiento de gestiones administrativas.

---

## 🟡 En Desarrollo / Pendientes

### Técnicos
- **Migración Legacy**: Eliminar definitivamente el uso de tablas sin sufijo `_v2` en endpoints de administración.
- **APScheduler**: El scheduler de tareas corre en el mismo proceso de la API; evaluar migración a workers independientes si el volumen crece.
- ~~**Refactor de api.py**~~: ✅ **Completado** — Ver Historial 03/04.

### Operativos
- **Tenant `extra` (GyG)**: Pendiente obtención de credenciales CHESS para activar sincronización RPA.
- **Optimización de Mapas**: Implementar clusters para visualización de miles de PDVs en zoom out.

---

## 📅 Historial Reciente (Abril 2026)
- **04/04 (10)**: **Motor de Informes Excel + Actualizar CC en Supervisión** — (1) Backend: nuevo `services/report_service.py` que integra la lógica DH-1 (procesar_datos_tenant con mapeo dinámico de columnas, subcanales y reclasificaciones) y DH-2 (generar_pdf_tenant con ReportLab, portada dinámica, KPI global, tablas por sucursal). Nuevo `routers/informes_excel.py` con endpoints: `POST /api/admin/reports/infer-config` (inferencia de config desde muestra), `GET/PUT /api/admin/reports/config/{dist_id}` (gestión de `tenant_report_configs`), `POST /api/reports/generate/{dist_id}` (devuelve PDF binario). `reportlab>=4.0.0` agregado a `requirements.txt`. (2) Backend: `POST /api/supervision/upload-cc/{dist_id}` y `GET /api/supervision/cc-status/{dist_id}` en `supervision.py` — upload con JWT, background task que corre `procesar_cuentas_corrientes_service` y guarda en `cc_detalle`, logging en `motor_runs`. (3) Frontend: botón "Generar Informe" con `FileBarChart2` en header de `/supervision` que abre un `<Sheet>` con zona drag-and-drop multi-archivo, `<Progress>` durante generación y descarga automática del PDF. Botón "Actualizar CC" con `RefreshCw` en la tab CC de `TabSupervision`, `<Dialog>` con upload single-file, polling a `cc-status` cada 3s (timeout 120s), `queryClient.invalidateQueries` al completar. Nuevas funciones en `api.ts`: `generateInformeExcel`, `uploadCCForDist`, `fetchCCStatus`. Smoke test en `tests/smoke/supervision.spec.ts`.
- **04/04 (9)**: **Supervision — Generar Informe PDF + Actualizar CC** — (1) `supervision/page.tsx`: header rediseñado con botón "Generar Informe" (`FileBarChart2`). Abre un `<Sheet side="right">` con zona drag-and-drop de archivos `.xlsx/.xls` (múltiples), lista removible de archivos seleccionados, `<Progress value={75}>` durante la generación y descarga automática del PDF via `URL.createObjectURL`. Manejo de edge case para superadmin sin distribuidora seleccionada (`distId===0`): muestra `<Alert>` informativa. (2) `TabSupervision.tsx`: botón "Actualizar CC" (`RefreshCw`) en el header de la sección Cuentas Corrientes. Abre un `<Dialog>` con drop zone de archivo único `.xlsx`, estados de progreso (`uploading` → `polling`), polling automático a `fetchCCStatus` cada 3s con timeout de 120s e `invalidateQueries({queryKey:['supervision-cuentas']})` al completar. (3) `src/lib/api.ts`: 3 nuevas funciones exportadas: `generateInformeExcel`, `uploadCCForDist`, `fetchCCStatus` + interfaz `CCStatusResponse`. (4) Smoke test añadido: `tests/smoke/supervision.spec.ts`.
- **04/04 (8)**: **shadcn/ui Full Migration** — Instalados 17 primitivos nuevos: `input`, `label`, `avatar`, `badge`, `skeleton`, `select`, `alert`, `sonner`, `dialog`, `sheet`, `tabs`, `progress`, `tooltip`, `separator`, `scroll-area`, `form`, `popover`. Actualizados `button` y `card` al estándar shadcn. Migrados: `login/page.tsx` (raw inputs → `Input`/`Label`/`Button`/`Alert`, eliminados bloques CSS inline), `Topbar.tsx` (avatar div → `Avatar`, icon buttons → `Button + Tooltip`), `Sidebar.tsx` (avatar → `Avatar`, nav → `ScrollArea`, divisor → `Separator`), `KpiCard.tsx` (built on shadcn `Card`+`CardContent`), `dashboard/page.tsx` (`animate-pulse` → `Skeleton`, error div → `Alert`), `admin/page.tsx` (tab buttons → shadcn `Tabs`), `reportes/page.tsx` (warning → `Alert`). `<Toaster>` añadido a `layout.tsx`. 0 nuevos errores TypeScript.
- **04/04 (7)**: **Objetivos v7 — PDV lists, DIA_ORDER, debt display, popup enrichment** — (1) `objetivos/page.tsx`: rutas Alteo ordenadas Lunes→Domingo (`DIA_ORDER`); campo cantidad sin límite `max`; sección Activación/Exhibición reemplaza placeholder por lista real de PDVs filtrados (>30d sin compra / sin exhibición reciente) con "Hace Nd" badge; normalización de acentos en matching de Cobranza. (2) `TabSupervision.tsx`: color de texto en carrito corregido (`text-white/80` → `text-[var(--shelfy-text)]`); monto de deuda visible por PDV al modo Cobranza; mismas mejoras de DIA_ORDER, max-removal y norm en carrito flotante. (3) `MapaRutas.tsx`: popup del pin incluye línea "💰 Deuda: $N" (solo si deuda > 0) en click popup y hover-peek popup.
- **04/04 (6)**: **Objetivos v6 — Alteo, Cobranza selectiva y frases enriquecidas** — (1) Renombrado `ruteo_alteo` de "Visita" a "Alteo" en toda la UI (`TIPO_CONFIG`, `ACTIVIDADES_FRASE`, dropdown de creación). (2) Campo de cantidad en modal Alteo: aparece al seleccionar ruta, con máximo = total_pdv de la ruta. (3) Frase auto-generada para Alteo incluye ahora cantidad de PDVs, día de visita y días disponibles hasta la fecha límite. (4) Modal Cobranza: lista de deudores ahora es seleccionable (click para elegir un deudor); toggle Total/Parcial + input de monto parcial; `valor_objetivo` se persiste en Supabase. (5) Frases Cobranza por deudor: `[vendedor] deberá cobrarle $[monto] a [cliente]` para la fecha`[fecha]`.
- **04/04 (5)**: **Ecosistema de Objetivos v5** — Mejoras profundas en tres capas: (1) **Backend**: `crear_objetivo` ahora llama al `ObjetivosWatcherService` inmediatamente tras la inserción para que `valor_actual` arranque con el estado real (0 cobrado, N PDVs ya en ruta, etc.) y devuelve la fila actualizada. Comentario aclaratorio sobre el snapshot de deuda para objetivos de cobranza con montos parciales. (2) **TabSupervision**: El "carrito flotante" de objetivos es ahora inteligente — al seleccionar tipo _Alteo_ carga las rutas del vendedor vía `fetchRutasSupervision`; tipo _Cobranza_ obtiene la lista de deudores desde `fetchCuentasSupervision`; tipos _Activación/Exhibición_ calculan el conteo de PDVs inactivos (+30d) desde los pines locales. `buildObjectivePhrase` auto-genera la descripción cuando el campo está vacío. (3) **MapaRutas**: Click en pin ahora abre el popup con cierre automático a los 2s. Hover con "Progressive Peek" de 3s tras el cual aparece la foto de la última exhibición en el popup. (4) **Objetivos Page**: Módulo de impresión `ObjectivePrintOut` con layout A4 (un objetivo por sección, checkbox para seguimiento manual en campo) y botón _Imprimir_.
- **04/04 (4)**: **Estabilidad y Multi-tenant Switcher** — Implementación del permiso `action_switch_tenant` que habilita el selector de distribuidora a usuarios administrativos autorizados. Actualización de `security.py` (backend) para permitir bypass de ownership vía permisos. Fix crítico de estabilidad: resolución de errores 500 en Dashboard (date parsing robusto) y eliminación de warnings de Recharts (`minWidth`/`minHeight` en `ResponsiveContainer`). Sincronización de interfaz `MotorRun` con el esquema real de BD (`iniciado_en`, `finalizado_en`).
- **04/04 (3)**: **Migración a Light-Violet Theme** — `:root` cambiado a modo claro (`#F8FAFC` bg, violeta como acento). Nuevos primitivos shadcn/ui: `Checkbox`, `Table`, `DropdownMenu`. `permissions/page.tsx` reescrito con shadcn `Table`+`Checkbox`; constantes de grupos/permisos hoistadas a módulo. `Sidebar.tsx` actualiza el switcher de distribuidora con `DropdownMenu`, memoiza `navItems` con `useMemo`, agrega cleanup en fetch y tipado correcto (`React.ElementType`). Mejoras de calidad: `Fragment key`, guardas simplificadas, wrapper divs eliminados.
- **04/04 (2)**: La **Matriz de Permisos** ahora es totalmente **editable** por el Superadmin con persistencia en base de datos.
- **04/04**: Implementación de **Matriz de Permisos** (RBAC), nuevo rol **Directorio** con acceso global, y **Jerarquía de Objetivos** (contención de progreso). Rediseño estético completo adoptando **shadcn/ui** y refinando la paleta violeta.
- **03/04 (tarde)**: Refactorización modular de `api.py` (4067 → 98 líneas). Nuevo árbol: `core/` (config, security, lifespan, helpers), `models/schemas.py`, `routers/` (auth, erp, supervision, admin, reportes). Cero cambios en contratos HTTP — URLs, métodos y esquemas JSON idénticos. Backup en `api_legacy.py.bak`.
- **03/04**: Implementación de sistema de objetivos y carrito de selección en el mapa de supervisión.
- **02/04**: Estandarización de nombres ERP para vendedores y auditoría de ranking Marzo 2026.
- **01/04**: Fix de estabilidad en marcadores de mapa (GPU/WebGL conflict resolution).
