# Anuncios Shelfy — planes para HTML informativo (Claude Code)

Esta carpeta concentra **especificaciones detalladas** para que **Claude Code** (u otro agente con acceso al repo) genere **páginas HTML estáticas** informativas: avisos a supervisores, onboarding de features, capturas reales del portal, mocks de dispositivo cuando aplique, etc.

---

## Precedente operativo

Cuando pidas un anuncio nuevo, la secuencia esperada es:

1. **Pedido al agente (Cursor/Claude)**  
   En la misma solicitud indicá al menos:
   - **Funcionalidad o conjunto de features** a comunicar (nombre en producto / ruta).
   - **Audiencia** (ej. supervisores, administradores, dirección).
   - **Requisitos visuales especiales** (ej. “incluir celular simulando Telegram”, “solo capturas desktop”, “sin datos reales”).
   - Frase tipo: *«Seguí el proceso de `Anuncios/README.md` y la `PLANTILLA-plan-anuncio-html-claude-code.md`».*

2. **El agente escribe un plan**  
   - Nuevo archivo: **`Anuncios/plan-YYYY-MM-DD-<slug-corto>-html-claude-code.md`**.  
   - Debe completar la **plantilla** con rutas reales del repo, tablas “fuentes de verdad”, checklist y criterios de aceptación **específicos** de esa función.  
   - No incluir credenciales en el markdown.

3. **Ejecución en Claude Code**  
   - Adjuntás **solo** ese plan + **acceso al repositorio**.  
   - Claude Code implementa: entorno, Playwright/capturas si el plan lo exige, `index.html`, `assets/`, etc., en la **ruta de salida** definida en ese plan (por convención **`Anuncios/generados/<slug>/`**).

4. **Salidas generadas**  
   - Carpeta recomendada: **`Anuncios/generados/<slug>/`** (`index.html`, `assets/`, `README.md` opcional con comandos para reproducir capturas).  
   - Los artefactos pueden ser grandes: si no deben versionarse, agregá `Anuncios/generados/*` al `.gitignore` del repo (decisión de equipo).

---

## Archivos en esta carpeta

| Archivo | Uso |
|---------|-----|
| **`PLANTILLA-plan-anuncio-html-claude-code.md`** | Base para **cada** nuevo plan. Copiar mentalmente su estructura al crear `plan-YYYY-MM-DD-...`. |
| **`plan-*-html-claude-code.md`** | Planes concretos listos para adjuntar a Claude Code. |
| **`generados/`** | Destino **recomendado** del HTML y capturas que produzca el agente ejecutor (un subdirectorio por anuncio). |

### Ejemplo ya redactado

- `plan-2026-05-04-cc-difusion-html-claude-code.md` — Cuentas corrientes en Supervisión + Difusión (Telegram / mock celular obligatorio según ese plan).

---

## Convenciones rápidas para quien redacta planes

- **Fuentes de verdad:** siempre tablas con paths bajo `shelfy-frontend/` y `CenterMind/` (o `CLAUDE.md`).
- **Capturas:** si el anuncio muestra el producto real, el plan debe indicar que **el agente ejecutor** las obtiene (Playwright, etc.), no el lector final del HTML.
- **Privacidad:** blur/anonimización en capturas con datos de clientes si el entorno tiene datos reales.
- **Brand:** alinear a tema light-violet y tokens en `globals.css` (no reinventar paleta en el copy del plan sin mirar el repo).
- **Un solo lugar de verdad para “cómo pedir anuncios”:** este `README.md`.

---

*Precedente establecido para reutilizar en cada nueva función que deba anunciarse con HTML informativo.*
