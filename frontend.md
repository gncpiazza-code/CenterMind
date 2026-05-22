# Frontend Design System — Shelfy (Lean)

Guia compacta para implementaciones UI en el portal Shelfy.

## Stack UI

- Next.js 16 App Router + React 19 + TypeScript 5.9
- Tailwind CSS 4 + shadcn/ui
- TanStack Query v5 + Zustand
- Recharts + Google Maps JS API

## Tema Visual (Light-Violet)

Principios:

- Tema claro por defecto.
- Violeta como acento principal.
- Contraste alto para lectura operativa.
- Evitar hex hardcodeado en componentes.

Tokens clave:

- `--shelfy-bg`: fondo principal
- `--shelfy-panel`: panel glass claro
- `--shelfy-primary`: acciones primarias
- `--shelfy-text`: texto principal
- `--shelfy-success|warning|error`: estados semanticos

## Reglas UI No Negociables

- Fetch solo via `src/lib/api.ts`.
- Permisos solo via `hasPermiso(...)`.
- Estados de servidor con TanStack Query, no fetch directo en componentes.
- Usar `DatePicker` (no `input type="date"`).
- En rutas operativas: **Dia -> Ruta** (nunca al reves).
- En objetivos: mostrar PDV como `#id_cliente_erp + nombre` y razon social secundaria.
- En mapas: no usar `transform: scale()` para animar marcadores.

## Componentes Criticos

### `TabSupervision.tsx`

- Tabs: mapa, ventas, cuentas.
- Query keys con `distId`.
- Modo mobile con switch `Mapa / Vendedores`.
- Matching de deudas prioriza `id_cliente` y `id_cliente_erp`.

### `MapaRutas.tsx`

- Google Maps API + `InfoWindow`.
- `fitBounds({ animate: false })`.
- `ResizeObserver` para evitar drift visual al cambiar layout.

### `objetivos/page.tsx`

- Modos por tipo con dualidad general vs universo explicito.
- Kanban 4 columnas: `planificado | pendiente | en_progreso | terminado`.
- `planificado` = `lanzado_at IS NULL && !cumplido`; color slate, icono `CalendarDays`.
- Timeline + stats + print.
- En el modal de alta, `fecha limite` es obligatoria para origen distribuidora.
- `fecha_inicio` (DATE): si > hoy, objetivo queda planificado sin notificación Telegram al crearlo.
- `descripcion` es obligatoria ≥5 chars; `buildPhrase()` eliminado del flujo.
- `Tasa de pendientes` se muestra debajo del bloque contextual del tipo y antes del selector de fecha.
- Filtros de fecha: `filterFechaDesde` / `filterFechaHasta` en Zustand store, aplicados sobre `fecha_inicio ?? fecha_objetivo`.

**KanbanCard (2026-05-22):** minimalista — solo badges tipo/origen, dias restantes, nombre vendedor, barra progreso, fechas inicio/fin. Sin `descripcion`, sin accordion, sin prorrateo inline. Click → `ObjetivoDetalleModal`.

### `componentes/objetivos/ObjetivoDetalleModal.tsx` (nuevo 2026-05-22)

- Dialog shadcn centrado, overlay oscuro, ESC/click-fuera cierra.
- Contiene: `ObjetivoResumen` + barra progreso + `ObjetivoProrrateoCalendario` + lista PDVs + acciones (Lanzar/PDF/reagendar).
- Recibe `onLanzar`, `onReagendar`, `onDownloadCertificado`, `onOpenRuteoPdf` como props.

### `componentes/objetivos/ObjetivoResumen.tsx` (nuevo 2026-05-22)

- Muestra tipo, origen, meta, fechas, instrucción por tipo.
- Si `descripcion` es payload Telegram crudo (`isTelegramObjectiveMessage`), no la renderiza.

### `componentes/objetivos/ObjetivoProrrateoCalendario.tsx` (nuevo 2026-05-22)

- Grilla lun-sáb por semana. Celda: pasado=avance/meta con color, futuro=meta esperada, pre-inicio=N/A.
- **Compañía:** mes_referencia; alteo/activación sin retro (startEffective desde created_at).
- **Distribuidora:** rango max(fecha_inicio, lanzado_at, created_at) → fecha_objetivo; sin retroactividad.
- Fuente de datos: `desglose_cache.progreso_diario` si existe; fallback promedio uniforme.

