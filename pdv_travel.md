# Implementation Plan [REVISED II] - Fix PDV Coordinate Retrieval in Modo Oficina

The goal is to fix the missing coordinates (`0.0, 0.0`) in the real-time "Modo Oficina" broadcast by correcting the query to the `clientes_pdv_v2` table.

## User Review Required

> [!IMPORTANT]
> The user confirmed the data exists in `clientes_pdv_v2` but the backend query is incorrect.
>
> I've verified the following column names in `clientes_pdv_v2`:
> - `id_cliente_erp`: The ERP code for matching.
> - `latitud`: Latitude coordinate.
> - `longitud`: Longitude coordinate.
>
> I will investigate if the "request mistake" relates to the **ID format** (e.g., leading zeros or type mismatch) or if the database responds to **abbreviated** column names (like `lat`, `lon` or `lng`) as acronyms.

## Current investigation Findings

- **Backend Request**: Currently querying `latitud` and `longitud` and mapping them to `lat` and `lng` for the frontend.

## Proposed Changes

### Backend (`CenterMind/CenterMind`)

---

#### [MODIFY] [bot_worker.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/bot_worker.py)

1.  **Refine Search Query**:
    - Ensure `nro_cliente` is queried correctly against `id_cliente_erp`.
    - I will check if we need to search for the client ID as a **string** or as a **number**, and if padding is required (e.g. `'040873'`).
2.  **Verify Coordinate Column Names**:
    - I will double-check if distributor 3 requires the "acronyms" `lat`, `lng`, or `lon` in the `.select()` statement instead of the full names.
    - I'll ensure the mapping from database result to WebSocket payload is 1:1 with frontend expectations.
3.  **Improve Error Visibility**:
    - Add specific logging to show the **full result** (or the failure) of the `clientes_pdv_v2` lookup during the real-time flow.
    - This will help identify if the query is failing because of No Results vs. Column Not Found.

## Verification Plan


### Manual Verification
- Upload an exhibition for PDV `xxxx`(pdv with latitud and longitud).
- Verify the real-time notification on the dashboard shows the correct location.
