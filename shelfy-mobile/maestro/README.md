# Maestro — E2E mobile (tipo Playwright para iOS/Android)

[Maestro](https://maestro.mobile.dev/) graba/ejecuta flujos YAML contra simulador o iPhone físico.

## Instalar (Mac, una vez)

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

## Correr stress de tabs (5 tabs MVP)

Flujo: **Captura → CC → Cartera → Objetivos → Stats** × 3 ciclos.

1. APK **tabaco** instalado (`com.shelfy.shelfy_mobile.tabaco`) y **ya activado** (key pegada).
2. iPhone conectado o simulador abierto.

```bash
cd shelfy-mobile
maestro test maestro/nav_stress.yaml
```

Para otro flavor, cambiar `appId` en `nav_stress.yaml` (ej. `.aloma`, `.real`).

## Alternativas

| Herramienta | Uso |
|-------------|-----|
| **Maestro** | E2E YAML, sim + device — más parecido a Playwright |
| **Patrol** | Integration tests Flutter nativos (`patrol test`) |
| **integration_test** | Oficial Flutter, corre en sim/device |
| **XCUITest** | Nativo Apple, más verboso |

Para que el agente Cursor debuguee crashes nativos en iPhone:

```bash
# Con device USB + app corriendo
flutter logs
# o Xcode → Window → Devices → Open Console
```
