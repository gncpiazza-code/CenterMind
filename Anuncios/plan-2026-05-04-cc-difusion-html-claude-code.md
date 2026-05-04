# Plan (Claude Code) — Comunicación HTML: Cuentas Corrientes + Difusión

**Salida recomendada:** `Anuncios/generados/comunicacion-shelfy-cc-difusion/`  
_(Precedente de carpeta: ver `Anuncios/README.md`.)_

**Audiencia del entregable:** supervisores (comunicación masiva, sin llamadas uno a uno).  
**Responsable de ejecución:** Claude Code con acceso al **repositorio completo** y capacidad de **levantar el entorno, automatizar el navegador y generar capturas**.  
**El operador humano solo adjunta este plan + acceso al proyecto** (y credenciales/URL si el entorno lo exige).

---

## 1. Objetivo del entregable

Producir **uno o más archivos estáticos** en **`Anuncios/generados/comunicacion-shelfy-cc-difusion/`**:

- `index.html`
- `assets/` con PNG/WebP generados por el agente

El contenido debe:

1. **Anunciar** dos capacidades del producto:
   - **Cuentas corrientes en Supervisión** (vista/tab real del portal).
   - **Difusión** (`/difusion`): envío de **CC al Telegram del vendedor** de forma centralizada desde el portal.
2. Ser **visualmente creíble** como Shelfy: colores/layout alineados a `shelfy-frontend` (tema light-violet, topbar, tipografía).
3. Incluir **obligatoriamente**:
   - Una **captura automatizada real** del flujo **Difusión** en el navegador (ver §4).
   - Un **marco de celular** simulando al **vendedor** recibiendo el mensaje de cuentas (ver §5) y texto que recalque **cuán simple** es para el equipo seguir ese camino (“tres pasos en el portal → el vendedor lo ve en Telegram”).

---

## 2. Fuentes de verdad en el repo (léelas antes de redactar copy)

| Tema | Dónde mirar |
|------|-------------|
| UI Difusión | `shelfy-frontend/src/app/difusion/page.tsx`, `Topbar title="Difusión"` |
| API / dominio funcional | `CenterMind/routers/difusion.py` |
| **Texto real del mensaje/caption Telegram** (PDF adjunto + caption HTML) | `CenterMind/services/cc_difusion_service.py` → función `enviar_cc_vendedor`, bloque `caption_lines` (~líneas 371–381): título **"Cuentas Corrientes — {vendedor}"**, fecha **"Al dd/mm/aaaa"**, **Total deuda**, **N clientes deudores**. El mock del celular debe **copiar ese patrón** (con datos ficticios). |
| Supervisión / pestaña CC | `shelfy-frontend/src/components/admin/TabSupervision.tsx` (y rutas relacionadas `/supervision`) |
| Estilos / tokens | `shelfy-frontend/src/app/globals.css` |

**Prohibición:** inventar nombres de menús que contradigan los componentes; si falta texto exacto en UI, inferir desde los archivos anteriores.

---

## 3. Entregables concretos

1. **`Anuncios/generados/comunicacion-shelfy-cc-difusion/`**
   - `index.html`
   - `assets/` con imágenes generadas por el agente (p. ej. `shelfy-difusion.png`, `shelfy-supervision-cc.png`)
2. Opcional: `README.md` con comandos exactos que usaste para reproducir capturas (`pnpm dev`, Puerto, usuario de prueba ficticio).

**No commitear** secretos (.env completos); si hace falta `.env.example` ya existente, referenciarlo.

---

## 4. Capturas REALES — responsabilidad de Claude Code (obligatorio)

El agente **debe** obtener capturas del **frontend Shelfy**, no pedirlas al usuario.

### 4.1 Estrategia recomendada

1. **Levantar** `shelfy-frontend` en local (`pnpm install` / `npm install` según lockfile del proyecto).
2. Configurar `NEXT_PUBLIC_API_URL` **apuntando a entorno navegable** (staging o local con backend si hace falta login con datos).
3. Usar **Playwright** (o herramienta equivalente instalada temporalmente **en el proyecto o en scripting local**) para:
   - Abrir login del portal (ruta según App Router actual).
   - Autenticarse con credenciales proporcionadas por **variables de entorno seguras** o archivo local **gitignored** que el operador coloca antes de correr (el plan no asume credenciales en el doc).
4. **Navegar y capturar** (viewport desktop recomendado **1280×720** o **1440×900**, `deviceScaleFactor: 2` para nitidez):
   - **`/difusion`**: estado “listo para enviar” con sucursal y vendedor seleccionados (datos reales de staging o demo; **anonimizar** con blur en nombres de clientes/PDV si la captura lo requiere para privacidad).
   - **`/supervision`**: pestaña **Cuentas Corrientes** visible y con tabla/listado razonable (si no hay datos, indicar en el HTML un disclaimer *“imagen de entorno de demostración”* y capturar igual el layout vacío o con fixtures si existen en dev).

### 4.2 Si el login automatizado falla

