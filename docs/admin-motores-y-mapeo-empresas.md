# Idea: sección Admin — mapeo empresa (ERP ↔ Shelfy) y salud de motores

Documento **solo de diseño** (sin implementación). Objetivo: extender el área **`/admin`** con una vista donde **solo superadmin** vea **quién es quién** entre el Excel/ERP y Shelfy, y el **estado reciente** de cada motor RPA / ingesta (todas las distribuidoras, incluidas corridas globales `dist_id = 0`).

**Alcance de permisos:** **solo `is_superadmin`.** Sin variante para admin de tenant: la ruta, el fetch y los endpoints nuevos deben repetir el mismo chequeo que otras rutas exclusivas (`403` si no corresponde).

---

## 1. Personas y permisos

- **Superadmin:** único perfil autorizado — ve todas las distribuidoras y datos globales.
- **Admin de tenant:** sin acceso a esta pantalla ni a los endpoints específicos de este snapshot.

---

## 2. Datos que querés mostrar (por fila lógica)

### 2.1 Identidad en Shelfy

- **`id_distribuidor`**
- **`nombre` / `nombre visible`** de la distribuidora (`distribuidores`)
- **`id_empresa_erp`** (código que viene del Excel / CHESS y se usa para mapear — hoy se usa en ingesta de padrón y coherencia general)

### 2.2 Nombre en archivo / ERP

- **`nombre_erp`** según tabla **`erp_empresa_mapping`** (nombre tal como aparece o se normaliza desde el ERP para mapear al `id_distribuidor`).
- Si un Excel trae columnas tipo **`idempresa`**, mostrar el **valor crudo** esperado o el rango que viste en ingestas (útil para depurar “empresa X no mapeó”).

*(Nota: hoy el vínculo empresa↔dist está repartido entre `distribuidores.id_empresa_erp`, `erp_empresa_mapping`, y lógica especial Real/franquicias en código; la UI debería **unificar la lectura** vía un endpoint agregado que devuelva una fila “canonical” por distribuidor más notas de negocio.)*

### 2.3 Última corrida por motor (timestamp + resultado)

Por cada **motor** relevante, mostrar al menos:

| Motor (valor en `motor_runs.motor`) | Qué representa (idea) |
|-------------------------------------|------------------------|
| `padron` | Ingesta padrón focalizada en ese `dist_id` |
| `padron_global` | Corrida multi-tenant (`dist_id = 0`) que afectó el mapa global |
| Otros que existan en producción | `ventas`, `cuentas` si se registran igual, `sigo`, etc. |

Campos útiles de **`motor_runs`** (ya existentes en uso en código):

- **`iniciado_en`**, **`finalizado_en`**
- **`estado`** (`ok` / `error` / `en_curso` según lo que escriban los servicios)
- **`registros`** (JSON con conteos o metadata — mostrar resumido)
- **`error_msg`** (truncate en UI con expand)

**Problema UX:** un mismo motor puede tener **muchas** filas históricas. En la grilla principal solo hace falta **la última por (dist_id, motor)** o “última relevante” para `padron_global`.

---

## 3. Fuentes en base (Supabase)

Ideas de tablas a unir (nombres ya usados en router/servicios):

- **`distribuidores`**: id, nombre, `id_empresa_erp`, flags, etc.
- **`erp_empresa_mapping`**: `nombre_erp` ↔ `id_distribuidor`
- **`motor_runs`**: historial de corridas; filtrar / agregar en backend

Opcional para enriquecer:

- **`motor_runs`** con `motor = 'padron_global'` para mostrar “última corrida global del padrón” en un bloque aparte (no por fila de dist).

---

## 4. Estado del API hoy (apróx.)

- Ya existen **`GET /api/admin/motor-runs`** (lista reciente, opcional filtro `motor`) y **`GET /api/admin/motor-runs/{dist_id}`** (por distribuidor).
- **No** hay todavía un endpoint “**dashboard**” que devuelva *por cada distribuidora* el mapeo ERP + última corrida de N motores en **una** respuesta (evita muchas llamadas desde el front).

