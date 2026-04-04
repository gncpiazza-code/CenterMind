# Frontend Design System — Shelfy

Este documento especifica los colores, estilos y componentes visuales utilizados en la plataforma Shelfy.

## Paleta de Colores (Shelfy Light-Violet Theme)

La interfaz se basa en un **tema claro** con fondos off-white y violeta como color de marca. El modo oscuro (`.dark`) existe como fallback pero no es el tema por defecto.

| Variable CSS | Valor Hex/RGBA | Uso |
|---|---|---|
| `--shelfy-bg` | `#F8FAFC` | Color de fondo principal (off-white). |
| `--shelfy-panel` | `rgba(255, 255, 255, 0.85)` | Paneles y tarjetas con fondo translúcido. |
| `--shelfy-primary` | `#a855f7` (Violet 500) | Botones primarios, estados activos, acento de marca. |
| `--shelfy-primary-2`| `#8b5cf6` (Violet 500 oscuro) | Gradientes y acentos secundarios (switcher de distribuidora). |
| `--shelfy-accent` | `#7C3AED` | Hover states y bordes destacados (Deep Violet). |
| `--shelfy-border` | `rgba(0, 0, 0, 0.08)` | Bordes sutiles en paneles. |
| `--shelfy-text` | `#0F172A` | Texto principal (casi negro). |
| `--shelfy-text-soft` | `#475569` | Texto secundario y etiquetas. |
| `--shelfy-muted` | `#64748B` | Texto deshabilitado o de menor importancia. |
| `--shelfy-success` | `#10B981` (Emerald) | Compra reciente, activo, objetivo cumplido. |
| `--shelfy-error` | `#EF4444` (Rose) | Inactivo, moroso, error en carga. |
| `--shelfy-warning` | `#F59E0B` (Amber) | Alertas, preventivos, objetivos próximos a vencer. |

### Tokens shadcn/ui (primitivos)
Los primitivos de shadcn (`Button`, `Checkbox`, `Table`, `DropdownMenu`) usan los tokens `--primary` / `--ring` que resuelven a `oklch(0.627 0.265 303.9)` (violeta), asegurando coherencia visual sin sobreescribir los componentes.

---

## Visual Aesthetics

### Glassmorphism (Light)
Los paneles utilizan el estilo "Glass-Card" adaptado al tema claro:
- **Background**: `rgba(255, 255, 255, 0.6)`
- **Backdrop-filter**: `blur(12px)`
- **Borde**: `1px solid rgba(0, 0, 0, 0.06)`
- **Sombra**: `0 4px 24px 0 rgba(0, 0, 0, 0.06)`

### Tipografía
- **Fuente Principal**: `'Inter', ui-sans-serif, system-ui`.
- **Peso**: `400` (Regular), `500` (Medium), `600` (Semibold).

---

## Componentes UI Clave

### 1. Marcadores de Mapa (Pins)
- **Animación Aura**: Se utiliza `box-shadow` en lugar de `transform` para evitar conflictos con WebGL/GPU:
  ```css
  @keyframes shelfy-aura {
    0%   { box-shadow: 0 0 0 1px var(--ac); }
    70%  { box-shadow: 0 0 0 9px transparent; }
    100% { box-shadow: 0 0 0 9px transparent; }
  }
  ```
- **Popups**: Estilo minimalista sin bordes/sombras nativas de MapLibre, integrados con el `glass-card`.

### 2. TabSupervision
- **Layout**: Sidebar de selección de distribuidor/sucursal + Tabs centrales (Mapa, Ventas, Cuentas).
- **Sticky Headers**: Los selectores se mantienen visibles durante el scroll en móviles.

### 3. Floating Objetivos ("Carrito")
- **UI**: Panel flotante en la esquina inferior derecha del mapa.
- **Interacción**: Permite "añadir" PDVs al tocar el icono de objetivo en el pin.
- **Tipos de objetivo** (labels en UI):
  - `conversion_estado` → "Activación"
  - `cobranza` → "Cobranza"
  - `ruteo_alteo` → **"Alteo"** (nunca "Visita" — tipo inexistente en el negocio)
  - `exhibicion` → "Exhibición"
  - `general` → "General"
- **Alteo flow**: Al seleccionar tipo Alteo, carga rutas del vendedor. Al elegir ruta, aparece campo numérico de cantidad (con máximo = `total_pdv` de la ruta). Frase generada: `[vendedor] debe Altear [N] PDVs en [ruta] de los días [dia]. Tenés [N] días.`
- **Cobranza flow**: Carga lista de deudores del vendedor (seleccionable). Toggle Total/Parcial: "Total" usa toda la deuda; "Parcial" muestra input de monto. Persiste `valor_objetivo` en Supabase. Frase: `[vendedor] deberá cobrarle $[monto] a [cliente] para la fecha [fecha].`

