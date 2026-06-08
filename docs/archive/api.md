# Plan de Refactorización: Modularización de CenterMind API

Este plan detalla la transformación del archivo monolítico `api.py` (~4000 líneas) en una estructura modular, escalable y fácil de mantener.

## User Review Required

> [!IMPORTANT]
> La refactorización se realizará en etapas secuenciales para asegurar que el sistema siga operativo en todo momento. Cada etapa puede ser probada de forma independiente.

> [!WARNING]
> Dado que el backend está en producción (Railway), se recomienda realizar un backup de la base de datos y asegurar que el entorno local pueda correr la API antes de comenzar.

## Proposed Changes

### Fase 0: Preparación de Infraestructura Core

#### [NEW] [config.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/core/config.py)
- Extracción de constantes: `API_KEY`, `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXPIRE_HOURS`, `WEBHOOK_URL`, `AR_OFFSET`.
- Configuración de CORS.

#### [NEW] [security.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/core/security.py)
- Centralización de dependencias: `verify_key`, `verify_jwt`, `verify_auth`, `check_dist_permission`, `check_distributor_status`.

#### [NEW] [lifespan.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/core/lifespan.py)
- Lógica de `lifespan`: inicialización de bots de Telegram y arranque del APScheduler.

### Fase 1: Modelos y Esquemas

#### [NEW] [schemas.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/models/schemas.py)
- Traslado de todos los modelos Pydantic (`LoginRequest`, `EvaluarRequest`, `TokenResponse`, etc.).

### Fase 2: Modularización por Dominios (Routers)

Se crearán archivos individuales en `routers/` utilizando `APIRouter`.

#### [NEW] [auth.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/routers/auth.py)
- Endpoints: `/auth/login`, `/auth/switch-context`.

#### [NEW] [erp.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/routers/erp.py)
- Endpoints: `/api/admin/erp/*`, `/api/v1/sync/*`, `/api/erp/roi/*`, `/api/erp/contexto-cliente/*`.

#### [NEW] [supervision.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/routers/supervision.py)
- Endpoints correspondientes al visor y mapa: `/api/pendientes/*`, `/api/evaluar`, `/api/stats/*`, `/api/vendedores/*`, `/api/revertir`.
- **Nota**: La lógica compleja de `get_live_map_events` se extraerá a un service específico.

#### [NEW] [admin.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/routers/admin.py)
- Gestión de distribuidoras, usuarios del portal e integrantes.

#### [NEW] [reportes.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/routers/reportes.py)
- Endpoints de performance, ventas, SIGO y dashboards/rankings.

### Fase 3: Consolidación y Limpieza

#### [MODIFY] [api.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/api.py)
- Se reducirá a < 100 líneas.
- Solo contendrá la inicialización de `FastAPI`, la inclusión de los routers y la configuración de middlewares.

## Open Questions

- ¿Deseas que mantengamos el archivo `api.py` original como respaldo (ej. `api_legacy.py.bak`) durante el proceso?
- ¿Existen tests automáticos (ej. pytest) que podamos correr para validar que no hubo regresiones?

## Verification Plan

### Manual Verification
1. Levantar servidor local: `uvicorn api:app --reload`.
2. Verificar endpoint `/health`.
3. Probar login desde el portal o vía `curl`.
4. Verificar que los bots de Telegram se inicialicen correctamente viendo los logs.
5. Probar un reporte de ventas para validar la conexión con Supabase.
