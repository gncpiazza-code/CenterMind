# Cómo configurar Railway (sin tecnicismos)

## Cómo puede ayudar el asistente (y qué no puede hacer)

- **No** existe un login “mío” a Railway. El asistente no abre el panel en un navegador con tu usuario.
- **Sí** puede, en **tu** Mac, si en `ShelfMind-RPA/.env.railway` (ignorado por git) tenés:
  - las variables de la **app** (Supabase, `SHELFY_API_KEY`, etc.), y
  - además un **`RAILWAY_API_TOKEN`** = token de **cuenta** creado en [railway.app](https://railway.app) → **Account** → **Tokens** / **API** (no es `SHELFY_API_KEY`, no es la clave de Supabase).
- Luego, en terminal: `set -a && source .env.railway && set +a` y ahí `npx @railway/cli@latest whoami` / `link` / `python3 scripts/push_railway_env.py` pueden correr con contexto. Copiá tu plantilla del Escritorio a **`CenterMind/ShelfMind-RPA/.env.railway`** (mismo repo) y agregá esa línea de `RAILWAY_API_TOKEN` si el login con navegador del CLI te falla.

## Por qué el asistente no pudo “entrar y configurar” solo

Railway, Supabase y el backend viven en **tus** cuentas, con **tu** contraseña o token. **Nadie puede conectarse desde acá a tu panel** (sería inseguro). Lo que sí hicimos en el código: Docker, horarios, variables que el contenedor lee. Falta un paso que **solo vos** hacés en 5–10 minutos, o con un archivo local + un comando.

## Qué te pedimos (mínimo: 3 cosas) y dónde buscarlas

Rellená: `ShelfMind-RPA/.env.railway.example` → copiar a `ShelfMind-RPA/.env.railway` y completar.

| Dato | Cómo lo encontrás |
|------|--------------------|
| **SUPABASE_URL** | Supabase: **Settings** → **API** → **Project URL** |
| **SUPABASE_KEY** o **SUPABASE_SERVICE_KEY** | Misma pantalla: clave **service_role**; o copiá la variable `SUPABASE_KEY` del **mismo** Railway donde está el backend (alcanza con una) |
| **SHELFY_API_URL** | *Opcional.* El RPA ahora toma **por defecto** `https://api.shelfycenter.com` si no definís nada. Si tu API es otra, podés poner `SHELFY_API_URL`, o `API_URL` / `BACKEND_URL` / `PUBLIC_API_URL` en el servicio |
| **SHELFY_API_KEY** | **Railway** (servicio del **backend** → **Variables**). No es la contraseña de Supabase |

Nada de esto debería subirse a GitHub. El `.env.railway` está en `.gitignore`.

---

## Opción A (recomendada): solo el navegador, sin terminal

1. **railway.com** → iniciar sesión.
2. **New Project** → **Deploy from GitHub** → elegí el repo `CenterMind`.
3. Creado el servicio, abrí **Settings** → **Root directory** = `ShelfMind-RPA` (sin barra, exacto). Guardar.
4. Pestaña **Variables** (o **Raw**). Pegá lo de `.env.railway` (al menos `SUPABASE_URL`, `SUPABASE_KEY` o `SUPABASE_SERVICE_KEY`, y `SHELFY_API_KEY`; la URL pública de la API puede omitirse). 
5. Aumentá la **memoria (RAM)** del servicio a al menos **1 GB** (plan según te deje Railway).
6. Hacé **Deploy** / dejá que vuelva a desplegar. Revisá **Deploy Logs** → debería construir con Docker y arrancar `scheduler.py`.

## Opción B: terminal (script que sube variables)

En tu Mac, en la raíz `ShelfMind-RPA`:

1. `cp .env.railway.example .env.railway` y editá los valores reales.
2. `npx @railway/cli@latest login` (abre el navegador).
3. `npx @railway/cli@latest link` (elegí el proyecto y el servicio que tenga el RPA).
4. `python3 scripts/push_railway_env.py` — sube las claves a Railway (sin commitearlas al repo).

## Login del CLI (una vez, en tu Mac)

Para no depender del navegador y poder usar comandos con ayuda de Cursor/terminal:

1. `cd` a `ShelfMind-RPA`.
2. `npx @railway/cli@latest login` — abre el navegador; confirmá con tu cuenta de Railway.
3. `npx @railway/cli@latest link` — elegí el **mismo** proyecto y servicio donde deplegás el RPA.

Eso **guarda la sesión en tu máquina** (no en el repo de Git). El asistente no “conserva” la contraseña entre charlas, pero en futuras tareas puede ejecutar `railway logs`, `railway variable`, `railway up`, etc., **mientras** uses la terminal de este proyecto y sigas logueada/o.

**No pegues** tokens de Railway en el chat. Si hace falta un token (CI o otro), generalo en *Account → Tokens* y guardalo en un archivo local ignorado por git, nunca en el repositorio.

### Si al hacer `login` el navegador “autorizó” pero la terminal sigue: `Unauthorized`

1. **El aviso de npm** (`tar` / `i@izs.me`) es **ruido** de una dependencia, no de Railway. Podés ignorarlo.
2. **Causa típica:** en el entorno quedó un `RAILWAY_TOKEN` / `RAILWAY_API_TOKEN` **viejo o de proyecto** y el CLI lo usa *antes* que el login. En la **misma** ventana de terminal, ejecutá:
   ```bash
   unset RAILWAY_TOKEN RAILWAY_API_TOKEN
   env | grep RAILWAY || true
   ```
   Si aún salía `RAILWAY_...` buscá en `~/.zshrc` / `~/.bash_profile` y comentá líneas `export RAILWAY_TOKEN=...` si existen.
3. **Limpiar sesión guardada** y volver a entrar:
   ```bash
   rm -rf ~/.railway
   npx @railway/cli@latest login
   npx @railway/cli@latest whoami
   ```
4. **Probar otra vía (pairing):** `npx @railway/cli@latest login --browserless` (el CLI te da una URL y un código; lo confirmás en el navegador).
5. **Método estable: token de cuenta (recomendado para CI o si el browser falla):** [Railway](https://railway.app) → **Account / avatar** → **Settings** o **Account tokens** → crear un token **a nivel de cuenta** (a veces lo llaman *Account token*; no un token solo de *un* proyecto, si falla `whoami`). Luego, **solo** para esa terminal:
   ```bash
   unset RAILWAY_TOKEN
   export RAILWAY_API_TOKEN="pega_el_token_solo_en_tu_Mac"
   npx @railway/cli@latest whoami
   ```
   (El CLI a veces requiere `RAILWAY_API_TOKEN` para acciones de cuenta. Si dejés `RAILWAY_TOKEN` exportada con otro valor, el CLI puede **priorizar** esa y fallar: por eso el `unset` primero.)
6. Instalación global a veces ayuda: `brew install railway` o `npm i -g @railway/cli@latest` y usá el comando `railway` fijo, no solo `npx` (misma lógica de arriba).

Luego, desde `ShelfMind-RPA`: `npx @railway/cli@latest link` (o `railway link`).

---

## Si no encontrás un valor

- **Supabase**: [Supabase](https://supabase.com) → el proyecto de Shelfy → **Settings** → **API** (toda la sección de URLs y claves en una sola pantalla).
- **Clave del backend (RPA)**: alguien que tenga acceso a **Railway (servicio del API Python)** o al `.env` de deploy del backend (no al repo publicado).

Nada de esto requiere que le des tu contraseña a un chat: solo copiar/pegar los valores en **tu** panel de Railway o en un `.env.railway` local.
