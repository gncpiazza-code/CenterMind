# CenterMind — Guia para Agentes (Lean)

Manual compacto para que cualquier LLM ejecute tareas en Shelfy con bajo costo de contexto.

## 1) Contexto rapido del producto

- Shelfy es SaaS B2B multi-tenant para fuerza de ventas y exhibiciones.
- Flujo principal: Telegram (captura) -> backend -> portal de supervision/evaluacion.
- Tenants activos: `tabaco`, `aloma`, `liver`, `real`, `extra` (pendiente credenciales).

## 2) Stack

- Backend: FastAPI + Python 3.11+
- Frontend: Next.js 16 + React 19 + TS 5.9
- DB: Supabase PostgreSQL
- Bot: python-telegram-bot v20
- RPA: Playwright (`ShelfMind-RPA/`)

## 3) Reglas criticas de datos

- Resolver tablas por tenant con `tenant_table_name()`.
- Nunca hardcodear sufijos de tablas.
- Nunca omitir `id_distribuidor`.
- PostgREST pagina en 1000 filas: usar loops con `.range()`.

Patron obligatorio:

```python
PAGE = 1000
rows = []
offset = 0
while True:
    batch = sb.table(t).select("*").range(offset, offset + PAGE - 1).execute().data or []
    rows.extend(batch)
    if len(batch) < PAGE:
        break
    offset += PAGE
```

## 4) Endpoints base (core)

- Supervision: `/api/supervision/*`, `/api/pendientes/*`
- Dashboard/reportes: `/api/dashboard/*`, `/api/reports/*`
- Difusion: `/api/difusion/*`
- ERP sync: `/api/v1/sync/*`
- Auth: `/auth/login`, `/auth/switch-context/{dist_id}`
- WebSocket: `/api/ws/exhibiciones/{dist_id}`, `/api/ws/superadmin`

## 5) Invariantes de negocio

- KPI y ranking deben usar exhibicion logica unica (no contar fotos duplicadas).
- `cc_detalle` es fuente autoritativa para cuentas corrientes.
- `url_foto_drive` apunta a Supabase Storage (nombre legacy).
- En objetivos operativos: rutas con jerarquia **Dia -> Ruta**.
- Objetivos de compania: periodo mensual y prorrateo semanal/diario.

## 6) Frontend conventions

- Todo fetch pasa por `shelfy-frontend/src/lib/api.ts`.
- Permisos con `hasPermiso()`, no leer `user.permisos` directo.
- `DatePicker` obligatorio para fechas.
- En creacion de objetivos de origen distribuidora, `fecha_objetivo` es obligatoria (validar UI + backend).
- shadcn/ui obligatorio para componentes base.
- En mapas, no usar `transform: scale()` para animacion de marcadores.

## 7) RPA operacional

- `padron.py`: corrida diaria 07:00 (AR).
- `cuentas_corrientes.py`: 07:00 y 14:30 (AR).
- `real` usa split por sucursal en cuentas.
- Variables clave: `PADRON_INCLUIR_ANULADOS`, `RPA_CUENTAS_ENGINE`, `RPA_CUENTAS_FORCE_EXCEL`.

## 8) Seguridad y acceso

- API Key (`X-Api-Key`) para bots/RPA/scripts.
- JWT para portal.
- Roles: `superadmin`, `admin`, `directorio`, `supervisor`, `evaluador`.
- `check_dist_permission(...)` valida acceso cross-tenant.

## 9) Que NO hacer

- No usar tablas legacy en codigo nuevo.
- No consultar `cuentas_corrientes_data` para supervision.
- No modificar `erp_*_raw` manualmente.
- No escribir queries sin paginacion en tablas grandes.
- No romper aislamiento tenant en frontend ni backend.

## 9.1) Objetivos + Telegram (convenciones nuevas)

- Mensajes Telegram de alta de objetivos deben incluir instruccion accionable clara y referencia a `/objetivos`.
- Bot envia recordatorio diario de objetivos a las 08:00 AR para vendedores con objetivos activos.
- Retroactividad solo para objetivos de compania tipo `exhibicion`: calcular avance desde `mes_referencia`.
- En `ruteo_alteo`, el cumplimiento debe evaluarse por `fecha_alta` de padrón; no usar cambio de ruta como señal.

## 10) Protocolo Shelfy (obligatorio)

Antes de implementar:

1. Leer `CLAUDE.md`, `progress.md`, `arquitectura.md`, `frontend.md`.
2. Analizar impacto funcional/tecnico.
3. Si hay cambios de UI, priorizar consistencia con reglas de frontend.
4. Al finalizar, sincronizar estos 4 archivos de contexto.

Salida recomendada al cerrar la tarea:

- "Protocolo de coordinacion de Shelfy completado con exito".
