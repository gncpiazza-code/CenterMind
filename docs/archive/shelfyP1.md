# Implementation Plan - Supervision Enhancements & Objectives Tracking

This plan outlines the restructuring of the Supervision panel into three specialized map modes and the creation of a new Objectives tracking system.

## User Review Required

> [!IMPORTANT]
> **Tech Stack Compliance**: I will strictly use **shadcn/ui** for new components, **TanStack Query** for all data synchronization, and **Zustand** for state management, as requested.

> [!IMPORTANT]
> **Database Schema Changes**: This task requires creating a new `objetivos` table in Supabase. I will provide the SQL migration script for you to run in the Supabase SQL Editor.

> [!WARNING]
> **Automatic Routing (Mode 3)**: The "Automatic" mode for ruting uses a quadrant-based algorithm. The initial version will focus on density-based redistribution of PDVs between routes. More complex heuristics (traffic, time-windows) may be added later.

## Proposed Changes

### Database (Supabase)

#### [NEW] `objetivos` Table
Create a table to store individual objectives for sellers.
- `id`: uuid (primary key)
- `id_distribuidor`: int4 (fk)
- `id_vendedor`: int4 (fk)
- `tipo`: text (e.g., 'conversion_estado', 'cobranza', 'ruteo_alteo')
- `id_target_pdv`: int4 (optional, for PDV-specific goals)
- `id_target_ruta`: int4 (optional, for Route-specific goals)
- `estado_inicial`: text (current status at creation)
- `estado_objetivo`: text (desired status)
- `valor_objetivo`: numeric (for collection goals)
- `valor_actual`: numeric (tracked automatically)
- `cumplido`: boolean (default false)
- `created_at`: timestamp (with zone)
- `updated_at`: timestamp
- `completed_at`: timestamp (null if not completed)

---

### Backend (Python/FastAPI)

#### [MODIFY] [api.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/api.py)
- Create endpoints for managing objectives:
    - `POST /api/supervision/objetivos`: Set a new objective.
    - `GET /api/supervision/objetivos/{dist_id}`: List all objectives for a distributor.
    - `GET /api/supervision/objetivos/vendedor/{vendedor_id}`: List objectives for a specific seller.
- Logic to "auto-update" objectives will be triggered during fetches to ensure data is fresh.

---

### Frontend (Next.js)

#### [MODIFY] [TabSupervision.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/TabSupervision.tsx)
- **Mode Selector**: Add three cards (using **shadcn Card**) before the map to switch between modes.
- **Mode 1: Activos/Exhibidos**:
    - Current map logic + "List" view (using **shadcn Table**) of Inactive clients.
    - Modal (using **shadcn Dialog**) to set "Conversion" objectives for selected clients.
- **Mode 2: Deudores**:
    - Pin styling: Fill = Vendor Color, Border = Debt Status (Green/Orange/Red).
    - Toggle by vendor/route.
    - Modal to set "Collection" objectives.
- **Mode 3: Ruteo**:
    - **Manual**: Split view with Drag-and-Drop between routes for up to 2 sellers.
    - **Automatic**: Map interaction to define quadrants (1km²). Labeling A, B, C, D. Algorithm to recommend redistribution.
    - **PDF Generation**: "Routing Worksheet" and "Analysis Report".
- **Data Layer**: Use **TanStack Query** `useMutation` for objective creation and `useQuery` for real-time status updates. State managed via **Zustand**.

#### [MODIFY] [MapaRutas.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/MapaRutas.tsx)
- Add `mode` prop.
- Update `PinCliente` rendering logic to use border colors based on mode.

#### [NEW] [objetivos/page.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/objetivos/page.tsx)
- New page to track all objectives.
- Status dashboard (Pending, In Progress, Completed).
- Link to map mode for context.

---

## Open Questions

1.  **Automatic Routing Algorithm**: Should it prioritize minimizing travel distance or balancing the number of clients per day?
2.  **PDF Generation**: Do you have a preferred library for PDF generation in the frontend (e.g., `jsPDF`, `react-pdf`) or should I continue with raw HTML-to-Print logic?
3.  **Quadrant Selection**: Is a rectangle-based grid sufficient for the 1km² quadrants, or do you need freeform polygon selection?

## Verification Plan

### Automated Tests
- Integration tests for objective creation and status auto-update.
- Unit tests for the routing redistribution algorithm.

### Manual Verification
- Verify map mode switching and pin color updates.
- Test PDF generation in all three modes.
- Confirm objective tracking updates correctly when a purchase or exhibition is registered.
