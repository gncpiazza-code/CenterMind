# Progress — Shelfy CenterMind

**Última actualización: 4 de Abril, 2026 (3)**

Este archivo detalla el estado actual del proyecto, las funcionalidades operativas y los pendientes técnicos.

## Estado General
El proyecto se encuentra en una fase de expansión de funcionalidades de supervisión ("Phase 1 - Abril 2026"). La infraestructura core (backend Railway, frontend Vercel, DB Supabase) es estable.

---

## 🟢 Funcionalidades Operativas (Lo que funciona)

### 1. Panel de Supervisión (Módulo Principal)
- **Mapa de Rutas**: Visualización de PDVs con MapLibre GL. Marcadores estables (sin drift).
- **Modos de Mapa**:
    - **Activos/Exhibidos**: Filtro por última fecha de compra y exhibiciones realizadas.
    - **Deudores**: Integración con `cc_detalle`. Popup con deuda total y días de antigüedad.
    - **Ruteo**: Visualización de secuencia de visitas por vendedor.
- **Detección de Coordenadas**: Filtrado automático de coordenadas inválidas fuera de Argentina.
- **Popup Enriquecido**: Muestra foto de última exhibición (desde Supabase Storage), datos de contacto del ERP y Nº de Cliente.

### 2. Sistema de Objetivos ("Objetivación") — **OPERATIVO**
- **Interfaz de Selección**: "Carrito flotante" en el mapa para seleccionar múltiples PDVs.
- **Asignación Masiva**: Permite asignar objetivos (Activación, Exhibición, Cobranza) con fechas límite y observaciones.
- **Formato de Frase**: `Vendedor + Actividad + Cantidad + Tiempo`.
- **Jerarquía y Contención**: Los objetivos de Supervisores/Gerentes reflejan la suma del progreso de sus subordinados.
- **Tracking Automático**: Persistencia en Supabase para seguimiento de cumplimiento en tiempo real.

### 3. Sistema de Roles y Permisos (RBAC) — **OPERATIVO**
- **Roles Definidos**: Superadmin, Directorio (acceso multi-tenant global), Administrador, Supervisor, Vendedor.
- **Matriz de Accesos Editable**: Interfaz interactiva en `/admin/permissions` que permite a los Superadmins alternar permisos de módulos y acciones en tiempo real.
- **Seguridad en Frontend**: Hooks de protección (`hasPermiso`) para ocultar/bloquear elementos de la UI según la configuración de la matriz.

### 3. Ingesta de Datos ERP
- **RPA (ShelfMind-RPA)**: Sincronización automática de Clientes, Ventas y Cuentas Corrientes desde CHESS ERP (distribuidores: Tabaco, Aloma, Liver, Real).
- **Upload Manual**: Interfaz en `/admin/erp/upload-global` para ingesta vía Excel.
- **Deduplicación**: Upsert idempotente basado en `id_cliente_erp` y `id_distribuidor`.

### 4. Bots de Telegram
- **Bot Multi-tenant**: Registro de exhibiciones por vendedor.
- **Interceptor de Franquiciados**: Mapeo automático de exhibiciones subidas por "canal" (ej. Ivan Soto) al vendedor real (ej. Monchi Ayala).
- **Almacenamiento**: Fotos almacenadas directamente en Supabase Storage.

### 5. Reportes y KPIs
- **Ranking Vendedores**: Cálculo de puntos basado en exhibiciones aprobadas y destacadas.
- **Reportes de Ventas**: Resumen de últimos 7/30/90 días.
- **Auditoría SIGO**: Seguimiento de gestiones administrativas.

---

## 🟡 En Desarrollo / Pendientes

### Técnicos
- **Migración Legacy**: Eliminar definitivamente el uso de tablas sin sufijo `_v2` en endpoints de administración.
- **APScheduler**: El scheduler de tareas corre en el mismo proceso de la API; evaluar migración a workers independientes si el volumen crece.
- ~~**Refactor de api.py**~~: ✅ **Completado** — Ver Historial 03/04.

### Operativos
- **Tenant `extra` (GyG)**: Pendiente obtención de credenciales CHESS para activar sincronización RPA.
- **Optimización de Mapas**: Implementar clusters para visualización de miles de PDVs en zoom out.

---

## 📅 Historial Reciente (Abril 2026)
- **04/04 (4)**: **Estabilidad y Multi-tenant Switcher** — Implementación del permiso `action_switch_tenant` que habilita el selector de distribuidora a usuarios administrativos autorizados. Actualización de `security.py` (backend) para permitir bypass de ownership vía permisos. Fix crítico de estabilidad: resolución de errores 500 en Dashboard (date parsing robusto) y eliminación de warnings de Recharts (`minWidth`/`minHeight` en `ResponsiveContainer`). Sincronización de interfaz `MotorRun` con el esquema real de BD (`iniciado_en`, `finalizado_en`).
- **04/04 (3)**: **Migración a Light-Violet Theme** — `:root` cambiado a modo claro (`#F8FAFC` bg, violeta como acento). Nuevos primitivos shadcn/ui: `Checkbox`, `Table`, `DropdownMenu`. `permissions/page.tsx` reescrito con shadcn `Table`+`Checkbox`; constantes de grupos/permisos hoistadas a módulo. `Sidebar.tsx` actualiza el switcher de distribuidora con `DropdownMenu`, memoiza `navItems` con `useMemo`, agrega cleanup en fetch y tipado correcto (`React.ElementType`). Mejoras de calidad: `Fragment key`, guardas simplificadas, wrapper divs eliminados.
- **04/04 (2)**: La **Matriz de Permisos** ahora es totalmente **editable** por el Superadmin con persistencia en base de datos.
- **04/04**: Implementación de **Matriz de Permisos** (RBAC), nuevo rol **Directorio** con acceso global, y **Jerarquía de Objetivos** (contención de progreso). Rediseño estético completo adoptando **shadcn/ui** y refinando la paleta violeta.
- **03/04 (tarde)**: Refactorización modular de `api.py` (4067 → 98 líneas). Nuevo árbol: `core/` (config, security, lifespan, helpers), `models/schemas.py`, `routers/` (auth, erp, supervision, admin, reportes). Cero cambios en contratos HTTP — URLs, métodos y esquemas JSON idénticos. Backup en `api_legacy.py.bak`.
- **03/04**: Implementación de sistema de objetivos y carrito de selección en el mapa de supervisión.
- **02/04**: Estandarización de nombres ERP para vendedores y auditoría de ranking Marzo 2026.
- **01/04**: Fix de estabilidad en marcadores de mapa (GPU/WebGL conflict resolution).
