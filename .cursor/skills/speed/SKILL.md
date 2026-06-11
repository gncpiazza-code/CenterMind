---
name: speed
description: >-
  Audits a Shelfy portal module for perceived performance across 8 layers:
  TanStack Query, prefetch, localStorage persist, Zustand, desembarco, JS delivery,
  runtime UI, platform/third-party, and observability. Use when the user invokes
  /speed, asks if cache/prefetch is wired, reports slow filter transitions, or
  reviews Vercel Speed Insights (LCP, INP, RES).
---

# /speed — Auditoría de velocidad (portal Shelfy — 8 capas)

Revisá **un módulo concreto** que indique el usuario (o inferilo del contexto). No improvises: leé código y documentá gaps con evidencia.

## Input requerido

Si el usuario no nombró módulo, preguntá una vez:

- `dashboard` · `supervision` (CC o avance ventas) · `modo-mapa` · `login` · `estadisticas` · `visor` · otro path `/app`

## Las 8 capas (checklist obligatorio)

### A — Datos (capas originales)

```
/speed — <módulo>
A1 [ ] TanStack Query — keys, staleTime, gcTime, placeholderData, invalidación
A2 [ ] Prefetch — T0 portal, hover, warm, cambio de filtros, route-chunk
A3 [ ] Cache local — PersistQueryClient / shouldDehydratePortalQuery
A4 [ ] Zustand — qué UI persiste vs qué vive en TanStack
A5 [ ] Desembarco — skeleton / overlay / stale-while-revalidate
```

### B–E — Runtime y plataforma

```
B  [ ] Entrega JS — dynamic import, route chunks, shared bundles (`npm run analyze`)
C  [ ] Runtime UI — re-renders, memo, startTransition, virtualización, animaciones
D  [ ] Plataforma — Google Maps/MapLibre, WebSocket invalidations, imágenes, fuentes
E  [ ] Observabilidad — RES/LCP/INP por ruta (Speed Insights), budgets post-deploy
```

## Dónde mirar (repo)

| Capa | Archivos canónicos |
|------|-------------------|
| Orquestador T0–T3 | `shelfy-frontend/src/hooks/usePortalCacheOrchestrator.ts` |
| Prefetch por módulo | `shelfy-frontend/src/lib/portal-cache-queries.ts` |
| Route-chunk + alias | `shelfy-frontend/src/lib/portal-cache-config.ts` (`ROUTE_CHUNK_BUNDLE_ALIASES`) |
| Persist localStorage | `shelfy-frontend/src/lib/portal-cache-persist.ts`, `portal-cache-config.ts` |
| TTL global | `shelfy-frontend/src/lib/query-cache-constants.ts` |
| Query keys | `shelfy-frontend/src/lib/query-keys.ts` |
| Map preload defer | `shelfy-frontend/src/hooks/useSupervisionMapPreload.ts` |
| Mapa módulos | [reference.md](reference.md) |

## Criterios por capa

### A1) TanStack Query

- ¿Query keys incluyen **todos** los filtros que cambian el payload (dist, sucursal, vendedor, período)?
- ¿`staleTime` / `gcTime` documentados y alineados al costo del endpoint?
- ¿`keepPreviousData` / `isPlaceholderData` tienen **feedback visual** (no datos viejos sin indicador)?
- ¿Invalidación ante sync-status / ingestas (patrón `last_attempt_at`)?

### A2) Prefetch

- ¿T0 al entrar a la ruta (`prefetchPortalModule`)?
- ¿Route-chunk T1 para rutas pesadas sin bundle (`/modo-mapa` → alias `supervision`)?
- ¿Prefetch usa **filtros persistidos** (no solo default `null/null`)?
- ¿Hover/intent antes de navegar (BottomNav, TopModeTabs)?

### A3) Cache local (persist)

