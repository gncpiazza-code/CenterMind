# 🚀 Shelfy — Hoja de Ruta: Migración a React + FastAPI

> **Documento generado:** Febrero 2026
> **Proyecto:** CenterMind / Shelfy
> **Stack actual:** Python · Streamlit · FastAPI · SQLite · Telegram Bot
> **Stack objetivo:** React (Next.js) · FastAPI (ya existe) · SQLite · Telegram Bot

---

## Índice

1. [Arquitectura Actual](#1-arquitectura-actual)
2. [Arquitectura Objetivo](#2-arquitectura-objetivo)
3. [Por qué migrar — Problemas concretos de Streamlit](#3-por-qué-migrar)
4. [Qué se mantiene igual](#4-qué-se-mantiene-igual)
5. [Comparativa de stacks](#5-comparativa-de-stacks)
6. [Plan por fases](#6-plan-por-fases)
7. [Desglose archivo por archivo](#7-desglose-archivo-por-archivo)
8. [Tecnologías recomendadas](#8-tecnologías-recomendadas)
9. [Estructura de carpetas del proyecto nuevo](#9-estructura-de-carpetas-del-proyecto-nuevo)
11. [Checklist final de migración](#11-checklist-final-de-migración)
12. [Riesgos y mitigaciones](#12-riesgos-y-mitigaciones)

---

## 1. Arquitectura Actual

```
┌─────────────────────────────────────────────────────────┐
│                    PC LOCAL (Windows)                   │
│                                                         │
│  ┌──────────────┐    ┌───────────────────────────────┐  │
│  │  Telegram    │    │  Panel Maestro (.exe / .py)   │  │
│  │  Bot Worker  │    │  Tkinter GUI — gestión local  │  │
│  │  bot_worker  │    └───────────────────────────────┘  │
│  │  .py         │                                       │
│  └──────┬───────┘                                       │
│         │                                               │
│  ┌──────▼────────────────────────────────────────────┐  │
│  │              FastAPI  (api.py)                    │  │
│  │              Puerto 8000                          │  │
│  │  • /consulta      • /admin/usuarios               │  │
│  │  • /dashboard     • /admin/broadcast              │  │
│  │  • /reportes      • /health                       │  │
│  └──────┬────────────────────────────────────────────┘  │
│         │                                               │
│  ┌──────▼──────────┐   ┌──────────────────────────────┐ │
│  │  SQLite DB      │   │  Google Drive Backup         │ │
│  │  centermind.db  │   │  (credencial_drive.json)     │ │
│  └─────────────────┘   └──────────────────────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Cloudflare Tunnel                               │   │
│  │  localhost:8000  →  https://shelfy-xxxx.trycloudflare.com │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│               STREAMLIT CLOUD (o local)                 │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  StreamLitApp/                                   │   │
│  │  app.py  →  login + menú principal               │   │
│  │  pages/                                          │   │
│  │    1a_Visor_pc.py      1b_Visor_mobile.py        │   │
│  │    2a_Dashboard_pc.py  2b_Dashboard_mobile.py    │   │
│  │    3a_Admin_pc.py      3b_Admin_mobile.py        │   │
│  │    4a_Reportes_pc.py   4b_Reportes_mobile.py    │   │
│  │  styles.py  →  CSS inline via st.markdown()      │   │
│  │  utils.py   →  helpers (auth, requests)          │   │
│  └──────────────────────────────────────────────────┘   │
│                  │ requests HTTP                         │
│                  ▼                                       │
│       API_URL (Cloudflare Tunnel URL)                   │
└─────────────────────────────────────────────────────────┘
```

### Archivos clave actuales

| Archivo | Rol |
|---|---|
| `api.py` | Backend FastAPI — todos los endpoints |
| `bot_worker.py` | Bot de Telegram — lógica de usuarios |
| `centermind_core.py` | Lógica central compartida |
| `base_datos/centermind.db` | Base de datos SQLite |
| `StreamLitApp/app.py` | Login + routing de páginas |
| `StreamLitApp/styles.py` | CSS generado como string Python |
| `StreamLitApp/pages/*.py` | 8 páginas (4 vistas × 2 breakpoints) |
| `StreamLitApp/utils.py` | Auth, llamadas API, helpers |
| `panel_maestro.py` | GUI local Tkinter para administración |

---

## 2. Arquitectura Objetivo

```
┌─────────────────────────────────────────────────────────┐
│                    PC LOCAL (Windows)                   │
│                                                         │
│  ┌──────────────┐    ┌───────────────────────────────┐  │
│  │  Telegram    │    │  Panel Maestro (.exe)         │  │
│  │  Bot Worker  │    │  (sin cambios)                │  │
│  │  (sin cambios│    └───────────────────────────────┘  │
│  └──────┬───────┘                                       │
│         │                                               │
│  ┌──────▼────────────────────────────────────────────┐  │
│  │         FastAPI  (api.py)  ← sin cambios          │  │
│  │         Puerto 8000                               │  │
│  │  AGREGAR: /auth/login (JWT token)                 │  │
│  │  AGREGAR: CORS para origen Next.js                │  │
│  └──────┬────────────────────────────────────────────┘  │
│         │                                               │
│  ┌──────▼──────────┐   ┌──────────────────────────────┐ │
│  │  SQLite DB      │   │  Google Drive Backup         │ │
│  │  (sin cambios)  │   │  (sin cambios)               │ │
│  └─────────────────┘   └──────────────────────────────┘ │
│                                                         │
│  Cloudflare Tunnel  →  expone puerto 8000 (igual)       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│          VERCEL / NETLIFY / CUALQUIER HOSTING           │
│          (o localhost:3000 en desarrollo)               │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  shelfy-frontend/  (Next.js + React)             │   │
│  │                                                  │   │
│  │  app/                                            │   │
│  │    (login)/page.tsx        ← pantalla de login   │   │
│  │    dashboard/page.tsx      ← dashboard KPIs      │   │
│  │    visor/page.tsx          ← visor de mensajes   │   │
│  │    admin/page.tsx          ← administración      │   │
│  │    reportes/page.tsx       ← reportes y CSV      │   │
│  │                                                  │   │
│  │  components/               ← botones, tablas     │   │
│  │  hooks/                    ← useAuth, useApi     │   │
│  │  lib/api.ts                ← todas las llamadas  │   │
│  │  styles/globals.css        ← paleta Shelfy       │   │
│  └──────────────────────────────────────────────────┘   │
│                  │ fetch() / axios                       │
│                  ▼                                       │
│       API_URL (Cloudflare Tunnel — igual que hoy)       │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Por qué migrar

### Problemas concretos encontrados en este proyecto

| Problema | Causa Streamlit | Solución con React |
|---|---|---|
| **El logo aparece con fondo blanco** | `st.image()` fuerza `<img>` dentro de un div con fondo blanco; tuvimos que recurrir a base64 SVG inline | En React simplés `<img src={logo} className="logo" />` con CSS total |
| **No se pueden poner íconos SVG/PNG en botones** | `st.button()` solo acepta texto plano — no HTML | `<button><img src="icon.svg" /> Texto</button>` |
| **8 páginas duplicadas pc/mobile** | Streamlit no tiene breakpoints responsive reales — tuviste que crear `1a_Visor_pc.py` y `1b_Visor_mobile.py` para cada vista | Un solo componente React con CSS media queries |
| **CSS se inyecta como string Python** | `st.markdown("<style>...</style>", unsafe_allow_html=True)` — frágil, sin autocompletado, sin linting | Archivo `.css` / `.module.css` / Tailwind con soporte completo |
| **Cada click re-ejecuta todo el archivo Python** | El modelo de Streamlit es "script de arriba a abajo" — cada interacción recarga todo | React solo re-renderiza el componente que cambió (Virtual DOM) |
| **No hay estado de navegación real** | `st.session_state` es un diccionario global manual | React Router / Next.js con rutas reales y URL limpias |
| **Animaciones CSS limitadas** | `@property --angle` y `@keyframes` solo funcionaron parcialmente dentro del `unsafe_allow_html` | CSS normal — funciona todo: `@property`, `@keyframes`, `@layer`, etc. |
| **Loading lento al cambiar de página** | Cada página es un nuevo script Python ejecutado desde cero | SPA: la navegación es instantánea, solo carga datos nuevos |
| **No hay WebSockets nativos** | Polling manual con `st.rerun()` — agresivo con la CPU | `useEffect` + `EventSource` o WebSocket nativo |
| **Deploy complicado (pc/mobile separadas)** | 8 archivos de página en Streamlit Cloud | Una sola app en Vercel — `git push` y listo |

---

## 4. Qué se mantiene igual

> **La mayor ventaja**: el trabajo más difícil (backend, base de datos, bot) ya está hecho y NO cambia.

| Componente | Cambia | Notas |
|---|---|---|
| `api.py` (FastAPI) | ⚠️ Mínimo | Solo agregar CORS y un endpoint `/auth/login` |
| `bot_worker.py` | ✅ Nada | El bot de Telegram es completamente independiente |
| `centermind_core.py` | ✅ Nada | Lógica central sin tocar |
| `base_datos/centermind.db` | ✅ Nada | SQLite igual |
| `panel_maestro.py` | ✅ Nada | GUI Tkinter local, no se toca |
| `hardening/` | ✅ Nada | Seguridad del sistema igual |
| `credencial_drive.json` | ✅ Nada | Google Drive igual |
| Cloudflare Tunnel | ✅ Nada | Sigue exponiendo el puerto 8000 |
| `compilar_panel.bat` | ✅ Nada | Compilación del panel Tkinter igual |

**Lo que SÍ cambia / se reemplaza:**

| Componente | Qué pasa |
|---|---|
| `StreamLitApp/` completo | Reemplazado por `shelfy-frontend/` |
| `StreamLitApp/styles.py` | Reemplazado por CSS/Tailwind real |
| `StreamLitApp/app.py` | Reemplazado por `app/(login)/page.tsx` |
| `StreamLitApp/pages/*.py` (8 archivos) | Reemplazados por 4 páginas React |
| `StreamLitApp/utils.py` | Reemplazado por `lib/api.ts` + hooks |
| `requirements.txt` (solo parte Streamlit) | Se elimina `streamlit` de dependencias |

---

## 5. Comparativa de stacks

| Aspecto | Streamlit (actual) | React + Next.js (objetivo) |
|---|---|---|
| **Lenguaje** | Python | TypeScript / JavaScript |
| **UI** | Componentes predefinidos de Streamlit | Libertad total — cualquier HTML/CSS |
| **CSS** | String Python inyectado | `.css`, `.module.css`, Tailwind |
| **Íconos/logos** | Limitado, workarounds | SVG, PNG, Lucide, cualquier librería |
| **Responsive** | Manual (8 archivos duplicados) | Media queries en 4 archivos |
| **Navegación** | Sidebar + `st.session_state` | URL reales, React Router / Next.js App Router |
| **Performance** | Re-run completo en cada click | Solo re-renderiza lo necesario |
| **Animaciones** | Parciales (unsafe_allow_html) | Completas y nativas |
| **Estado** | `st.session_state` (global) | `useState`, `useContext`, Zustand |
| **Auth** | Variable de sesión Python | JWT en localStorage / cookie HttpOnly |
| **Deploy** | Streamlit Cloud (gratuito pero limitado) | Vercel (gratuito, más rápido, dominio propio) |
| **Mobile** | No responsive real | 100% responsive con media queries |
| **Tiempo de carga** | 3-5s por cambio de página | <200ms (SPA) |
| **Curva aprendizaje** | Baja (ya la conocés) | Media (JS/TS + React) |
| **Control total** | ❌ | ✅ |

---

## 6. Plan por fases

### FASE 0 — Preparación (1-2 días)
> Sin tocar nada del código. Solo configuración y aprendizaje.

- [ ] Instalar Node.js LTS (v20+) en la PC
- [ ] Instalar VSCode con extensiones: ESLint, Prettier, Tailwind CSS IntelliSense, TypeScript
- [ ] Crear cuenta en Vercel (gratis) vinculada al mismo GitHub
- [ ] Leer 1 hora de tutoriales: Next.js App Router básico
- [ ] Familiarizarse con TypeScript básico (tipos simples, interfaces)
- [ ] Documentar todos los endpoints de `api.py` (ya están, solo listarlos)

---

### FASE 1 — Preparar el backend FastAPI (2-3 días)
> Modificaciones mínimas en `api.py` para que sea compatible con el frontend React.

**Tareas:**

#### 1.1 Agregar CORS
```python
# En api.py — después de crear app = FastAPI(...)
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",          # desarrollo local
        "https://shelfy.vercel.app",      # producción (tu dominio)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### 1.2 Agregar endpoint de login con JWT
```python
# Nuevo endpoint /auth/login
# Recibe: { "username": "...", "password": "..." }
# Devuelve: { "access_token": "eyJ...", "token_type": "bearer" }
from jose import jwt  # pip install python-jose
from datetime import datetime, timedelta

SECRET_KEY = os.environ.get("JWT_SECRET", "shelfy-jwt-secret-2025")
ALGORITHM = "HS256"

@app.post("/auth/login")
def login(credentials: dict):
    # validar usuario contra SQLite
    # si ok: generar JWT
    token = jwt.encode(
        {"sub": credentials["username"], "exp": datetime.utcnow() + timedelta(hours=8)},
        SECRET_KEY, algorithm=ALGORITHM
    )
    return {"access_token": token, "token_type": "bearer"}
```

#### 1.3 Proteger endpoints con JWT (opcional en Fase 1, recomendado en Fase 3)
- Agregar `Depends(verify_token)` a los endpoints que hoy usan `X-API-Key`
- Mantener compatibilidad con API Key para el bot de Telegram

**Archivos modificados en Fase 1:**
- `CenterMind/api.py` — CORS + `/auth/login` + dependencia JWT
- `requirements.txt` — agregar `python-jose[cryptography]`

---

### FASE 2 — Scaffold del frontend React (2-3 días)
> Crear la estructura del proyecto Next.js. Aún no hay funcionalidad real.

**Tareas:**

```bash
# En la carpeta Desktop/BOT-SQL/ (al mismo nivel que CenterMind)
npx create-next-app@latest shelfy-frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd shelfy-frontend
npm install axios react-query @tanstack/react-query lucide-react
npm install -D @types/node
```

**Estructura inicial a crear:**
```
shelfy-frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx          ← layout global (topbar, sidebar, fonts)
│   │   ├── page.tsx            ← redirige a /login o /dashboard
│   │   ├── login/
│   │   │   └── page.tsx        ← pantalla de login
│   │   ├── visor/
│   │   │   └── page.tsx        ← visor de mensajes (placeholder)
│   │   ├── dashboard/
│   │   │   └── page.tsx        ← dashboard KPIs (placeholder)
│   │   ├── admin/
│   │   │   └── page.tsx        ← admin usuarios (placeholder)
│   │   └── reportes/
│   │       └── page.tsx        ← reportes (placeholder)
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   └── Spinner.tsx
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Topbar.tsx
│   │   └── Logo.tsx
│   ├── hooks/
│   │   ├── useAuth.ts          ← manejo del JWT
│   │   └── useApi.ts           ← llamadas al backend
│   ├── lib/
│   │   └── api.ts              ← todas las funciones fetch al FastAPI
│   └── styles/
│       └── globals.css         ← paleta Shelfy en CSS variables
├── public/
│   └── shelfy_logo_clean.svg   ← copiar desde StreamLitApp/assets/
├── next.config.js
└── tailwind.config.ts
```

**Configurar paleta Shelfy en `globals.css`:**
```css
:root {
  --shelfy-bg:        #1A0B3B;
  --shelfy-panel:     #261052;
  --shelfy-primary:   #7C3AED;
  --shelfy-primary-2: #4B10A3;
  --shelfy-border:    rgba(167, 139, 250, 0.28);
  --shelfy-text:      #F0EEFF;
  --shelfy-muted:     #C4B8E8;
  --shelfy-glow:      rgba(124, 58, 237, 0.4);
}

body {
  background-color: var(--shelfy-bg);
  color: var(--shelfy-text);
  font-family: 'Inter', sans-serif;
}
```

---

### FASE 3 — Migrar Login y Auth (2-3 días)
> Primera funcionalidad real: el usuario puede loguearse y obtiene un JWT.

**Archivo a crear: `src/app/login/page.tsx`**

Equivalente a la función `_render_login()` de `StreamLitApp/app.py`.

Lo que hace:
1. Formulario con campos `usuario` y `contraseña`
2. `POST /auth/login` al FastAPI
3. Si ok: guarda el JWT en `localStorage` (o cookie HttpOnly más seguro)
4. Redirige a `/dashboard`
5. Si falla: muestra error

**Archivo a crear: `src/hooks/useAuth.ts`**

```typescript
// Manejo del token JWT
export function useAuth() {
  const [token, setToken] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('shelfy_token') : null
  );

  const login = async (username: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    localStorage.setItem('shelfy_token', data.access_token);
    setToken(data.access_token);
  };

  const logout = () => {
    localStorage.removeItem('shelfy_token');
    setToken(null);
  };

  return { token, login, logout, isAuthenticated: !!token };
}
```

**Middleware de protección de rutas:**
```typescript
// src/middleware.ts — Next.js protege automáticamente las rutas
export function middleware(request: NextRequest) {
  const token = request.cookies.get('shelfy_token');
  if (!token && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
```

---

### FASE 4 — Migrar el Visor (3-4 días)
> La página más usada: equivale a `1a_Visor_pc.py` + `1b_Visor_mobile.py`.

**Endpoints a consumir** (ya existen en `api.py`):
- `GET /consulta?usuario=X&fecha=Y` → historial de mensajes
- `GET /admin/usuarios` → lista de usuarios para el filtro

**Componentes a crear:**
```
src/
├── app/visor/page.tsx          ← página principal
├── components/visor/
│   ├── FiltroUsuario.tsx       ← selector de usuario
│   ├── SelectorFecha.tsx       ← date picker
│   ├── TablaConversacion.tsx   ← tabla de mensajes
│   └── TarjetaMensaje.tsx      ← card individual de mensaje
```

**Ventajas vs Streamlit:**
- Una sola página para mobile y desktop (media queries)
- No hay re-run del script entero al cambiar filtros
- La tabla puede ser infinitamente más elaborada (sticky headers, scroll virtual, colores por tipo de mensaje)
- Filtros reactivos sin recargar la página

---

### FASE 5 — Migrar el Dashboard (3-4 días)
> KPIs, gráficos. Equivale a `2a_Dashboard_pc.py` + `2b_Dashboard_mobile.py`.

**Endpoints a consumir:**
- `GET /dashboard` → estadísticas generales

**Librerías recomendadas para gráficos:**
```bash
npm install recharts          # gráficos simples, muy liviano
# o
npm install @nivo/bar @nivo/line @nivo/pie  # más elaborado
# o
npm install chart.js react-chartjs-2       # el más conocido
```

**Componentes a crear:**
```
src/components/dashboard/
├── KpiCard.tsx           ← tarjeta de métrica con número grande
├── GraficoBarras.tsx     ← mensajes por día/semana
├── GraficoTorta.tsx      ← distribución por tipo
└── UltimosEventos.tsx    ← feed de actividad reciente
```

**Ventajas vs Streamlit:**
- Los gráficos `st.bar_chart()` son muy básicos; Recharts/Nivo son completamente customizables
- Actualización en tiempo real con `setInterval` sin recargar la página
- KPI cards con animaciones de conteo

---

### FASE 6 — Migrar Admin (3-4 días)
> Gestión de usuarios. Equivale a `3a_Admin_pc.py` + `3b_Admin_mobile.py`.

**Endpoints a consumir:**
- `GET /admin/usuarios` → lista usuarios
- `POST /admin/usuarios` → crear usuario
- `PUT /admin/usuarios/{id}` → editar usuario
- `DELETE /admin/usuarios/{id}` → eliminar usuario
- `POST /admin/broadcast` → mensaje masivo

**Componentes a crear:**
```
src/components/admin/
├── TablaUsuarios.tsx     ← tabla editable con acciones
├── ModalCrearUsuario.tsx ← formulario modal
├── ModalEditar.tsx       ← edición inline
├── FormBroadcast.tsx     ← envío de mensajes masivos
└── ToggleActivo.tsx      ← switch on/off por usuario
```

**Ventajas vs Streamlit:**
- Modales reales (no el popup básico de Streamlit)
- Edición inline en tabla
- Toast notifications (sin los `st.success()` que desaparecen solos)

---

### FASE 7 — Migrar Reportes (2-3 días)
> Descarga de reportes CSV/Excel. Equivale a `4a_Reportes_pc.py` + `4b_Reportes_mobile.py`.

**Endpoints a consumir:**
- `GET /reportes?tipo=X&fecha_desde=Y&fecha_hasta=Z` → datos del reporte
- `GET /reportes/export?formato=csv` → descarga directa

**Componentes a crear:**
```
src/components/reportes/
├── SelectorRango.tsx     ← date range picker
├── SelectorTipo.tsx      ← tipo de reporte
├── VistaPrevia.tsx       ← tabla preview antes de exportar
└── BotonExport.tsx       ← botón con spinner de descarga
```

---

### FASE 8 — Pulir y deploy (2-3 días)
> Detalles finales, responsive, optimización y deploy.

- [ ] Revisar responsive en mobile (375px, 768px, 1280px)
- [ ] Agregar loading skeletons (en Streamlit no existen)
- [ ] Agregar manejo de errores global (interceptor de Axios)
- [ ] Configurar variables de entorno en Vercel
- [ ] Configurar dominio personalizado si se tiene
- [ ] Eliminar `streamlit` de `requirements.txt`
- [ ] Actualizar README con la nueva arquitectura
- [ ] Ajustar Cloudflare Tunnel para permitir CORS desde el dominio de Vercel

---

## 7. Desglose archivo por archivo

### Backend — `CenterMind/api.py`
**Qué modificar:**
```python
# AGREGAR — al inicio, después de crear app
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt

app.add_middleware(CORSMiddleware, ...)  # ver Fase 1

# AGREGAR — nuevo endpoint
@app.post("/auth/login")
def login(credentials: LoginRequest): ...

# OPCIONAL — proteger endpoints existentes con JWT además de API Key
```
**Por qué:** El frontend React corre en otro origen (localhost:3000 o Vercel), CORS es obligatorio.
**Esfuerzo:** 2-3 horas.

---

### Backend — `requirements.txt`
**Qué modificar:**
```diff
+ python-jose[cryptography]>=3.3.0
+ passlib[bcrypt]>=1.7.4
- # streamlit ya no es necesario en el backend
```
**Por qué:** JWT para la auth del frontend.
**Esfuerzo:** 5 minutos.

---

### Frontend — `StreamLitApp/` (completo)
**Qué pasa:** Se mantiene mientras se desarrolla el frontend nuevo. Una vez que el nuevo frontend esté en producción y funcionando, se puede archivar o eliminar.

**NO borrar hasta:** Tener todas las fases completadas y probadas en producción.

---

### Nuevo — `shelfy-frontend/src/lib/api.ts`
**Qué es:** El equivalente de `StreamLitApp/utils.py` pero en TypeScript.
**Estructura:**
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function fetchConversacion(usuario: string, fecha: string) { ... }
export async function fetchDashboard() { ... }
export async function fetchUsuarios() { ... }
export async function crearUsuario(data: NuevoUsuario) { ... }
export async function exportarReporte(tipo: string, desde: string, hasta: string) { ... }
```
**Por qué:** Centralizar todas las llamadas HTTP en un solo archivo hace que los cambios de URL o auth se propaguen solos.

---

### Nuevo — `shelfy-frontend/public/shelfy_logo_clean.svg`
**Qué es:** Copiar `StreamLitApp/assets/shelfy_logo_clean.svg` (el que ya limpiamos sin fondo blanco).
**Por qué:** Next.js sirve los archivos de `public/` directamente — se usa como `<img src="/shelfy_logo_clean.svg" />`.

---

## 8. Tecnologías recomendadas

### Core
| Tecnología | Versión | Rol |
|---|---|---|
| **Next.js** | 14+ (App Router) | Framework React con routing basado en carpetas |
| **React** | 18+ | UI |
| **TypeScript** | 5+ | Tipado estático — evita bugs |
| **Tailwind CSS** | 3+ | Utility classes — reemplaza `styles.py` |

### Librerías útiles
| Librería | npm | Rol |
|---|---|---|
| **Axios** | `axios` | HTTP client con interceptors para JWT |
| **TanStack Query** | `@tanstack/react-query` | Cache de datos, loading states, revalidación |
| **Recharts** | `recharts` | Gráficos del dashboard |
| **Lucide React** | `lucide-react` | Íconos SVG (reemplaza los emojis del menú) |
| **React Hot Toast** | `react-hot-toast` | Notificaciones (reemplaza `st.success()`) |
| **date-fns** | `date-fns` | Manejo de fechas para reportes |
| **React Hook Form** | `react-hook-form` | Formularios con validación |

### Deploy
| Servicio | Rol |
|---|---|
| **Vercel** | Hosting del frontend React — push a main = deploy automático |
| **GitHub** | Repositorio (ya existe) |
| **Cloudflare Tunnel** | Sin cambios — sigue exponiendo el FastAPI |

---

## 9. Estructura de carpetas del proyecto nuevo

```
BOT-SQL/
├── CenterMind/                    ← EXISTENTE (sin cambios grandes)
│   ├── api.py                     ← pequeñas modificaciones (CORS + JWT)
│   ├── bot_worker.py              ← sin cambios
│   ├── centermind_core.py         ← sin cambios
│   ├── base_datos/                ← sin cambios
│   ├── hardening/                 ← sin cambios
│   ├── panel_maestro.py           ← sin cambios
│   └── StreamLitApp/              ← mantener hasta migración completa
│
└── shelfy-frontend/               ← NUEVO
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx           ← redirect a /login o /dashboard
    │   │   ├── login/
    │   │   │   └── page.tsx
    │   │   ├── visor/
    │   │   │   └── page.tsx
    │   │   ├── dashboard/
    │   │   │   └── page.tsx
    │   │   ├── admin/
    │   │   │   └── page.tsx
    │   │   └── reportes/
    │   │       └── page.tsx
    │   ├── components/
    │   │   ├── ui/
    │   │   │   ├── Button.tsx
    │   │   │   ├── Card.tsx
    │   │   │   ├── Modal.tsx
    │   │   │   ├── Spinner.tsx
    │   │   │   └── Badge.tsx
    │   │   ├── layout/
    │   │   │   ├── Sidebar.tsx
    │   │   │   ├── Topbar.tsx
    │   │   │   └── MobileNav.tsx
    │   │   ├── visor/
    │   │   ├── dashboard/
    │   │   ├── admin/
    │   │   └── reportes/
    │   ├── hooks/
    │   │   ├── useAuth.ts
    │   │   ├── useApi.ts
    │   │   └── useLocalStorage.ts
    │   ├── lib/
    │   │   ├── api.ts
    │   │   └── constants.ts
    │   └── styles/
    │       └── globals.css
    ├── public/
    │   ├── shelfy_logo_clean.svg
    │   └── favicon.ico
    ├── .env.local                 ← NEXT_PUBLIC_API_URL=http://localhost:8000
    ├── .env.production            ← NEXT_PUBLIC_API_URL=https://tu-tunnel.trycloudflare.com
    ├── next.config.js
    ├── tailwind.config.ts
    ├── tsconfig.json
    └── package.json
```

---

---

## 11. Checklist final de migración

### Fase 0 — Preparación
- [ ] Node.js 20+ instalado
- [ ] VSCode con extensiones TypeScript, Tailwind, ESLint
- [ ] Cuenta Vercel creada y vinculada a GitHub
- [ ] Endpoints de `api.py` documentados (lista de rutas + parámetros)

### Fase 1 — Backend
- [ ] CORS configurado en `api.py`
- [ ] Endpoint `/auth/login` funcionando (prueba con Postman o curl)
- [ ] JWT generado correctamente
- [ ] `python-jose` agregado a `requirements.txt`
- [ ] FastAPI reiniciado y testeado

### Fase 2 — Scaffold
- [ ] Proyecto Next.js creado
- [ ] Paleta Shelfy en `globals.css`
- [ ] Logo SVG en `public/`
- [ ] Variables de entorno `.env.local` configuradas
- [ ] `npm run dev` corre sin errores

### Fase 3 — Auth
- [ ] Formulario de login renderiza correctamente
- [ ] Login exitoso guarda el JWT
- [ ] Login fallido muestra error
- [ ] Rutas protegidas redirigen a `/login` si no hay token
- [ ] Logout elimina el token

### Fase 4 — Visor
- [ ] Lista de usuarios carga desde el API
- [ ] Filtros de fecha funcionan
- [ ] Historial de mensajes muestra datos reales
- [ ] Responsive: se ve bien en mobile (375px)

### Fase 5 — Dashboard
- [ ] KPIs cargan desde el API
- [ ] Al menos 1 gráfico funcionando
- [ ] Auto-refresh cada N minutos

### Fase 6 — Admin
- [ ] Lista de usuarios carga
- [ ] Crear usuario funciona
- [ ] Editar usuario funciona
- [ ] Toggle activo/inactivo funciona
- [ ] Broadcast funciona

### Fase 7 — Reportes
- [ ] Selector de rango de fechas funciona
- [ ] Vista previa de datos carga
- [ ] Exportación CSV descarga el archivo

### Fase 8 — Deploy
- [ ] Proyecto subido a GitHub
- [ ] Deploy en Vercel exitoso
- [ ] Variables de entorno en Vercel configuradas
- [ ] CORS en `api.py` permite el dominio de Vercel
- [ ] Cloudflare Tunnel activo y accesible desde Vercel
- [ ] Prueba completa end-to-end en producción

---

## 12. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **Cloudflare Tunnel cambia URL** | Alta | Alta | Usar una variable de entorno `NEXT_PUBLIC_API_URL` en Vercel — cambiar en 30 segundos |
| **CORS bloqueado en producción** | Media | Alta | Probar CORS desde el día 1 de Fase 1 con Postman |
| **JWT expirado sin manejo** | Media | Media | Implementar refresh token o redirigir a login automáticamente (interceptor Axios) |
| **SQLite no soporta concurrencia alta** | Baja | Media | No es problema hasta 50+ usuarios simultáneos — SQLite aguanta bien el uso actual |
| **Curva de aprendizaje React/TS** | Media | Media | Empezar por componentes simples (KpiCard), no por los más complejos (Admin) |
| **Pérdida de datos en migración** | Muy Baja | Alta | La base de datos NO se toca — el riesgo es prácticamente cero |
| **El bot de Telegram se cae durante migración** | Muy Baja | Alta | El bot es completamente independiente del frontend — no se toca |
| **Streamlit Cloud no disponible** | Baja | Media | Esta es la razón para migrar — pero mantener StreamLitApp como backup hasta Fase 8 completa |

---

## Notas finales

### Orden recomendado si el tiempo es limitado
Si no podés hacer todo de una vez, este es el orden de mayor a menor impacto:

1. **Fase 1 + Fase 2 + Fase 3** → tener login funcionando (base de todo)
2. **Fase 4** → el Visor es la función más usada del sistema
3. **Fase 5** → Dashboard es lo más visual y llamativo
4. **Fase 6** → Admin (más complejo pero menos frecuente)
5. **Fase 7** → Reportes (el menos urgente)

### Mantener Streamlit en paralelo
No apagues Streamlit Cloud hasta que el frontend React esté **100% funcionando en producción** y probado por al menos 1 semana. Podés tener ambos corriendo al mismo tiempo sin conflictos — usan el mismo backend FastAPI.

### El backend ya es tu mayor activo
Con `api.py` ya funcionando, tenés el 60% del trabajo hecho. El frontend es "solo" una interfaz nueva para los mismos datos. No estás empezando de cero.

---

*Documento generado para el proyecto Shelfy — CenterMind v2025*
*Stack actual: Python · Streamlit · FastAPI · SQLite · Telegram Bot*
*Stack objetivo: React (Next.js) · TypeScript · Tailwind · FastAPI · SQLite · Telegram Bot*
