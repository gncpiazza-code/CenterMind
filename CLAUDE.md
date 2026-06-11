# CenterMind — Guía para Agentes (Lean)

Manual compacto. **Detalle por módulo:** `docs/context/README.md` · **Mapa repo:** `REPO_INDEX.txt` / `docs/STRUCTURE.md`

## 1) Producto

- Shelfy: SaaS B2B multi-tenant — fuerza de ventas + exhibiciones.
- Flujo: Telegram → backend → portal supervisión/evaluación.
- **8 tenants** (ver `docs/context/modules/tenants.md`): `real`(2), `tabaco`(3), `aloma`(4), `liver`(5), `extra`(6), `beltrocco`(11), `hugo_cena`(12), `ippolibaz`(13). Fuente: `core/rpa_tenant_registry.py`.

## 2) Stack

- BE: FastAPI 3.11+ · FE: Next.js 16 / React 19 / TS 5.9 · DB: Supabase · Bot: telegram v20 · RPA: Playwright

## 3) Datos (obligatorio)

- Tablas: `tenant_table_name()` — nunca hardcodear sufijos.
- Siempre filtrar `id_distribuidor`.
- PostgREST 1000 filas → loop `.range(PAGE=1000)`.

## 4) Endpoints core

Supervision `/api/supervision/*` · Dashboard `/api/dashboard/*` · Difusión `/api/difusion/*` · ERP `/api/v1/sync/*` · Auth `/auth/*` · WS `/api/ws/exhibiciones/{dist_id}`

## 5) Exhibición lógica (NO NEGOCIABLE)

Ver **`docs/context/modules/exhibicion-ranking.md`**

Resumen: dedup `(vendedor_erp, cliente_key, calendar_day_AR)` solo vía `core/exhibicion_aggregate.py`.

## 6) Frontend

- Fetch: `shelfy-frontend/src/lib/api.ts`
- Permisos: `hasPermiso()` — no `user.permisos` directo
- Fechas: `DatePicker` · UI: shadcn/ui
- Mapas: no `transform: scale()` en marcadores
- Objetivos dist: `fecha_objetivo` obligatoria en alta

## 7) RPA (AR)

- Padrón 08:30/11:30/15:30/18:30 · CC 07:00/14:30/20:00 · Ventas Consolido 09:45/13/17/21
- `real`: split CC por sucursal

## 8) Seguridad

- Bots/RPA: `X-Api-Key` · Portal: JWT
- Roles: `superadmin`, `admin`, `compania`, `supervisor`, `evaluador`, `espectador` (solo lectura — demos)
- `normalize_rol()` — legacy `directorio` → `compania`
- `check_dist_permission()` cross-tenant

## 9) Qué NO hacer

- Tablas legacy en código nuevo · `cuentas_corrientes_data` en supervisión
- Queries sin paginación · romper tenant isolation
- Ranking/KPI sin `exhibicion_aggregate.py` (ver módulo exhibición)
- **Borrar o reemplazar el favicon de pestaña Shelfy** — ver `.cursor/rules/shelfy-favicon.mdc` (`icon.png`, `apple-icon.png`, `favicon.ico`, `WEBICON.svg`, `metadata.icons` en `layout.tsx`)

## 10) Módulos canónicos (punteros)

| Tema | Doc |
|------|-----|
| **Tenants / dist IDs** | `docs/context/modules/tenants.md` |
| Objetivos | `docs/context/modules/objetivos.md` |
| Galería mapa | `docs/context/modules/galeria-mapa.md` |
| Supervisión mapa | `docs/context/modules/supervision-mapa.md` |
| Supervisión avance ventas | `docs/context/modules/supervision-avance-ventas.md` |
| Dashboard | `docs/context/modules/dashboard.md` |
| Telegram binding | `docs/context/modules/telegram-binding.md` |
| App móvil | `docs/context/modules/mobile-app.md` |
| Visor glass | `docs/context/modules/visor-glass.md` |

## 11) Protocolo Shelfy

1. Leer lean: `CLAUDE.md`, `progress.md`, `arquitectura.md`, `frontend.md`
2. Si la tarea toca un módulo → leer **solo** su `.md` en `docs/context/modules/`
3. Al cerrar: sync lean files + 1–3 bullets en `progress.md`; detalle → changelog mensual

Salida: *"Protocolo de coordinación de Shelfy completado con éxito"*
