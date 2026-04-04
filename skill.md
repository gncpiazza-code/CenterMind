# AI Skill: Auto-Documentation Sync

Este archivo define el protocolo que los agentes de IA (como Antigravity/Claude Code) deben seguir para mantener la documentación del proyecto Shelfy actualizada.

## Protocolo de Actualización Técnica

Al finalizar cada sesión o cuando el usuario lo solicite, el agente debe realizar las siguientes tareas de mantenimiento:

### 1. Sincronizar `progress.md`
- **Resumen de la Sesión**: Añadir un ítem en "Historial Reciente" con la fecha de hoy y los cambios realizados.
- **Estado de Funcionalidades**: Si se añadió una funcionalidad nueva, pasarla de "En Desarrollo" a "🟢 Funcionalidades Operativas".
- **Roadmap**: Actualizar la sección de "Pendientes" si se resolvieron deudas técnicas o se identificaron nuevas.
- **Fecha**: Actualizar "Última actualización" al inicio del archivo.

### 2. Sincronizar `arquitectura.md`
- **Nuevas Dependencias**: Si se instalaron nuevas librerías en `package.json` o `requirements.txt`, reflejar el cambio en la sección "Stack Tecnológico".
- **Cambios Estructurales**: Si se crearon nuevos directorios importantes o se cambió la relación front-back, actualizar los diagramas de carpetas y flujos de datos.

### 3. Sincronizar `frontend.md`
- **Diseño**: Si se modificaron variables en `globals.css` (colores, sombras, border-radius), actualizar la tabla de la paleta de colores.
- **Nuevos Componentes**: Documentar cualquier widget o componente complejo (ej. nuevos tipos de mapa o indicadores visuales).

### 4. Sincronizar `CLAUDE.md`
- **Convenciones**: Si se adoptó un nuevo patrón de código (ej. un nuevo provider en React o un nuevo service en Python), añadirlo a "Desarrollo y Convenciones".
- **Checklist**: Asegurarse de que no haya información de "progreso temporal" en este archivo; debe mantenerse puramente arquitectónico y normativo.

---

## Protocolo de Coordinación del Agente

Para garantizar la coherencia y la calidad en el desarrollo de Shelfy, todos los agentes (como Antigravity o Claude Code) deben seguir estrictamente este flujo de trabajo:

### Fase 0: Carga de Contexto (Obligatorio)
Antes de realizar cualquier análisis o cambio, el agente **DEBE** leer los archivos principales de documentación para entender el estado actual:
- `CLAUDE.md` (Arquitectura y guía de estilo)
- `progress.md` (Estado del roadmap e historial)
- `arquitectura.md` (Flujos de datos y servicios)
- `frontend.md` (Diseño y componentes UI)

### Fase 1: Análisis del Plan de Acción
El agente debe leer en detalle el requerimiento del usuario o el `implementation_plan.md` aprobado. Debe analizar las implicaciones técnicas antes de proceder a la ejecución.

### Fase 2: Ejecución y Delegación Especializada
- Si la tarea requiere **cualquier modificación en el frontend o la interfaz de usuario**, el agente principal **DEBE desplegar al subagente `shelfy_frontend_expert`** para asegurar una implementación de alta fidelidad.
- El agente principal supervisa la integración entre el frontend y el backend.

### Fase 3: Sincronización de Documentación
Al finalizar la tarea, el agente debe actualizar automáticamente los archivos de contexto mencionados en la Fase 0 para reflejar los nuevos cambios realizados.

> [!TIP]
> **Antes de cerrar la sesión:**
> 1. Asegúrate de haber seguido las 4 fases anteriores.
> 2. Informa al usuario: "Protocolo de coordinación de Shelfy completado con éxito".
