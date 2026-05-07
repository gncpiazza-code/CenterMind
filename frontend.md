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
- Compania: periodo mensual con prorrateo semanal/diario.
- Kanban + timeline + stats + print.
- En el modal de alta, `fecha limite` es obligatoria para origen distribuidora.
- `Tasa de pendientes` se muestra debajo del bloque contextual del tipo y antes del selector de fecha.
- La card de compania muestra avance semanal y diario en todas las semanas/dias del mes (no solo futuros).
- El progreso mostrado en card y desglose de compañía usa el mismo `visualActual` para evitar desfasajes entre barras.

### `visor/page.tsx`

- Layout de 3 paneles en desktop.
- Atajos de teclado para evaluar/navegar.
- Filtro por sucursal y foco en imagen.

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
