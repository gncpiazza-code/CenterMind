# Final Plan: RBAC Matrix and shadcn/ui Overhaul

This plan incorporates the "Publicidad App" inspiration for the Access Matrix and implements a flexible permission system for all submenus in Shelfy.

## User Review Required

> [!IMPORTANT]
> **Permission Persistence**: Permissions will be stored in a new `roles_permisos` table. I will pre-populate it with standard defaults for the 5 roles.
>
> **Submenu Control**: I will map every item in the Sidebar (Dashboard, Supervision, Objetivos, Reportes, ERP, etc.) to a permission key that can be toggled in the Matrix.

## Proposed Changes

### 1. Database & Security

#### [NEW] [schema_roles_v2.sql](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/base_datos/schema_roles_v2.sql)
- Create `roles_permisos` table: `id`, `rol`, `permiso_key` (text), `valor` (boolean).
- Pre-populate with keys like: `menu_dashboard`, `menu_supervision`, `menu_objetivos`, `menu_reportes`, `action_edit_objetivos`, `action_toggle_vendedores`.

#### [MODIFY] [auth.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/routers/auth.py)
- Update `LoginResponse` and context switching to include the full map of permissions for the current user's role.
- Treat `directorio` as a global role (like superadmin) in `switch_context`.

### 2. Frontend: The Matrix & Global UI

#### [NEW] [Matrix Page](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/admin/permissions/page.tsx)
- Implementation following the provided image: Rows = Roles, Columns = Modules/Actions.
- Built with `shadcn/ui` Table, Checkbox, and Card.

#### [MODIFY] [Sidebar.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/layout/Sidebar.tsx)
- Redesign with `shadcn/ui`.
- Use the `rol_permisos` data to show/hide entire submenus dynamically.

#### [MODIFY] [TabSupervision.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/TabSupervision.tsx)
- Add permission checks for "Activar/Desactivar Vendedores" and "Crear/Editar Objetivos".

### 3. Hierarchy & Objectives

- Implement the `Vendedor + Actividad + Cantidad + Tiempo` Phrase.
- Add hierarchical tracking: Supervisor objectives reflect the sum of their sellers' `cantidad`.

## Open Questions

- No more open questions. I will proceed with the "Directorio sees all" and the inspired UI.

## Verification Plan

### Automated Tests
- Script to verify that a role with `menu_reportes = false` cannot access `/api/reportes`.

### Manual Verification
- Toggle "Objetivos" for the `Supervisor` role in the Matrix and verify the menu disappears immediately.
- Test the Hierarchy: Create 3 seller objectives for 10 PDVs each, and verify the Supervisor's "Parent" objective shows 30 PDVs progress.
