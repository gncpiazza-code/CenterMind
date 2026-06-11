# Supervisión — Avance de Ventas (Analytics)

**Desde:** 2026-06-10 · **Refactor:** 2026-06-11 · **Pantalla:** `/supervision` (toggle CC | Avance) · **Sin importes $ en UI.**

## Qué es

Seguimiento operativo de ventas en **volumen** (bultos + unidades) para el supervisor,
alternable con Cuentas Corrientes en la misma pantalla. Fuente: `ventas_enriched_v2`
(Informe de Ventas Consolido, ingestas 09:30 / 13:00 / 17:00 / 21:00 AR).

Catálogo SKU: distintos últimos **12 meses** left-join ventas del período (filas sin venta con ceros).
Auditoría cliente×SKU integrada para corroborar números sin salir de la pantalla.

## Backend

| Pieza | Path |
|-------|------|
| Service | `CenterMind/services/avance_ventas_service.py` |
| Endpoint principal | `GET /api/supervision/avance-ventas/{dist_id}?modo&fecha&sucursal&vendedor&incluir_sin_venta` |
| Drill SKU | `GET /api/supervision/avance-ventas/{dist_id}/sku/{cod}/clientes?limit&offset` |
| Drill cliente (inverso) | `GET /api/supervision/avance-ventas/{dist_id}/cliente/{id_cliente_erp}/skus` |
| Sync status ventas | `GET /api/supervision/sync-status/{dist_id}` → `ventas.last_run_ok_at` + `last_attempt_at` |
| Tests | `CenterMind/test_avance_ventas_service.py` (37 tests) |

### Reglas de agregación (NO NEGOCIABLE)

1. `anulado=false` + `build_ventas_read_context` / `apply_ventas_tenant_filters` / `filter_ventas_rows_for_tenant` (aislamiento tenant + franquicias Real).
2. Dedupe `_dedupe_ventas_enriched_lines` + orden estable `_ventas_enriched_query_order` antes de `.range(1000)`.
3. Solo líneas `_es_operacion_bultos_neto` (ventas + devoluciones netas; excluye recibos). **Devoluciones restan** (bultos signed).
4. Unidades: encendedor → 1 bulto = 1 unidad (signed); líneas convertidas (`volumen_es_convertido`: cig/papelillo/mix) → `unidades_total`; resto 0.
5. Vendedor display vía `_get_erp_name_map`; nombre vacío / "Sin Vendedor" → bucket **"Sin vendedor"** (filtro `__sin_vendedor__`).
6. Sucursal: mismo criterio que `supervision_ventas` + fallback texto en `ruta`/`agrupacion_art_1`.
7. **No** se filtran vendedores QA tabaco (decisión usuario).

### Catálogo y ranking

- **Unificación SKU** (`core/sku_unify.py`): agrupa variantes ERP del mismo artículo (prefijos tipo «CIGARRILLO …», `[COD]` en descripción, líneas con/sin `cod_articulo`). Clave canónica = descripción normalizada.
- Universo: SKUs distintos en ventana **12 meses** (`CATALOGO_MESES`).
- `incluir_sin_venta=true` (default): ranking completo; `false` excluye filas con `bultos=0`.
- Sin cap 150 en tabla; series gráficas siguen top-N (`HEATMAP_TOP_SKUS`, etc.).
- Por fila: `sin_venta`, `volumen_kind`, `bultos_enteros`, `unidades_resto` (desglose convertido).
- Payload `auditoria_clientes`: monoproducto_fuerte, mix_bajo, por_cliente_resumen (top 20 c/u).
- Payload `series.convivencia_skus`: % SKUs del catálogo 12m con venta en el período.
- Payload `series.cobertura_pdvs`: % PDVs de la cartera visible con compra en el período.

### Periodos y comparativas

| Modo | Rango | Referencias |
|------|-------|-------------|
| `dia` | fecha ancla | WoW = −7d · MoM = −1 mes (clamp 31→fin de mes) |
| `semana` | lun–sáb AR | semana anterior |
| `mes` | mes calendario | mes anterior |

`periodo.parcial=true` si incluye hoy → banner ámbar. Referencia sin datos → `DeltaKpi.disponible=false`.

### Sync badge (R3)

`motor_runs` motor=`ventas_enriched`: `last_run_ok_at`, `last_attempt_at`, `last_run_estado`, `has_zombie` (>2h en_curso).
FE invalida cache avance ante cambio de `last_attempt_at`.

## Frontend

| Pieza | Path |
|-------|------|
| Panel | `components/supervision/avance/SupervisionAvanceVentasPanel.tsx` |
| Carrusel gráficos | `AvanceVentasChartCarousel.tsx` (share, top/bottom, scatter, heatmap, cobertura PDV + convivencia SKU) |
| Alcance dual | `AvanceVentasAlcanceCharts.tsx` — cobertura PDV vs convivencia SKU con tooltips distintos |
| Ranking tabla | `AvanceVentasSkuRanking.tsx` — switch bultos/desglose, toggle solo con venta, tooltips `(?)` |
| Auditoría clientes | `AvanceVentasClienteAuditoriaPanel.tsx` + `AvanceVentasClienteDrillSheet.tsx` |
| KPI help textos | `lib/avance-ventas-kpi-help.ts` |
| Volumen modo | `hooks/useVolumenModo.ts` (localStorage) |
| Badge sync | `VentasSyncStatusBadge.tsx` — última OK + último intento fallido |
| Hook + prefetch | `hooks/useAvanceVentasQuery.ts` — stale 5m, gc 15m, `keepPreviousData`, prefetch portal/hover/warm |
| Derive alcance | `lib/avance-ventas-alcance.ts` |

### UX clave

- **Nombres SKU:** texto completo en tabla, charts (multiline Y-axis), tooltips y CSV — sin `…`.
- **Carrusel:** contexto exploratorio; **tabla ranking siempre fija** debajo.
- **Tooltips:** Intensidad, Penetración, Δ vs período anterior (`KpiHelpTip`).
- Export CSV respeta modo volumen activo.
- Filtros sucursal/vendedor compartidos con CC (`useSupervisionPanelStore`).

## Fuera de scope

`TabSupervision.tsx` · `/modo-mapa` · `/estadisticas` · UI legacy `GET /api/supervision/ventas/{dist_id}` ($).