### `lib/objetivo-utils.ts` (nuevo 2026-05-22)

- `isTelegramObjectiveMessage(desc)`: detecta payload Telegram crudo.
- `periodoProrrateo(obj)`: calcula `DiaHabil[]` para compañía y distribuidora.
- No tiene efectos secundarios; reutilizable en cualquier componente.

### `objetivos/LanzarObjetivoDialog.tsx`

- `Dialog` (no AlertDialog) con props: `objetivo, open, loading, onConfirm, onCancel`.
- Muestra: vendedor, tipo, fecha_inicio programada, aviso Telegram.
- Botones: Cancelar (autoFocus) / Confirmar y enviar (violet, `Rocket` icon).
- Aviso ámbar: "Se enviará un mensaje al grupo de Telegram del vendedor de forma inmediata."

### `visor/page.tsx`

- Layout de 3 paneles en desktop.
- Atajos de teclado para evaluar/navegar.
- Filtro por sucursal y foco en imagen.

### `galeria/ReevaluarCompaniaSheet.tsx` + `SlideToConfirm.tsx`

- Solo visible si `canReevaluarCompania` (superadmin / directorio).
- `SlideToConfirm`: control drag-to-confirm con pointer events y fill track animado.
- `ReevaluarCompaniaSheet`: Sheet bottom, selector de estado (3 opciones), textarea motivo mín 20 chars, slide-to-confirm, invalidate query `galeria-timeline` y `ranking-compania`.
- `ExhibicionesTimelineDialog` recibe prop `canReevaluarCompania` y renderiza historial + botón por card.

### `dashboard/RankingCompaniaCompare.tsx`

- Tabla dual: puntos compañía vs oficial, delta con `TrendingUp`/`TrendingDown`.
- Solo se monta en `dashboard/page.tsx` si `isCompania` (superadmin / directorio).
- Query key: `["ranking-compania", distId, periodo, sucursalId]`.

### `admin/tickets/page.tsx`

- Centro de tickets superadmin estilo tabla (usuario, asunto, dist, categoría, criticidad automática, estado, fecha).
- Filtros: categoría, estado, distribuidora, criticidad (`baja`–`critica`), búsqueda texto.
- Export JSON con los mismos filtros.
- Fila clickable abre Sheet de detalle: mensaje completo + análisis IA (Gemini) automático al abrir (`pre-resolucion`) + responder.
- Críticos heurísticos en listado; IA refina etiqueta corta + criticidad + pasos sobre el repo Shelfy embebidos en prompt.

## shadcn/ui

Uso obligatorio de primitives existentes:

- `Button`, `Card`, `Input`, `Label`, `Select`, `Dialog`, `Sheet`, `Alert`
- `Tabs`, `Progress`, `Tooltip`, `Popover`, `DropdownMenu`, `Sonner`
- `Table`, `Checkbox`, `Skeleton`, `ScrollArea`, `Avatar`, `Badge`

Reglas:

- `cn()` para combinacion de clases.
- `Avatar` con `AvatarFallback`.
- `Dialog`/`Sheet` siempre con `Title`.
- `toast()` de `sonner` para feedback.

## Navegacion

- Sidebar desactivado para operacion normal.
- Herramientas superadmin expuestas en `Topbar`.
- `TopModeTabs` + `BottomNav` como navegacion principal de modulos.

## Calidad y Performance

- Evitar estado derivado duplicado.
- Limitar animaciones pesadas en tablas de alto volumen.
- Limpiar timers/subscripciones en `useEffect`.
- Usar `Skeleton` en cargas y `Alert` en errores.

## Contratos Frontend que no romper

- `api.ts` como fuente unica de tipos y funciones.
- Query keys de supervision y objetivos incluyen `distId`.
- Compatibilidad con `/api/ws/superadmin` para notificaciones operativas.

## Objetivos — Convenciones del Modal

- Switch (no checkbox) para "Objetivo general para la FDV" (`@/components/ui/switch`).
- El resumen "Objetivo generado" va **al final** del formulario, encima de los botones Crear/Cancelar.
- `buildPhrase(overrideVendorName?)`: el argumento es requerido en bulk FDV para generar frases individuales por vendedor.
- `tasa_pendientes` visible solo con PDVs explícitos (`showTasaPendientes`); se limpia automaticamente al ocultarse.
- `vendedoresFiltrados` excluye buckets (sin vendedor, supervisor) antes de mostrar en modal.
