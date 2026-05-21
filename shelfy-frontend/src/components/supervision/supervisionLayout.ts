/** Contenedor de la fila CC + Altas: ocupa el viewport restante sin alargar la página. */
export const SUPERVISION_PANELS_VIEWPORT_CLASS =
  "flex flex-col flex-1 min-h-0 lg:max-h-[calc(100vh-15.5rem)]";

export const SUPERVISION_PANELS_ROW_CLASS =
  "grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch flex-1 min-h-0 h-full";

/** Columna de un panel: altura acotada en mobile, stretch en desktop. */
export const SUPERVISION_PANEL_COLUMN_CLASS =
  "flex flex-col min-h-0 h-[min(440px,52vh)] lg:h-full max-h-full overflow-hidden";

/** Cuerpo con tabla/listado — único scroll del panel. */
export const SUPERVISION_PANEL_BODY_SCROLL_CLASS =
  "flex-1 min-h-0 overflow-y-auto overscroll-contain";
