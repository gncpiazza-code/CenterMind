# Plan Maestro de Implementación — CenterMind / Shelfy

## Contexto y Alcance

Se analizó exhaustivamente el código del proyecto. El frontend es Next.js + TanStack Query + Zustand (parcialmente). El backend es FastAPI + Supabase. Se detectaron 8 ítems de trabajo que se priorizan en el orden lógico de menor a mayor impacto de cambios, para poder ejecutar de forma armoniosa y sin regresiones.

---

## Ítem 1 — Bug: Cuentas Corrientes de Tabaco & Hnos no muestra todos los vendedores

> [!CAUTION]
> Es un bug de datos/lógica que puede afectar facturación y supervisión real. Resolver primero.

### Diagnóstico (sin tocar código aún)

El endpoint `GET /api/supervision/cuentas/{dist_id}` (línea 3214 de `api.py`) lee la tabla `cc_detalle` filtrando por `fecha_snapshot` (último snapshot) y opcionalmente por `sucursal_nombre`.

Los vendedores se agrupan usando `id_vendedor` como key (`v_key = item.get("id_vendedor") or item.get("vendedor_nombre", "Sin Vendedor")`).

**Hipótesis de bug**: En Tabaco & Hnos (id_distribuidor = 3), algunos registros de `cc_detalle` tienen `id_vendedor = NULL`, lo que hace que todos esos clientes colapsen bajo la key `None` y aparezcan como un solo "vendedor" anónimo — o directamente se pierdan cuando el frontend filtra por sucursal.

Una segunda hipótesis: el `sucursal_nombre` en `cc_detalle` para Tabaco no coincide exactamente con el string que manda el frontend desde el selector de sucursal (diferencia de mayúsculas, tildes, o espacios al final). Tabaco tiene múltiples sucursales (RECONQUISTA, CÓRDOBA, CORRIENTES, RESISTENCIA, SAENZ PEÑA) y el filtro `.eq("sucursal_nombre", sucursal)` es case-sensitive en Supabase PostgREST.

### Archivos a tocar

#### [MODIFY] [api.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/api.py) (líneas 3214–3338)

- **Qué cambiar**: Antes de ejecutar el query, normalizar el string `sucursal` que llega como query parameter: `.strip().upper()`. Hacer lo mismo con el campo `sucursal_nombre` del registro al comparar, usando `ilike` en lugar de `eq`.
- **Por qué**: Evita que "Córdoba " (con espacio o tilde) no matchee contra "CORDOBA".
- **También**: Agregar un log diagnóstico que imprima cuántos registros sin `id_vendedor` existen para ese dist_id, así se confirma/descarta la hipótesis del NULL.
- **Por qué así**: El backend es el lugar correcto para normalizar, no el frontend. El cambio es de 3 líneas.

**Script de diagnóstico a ejecutar** (sin modificar código):
```python
# Verificar en Supabase cuántas filas de cc_detalle tienen id_vendedor=NULL para dist_id=3
# y qué sucursal_nombre exacto tienen
```

> [!IMPORTANT]
> Antes de modificar el backend, hay que correr el diagnóstico contra Supabase directamente para confirmar cuál de las dos hipótesis es la real (o si es ambas).

---

## Ítem 2 — Mapa de PDVs: número de exhibiciones dentro del pin

> [!NOTE]
> Cambio puramente visual en `MapaRutas.tsx` y en cómo se pasan los datos desde `TabSupervision.tsx`.

### Qué se quiere lograr

El pin del PDV actualmente tiene:
- **Relleno**: color del vendedor (ya implementado con `vendorColor`)
- **Contorno**: color del status (activo/inactivo/con-sin exhibición, ya en `STATUS_COLORS`)
- **Nuevo**: texto/número DENTRO del redondel que indique cuántas veces ese PDV recibió exhibición (no la última, sino el total histórico)

### Datos necesarios

El número total de exhibiciones por PDV **no está disponible** en el endpoint actual `/api/supervision/clientes/{id_ruta}`. Solo se detecta si hubo al menos una (`fecha_ultima_exhibicion != null`).

