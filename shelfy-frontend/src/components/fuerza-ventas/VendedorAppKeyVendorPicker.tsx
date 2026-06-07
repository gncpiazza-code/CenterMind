"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FuerzaVentasVendedor } from "@/lib/api";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatErpId(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export function vendorMetaLine(v: FuerzaVentasVendedor): string {
  const parts = [
    v.sucursal_nombre ? `Suc. ${v.sucursal_nombre}` : null,
    `ID ${v.id_vendedor}`,
    `ERP ${formatErpId(v.id_vendedor_erp)}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

interface Props {
  vendedores: FuerzaVentasVendedor[];
  value: string;
  onChange: (idVendedor: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function VendedorAppKeyVendorPicker({
  vendedores,
  value,
  onChange,
  disabled,
  loading,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const activeVendedores = useMemo(
    () => vendedores.filter((v) => v.activo !== false),
    [vendedores],
  );

  const selected = activeVendedores.find((v) => String(v.id_vendedor) === value);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) {
      return [...activeVendedores].sort((a, b) =>
        a.nombre_erp.localeCompare(b.nombre_erp, "es"),
      );
    }
    return activeVendedores
      .filter((v) => {
        const haystack = normalize(
          `${v.nombre_erp} ${v.sucursal_nombre ?? ""} ${v.id_vendedor} ${formatErpId(v.id_vendedor_erp)}`,
        );
        return haystack.includes(q);
      })
      .sort((a, b) => a.nombre_erp.localeCompare(b.nombre_erp, "es"));
  }, [activeVendedores, query]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal h-auto min-h-11 py-2.5"
        >
          <span className="truncate text-left">
            {loading ? (
              "Cargando vendedores..."
            ) : selected ? (
              <span className="block min-w-0">
                <span className="block truncate font-medium">{selected.nombre_erp}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {vendorMetaLine(selected)}
                </span>
              </span>
            ) : (
              "Buscar por nombre, sucursal o ID..."
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <Input
          placeholder="Nombre, sucursal, ID vendedor o ERP..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 h-9"
          autoFocus
        />
        <ScrollArea className="h-[min(320px,50vh)]">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin resultados para «{query}»
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((v) => {
                const isSelected = String(v.id_vendedor) === value;
                return (
                  <button
                    key={v.id_vendedor}
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-accent",
                      isSelected && "bg-accent/60 ring-1 ring-primary/20",
                    )}
                    onClick={() => pick(String(v.id_vendedor))}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium">{v.nombre_erp}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {vendorMetaLine(v)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function VendedorAppKeyVendorSummary({
  vendedor,
}: {
  vendedor: FuerzaVentasVendedor;
}) {
  return (
    <div className="rounded-xl border bg-muted/40 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <UserRound className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{vendedor.nombre_erp}</p>
          <p className="text-sm text-muted-foreground truncate">
            {vendedor.sucursal_nombre ?? "Sin sucursal asignada"}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border bg-background px-3 py-2">
          <dt className="text-xs text-muted-foreground">ID vendedor</dt>
          <dd className="font-mono font-medium">{vendedor.id_vendedor}</dd>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2">
          <dt className="text-xs text-muted-foreground">ID ERP</dt>
          <dd className="font-mono font-medium">{formatErpId(vendedor.id_vendedor_erp)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        La key quedará vinculada a este vendedor. Verificá nombre y sucursal antes de generar.
      </p>
    </div>
  );
}
