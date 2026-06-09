# SHELFYAPP — Flutter

Directorio: `shelfy-mobile/lib/features/` — **5 tabs MVP** (Captura·CC·Cartera·Objetivos·Stats).

## Estrategia plataforma

| Audiencia | Plataforma | Prioridad |
|-----------|------------|-----------|
| **Vendedores** (hoy) | Android gama baja | P0 — fluidez, RAM, red lenta |
| **Supervisores** (futuro) | iOS + portal | P1 — módulo aparte / rol `supervisor` en app |

**Reglas de performance (obligatorias):**

- **Un tab montado** — no `IndexedStack` con cámara + 4 pantallas (OOM iOS/Android).
- **Cámara:** `DeviceProfile.cameraPreset` → `medium` Android, `high` iOS; liberar `CameraController` al salir de Captura.
- **Providers en memoria** — `fetch(force: false)` reutiliza cache al volver a un tab; pull-to-refresh usa `force: true`.
- **Offline:** cola upload Drift + sync badge en tab Captura.
- **QA Android:** Windows worker `flutter build apk --flavor tabaco` + Maestro `maestro/nav_stress.yaml`.
- **QA iOS:** Mac `/testmobile` device o simulador.

**Futuro supervisores:** flavor o gate por rol JWT (`supervisor`) — mapa/galería read-only, sin captura obligatoria; reutilizar tokens Shelfy y API `/api/vendedor-app/*` con permisos ampliados.

## Nav (v1 — 6 tabs directos)

- **6 tabs:** `CaptureScreen`(0) | `CuentasScreen`(1) | `CarteraScreen`(2) | `ObjetivosScreen`(3) | `StatsScreen`(4) | `GaleriaScreen`(5)
- Tab inicial: **Captura** (índice 0) — lazy camera mount ~350 ms para evitar SIGKILL iOS
- `HomeTabController.goToCaptureWithPdv(nro)` — navega a tab 0 con PDV pre-cargado (desde Cartera CTA)
- Hub Más deprecado — `more_screen.dart` fuera de nav
- **SERVIR, NO COCINAR** — app solo fetch→parse→render; cero lógica de negocio en Dart

## Identidad visual (Oleada 3 — 2026-06-09)

