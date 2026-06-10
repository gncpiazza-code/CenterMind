# Supervisión — Mapa de rutas (My Maps)

## Archivos

- `components/admin/TabSupervision.tsx` — orquestador, toolbar, preload, objetivo por zona
- `components/admin/MapaRutas.tsx` — Google Maps, pins 4 estados, capas `google.maps.Data`
- `components/admin/map/SupervisionMapShell.tsx` — layout integrado (mapa rellena área, chrome flota)
- `components/admin/map/SupervisionMapView.tsx` — wrapper memo; acepta `integratedMap` y `mapChromeTop`
- `components/admin/map/SupervisionMapToolbar.tsx` — toolbar; variante `glass` = overlay backdrop-blur
- `components/admin/map/` — `SupervisionPolygonDrawTool`, `CrearRutasPanel`, `SupervisionMapLayerPanel`, `ObjetivoPorZonaPanel`
- `hooks/useSupervisionMapPreload.ts` — precarga rutas/clientes sin encender visibilidad
- `store/useSupervisionStore.ts` — `mapToolMode`, `visibleCapaIds`, visibilidad vendedor/ruta/cliente
- `lib/supervisionMapHelpers.ts` — `isInactivo30`, fechas padrón

## Layout integrado (`mapOnly` / `/modo-mapa`)

Cuando `mapOnly=true` (página `/modo-mapa`) el mapa rellena toda el área bajo el Topbar sin card ni padding:

```
SupervisionMapShell
  ├── [z-0] div absolute inset-0  → MapaRutas (mapa canvas)
  ├── [z-30] SupervisionMapToolbar glass  → chrome backdrop-blur (h=52px)
  └── [z-20] vendor dock  → slide translateX(-100%/0) desde la izquierda
```

- `SupervisionMapShell` recibe `chrome`, `dock`, `dockOpen`, `dockWidth` (288px default)
- `mapChromeTop = 52` — height del chrome en px; overlays del mapa usan `topOffset = integratedMap ? mapChromeTop : 0`
- `integratedMap={true}` en `SupervisionMapView` / `MapaRutas` → oculta botón fullscreen, suprime draw bar, ajusta posiciones
- El vendor dock reutiliza el mismo `vendorPanelContent` que el fullscreen overlay (lista de vendedores con checkboxes)
- Estado: `vendorDockOpen` (boolean) + `showAllProgress` (`{ done, total } | null`) en `TabSupervision`

### Toolbar glass props (nuevas)

| Prop | Tipo | Uso |
|------|------|-----|
| `glass` | boolean | Variante overlay (absolute, backdrop-blur, z-30) |
| `sucursalSlot` | ReactNode | Selector de sucursal renderizado al inicio del chrome |
| `vendorsDockOpen` | boolean | Estado del dock de vendedores |
| `onVendorsDockToggle` | () => void | Toggle del dock |
| `showAllProgress` | `{done,total}\|null` | Spinner+contador durante "Mostrar todos" |

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
- Dibujo: click = vértice, clic en vértice 0 (≥3 vértices) = cerrar, ESC = cancelar (sin freehand)

## Pins en modo dibujo (M1)

- Al entrar en `routeBuildEnabled`, pins no se eliminan (`setMap(null)` reemplazado)
- Pins en modo dibujo: `opacity: 0.35` (translúcido, referencia visual)
- Al salir de modo dibujo: `opacity: 1` restaurado
- Skip anti-flicker (M2): si ≤600 pins, no se aplica opacity 0.15 en drag (sin coste visible)

## Panel UI inferior (M3)

- Columna izquierda única (`bottom: 12, left: panelOffset + 12`, `transition: left 0.2s`)
- Orden: LayerPanel (arriba, scrollable) → FilterLegend → MapLegendTooltip
- El antiguo botón "Dibujar Zona" fullscreen fue eliminado (la toolbar lateral gestiona el modo)

## Polígono — cierre por vértice (M4)

- Vértice 0 es `clickable: true`, `cursor: "pointer"`
- Al alcanzar 3 vértices, el ícono del vértice 0 aumenta (scale 13, strokeWeight 4) como hint visual
- Clic en vértice 0 con ≥3 vértices llama `finishPolygon()` directamente
- `SupervisionPolygonDrawTool.ts` → función `addVertexMarker(latLng, index, onClose?)`

## MarkerClusterer (FE-5)

- Activación automática cuando `filteredPines.length > 800 && mapToolMode === 'explorar'`
- Paquete: `@googlemaps/markerclusterer` v2 (ya instalado)
- `clustererRef` en `MapaRutas`; efecto separado en `[filteredPines.length, mapToolMode, mapLoaded, pinDataSyncKey]`
- Al desactivar: `clearMarkers()` + `setMap(null)` + restaurar visibilidad individual de markers

## FitBounds

- Extraído a efecto propio `[pineIdsKey, mapLoaded]` (separado del efecto de sync de marcadores)
- `fittedRef` previene re-fit en re-renders; se resetea cuando `pineIdsKey` cambia
- Si solo hay 1 pin: `map.setZoom(14)` tras `fitBounds`
