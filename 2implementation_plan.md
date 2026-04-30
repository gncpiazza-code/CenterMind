# CenterMind System Optimization — Master Plan

This document outlines the final, comprehensive technical plan to stabilize and optimize the CenterMind platform.

## User Review Required

> [!IMPORTANT]
> **Data Format Change**: We will implement a robust parser for the `clientes_pdv_v2` ingestion to handle coordinates provided as combined strings (e.g., `"lat | lon"`). 
> 
> **Map Stability**: Map markers in the supervision panel will be refactored to be static relative to geographic coordinates, eliminating any jitter or re-adjustment during pan/zoom.
> 
> **Route Removal**: The `/academy-hub` route and all associated navigation links will be completely removed from the system.

## Proposed Changes

### 1. Frontend UI & UX Hardening
Focus on performance-oriented visualization and layout stability.

#### [MODIFY] [RankingTable.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/dashboard/RankingTable.tsx)
- Add "Nº Destacadas" column to the ranking table.
- Implement a fixed-height scrollable container (max-height) for the Top 10 to prevent layout shifts.
- Optimize row rendering for mobile/desktop parity.

#### [MODIFY] [HeroCarousel.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/dashboard/HeroCarousel.tsx)
- Implement a dual-layer image renderer (blurred background + contained foreground) to handle both horizontal and vertical photos seamlessly.

#### [DELETE] [Academy Hub Route](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/academy-hub)
- Remove the entire directory to disable the route.

#### [MODIFY] [Sidebar.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/layout/Sidebar.tsx)
- Remove the "Real Academy" link and any references to `/academy-hub`.

### 2. Supervision & Mapping Logic
Fix critical monitoring issues and coordinate data integrity.

#### [MODIFY] [MapaRutas.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/MapaRutas.tsx)
- Refactor marker initialization to use persistent `maplibregl.Marker` instances that anchor strictly to their `LngLat`.
- Disable marker recreation on map move/zoom events to eliminate visual jitter.
- Set explicit `anchor: 'bottom'` for pins to maintain visual alignment with the ground.

#### [MODIFY] [padron_ingestion_service.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/services/padron_ingestion_service.py)
- Implement `_parse_coordinate_robustly` to handle:
    - Numeric floats.
    - Combined strings: `"-34.123 | -58.456"`.
    - Localization issues: `"-34,123"` (comma as decimal).

### 3. Backend Security & RPA Motors
Consolidate tenant isolation and restore the administrative engine.

#### [MODIFY] [api.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/api.py)
- **Global Audit**: Ensure `check_dist_permission` is enforced on every endpoint.
- **RPA Fixed**: Restore correct orchestration for the "Cuentas Corrientes" and "Ventas" motors.
- **Logging**: Expose `motor_runs` execution logs to the frontend via a unified endpoint.

#### [MODIFY] [bot_worker.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/bot_worker.py)
- Fix `/stats` command to respect timezone-aware calendar month ranges (ART).
- Verify `/ranking` accuracy for the finalized ERP-to-Telegram mapping.

## Verification Plan

### Automated Tests
- **Unit Test**: Parse coordinates with variations of separators (`|`, `,`, `;`) and null values.
- **Security Check**: Attempt to access Distributor B data using Distributor A token (Expect 403).

### Manual Verification
- **Map Stress Test**: Zoom and scroll in `/supervision`. Pins must remain locked to their exact street locations.
- **UI Audit**: Confirm the ranking table scrolls within its card and "Destacadas" count is visible.
- **Route Lockdown**: Verify that manual navigation to `/academy-hub` results in a 404/Redirect.
