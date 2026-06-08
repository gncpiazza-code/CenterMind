# Frontend Shelfy (Lean)

Detalle por pantalla: `docs/context/modules/`

## Stack UI

Next.js App Router · React 19 · Tailwind 4 · shadcn/ui · TanStack Query · Zustand · Recharts · Google Maps (supervisión) · MapLibre (galería)

## Tema Light-Violet

Tokens: `--shelfy-bg`, `--shelfy-panel`, `--shelfy-primary`, `--shelfy-text`, `--shelfy-success|warning|error` — evitar hex sueltos.

## Reglas no negociables

- Fetch/tipos: `src/lib/api.ts`
- Permisos: `hasPermiso()`
- Server state: TanStack Query (no fetch crudo en componentes)
- Fechas: `DatePicker`
- Rutas operativas: **Día → Ruta**
- PDV en UI: `#id_cliente_erp + nombre`
- Mapas: no `transform: scale()` en pins

## shadcn

Usar primitives existentes; `cn()`; `Dialog`/`Sheet` con `Title`; feedback `sonner`.

## Navegación

Topbar + TopModeTabs + BottomNav (sidebar desactivado en operación normal).

## Pantallas — punteros

| Pantalla | Doc / archivos |
|----------|----------------|
| Dashboard | `modules/dashboard.md` · `components/dashboard/*` |
| Supervisión mapa | `modules/supervision-mapa.md` · `TabSupervision`, `MapaRutas`, `map/*` · modos `explorar` / `objetivo_zona` / `crear_rutas` |
| Objetivos | `modules/objetivos.md` · `app/objetivos/page.tsx` |
| Galería | `modules/galeria-mapa.md` · `app/galeria-exhibiciones/` |
| Visor | `modules/visor-glass.md` · `app/visor/` |
| Estadísticas | bundle sin sucursal en key · `lib/estadisticas-filter.ts` |

## Objetivos FE (resumen)

- Kanban 4 cols · `ObjetivoDetalleModal` al click card
- `resolveObjetivoMes()` filtro mes · Switch FDV · fecha límite obligatoria dist
- Utils: `lib/objetivo-utils.ts`

## Contratos

- Query keys incluyen `distId`
- WS superadmin para tickets
- Fechas AR: `lib/fecha-ar.ts`

## Calidad

Skeleton en load · limpiar timers en useEffect · limitar animaciones en tablas grandes
