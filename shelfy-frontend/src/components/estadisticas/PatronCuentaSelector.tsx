"use client";

import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { fetchPatronCuentas, type PatronCuenta } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const IVAN_SOTO_DIST = 3;
const IVAN_SOTO_VENDEDOR = "30";

export const PATRON_CUENTA_EQUIPO = "equipo";

export function isPatronIvanSoto(distId: number, vendedorId: string): boolean {
  return distId === IVAN_SOTO_DIST && vendedorId === IVAN_SOTO_VENDEDOR;
}

/** Supervisión avance: filtro por nombre display ERP. */
export function isPatronIvanSotoVendor(
  distId: number,
  vendedorNombre: string | null | undefined,
): boolean {
  if (distId !== IVAN_SOTO_DIST || !vendedorNombre) return false;
  const t = vendedorNombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return t.includes("ivan") && t.includes("soto");
}

export function patronCuentaQueryParam(cuenta: string | null | undefined): string | undefined {
  if (!cuenta || cuenta === PATRON_CUENTA_EQUIPO) return undefined;
  return cuenta;
}

interface PatronCuentaSelectorProps {
  distId: number;
  vendedorId: string;
  value: string | null;
  onChange: (cuentaId: string) => void;
  /** Supervisión: agrega opción Equipo (vista consolidada). */
  includeEquipo?: boolean;
}

export function PatronCuentaSelector({
  distId,
  vendedorId,
  value,
  onChange,
  includeEquipo = false,
}: PatronCuentaSelectorProps) {
  const { data } = useQuery({
    queryKey: ["patron-cuentas", distId, vendedorId],
    queryFn: () => fetchPatronCuentas(distId, Number(vendedorId)),
    enabled: isPatronIvanSoto(distId, vendedorId),
    staleTime: 5 * 60_000,
  });

  const cuentas: PatronCuenta[] = data?.cuentas ?? [];
  const teamOnly = cuentas.filter((c) => c.id !== "ivan_soto");
  if (!data?.patron_mode || teamOnly.length < 2) return null;

  const active = value ?? data.cuenta_default ?? teamOnly[0]?.id ?? PATRON_CUENTA_EQUIPO;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-violet-200/80 bg-violet-50/60 px-3 py-2">
      <Users className="h-4 w-4 shrink-0 text-violet-600" />
      <span className="text-xs font-medium text-violet-900 hidden sm:inline">
        Vista operativa
      </span>
      <Select value={active} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[min(100%,190px)] border-violet-200 bg-white text-sm">
          <SelectValue placeholder="Elegir vista" />
        </SelectTrigger>
        <SelectContent>
          {includeEquipo && (
            <SelectItem value={PATRON_CUENTA_EQUIPO}>Equipo (consolidado)</SelectItem>
          )}
          {teamOnly.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Selector compacto para barra de filtros en Supervisión (por nombre vendedor). */
export function SupervisionPatronCuentaFilter({
  distId,
  vendedorNombre,
  value,
  onChange,
}: {
  distId: number;
  vendedorNombre: string | null;
  value: string;
  onChange: (cuentaId: string) => void;
}) {
  if (!isPatronIvanSotoVendor(distId, vendedorNombre)) return null;

  const { data } = useQuery({
    queryKey: ["patron-cuentas", distId, IVAN_SOTO_VENDEDOR],
    queryFn: () => fetchPatronCuentas(distId, Number(IVAN_SOTO_VENDEDOR)),
    enabled: isPatronIvanSotoVendor(distId, vendedorNombre),
    staleTime: 5 * 60_000,
  });

  const cuentas = (data?.cuentas ?? []).filter((c) => c.id !== "ivan_soto");
  if (!data?.patron_mode || cuentas.length < 2) return null;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pl-0.5">
        Vista operativa
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm w-52 border-violet-200 bg-violet-50/40">
          <SelectValue placeholder="Equipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PATRON_CUENTA_EQUIPO}>Equipo (consolidado)</SelectItem>
          {cuentas.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
