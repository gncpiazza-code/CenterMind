# Professionalization of the Objectives System (v2)

The user's objective is to resolve UI/UX issues in the supervision dashboard, implement automated backend tracking for goals (including the new "Cobranza" type), and professionalize the objectives monitoring with cascading filters.

## User Review Required

> [!IMPORTANT]
> **Cobranza (Collection) Tracking**: The system will track debt levels from `cc_detalle`.
> - **Initial State**: When a collection goal is created, the system will snapshot the current debt for that client or seller.
> - **Tracking**: Every time the CC motor updates the database, the objective's `valor_actual` will be updated to reflect the current debt or the amount collected.

> [!TIP]
> **Cascading Filters**: A new multi-level filter (Sucursal > Supervisor > Vendedor) will be added to the `/objetivos` page to simplify management for distributors with many teams.

## Proposed Changes

### [Frontend] Objetivos & Supervision

#### [MODIFY] [MapaRutas.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/MapaRutas.tsx)
-   Set `closeOnClick: true` for MapLibre popups.
-   Add manual close button to the popup template.

#### [MODIFY] [TabSupervision.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/TabSupervision.tsx)
-   Fix contrast in the "Crear objetivo" floating menu for dark/light themes.

#### [MODIFY] [ObjetivosPage (page.tsx)](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/objetivos/page.tsx)
-   **Cascading Filter**: Implement a new filter bar component that fetches hierarchy data:
    -   Level 1: **Sucursal** (list all sucursales).
    -   Level 2: **Supervisor** (list supervisors of the selected sucursal).
    -   Level 3: **Vendedor** (list sellers of the selected supervisor/sucursal).
-   Update `NuevoObjetivoModal` to support "Cobranza" with a target amount input.

---

### [Backend] Automated Tracking & Logic

#### [NEW] [objetivos_watcher_service.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/services/objetivos_watcher_service.py)
-   Implement `run_watcher(dist_id)`:
    -   `ruteo_alteo`: Count new PDVs.
    -   `conversion_estado`: Track `fecha_ultima_compra` changes.
    -   `exhibicion`: Check for approved photo records.
    -   `cobranza`: **[NEW]** Query `cc_detalle` to calculate current debt vs. initial debt.
-   Update `valor_actual` and `cumplido` status.

#### [MODIFY] [padron_ingestion_service.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/services/padron_ingestion_service.py)
-   Hook `run_watcher` after client sync.

#### [MODIFY] [ventas_ingestion_service.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/services/ventas_ingestion_service.py)
-   Hook `run_watcher` after purchase updates.

#### [MODIFY] [supervision.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/routers/supervision.py)
-   Update `crear_objetivo` to snapshot initial debt for `cobranza` objectives.

## Open Questions

-   **Cobranza Aggregation**: Should a collection goal for a *Seller* track the sum of all their clients' debt, or is it always per specific client?
-   **Cascade Data**: Do we have a direct mapping in the DB from "Supervisor" to "Vendedor"? (Checking `integrantes_grupo.id_supervisor` or similar).

## Verification Plan

### Automated Tests
-   Verify cascading filter logic using browser tools (selection flow: Sucursal -> Supervisor -> Seller).
-   Mock CC updates to verify debt reduction tracking.

### Manual Verification
-   Create a "Cobranza" goal for a seller.
-   Simulate a debt reduction in `cc_detalle`.
-   Verify the progress bar in `/objetivos` reflect the payment.
