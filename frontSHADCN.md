# Implementation Plan: Light-Violet Theme & Full shadcn Migration

This plan involves pivoting from a dark theme to a **Clean Light Theme** based on grays, whites, and violet, while fully standardizing on **shadcn** components.

## User Review Required

> [!IMPORTANT]
> **Theme Shift**: Backgrounds will be off-white (`#F8FAFC` / `oklch(0.97 0.01 251)`) with light-gray borders. Violet will remain the primary brand color for highlights and primary actions.
> 
> **shadcn Primitives**: I will install/create `Checkbox`, `Table`, and `DropdownMenu` components in `src/components/ui` to enable the full migration of the Permissions Matrix and Sidebar switcher.

## Proposed Changes

### 1. Design System

#### [MODIFY] [globals.css](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/globals.css)
- **Reset to Light Mode**: Redefine `:root` variables to use light backgrounds and high-contrast text.
- **Violet Palette**: Keep `--shelfy-primary` as `#a855f7` but ensure contrast against white.
- **Glass-Card**: Update `.glass-card` to a light-glass style (`rgba(255, 255, 255, 0.4)`).

### 2. shadcn UI Components

#### [NEW] [checkbox.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/ui/checkbox.tsx)
- Add the `Checkbox` primitive from shadcn (using `@radix-ui/react-checkbox`).

#### [NEW] [table.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/ui/table.tsx)
- Add the `Table` primitive for the Permissions Matrix and Reports.

#### [NEW] [dropdown-menu.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/ui/dropdown-menu.tsx)
- Add the `DropdownMenu` primitive for the Sidebar's Distributor Context Switcher.

### 3. Feature Migration

#### [MODIFY] [Sidebar.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/layout/Sidebar.tsx)
- Use shadcn `Button` and `DropdownMenu`.
- Shift labels and hover states to dark grays/violet.

#### [MODIFY] [permissions/page.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/admin/permissions/page.tsx)
- Fully rewrite using shadcn `Table`, `Checkbox`, and `Button`.
- Remove all custom "glass-card" styles that were dark-themed.

## Open Questions

- **Map Colors**: Should we adjust the seller colors on the `/supervision` map to be more pastel/vibrant to match the light theme?
- **Sidebar Background**: Do you prefer a slightly darker sidebar (light gray) or pure white to match the dashboard?

## Verification Plan

### Manual Verification
1. Confirm the app loads in a clean light theme.
2. Verify all buttons and inputs use the violet accent.
3. Check the Permissions Matrix for accessibility and "clean" gray backgrounds.