### Archivos a tocar

#### [MODIFY] [api.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/api.py) — endpoint `supervision_clientes` (líneas 2944–3014)

- **Qué agregar**: Al hacer el cross-reference con `exhibiciones`, en vez de solo guardar si existe (`exh_map`), contar cuántas filas hay por `id_cliente_pdv` o `cliente_sombra_codigo`. Agregar al response el campo `total_exhibiciones: int` (por defecto 0).
- **Por qué aquí**: Es la fuente de datos que ya hace la query a `exhibiciones`. Agregar un `COUNT` es más eficiente que hacer otra llamada.

#### [MODIFY] [api.ts](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/lib/api.ts) — interfaz `ClienteSupervision` (líneas 874–891)

- **Qué agregar**: Campo `total_exhibiciones?: number` a la interfaz TypeScript.

#### [MODIFY] [TabSupervision.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/TabSupervision.tsx) — construcción de `pines` (líneas 661–732)

- **Qué agregar**: Al construir cada `PinCliente`, mapear `c.total_exhibiciones ?? 0` a un nuevo campo `totalExhibiciones`.

#### [MODIFY] [MapaRutas.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/MapaRutas.tsx)

- **Interfaz `PinCliente`**: Agregar el campo `totalExhibiciones?: number`.
- **Renderizado del marker** (líneas 158–175): Actualmente el pin es un `div` simple con solo CSS. Para mostrar el número dentro, hay que cambiar la estrategia: el wrapper div necesita un elemento hijo con el texto. Usar `innerHTML` del wrapper con un `<span>` centrado si el número > 0. Ajustar el `size` del pin para que sea un poco más grande cuando hay texto (mínimo 16px de diámetro).
- **Por qué**: MapLibre usa elementos HTML nativos como markers, podemos poner texto adentro sin problema de rendimiento.

> [!NOTE]
> El contorno del pin ya diferencia el status (activo/inactivo/exhibición). El relleno ya es el color del vendedor. Solo falta el número interior.

---

## Ítem 3 — Migración de /dashboard y /supervision a TanStack Query + Zustand + Animaciones

> [!IMPORTANT]
> Este ítem es el de mayor volumen de trabajo. Se divide en dos sub-tareas: dashboard y supervision.

### Estado actual

- `/supervision` → `TabSupervision.tsx` ya usa **TanStack Query** para vendedores, rutas y clientes (parcialmente). Los datos de `ventas` y `cuentas` todavía usan **useState + useEffect manual** (líneas 313–332). El store de Zustand existe (`useSupervisionStore`) para la visibilidad del mapa.
- `/dashboard` → `page.tsx` usa **useState + useCallback + useEffect** puro (líneas 77–133). No usa TanStack Query para nada.

### Sub-tarea 3A — Dashboard

#### [NEW] `src/store/useDashboardStore.ts`

- **Qué crear**: Store de Zustand para los filtros del dashboard (año, mes, día, sucursalFiltro). Estos son el "estado de navegación" que debe persistir entre re-renders y eventualmente entre sesiones.
- **Por qué**: Permite que TanStack Query use los filtros como `queryKey` directamente, sin necesidad de callbacks.

#### [MODIFY] [page.tsx (dashboard)](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/dashboard/page.tsx)

- **Qué cambiar**: Reemplazar todas las llamadas `await Promise.all([fetchKPIs, fetchRanking, ...])` dentro de un `useCallback` por hooks `useQuery` individuales de TanStack. Cada uno con su `queryKey` derivado del store de Zustand.
- **Queries a crear**:
  - `useQuery({ queryKey: ['dashboard-kpis', distId, periodo, sucursal], queryFn: ... })`
  - `useQuery({ queryKey: ['dashboard-ranking', distId, periodo, sucursal], queryFn: ... })`
  - `useQuery({ queryKey: ['dashboard-ultimas', distId, sucursal], queryFn: ..., staleTime: 30_000 })`
  - `useQuery({ queryKey: ['dashboard-sucursales', distId, periodo, sucursal], queryFn: ... })`
  - `useQuery({ queryKey: ['dashboard-evolucion', distId, periodo, sucursal], queryFn: ... })`
  - `useQuery({ queryKey: ['dashboard-ciudades', distId, periodo, sucursal], queryFn: ... })`
