# Deploy ShelfMind-RPA en Railway (Docker)

> **Si esto suena a chino:** leé primero [`CONFIGURAR-RAILWAY.md`](./CONFIGURAR-RAILWAY.md) (dónde buscar cada dato, paso a paso). Es el mismo despliegue, explicado palabra por palabra.

## Qué despliega

- **Imagen**: `Dockerfile` (Playwright Python 1.51 + Chromium del sistema de la imagen oficial).
- **Proceso por defecto**: `RPA_START_MODE=scheduler` → `scheduler.py` (APScheduler, zona **America/Argentina/Buenos_Aires**).
- **Un solo servicio** siempre encendido; no hace falta abrir puertos HTTP.

## Pasos en Railway

1. **New project** → **Deploy from GitHub** (este repo).
2. En el servicio: **Settings → Root Directory** = `ShelfMind-RPA` (así toma `Dockerfile` y `railway.toml` de esta carpeta).
3. **Variables** (mínimo; **no** commitear `.env`):

   | Variable | Uso |
   |----------|-----|
   | `SUPABASE_URL` | Proyecto Supabase (Vault) |
   | `SUPABASE_KEY` o `SUPABASE_SERVICE_KEY` | Una basta; misma lógica que en el backend |
   | `SHELFY_API_KEY` | `X-Api-Key` hacia el API (obligatoria) |
   | `SHELFY_API_URL` o `API_URL` | *Opcional:* si falta, el código usa `https://api.shelfycenter.com` (ver `lib/shelfy_config.py`) |

4. **Recursos**: asignar al menos **1 GB RAM** (Playwright + Excel + pandas).
5. Deploy. En **Logs** deberías ver el banner del scheduler y la próxima ejecución de jobs.

## Opcionales

| Variable | Descripción |
|----------|-------------|
| `RPA_HEADLESS` | `true` (defecto en imagen) — no poner `false` en Railway salvo depuración excepcional. |
| `RPA_START_MODE` | `scheduler` (defecto), o una corrida única: `cuentas`, `ventas`, `padron`, `sigo`, `todos` (útil para pruebas; en producción conviene `scheduler`). |
| `RPA_DATA_DIR` | Si más adelante montás un volumen, ruta base para `downloads/.hashes.json` (por defecto `/app/downloads` dentro del contenedor). |

## Horarios (scheduler)

Definidos en `scheduler.py`: padrón 04:00, cuentas 07:00 y 16:00, ventas 07:30 / 15:00 / 23:00 (hora Argentina). Ajustar ahí si hace falta.

## Notas

- El contenedor **no incluye** credenciales: las resuelve el código vía Supabase Vault + variables de arriba.
- Cada deploy nueva imagen: el directorio `/app` es **efímero**; los hashes de duplicado viven en `/app/downloads` y se resetean al redeploy (puede re-subir si el Excel no cambió; el backend debería seguir siendo idempotente con el snapshot del día).
