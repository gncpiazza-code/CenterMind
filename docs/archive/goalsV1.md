# Professional Objectives Ecosystem (v5 - Detailed)

This plan provides a granular breakdown of the intelligent objective creation flow, refined map interactions, and the field-ready printing module.

## User Review Required

> [!IMPORTANT]
> **Dynamic Data Sources**: The modal will now act as a mini-dashboard during creation. 
> - **Debt**: It will fetch debt directly from `cc_detalle` instead of relying on the map state.
> - **Routes**: It will fetch the full route schedule (visit days) for the selected vendor.
>
> **Map Interaction Logic**:
> - **Click**: 2000ms "Stay open" then fade-out closure.
> - **Hover**: 3000ms "Progressive peek". After 3s, the card will refresh to show the PDV photo if available.

## Proposed Changes

### [Frontend] Supervision Dashboard

#### [MODIFY] [TabSupervision.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/TabSupervision.tsx)
-   **State Overhaul**: Add `objForm` state to track:
    -   `vendedorId`, `rutaId`, `pdvsInactivos`, `debtorList`.
-   **Intelligent Modal Sections**:
    -   **Alteo**: When selected, a `useQuery` fetches routes for the `vendedorId`. If a route is picked, show `total_pdv` and `dia_semana`.
    -   **Activación / Exhibición**: A `useMemo` filter on the local PDV list (from the dashboard) will find those with `fecha_ultima_compra > 30 days` or no recent exhibition.
    -   **Cobranza**: Fetch `cc_detalle` snapshots for the vendor. Display a list with `Name | Debt | Status`.
-   **Constructor Frase (The "Instruction Generator")**:
    -   A helper function `buildObjectivePhrase(formState)` will return a string:
        -   *Alteo*: `[Vendedor] debe Altear [X] pdvs en la ruta [Ruta] (Visita: [Dia]) para el [Fecha]. Tienes [N] días.`
        -   *Cobranza*: `[Vendedor] deberá cobrarle [Monto] a [Cliente] para la fecha [Fecha].`
-   **Contrast Fix**: Apply `bg-[var(--shelfy-panel)]` and `text-[var(--shelfy-text)]` with `backdrop-blur`.

#### [MODIFY] [MapaRutas.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/MapaRutas.tsx)
-   **Popup Controls**:
    -   **Click Handler**: `setTimeout(() => { if(popup.isOpen()) popup.remove(); }, 2000)` on pick.
    -   **Hover Peek Handler**:
        -   `onMouseEnter`: Start `3000ms` timer.
        -   If timer finishes: Call `popup.setHTML()` with a version that includes an `<img>` tag using `p.urlExhibicion`.
        -   `onMouseLeave`: `clearTimeout(peekTimer)`.

### [Frontend] Objectives Tracker

#### [MODIFY] [Objetivos (page.tsx)](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/objetivos/page.tsx)
-   **Print Module**:
    -   **Component**: `ObjectivePrintOut`. A component styled for A4 paper.
    -   **Layout**: 1 objective per section (or per page if many).
    -   **Content**: Large Title (Vendedor Name) + Bold Objective Phrase + Checkbox for manual tracking in the field.
-   **Cascading Filters**: Refine the `Sucursal > Supervisor > Vendedor` selectors to ensure they filter the list correctly in real-time.

### [Backend] API Layer

#### [MODIFY] [supervision.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/routers/supervision.py)
-   **Snapshot Logic**: Ensure `crear_objetivo` correctly handles partial debt amounts passed as `valor_objetivo`.
-   **Watcher Refresh**: Ensure the watcher service is called immediately after a new objective is created so the starting state is accurate.

## Verification Plan

### Manual Verification
- **Alteo Intelligent Fetch**: Select vendor 'X' -> confirm routes for 'X' appear in the dropdown.
- **Photo Peek**: Hover over a pin with an exhibition -> count to 3 -> confirm photo appears in the card.
- **Auto-close**: Click a pin -> confirm it closes after exactly 2 seconds.
- **Print Layout**: Check `window.print()` preview for layout alignment.

### Automated Tests
-   Verify that `objPhrase` updates correctly when the date or target value changes.
-   Validate that the 25-PDV limit is enforced in the selection logic.
