# Frontend Design System — Shelfy

Este documento especifica los colores, estilos y componentes visuales utilizados en la plataforma Shelfy.

## Paleta de Colores (Shelfy Light-Violet Theme)

La interfaz se basa en un **tema claro** con fondos off-white y violeta como color de marca. El modo oscuro (`.dark`) existe como fallback pero no es el tema por defecto.

| Variable CSS | Valor Hex/RGBA | Uso |
|---|---|---|
| `--shelfy-bg` | `#F8FAFC` | Color de fondo principal (off-white). |
| `--shelfy-panel` | `rgba(255, 255, 255, 0.85)` | Paneles y tarjetas con fondo translúcido. |
| `--shelfy-primary` | `#a855f7` (Violet 500) | Botones primarios, estados activos, acento de marca. |
| `--shelfy-primary-2`| `#8b5cf6` (Violet 500 oscuro) | Gradientes y acentos secundarios (switcher de distribuidora). |
| `--shelfy-accent` | `#7C3AED` | Hover states y bordes destacados (Deep Violet). |
| `--shelfy-border` | `rgba(0, 0, 0, 0.08)` | Bordes sutiles en paneles. |
| `--shelfy-text` | `#0F172A` | Texto principal (casi negro). |
| `--shelfy-text-soft` | `#475569` | Texto secundario y etiquetas. |
| `--shelfy-muted` | `#64748B` | Texto deshabilitado o de menor importancia. |
| `--shelfy-success` | `#10B981` (Emerald) | Compra reciente, activo, objetivo cumplido. |
| `--shelfy-error` | `#EF4444` (Rose) | Inactivo, moroso, error en carga. |
| `--shelfy-warning` | `#F59E0B` (Amber) | Alertas, preventivos, objetivos próximos a vencer. |

### Tokens shadcn/ui (primitivos)
Los primitivos de shadcn (`Button`, `Checkbox`, `Table`, `DropdownMenu`) usan los tokens `--primary` / `--ring` que resuelven a `oklch(0.627 0.265 303.9)` (violeta), asegurando coherencia visual sin sobreescribir los componentes.

---

## Visual Aesthetics

### Glassmorphism (Light)
Los paneles utilizan el estilo "Glass-Card" adaptado al tema claro:
- **Background**: `rgba(255, 255, 255, 0.6)`
- **Backdrop-filter**: `blur(12px)`
- **Borde**: `1px solid rgba(0, 0, 0, 0.06)`
- **Sombra**: `0 4px 24px 0 rgba(0, 0, 0, 0.06)`

### Tipografía
- **Fuente Principal**: `'Inter', ui-sans-serif, system-ui`.
- **Peso**: `400` (Regular), `500` (Medium), `600` (Semibold).

---

## Componentes UI Clave

### 1. Marcadores de Mapa (Pins)
- **Animación Aura**: Se utiliza `box-shadow` en lugar de `transform` para evitar conflictos con WebGL/GPU:
  ```css
  @keyframes shelfy-aura {
    0%   { box-shadow: 0 0 0 1px var(--ac); }
    70%  { box-shadow: 0 0 0 9px transparent; }
    100% { box-shadow: 0 0 0 9px transparent; }
  }
  ```
- **Popups**: Estilo minimalista sin bordes/sombras nativas de MapLibre, integrados con el `glass-card`.

### 2. TabSupervision
- **Layout**: Sidebar de selección de distribuidor/sucursal + Tabs centrales (Mapa, Ventas, Cuentas).
- **Sticky Headers**: Los selectores se mantienen visibles durante el scroll en móviles.
- **Actualizar CC**: Botón "Actualizar CC" (`RefreshCw`) en el header de la sección Cuentas Corrientes (visible cuando `selectedDist > 0`). Abre un `<Dialog>` con file picker `.xlsx` y flujo: `idle` → `uploading` (Progress 60) → `polling` cada 3s contra `GET /api/supervision/cc-status/{distId}` (Progress 80) → cierre automático al recibir `estado: "completado"` + `invalidateQueries({queryKey:["supervision-cuentas"]})`. Timeout de seguridad de 120s. Toda la lógica de polling usa refs (`ccPollingRef`, `ccTimeoutRef`) limpiados en `useEffect(() => () => stopCCPolling(), [])`.

