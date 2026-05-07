# SPEC — QA integral: Smoke + Playwright E2E (epic Supervisión/Mapa/Objetivos/Galería/Difusión)

**Fecha:** 2026-05-06  
**Maestro:** `SPEC-MAESTRO-modulos-2026-05-06.md`  
**Objetivo:** validar que todo lo nuevo implementado funciona end-to-end, sin regresiones críticas, en roles y tenants relevantes.

---

## 1) Alcance de testing

Este spec cubre:

- validaciones de **backend** (contratos, permisos, reglas de negocio),
- **smoke UI** manual/guiado para release rápida,
- **Playwright E2E** automatizado para flujos críticos cross-módulo.

Incluye específicamente:

1. Supervisión (CC + panel Altas/Activaciones + selectores)
2. Mapa (sin deudores, clic/doble clic, impresión viewport, leyenda)
3. Objetivos (Compañía vs Distribuidora, tasa pendientes, Telegram)
4. Galería (layout y prohibición de ID interno)
5. Difusión (SIGO solo superadmin, pin CC, plantillas por usuario)
6. Ticket flotante (apertura global, adjuntos y log contexto)

---

## 2) Entornos y datos de prueba

### 2.1 Tenants mínimos

- **Tabaco (dist alto volumen)**: valida performance/paginación y casos reales de volumen.
- **Un tenant chico** (ej. Aloma o Liver): valida comportamiento sin supuestos de escala.

### 2.2 Roles de prueba

- `superadmin`
- `directorio`
- `admin`
- `supervisor`

### 2.3 Datos necesarios previos

- al menos 1 vendedor con rutas activas
- PDVs que representen:
  - alta reciente
  - activación reciente
  - sin exhibición en mes
  - con exhibición en mes
- chat Telegram de prueba con permisos de pin (y uno sin permisos para degradación)

---

## 3) Smoke manual (release gate rápido)

### 3.1 Supervisión

- Abrir `supervision` con `admin`:
  - se ve panel CC + panel Altas/Activaciones
  - selector mes impacta solo panel derecho
  - no hay selector “decorativo” sin efecto
- Cambiar sucursal/vendedor:
  - ambos paneles responden al contexto correcto
  - definición de alta/activación coherente

### 3.2 Mapa

- No existe modo deudores en UI ni en estado persistido.
- Clic simple en PDV abre info, no selecciona objetivo.
- Doble clic (desktop) o botón explícito (mobile) sí selecciona para objetivo.
- Impresión: lo impreso coincide con viewport visible.

### 3.3 Objetivos

- `superadmin/directorio` pueden crear objetivo compañía; `admin/supervisor` no.
- Unicidad por vendedor/tipo/mes en compañía.
- Activación con tasa `P` configurable:
  - barra puede completar por margen,
  - ítems pendientes siguen visibles hasta cierre.

### 3.4 Galería

- Topbar/layout consistente con resto del portal.
- nunca aparece `id_cliente` interno en cards/dialogs/tooltips.

### 3.5 Difusión + Ticket

- SIGO visible solo para superadmin.
- CC enviado pinnea mensaje en Telegram (con degradación sin romper si falta permiso).
- Plantillas personalizadas persisten por usuario.
- Ticket flotante abre desde topbar, envía mensaje y muestra respuesta.

---

## 4) Playwright E2E — suite automatizada

## 4.1 Ubicación sugerida

- `shelfy-frontend/tests/e2e/epic-modulos/`

Archivos sugeridos:

- `supervision-altas-activaciones.spec.ts`
- `mapa-interacciones-impresion.spec.ts`
- `objetivos-compania-pendientes.spec.ts`
- `galeria-ids-layout.spec.ts`
- `difusion-sigo-plantillas-pin.spec.ts`
- `ticket-flotante-feedback.spec.ts`
- `roles-guardrails.spec.ts`

### 4.2 Dataset/fixtures

