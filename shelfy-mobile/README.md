# SHELFYAPP — shelfy-mobile

App Flutter para vendedores de campo (captura exhibiciones, cartera, stats, objetivos).

**Ubicación obligatoria del código mobile:** `CenterMind/shelfy-mobile/`

---

## ¿API en Railway o local?

| Entorno | URL | Cuándo usar |
|---------|-----|-------------|
| **Dev (estos días)** | `http://127.0.0.1:8000` simulador / `http://<IP-Mac>:8000` iPhone | Backend local con `run-backend-local.sh`. Misma Supabase que prod (`.env` en `CenterMind/`). |
| **Prod (Railway)** | `https://api.shelfycenter.com` | Cuando deployees el backend con `vendedor_app` en main. **Hoy prod aún no expone `/api/vendedor-app/*`.** |

La base de datos ya está en Supabase (tablas `vendedor_app_*`). Para probar sin deploy: **API local + Supabase remoto**.

---

## Requisitos (Mac + iPhone)

1. **Flutter 3.44+** — `brew install flutter` (ya instalado)
2. **Xcode** — App Store (~12 GB). Sin esto no hay iOS.
3. **CocoaPods** — `brew install cocoapods` (el setup lo instala)
4. **CenterMind/.env** — credenciales Supabase/JWT (copiar de `.env.example`)

---

## Setup inicial (una vez)

```bash
cd /Users/ignaciopiazza/Desktop/CenterMind/shelfy-mobile
chmod +x scripts/*.sh
./scripts/setup-ios-dev.sh
```

Si Xcode no está instalado, el script te indica los pasos exactos.

---

## Día a día — test rápido

**Atajo (recomendado):** en Cursor escribí **`/testmobile`** — levanta API + app automáticamente.

```bash
./scripts/testmobile.sh          # auto: iPhone si hay certs, si no simulador
./scripts/testmobile.sh simulator
./scripts/testmobile.sh device
```

Logs: `/tmp/shelfy-api.log`, `/tmp/shelfy-flutter.log`

---

## Día a día — manual (2 terminales)

**Terminal 1 — API local**

```bash
./scripts/run-backend-local.sh
```

Verificá: http://127.0.0.1:8000/health

**Terminal 2 — App**

Simulador iOS:

```bash
./scripts/run-ios-simulator.sh
```

iPhone físico (USB, misma WiFi que el Mac):

```bash
./scripts/run-ios-device.sh
```

Diagnóstico rápido:

```bash
./scripts/doctor.sh
```

---

## Generar key de prueba (portal)

1. Portal local o prod → **Fuerza de Ventas** → tab **App Móvil**
2. Crear key para un `id_vendedor` de prueba
3. Copiar key `sapp_...` (solo se muestra una vez)
4. Pegar en la app al activar

---

## Config por entorno

Archivos en `config/` (inyectados con `--dart-define-from-file`):

| Archivo | Uso |
|---------|-----|
| `dev-simulator.json` | Simulador → `127.0.0.1:8000` |
| `dev-device.json` | iPhone → IP LAN del Mac (auto-generado en setup) |
| `railway-prod.json` | Prod Railway (post-deploy) |

Editá `config/dev-device.json` si cambiás de red WiFi.

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| `ImportError: create_client from supabase` | Usá `./scripts/run-backend-local.sh` (venv con supabase 2.31.0). No uses `python3 -m uvicorn` global. |
| iPhone «unpaired» code -29 | `./scripts/pair-iphone.sh` → Xcode Devices → Trust |
| Flutter no ve iPhone | USB + desbloqueado; `flutter devices --device-timeout 45` |
| «Development Team» required | `./scripts/configure-ios-signing.sh` (Apple ID en Xcode, una vez) |
| API no responde en iPhone | Misma WiFi; `config/dev-device.json` IP = `ipconfig getifaddr en0` |

---

- Ubicación **while-in-use** (GPS PDV ≤100 m)
- Cámara + galería (multi-foto)
- HTTP local permitido (`NSAllowsLocalNetworking`) para dev

---

## Flavors Android (futuro piloto APK)

`tabaco` · `aloma` · `liver` · `real` · `extra` · `beltrocco` · `hugo_cena` — white-label por tenant (ver `docs/context/modules/tenants.md`).

iOS usa branding remoto vía `/api/vendedor-app/branding` post-login.

---

## Tests backend

```bash
cd ../CenterMind
python -m pytest test_vendedor_app_auth.py test_vendedor_app_proximity.py test_vendedor_app_upload.py -v
```

## Tests Flutter

```bash
flutter analyze
flutter test
```