- Documentar el fallo en `README.md` del entregable.
- **Plan B aceptable:** Playwright con **`storageState.json`** generado una vez (el agente deja script `scripts/save-auth-state.mjs` y el operador ejecuta un login manual + guardado de estado — **solo si** el automatismo directo es imposible). El objetivo sigue siendo **cero solicitud de “mandame capturas”** al usuario final; el operador que corre Claude solo provee credenciales/estado si hace falta.

### 4.3 Tratamiento de imágenes

- Guardar en `assets/*.png` o `.webp`.
- Referenciar en `index.html` con rutas relativas.
- Opcional: incrustación `base64` para un solo archivo portátil — **solo** si no infla demasiado el HTML.

---

## 5. Mock del celular — vendedor recibiendo CC (obligatorio)

Por **privacidad y fiabilidad**, el “Telegram del vendedor” normalmente **no** se automatiza contra un chat real del cliente final.

### 5.1 Enfoque requerido

- Construir en **HTML/CSS** un **marco de smartphone** genérico (sin logos de marca de terceros copiados; estilo inspirado en app de mensajería).
- Dentro del chat, **reproducir fielmente el tipo de contenido** que envía Shelfy según código:
  - Caption con HTML equivalente visible (bold simulado con CSS): líneas como en `cc_difusion_service.enviar_cc_vendedor`:
    - Encabezado **Cuentas Corrientes — {nombre vendedor}**
    - **Al dd/mm/aaaa**
    - **Total deuda** en pesos formato legible ficticio.
    - **N clientes deudores**.
  - Una **pastilla/card** inferior simulando **documento PDF adjunto** (icono archivo + nombre tipo `CC_NOMBRE_YYYYMMDD.pdf`) porque el backend usa `sendDocument` con PDF cuando ReportLab está disponible.

### 5.2 Mensaje de producto junto al mock

- Flecha o copy: **“Desde Difusión en el portal → llega al celular del vendedor en segundos.”**
- Bullets: **sin llamadas**, **mismo canal que ya usan** (Telegram), **PDF con detalle** para que no quede solo el resumen.

---

## 6. Estructura del `index.html` (secciones fijas)

1. **Hero:** título, fecha, “para supervisores”, leyenda **“Material interno — datos de ejemplo o entorno de prueba”**.
2. **Sección A — Cuentas corrientes en Supervisión:** captura `assets/...` + 3–4 pasos (dónde entrar, filtro sucursal si aplica, qué ven).
3. **Sección B — Difusión:** captura `assets/...` del portal + numeración **1 → 2 → 3** (sucursal / vendedor / enviar).
4. **Sección C (obligatoria):** layout **dos columnas** en desktop (stack en mobile):
   - Izquierda: miniatura o recorte de la vista Difusión.
   - Derecha: **mock celular** Telegram (§5).
   - Conector visual “Portal → Celular”.
5. **Cierre:** frase de apoyo al cambio + contacto interno (placeholder `[[CONTACTO]]` para que el operador reemplace en 10 s).

---

## 7. UX/HTML técnico

- **Responsive**; legible en móvil.
- **Contraste** alto (evitar gris claro sobre blanco para cuerpo).
- **Animaciones** opcionales y **respetar `prefers-reduced-motion`**.
- **Sin dependencias CDN obligatorias** (si se usa fuente externa, documentar y preferir stack del sistema).
- **Accesibilidad básica:** `lang="es"`, `alt` descriptivos en capturas.

---

## 8. Orden de trabajo sugerido para Claude Code

1. Leer archivos de §2; anotar textos reales de UI.
2. Levantar frontend + resolver auth (§4).
3. Generar capturas en `assets/`.
4. Redactar copy en español claro (LATAM), sin jerga innecesaria.
5. Maquetar `index.html` con estilos inline o `<style>` (o un un CSS local en la misma carpeta).
6. Implementar mock del celular (§5) alineado al caption/PDF del servicio.
7. Revisar en Chrome y Safari (si disponible) y ajustar breakpoints.
8. Entregar diff o instrucciones de commit; **no** subir credenciales.

---

## 9. Criterios de aceptación (checklist)

- [ ] Existe captura real de **`/difusion`** en `assets/`.
- [ ] Existe captura real de **Supervisión con CC** en `assets/` (o disclaimer explícito si el entorno no tiene datos + captura de layout).
- [ ] Hay **marco de celular** con mensaje tipo Telegram que refleje el formato de **`cc_difusion_service.enviar_cc_vendedor`** (caption + mención/indicador de PDF).
- [ ] Se explica explícitamente la **simpleza del flujo** portal → Telegram.
- [ ] Directorio `Anuncios/generados/comunicacion-shelfy-cc-difusion/` listo para compartir (HTML + assets).
- [ ] Leyenda de datos ficticios/demo visible.

---

## 10. Fuera de alcance

- Llamadas a API en tiempo real desde el HTML.
- Automatización de envío Telegram real contra producción desde el mismo entregable.
- Soporte oficial de marca Telegram (solo mock visual genérico).

---

*Plan generado para adjuntar a Claude Code junto al acceso al repositorio. Precedente: `Anuncios/README.md`.*