### 2b. Supervision Page — Generar Informe
- **Botón "Generar Informe"** (`FileBarChart2`) en el header de `/supervision/page.tsx`, alineado a la derecha del título.
- **Sheet**: `<Sheet side="right" sm:max-w-md>` con zona drag-and-drop para múltiples `.xlsx/.xls`. Drag activo aplica `border-[var(--shelfy-primary)]` + `bg-[var(--shelfy-primary)]/5`.
- **Edge case**: Si `distId === 0` (superadmin sin distribuidora en sesión) el sheet muestra un `<Alert>` explicativo en lugar de la zona de drop.
- **Download automático**: Respuesta binaria del backend → `URL.createObjectURL(blob)` + click programático + `URL.revokeObjectURL`. Nombrado: `informe_ventas_YYYY-MM-DD.pdf`.
- **Protección de cierre**: `onOpenChange` bloquea el cierre del sheet mientras `generating === true` para evitar pérdida de estado.

### 3. Floating Objetivos ("Carrito")
- **UI**: Panel flotante en la esquina inferior derecha del mapa.
- **Interacción**: Permite "añadir" PDVs al tocar el icono de objetivo en el pin.
- **Tipos de objetivo** (labels en UI):
  - `conversion_estado` → "Activación"
  - `cobranza` → "Cobranza"
  - `ruteo_alteo` → **"Alteo"** (nunca "Visita" — tipo inexistente en el negocio)
  - `exhibicion` → "Exhibición"
  - `general` → "General"
- **Alteo flow**: Al seleccionar tipo Alteo, carga rutas del vendedor. Al elegir ruta, aparece campo numérico de cantidad (con máximo = `total_pdv` de la ruta). Frase generada: `[vendedor] debe Altear [N] PDVs en [ruta] de los días [dia]. Tenés [N] días.`
- **Cobranza flow**: Carga lista de deudores del vendedor (seleccionable). Toggle Total/Parcial: "Total" usa toda la deuda; "Parcial" muestra input de monto. Persiste `valor_objetivo` en Supabase. Frase: `[vendedor] deberá cobrarle $[monto] a [cliente] para la fecha [fecha].`

### 4. Matriz de Permisos (RBAC)
- **UI**: Tabla de doble entrada (Rol vs Permiso) ubicada en `/admin/permissions`.
- **Componentes**: `shadcn/ui` `Table`, `Checkbox` y `Button`.
- **Rendimiento**: `PERMISSION_GROUPS` y `PERMISSIONS_BY_GROUP` son constantes de módulo (no se recomputan en render). Los grupos de permisos se renderizan con `<Fragment key={group}>`.
- **Seguridad**: Los elementos del menú en el `Sidebar` se ocultan automáticamente si el usuario no tiene la `permisoKey` correspondiente.

### 5. Motor de Informes Excel (supervision/page.tsx)
- **Botón "Generar Informe"**: icono `FileBarChart2`, abre `<Sheet side="right">`.
- **Sheet**: zona drag-and-drop multi-archivo `.xlsx`, lista removible de archivos, `<Progress>` durante generación, descarga automática del PDF al completar.
- **Edge case**: si `distId === 0` (superadmin sin dist), muestra `<Alert>` en lugar de la zona de drop.
- **API**: `generateInformeExcel(distId, files[]) → Promise<Blob>`. POST a `/api/reports/generate/{dist_id}` con multipart (campo `files`).

### 6. Actualizar CC en TabSupervision
- **Botón "Actualizar CC"**: icono `RefreshCw`, `variant="outline" size="sm"`, visible cuando `selectedDist > 0`.
- **Dialog**: upload single-file `.xlsx`, estados `idle → uploading → polling → done`.
- **Polling**: `setInterval` en `ccPollingRef` (useRef) cada 3s a `fetchCCStatus`. Timeout a 120s. Cleanup en `useEffect` al desmontar.
- **Al completar**: `queryClient.invalidateQueries({queryKey:["supervision-cuentas"]})` + `toast.success`.
- **APIs**: `uploadCCForDist(distId, file)`, `fetchCCStatus(distId)`, interfaz `CCStatusResponse`.

### 7. Sidebar — Switcher de Distribuidora
- **Componente**: `shadcn/ui` `DropdownMenu` (reemplaza el dropdown custom anterior).
- **Visibilidad**: Disponible para Superadmin y usuarios con el permiso `action_switch_tenant`.
- **Posición**: `side="top"`, aparece sobre el trigger, alineado al ancho del botón trigger.
- **Optimización**: `navItems` se memoiza con `useMemo([rol, hasPermiso])` para evitar re-cómputos.
- **Fuente única de contexto**: Desde 13/04/2026 este es el único punto de cambio de entorno; se removieron selectores locales de tenant en `/supervision` y `/objetivos`.

