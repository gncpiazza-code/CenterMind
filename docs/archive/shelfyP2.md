# Implementation Plan - Supervision & Objectives Enhancements

This plan outlines the changes to implement a "Shopping Cart" style selection for objectives from the map, rename objective types, fix text contrast, and update the seller color palette.

## Proposed Changes

### 1. Rename "Conversión" to "Activación"
Change the labeling of objective types across the system.

#### [MODIFY] [page.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/objetivos/page.tsx)
- Update `TIPO_CONFIG` to change "Conversión" to "Activación".

### 2. Distinguishable Seller Color Palette (20 colors)
Define a new palette of 20 colors that avoid Red, Blue, Orange, and Green (used for PDV statuses).

#### [MODIFY] [TabSupervision.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/TabSupervision.tsx)
- Replace `VENDOR_COLORS` with a list of 20 distinct colors.

### 3. Contrast & UI Fixes in /objetivos
Improve text visibility in the objectives module.

#### [MODIFY] [page.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/objetivos/page.tsx)
- Increase contrast for badges and secondary text.
- Review and fix any low-contrast color combinations.

### 4. Floating Objectives Menu ("Shopping Cart")
Add the ability to select PDVs from the map and batch-assign objectives.

#### [MODIFY] [useSupervisionStore.ts](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/store/useSupervisionStore.ts)
- Add `selectedPDVsForObjective: number[]` state.
- Add `togglePDVForObjective: (id: number) => void`.
- Add `clearSelectedPDVs: () => void`.

#### [MODIFY] [MapaRutas.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/MapaRutas.tsx)
- Add `selectedPDVs` prop.
- Add `onTogglePDV` prop.
- Update marker rendering to handle click events for selection.
- Add visual indicator for selected pins (e.g., a white outer glow or ring).

#### [MODIFY] [TabSupervision.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/TabSupervision.tsx)
- Pass selection state and handlers to `MapaRutas`.
- Implement a new `FloatingObjetivosMenu` component that appears when PDVs are selected.
- This menu will allow:
    - Reviewing selected PDVs.
    - Selecting objective type, date, and entering observations.
    - Submitting to the `createObjetivo` API in a loop or batch (if available).

## 20 Distinguished Colors List
These colors are chosen to avoid the HSL ranges of status colors:
1.  `#FF00FF` (Magenta)
2.  `#8B5CF6` (Violet)
3.  `#06B6D4` (Cyan)
4.  `#F472B6` (Pink)
5.  `#D946EF` (Fuchsia)
6.  `#71717A` (Grey)
7.  `#78350F` (Brown)
8.  `#4338CA` (Indigo)
9.  `#BE123C` (Crimson)
10. `#CA8A04` (Ochre)
11. `#14B8A6` (Teal)
12. `#9333EA` (Purple)
13. `#DB2777` (Deep Pink)
14. `#0F766E` (Dark Teal)
15. `#0369A1` (Deep Sky)
16. `#57534E` (Stone)
17. `#A855F7` (Medium Purple)
18. `#0891B2` (Deep Cyan)
19. `#C026D3` (Fuchsia Deep)
20. `#4B5563` (Cool Grey)

## Verification Plan

### Automated Tests
- N/A (Manual visual verification required for map iteractions).

### Manual Verification
1.  **Map Selection**: Verify that clicking a PDV on the map adds it to the "cart" and shows it as selected.
2.  **Floating Menu**: Verify the menu appears with the correct count, and allows inputting data.
3.  **Objective Creation**: Verify that objectives are correctly created in the database for each selected PDV.
4.  **Renaming**: Verify that everywhere "Conversión" was used, "Activación" now appears.
5.  **Contrast**: Check the `/objetivos` page with a contrast checker or visual inspection to ensure readability.
6.  **Colors**: Ensure all 20 colors are distinct and don't clash with status borders.
