"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { BindingGroupCandidate, FuerzaVentasVendedor } from "@/lib/api";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

interface Props {
  vendedores: FuerzaVentasVendedor[];
  value: string;
  onChange: (idVendedor: string) => void;
  disabled?: boolean;
  loading?: boolean;
  candidates?: BindingGroupCandidate[];
}

export function VendedorSearchCombobox({
  vendedores,
  value,
  onChange,
  disabled,
  loading,
  candidates = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const scoreById = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of candidates) {
      map.set(c.id_vendedor, c.score);
    }
    return map;
  }, [candidates]);

  const selected = vendedores.find((v) => String(v.id_vendedor) === value);

  const filtered = useMemo(() => {
    const q = normalize(query);
    let list = vendedores;
    if (q) {
      list = vendedores.filter((v) => {
        const haystack = normalize(
          `${v.nombre_erp} ${v.sucursal_nombre ?? ""}`,
        );
        return haystack.includes(q);
      });
    }
    return [...list].sort((a, b) => {
      const sa = scoreById.get(a.id_vendedor) ?? 0;
      const sb = scoreById.get(b.id_vendedor) ?? 0;
      if (sb !== sa) return sb - sa;
      return a.nombre_erp.localeCompare(b.nombre_erp, "es");
    });
  }, [vendedores, query, scoreById]);

  const recommended = useMemo(
    () => filtered.filter((v) => (scoreById.get(v.id_vendedor) ?? 0) >= 0.45).slice(0, 5),
    [filtered, scoreById],
  );

  const rest = useMemo(
    () => filtered.filter((v) => !recommended.some((r) => r.id_vendedor === v.id_vendedor)),
    [filtered, recommended],
  );

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function renderItem(v: FuerzaVentasVendedor) {
    const score = scoreById.get(v.id_vendedor);
    const isSelected = String(v.id_vendedor) === value;
    return (
      <button
        key={v.id_vendedor}
        type="button"
        className={cn(
          "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent",
          isSelected && "bg-accent/60",
        )}
        onClick={() => pick(String(v.id_vendedor))}
      >
        <Check className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
        <span className="flex-1 min-w-0">
          <span className="block truncate">{v.nombre_erp}</span>
          {v.sucursal_nombre ? (
            <span className="block truncate text-xs text-muted-foreground">
              {v.sucursal_nombre}
            </span>
          ) : null}
        </span>
        {score != null && score > 0 ? (
          <Badge variant={score >= 0.75 ? "default" : "secondary"} className="shrink-0 text-[10px]">
            {Math.round(score * 100)}%
          </Badge>
        ) : null}
      </button>
    );
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
          className="w-full justify-between font-normal h-auto min-h-10 py-2"
        >
          <span className="truncate text-left">
            {loading
              ? "Cargando vendedores..."
              : selected
                ? `${selected.nombre_erp}${selected.sucursal_nombre ? ` · ${selected.sucursal_nombre}` : ""}`
                : "Buscar vendedor por nombre..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <Input
          placeholder="Escribí nombre o sucursal..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 h-9"
          autoFocus
        />
        <ScrollArea className="h-[min(280px,50vh)]">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin resultados para «{query}»
            </p>
          ) : (
            <div className="space-y-1">
              {recommended.length > 0 && !query ? (
                <>
                  <p className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    Recomendados para este grupo
                  </p>
                  {recommended.map(renderItem)}
                  {rest.length > 0 ? (
                    <p className="px-2 pt-2 text-xs font-medium text-muted-foreground">
                      Todos los vendedores
                    </p>
                  ) : null}
                </>
              ) : null}
              {(query ? filtered : rest).map(renderItem)}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
