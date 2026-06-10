/** Orden calendario lun–dom para agrupar rutas/capas en el mapa. */
export const SUPERVISION_DIA_ORDER: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
  domingo: 7,
};

export function normDiaSupervision(dia?: string | null): string {
  return (dia ?? "sin día").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function sortDiasSupervision(a: string, b: string): number {
  return (SUPERVISION_DIA_ORDER[normDiaSupervision(a)] ?? 99) -
    (SUPERVISION_DIA_ORDER[normDiaSupervision(b)] ?? 99);
}
