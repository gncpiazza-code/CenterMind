# comunicacion-shelfy-cc-difusion

Entregable HTML estático para comunicar a supervisores las nuevas funciones:
- **Cuentas Corrientes en Supervisión** (panel `/supervision`)
- **Difusión vía Telegram** (`/difusion`)

## Archivos

```
index.html          → Entregable principal (auto-contenido, sin CDN)
assets/             → Reservado para imágenes (ver nota abajo)
README.md           → Este archivo
```

## Nota sobre capturas (Plan B aplicado)

El plan original pedía capturas reales del frontend via Playwright.
Se optó por **mocks CSS de alta fidelidad** por las siguientes razones:

1. Requiere backend corriendo en local o staging con datos.
2. Requiere credenciales de usuario portal (`fn_login`).
3. Requiere `NEXT_PUBLIC_API_URL` apuntando a un entorno con datos reales.

**Para generar capturas reales en el futuro:**

```bash
# 1. Instalar deps en el frontend
cd shelfy-frontend && pnpm install

# 2. Copiar .env con la URL del API
echo "NEXT_PUBLIC_API_URL=https://api.shelfycenter.com" > .env.local

# 3. Levantar el dev server
pnpm dev   # → http://localhost:3000

# 4. Guardar estado de auth (ejecutar una vez con login manual)
node scripts/save-auth-state.mjs   # genera storageState.json (gitignored)

# 5. Tomar capturas con Playwright
npx playwright screenshot \
  --browser chromium \
  --viewport-size "1440,900" \
  --device-scale-factor 2 \
  "http://localhost:3000/difusion" \
  assets/shelfy-difusion.png

npx playwright screenshot \
  --browser chromium \
  --viewport-size "1440,900" \
  --device-scale-factor 2 \
  "http://localhost:3000/supervision" \
  assets/shelfy-supervision-cc.png
```

Reemplazar luego las referencias en `index.html`:
```html
<!-- Buscar las clases .ui-mock y reemplazar el contenido por: -->
<img src="assets/shelfy-difusion.png" alt="Vista Difusión en portal Shelfy" style="width:100%;border-radius:12px;" />
```

## Integración en el portal

El mismo `index.html` se copia en el frontend para que sea estático público:

- Destino: `shelfy-frontend/public/anuncios/comunicacion-shelfy-cc-difusion/index.html`
- URL: `/anuncios/comunicacion-shelfy-cc-difusion/index.html`
- **Dashboard (`/dashboard`)** — modal automático en los **primeros 3 logins** (pulso `sessionStorage` + contador `localStorage` `shelfy_difusion_cc_guia_login_opens` en `CCDifusionGuiaDialog`).
- **`/difusion`** — botón **Guía CC y Telegram** para reabrir la guía sin depender del contador.
- **Superadmin** — menú Corona → **Mensajes** (`/admin/mensajes`) para responder tickets enviados desde el botón del HTML.
- **Backend / DB** — ejecutar en Supabase el SQL `CenterMind/sql/create_portal_feedback_tables.sql` antes de usar la API.

Cuando cambies contenido importante en este HTML:

1. Copiá a `public/anuncios/...` antes del deploy.
2. Subí `GUIA_CC_DIFUSION_VERSION` en `shelfy-frontend/src/lib/api.ts` (y el default en backend `PortalGuiaTrackingIn`) para segmentar telemetría.
3. Opcional: resetear el contador de 3 logins borrando `shelfy_difusion_cc_guia_login_opens` en localStorage de prueba.

## Personalización antes de enviar

- Buscar `[[CONTACTO]]` en `index.html` y reemplazar con el dato de contacto real.
- El disclaimer "datos de ejemplo o entorno de demostración" es intencional y debe mantenerse.