### 4. Matriz de Permisos (RBAC)
- **UI**: Tabla de doble entrada (Rol vs Permiso) ubicada en `/admin/permissions`.
- **Componentes**: `shadcn/ui` `Table`, `Checkbox` y `Button`.
- **Rendimiento**: `PERMISSION_GROUPS` y `PERMISSIONS_BY_GROUP` son constantes de módulo (no se recomputan en render). Los grupos de permisos se renderizan con `<Fragment key={group}>`.
- **Seguridad**: Los elementos del menú en el `Sidebar` se ocultan automáticamente si el usuario no tiene la `permisoKey` correspondiente.

### 5. Sidebar — Switcher de Distribuidora
- **Componente**: `shadcn/ui` `DropdownMenu` (reemplaza el dropdown custom anterior).
- **Visibilidad**: Disponible para Superadmin y usuarios con el permiso `action_switch_tenant`.
- **Posición**: `side="top"`, aparece sobre el trigger, alineado al ancho del botón trigger.
- **Optimización**: `navItems` se memoiza con `useMemo([rol, hasPermiso])` para evitar re-cómputos.

## State Management & Ingesta

Para garantizar el rendimiento y la mantenibilidad de Shelfy, se siguen estos patrones:

1. **Zustand**: Estándar para el **estado global del cliente** (UI sync, filtros entre componentes, estado del mapa, carrito de objetivos). 
   - *Ejemplo*: `useObjetivosStore` para coordinar el panel flotante y los pines del mapa.
2. **TanStack Query v5**: Única herramienta para el **estado del servidor** (fetching de API, caching, mutaciones).
   - *Regla*: Todas las funciones fetch deben estar en `src/lib/api.ts` y usarse únicamente vía Query/Mutation hooks.
3. **Animations (Framer Motion)**: Se utilizan para mejorar la percepción de fluidez sin sacrificar la densidad.
   - *Performance*: Máximo `0.4s` de duración. Se evitan animaciones de entrada pesadas en tablas con gran volumen de datos para priorizar la productividad.

## Primitivos shadcn/ui Disponibles

Los siguientes componentes están instalados en `src/components/ui/` (completo desde 2026-04-04):

| Componente | Archivo | Uso |
|---|---|---|
| `Button` | `button.tsx` + `Button.tsx` | Acciones primarias y secundarias. `variant="default"` usa violeta. |
| `Card` | `card.tsx` | KPI cards, paneles. Usar `CardHeader`/`CardContent`/`CardFooter`. |
| `Input` | `input.tsx` | Campos de texto (login, filtros, búsqueda). |
| `Label` | `label.tsx` | Etiquetas de formulario. |
| `Avatar` | `avatar.tsx` | Avatares de usuario con `AvatarFallback`. |
| `Badge` | `badge.tsx` | Chips de estado (roles, PDV activo/inactivo). |
| `Skeleton` | `skeleton.tsx` | Placeholders de carga (reemplaza `animate-pulse`). |
| `Select` | `select.tsx` | Dropdowns de filtro. |
| `Alert` | `alert.tsx` | Banners de error/advertencia (`variant="destructive"`). |
| `Sonner` | `sonner.tsx` | Toasts via `toast()` de `sonner`. `<Toaster>` en `layout.tsx`. |
| `Dialog` | `dialog.tsx` | Modales con `DialogTitle` obligatorio. |
| `Sheet` | `sheet.tsx` | Paneles laterales/drawers con `SheetTitle`. |
| `Tabs` | `tabs.tsx` | Navegación multi-sección (admin, reportes). |
| `Progress` | `progress.tsx` | Barras de progreso. |
| `Tooltip` | `tooltip.tsx` | Accesibilidad en botones solo-icono. |
| `Separator` | `separator.tsx` | Divisores visuales (reemplaza `border-t` divs). |
| `ScrollArea` | `scroll-area.tsx` | Contenedores scrolleables con scrollbar custom. |
| `Form` | `form.tsx` | Formularios validados con `react-hook-form`. |
| `Popover` | `popover.tsx` | Selectores de fecha, filtros flotantes. |
| `Checkbox` | `checkbox.tsx` | Toggles de permisos, listas de selección. |
| `Table` | `table.tsx` | Matrices de datos (permisos, reportes). |
| `DropdownMenu` | `dropdown-menu.tsx` | Menús contextuales. Sidebar tenant switcher. |

## Gráficos y Visualización
- **Recharts**: Se utilizan paletas de colores basadas en `--shelfy-primary` para consistencia.
- **MapLibre GL**: El tema del mapa puede actualizarse a un estilo claro para alinear con el nuevo light theme.