- **Beneficio clave**: Cada query se re-fetcha de forma independiente. Si "KPIs" tarda más, el "Ranking" aparece antes. `placeholderData: keepPreviousData` hace que el cambio de filtros no borre la UI sino que muestre datos anteriores mientras carga.
- **Auto-refresh**: reemplazar `setInterval` con `refetchInterval: 90_000` en cada `useQuery`.
- **Animaciones a agregar**: 
  - Usar `Framer Motion` (ya está instalado, se usa en `RankingTable.tsx`) para animar las `KpiCard` con `initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}`.
  - Agregar `staggerChildren` al contenedor de KPIs para que aparezcan en cascada.
  - En los estados de loading, usar skeleton loaders animados con `animate-pulse` en lugar del `PageSpinner` actual.

#### [MODIFY] [FiltrosBar.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/dashboard/FiltrosBar.tsx)

- **Qué cambiar**: Conectar directamente al `useDashboardStore` en lugar de recibir callbacks como props. Esto simplifica el componente padre y hace los filtros autodescubiertos.

### Sub-tarea 3B — Supervisión (migración de Ventas y Cuentas)

#### [MODIFY] [TabSupervision.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/TabSupervision.tsx)

- **Ventas** (líneas 313–319): Reemplazar el `useEffect` manual que llama a `fetchVentasSupervision` por un `useQuery({ queryKey: ['supervision-ventas', selectedDist, ventasDias], queryFn: ..., enabled: !!selectedDist })`. Eliminar los estados `ventasData`, `loadingVentas`.
- **Cuentas** (líneas 321–332): Reemplazar el `useEffect` manual por `useQuery({ queryKey: ['supervision-cuentas', selectedDist, selectedSucursal], queryFn: ..., enabled: !!selectedDist && !!selectedSucursal })`. Eliminar los estados `cuentasData`, `loadingCuentas`.
- **Por qué**: Con TanStack, al cambiar de sucursal los datos anteriores se muestran como placeholder mientras carga, en vez de un flash de "sin datos".

#### [MODIFY] [useSupervisionStore.ts](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/store/useSupervisionStore.ts)

- **Qué agregar**: Slice de UI para la pestaña activa del panel de supervición (cuando implementemos punto 5), y posiblemente estado de ventasDias para que persista entre navegaciones.

### Animaciones de fluidez (aplica a ambas rutas)

- **Skeleton loaders**: En lugar de spinners, mostrar el "fantasma" de la UI real con `animate-pulse` en `bg-white/5` o `bg-slate-100`. Se crean en cada componente de forma local.
- **Transiciones de datos**: Usar `AnimatePresence` de Framer Motion para animar entradas/salidas de filas en tablas (ya en uso en `RankingTable`).
- **Slide-in de paneles**: En supervisión, los accordions ya tienen transición CSS `grid-template-rows`. Para cuentas corrientes, animar la aparición de la tabla con `initial={{ opacity: 0 }} animate={{ opacity: 1 }}`.
- **Número de PDV**: Al actualizarse el contador de PDVs visibles en el mapa, un pequeño `scale(1.15) → scale(1)` en 200ms da sensación de vida.

---

## Ítem 4 — Informe "Generar Informe": todos los vendedores + descarga PDF

> [!NOTE]
> El informe HTML ya existe y es bueno. Hay dos mejoras: incluir TODOS los vendedores (no solo top 15), y agregar botón de PDF B&N imprimible.

### Análisis del estado actual

- `generateRankingHTML.ts` tiene la función `buildRankingRows` que hace `ranking.slice(0, 15)` (línea 118) — **esto es el bug del top 15**.
- El informe referencia `ranking_tabaco_marzo_2026.html` que es mucho más rico: tiene Race Chart, KPIs animados con counter, gráfico de actividad diaria mejorado con anotaciones de pico, badges de sucursal con colores específicos.
- El informe de referencia NO tiene PDF.

