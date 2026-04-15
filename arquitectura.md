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
6. **Sidebar — Switcher de Distribuidora**:
    - **Componente**: `shadcn/ui` `DropdownMenu` (reemplaza el dropdown custom anterior).
    - **Visibilidad**: Disponible para Superadmin y usuarios con el permiso `action_switch_tenant`.
    - **Posición**: `side="top"`, aparece sobre el trigger, alineado al ancho del botón trigger.
    - **Optimización**: `navItems` se memoiza con `useMemo([rol, hasPermiso])` para evitar re-cómputos.
7. **RBAC (Role Based Access Control)**: La tabla `roles_permisos` define llaves de acceso por rol. El frontend usa `hasPermiso(key)` via `AuthContext`.
8. **Multi-tenant Switcher**: El backend permite el cambio de contexto operativo a usuarios no-superadmin si cuentan con el permiso `action_switch_tenant`, validado en `check_dist_permission`.
9. **Contexto Único de Entorno (Abr 2026)**:
    - El cambio de distribuidora se centraliza en `Sidebar` + `AuthContext` (`switchDistributor` + `shelfy_active_dist`).
    - `TabSupervision` y `objetivos/page.tsx` ya no exponen selectores locales de tenant para evitar estados desalineados.
    - Las consultas de rutas/clientes en supervisión se cachean con `dist_id` en la query key para aislar datos por tenant.
10. **Padrón ERP — PDV dados de baja (Abr 2026)**:
    - El padrón exportado **solo incluye clientes activos** (sin anulados). Tras ingesta, `padron_ingestion_service` marca `clientes_pdv_v2.estado='inactivo'` cuando el PDV ya no está en ese Excel (o queda en ruta obsoleta según alcance parcial). Los endpoints de supervisión que alimentan mapa y catálogo filtran `estado != inactivo`.
11. **Duplicate Guard Objetivos (14/04/2026)**:
    - `supervision.py::crear_objetivo` previene creación de objetivos duplicados activos `(id_distribuidor, id_vendedor, tipo)` → HTTP 409 `{code:"OBJETIVO_DUPLICADO", id_existente, mensaje}`.
    - Para tipo `exhibicion`: también verifica overlap de PDVs antes de bloquear.
    - DB: índice parcial `UNIQUE(id_distribuidor, id_vendedor, tipo) WHERE cumplido=FALSE` en `migrations/objetivos_uniqueness_2026-04-14.sql`.
12. **Watcher Terminal State Guard (14/04/2026)**:
    - `objetivos_watcher_service._update_item_estado` lee el estado actual del ítem antes de actualizar; si ya es `cumplido` o `falla`, ignora la transición regresiva (guard idempotente).
13. **Bot /stats Tenant Scope (14/04/2026)**:
    - `cmd_stats` en `bot_worker.py` filtra `integrantes_grupo` por `id_distribuidor` (fix: antes podía cruzar datos de un vendedor registrado en múltiples distribuidoras).
    - Consulta exhibiciones con paginación por lotes de 1000 (cumple límite PostgREST).
14. **Cuentas de prueba exhibiciones (Tabaco, Abr 2026)**:
    - `core/helpers.py` centraliza IDs QA (`id_vendedor_v2` 157 / 76) y resolución de `id_integrante` por nombre (Grimaldi).
    - `routers/reportes.py` y `routers/supervision.py` filtran ranking, pendientes y evaluación para usuarios no superadmin; el bot excluye esas filas del ranking en Telegram.
15. **Supervisión/Objectivos — PDVs inactivos visibles (Abr 2026)**:
    - `GET /api/supervision/clientes/{id_ruta}` ya no descarta `estado='inactivo'`, permitiendo prender/apagar el universo completo de PDVs del vendedor en mapa/listado.
    - `GET /api/supervision/pdvs-catalog/{dist_id}` devuelve también `estado` y `fecha_ultima_compra`; objetivos usa estos campos para priorizar activación y exhibición sobre clientes inactivos/rezagados.

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
│   │   ├── supervision.py      # Pendientes, evaluar, mapa, objetivos, GPS, upload-cc, cc-status
│   │   ├── admin.py            # Distribuidoras, usuarios, integrantes, jerarquía
│   │   ├── reportes.py         # Dashboard, reports, bonos, reportes exhibiciones
│   │   └── informes_excel.py   # Motor de informes: infer-config, tenant config, generate PDF
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
   - Caso especial Cuentas Corrientes (Real Tabacalera): el motor selecciona `UEQUIN RODRIGO` + `OSCAR ONDARRETA` y luego divide server-payload por sucursal para enrutar cada bloque al distribuidor destino correcto (`La Magica` / `Bolivar Distribuiciones`).
2. **Telegram → Supabase**: Vendedor sube foto → `bot_worker.py` → Supabase Storage → Tabla `exhibiciones`.
3. **Supabase → Portal**: `api.py` consulta vistas/tablas → Frontend Renderiza dashboard y mapas.
