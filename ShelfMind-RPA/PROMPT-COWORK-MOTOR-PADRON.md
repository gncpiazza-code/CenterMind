# Prompt para Claude Cowork — documentar flujo ERP y especificar motor Padrón

Copiá el bloque de **Prompt para pegar en Cowork** en una conversión nueva del proyecto ShelfMind-RPA / CenterMind. El objetivo es que el asistente **registre** el recorrido en la web (CHESS ERP / Consolido) y devuelva una **especificación** para implementar `motores/padron.py` con Playwright, alineado a `motores/cuentas_corrientes.py` y `motores/ventas.py`.

---

## Contexto rápido (no lo repitas todo en Cowork si ya indexó el repo)

- ShelfMind-RPA está en **`ShelfMind-RPA/`**: Playwright, Python asyncio, Vault Supabase (`get_secret`), subida Excel a la API con `lib/api_client.py` o HTTP directo como en cuentas.
- **`python runner.py padron`** hoy está previsto pero **no hay archivo `motores/padron.py` en el repo** — falta crearlo desde la especificación.
- **`POST /api/motor/padron-trigger`** (usado antes en borradores del scheduler) **no existe en el backend**; la ingesta de padrón en API es principalmente **`POST /api/admin/padron/upload-global`** con Excel (actualmente JWT superadmin — para RPA seguramente haga falta un endpoint tipo **`/api/motor/padron`** con **`x-api-key`**, parecido a `/api/motor/cuentas`).

---

## Cómo “registrar” clics vos mismo (rápido, sin IA)

Si Cowork tiene acceso al navegador, podeís pedirle que capture el flujo. Si no, herramientas útiles:

1. **Playwright Codegen** (genera código con selectores probando en vivo):

   ```bash
   playwright codegen "URL_DE_LOGIN_DEL_ERP"
   ```

   Ejecutarlo en una laptop con usuario de prueba. Copiás el archivo generado o los pasos al doc.

2. Grabar **video** / **screenshots** por paso (URL en barra de dirección + caption “acá clic en X”).

3. En CHESS típicamente hay: login → menú Informes/Padrón/etc. → exportar Excel. Anotá **nombre exacto** de cada menú y si hay **filtros** (fecha, empresa, sucursal).

---

## Prompt para pegar en Cowork

```text
Sos responsable de documentar la automatización Playwright para el “Motor Padrón de clientes” (ERP CHESS / Consolido) dentro del proyecto ShelfMind-RPA.

Tu entrega debe ser usable por un desarrollador que implemente `motores/padron.py` (Python asyncio + Playwright, igual familia que `motores/cuentas_corrientes.py` y `motores/ventas.py`).

### Qué producir (ordenado)

1) **Lista de TENANTS**: mismos distribuidores que ventas/cuentas (tabaco, aloma, liver, real) si aplica igual; si cada uno tiene URL distinta, detallarlas.

2) **Flujo usuario por tenant** — para UN tenant primero:
   - URL de login absoluta y si hay subdomain por empresa.
   - Paso a paso numerado (1…N): texto del botón o link, XPath/CSS si podés inferirlo, tiempo de espera razonable, popups conocidos (“actualización CHESS”, “accesos concurrentes”, etc.) y cómo cerrarlos.
   - Pantalla donde se llega al **reporte de Padrón de clientes / maestro / export** (nombre exacto en el ERP).

3) **Export**:
   - ¿Es descarga tipo Excel desde grid? ¿Un botón “exportar”?
   - Formato esperado del archivo (.xlsx, nombre sugerido, columnas esperadas si las ves).

4) **Dedup / detección sin cambios** (opcional pero deseable): cómo saber si el día no cambió vs `lib/hash_guard.py` igual que otros motores.

5) **Backend**: qué POST usar para subir el Excel a Shelf Mind (hoy existe ingesta padron pero puede requerir endpoint `/api/motor/padron` con X-Api-Key en lugar de JWT). Sugerí cuerpo/headers multipart exactos.

### No inventes pantallas que no navegastes

Marcá cada sección como [OBSERVADO] o [INFERIDO/PROPUESTA].

### Referencia de código a leer en el mismo repo antes de responder

`ShelfMind-RPA/motores/cuentas_corrientes.py` (patrón launch browser, tenants, errores screenshots), `ShelfMind-RPA/motores/ventas.py`, `ShelfMind-RPA/runner.py`, `ShelfMind-RPA/lib/api_client.py`, `CenterMind/routers/erp.py` (padron ingest).
```

---

## Probar que el motor (cuentas) corre **ahora**

El scheduler solo tiene **cuentas** 07:00 y 14:30 AR.

### En Railway

1. Servicio RPA → **Variables** → `RPA_START_MODE` = `cuentas` (valor literal `cuentas`).
2. **Redeploy** (o esperá el deploy nuevo).
3. **Logs**: buscar “Motor CUENTAS”, tenants, subidas OK.
4. Volver a **`scheduler`** o borrar la variable y redeploy (para recuperar cron).

### En tu Mac (sin tocar Railway)

```bash
cd /Users/…/CenterMind/ShelfMind-RPA
# con las mismas env que Railway (SUPABASE_URL, SUPABASE_KEY, SHELFY_API_KEY, …)
python runner.py cuentas
```

Deberías ver líneas tipo `🏢 Cuentas Corrientes`, `✅ Subida OK`, etc.
