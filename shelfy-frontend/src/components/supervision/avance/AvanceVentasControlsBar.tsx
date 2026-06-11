"use client";

import { Layers, Package } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useVolumenModo, type VolumenModo } from "@/hooks/useVolumenModo";
import { cn } from "@/lib/utils";

interface AvanceVentasControlsBarProps {
  totalSinVenta?: number;
  soloConVenta: boolean;
  onSoloConVentaChange: (v: boolean) => void;
  className?: string;
}

const VOLUMEN_OPTIONS: Array<{ id: VolumenModo; label: string; hint: string }> = [
  { id: "bultos", label: "Bultos", hint: "Volumen neto en bultos" },
  { id: "desglose", label: "Bultos + unidades", hint: "Desglose según reglas de negocio (cig/papelillo/mix)" },
];

/**
 * Barra de controles globales del Avance (R2/R1): switch de volumen prominente
 * y filtro de catálogo. Vive fuera de la tabla para que no pase desapercibido.
 */
export function AvanceVentasControlsBar({
  totalSinVenta = 0,
  soloConVenta,
  onSoloConVentaChange,
  className,
}: AvanceVentasControlsBarProps) {
  const [volumenModo, setVolumenModo] = useVolumenModo();

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
        "rounded-xl border bg-card/80 px-3 py-2.5 sm:px-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Package size={14} className="text-emerald-500 shrink-0" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground shrink-0">
          Volumen
        </span>
        <div
          className="inline-flex rounded-lg border bg-muted/40 p-0.5"
          role="group"
          aria-label="Modo de volumen"
        >
          {VOLUMEN_OPTIONS.map((opt) => {
            const active = volumenModo === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                title={opt.hint}
                aria-pressed={active}
                onClick={() => setVolumenModo(opt.id)}
                className={cn(
                  "h-8 px-3 rounded-md text-[11px] font-semibold transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {totalSinVenta > 0 && (
        <label className="flex min-h-8 items-center gap-2 cursor-pointer select-none sm:justify-end">
          <Layers size={13} className="text-muted-foreground shrink-0" aria-hidden />
          <span className="text-[11px] font-medium text-muted-foreground">Solo con venta</span>
          <Switch
            checked={soloConVenta}
            onCheckedChange={onSoloConVentaChange}
            aria-label="Mostrar solo SKUs con venta en el período"
          />
        </label>
      )}
    </div>
  );
}
