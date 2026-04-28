# Prompt Claude Cowork — Motor Padrón (ERP CHESS → Excel → ingest Shelfy)

Abrís el proyecto **CenterMind** (raíz repo) así Cowork tiene acceso al código citado.

---

## Contexto de backend (léelo antes del prompt — no repetir verbatim)

### Qué ya existe

- **`CenterMind/services/padron_ingestion_service.py`** — `PadronIngestionService`:
  - Recibe **`bytes`** de un archivo **.xlsx / .xls / .csv**.
  - Parsea Excel, detecta columnas con **`_detect_columns`** (nombres flexibles tipo CHESS: `idcliente`, `idempresa`, `dssucur`, `d_vendedor`, coordenadas, días de ruta, etc.).
  - **Ingest global** (`ingest`): agrupa por **`idempresa`** y mapea cada código a **`id_distribuidor`** vía tabla **`distribuidores`** (`id_empresa_erp` / mapping). Caso **Real + franquicias**: re-rutea filas por **nombre de sucursal** (UEQUIN, ONDARRETA, BIAVA/CARAMELE) igual que está documentado en el mismo archivo.
  - Escribe **`sucursales_v2`, `vendedores_v2`, rutas, `clientes_pdv_v2`**; marca PDV ausentes como **`estado=inactivo`** donde aplica el alcance del Excel.
  - Registra runs en **`motor_runs`** (`padron_global` para global, `padron` por dist).

### Puntos HTTP actuales (importante para RPA)

- `POST /api/admin/padron/upload-global` y `upload/{dist_id}` usan **`verify_auth`** (JWT) y en global **solo superadmin**.
- **No existe** hoy **`POST /api/motor/padron`** con **`x-api-key`** como `/api/motor/cuentas` o `/api/motor/ventas`.

Conclusión: el RPA debería **o bien** obtener un archivo idéntico al que hoy exporta Consolido/CHESS y **subirlo** con un **nuevo endpoint** que internamente llame `padron_service.ingest(file_bytes)`, **o** seguir usando carga manual superadmin (no ideal para headless).

---

## Prompt para pegar en Cowork (copiar todo el bloque de abajo)

```
Trabajás en el monorepo CenterMind. Objetivo: especificar el futuro "Motor Padrón" en ShelfMind-RPA (Playwright + Python) y, si hace falta, el contrato mínimo en el backend FastAPI.

## A) Inventario rápido (leé estos archivos antes de responder)
- `CenterMind/services/padron_ingestion_service.py` — qué columnas exige (mínimo id de cliente; global también idempresa), groupby por empresa, split Real/franquicias.
- `CenterMind/routers/erp.py` — rutas `padron/upload-global` y diferencia con motores RPA `motor_ventas` / `motor_cuentas`.
- `ShelfMind-RPA/motores/cuentas_corrientes.py` y `ventas.py` — patrón: login CHESS, popups, descarga Excel, llamada HTTP con SHELFY_API_KEY.
- `ShelfMind-RPA/runner.py` — prevé `motores.padron` pero puede no existir `motores/padron.py` aún.

## B) Qué producir (ordenado)

1) **[OBSERVADO] Flujo usuario en CHESS / Consolido** (un tenant ejemplo, después generalizá lista de tenants igual que ventas/cuentas si aplica):
   - URLs de login; popups conocidos (“actualización”, “sesiones concurrentes”, etc.).
   - Ruta de menús hasta el **export de Padrón de clientes** (nombres exactos en la UI).
   - Cómo se dispara la **descarga** (botón export, Excel, nombre de archivo aproximado).

2) **[OBSERVADO o INFERIDO]** El Excel exportado:
   - ¿Trae columna **idempresa** (o equivalente) tal como espera `_detect_columns` / `ingest`?
   - Confirmá al menos: columna de **ID de cliente** y **empresa**; y que el archivo sea **.xlsx** (o lo que el servicio ya parsea).
   - Si el export del ERP no trae `idempresa`, indicá qué alternativa propone el ERP (otro reporte) — el backend **global** lo necesita para agrupar tenants.

3) **Especificación Playwright** (sin inventar selectores no vistos):
   - Pasos numerados y, si podés, **playwright codegen** o selectores probados.
   - Manejo de descargas (`Download`, path temporal) alineado a `cuentas_corrientes.py`.

4) **Integración API** (propuesta técnica, marcá [PROPUESTA]):
   - El backend hoy **no** expone padrón con `x-api-key`. Proponé un diseño mínimo: `POST /api/motor/padron` con `UploadFile` + header `x-api-key`, internamente `padron_service.ingest(file_bytes)` (misma semántica que upload-global sin JWT), o `ingest_for_dist` si el Excel es mono-tenant.
   - Indicá si conviene **un Excel global** (un solo POST) o **un archivo por tenant** repetido desde el RPA — justificá contra `ingest()` vs `ingest_for_dist()`.

5) **`motores/padron.py`** (outline):
   - Estructura async `run() -> dict` con resumen `ok` / `errores` / `sin_cambios` como otros motores.
   - Lista de TENANTS desde el mismo lugar que otros motores (vault / constante).
   - Subida multipart al endpoint elegido usando `httpx` o cliente existente.

6) Todo lo que no hayas reproducido en el ERP marcá **[INFERIDO]** y explicitá la suposición.

## C) prohibido
Inventar columnas CHESS sin verlas en un export real o sin citar fuente documental del proyecto.
```

---

## Cómo “registrar” clics rápido (vos o Cowork)

```bash
playwright codegen "URL_LOGIN_CHESS"
```

---

## Probar ingest sin RPA (validar formato Excel)

Manual superadmin → `POST /api/admin/padron/upload-global` con el mismo Excel que exportó el ERP; revisar logs del backend y `motor_runs` / `motor_runs.padron_global`.
