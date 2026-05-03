# Plan de Implementación: Motor de Análisis Excel Multi-Tenant

Este documento describe la arquitectura y el proceso de integración del sistema de informes dinámicos en SHELFY. El objetivo es permitir que cualquier distribuidora (tenant) suba sus reportes de ventas en Excel y obtenga un análisis profesional en PDF, adaptado a su propia estructura de datos y marca.

## Contexto y Visión

SHELFY actualmente centraliza la supervisión y objetivos. Sin embargo, los reportes de ventas suelen provenir de ERPs externos con formatos heterogéneos. Este motor permitirá:
1. **Flexibilidad Total**: No importa cómo se llamen las columnas del Excel del cliente.
2. **Autonomia del Superadmin**: El Superadmin puede configurar un nuevo tenant en minutos usando el **Motor de Inferencia**.
3. **Calidad Premium**: PDFs con la identidad visual del cliente.

## User Review Required

> [!IMPORTANT]
> **Gestión Centralizada**: Se ha decidido que la configuración crítica (mapeos, reglas de reclasificación, diccionarios de SKUs) sea responsabilidad exclusiva del **Superadmin**. Esto asegura la integridad de los datos y evita errores de configuración por parte de los usuarios finales.

> [!CAUTION]
> **Performance**: El procesamiento de archivos Excel de +100,000 filas y la generación de PDFs con ReportLab consume memoria RAM considerable. Se implementará un sistema de limpieza de memoria tras cada ejecución.

---

## 1. El Motor de Inferencia (DH-1 Discovery Mode)

Para facilitar el "onboarding" de nuevos clientes, el script `DH-1_procesar_datos.py` incluye ahora una función de inferencia.

### Flujo de Configuración para el Superadmin:
1. El Superadmin recibe un Excel de muestra del nuevo cliente.
2. Sube el archivo a la herramienta de administración de SHELFY.
3. El sistema ejecuta `inferir_configuracion()`:
   - Identifica columnas por palabras clave (ej: "PDV" -> "Cliente").
   - Extrae las TOP 20 marcas/artículos para sugerir el `sku_map`.
   - Detecta la lista de sucursales reales presentes en los datos.
4. El sistema devuelve un **JSON Borrador**.
5. El Superadmin refina este JSON (asigna colores, define subcanales reales) y lo guarda en la base de datos de SHELFY.

---

## 2. Cambios en el Backend (FastAPI)

### [Base de Datos] Esquema en Supabase
Se creará la tabla `tenant_report_configs`:
- `id_distribuidor` (int8, PK): ID del tenant en SHELFY.
- `config_json` (jsonb): Objeto completo de configuración.
- `created_at` / `updated_at` (timestamptz).

### [Servicios] ExcelReportService
Ubicado en `services/report_service.py`, este servicio será el corazón del sistema:
- **`process_files(files, config)`**: Utiliza la lógica de [DH-1_procesar_datos.py](file:///Users/ignaciopiazza/Desktop/New%20Inform/DH-1_procesar_datos.py). Realiza la unificación de múltiples archivos, filtrado de anulados, reclasificaciones y cálculo de KPIs.
- **`generate_pdf(df, config)`**: Utiliza la lógica de [DH-2_generar_pdf.py](file:///Users/ignaciopiazza/Desktop/New%20Inform/DH-2_generar_pdf.py). Construye el `story` de ReportLab dinámicamente según las sucursales y canales definidos.

### [Routers] informes_excel.py
Nuevo archivo `routers/informes_excel.py`:
- `POST /api/admin/infer-config`: (Superadmin) Genera el JSON borrador.
- `POST /api/reports/generate/{dist_id}`: (Admin/User) Sube Excels y recibe el PDF final.

---

## 3. Cambios en el Frontend (React)

### Módulo de Administración (Superadmin)
- **Editor de Configuración**: Un editor de JSON con validación de esquemas o formularios dinámicos para gestionar la tabla `tenant_report_configs`.
- **Previsualizador de Muestras**: Botón para "Testear Configuración" con un Excel de prueba antes de guardarla.

### Módulo de Reportes (Distribuidora)
- **Upload Dropzone**: Área para soltar archivos `.xlsx`.
- **Centro de Descargas**: Lista de reportes generados recientemente.

---

## 4. Referencia Técnica de Archivos DH

Para el equipo de desarrollo que realice la integración:

- **[DH-1_procesar_datos.py](file:///Users/ignaciopiazza/Desktop/New%20Inform/DH-1_procesar_datos.py)**: Contiene la lógica de `pandas` para transformación. Es vital mantener la función `aplicar_reclasificacion` ya que maneja la lógica de negocio compleja de traspaso de bultos entre canales.
- **[DH-2_generar_pdf.py](file:///Users/ignaciopiazza/Desktop/New%20Inform/DH-2_generar_pdf.py)**: Define los `TableStyles` y la estructura de páginas (Portada, KPIs, Tablas de Vendedor, Análisis de SKU).
- **[config_ejemplo.json](file:///Users/ignaciopiazza/Desktop/New%20Inform/config_ejemplo.json)**: Es la "Biblia" del formato. Cualquier cambio en la lógica debe reflejarse en este esquema.

## Verification Plan

### Manual Verification
1. Ejecutar `python DH-1_procesar_datos.py input/reporte_ejemplo.xlsx`.
2. Verificar que el JSON generado contenga las columnas detectadas correctamente.
3. Generar el PDF final y validar que los cálculos de "% Participación" coincidan con el Excel original.
