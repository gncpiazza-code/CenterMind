# Plan (Claude Code) — Comunicación HTML: [[NOMBRE_FUNCION_O_ANUNCIO]]

**Fecha del plan:** [[YYYY-MM-DD]]  
**Slug de salida:** `[[slug-carpeta-generados]]` (ej. `reporteria-upload`, `bonos-q2`)

**Audiencia del entregable:** [[ej. supervisores · administradores · dirección]]  
**Responsable de ejecución:** Claude Code con acceso al **repositorio completo** y, si aplica, capacidad de **levantar el entorno, automatizar el navegador y generar capturas**.  
**El operador humano** adjunta este plan + acceso al proyecto + credenciales/URL por canal seguro si hace falta (no van en este archivo).

---

## 1. Objetivo del entregable

Producir archivos estáticos en **`Anuncios/generados/[[slug-carpeta-generados]]/`**:

- `index.html`
- `assets/` (capturas, iconos exportados, etc.)

Que [[describir en 2–4 viñetas qué se anuncia, tono, y qué debe recordar el lector]].

**Requisitos visuales específicos de ESTE anuncio:**

- [[ej. captura de /ruta · mock de celular · diagrama · antes/después]]
- [[opcional: “no incluir datos reales” · “solo modo claro”]]

---

## 2. Fuentes de verdad en el repo (léelas antes de redactar copy)

| Tema | Dónde mirar (paths reales; completar al redactar el plan) |
|------|-----------------------------------------------------------|
| UI principal | `shelfy-frontend/src/app/...` |
| Componentes | `shelfy-frontend/src/components/...` |
| API / comportamiento | `CenterMind/routers/...`, `CenterMind/services/...` |
| Estilos / tokens | `shelfy-frontend/src/app/globals.css` |
| Convenciones producto | `CLAUDE.md` |

**Prohibición:** inventar nombres de menús o rutas que contradigan el código; si falta texto exacto, inferir desde los archivos anteriores.

---

## 3. Entregables concretos

1. **`Anuncios/generados/[[slug-carpeta-generados]]/`**
   - `index.html`
   - `assets/` con imágenes [[generadas por Playwright / exportadas / mocks]]
2. Opcional: `README.md` en esa carpeta con comandos para reproducir capturas (`pnpm dev`, puerto, notas de auth).

**No commitear** secretos (.env completos).

---

## 4. Capturas del producto (si aplica)

[[Si NO aplica, escribir “N/A” y eliminar subsecciones innecesarias.]]

El agente ejecutor **debe** obtener capturas del frontend Shelfy cuando este plan marque **Sí**.

### 4.1 Estrategia

1. Levantar `shelfy-frontend` [[+ backend si hace falta]].
2. `NEXT_PUBLIC_API_URL` → [[staging / local]].
3. **Playwright** (u otra herramienta documentada): login [[ruta login]], navegar a [[rutas exactas]], viewport [[ej. 1440×900, deviceScaleFactor 2]].
4. Guardar en `assets/*.png` o `.webp`.

### 4.2 Si el login automatizado falla

Plan B: `storageState.json` + script documentado; el operador corre un login manual una vez.

### 4.3 Privacidad

[[Blur / datos ficticios / disclaimer en el HTML]]

---

## 5. Mocks o ilustraciones no capturables (si aplica)

[[ej. marco de celular en HTML/CSS · mock de Telegram · diagrama de flujo · infografía]]

Describir **qué** debe mostrarse y **qué** tomar del código (ej. formato de mensaje, campos de una tabla).

---

## 6. Estructura del `index.html` (secciones)

1. **Hero:** título, fecha, audiencia, leyenda legal/demo.
2. **Sección/es de producto:** [[orden lógico para contar la historia]].
3. **[[Secciones extra]]**
4. **Cierre:** contacto `[[CONTACTO]]` o placeholder.

---

## 7. UX/HTML técnico

- Responsive; contraste alto.
- `prefers-reduced-motion` si hay animaciones.
- Sin CDN obligatorias; `lang="es"`; `alt` en imágenes.

---

## 8. Orden de trabajo sugerido para Claude Code

1. Leer §2 del plan.
2. [[Pasos específicos]]
3. Generar `index.html` + `assets/`.
4. Checklist §9.

---

## 9. Criterios de aceptación (checklist)

- [ ] [[criterio 1]]
- [ ] [[criterio 2]]
- [ ] [[...]]
- [ ] Directorio `Anuncios/generados/[[slug]]/` listo para compartir.
- [ ] Leyenda de demo/datos ficticios si corresponde.

---

## 10. Fuera de alcance

[[Qué no debe hacer el HTML ni el agente]]

---

*Plan listo para adjuntar a Claude Code junto al repositorio CenterMind. Precedente: `Anuncios/README.md`.*
