# Objectives & Supervision Enhancement Plan (v12)

This plan addresses a set of technical fixes and feature enhancements for the Goal Tracking (Objetivos) and Supervision modules, focusing on data accuracy, UI clarity, and professional-grade filtering.

## User Review Required

> [!IMPORTANT]
> **Debt Loading (Cobranza)**: We are investigating why the system reports "No Debt" despite data existing in Supabase. This likely stems from a mismatch in vendor name normalization between the Telegram identity and the ERP record. We will implement robust ID-based or fuzzy-normalized matching.
> 
> **Alteo Max Limit**: We are removing the safety constraint that prevented supervisors from assigning more PDVs than available in a route. This provides full flexibility but requires supervisors to be mindful of realistic targets.
> 
> **Floating Menu**: We are moving the "Phrase Preview" out of the floating menu to reduce visual clutter, while ensuring it is still generated and displayed in the main `/objetivos` list for clear reporting.

## Proposed Changes

### [BACKEND] Data Services

#### [MODIFY] [supervision.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/routers/supervision.py)
- **Debt Query**: Ensure `cc_detalle` correctly returns data by checking the latest `fecha_snapshot`. Fix potential vendor name/ID mapping issues.
- **PDV Status**: Ensure `fecha_ultima_compra` and `fecha_ultima_exhibicion` are consistently returned for filtering.

---

### [FRONTEND] Feature Enhancements

#### [MODIFY] [objetivos/page.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/objetivos/page.tsx)
- **Alteo Sorting**: Implement `DIA_ORDER` sorting (Lunes -> Domingo) for the route selection list.
- **Alteo Capacity**: Remove `max` attribute and "máx N" label from the PDV count input.
- **Activación Flow**:
    - Fetch PDVs for the selected vendor/route.
    - Filter: No purchases in the last 30 days.
    - Sort: Oldest purchase date first.
    - UI: Display purchase date and "Hace N días" badge.
- **Exhibición Flow**:
    - Filter PDVs without a recent exhibition photo.
- **Cobranza Flow**:
    - Fix the "No debt" message by ensuring the matching logic between `vendedor_nombre` and the current state is robust.

#### [MODIFY] [TabSupervision.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/TabSupervision.tsx)
- **Floating Menu (Carrito)**:
    - **UI**: Correct text color and background contrast for readability in the Light-Violet theme.
    - **Debt Display**: Show debt amount in the selected PDV cards when creating a Collection goal.
    - **Logic**: Generate the phrase on save but keep the floating menu UI lean (hide preview).

#### [MODIFY] [MapaRutas.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/MapaRutas.tsx)
- **Popup Card**: Add a dedicated line for **"Deuda Total"** in the PDV information popup.

## Verification Plan

### Automated/Code Verification
- **Debt Audit**: Run a manual check on `cc_detalle` via the backend to verify the snapshot date and name keys.
- **Sorting Audit**: Verify the `DIA_ORDER` constant matches the database strings exactly (check for accents like 'Miércoles').

### Manual Verification
- **Goal Creation**: Create an Alteo goal and verify routes are sorted correctly.
- **Activation Selection**: Select a vendor and verify the PDV list shows clients with purchase dates $> 30$ days ago.
- **Map Interaction**: Click a PDV pin and verify debt amount appears in the popup.
- **Floating Menu**: Open the carrito and verify text is readable and correctly themed (Light-Violet).