- ¿La query está en `shouldDehydratePortalQuery` si el desembarco offline importa?
- ¿`maxAge` / `buster` coherentes con `BUNDLE_GC_MS`?
- ¿Datos vacíos o `revalidating` **no** se persisten?

### A4) Zustand

- ¿Solo estado de UI/filtros en store — **nunca** payload API grande?
- ¿`partialize` explícito (qué se guarda y qué no, ej. fecha ancla “hoy”)?
- ¿Lectura sin React para prefetch (`read*Persisted` helpers)?

### A5) Desembarco

- **First load sin cache:** skeleton o shell dedicado
- **Con cache persistido / prefetch:** paint rápido + revalidate silencioso si aplica
- **Cambio de filtro:** overlay o spinner; KPIs en skeleton; `pointer-events-none` en contenido stale
- ¿Paridad con módulos referencia (dashboard bundle `meta.revalidating`)?

### B) Entrega JS

- ¿Monolitos importados síncrono (`TabSupervision` en modo-mapa)? → `dynamic(..., { ssr: false })`
- ¿Chunk compartido entre rutas hermanas?
- Budget orientativo: revisar con `ANALYZE=true npm run build`

### C) Runtime UI

- ¿Tablas largas sin virtualización (CC, avance)?
- ¿Animaciones continuas (`setInterval`, framer-motion) en rutas críticas?
- ¿Filtros pesados envueltos en `startTransition`?

### D) Plataforma

- ¿Preload de PDVs compite con Google Maps LCP? → diferir post-`isGoogleMapsAlreadyLoaded`
- ¿WebSocket invalida demasiado agresivo (dashboard, visor, topbar)?
- ¿Login carga orchestrator T0–T3? → skip en `/login`
- ¿Imágenes LCP con `fetchPriority="high"`?

### E) Observabilidad

- Vercel Speed Insights: RES, LCP, INP por ruta + filtro por deployment
- Comparar P75 pre/post fix (48h)
- Playwright smoke como regresión funcional post-cambio cache

## Módulo referencia: Supervisión → Avance ventas

Patrón objetivo ya implementado en repo:

- Hook: `hooks/useAvanceVentasQuery.ts`
- Persist filtros: `lib/supervision-panel-persist.ts`
- Persist RQ: `portal-cache-persist.ts` → `supervision-panel/avance-ventas/*`
- Store: `store/useSupervisionPanelStore.ts`
- Panel loading: `components/supervision/avance/SupervisionAvanceVentasPanel.tsx`
- Doc: `docs/context/modules/supervision-avance-ventas.md`

## Módulo referencia: Modo mapa (runtime)

- Page: `app/modo-mapa/page.tsx` — `dynamic(TabSupervision)`
- Alias bundle: `ROUTE_CHUNK_BUNDLE_ALIASES["/modo-mapa"] = "supervision"`
- Map preload defer: `useSupervisionMapPreload.ts`

## Formato de salida

```markdown
## /speed — <módulo>

### Resumen
1–2 oraciones: ¿está “trabajado” o qué falta?

### Matriz (8 capas)
| Capa | Estado | Notas |
|------|--------|-------|
| A1 TanStack | ✅/⚠️/❌ | … |
| A2 Prefetch | … | … |
| A3 Cache local | … | … |
| A4 Zustand | … | … |
| A5 Desembarco | … | … |
| B Entrega JS | … | … |
| C Runtime UI | … | … |
| D Plataforma | … | … |
| E Observabilidad | … | … |

### P0 (si hay)
- Acción concreta + archivo

### P1 / nice-to-have
- …
```

## Reglas

- **ANALYSIS + fixes mínimos** si el usuario pidió arreglar; si solo /speed, informe primero.
- No mezclar API payload en Zustand.
- No `placeholderData` sin UI de transición.
- Tras cambios de cache o routing, verificar `npm run build` en `shelfy-frontend/`.
- Actualizar `docs/context/modules/<módulo>.md` si tocás contrato de cache.
