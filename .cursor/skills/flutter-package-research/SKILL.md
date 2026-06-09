---
name: flutter-package-research
description: >-
  Antes de implementar lógica compleja en Flutter (cámara, GPS, Excel, animaciones,
  gráficos), investigar paquetes y referencias en fuentes canónicas: pub.dev,
  Flutter Gems, Mobbin/Dribbble, Lottie/Rive. Usar cuando el agente vaya a elegir
  dependencias, diseñar UI mobile, o agregar animaciones en shelfy-mobile.
---

# Flutter — investigación antes de implementar

**Regla:** no escribir lógica compleja ni agregar dependencias sin revisar estas fuentes primero.

## 1. Paquetes — pub.dev

Repositorio oficial: https://pub.dev

Antes de cámara, geolocalización, Excel, state management, etc.:

1. Buscar en pub.dev con keywords exactas (`camera`, `geolocator`, `excel`, …).
2. Verificar **Likes** (adopción) y badge **Flutter Favorite** (respaldado por el equipo).
3. Revisar: última publicación (<12 meses ideal), plataformas (iOS/Android), issues abiertos críticos.
4. Preferir paquetes mantenidos por `flutter.dev`, `dart-lang`, o vendors conocidos.
5. Documentar en el plan: paquete elegido + por qué (1 línea).

**Shelfy:** `shelfy-mobile/pubspec.yaml` — no agregar deps sin este checklist.

## 2. Descubrimiento visual — Flutter Gems

https://fluttergems.dev — pub.dev categorizado y visual.

Usar para:

- Componentes UI (sheets, chips, charts)
- Gráficos / estadísticas mobile
- Comparar 2–3 candidatos antes de `flutter pub add`

## 3. UI/UX de referencia — Mobbin / Dribbble

- **Mobbin** (https://mobbin.com): flujos reales de apps enterprise — captura, tabs, listas, estados vacío/error.
- **Dribbble** (https://dribbble.com): referencia visual; no copiar tutoriales genéricos.

**Shelfy:** alinear con portal violeta (`shelfy_tokens.dart`) y patrones de `shelfy-frontend/`, no Material azul default.

## 4. Animaciones — LottieFiles / Rive

- **LottieFiles** (https://lottiefiles.com)
- **Rive** (https://rive.app)

**Consejo Shelfy (honesto):** app de gestión y campo debe ser **ultrarrápida**. Animaciones al mínimo:

| Sí usar | No usar |
|---------|---------|
| Spinner / skeleton carga | Animaciones decorativas en listas |
| Check éxito post-upload (corto) | Lottie en cada transición de tab |
| Stagger hub Más (ya existe, ligero) | Rive en pantallas de datos |

Si se agrega Lottie/Rive → justificar en 1 línea y medir impacto en Android gama baja.

## Workflow obligatorio (agente)

```
1. pub.dev (+ Flutter Gems si hay varias opciones)
2. Elegir paquete / patrón UI
3. Implementar diff mínimo
4. flutter analyze + UAT dispositivo
```

## Anti-patrones

- Inventar wrapper de cámara/GPS sin revisar `camera`, `camerawesome`, `geolocator` en pub.dev.
- Agregar `lottie` / `rive` por estética sin requisito de feedback de sistema.
- Copiar UI de tutoriales YouTube en lugar de Mobbin + tokens Shelfy.