### Archivos a tocar

#### [MODIFY] [generateRankingHTML.ts](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/lib/generateRankingHTML.ts)

- **Bug fix crítico**: En `buildRankingRows`, remover el `.slice(0, 15)`. Incluir TODOS los vendedores del ranking.
- **Mejoras visuales al nivel de referencia**:
  - Agregar **Race Chart animado** (como en el .html de referencia) — generado en JavaScript dentro del HTML output usando los datos de `evolucion`.
  - Agregar **badges de sucursal con colores** (el .html de referencia tiene clases `.suc-RECONQUISTA`, `.suc-CORDOBA`, etc.). Se puede hacer dinárico calculando un color HSL a partir del nombre de la sucursal.
  - Agregar **anotación de pico** en el gráfico de actividad diaria (la marca "⬆ Pico: N" del .html de referencia).
  - Agregar **barra de progreso animada** por vendedor (el `.bar-fill` del .html de referencia con transición CSS de 1s).
  - Agregar **contador animado KPI** al estilo del reference (función `animateCount` con IntersectionObserver).
- **Nueva sección "PDF imprimible"**: Agregar una `@media print` dentro del `<style>` del HTML generado que:
  - Cambia el fondo a `white`.
  - El texto a `black` / `#333`.
  - Oculta el Race Chart (demasiado interactivo para imprimir).
  - Aplica `page-break` entre secciones si es necesario.
  - Renderiza tablas con bordes sólidos grises para claridad en B&N.
- **Por qué HTML + media print vs PDF externo**: Generar PDF verdadero en el browser requiere librerías como `html2pdf.js` o `jsPDF` que agregan peso. La solución más limpia (usada en producción) es `window.print()` con estilos `@media print` — el usuario puede guardar como PDF directamente desde el diálogo de impresión del navegador.

#### [MODIFY] [RankingTable.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/dashboard/RankingTable.tsx)

- **Qué agregar**: Segundo botón "🖨️ Imprimir PDF" que abra el HTML generado en una ventana nueva y llame `window.print()` automáticamente.
- **Por qué**: Ya existe `handleGenerateReport` que genera el HTML. El botón de PDF simplemente abre ese HTML y dispara `window.print()` — misma función, distinto trigger.

---

## Ítem 5 — Nuevo Panel Interactivo de Exhibiciones en /supervision

> [!IMPORTANT]
> Este es un panel nuevo que reemplaza el "Reporte de Exhibiciones" legacy. Se implementa como un nuevo componente que se agrega debajo de `TabSupervision` en la página de supervisión.

### Estructura propuesta

Un componente `PanelExhibiciones.tsx` con las siguientes secciones:
1. **Filtros**: por vendedor (multiselect), por cliente (search), por estado (Aprobada/Rechazada/Pendiente/Destacada), por sucursal, rango de fechas.
2. **KPIs**: total exhibiciones, % aprobación, promedio por día, días desde última actividad.
3. **Tabla interactiva**: Paginada, con columnas ordenables. Click en fila expande el thumbnail de la imagen.
4. **Gráficos**: Evolución temporal (reutilizar el SVG del HTML report), top vendedores por sucursal.
5. **Exportar**: CSV y botón de "Imprimir/PDF".

### Archivos a tocar

#### [NEW] `src/components/admin/PanelExhibiciones.tsx`

- **Gestión de estado**: Todo con `useQuery` de TanStack. Un query base que trae el listado filtrado, y queries adicionales para KPIs.
- **Filtros locales**: `useState` para los filtros de UI (vendedor, fecha, etc.) que se convierten en `queryKey`.
- **Datos**: Usar el endpoint existente `fetchReporteExhibiciones` de `/lib/api.ts` (ya está) + `fetchReporteVendedores`, `fetchReporteSucursales`.
- **Animaciones**: Tabla con `AnimatePresence` al filtrar. KPIs con contador animado al cargar.

