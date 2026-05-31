# Visor — Liquid Glass Clear controls (Shelfy architecture reference)

> **Actualizado:** 2026-05-31 (fase 2 — 199%)
> **Material:** Liquid Glass **Clear** (referencia Apple WWDC 2025)  
> **Variante implementada:** `clear` (default visor) + `regular` (reutilizable)

## Mapa de archivos en el repo

| Archivo | Rol |
|---------|-----|
| `visor-glass-tokens.ts` | **Tokens** — blur, tint, rim, shadow, lens scale por variante |
| `visor-glass-lens.svg.ts` | SVG filter defs — **bench-only** legacy; NO en capa backdrop |
| `visor-glass-luminance.ts` | `sampleBackdropLuma()` + `glyphMode()` |
| `visor-glass-webgl.ts` | `VisorGlassWebGLLens` clase + detect; estrategia `canvas\|webgl\|none` |
| `visor-glass-lens-strategy.ts` | `pickLensStrategy()` — Chromium→canvas, Firefox→webgl, Safari→none |
| `visor-glass-canvas-lens.ts` | `updateCanvasLens()` — muestrea img→canvas para Chromium |
| `visor-glass-placement.ts` | `resolveGlassAnchor()` — sube píldora si cae bajo imagen |
| `useVisorGlassGlyphMode.ts` | Hook — muestrea luminancia c/200ms → `glyphMode` + `luma` |
| `VisorGlassMaterial.tsx` | **Material principal** — 6 capas, `forwardRef`, `glyphMode`+`getImg` props |
| `VisorGlassLensLayer.tsx` | **Capa C** — canvas/webgl separado del backdrop-filter |
| `VisorGlassVibrancy.tsx` | `GlassIcon`, `GlassLabel` — dual-shadow vibrancy adaptativa |
| `VisorWaterGlass.tsx` | Wrapper `forwardRef` + `WATER_GLASS_BTN_BASE` |
| `VisorPhotoControls.tsx` | Flotante — hook vibrancy + GlassIcon + placement inteligente |
| `VisorPhotoZoomBar.tsx` | Botones − / ↺ / + con `GlassIcon` adaptativo |
| `FotoViewer.tsx` | Shell + overlay; `crossOrigin` CORS fix; `data-foto-shell` |
| `glass-bench/page.tsx` | Playground dev — HUD luma/mode/strategy; toggle vibrancy |
| `__tests__/visor-glass-tokens.test.ts` | Tests tokens |
| `__tests__/visor-glass-luminance.test.ts` | Tests luminance + fallbacks |
| `__tests__/visor-glass-material.test.tsx` | Test H1/H6: no filter en capa refract |
| `__tests__/visor-glass-lens-strategy.test.ts` | Tests strategy + placement |

## Arquitectura de capas — `VisorGlassMaterial` (fase 2)

```
<div relative inline-flex [box-shadow exterior]  data-glyph-mode="dark|light">
  Capa A  absolute inset-0  ← backdrop-filter SOLO blur/sat/bright — SIN filter (H1/H6 fix)
  Capa B  absolute inset-0  ← tint rgba(255,255,255,0.015) — casi imperceptible
  Capa C  VisorGlassLensLayer ← canvas (Chromium) o WebGL (Firefox); mix-blend-mode: soft-light 0.35–0.38
  Capa D  absolute inset-0  ← rim: hairline top + outer ring; SIN inset flood blanco
  Capa E  absolute inset-0  ← specular radial pointer (prefers-reduced-motion off)
  Capa F  relative z-[1]    ← children (GlassIcon adaptativo via useVisorGlassGlyphMode)
</div>
```

**Invariantes críticas:**
- `filter` NUNCA en la capa de backdrop-filter (fix H1/H6 — niebla blanca).
- `filter` del SVG lens sólo en el canvas de Capa C (elemento separado).
- `crossOrigin="anonymous"` en la img remota para habilitar muestreo de canvas.
- Nunca `transform` en el wrapper de controles (rompe backdrop sampling).

## Tokens — variante `clear` (visor)

