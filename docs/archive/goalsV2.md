# Universal Objectives & Smart Supervision (v6 - Hyper Detailed)

This plan adheres strictly to the user's exact requirements, using their terminology and ensuring no details are omitted.

## User Requirements (Exact Words)

> [!IMPORTANT]
> - **"la tarjeta del pdv debe cerrarse automaticamente 2s despues de hacer click"**
> - **"en esa tarjeta debe verse la exhibicion si dejamos el cursoe arriba del punto 3segundos"**
> - **"ideal combianr el modo 'constructor frase' y el 'modo libre' en un solo modo que inlcuya ambos"**
> - **"Elimina lel objetivo de 'visita' eso no existe"**
> - **"Alteo debemos poder seleccionar una ruta (de forma opcional)... que dia la visita y cuantos pdvs tiene en esa ruta... cantidad de pdvs a altear"**
> - **"Al final incluir el constructor frase completo detallado... [vendedor] debe Altear [cantidad de pdv] pdvs en [ruta] de los dias [dia de visita] para el dia [fechalimite] tenes [dias disponibles] para cumplir el objetivo."**
> - **"Cobranza... listado de sus deudores... se cobra la deuda entera o parcial... frase final [vendedor] debera cobrarle [monto a cobrar] a [id cliente, nombre] para la fecha [fecha limite]"**
> - **"imprimir los objetivos para darle a cada vendedor y sepa lo que tiene que hacer."**

## Proposed Changes

### [Frontend] Unified Smart Creation Modal (TabSupervision.tsx)

#### [MODIFY] [TabSupervision.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/TabSupervision.tsx)
- **Eliminate Legacy Modes**: Delete `ConstructorFrase` and `ModoLibre` distinction. Merge into a single `SmartObjectiveForm`.
- **Intelligent Cascading logic**:
    - **Alteo flow**: 
        1. Select Vendedor -> Fetch routes via `useQuery` to `/api/supervision/rutas/{id_vendedor}`.
        2. Select Route (Dropdown) -> Display `dia_semana` and `total_pdv` from route object.
        3. Input: `cantidad_alteo` (Target numeric).
        4. Phrase: `[vendedor_nombre] debe Altear [cantidad] pdvs en [ruta_nombre] de los días [dia_visita] para el día [fecha]. Tienes [días_restantes] días.`
    - **Activación / Exhibición flow**:
        1. Select Vendedor -> Fetch PDVs via `/api/supervision/clientes/...` belonging to that vendor.
        2. Filter: Show only PDVs where `fecha_ultima_compra < 30 days` OR `last_exhibition == null`.
        3. Multi-Select: Limited to **max 25 PDVs**.
        4. Phrase Builder summary at the bottom.
    - **Cobranza flow**:
        1. Select Vendedor -> Fetch data from `/api/supervision/cuentas/{dist_id}` filtered by `id_vendedor`.
        2. List View: Show `Nombre | Monto | Días Atraso`.
        3. Select Mode: "Total" (copies debt to target) or "Parcial" (user inputs amount).
        4. Phrase: `[vendedor_nombre] deberá cobrarle [monto] a [cliente_id] [cliente_nombre] para la fecha [fecha].`
- **Contrast Fixes**: All text in this floating menu will use `text-[var(--shelfy-text)]` with high-contrast labels.

### [Frontend] Map Interaction Refinement (MapaRutas.tsx)

#### [MODIFY] [MapaRutas.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/components/admin/MapaRutas.tsx)
- **Timer Management**: Add `useRef` for `activePopup` and `timers`.
- **Click-to-Close (2s)**: 
    - Update `onClick` listener on pins.
    - On click: Open popup + `setTimeout(() => popup.remove(), 2000)`.
- **Hover-to-Photo (3s)**:
    - Update `onMouseEnter`: Start `3000ms` timer.
    - On Timeout: If `urlExhibicion` exists, call `popup.setHTML(newDetailedHTML)` where `newDetailedHTML` includes a `40x40` thumbnail or larger of the photo.
    - On `onMouseLeave`: `clearTimeout(hoverTimer)`.

### [Frontend] Field Asset Handouts

#### [MODIFY] [Objetivos (page.tsx)](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/objetivos/page.tsx)
- **Print Action**: Add a Print button to the header and individual list items.
- **Print View Component**:
    - Build `PrintableObjectiveItem` component.
    - Styled with `@media print { .no-print { display: none; } }`.
    - Format: 
        - Vendedor: [NAME]
        - Objetivo: [CONSTRUCTOR_FRASE_STRING]
        - Detalles: [PDV List / Route / Debt]
        - Checkbox for validation.

### [Backend] API & Persistence

#### [MODIFY] [supervision.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/routers/supervision.py)
- **Metadata Support**: Ensure `crear_objetivo` stores `id_target_ruta` and handles the `valor_objetivo` mapping for debt collection.

## Verification Plan

### Automated Verification
- Verify `buildPhrase` function handles date math correctly for "días disponibles".
- Ensure selection limit of 25 is enforced with UI warnings.

### Manual Verification
- **Map Interaction**: Use a stopwatch to confirm 2s closure and 3s photo reveal.
- **Form Cascade**: Select vendor 'X' and ensure only 'X's routes appear.
- **Printing**: Confirm the A4 layout is properly aligned in the print preview.