#### [NEW] `src/store/usePanelExhibicionesStore.ts`

- **Qué guardar**: Filtros seleccionados, página activa, columna/orden del sort. Con Zustand + persist para que sobreviva navegaciones.

#### [MODIFY] [page.tsx (supervision)](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/supervision/page.tsx)

- **Qué agregar**: Importar y renderizar `<PanelExhibiciones distId={distId} isSuperadmin={isSuperadmin} />` debajo de la sección de `TabSupervision`.

---

## Ítem 6 — Fix: Impresión del mapa de rutas en blanco

> [!NOTE]
> Bug conocido de WebGL + CSS Print. Tiene una solución estándar.

### Diagnóstico

El método `handlePrint` en `MapaRutas.tsx` (líneas 297–315) inyecta estilos CSS `@media print` pero el canvas de MapLibre (WebGL) no se imprime porque los navegadores no renderizan WebGL en print. El resultado: hoja en blanco.

### Solución

Capturar el mapa como imagen antes de imprimir usando `map.getCanvas().toDataURL('image/png')`, y en vez de hacer `window.print()` directamente:
1. Crear un `<img>` con el dataURL del canvas.
2. Abrir una ventana nueva con ese `<img>` y los marcadores como leyenda.
3. `window.print()` en esa ventana nueva.

### Archivos a tocar

#### [MODIFY] [MapaRutas.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/MapaRutas.tsx) — función `handlePrint` (líneas 297–315)

- **Qué cambiar**: Reemplazar la lógica actual por la captura del canvas. MapLibre tiene `map.getCanvas().toDataURL()` disponible. Hay que asegurar que el mapa tenga `preserveDrawingBuffer: true` en las opciones de inicialización (líneas 123–130) para que `toDataURL()` funcione.
- **Agregar al `new maplibregl.Map({})`**: La opción `preserveDrawingBuffer: true`.
- **Nueva función `handlePrint`**: 
  ```
  const canvas = map.getCanvas();
  const dataUrl = canvas.toDataURL('image/png');
  // Abrir ventana con <img src={dataUrl}> + leyenda de status + lista de PDVs visibles
  // window.print() sobre esa ventana
  ```
- **Por qué así**: Es la única forma confiable de imprimir un mapa WebGL sin depender de librerías externas.

---

## Ítem 7 — Centro de Comando: integrar el Mapa en Vivo

> [!NOTE]
> El mapa en vivo ya existe como funcionalidad en el backend (`fetchLiveMapEvents`). Se trata de mudarlo al centro de comando y modernizarlo.

### Estado actual

El "Centro de Comando" actualmente muestra salud del sistema (hardware, DB, sesiones). El mapa en vivo de exhibiciones estaba en alguna pantalla anterior y quedó obsoleto/desconectado.

### Qué hay disponible

- Backend: endpoint `GET /api/admin/live-map-events` que devuelve eventos de exhibición con lat/lng/timestamp.
- Frontend: la interfaz `LiveMapEvent` ya está definida en `api.ts` (líneas 187–198) y la función `fetchLiveMapEvents` ya existe (línea 728).
- Mapa: `MapaRutas.tsx` existe pero está diseñado para PDVs de rutas, no para eventos en tiempo real.

### Archivos a tocar

#### [NEW] `src/components/admin/MapaVivo.tsx`

- **Qué crear**: Componente de mapa liviano basado en MapLibre (similar a `MapaRutas`) pero configurado para mostrar eventos de exhibición en tiempo real.
- **Datos**: `useQuery({ queryKey: ['live-map-events', minutos], queryFn: () => fetchLiveMapEvents(minutos), refetchInterval: 30_000 })` — se auto-refresca cada 30 segundos sin necesidad de setInterval manual.
- **Visualmente**: Pins de color por distribuidora (para superadmin), con popup al hacer click que muestra distribuidor, vendedor, cliente, foto thumbnail si la hay.
- **Filtro**: Selector de "últimos X minutos" (30, 60, 180, 720 = 12h, "Hoy") que cambia el `queryKey` y re-fetcha.

