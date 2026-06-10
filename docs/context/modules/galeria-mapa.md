# Galería de Exhibiciones — Visor

## Archivos

- `components/galeria/GaleriaExhibicionViewer.tsx` — visor principal (carousel + timeline)
- `components/galeria/GaleriaPublicationCarousel.tsx` — carrusel de fotos por publicación
- `components/galeria/GaleriaExhibicionTimeline.tsx` — strip horizontal de visitas PDV
- `components/galeria/ReevaluarCompaniaSheet.tsx` — bottom sheet re-evaluación compañía
- `lib/galeria-queries.ts` — query keys + helpers fetch (paginado)
- `lib/galeria-publicaciones.ts` — tipos `GaleriaPublicacion`, `GaleriaTimelineItem`

## API timeline

```
GET /api/galeria/cliente/{id}/timeline
  ?dist_id=&offset=&limit=&has_more
  limit recomendado: 120
```

Respuesta: `{ items: GaleriaTimelineItem[], has_more: boolean }`

`fetchAllGaleriaTimeline(idCliente, distId, idVendedor?)` en `galeria-queries.ts` itera automáticamente hasta `has_more=false` o 2000 items.

## Keys de React Query

```ts
galeriaKeys.all                              // invalidación global
galeriaKeys.timeline(distId, id, vend?)      // timeline filtrado (carrusel)
galeriaKeys.timelineFull(distId, id, vend?)  // timeline sin filtro (strip)
```

## Navegación sin race-condition (G1)

- `pendingInitRef = useRef(true)` — se resetea con cada cambio de `idCliente`
- La inicialización al último ítem solo ocurre una vez por cliente (primera vez que llegan datos)
- `externalPubIdxRef` en `GaleriaPublicationCarousel`: ignora re-sync si el valor externo no cambió realmente (evita que cambio interno de `pubIdx` provoque override vía efecto)

## Strip timeline (G3/G4)

- `GaleriaExhibicionTimeline` recibe `publicaciones` (lista completa unfiltered) + `activePubIdx` (índice en lista completa)
- El visor mantiene `publicacionesFull` (de `timelineFull`) y calcula `activeTimelineIdx = publicacionesFull.findIndex(p => p.dia_ar === currentPub.dia_ar)`
- Al hacer clic en un ítem del strip, se busca el `dia_ar` en la lista filtrada del carrusel para navegar correctamente
- Solo se renderiza si `publicaciones.length > 1`
- Auto-scroll del ítem activo con `scrollIntoView({ inline: "center" })`

## Z-index sheet (G2)

- `ReevaluarCompaniaSheet`: `overlayClassName="z-[99]"`, content `z-[100]`
- El visor `GaleriaExhibicionViewer` usa `z-[80]`; sin los overrides el sheet quedaba detrás
- `SheetContent` acepta prop `overlayClassName` para controlar el overlay por instancia

## Colores timeline (ESTADO_DOT)

| Estado | Color |
|--------|-------|
| Aprobada/Aprobado | emerald-400 |
| Destacada/Destacado | amber-400 |
| Rechazada/Rechazado | red-400 |
| Pendiente / default | white/35 |
