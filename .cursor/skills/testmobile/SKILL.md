---
name: testmobile
description: >-
  Launches SHELFYAPP on iOS simulator or physical iPhone against Railway PROD API
  by default. Use when the user invokes /testmobile, asks to test shelfy-mobile,
  or start mobile dev session on Mac/iPhone. Local API only if user explicitly asks.
---

# /testmobile — SHELFYAPP sesión de test

Orquesta Flutter en `shelfy-mobile/` contra **https://api.shelfycenter.com** (prod).

## Reglas

- **API default:** **PROD Railway** (`testmobile.sh device` o `testmobile.sh` sin args).
- **API local:** solo si el usuario pide explícitamente `local` → `testmobile.sh local device`.
- **App:** Flutter en `CenterMind/shelfy-mobile/` únicamente.
- **Antes de deps complejas:** skill `flutter-package-research` (pub.dev, Flutter Gems).
- No commitear keys `sapp_...` ni `.env`.
- **Deploy BE a prod** → `./scripts/deploy-centermind-railway.sh` (nunca `railway up` desde raíz del monorepo).

## Workflow obligatorio

```
/testmobile progress:
- [ ] Phase 0 — Preflight (+ prod health)
- [ ] Phase 1 — testmobile.sh device (PROD)
- [ ] Phase 2 — Verificar logs
- [ ] Phase 3 — Checklist UAT usuario
```

### Phase 0 — Preflight

1. Repo: `/Users/ignaciopiazza/Desktop/CenterMind`
2. Verificar: `shelfy-mobile/scripts/testmobile.sh`, Xcode, iPhone conectado si `device`
3. **Prod health:** `curl -sf https://api.shelfycenter.com/health`
4. Si UAT requiere cambios BE no deployados → `cd CenterMind && railway up` primero

### Phase 1 — Lanzar app (PROD)

```bash
chmod +x /Users/ignaciopiazza/Desktop/CenterMind/shelfy-mobile/scripts/testmobile.sh
/Users/ignaciopiazza/Desktop/CenterMind/shelfy-mobile/scripts/testmobile.sh device
```

| Arg | Uso |
|-----|-----|
| `device` / vacío | **PROD** + iPhone físico (default Ignacio) |
| `simulator` | PROD + simulador iOS |
| `local device` | Solo si usuario pide API Mac `:8000` |

### Phase 2 — Verificar

```bash
curl -sf https://api.shelfycenter.com/health | head -c 120
grep -E "Flutter run key commands|BUILD FAILED" /tmp/shelfy-flutter.log | tail -3
```

### Phase 3 — UAT usuario (prod)

1. Key portal → App Móvil → `sapp_...` → activar
2. Backend OK → `https://api.shelfycenter.com`
3. Flujos: Captura · Cartera · Stats · Más (Ventas bultos, CC $, Objetivos)
4. Logs: `/tmp/shelfy-flutter.log`
5. Detener: `kill $(cat /tmp/shelfy-flutter.pid 2>/dev/null) 2>/dev/null`

## Anti-patrones

- **No** usar `local` salvo pedido explícito del usuario.
- **No** levantar `:8000` si el UAT es pre-prod release.
- **No** `python3` global — venv solo en modo `local`.
