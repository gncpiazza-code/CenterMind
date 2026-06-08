# Detailed Implementation Plan - Objective Flow Modernization

This plan addresses a critical database error and refactors the objective tracking engine to support real-time progress updates when sellers upload photos via the Telegram Bot.

## User Review Required

> [!IMPORTANT]
> **New Progress Logic**: We have decided that "Pendiente" (Pending) status photos will now advance the objective's `valor_actual`. 
> - **In Progress**: If the goal is not yet fully met (e.g., 1/2), the UI will reflect this immediately after upload.
> - **Completion**: Even if `valor_actual >= valor_objetivo` due to pending photos, the objective will likely stay as "Pendiente de evaluación" until the supervisor approves the photos to formally mark it as `cumplido = True`.

## Proposed Changes

### 1. Database Bug Fix
**Problem**: `listar_objetivos` fails with `column clientes_pdv_v2.id does not exist`.
**Fix**: Update the query to use the correct primary key `id_cliente`.

#### [MODIFY] [supervision.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/routers/supervision.py)
- Update lines 887-888: change `.select("id, id_cliente_erp")` to `.select("id_cliente, id_cliente_erp")`.
- Update line 890: change `p["id"]` to `p["id_cliente"]`.
- Update line 893: change `pdv_erp_map.get(obj["id_target_pdv"])` to use the correct key.

---

### 2. Real-Time Bot Integration
**Problem**: The watcher doesn't run when a photo is uploaded, causing a delay in progress updates.
**Fix**: Explicitly trigger the watcher service from the bot worker.

#### [MODIFY] [bot_worker.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/bot_worker.py)
- Import `objetivos_watcher` inside `button_callback` or at the top level if possible.
- After successful photo registration (around line 1700), call `objetivos_watcher.run_watcher(self.distribuidor_id)` in a non-blocking way (e.g., using `asyncio.to_thread` or a background task).

---

### 3. Watcher Service Refactor
**Problem**: Progress only increments for "Aprobado" photos.
**Fix**: Update the diff logic to include "Pendiente" photos in the count.

#### [MODIFY] [objetivos_watcher_service.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/services/objetivos_watcher_service.py)
- Modify `_diff_exhibicion`:
    - Combine `all_exhibs` (Aprobados) and `pendientes` in the `nuevo_valor` calculation.
    - `nuevo_valor = float(len(all_exhibs) + len(pendientes))`
- Ensure that `cumplido = True` only happens if the **Aprobado** photos meet the requirement (optional, depending on user preference for "automatic completion"). 

---

### 4. UI Enrichment
**Problem**: Dashboard needs to clearly show when an objective has pending photos.

#### [MODIFY] [supervision.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/routers/supervision.py)
- Ensure the `tiene_exhibicion_pendiente` flag (lines 915-916) correctly reaches the frontend.

## Verification Plan

### Automated Tests
- Execute `listar_objetivos` via `curl` or Postman to ensure the SQL error is gone.
- Run a manual script to verify that `clientes_pdv_v2` indeed uses `id_cliente`.

### Manual Verification
1. **Upload Experience**: As a seller, upload a photo via Telegram.
2. **Immediate Progress**: Open the Superadmin dashboard and verify that the objective's progress bar has advanced (e.g., from 0% to 50%).
3. **Approval State**: Verify that the objective shows "En progreso" with a pending indicator.
4. **Completion Flow**: Approve the photo and verify that the objective moves to "Cumplido" (100%).