### 8b. Visor — Exhibiciones de prueba (Tabaco)
- El backend excluye de `/api/pendientes` y de listas de ranking a integrantes/vendedores marcados como QA (NACHO PIAZZA, JESUS GRIMALDI) salvo sesión **superadmin**; no requiere cambios de UI en el visor.

### 9. Dashboard — KPI Carousel Rotante (14/04/2026)
- **2 grupos de 3 KPIs**: Grupo 0 (Pendientes/Aprobadas/Destacadas), Grupo 1 (Rechazadas/Tasa Aprob./Total).
- **Auto-rotación**: `setInterval(7000)` con cleanup en `useEffect`. Estado `kpiGroup: 0 | 1`.
- **`AnimatePresence` + `motion.div`**: `initial={{ opacity:0, y:10 }}` → `animate={{ opacity:1, y:0 }}` → `exit={{ opacity:0, y:-10 }}` con `key={kpiGroup}`.
- **Dot indicators**: pills clickeables `onClick={() => setKpiGroup(i)}` con `bg-[var(--shelfy-primary)]` para el activo.
- **KpiCard `colorName="slate"`**: nuevo color añadido a `KpiColorName` type y `COLOR_MAP`.
- **Carousel height**: fijo `h-[380px] md:h-[420px]` (no más `flex-1 min-h-[460px]` que causaba scroll).

### 10. ApiError — Errores Estructurados de API (14/04/2026)
- **Clase `ApiError extends Error`** en `api.ts` con campos `status: number` y `detail: unknown`.
- **`apiFetch`**: lanza `ApiError` en lugar de `Error` genérico; extrae `detail.mensaje` para 409 duplicados.
- **Uso en mutaciones**: `onError: (err) => { if (err instanceof ApiError && err.status === 409) toast.warning(...) }`.
- **Wizard sequential blocking en Objetivos**: Secciones Tipo y Fecha límite con `opacity-40 pointer-events-none select-none` cuando `!vendedorId`.
### 11. Galería — Debug Visible y Contextual (15/04/2026)
- `apiFetch` imprime debug para cualquier error en `/api/galeria/*` (URL, status, options, response body).
- `galeria-exhibiciones/page.tsx` agrega `console.group` con contexto de filtros y vendedor al fallar queries, y muestra `error.message` en `<Alert>` destructiva.

### 12. Calendarios shadcn estandarizados (15/04/2026)
- Todos los calendarios detectados en `src/` migrados a `DatePicker` (sin `input type="date"`).
- `DatePicker` soporta `disabled` para formularios en modo lectura (ej. edición de vendedor sin permiso).

### 13. Nombres ERP de vendedores unificados (15/04/2026)
- `src/lib/api.ts` agrega normalización central `resolveVendorERPName` para resolver display name de vendedor priorizando `nombre_erp`.
- Se aplica en respuestas de ranking, supervisión y objetivos para que la UI no mezcle nombres legacy o aliases de Telegram.

### 14. Fuerza de Ventas — Selects largos de Telegram (15/04/2026)
- En `VendedorEditSheet`, los `SelectContent` de “Grupo Telegram” y “Usuario Telegram” usan `max-h-72` para habilitar scroll interno cuando hay muchas opciones.

### 15. Fuerza de Ventas — contexto de actividad por usuario Telegram (15/04/2026)
- El select de “Usuario Telegram” muestra sublínea en gris por opción con `total_exhibiciones` y fecha de `ultima_exhibicion`.
- Permite desambiguar homónimos (ej. dos “Jeronimo”) usando actividad real de exhibiciones.

### 16. Modo Oficina — estabilidad visual KPI chart (15/04/2026)
- `ResponsiveContainer` del bloque KPI usa `minWidth={0}` y `minHeight={80}` para evitar warnings de Recharts (`width(-1)/height(-1)`) durante transiciones/layout.

### 17. Galería — Timeline Inteligente (16/04/2026)
- `ExhibicionesTimelineDialog` usa `useInfiniteQuery` de TanStack con paginación `offset/limit` y botón "Cargar más" (sin cargar todo el histórico en mount).
- La timeline se agrupa por fecha: **1 fecha = 1 exhibición lógica**; múltiples fotos del mismo día se muestran en grid dentro de la misma tarjeta.
- Se deduplican URLs repetidas para evitar mostrar la misma imagen en fechas distintas por duplicados históricos.
- El contador y badges del header de timeline cuentan exhibiciones agrupadas por fecha (no cantidad bruta de filas/fotos).

