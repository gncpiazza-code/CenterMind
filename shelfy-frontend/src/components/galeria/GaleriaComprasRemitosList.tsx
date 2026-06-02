"use client";

import { useState } from "react";
import { ChevronDown, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { BultosCantidadText } from "@/components/shared/BultosCantidadText";
import type { CompraRemitoMes } from "@/lib/galeria-pdv-insights";

function fmtFecha(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

interface GaleriaComprasRemitosListProps {
  remitos: CompraRemitoMes[];
  className?: string;
}

export function GaleriaComprasRemitosList({ remitos, className }: GaleriaComprasRemitosListProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className={cn("rounded-lg border border-white/10 overflow-hidden divide-y divide-white/10", className)}>
      {remitos.map((rem) => {
        const key = `${rem.numero}-${rem.fecha}`;
        const isOpen = !collapsed[key];
        return (
          <div key={key}>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
              onClick={() => toggle(key)}
              aria-expanded={isOpen}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Package size={12} className="text-emerald-300/80 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white truncate">
                    {rem.label}
                    {rem.esAdeudo && (
                      <span className="ml-1 text-[9px] font-semibold text-rose-300/90">
                        · adeudado
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-white/50">{fmtFecha(rem.fecha)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <p className="text-[11px] font-bold text-white tabular-nums">{formatMoney(rem.importe)}</p>
                  <BultosCantidadText
                    bultos={rem.bultos}
                    className="text-[10px] text-emerald-200/90 font-semibold"
                    secondaryClassName="text-white/45"
                  />
                </div>
                <ChevronDown
                  size={14}
                  className={cn(
                    "text-white/40 transition-transform duration-200",
                    isOpen && "rotate-180",
                  )}
                />
              </div>
            </button>
            {isOpen && rem.articulos.length > 0 && (
              <ul className="bg-black/25 px-3 pb-2.5 pt-0.5 space-y-1.5 border-t border-white/5">
                {rem.articulos.map((art, i) => (
                  <li
                    key={`${art.codigo}-${i}`}
                    className="flex items-start justify-between gap-2 text-[11px] py-1 border-b border-white/5 last:border-0"
                  >
                    <span className="text-white/80 line-clamp-2 flex-1">{art.articulo}</span>
                    <BultosCantidadText
                      bultos={art.bultos}
                      className="shrink-0 text-emerald-200 font-bold text-[10px]"
                      secondaryClassName="text-emerald-200/55"
                    />
                  </li>
                ))}
              </ul>
            )}
            {isOpen && rem.articulos.length === 0 && (
              <p className="text-[10px] text-white/45 px-3 pb-2">Sin detalle de artículos</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