- fixtures por rol (`auth-superadmin.json`, etc.)
- factories para vendedor/PDV de prueba cuando el entorno lo permita
- utilidades timezone AR para asserts de fechas

---

## 5) Casos E2E críticos (must-pass)

### E2E-01 Supervisión — mes afecta solo Altas/Activaciones

**Given:** usuario `admin` en supervisión  
**When:** cambia `mes=YYYY-MM` en panel derecho  
**Then:** cambia listado de altas/activaciones  
**And:** CC permanece intacto para mismo vendedor/sucursal.

### E2E-02 Mapa — clic simple vs doble clic

**Given:** mapa cargado  
**When:** clic simple en marker  
**Then:** abre popup y no cambia selección objetivo  
**When:** doble clic  
**Then:** alterna selección para objetivo.

### E2E-03 Objetivos compañía — rol y unicidad

**Given:** `superadmin` crea objetivo compañía activación mes actual  
**When:** intenta crear duplicado mismo vendedor/tipo/mes  
**Then:** backend/UI bloquean duplicado y redirigen al existente.

### E2E-04 Activación con tasa pendientes

**Given:** objetivo activación con `M` y `P`  
**When:** se alcanza umbral de cumplimiento por margen  
**Then:** progreso marca cumplimiento  
**And:** pendientes continúan visibles hasta vencimiento/cierre.

### E2E-05 Galería — no ID interno

**Given:** navegación vendedor→cliente→timeline  
**Then:** no se renderiza identificador interno de PDV en ningún bloque visible.

### E2E-06 Difusión — SIGO restringido por rol

**Given:** `admin` entra a difusión  
**Then:** no ve tab/ruta SIGO  
**Given:** `superadmin` entra  
**Then:** sí ve SIGO.

### E2E-07 Difusión CC — pin Telegram

**Given:** envío CC exitoso  
**Then:** backend confirma envío  
**And:** mensaje queda fijado en chat objetivo (si permiso disponible).

### E2E-08 Ticket flotante — flujo básico

**Given:** usuario abre ícono sobre  
**When:** envía ticket con contexto  
**Then:** recibe confirmación y puede ver hilo de respuestas.

---

## 6) Pruebas API/backend complementarias

Casos mínimos:

- `GET .../pdvs-movimiento`:
  - contrato, filtros por mes/categoría, paginación
  - aislamiento por `id_distribuidor`
- `POST crear_objetivo`:
  - validación rol compañía
  - validación `mes_referencia`
  - validación `tasa_pendientes`
- endpoints difusión SIGO:
  - 403/oculto para roles no superadmin
- pin CC:
  - error de pin no rompe envío principal

---

## 7) No funcionales (calidad)

- Respuesta en supervisión (panel derecho) aceptable en tenant alto volumen.
- Sin errores JS críticos en consola en flujos E2E.
- Sin regresiones de accesibilidad básicas:
  - foco visible en acciones principales
  - labels en controles críticos

---

## 8) Reporte y criterio de salida

### 8.1 Criterio de aprobación de release

- 100% casos **must-pass** en smoke
- 100% casos **must-pass** E2E automatizados en rama release
- sin blockers P0/P1 abiertos

### 8.2 Evidencia obligatoria

- reporte Playwright (HTML + artifacts de fallas)
- checklist smoke firmado (fecha/rol/tenant)
- resumen de riesgos residuales (si existe)

---

## 9) Integración CI recomendada

- Job `e2e-epic-modulos`:
  - corre en PR para paths del epic
  - corre nightly sobre entorno staging
- Reintento controlado para flaky tests (máx 1 retry)
- Falla dura si hay regresión en roles/permisos o ID interno en galería

---

## 10) Fuera de alcance de este spec de QA

- performance profiling profundo de mapas en todas las resoluciones
- testing de motores RPA en sí mismos (se valida consumo del resultado, no extracción)

