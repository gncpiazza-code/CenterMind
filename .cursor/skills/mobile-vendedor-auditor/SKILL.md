# Skill: mobile-vendedor-auditor

**Trigger automático:** cualquier mensaje que mencione `shelfy-mobile`, `SHELFYAPP`, `Flutter vendedor`,
`/testmobile`, `APK tabaco`, `paridad Telegram mobile`, `cámara captura`, `PDV mobile`, o similar.

**Alcance:** app móvil vendedor (`shelfy-mobile/`) + BE `CenterMind/services/vendedor_*` +
comparación con `bot_worker.py` comandos + portal vendedor-scoped. **No** incluir módulos de supervisión.

---

## Checklist obligatorio

Ejecutar antes de cualquier cambio o PR en mobile. Reportar cada ítem como ✅ / ⚠️ / ❌.

### 1. Paridad comando ↔ endpoint ↔ tab ↔ profundidad UX
- [ ] Cada comando Telegram (`/cartera`, `/objetivos`, `/stats`, `/cc`, `/galeria`) tiene tab equivalente en app
- [ ] Cada tab muestra los mismos campos que el bot (sin truncar datos del usuario)
- [ ] Recomendaciones y tips del objetivo se muestran (no solo porcentaje)
- [ ] CC: antigüedad chip + FUC + link Google Maps presentes
- [ ] Stats: hero bultos + SKU progress rows + KPI grid 2 col

### 2. P0 scope: JWT vendor, cola offline, cache providers, galería
- [ ] Todos los endpoints filtran por `id_vendedor` del JWT (no parametrizable por client)
- [ ] `upload_queue` tiene columnas `dist_id` y `vendor_id` — enqueue siempre las incluye
- [ ] Logout: `authService.logout()` limpia JWT, cola y cache bundle
- [ ] Providers: `fetch(force: false)` reutiliza cache; solo `force: true` en pull-to-refresh
- [ ] Galería accesible desde la navegación principal (no solo en `MoreScreen` huérfano)

### 3. PDV: prefix strict ERP y nombre; pendientes padrón
- [ ] `pdv_buscar_texto`: nombre usa `ilike '{q}%'` (prefijo), NO `'%{q}%'` (contains)
- [ ] `pdv_buscar_texto`: rama numérica solo busca en `id_cliente_erp`, NO en nombre
- [ ] UI: chips GPS se ocultan cuando el campo de búsqueda tiene texto
- [ ] UI: tiles de búsqueda solo muestran PDVs `en_cartera: true`
- [ ] NRO no encontrado en cartera → ofrece "Registrar como pendiente" (no falla en silencio)
- [ ] Endpoint `POST /pdv/pendiente` existe y crea registro en `vendedor_pdv_pendientes`

### 4. Cámara: tokens, fases overlay, post-upload, perf gama baja
- [ ] `DeviceProfile.cameraPreset`: `medium` Android, `high` iOS
- [ ] Zoom: pinch continuo + tap focus + dial presets glass (no solo slider)
- [ ] Post-foto: sheet glass sube; fases `live→postPhoto→confirmPdv→ingreso→uploading→done`
- [ ] `_DoneContent` muestra `PostUploadSummary` (historial PDV + objetivo badge + stats mes)
- [ ] Ráfaga: 3 fotos seguidas < 2s entre disparos en Android gama baja (no reinit controller)
- [ ] Max 6 fotos por exhibición (`kMaxPhotosPerExhibicion`)

### 5. Offline: bundle consumido, modo avión
- [ ] GET `/bundle` se ejecuta al boot y resultado se persiste a archivo local
- [ ] Providers leen desde cache de bundle si están offline (no spinner infinito)
- [ ] Cola upload: items permanecen si offline; se procesan cuando vuelve la red
- [ ] `SyncWorker` detecta reconexión y ejecuta ciclo de sync

### 6. Tests: pytest scope + flutter analyze
- [ ] `pytest test_vendedor_app_*.py -v` sin errores
- [ ] `pytest test_vendedor_pdv_prefix.py -v` existe y pasa
- [ ] `flutter analyze lib/` sin errores críticos
- [ ] `flutter test` sin regresiones

---

## Salida esperada

```
## Auditoría SHELFYAPP — [fecha]

### P0 (bloqueante para APK)
- ❌ [ítem] — [causa] — [archivo:línea]

### P1 (alta prioridad)
- ⚠️ [ítem] — [detalle]

### P2 / P3
- [lista]

### Acciones sugeridas
1. [acción concreta con archivo y función]
```

**Prohibido en modo auditoría:** crear commits, modificar archivos, deployar.

---

## Contexto clave

- **PDV buscar:** `CenterMind/core/pdv_proximity.py` → `pdv_buscar_texto()`
- **Captura:** `shelfy-mobile/lib/features/capture/capture_screen.dart`
- **Provider:** `shelfy-mobile/lib/features/capture/capture_provider.dart`
- **Queue:** `shelfy-mobile/lib/core/offline/upload_queue.dart` + `.g.dart`
- **Auth:** `shelfy-mobile/lib/core/auth/auth_service.dart`
- **API client:** `shelfy-mobile/lib/core/api/api_client.dart`
- **Bundle:** `CenterMind/services/vendedor_bundle_service.py` + endpoint `/bundle`
- **Pendientes:** `CenterMind/services/vendedor_pendientes_service.py` (crear si no existe)
- **Tokens:** `shelfy-mobile/lib/theme/shelfy_tokens.dart`
