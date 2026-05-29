import type { VendorDetalleRuta } from "@/lib/api";

const DIA_ORDEN: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  domingo: 7,
  variable: 98,
};

function normalizeDia(dia: string): string {
  return dia
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function diaSortKey(dia: string): number {
  return DIA_ORDEN[normalizeDia(dia)] ?? 50;
}

export function groupRutasByDia(
  rutas: VendorDetalleRuta[],
): { dia: string; rutas: VendorDetalleRuta[]; totalPdvs: number }[] {
  const map = new Map<string, VendorDetalleRuta[]>();
  for (const r of rutas) {
    const dia = (r.dia || "Variable").trim() || "Variable";
    const list = map.get(dia) ?? [];
    list.push(r);
    map.set(dia, list);
  }

  return [...map.entries()]
    .sort(([a], [b]) => diaSortKey(a) - diaSortKey(b) || a.localeCompare(b, "es"))
    .map(([dia, rs]) => ({
      dia,
      rutas: rs,
      totalPdvs: rs.reduce((n, r) => n + (r.total_pdvs ?? r.pdvs?.length ?? 0), 0),
    }));
}

export { formatFechaPadron as formatFechaAR } from "@/lib/cuentasCorrientes";
