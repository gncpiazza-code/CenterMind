import type { UltimaEvaluada, VendedorRanking } from "@/lib/api";

function normalizeLocalidad(value: string | undefined | null): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function vendorKey(name: string | undefined | null): string {
  return (name ?? "").trim().toUpperCase();
}

/**
 * Evita cruces tipo Córdoba/Resistencia: el PDV debe estar asignado al vendedor
 * (backend) y, si hay ciudad dominante en ranking, no contradecirla.
 */
export function isUltimaCoherenteConVendedor(
  item: UltimaEvaluada,
  ciudadVendedorDominante?: string | null,
): boolean {
  if (item.pdv_asignado_vendedor === false) return false;

  const pdvCity = normalizeLocalidad(item.ciudad);
  const vendCity = normalizeLocalidad(ciudadVendedorDominante);
  if (pdvCity && vendCity && pdvCity !== vendCity) return false;

  return true;
}

export function filterUltimasCoherentes(
  items: UltimaEvaluada[],
  ranking: VendedorRanking[],
): UltimaEvaluada[] {
  const ciudadByVendor = new Map<string, string>();
  for (const row of ranking) {
    const key = vendorKey(row.vendedor);
    if (!key || ciudadByVendor.has(key)) continue;
    const city = (row.ciudad_dominante ?? "").trim();
    if (city) ciudadByVendor.set(key, city);
  }

  return items.filter((item) => {
    const key = vendorKey(item.vendedor_erp || item.vendedor);
    return isUltimaCoherenteConVendedor(item, ciudadByVendor.get(key));
  });
}
