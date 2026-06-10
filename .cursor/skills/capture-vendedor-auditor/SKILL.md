# Skill: capture-vendedor-auditor

Hijo de `mobile-vendedor-auditor`. Aplica a cualquier tarea sobre el tab Captura de SHELFYAPP.

## Triggers

`captura`, `cámara`, `burst`, `multifoto`, `lag`, `PDV post-foto`, `ingreso memoria`, `listo`, `filmstrip`, `cámara nativa`, `gama baja`

## Alcance

```
shelfy-mobile/lib/features/capture/**
shelfy-mobile/lib/core/utils/device_profile.dart
shelfy-mobile/lib/features/settings/settings_screen.dart
```

## Arquitectura (Burst Apple — jun 2026)

### Fases (`CaptureOverlayPhase`)

| Fase | Sheet | Cámara | Descripción |
|------|-------|--------|-------------|
| `burstLive` | Oculto | Preview vivo | Disparos 1–6 sin interrumpir |
| `assignPdv` | Visible | Atenuada | Búsqueda PDV + chips cercanos (dentro sheet) |
| `suggestIngreso` | Visible | Atenuada | Banner memoria + countdown 5 s |
| `ingreso` | Visible | Atenuada | Elección manual con/sin ingreso |
| `uploading` | Visible | Atenuada | Progreso upload |
| `done` | Visible | Off | Éxito + stats + "Nueva visita" |

### Reglas invariantes

- `onPhotoTaken()` → **solo** agrega a `_photos`; fase **permanece `burstLive`** siempre.
- `finishBurst()` (botón Listo) → `assignPdv` si `photoCount >= 1`. Nunca antes.
- `backToBurst()` → `burstLive`; conserva filmstrip; reanuda cámara.
- `selectPdv()` / `confirmManualNro()` → lookup `CapturePdvMemory` → `suggestIngreso` o `ingreso`.
- Sheet visible iff `phase != burstLive`.
- **Sin `Navigator.push`** — todo en el mismo `CaptureScreen` / `Scaffold` / `Stack`.

### GPS badge

- Chip `_GpsStatusChip` en barra **top-left** — 12px, nunca `Center` sobre preview.
- PDVs cercanos van **dentro del sheet** (`assignPdv`), no sobre la cámara.

### Perf

- GPS se obtiene **una vez** en `_startBackgroundGps()` — lat/lng se pasan a `CameraCaptureWidget.lastKnownLat/Lng`.
- `_takePhoto()` usa `CapturePhotoMetadata` con lat/lng cacheados — sin nueva petición GPS por disparo.
- Primer disparo > 800 ms → `DeviceProfile.markSlowCameraDetected()` (async fire-and-forget).

### Memoria ingreso (`CapturePdvMemory`)

- SharedPreferences key: `capture_ingreso_{distId}_{vendorId}_{nro}`.
- Se guarda tras submit exitoso (online u offline).
- En `suggestIngreso`: countdown 5 s → auto-confirm; botones "Cambiar" y "Cancelar auto".

### Fallback nativo (`NativeCaptureService`)

- Solo Android. `DeviceProfile.shouldUseNativeCamera()` → true si auto-detect o toggle manual.
- Toggle «Usar cámara del sistema» en `SettingsScreen` → `DeviceProfile.setNativeCameraOverride()`.
- iOS: siempre Flutter preview.

### Zoom badge

- Transitorio 2 s, posición **top-right** junto botones flash/grid.
- Implementado en `_CameraToolButton` row — nunca en `Center` o `Positioned.fill`.

## Checklist campo (HERNN BENETTI)

- [ ] 3 fotos seguidas sin sheet ni lag perceptible
- [ ] Listo → sheet sube en **misma** pantalla (cámara atenuada, sin navegar)
- [ ] Mismo NRO 2ª vez → "Cliente ya registrado CON INGRESO" + auto-avance 5 s
- [ ] Badge GPS solo arriba, nunca en el centro
- [ ] Android gama baja: toggle «Usar cámara del sistema» en Ajustes funcional
- [ ] Upload OK offline/online

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `capture_provider.dart` | Estado + transiciones + memoria |
| `capture_screen.dart` | UI burst + sheet + GPS chip |
| `camera_capture_widget.dart` | Preview + perf GPS cached + timing |
| `capture_pdv_memory.dart` | SharedPreferences ingreso por PDV |
| `native_capture_service.dart` | Fallback image_picker Android |
| `device_profile.dart` | Detección gama baja + toggle |
| `settings/settings_screen.dart` | Toggle «Usar cámara del sistema» |