| Token | Valor |
|-------|-------|
| blur | 10px |
| saturate | 1.2 |
| brightness | 1.08 |
| tint | rgba(255,255,255,0.015) |
| rimOpacity | 0.26 |
| rimTopOpacity | 0.44 |
| shadow | `0 6px 20px rgba(15,23,42,0.09), 0 2px 6px rgba(15,23,42,0.06)` |
| lensScale | 5 |
| enableLens | true (solo Chromium) |
| radius | 40px |
| radiusCompact | 32px |

## Vibrancy — modo dark (backdrop oscuro = fotos de estantería)

```css
/* Iconos y botones */
color: rgba(255,255,255,0.90);
filter: drop-shadow(0 1px 2px rgba(0,0,0,0.75)) drop-shadow(0 0 4px rgba(0,0,0,0.3));

/* Contador / texto */
color: rgba(255,255,255,0.90);
text-shadow: 0 1px 2px rgba(0,0,0,0.80), 0 0 6px rgba(0,0,0,0.35);

/* Divisores */
background: rgba(255,255,255,0.22);

/* Dots inactivos */
background: rgba(255,255,255,0.35);
/* Dots activos */
background: rgba(255,255,255,0.85);
```

> Para backdrop claro: invertir — texto oscuro `rgba(15,23,42,0.88)` + sombra blanca.

## Layer 3: rim (detalles)

```css
box-shadow:
  inset 0 0.5px 0 rgba(255,255,255,0.44),   /* hairline superior */
  inset 0 -0.5px 0 rgba(0,0,0,0.03),         /* sombra inferior tenue */
  0 0 0 0.75px rgba(255,255,255,0.26);        /* anillo exterior */
```

**Prohibido:** `inset 0 1px 0 rgba(255,255,255,0.35)` fuerte → hace que la píldora se vea lechosa.  
**Prohibido:** `background: rgba(255,255,255,>0.05)` en la capa de refracción.

## SVG Lens (Chromium only)

Filtro `feDisplacementMap` + `feGaussianBlur` — desplaza los píxeles del backdrop difuminado para crear efecto de refracción en los bordes:

```svg
<filter id="shelfy-glass-lens" x="-15%" y="-15%" width="130%" height="130%">
  <feTurbulence type="fractalNoise" baseFrequency="0.010 0.007" numOctaves="2" seed="5"/>
  <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G"/>
  <feGaussianBlur stdDeviation="0.25"/>
</filter>
```

- Aplicado a capa 1 vía `filter: url(#shelfy-glass-lens)` combinado con `backdrop-filter`
- Safari / Firefox: degradación graceful → mismo material Clear sin distorsión

## Reglas al reintegrar

1. **Una sola capa de refracción** — `backdrop-filter` en Layer 1, sin background.
2. **Rim ≠ inset flood** — usar hairline 0.5px + outer ring 0.75px.
3. **Vibrancy en iconos** — siempre con `drop-shadow` dual para legibilidad.
4. **Solo `opacity` en animaciones** del wrapper de controles — nunca `transform`.
5. **`filter`** en contenedor padre → rompe backdrop sampling → prohibido.
6. **Lensing** solo en Chromium — `isChromiumEngine()` guard en `visor-glass-lens.svg.ts`.

## Fallback matrix

| Browser | backdrop-filter | SVG lens | Resultado |
|---------|----------------|----------|-----------|
| Chrome / Edge | ✓ | ✓ | Clear + lensing (AC5) |
| Safari macOS / iOS | ✓ (-webkit-) | ✗ | Clear sin lens — misma legibilidad (AC6) |
| Firefox | ✓ | ✗ (bugs) | Clear sin lens — misma legibilidad (AC6) |
| Sin soporte | ✗ | ✗ | Pill visible solo por rim + shadow |

## Cómo probar

- Demo: `http://localhost:3000/visor/demo`
- Mock fit: `http://localhost:3000/visor?mock=fit`
- Glass bench: `http://localhost:3000/visor/glass-bench`
- Tests: `pnpm test src/components/visor/__tests__/`
