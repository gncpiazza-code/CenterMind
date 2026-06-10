# Supervisión — Avance de Ventas (Analytics)

**Desde:** 2026-06-10 · **Pantalla:** `/supervision` (toggle CC | Avance) · **Sin importes $ en UI.**

## Qué es

Seguimiento operativo de ventas en **volumen** (bultos + unidades) para el supervisor,
alternable con Cuentas Corrientes en la misma pantalla. Fuente: `ventas_enriched_v2`
(Informe de Ventas Consolido, ingestas 09:30 / 13:00 / 17:00 / 21:00 AR).

## Backend

| Pieza | Path |
|-------|------|
| Service | `CenterMind/services/avance_ventas_service.py` |
| Endpoint principal | `GET /api/supervision/avance-ventas/{dist_id}?modo&fecha&sucursal&vendedor` |
| Drill lazy | `GET /api/supervision/avance-ventas/{dist_id}/sku/{cod}/clientes` |
| Tests | `CenterMind/test_avance_ventas_service.py` (21 tests) |
| Fixture shape | `docs/fixtures/avance-ventas-sample.json` (local, dir gitignored) |

### Reglas de agregación (NO NEGOCIABLE)

1. `anulado=false` + `build_ventas_read_context` / `apply_ventas_tenant_filters` / `filter_ventas_rows_for_tenant` (aislamiento tenant + franquicias Real).
2. Dedupe `_dedupe_ventas_enriched_lines` + orden estable `_ventas_enriched_query_order` antes de `.range(1000)`.
3. Solo líneas `_es_operacion_bultos_neto` (ventas + devoluciones netas; excluye recibos). **Devoluciones restan** (bultos signed).
4. Unidades: encendedor → 1 bulto = 1 unidad (signed); líneas convertidas (`volumen_es_convertido`: cig/papelillo/mix) → `unidades_total`; resto 0.
5. Vendedor display vía `_get_erp_name_map`; nombre vacío / "Sin Vendedor" → bucket **"Sin vendedor"** (filtro `__sin_vendedor__`).
6. Sucursal: mismo criterio que `supervision_ventas` (`_vendor_display_names_for_sucursal_erp`, import lazy desde el router) + fallback texto en `ruta`/`agrupacion_art_1`.
7. **No** se filtran vendedores QA tabaco (decisión usuario).

### Periodos y comparativas

| Modo | Rango | Referencias |
|------|-------|-------------|
| `dia` | fecha ancla | WoW = −7d (mismo weekday) · MoM = mismo día −1 mes (clamp 31→fin de mes) |
| `semana` | lun–sáb AR de la semana que contiene fecha | semana lun–sáb anterior |
| `mes` | mes calendario | mes anterior completo |

`periodo.parcial=true` si el rango incluye hoy → banner ámbar FE. Referencia sin datos →
`DeltaKpi.disponible=false` ("Sin dato" en UI, nunca %).

### Performance

- Drill clientes precalculado solo **top 20 SKUs** (`DRILL_TOP_SKUS`); resto vía endpoint lazy.
- Ranking cap 150 SKUs · heatmap top 15 · payload sin raw lines.
- Penetración: `clientes / cartera_scope` (PDVs padrón visible del scope, count exact); null si no resoluble.

## Frontend

| Pieza | Path |
|-------|------|
| Panel | `components/supervision/avance/SupervisionAvanceVentasPanel.tsx` |
| Toggle | `components/supervision/SupervisionModeToggle.tsx` (store `viewMode`) |
| Periodo | `components/supervision/AvanceVentasPeriodSelector.tsx` (sin rango libre) |
| Badge sync | `components/supervision/VentasSyncStatusBadge.tsx` (`syncStatus.ventas` + `next_run_hint`) |
| Hook | `hooks/useAvanceVentasQuery.ts` (stale 5min, `keepPreviousData`, invalida al cambiar `ventas.last_updated`) |
| Formato | `lib/avance-ventas-format.ts` (es-AR, semanas lun–sáb, meses) |
| Query key | `supervisionPanelKeys.avanceVentas(dist, modo, fecha, sucursal, vendedor)` |

- Filtros sucursal/vendedor **compartidos** con CC (`useSupervisionPanelStore`); opción "Sin vendedor" solo visible en modo avance y se resetea al volver a CC (`setViewMode`).
- Mobile (layout C): KPIs 2×2 + 1 gráfico principal (donut consolidado / top SKUs vendedor) + tabla → Sheet drill; scatter/heatmap solo `lg+`.
- Export CSV: ranking visible + clientes del drill (separador `;`, BOM, decimales coma).
- Subir = verde (inverso a CC deuda).

## Fuera de scope (no tocar desde este módulo)

`TabSupervision.tsx` · `/modo-mapa` · `/estadisticas` · `/reportes` · UI legacy de `GET /api/supervision/ventas/{dist_id}` (incluye $).
