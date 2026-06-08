# Implementation Plan - 100% Polished Objectives System

This plan finalizes the objectives workflow, adding re-scheduling logic, automatic expiration, and PDF certificate generation.

## User Review Required

> [!IMPORTANT]
> **Linked Objectives**: Failed objectives can now be re-scheduled. The new objective will be linked to the original one (using a new `id_objetivo_padre` column). This "Chain of Effort" will be visible in the final certificate.
> 
> **Automatic expiration**: The system will automatically mark objectives as **TERMINADO** (as either Success or Failure) the moment the deadline expires.

## Proposed Changes

### [Component] Database (Linkage)

#### [SQL] Add Parent Linking
I will add a column to allow linking a new objective to a previously failed one.
```sql
ALTER TABLE objetivos ADD COLUMN IF NOT EXISTS id_objetivo_padre UUID REFERENCES objetivos(id);
```

### [Component] Backend logic

#### [MODIFY] [objetivos_watcher_service.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/services/objetivos_watcher_service.py)
- **Automatic Expiration**: Add a check for objectives that reached their `fecha_objetivo`.
    - If `valor_actual >= valor_objetivo` → `resultado_final = 'exito'`.
    - If `valor_actual < valor_objetivo` → `resultado_final = 'falla'`.
    - Both mark `cumplido = true`.
- **"En progreso" status**: Ensure `exhibicion` objectives reflect `En progreso` when `valor_actual > 0` but `cumplido = false`.

### [Component] Frontend (React / Next.js)

#### [MODIFY] [api.ts](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/lib/api.ts)
- Update `Objetivo` type to include `id_objetivo_padre`, `resultado_final`, and `observacion_revision`.

#### [MODIFY] [page.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/objetivos/page.tsx)
- **3-Column Kanban Layer**:
    - **Pendiente**: `!cumplido && valor_actual === 0`.
    - **En progreso**: `!cumplido && valor_actual > 0` (only for exhibitions).
    - **Terminado**: `cumplido === true`.
- **Card Polishing**:
    - Success (Green border/shadow).
    - Failure (Red border/shadow).
- **Control Removal**: Remove the "Marcar listo" toggle.
- **Re-scheduling**: Implement a "Re-agendar" button for failed objectives. It will pre-fill the form and set the `id_objetivo_padre`.
- **PDF Certificate**: Implement a function using `jspdf` to generate a formatted certificate.
    - Includes: Seller name, Objective achievement, Dates, and "Evolution" (list of linked attempts).

## Open Questions

- ¿Quieres que el PDF tenga un diseño tipo diploma formal o algo más minimalista/ejecutivo?
- ¿El certificado se habilita solo para los exitosos ('Éxito') o también para los fallidos ('Re-agendados')?

## Verification Plan

### Manual Verification
1.  **Exhibition Progress**: Verify the "En progreso" column works in real-time with the bot.
2.  **Deadline Force**: Manually edit a date to yesterday and run the watcher to see it turn Red.
3.  **Linkage**: Re-schedule a failed objective and verify the `id_objetivo_padre` is saved.
4.  **PDF Download**: Click the "Descargar Certificado" button and verify the history is listed.
