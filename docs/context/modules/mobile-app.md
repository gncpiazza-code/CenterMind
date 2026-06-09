# SHELFYAPP — Flutter

Directorio: `shelfy-mobile/lib/features/` — **4 tabs** (Captura·Cartera·Stats·Más).

## Nav

- **4 tabs:** `CaptureScreen` | `CarteraScreen` | `StatsScreen` | `MoreScreen`
- **Hub Más** (`more_screen.dart`): hub animado (stagger 4 cards) → Ventas, Cuentas, Objetivos, Galería vía `pushMoreSubScreen(index)` en `HomeTabController`
- Sub-screens del hub tienen back arrow + `AnimatedSwitcher` en título

## Identidad visual (Oleada 2)

- **Tokens:** `lib/theme/shelfy_tokens.dart` — `ShelfyTokens.primary` (#a855f7) como color base
- **Tema:** `buildTenantTheme()` usa violeta Shelfy por defecto (no `#6C63FF`)
- **Shared widgets:** `lib/shared/widgets/shelfy/shelfy_widgets.dart` — `ShelfyGlassPanel`, `ShelfyPrimaryButton`, `ShelfyChip`, `ShelfyCaptureShutter`, `ShelfyPdvSuggestionTile`, `ShelfyAppBarTitle`
- **AppBar:** `ShelfyAppBarTitle` con logo asset (no texto "SHELFYAPP")

## Captura (Oleada 2)

- **1 pantalla / Stack único:** `CaptureScreen` — cámara Z0 + barra GPS Z1 + sheet glass Z3
- **Fases:** `CaptureOverlayPhase` { live, postPhoto, confirmPdv, ingreso, uploading, done }
- **Sin Navigator.push:** todo el flujo en el mismo `Scaffold`; sheet sube/baja con `SlideTransition`
- **Flash:** toggle auto/on/off en `CameraCaptureWidget`
- **Radio GPS:** 100 m (era 150)
- **Autocompletado:** `pdv/buscar?q=` endpoint + debounce 300 ms en provider

## Invariantes

- Stats/ranking: `aggregate_exhibicion_counts_vendor_scope`, `aggregate_ranking_by_vendor`
- Paginación 1000 en todos los services
- Tenant: `session["vendor"] == vendor_in_path`
- **Snapshot-first:** CC y ventas muestran solo el snapshot más reciente con `snapshot_label` visible. Sin botones PDF.
- **Upload RPC:** `ensure_mobile_integrante` debe llamarse ANTES del RPC; pasar `_mobile_telegram_user_id` como `p_vendedor_id` (NO `id_vendedor_v2`). Ver `vendedor_upload_service.py`.

## API prefix

`/api/vendedor/{dist_id}/*` — ver `routers/vendedor_app.py`

Services: `vendedor_stats`, `vendedor_ranking`, `vendedor_cartera`, `vendedor_galeria`, `vendedor_ventas`, `vendedor_cc`, `vendedor_objetivos`, `vendedor_bundle`, `vendedor_push`

## Contratos JSON (clave)

- CC (`/cc`): `snapshot_label`, `nombre_display`, `saldo`, `dias_vencido`, aging buckets `deuda_7/15/30/60/mas_60_dias`
- Ventas (`/ventas`): `snapshot_label`, `nombre_display`, `bultos_desglose[]`, `top_compradores[]`
- Cartera (`/cartera`): patrón canónico snapshot-first (referencia)

## Portal

`/admin/app-settings` — push FCM por dist (superadmin)

SQL pendiente: `20260607_vendedor_app_settings_push.sql`
