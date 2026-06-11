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

export function isPatronIvanSoto(distId: number, vendedorId: string): boolean {
  return distId === IVAN_SOTO_DIST && vendedorId === IVAN_SOTO_VENDEDOR;
}

interface PatronCuentaSelectorProps {
  distId: number;
  vendedorId: string;
  value: string | null;
  onChange: (cuentaId: string) => void;
}

export function PatronCuentaSelector({
  distId,
  vendedorId,
  value,
  onChange,
}: PatronCuentaSelectorProps) {
  const { data } = useQuery({
    queryKey: ["patron-cuentas", distId, vendedorId],
    queryFn: () => fetchPatronCuentas(distId, Number(vendedorId)),
    enabled: isPatronIvanSoto(distId, vendedorId),
    staleTime: 5 * 60_000,
  });

  const cuentas: PatronCuenta[] = data?.cuentas ?? [];
  if (!data?.patron_mode || cuentas.length < 2) return null;

  const active = value ?? data.cuenta_default ?? cuentas[0]?.id;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-violet-200/80 bg-violet-50/60 px-3 py-2">
      <Users className="h-4 w-4 shrink-0 text-violet-600" />
      <span className="text-xs font-medium text-violet-900 hidden sm:inline">
        Cuenta activa
      </span>
      <Select value={active} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[min(100%,180px)] border-violet-200 bg-white text-sm">
          <SelectValue placeholder="Elegir cuenta" />
        </SelectTrigger>
        <SelectContent>
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
