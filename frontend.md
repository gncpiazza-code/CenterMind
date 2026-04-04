# Frontend Design System — Shelfy

Este documento especifica los colores, estilos y componentes visuales utilizados en la plataforma Shelfy.

## Paleta de Colores (Shelfy Dark Theme)

La interfaz se basa en un tema oscuro con acentos vibrantes y efectos de cristalería (glassmorphism).

| Variable CSS | Valor Hex/RGBA | Uso |
|---|---|---|
| `--shelfy-bg` | `#0F172A` | Color de fondo principal (con gradiente en body). |
| `--shelfy-panel` | `rgba(15, 23, 42, 0.65)` | Paneles y tarjetas con fondo translúcido (Glassmorphism). |
| `--shelfy-primary` | `#a855f7` (Violet) | Botones primarios, estados destacados. |
| `--shelfy-primary-2`| `#8b5cf6` | Gradientes y acentos secundarios. |
| `--shelfy-accent` | `#7C3AED` | Hover states y bordes destacados (Deep Violet). |
| `--shelfy-border` | `rgba(255, 255, 255, 0.1)`| Bordes sutiles en paneles. |
| `--shelfy-text` | `#FFFFFF` | Texto principal. |
| `--shelfy-text-soft` | `#CBD5E1` | Texto secundario y etiquetas. |
| `--shelfy-muted` | `#94A3B8` | Texto deshabilitado o de menor importancia. |
| `--shelfy-success` | `#10B981` (Emerald) | Compra reciente, activo, objetivo cumplido. |
| `--shelfy-error` | `#EF4444` (Rose) | Inactivo, moroso, error en carga. |
| `--shelfy-warning` | `#F59E0B` (Amber) | Alertas, preventivos, objetivos próximos a vencer. |

---

## Visual Aesthetics

### Glassmorphism
Los paneles utilizan el estilo "Glass-Card" para dar profundidad:
- **Background**: `rgba(15, 23, 42, 0.65)`
- **Backdrop-filter**: `blur(12px)`
- **Borde**: `1px solid rgba(255, 255, 255, 0.1)`

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

### 4. Matriz de Permisos (RBAC)
- **UI**: Tabla de doble entrada (Rol vs Permiso) ubicada en `/admin/permissions`.
- **Componentes**: `shadcn/ui` `Table` y `Checkbox`.
- **Seguridad**: Los elementos del menú en el `Sidebar` se ocultan automáticamente si el usuario no tiene la `permisoKey` correspondiente.

---

## Gráficos y Visualización
- **Recharts**: Se utilizan paletas de colores basadas en `--shelfy-primary` para consistencia.
- **MapLibre GL**: Estilo de mapa oscuro (`dark-v10` o similar) para que resalten los pins de colores.
