# Testing — Validación cartera bot (2026-05-28)

> **Regla:** `BOT_VALIDACION_CARTERA=1` solo en tu **API local** (`CenterMind/.env`).  
> **NO** agregar esa variable en Railway / Vercel / prod hasta cerrar QA.

---

## Modo recomendado: solo local (Test dist 1)

```bash
cd CenterMind
./scripts/run_bot_test_local.sh
```

Deja **@test_SQL_real_bot** en polling local con validación ON. **Real no se toca.**

Verificar: `python scripts/verify_bot_test_ready.py` → debe decir `LISTO`.

| NRO | Efecto |
|-----|--------|
| `11111` | OK → tipo PDV |
| `99999999` | Bloqueo + 2 botones |

`/reset` funciona para vos (admin + QA dist 1).

---

## PARTE A — Pre-chat (hacer una vez)

### A1. SQL en Supabase

**Estado:** si corrés el preflight (A3) y ves ✅ en tabla + RPC, **ya podés saltar este paso**.

Si no, en **Supabase → SQL Editor** ejecutá en orden:

1. `CenterMind/sql/2026-05-28_bot_pdv_pendiente_aviso.sql`
2. `CenterMind/sql/2026-05-28_fn_reconcile_exhibiciones_sombra.sql`  
   (firma `bigint`; solo matchea `cliente_sombra_codigo`, no `nro_cliente`)

### A2. Flag solo en local

En `CenterMind/.env` (ya debería estar):

```env
BOT_VALIDACION_CARTERA=1
```

**No** tocar variables en Railway.

### A3. Preflight automático

```bash
cd /Users/ignaciopiazza/Desktop/CenterMind/CenterMind
python scripts/preflight_validacion_cartera.py --dist-id <DIST_ID> --chat-id <CHAT_ID_GRUPO>
```

- Si termina con **“Listo para chat”** → pasá a **Parte B**.
- Si falla tabla/RPC → A1.
- Si falla flag → A2.
- Con `--chat-id` te imprime **NROs válidos** para copiar en Telegram.

`CHAT_ID` del grupo: en Telegram es negativo (ej. `-1001234567890`). Lo ves en logs al mandar un mensaje, o con `@RawDataBot` / `getUpdates`.

### A4. Cómo recibir updates del bot (sin romper prod)

| Modo | Cuándo usarlo |
|------|----------------|
| **Prod sigue en Railway** | No levantes `uvicorn` local con `WEBHOOK_URL` apuntando a Railway. Solo probá en un **grupo de dist de test** si el bot de prod ya está activo **y** Railway **no** tiene aún `BOT_VALIDACION_CARTERA=1` (sigue flujo viejo en prod, vos probás en local). |
| **Local + ngrok** (recomendado para QA aislado) | 1) `ngrok http 8000` 2) `WEBHOOK_URL=https://xxxx.ngrok-free.app` en `.env` 3) `uvicorn api:app --port 8000` 4) Al arrancar, los webhooks se re-registran a ngrok (**desvía el bot de prod** mientras ngrok esté activo). Al terminar, reiniciá Railway o re-seteá webhook a prod. |

Arranque local:

```bash
cd /Users/ignaciopiazza/Desktop/CenterMind/CenterMind
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

En logs debe aparecer: `Bot <dist_id> ... Webhook OK` (si hay `WEBHOOK_URL`) y al subir foto con flag on, la validación de cartera.

### A5. Elegir distribuidor y NROs

| Dist | Uso sugerido |
|------|----------------|
| `1` | Distribuidora Test |
| `3`, `4`, … | Solo si tenés grupo real mapeado a ese dist |

- **NRO válido:** el que imprime el preflight con `--chat-id`.
- **NRO inválido:** `99999999`.

CLI alternativa:

```bash
python scripts/test_bot_cartera_validacion.py --dist-id 1 --vendedor-id 42 --erp 12345 --check-cartera
```

---

## PARTE B — Solo chat (Telegram)

Usá el **mismo grupo** cuyo `chat_id` pasaste al preflight. Si la sesión queda colgada: `/reset`.

### Escenario 1 — NRO correcto

1. Foto → bot pide NRO  
2. NRO válido → **sin** pantalla de error → botones tipo PDV  
3. Tipo PDV → “Exhibición registrada”

### Escenario 2 — Error + reintento

1. Foto → NRO `99999999`  
2. Mensaje de cartera + **2 botones**  
3. Texto random → “Usá los botones…”  
4. **🔄 Enviar NRO otra vez** → pide NRO (misma foto)  
5. NRO válido → tipo PDV → OK

### Escenario 3 — PDV nuevo

1. Foto → `99999999` → **✅ Es PDV nuevo / continuar**  
2. Tipo PDV → OK  
3. (Opcional SQL) `SELECT * FROM bot_pdv_pendiente_aviso ORDER BY created_at DESC LIMIT 3;`

### Escenario 4 — Aviso post-padrón (sin RPA)

Solo si querés probar el mensaje “ya está en el padrón”:

```bash
# Después del escenario 3
python scripts/test_bot_cartera_validacion.py --dist-id <DIST_ID> --list-pendientes
python scripts/test_bot_cartera_validacion.py --dist-id <DIST_ID> --run-avisos
```

Para que el aviso dispare, el NRO debe existir en `clientes_pdv_v2_d<DIST>` **en una ruta del vendedor** (insert de prueba en el doc anterior o esperar padrón real).

Correr `--run-avisos` dos veces → segunda vez `enviados=0`.

---

## PARTE C — Rollback

```env
BOT_VALIDACION_CARTERA=0
```

Reiniciar API local. En el chat: `/reset`.

La tabla SQL y la función reconcile **no activan** la validación sin el flag.

---

## Checklist rápido

- [ ] `python scripts/preflight_validacion_cartera.py` → Listo para chat  
- [ ] API local con flag=1 (prod **sin** flag)  
- [ ] Webhook claro (ngrok o prod sin flag)  
- [ ] Escenarios 1–3 en Telegram  
- [ ] (Opcional) Escenario 4 con `--run-avisos`  
- [ ] **No** deploy a Railway con `BOT_VALIDACION_CARTERA=1`
