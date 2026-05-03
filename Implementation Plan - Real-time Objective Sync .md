# Implementation Plan - Real-time Objective Sync

This plan ensures that the objectives dashboard updates instantly when a photo is received via Telegram, providing a seamless "Trello-like" experience.

## User Review Required

> [!IMPORTANT]
> **Immediate Database Updates**: I will modify the bot to update the `valor_actual` column in the `objetivos` table exactly when the photo is matched, instead of waiting for the background watcher.
>
> **WebSocket Integration**: I will connect the Objectives page to the existing WebSocket server. When the bot sends a notification, the dashboard will automatically trigger a refresh.

## Proposed Changes

### [Component] Backend (Bot Worker)

#### [MODIFY] [bot_worker.py](file:///Users/ignaciopiazza/Desktop/CenterMind/CenterMind/bot_worker.py)
- Update the `ObjInterceptor` logic.
- When an objective is matched (`obj_id_match`), execute an immediate `UPDATE` on the `objetivos` table:
  ```python
  sb.table("objetivos").update({"valor_actual": valor_actual + 1}).eq("id", obj_id_match).execute()
  ```
- This ensures the data is "ready" before the frontend refetches.

### [Component] Frontend (React / Next.js)

#### [MODIFY] [page.tsx](file:///Users/ignaciopiazza/Desktop/CenterMind/shelfy-frontend/src/app/objetivos/page.tsx)
- **WebSocket Listener**:
  - Implement a `useEffect` that connects to `getWSUrl(distId)`.
  - Listen for `new_exhibition` or a new specialized `objetivo_update` event.
  - On event: `queryClient.invalidateQueries({ queryKey: ["objetivos", distId] })`.
- **Optimization**: 
  - Ensure the WebSocket connects once and cleans up on unmount.
  - Add a small delay/debounce if multiple photos are uploaded in a burst to avoid excessive API calls.

## Open Questions

- ¿Quieres que el dashboard emita un sonido sutil (tipo "ding") cuando una tarjeta se mueve sola?
- ¿Añadimos una pequeña animación (brillo o parpadeo) a la tarjeta que acaba de progresar para que el supervisor sepa qué cambió?

## Verification Plan

### Manual Verification
1.  **Dashboard Sync**: Open the Dashboard in one window and Telegram in another.
2.  **Test Upload**: Send a photo to the bot for a PDV with an active objective.
3.  **Visual Check**: Verify that the card moves from "Pendiente" to "En progreso" (or increments its progress bar) **instantly** without refreshing the page.