### 18. Galería — Estado global con Zustand (16/04/2026)
- Nuevo store `useGaleriaStore` para persistir filtros/sort/rango de fechas y `timelinePageSize`.
- `galeria-exhibiciones/page.tsx` deja de dispersar estado local de filtros y consume el store como fuente única.

### 19. Supervisión — visibilidad inactivos anti-regresión (16/04/2026)
- `MapaRutas` reinicia filtros del legend de estados al cambiar el set de pines para prevenir sesiones donde solo queden visibles activos tras toggles previos.
- Comportamiento esperado: al prender vendedor/ruta se visualizan activos e inactivos (siempre que tengan coordenadas válidas).

### 20. Supervisión — color personalizado por vendedor (16/04/2026)
- `TabSupervision` agrega picker (`input type=color`) + acción de reset por vendedor en ambos paneles (normal y fullscreen overlay de `ShelfyMaps`).
- El color se persiste en Zustand (`useSupervisionStore.vendorColorOverrides`) con key `distId:vendorId`.
- Los pines de mapa y acentos de filas/rutas consumen ese color override en tiempo real.

### 21. Supervisión — galería del día filtrable y tenant-safe (16/04/2026)
- Filtros de estado robustos por normalización (`Aprobado/Aprobada`, `Rechazado/Rechazada`, `Destacado/Destacada`, `Pendiente`).
- La galería inferior “Exhibiciones del día” muestra solo registros de vendedores pertenecientes a la `selectedSucursal`.
- El contador de cabecera muestra registros visibles (post-filtro), no el total bruto.

### 22. Supervisión — comparabilidad mapa/galería por rango temporal (16/04/2026)
- La galería inferior agrega switch de período: `Hoy`, `7 días`, `Histórico`.
- `Histórico` permite contrastar contra el mapa (que marca “con exhibición” por última evidencia histórica del PDV, no solo del día).

### 23. Galería de Exhibiciones — cambio de tenant robusto (16/04/2026)
- `galeria-exhibiciones/page.tsx` limpia contexto al cambiar distribuidora activa (`selectedVendedor`, búsqueda y filtro de sucursal).
- Evita estados persistidos de un tenant anterior que dejaban la vista en “Sin exhibiciones” aunque existieran datos.

### 24. Visor de evaluación — filtro por sucursal (16/04/2026)
- `visor/page.tsx` agrega selector de sucursal (`Todas las sucursales` + opciones detectadas en pendientes) en el header de desktop.
- El filtro se combina con vendedor y tab (`todas`/`objetivo`) para acotar el lote que evalúa el usuario sin perder la navegación por grupos.

### 25. Visor — Stage adaptativo y Modo foco (16/04/2026)
- `FotoViewer` usa fondo adaptativo (blur de la misma imagen + capa gradiente) para reducir el protagonismo del marco negro en fotos verticales/horizontales.
- La imagen principal mantiene `object-contain` para garantizar visualización completa sin recortes.
- Nuevo toggle `Modo foco` en el canvas: oculta overlays/paneles de contexto para priorizar lectura visual de la foto durante la evaluación.

### 26. Visor/Mobile — barra de evaluación menos intrusiva (16/04/2026)
- El acceso a `Modo foco` se mueve al bloque de acciones de evaluación (desktop + mobile) para quedar en el mismo punto de decisión.
- En mobile, la barra inferior reduce opacidad y padding; observaciones/frases quedan colapsadas por defecto y se despliegan con botón `Obs`.

### 27. Galería Timeline — badges jerarquizados por color (16/04/2026)
- En el detalle por cliente, badges de metadata usan color semántico para escaneo rápido (estado, cantidad de imágenes y fecha).
- Regla de negocio del badge tipo: solo `COMERCIO CON INGRESO` (verde) y `COMERCIO SIN INGRESO` (rojo), con fallback neutro.

### 8. Supervisión — Aislamiento de Cache por Tenant
- `TabSupervision.tsx` scopea las query keys de rutas/clientes con `dist_id`:
  - `['supervision-rutas', distId, id_vendedor]`
  - `['supervision-clientes', distId, id_ruta]`
- Al cambiar distribuidora limpia caches de rutas/clientes para evitar cruces de datos entre contextos y etiquetas de vendedor incorrectas en mapa.

