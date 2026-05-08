# Progress — Shelfy CenterMind (Lean)

**Ultima actualizacion:** 8 de Mayo, 2026  
**Objetivo:** estado operativo actual, riesgos y prioridades.  
**Historial largo:** `docs/changelog/archive/2026-05.md`.

## Estado General

- Plataforma estable en produccion (Railway + Vercel + Supabase).
- Alcance principal: supervision, objetivos, difusion, reporteria, ingesta RPA.
- Riesgo tecnico dominante: volumen de datos y paginacion obligatoria.

## Estado por Modulo

- 🟢 Supervision: mapa, ventas, cuentas, filtros por sucursal/vendedor.
- 🟢 Objetivos v9: kanban/timeline/stats/print, multi-PDV, watcher y Telegram.
- 🟢 Difusion: CC por Telegram con preview y validaciones.
- 🟢 Reporteria v2: tabs por fuente + detalle por vendedor.
- 🟢 Bot Telegram: carga exhibiciones, comando `/objetivos`, reglas QA.
- 🟢 RPA: padron y cuentas corrientes en scheduler operativo.
- 🟡 Pendiente: tenant `extra`, clusters en mapa para zoom out masivo.

## Cambios Recientes (resumen ejecutivo)

1. Objetivos: fecha limite obligatoria (UI + validacion backend) y tasa de pendientes reubicada antes del bloque de fecha.
2. Objetivos compania (exhibicion): retroactividad mensual activa desde `mes_referencia` para calcular avance inicial.
3. Objetivos alteo: cumplimiento por `fecha_alta` de padrón (no por cambio de ruta), con corte temporal por timestamp del objetivo.
4. Objetivos activacion: corte temporal por timestamp completo para evitar avances previos del mismo dia.
5. Tickets portal (Topbar): fix de envío (adjuntos por `/attachments` + mensaje JSON) para eliminar `Failed to fetch`.
6. Bot Telegram: recordatorio diario 08:00 AR para vendedores con objetivos activos + mensaje de alta mas accionable.
7. Objetivos: prorrateo compania semanal/diario visible en card (semanas y dias del mes).
8. Objetivos: identificacion PDV estandar (`#id_cliente_erp + nombre`).
9. Padron: soporte anulados (`padron_anulado`) y ocultamiento en supervision.
10. Difusion CC: preview de envios + guardrails de conflicto.
11. Objetivos exhibicion compañía: watcher robusto para retroactividad mensual (normaliza origen y aplica fallback de mes cuando falta `mes_referencia`).
12. Objetivos: anti-spam Telegram en progreso (se mantienen altas/cierres y eventos de exhibición; se silencian mensajes "en marcha" del resto).
13. Tickets portal superadmin: filtros server-side (estado/categoría/dist/texto), export JSON enriquecido y endpoint de pre-resolución IA (Gemini opcional + fallback por reglas).

## Riesgos y Guardrails Activos

- Tablas grandes: usar paginacion `.range()` en loops.
- Multi-tenant: no omitir `id_distribuidor`.
- QA Tabaco: cuentas de prueba fuera de ranking/visor para no-superadmin.
- CC: validaciones previas al reemplazo de snapshot.

## Proximos Pasos Prioritarios

1. Activar tenant `extra` (credenciales + validacion E2E).
2. Clusterizar pines de mapa para alto volumen.
3. Completar migracion de endpoints admin legacy a `_v2`.
4. Mantener archivo corto: maximo 20 cambios recientes.

## Regla de Mantenimiento de este Archivo

Al finalizar una implementacion:

- Actualizar fecha.
- Agregar solo cambios de alto impacto (1-3 bullets).
- Archivar detalle tecnico extenso en changelog mensual.