**Idea de API nueva (v1):**

- `GET /api/admin/ops/empresa-motor-snapshot`  
  - **Solo superadmin** (`403` en otro caso)  
  - Devuelve: array de `{ dist, mapping_erp[], last_runs: { padron?, ventas?, cuentas?, ... } }`
- Implementación: query a `distribuidores` + join o subquery a `motor_runs` con **distinct on** o ventana SQL (`row_number() over (partition by dist_id, motor)`), o hacer el agregado en Python si PostgREST limita.

Si no querés tocar SQL complejo al inicio: el front puede hacer **1** fetch de distribuidoras + **N** fetch de último run por motor — aceptable sólo con pocos tenants; con 4–10 está bien para MVP.

---

## 5. UX en `/admin` (frontend)

### 5.1 Ubicación

- Nueva entrada en el **menú lateral** del admin (visible **solo si superadmin**): ej. **“Operación”** o **“Motores y mapeos”**.
- Nueva ruta tipo `shelfy-frontend/src/app/admin/.../page.tsx` o pestaña dentro de `UnifiedDashboard` si preferís no multiplicar rutas.

### 5.2 Componentes sugeridos

1. **Tabla principal**
   - Columnas fijas: `id_distribuidor`, nombre Shelfy, `id_empresa_erp`, nombre(es) archivo/ERP desde mapping.
   - Columnas dinámicas o sub-filas: **última corrida + estado** por motor (icono ✅ / ❌ / ⏳, tooltip con `error_msg`).
2. **Fila expandible** o **sheet lateral** con histórico: últimos 10 `motor_runs` para ese `dist_id` (reuso de `motor-runs/by dist`).
3. **Banner** para `padron_global`: última corrida multi-tenant (la página entera ya es solo superadmin).

### 5.3 Detalles de producto

- Formato de fechas **hora Argentina** en cliente (`America/Argentina/Buenos_Aires`) vs ISO en DB UTC — mostrar explícito en tooltip “UTC / AR”.
- `registros` como JSON — renderizar sólo llaves conocidas (`sucursales`, `vendedores`, `clientes`, `tenants_procesados` en global) como chips o números.

---

## 6. Alcance incremental (roadmap sugerido)

| Fase | Contenido |
|------|-----------|
| **MVP** | Tabla distribuidoras + columnas mapping (`distribuidores` + `erp_empresa_mapping`) + última fila por motor usando endpoints existentes o un solo endpoint agregado mínimo. |
| **v2** | Filtros, export CSV, vínculos a pantalla ERP existente (`TabERP`, `TabPadron`). |
| **v3** | Alertas (ej. ningún `padron` ok en últimos X días), integración Telegram/email opcional — fuera del scope documental. |

---

## 7. Riesgos y decisiones abiertas

- **`padron_global` con `dist_id = 0`:** la grilla por distribuidora no “atribuye” sola ese evento — conviene una **sección global** arriba de la tabla.
- **Motores que no registran `motor_runs`:** algunos procesos pueden no escribir aún esa tabla; antes de prometer la vista, inventariar motores que **sí** dejan huella consistente (`padron`, `padron_global`, …).
- **Franquicias Real/Bolivar/Mágica/Caramele:** pueden compartir `id_empresa_erp`; la UI debe dejar aclarado “mismo código ERP → varias filas Shelfy por diseño”.

---

## 8. Checklist antes de desarrollar

- [ ] Confirmar columnas exactas de `motor_runs` en Supabase (índices en `motor`, `dist_id`, `iniciado_en` para performance).
- [ ] Definir lista canónica de **nombres de motor** que la operación espera ver.
- [ ] Proteger ruta en el front (redirect o 403) y API con `is_superadmin` consistente.
- [ ] Diseño Figma rápido o wireframe inline en issue.
