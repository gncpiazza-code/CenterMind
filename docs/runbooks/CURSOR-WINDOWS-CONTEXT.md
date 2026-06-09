# CURSOR WINDOWS — Contexto completo Shelfy (adjuntar a cada proyecto)

> **Para el agente Cursor en la PC Windows.** Leé este archivo al inicio de cada sesión.  
> **Repo:** `C:\dev\CenterMind` · **RAM:** 16 GB · **Rol:** worker local + análisis LM Studio + builds Android.

---

## 1. Tu rol en el sistema

Sos el **agente de la PC Windows** en un setup de dos máquinas:

| Máquina | Rol |
|---------|-----|
| **Windows (vos)** | Análisis local (LM Studio), builds pesados, emulador Android, APK MVP |
| **Mac + Cursor** | Implementación de fixes, iOS/testmobile, MCP cloud, PRs |

**Regla de oro:** en Windows **analizás y construís**; los **fixes de código importantes** pueden hacerse acá si el usuario lo pide, pero **siempre preferí LM Studio para análisis** antes de gastar Composer cloud.

---

## 2. Infraestructura local (16 GB RAM)

### LM Studio — Gemma 4 E4B (análisis, gratis, local)

```
URL:     http://127.0.0.1:1234
Modelo:  google/gemma-4-e4b-qat
Arranque:
  lms daemon up
  lms server start --bind 127.0.0.1 --port 1234
Verificar: curl http://127.0.0.1:1234/v1/models
```

Usar **Q4/QAT**, no F16 (16 GB se queda justo).

### Cursor Agent worker (tareas pesadas desde Mac)

```powershell
cd C:\dev\CenterMind
agent login
agent worker start --name "shelfy-win-worker"
```

La Mac manda tareas con `worker=shelfy-win-worker` vía cursor.com/agents.

### Cola git análisis (Mac → acá → Mac)

- Rama: `sync/lmstudio-queue`
- Worker loop: `scripts/lmstudio-worker/win-worker.ps1`
- Resultados: `docs/coordination/lmstudio-queue/done/<id>.md`

---

## 3. Router inteligente (OBLIGATORIO — ahorrar Composer)

Seguí `.cursor/rules/smart-lmstudio-router.mdc` y `scripts/lmstudio-worker/router-config.json`.

```
¿Solo analizar logs/diff/P0/checklist?
  → LM Studio LOCAL (invoke-local.ps1) — NO Composer

¿Solo build/test sin razonamiento?
  → Terminal o worker — mínimo LLM

¿Editar código / MCP / PR?
  → Composer (después del informe LM Studio si hubo análisis)
```

### Comando principal — análisis local instantáneo

```powershell
cd C:\dev\CenterMind

# Capturar evidencia
adb logcat -d | Out-File C:\temp\logcat.txt -Encoding utf8
cd shelfy-mobile; flutter analyze 2>&1 | Out-File C:\temp\analyze.txt -Encoding utf8
cd C:\dev\CenterMind

# Delegar a Gemma local
powershell -ExecutionPolicy Bypass -File scripts\lmstudio-worker\invoke-local.ps1 `
  -Task "ANÁLISIS ONLY: <descripción>. P0/P1, archivos sospechosos, checklist APK. NO aplicar fixes." `
  -ContextFile C:\temp\logcat.txt
```

Leer resultado: `docs/coordination/lmstudio-queue/done/<id>.md`

**Nunca re-analizar en Composer** lo que ya está en ese `.md`.

---

## 4. SHELFYAPP — Flutter Android (prioridad)

### Archivos de alto riesgo (crashes)

- `shelfy-mobile/lib/features/capture/capture_provider.dart`
- `shelfy-mobile/lib/features/capture/capture_screen.dart`
- `shelfy-mobile/lib/features/capture/widgets/camera_capture_widget.dart`
- `shelfy-mobile/lib/core/offline/sync_worker.dart`
- `shelfy-mobile/lib/core/utils/json_helpers.dart`
- `shelfy-mobile/lib/core/config/app_config.dart`
- `shelfy-mobile/lib/core/auth/auth_service.dart`

### API según superficie

| Superficie | API |
|------------|-----|
| Emulador Android | `http://10.0.2.2:8000` (host Windows, si API local) |
| APK en celular / ruta | `https://api.shelfycenter.com` (prod, default Android) |

### Emulador Android

```powershell
cd C:\dev\CenterMind\shelfy-mobile
flutter doctor -v
flutter pub get
flutter emulators
flutter emulators --launch <EMULATOR_ID>
flutter devices

flutter run --flavor tabaco -d <DEVICE_ID> `
  --dart-define=API_SCHEME=http `
  --dart-define=API_HOST=10.0.2.2 `
  --dart-define=API_PORT=8000
