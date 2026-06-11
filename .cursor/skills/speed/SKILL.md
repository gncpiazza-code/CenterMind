---
name: speed
description: >-
  Audits a Shelfy portal module for perceived performance: TanStack Query cache,
  prefetch orchestration, localStorage persist, Zustand UI state, and desembarco
  (first paint). Use when the user invokes /speed, asks if cache/prefetch is wired,
  or reports slow filter transitions or stale data on screen while loading.
---

# /speed — Auditoría de velocidad y cache (portal Shelfy)

Revisá **un módulo concreto** que indique el usuario (o inferilo del contexto). No improvises: leé código y documentá gaps con evidencia.

## Input requerido

Si el usuario no nombró módulo, preguntá una vez:

- `dashboard` · `supervision` (CC o avance ventas) · `estadisticas` · `visor` · otro path `/app`

## Las 5 capas (checklist obligatorio)

Copiá y completá:

```
/speed — <módulo>
- [ ] TanStack Query — keys, staleTime, gcTime, placeholderData, invalidación
- [ ] Prefetch — T0 portal, hover, warm, cambio de filtros
- [ ] Cache local — PersistQueryClient / shouldDehydratePortalQuery
- [ ] Zustand — qué UI persiste vs qué vive en TanStack
- [ ] Desembarco — skeleton / overlay / stale-while-revalidate en first load y transiciones
```

## Dónde mirar (repo)

| Capa | Archivos canónicos |
|------|-------------------|
| Orquestador T0–T3 | `shelfy-frontend/src/hooks/usePortalCacheOrchestrator.ts` |
| Prefetch por módulo | `shelfy-frontend/src/lib/portal-cache-queries.ts` |
| Persist localStorage | `shelfy-frontend/src/lib/portal-cache-persist.ts`, `portal-cache-config.ts` |
| TTL global | `shelfy-frontend/src/lib/query-cache-constants.ts` |
| Query keys | `shelfy-frontend/src/lib/query-keys.ts` |
| Mapa módulos | [reference.md](reference.md) |

## Criterios por capa

### 1) TanStack Query

- ¿Query keys incluyen **todos** los filtros que cambian el payload (dist, sucursal, vendedor, período)?
- ¿`staleTime` / `gcTime` documentados y alineados al costo del endpoint?
- ¿`keepPreviousData` / `isPlaceholderData` tienen **feedback visual** (no datos viejos sin indicador)?
- ¿Invalidación ante sync-status / ingestas (patrón `last_attempt_at`)?

### 2) Prefetch

- ¿T0 al entrar a la ruta (`prefetchPortalModule`)?
- ¿Prefetch usa **filtros persistidos** (no solo default `null/null`)?
- ¿Warm secundario solo donde aporta (no N requests pesados por cada cambio de filtro)?
- ¿Hover/intent antes de navegar (BottomNav, toggles)?

### 3) Cache local (persist)

- ¿La query está en `shouldDehydratePortalQuery` si el desembarco offline importa?
- ¿`maxAge` / `buster` coherentes con `BUNDLE_GC_MS`?
- ¿Datos vacíos o `revalidating` **no** se persisten?

### 4) Zustand

- ¿Solo estado de UI/filtros en store — **nunca** payload API grande?
- ¿`partialize` explícito (qué se guarda y qué no, ej. fecha ancla “hoy”)?
- ¿Lectura sin React para prefetch (`read*Persisted` helpers)?

### 5) Desembarco

- **First load sin cache:** skeleton o shell dedicado
- **Con cache persistido / prefetch:** paint rápido + revalidate silencioso si aplica
- **Cambio de filtro:** overlay o spinner; KPIs en skeleton; `pointer-events-none` en contenido stale
- ¿Paridad con módulos referencia (dashboard bundle `meta.revalidating`)?

## Módulo referencia: Supervisión → Avance ventas

Patrón objetivo ya implementado en repo:

- Hook: `hooks/useAvanceVentasQuery.ts`
- Persist filtros: `lib/supervision-panel-persist.ts`
- Persist RQ: `portal-cache-persist.ts` → `supervision-panel/avance-ventas/*`
- Store: `store/useSupervisionPanelStore.ts`
- Panel loading: `components/supervision/avance/SupervisionAvanceVentasPanel.tsx`
- Doc: `docs/context/modules/supervision-avance-ventas.md`

## Formato de salida

```markdown
## /speed — <módulo>

### Resumen
1–2 oraciones: ¿está “trabajado” o qué falta?

### Matriz
| Capa | Estado | Notas |
|------|--------|-------|
| TanStack | ✅/⚠️/❌ | … |
| Prefetch | … | … |
| Cache local | … | … |
| Zustand | … | … |
| Desembarco | … | … |

### P0 (si hay)
- Acción concreta + archivo

### P1 / nice-to-have
- …
```

## Reglas

- **ANALYSIS + fixes mínimos** si el usuario pidió arreglar; si solo /speed, informe primero.
- No mezclar API payload en Zustand.
- No `placeholderData` sin UI de transición.
- Tras cambios de cache, verificar `npm run build` en `shelfy-frontend/`.
- Actualizar `docs/context/modules/<módulo>.md` si tocás contrato de cache.
