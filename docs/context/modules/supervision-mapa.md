# Supervisión — Mapa de rutas (My Maps)

## Archivos

- `components/admin/TabSupervision.tsx` — orquestador, toolbar, preload, objetivo por zona
- `components/admin/MapaRutas.tsx` — Google Maps, pins 4 estados, capas `google.maps.Data`
- `components/admin/map/` — `SupervisionMapToolbar`, `SupervisionPolygonDrawTool`, `CrearRutasPanel`, `SupervisionMapLayerPanel`, `ObjetivoPorZonaPanel`
- `hooks/useSupervisionMapPreload.ts` — precarga rutas/clientes sin encender visibilidad
- `store/useSupervisionStore.ts` — `mapToolMode`, `visibleCapaIds`, visibilidad vendedor/ruta/cliente
- `lib/supervisionMapHelpers.ts` — `isInactivo30`, fechas padrón

## Modos toolbar

| Modo | Uso |
|------|-----|
| `explorar` | Pins 4 estados, filtros, mostrar/ocultar vendedores |
| `objetivo_zona` | Polígono click-vértices → panel objetivos (activación, alteo, exhibición, ruteo) |
| `crear_rutas` | Polígono → guardar capa tenant-wide + anclaje manual a `rutas_v2` |

## Pins (4 estados)

`activo` | `activo_exhibicion` | `inactivo` | `inactivo_exhibicion`

- Activo: compra últimos 30d (`isInactivo30`)
- Exhibición: **`tiene_exhibicion_reciente === true`** (BE, ventana 30d calendario AR) — no usar `fecha_ultima_exhibicion != null`

## API capas planificación

- `GET/POST/PATCH/DELETE /api/supervision/mapa/capas/*`
- Tabla: `mapa_capas_planificacion` (migración `CenterMind/migrations/20260608_mapa_capas_planificacion.sql`)
- Service: `services/mapa_capas_service.py`

## Default UX

- Entrada al mapa: ningún vendedor visible (`visibleVends` vacío)
- Precarga background vendedores/rutas/clientes (React Query, stale 15 min)
- Dibujo: click = vértice, doble clic / botón = cerrar, ESC = cancelar (sin freehand)
