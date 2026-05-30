import type { GrupoPendiente } from "@/lib/api";

export const VISOR_PDV_STALE_MS = 5 * 60_000;
export const VISOR_PDV_GC_MS = 30 * 60_000;
export const VISOR_ERP_STALE_MS = 60_000;

export function visorErpFromGrupo(grupo: GrupoPendiente | null | undefined): string {
  return grupo?.nro_cliente ? String(grupo.nro_cliente).trim() : "";
}

export function visorErpSkip(nro: string): boolean {
  return !nro || nro === "S/C" || nro === "0" || nro === "—";
}

export function visorCacheKey(distId: number, erp: string): string {
  return `${distId}:${erp}`;
}

export const visorQueryKeys = {
  pdv: (distId: number, erp: string, vendedor: string) =>
    ["visor", "pdv-contacto", distId, erp, vendedor] as const,
  erp: (distId: number, erp: string) => ["visor", "erp-contexto", distId, erp] as const,
};
