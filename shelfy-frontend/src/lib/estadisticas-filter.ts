import type { VendorCartaResumen } from "@/lib/api";

/** Filtra cartas de vendedor por sucursal. null → devuelve todas. */
export function filterCartasBySucursal(
  cartas: VendorCartaResumen[],
  sucursal: string | null,
): VendorCartaResumen[] {
  if (!sucursal) return cartas;
  return cartas.filter((v) => v.sucursal === sucursal);
}
