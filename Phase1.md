# Plan de Acción Integral: Matcheo Inteligente, Auditoría de Seguridad y Limpieza

Este plan detalla los pasos para resolver definitivamente las asignaciones excepcionales de vendedores "franquiciados" (IVAN SOTO) mediante un algoritmo inteligente de matcheo, la unificación global de Matias y Ivan Wutrich, y una limpieza y auditoría profunda de la seguridad del repositorio y base de datos (Shelfy / CenterMind).

## 1. Corrección y Reasignación Dinámica (Matcheo Inteligente)

Para resolver las asignaciones de forma estructural sin soporte desde el ERP, aplicaremos lógica cruzada en Python interactuando con la base de datos Supabase, garantizando que el origen de cada carga sea certero.

### 1.1 Unificación Permanente (Matias Wutrich → Ivan Wutrich)
- **Implementación SQL/Backend:** Crearemos un script de migración y consolidación llamado `unify_wutrich_records.py`.
- **Acción:** Identifica el `id_vendedor_erp` o `telegram_user_id` de ambas cuentas, reasigna todo el historial de exhibiciones y métricas de Matias de forma nativa a la cuenta de Ivan Wutrich en la tabla `exhibiciones`.
- **Efecto Residual:** La cuenta nominal de "Matias" pasará a estado inactivo (`activo = False`) automáticamente en `integrantes_grupo` y `vendedores`, previniendo que figure en futuros rankings.

### 1.2 Matcheo Inteligente de Rutas (Soto → Monchi & Jorge)
- **Modelo Heurístico Algorítmico:** Desarrollaremos un script `match_rutas_soto.py` que correrá sobre la data histórica de exhibiciones aprobadas.
- **Lógica de Inferencia:** 
  1. Extraer los datos de las visitas donde Monchi Ayala y Jorge Coronel hayan enviado imágenes bajo el nombre supervisor "Ivan Soto".
  2. Determinar los `id_cliente` asociados a cada envío.
  3. Consultar las rutas vinculadas a esos clientes en el padrón `erp_clientes_raw`.
  4. Por regla general de inferencia, correlacionar la ruta completa al vendedor que efectuó la visita (Ej: si los clientes de Monchi pertenecen a la ruta 456, toda la ruta 456 se le asigna a Monchi en una nueva tabla/vista relacional `matcheo_rutas_excepciones`).
- **Trigger Interceptor:** Actualizaremos `bot_worker.py` (función `registrar_exhibicion`). Al procesar ingresos de "Ivan Soto", interceptará el `id_cliente` provisto, buscará en `matcheo_rutas_excepciones` y rotulará dinámicamente la entrada para Monchi o Jorge desde su concepción, sin intervención humana. Luego de esta sincronización, el usuario raíz de IVAN SOTO quedará inactivo.

---

## 2. Auditoría de Seguridad, Limpieza y Actualización de Sistema

A fin de asegurar el ecosistema contra vulnerabilidades pasadas y presentes, aplicaremos un plan de securitización en múltiples fases.

### 2.1 Limpieza de Repositorio (Scrubbing de Datos Sensibles)
- **Barrido de Repositorio:** Escaneo de los historiales locales, carpetas raíz `/CenterMind`, `/tmp` y `bot_worker.py` (y demás código Python/JS) en busca de credenciales en duro (ej. `PG_PASS`, API Keys antiguas, o dumps SQL).
- **Hardening Local:** Eliminación de los rastros y unificación de dichos secretos bajo el manejador seguro o en sus correspondientes `.env`.

### 2.2 Auditoría Antimalware y contra Inyecciones SQL (SQLi)
- **Endpoints y Storage:** Análisis de `SupabaseUploader` (manejo correcto de Content-Types para evitar subida de exploits) y configuración segura del bucket público en Storage.
- **SQL Definer & Safe Typing:** Escaneo y resguardo en Supabase de todas las RPC (`fn_dashboard_ranking`, etc.). Deshabilitar el concatenado dinámico y forzar `SECURITY DEFINER` únicamente en los métodos comprobados. Eliminación paramétrica de posibles Path Traversals en los identificadores enviados por Telegram/Dashboard.

### 2.3 Generación y Documentación
- **HTML Interactivo de Estado (`shelfy_mapa_arquitectonico.html`):** Creación de un informe visual e interactivo. Un dashboard HTML puro (renderizado local) que representará el diagrama total en tiempo real del ciclo de vida del backend (`bot_worker.py`), la comunicación con Supabase y el renderizado Frontend.
- **Actualización Documental (`CLAUDE.md`):** Será reconstruido el manual central. Constará del marco teórico moderno sobre cómo los scripts algorítmicos reaccionan antes las excepciones orgánicas de ruteo y el mapeo de Supabase en producción.
