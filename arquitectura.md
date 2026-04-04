# Arquitectura de Shelfy CenterMind

Este documento describe la infraestructura, tecnologías y flujos de datos que componen el ecosistema de Shelfy.

## Stack Tecnológico

### Frontend
- **Framework**: Next.js 16 (App Router).
- **Lógica**: React 19 + TypeScript 5.9.
- **Estilos**: Tailwind CSS 4 + shadcn/ui (radix-ui, lucide-react).
- **Gráficos**: Recharts.
- **Mapas**: MapLibre GL (reemplazo de Leaflet para estabilidad WebGL).
- **Fetching**: @tanstack/react-query (caching y re-fetching).
- **Deploy**: Vercel.

### Backend
- **Lenguaje**: Python 3.11+.
- **Framework**: FastAPI + Uvicorn (ASGI).
- **Base de Datos**: Supabase (PostgreSQL 15+).
- **Task Scheduling**: APScheduler (local en el proceso API).
- **Telegram**: python-telegram-bot v20 (bots multi-tenant).
- **Data Analysis**: pandas, numpy, openpyxl (procesamiento Excel ERP).
- **Auth**: JWT (jose) para portal, API Key para bots/RPA.
- **Deploy**: Railway.

### RPA / Automatización
- **Motor**: Python + Playwright.
- **Credenciales**: Supabase Vault (lectura segura vía RPC).
- **Ejecución**: Local (Mac del operador/servidor físico con acceso a ERP local).

---

## Relación Front-End / Back-End

1. **REST API**: El frontend consume endpoints definidos en `routers/` (incluidos por `api.py` vía `include_router`).
    - Autenticación vía `POST /auth/login` → JWT.
    - Cada request incluye `Authorization: Bearer <token>`.
2. **Supabase Client**: El backend interactúa con PostgreSQL a través de `db.py` (singleton de Supabase Client).
3. **RPC (Remote Procedure Calls)**: Se utilizan funciones PL/pgSQL en Supabase para operaciones complejas como `fn_supervision_vendedores` o `fn_login`.
4. **WebSocket (Realtime)**: Supabase Realtime se utiliza para sincronización de estado en el mapa (navegación coordinada).
5. **Storage**: Las imágenes subidas por el bot se guardan en Supabase Storage. El frontend usa las URLs públicas para renderizar fotos de exhibiciones.
6. **RBAC (Role Based Access Control)**: New table `roles_permisos` defines per-role access keys. Frontend uses `hasPermiso(key)` via `AuthContext` to filter UI elements.

---

## Estructura de Carpetas

```
CenterMind/                     # Raíz del Repositorio
├── CenterMind/                 # Backend Python (FastAPI)
│   ├── api.py                  # Entry point slim (~98 líneas): app + routers + health + WS
│   ├── core/                   # Infraestructura transversal
│   │   ├── config.py           # Constantes: API_KEY, JWT, CORS, WEBHOOK_URL
│   │   ├── security.py         # verify_auth, verify_key, check_dist_permission
│   │   ├── lifespan.py         # bots{}, ConnectionManager, scheduler, lifespan()
│   │   └── helpers.py          # _get_erp_name_map, _enrich_and_store_cc
│   ├── models/
│   │   └── schemas.py          # Todos los modelos Pydantic
│   ├── routers/
│   │   ├── auth.py             # /login, /auth/login, /auth/switch-context
│   │   ├── erp.py              # ERP ingesta, sync v1, padrón, motores RPA, CC
│   │   ├── supervision.py      # Pendientes, evaluar, mapa, objetivos, GPS
│   │   ├── admin.py            # Distribuidoras, usuarios, integrantes, jerarquía
│   │   └── reportes.py         # Dashboard, reports, bonos, reportes exhibiciones
│   ├── bot_worker.py           # Gestión de Bots de Telegram
│   ├── db.py                   # Conexión Supabase (singleton)
│   ├── services/               # Lógica de negocio (Ingesta ERP, CC, Monitoring)
│   ├── base_datos/             # Scripts SQL y migraciones
│   └── requirements.txt        # Dependencias de Python
│
├── shelfy-frontend/            # Frontend Web (Next.js)
│   ├── src/app/                # Rutas y layouts (App Router)
│   │   ├── admin/permissions/  # Matriz de accesos por rol (RBAC)
│   ├── src/components/         # Componentes React (MapaRutas, TabSupervision)
│   ├── src/lib/api.ts          # Centralización de llamadas API y Types
│   ├── public/                 # Assets (Logo, Backgrounds)
│   └── package.json            # Dependencias de Node.js
│
├── ShelfMind-RPA/              # Automatización RPA
│   ├── runner.py               # Orquestador de motores
│   ├── motores/                # Lógica por tipo de sync (Ventas, CC, Sigo)
│   └── lib/                    # Utilidades (Vault Client, Logger)
│
└── docs/                       # Documentación técnica adicional
```

---

## Flujo de Datos Crítico

1. **ERP → Supabase**: El RPA extrae datos del ERP local → `POST` a la API → `erp_ingestion_service` → Tablas `_v2`.
2. **Telegram → Supabase**: Vendedor sube foto → `bot_worker.py` → Supabase Storage → Tabla `exhibiciones`.
3. **Supabase → Portal**: `api.py` consulta vistas/tablas → Frontend Renderiza dashboard y mapas.