```

### Capturar crash

```powershell
adb logcat -d | findstr /i "flutter AndroidRuntime FATAL Exception Error"
# o más amplio:
adb logcat *:E -d
```

### APK MVP (prueba en ruta — flavor tabaco)

```powershell
cd C:\dev\CenterMind
powershell -ExecutionPolicy Bypass -File scripts\lmstudio-worker\build-android-mvp.ps1
```

APK:

```
C:\dev\CenterMind\shelfy-mobile\build\app\outputs\flutter-apk\app-tabaco-release.apk
```

Instalar:

```powershell
adb install -r "C:\dev\CenterMind\shelfy-mobile\build\app\outputs\flutter-apk\app-tabaco-release.apk"
```

Paquete: `com.shelfy.shelfy_mobile.tabaco`

### Checklist manual en ruta (usuario)

1. Activación API key `sapp_...`
2. Sesión persiste
3. Cartera carga
4. Captura 1 foto OK
5. Captura **2 fotos seguidas** (crash frecuente)
6. Avión → captura → online → sync
7. Background durante upload
8. Si crashea: `adb logcat -d` + pantalla + hora

---

## 5. Reglas Shelfy (NO violar)

Leer `CLAUDE.md` antes de tocar código.

- `tenant_table_name()` — sin tablas hardcodeadas
- Filtrar siempre `id_distribuidor`
- Exhibición dedup solo vía `core/exhibicion_aggregate.py`
- PostgREST paginar `.range(1000)`
- **No tocar favicon:** `icon.png`, `apple-icon.png`, `favicon.ico`, `WEBICON.svg`, `metadata.icons` en `layout.tsx`

---

## 6. Coordinación Mac ↔ Windows (git)

Archivo: `docs/coordination/ACTIVE.md`

- Ramas Mac: `mac/<tema>` · Windows: `win/<tema>`
- Una máquina por rama activa
- `git fetch --all` antes de trabajar
- Cola LM Studio: solo rama `sync/lmstudio-queue` (no mezclar con features)

---

## 7. Qué delegar a LM Studio vs qué hacer vos

### → LM Studio (invoke-local.ps1)

- Parsear logcat / stack traces
- Interpretar `flutter analyze` / pytest output
- Review diff **sin aplicar**
- P0/P1/P2, hipótesis crash
- Checklist APK ruta
- Resúmenes y borradores docs

### → Terminal / worker (sin LLM)

- `flutter build apk --release --flavor tabaco`
- `pytest` suite larga
- `npm run build` frontend
- `adb logcat` captura

### → Composer (Cursor)

- Implementar fixes tras informe LM Studio
- Refactors multi-archivo
- Cuando el usuario dice "implementá", "arreglá", "hacé PR"

### → Mac (avisar al usuario)

- `/testmobile` iOS / iPhone
- MCP Supabase/Vercel si requiere OAuth de la Mac
- Decisiones de merge a `main`

---

## 8. Flujo estándar — crash Flutter

```
1. adb logcat + flutter analyze → archivos en C:\temp\
2. invoke-local.ps1 → informe en done/<id>.md
3. Mostrar P0 al usuario
4. Si piden fix → Composer, diff mínimo, solo P0
5. build-android-mvp.ps1 → nuevo APK
6. Avisar Mac si hay paridad iOS pendiente
```

---

## 9. Entorno y dependencias

```powershell
# Verificar
git --version
python --version
node --version
flutter --version
agent --version

# Python backend (tests)
cd C:\dev\CenterMind\CenterMind
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Frontend
cd C:\dev\CenterMind\shelfy-frontend
npm install
```

Variables: `GITHUB_TOKEN` (user env). `CenterMind/.env` copiado desde Mac (no commitear).

---

## 10. Prompt LM Studio largo (análisis profundo)

Si `invoke-local.ps1` necesita misión grande, usá el contenido entre `---INICIO PROMPT---` y `---FIN PROMPT---` en:

`docs/runbooks/lmstudio-MASTER-paste.md`

como texto del parámetro `-Task` o en el chat LM Studio directamente.

---

## 11. Troubleshooting

| Problema | Solución |
|----------|----------|
| LM Studio no responde | `lms server start --bind 127.0.0.1 --port 1234` |
| invoke-local falla | Verificar modelo exacto en LM Studio UI |
| flutter OOM 16GB | Cerrar LM Studio durante `flutter build apk` |
| worker desconectado | `agent logout` → `agent login` → `agent worker start` |
| adb no ve celular | USB debug ON, `adb devices` |

---

## 12. Al iniciar sesión (checklist agente)

- [ ] `git pull` en `C:\dev\CenterMind`
- [ ] LM Studio en `:1234` activo
- [ ] Leer `docs/coordination/ACTIVE.md`
- [ ] Si hay crash/reporte: **invoke-local.ps1 primero**, no Composer
- [ ] Anunciar: *"Delego análisis a Gemma local (16GB); Composer solo para implementación."*

---

## 13. Archivos de referencia en el repo

| Archivo | Contenido |
|---------|-----------|
| `CLAUDE.md` | Reglas negocio Shelfy |
| `AGENTS.md` | MCP y stack |
| `.cursor/rules/smart-lmstudio-router.mdc` | Router automático |
| `docs/runbooks/lmstudio-MASTER-paste.md` | Prompt análisis completo |
| `docs/runbooks/cursor-delegation-playbook.md` | Tabla delegación |
| `scripts/lmstudio-worker/invoke-local.ps1` | Llamada LM Studio |
| `scripts/lmstudio-worker/build-android-mvp.ps1` | APK tabaco |
| `scripts/lmstudio-worker/win-worker.ps1` | Cola git Mac→Win |

---

## 14. Instrucción permanente (resumen 3 líneas)

1. **Análisis** → LM Studio local (`invoke-local.ps1`) usando 16 GB RAM.  
2. **Builds Android / pytest / apk** → terminal o worker, sin gastar cloud.  
3. **Código** → Composer solo después del informe local; respetar `CLAUDE.md`.

*Protocolo Windows Shelfy listo.*