- **Tokens:** `lib/theme/shelfy_tokens.dart` — `ShelfyTokens.primary` (#a855f7) como color base
- **Tema:** `buildTenantTheme()` usa violeta Shelfy por defecto (no `#6C63FF`)
- **Shared widgets:** `lib/shared/widgets/shelfy/shelfy_widgets.dart`:
  - `ShelfyGlassPanel`, `ShelfyPrimaryButton`, `ShelfyChip`, `ShelfyCaptureShutter`, `ShelfyPdvSuggestionTile`, `ShelfySnapshotLabel`, `ShelfyAppBarTitle`
  - Nuevos Oleada 3: `ShelfySectionHeader`, `ShelfyHeroMetric`, `ShelfyProgressRow`, `ShelfyKeyValueGrid`, `ShelfyInsightList`
- **AppBar:** `ShelfyAppBarTitle` con logo asset (no texto "SHELFYAPP")
- **Regla:** cero `Colors.*` hardcodeados — siempre `ShelfyTokens.*`

## Cámara Apple-like (Auditor 2026-06-09)

- **Shutter:** 72px círculo blanco, `GestureDetector` (no Material ripple), scale 0.88 en press
- **Controles:** flash + flip + grid en 42px círculos semitransparentes (negro 40%) top-right
- **Grid:** desactivada por defecto, toggleable
- **Zoom:** pinch + badge transitorio que desaparece a los 2s; sin dial permanente
- **Bottom area:** gradiente oscuro 80% negro ~120px — shutter centrado, UI mínima
- **Focus:** cuadrado redondeado 50px blanco que fade-out en 600ms (Apple-style)
- **Counter:** pill "N/6" top-left, solo visible si hay fotos
- **Oleada 3 (herencia):** double-tap toggle zoom, haptic en presets

## Captura (Oleada 2)

- **1 pantalla / Stack único:** `CaptureScreen` — cámara Z0 + barra GPS Z1 + sheet glass Z3
- **Fases:** `CaptureOverlayPhase` { live, postPhoto, confirmPdv, ingreso, uploading, done }
- **Sin Navigator.push:** todo el flujo en el mismo `Scaffold`; sheet sube/baja con `SlideTransition`
- **Flash:** toggle auto/on/off en `CameraCaptureWidget`
- **Radio GPS:** 100 m (era 150)
- **Autocompletado:** `pdv/buscar?q=` endpoint + debounce 300 ms en provider

## Captura — multifoto (campo ruta 2026-06-09)

- **addExtraPhoto()** en `CaptureProvider` — colapsa sheet volviendo a `live` con `_addingExtraPhoto=true`; el shutter agrega la foto y vuelve a `confirmPdv` sin resetear PDV
- Botón "Agregar otra foto" en fase `confirmPdv` wired a `provider.addExtraPhoto()`

## Offline bundle (Auditor 2026-06-09)

- **`BundleCache`** (`lib/core/offline/bundle_cache.dart`): TTL 24h, archivo `shelfy_bundle_cache.json`
- **`BundleProvider`** (`lib/core/offline/bundle_provider.dart`): init() carga cache → fetch en background silencioso
- **Logout** limpia cache via `BundleCache.clear()`
- **Slices:** `carteraHoy`, `objetivos`, `stats`, `exhibicionesRecientes`

## PDV — prefix estricto + pendientes padrón (Auditor 2026-06-09)

- **`pdv_buscar_texto`**: NRO y nombre usan `{q}%` (prefix), nunca `%{q}%` (contains)
- **`POST /pdv/pendiente`**: registra NRO fuera de cartera → tabla `vendedor_pdv_pendientes`; SQL: `20260609_vendedor_pdv_pendientes.sql`
- **`GET /pdv/pendientes`**: lista pendientes del vendedor JWT
- **UI Captura**: si NRO no en cartera → botón "Registrar como pendiente" + "Usar NRO manual sin verificar"

## Push FCM (stub 2026-06-09)

- **Backend:** `POST /device-token` wired; tablas en `20260607_vendedor_app_settings_push.sql` (pendiente aplicar)
- **Flutter:** `lib/core/push/vendedor_push_service.dart` — stub; activar añadiendo `firebase_messaging` + credenciales

## API vendedor-app (endpoints históricos)

- `GET /estadisticas/resumen?meses=YYYY-MM` → 7 KPIs
- Cartera JSON: +`fecha_alta`, `nombre_fantasia`, `nombre_razon_social`
- Objetivos detalle: +`recomendaciones[]` + `resumen_mobile` (titulo, accion, tip, mes, origen)

## Invariantes

- Stats/ranking: `aggregate_exhibicion_counts_vendor_scope`, `aggregate_ranking_by_vendor`
- Paginación 1000 en todos los services
- Tenant: `session["vendor"] == vendor_in_path`
- **Snapshot-first:** CC y ventas muestran solo el snapshot más reciente con `snapshot_label` visible. Sin botones PDF.
- **Upload RPC:** `ensure_mobile_integrante` debe llamarse ANTES del RPC; pasar `_mobile_telegram_user_id` como `p_vendedor_id` (NO `id_vendedor_v2`). Ver `vendedor_upload_service.py`.

## API prefix

`/api/vendedor/{dist_id}/*` — ver `routers/vendedor_app.py`

Services: `vendedor_stats`, `vendedor_ranking`, `vendedor_cartera`, `vendedor_galeria`, `vendedor_ventas`, `vendedor_cc`, `vendedor_objetivos`, `vendedor_bundle`, `vendedor_push`

## CC enrich (Oleada 3 — 2026-06-09)

- **BE** `vendedor_cc_service.py` → `_enrich_cc_geo()`: join `clientes_pdv_v2` por `id_cliente_erp`
- **Campos nuevos** en `clientes[]`: `latitud`, `longitud`, `domicilio`, `localidad`, `fecha_ultima_compra`
- **FE** `ClienteCc.mapsUrl()`: preferencia coords → fallback dirección → `null`
- **UI:** chip "ÚC: DD/MM/YYYY" + chip "Antigüedad X d" + link "Ver en Google Maps" (url_launcher)
- **`url_launcher: ^6.3.0`** agregado a pubspec

## Objetivos UI (Oleada 3 — 2026-06-09)

- `_esTelegramPayload()` extendido: cubre `<b>`, `<code>`, `🚀`, `/objetivos`
- Sheet de detalle: Hero progress → Recomendaciones (`ShelfyInsightList`) → Desglose → PDVs → descripción libre
- `objetivo_card.dart` y `objetivo_detalle_sheet.dart`: colores por tipo → `ShelfyTokens.*`
- **BE** `get_objetivo_detalle`: campo `resumen_mobile` (titulo, origen, mes, meta_label, accion, tip)

## Stats ventas (Oleada 3 — 2026-06-09)

- `StatsProvider` llama `/ventas` + `VentasData` model
- Hero `ShelfyHeroMetric` bultos MTD + conteo facturas
- Top 5 SKUs `ShelfyProgressRow` proporcional + "Ver N más" expandible
- KPI grid 2 columnas (no Wrap caótico)
- `_EstadoChip` grid 2col (no Wrap)

## Contratos JSON (clave)

- CC (`/cc`): `snapshot_label`, `nombre_display`, `saldo`, `dias_vencido`, aging buckets `deuda_7/15/30/60/mas_60_dias`, + `latitud`, `longitud`, `domicilio`, `localidad`, `fecha_ultima_compra`
- Ventas (`/ventas`): `snapshot_label`, `total_bultos`, `total_facturas`, `bultos_desglose[]`, `top_compradores[]`
- Objetivos detalle (`/objetivos/{id}`): +`recomendaciones[]`, +`resumen_mobile{titulo, origen, mes, meta_label, accion, tip}`
- Cartera (`/cartera`): patrón canónico snapshot-first (referencia)

## Portal

`/admin/app-settings` — push FCM por dist (superadmin)

SQL pendiente: `20260607_vendedor_app_settings_push.sql`