### 9. Objetivos — Cascada obligatoria y Activación multi-PDV (Abr 2026)
- En `NuevoObjetivoModal`, si hay múltiples sucursales la selección de vendedor queda bloqueada hasta elegir sucursal (`mustSelectSucursalFirst` + `disabled` en select de vendedor).
- Tipo `conversion_estado` ahora permite seleccionar múltiples PDVs (checkbox visual + contador), y al enviar persiste `pdv_items` + `valor_objetivo` con la cantidad seleccionada.
- El contexto de activación consume `fetchPDVCatalog` (no sólo rutas/clientes cargados) y usa paginación “Cargar más PDVs” para incluir clientes inactivos o con compra/exhibición antigua.

## State Management & Ingesta

Para garantizar el rendimiento y la mantenibilidad de Shelfy, se siguen estos patrones:

1. **Zustand**: Estándar para el **estado global del cliente** (UI sync, filtros entre componentes, estado del mapa, carrito de objetivos). 
   - *Ejemplo*: `useObjetivosStore` para coordinar el panel flotante y los pines del mapa.
2. **TanStack Query v5**: Única herramienta para el **estado del servidor** (fetching de API, caching, mutaciones).
   - *Regla*: Todas las funciones fetch deben estar en `src/lib/api.ts` y usarse únicamente vía Query/Mutation hooks.
   - *Nota operativa CC (08/04/2026)*: para Real Tabacalera, el RPA ahora separa automáticamente las filas de cuentas corrientes por sucursal (`UEQUIN RODRIGO` / `OSCAR ONDARRETA`) antes de subirlas al backend, por lo que el frontend recibe los datos ya segmentados por distribuidor destino.
3. **Animations (Framer Motion)**: Se utilizan para mejorar la percepción de fluidez sin sacrificar la densidad.
   - *Performance*: Máximo `0.4s` de duración. Se evitan animaciones de entrada pesadas en tablas con gran volumen de datos para priorizar la productividad.

## Primitivos shadcn/ui Disponibles

Los siguientes componentes están instalados en `src/components/ui/` (completo desde 2026-04-04):

| Componente | Archivo | Uso |
|---|---|---|
| `Button` | `button.tsx` + `Button.tsx` | Acciones primarias y secundarias. `variant="default"` usa violeta. |
| `Card` | `card.tsx` | KPI cards, paneles. Usar `CardHeader`/`CardContent`/`CardFooter`. |
| `Input` | `input.tsx` | Campos de texto (login, filtros, búsqueda). |
| `Label` | `label.tsx` | Etiquetas de formulario. |
| `Avatar` | `avatar.tsx` | Avatares de usuario con `AvatarFallback`. |
| `Badge` | `badge.tsx` | Chips de estado (roles, PDV activo/inactivo). |
| `Skeleton` | `skeleton.tsx` | Placeholders de carga (reemplaza `animate-pulse`). |
| `Select` | `select.tsx` | Dropdowns de filtro. |
| `Alert` | `alert.tsx` | Banners de error/advertencia (`variant="destructive"`). |
| `Sonner` | `sonner.tsx` | Toasts via `toast()` de `sonner`. `<Toaster>` en `layout.tsx`. |
| `Dialog` | `dialog.tsx` | Modales con `DialogTitle` obligatorio. |
| `Sheet` | `sheet.tsx` | Paneles laterales/drawers con `SheetTitle`. |
| `Tabs` | `tabs.tsx` | Navegación multi-sección (admin, reportes). |
| `Progress` | `progress.tsx` | Barras de progreso. |
| `Tooltip` | `tooltip.tsx` | Accesibilidad en botones solo-icono. |
| `Separator` | `separator.tsx` | Divisores visuales (reemplaza `border-t` divs). |
| `ScrollArea` | `scroll-area.tsx` | Contenedores scrolleables con scrollbar custom. |
| `Form` | `form.tsx` | Formularios validados con `react-hook-form`. |
| `Popover` | `popover.tsx` | Selectores de fecha, filtros flotantes. |
| `Checkbox` | `checkbox.tsx` | Toggles de permisos, listas de selección. |
| `Table` | `table.tsx` | Matrices de datos (permisos, reportes). |
| `DropdownMenu` | `dropdown-menu.tsx` | Menús contextuales. Sidebar tenant switcher. |

## Gráficos y Visualización
- **Recharts**: Se utilizan paletas de colores basadas en `--shelfy-primary` para consistencia.
- **MapLibre GL**: El tema del mapa puede actualizarse a un estilo claro para alinear con el nuevo light theme.