#### [MODIFY] `src/app/admin/page.tsx` (o donde esté el panel de superadmin)

- **Qué agregar**: Dentro del panel de supervisión global, agregar una sección que renderice `<MapaVivo />`.
- **Nota**: Hay que identificar exactamente dónde está la pantalla del "centro de comando" — revisar si está en el `TabERP.tsx` o en otra tab del panel admin.

> [!WARNING]
> Necesitamos verificar exactamente dónde vive el "centro de comando" en la navegación antes de modificar. Puede ser parte de `TabSupervision` o una tab separada en el panel de admin superadmin.

---

## Ítem 8 — Ocultar la "Central de Reportes" obsoleta

> [!NOTE]
> Cambio mínimo de UI. Los reportes ahora se generan automáticamente desde el dashboard.

### Qué hay que encontrar

La "Central de Reportes" es probablemente la ruta `/reportes` que ya existe (`src/app/reportes/page.tsx` — 34KB de código). 

### Archivos a tocar

#### [MODIFY] Componente de navegación (Sidebar)

- **Qué cambiar**: Ocultar el link a `/reportes` del `Sidebar`. Pueden quedar las rutas en el router pero no visibles en la navegación.
- **Por qué**: No eliminar la ruta (podría haber links directos o datos que dependen de ella), solo ocultarla de la navegación.

#### Opcionalmente: `src/app/reportes/page.tsx`

- Agregar un banner de deprecación: `"Esta sección está en proceso de retiro. Los reportes están disponibles directamente en el Dashboard."` con link al dashboard.

---

## Orden de Ejecución Recomendado

| # | Ítem | Riesgo | Archivos tocados | Prerequisito |
|---|------|--------|-----------------|-------------|
| 1 | Bug Cuentas Corrientes Tabaco | 🔴 Alto | `api.py` (1 función) | Diagnóstico previo en DB |
| 8 | Ocultar Central Reportes | 🟢 Bajo | `Sidebar` | Ninguno |
| 6 | Fix Impresión Mapa | 🟡 Medio | `MapaRutas.tsx` | Ninguno |
| 2 | Número exhibiciones en pin | 🟡 Medio | `api.py`, `api.ts`, `TabSupervision`, `MapaRutas` | Ítem 1 para no pisar cambios |
| 3A | Dashboard → TanStack | 🟡 Medio | `dashboard/page.tsx`, nuevo store | Ninguno |
| 3B | Supervision → TanStack completo | 🟡 Medio | `TabSupervision.tsx`, store | Ítem 2 |
| 4 | Informe completo + PDF | 🟡 Medio | `generateRankingHTML.ts`, `RankingTable.tsx` | Ítem 3A |
| 5 | Panel Exhibiciones interactivo | 🔴 Alto | Nuevo componente, nuevo store, `supervision/page.tsx` | Ítems 3A y 3B |
| 7 | Centro de Comando + Mapa Vivo | 🔴 Alto | Nuevo `MapaVivo.tsx`, panel admin | Ítem 5 |

---

## Preguntas Abiertas

> [!IMPORTANT]
> Antes de ejecutar el Ítem 7, necesito confirmar: ¿Dónde exactamente vive el "Centro de Comando" en la UI? ¿Es una tab dentro del panel de superadmin (que está en `TabDistribuidoras`, `TabERP`, etc.)? ¿O es una página separada? Mirando el directorio, hay un `TabERP.tsx` de 17KB — ¿es ahí?

> [!IMPORTANT]
> Para el Ítem 2 (número de exhibiciones en el pin): ¿el "número de veces" que pedís es el **total histórico de todas las exhibiciones** de ese PDV, o solo las del período seleccionado (mes/semana)? Esto cambia la query SQL.

> [!NOTE]
> Para el Ítem 5 (Panel Exhibiciones): ¿querés que sea visible solo para superadmin o también para admin/supervisor? El endpoint de reportes ya tiene control de permisos.
