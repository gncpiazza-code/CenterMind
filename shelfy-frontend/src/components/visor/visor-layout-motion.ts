/** Spring compartido: meta + remito se redimensionan y desplazan a la vez */
export const VISOR_LAYOUT_SPRING = {
  type: "spring" as const,
  stiffness: 380,
  damping: 36,
  mass: 0.9,
};

export const VISOR_LAYOUT_TRANSITION = {
  layout: VISOR_LAYOUT_SPRING,
};
