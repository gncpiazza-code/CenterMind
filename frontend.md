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

---

## Primitivos shadcn/ui Disponibles

Los siguientes componentes están instalados en `src/components/ui/`:

| Componente | Archivo | Uso |
|---|---|---|
| `Button` | `Button.tsx` | Acciones primarias y secundarias. `variant="default"` usa violeta. |
| `Checkbox` | `checkbox.tsx` | Toggles de permisos, listas de selección. |
| `Table` | `table.tsx` | Matrices de datos (permisos, reportes). Incluye `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`. |
| `DropdownMenu` | `dropdown-menu.tsx` | Menús contextuales. Incluye submenús, separadores, items con checkboxes y radio. |
| `Input`, `Select`, `Badge`, etc. | Varios | Ver directorio `src/components/ui/`. |

## Gráficos y Visualización
- **Recharts**: Se utilizan paletas de colores basadas en `--shelfy-primary` para consistencia.
- **MapLibre GL**: El tema del mapa puede actualizarse a un estilo claro para alinear con el nuevo light theme.
