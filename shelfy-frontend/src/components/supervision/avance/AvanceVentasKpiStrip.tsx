"use client";

import { Package, Boxes, Store, Barcode } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { AvanceKpiCard, AvanceVentasModo } from "@/lib/api";
import {
  deltaDir,
  deltaRefLabel,
  fmtBultos,
  fmtDelta,
  fmtEntero,
  fmtUnidades,
} from "@/lib/avance-ventas-format";
import { cn } from "@/lib/utils";

const CARD_META: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string; fmt: (n: number) => string }
> = {
  bultos: { label: "Bultos", icon: Package, color: "text-emerald-600", bg: "bg-emerald-500/8", fmt: fmtBultos },
  unidades: { label: "Unidades", icon: Boxes, color: "text-blue-600", bg: "bg-blue-500/8", fmt: fmtUnidades },
  clientes: { label: "Clientes con compra", icon: Store, color: "text-violet-600", bg: "bg-violet-500/8", fmt: fmtEntero },
  skus: { label: "SKUs activos", icon: Barcode, color: "text-amber-600", bg: "bg-amber-500/8", fmt: fmtEntero },
};

function DeltaRow({
  delta,
  label,
  invertColor = false,
}: {
  delta: AvanceKpiCard["wow"];
  label: string;
  invertColor?: boolean;
}) {
  if (delta === null || delta === undefined) return null;
  const dir = deltaDir(delta);
  const text = fmtDelta(delta);
  // En ventas, subir es bueno (verde) — inverso a CC deuda.
  const colorClass =
    dir === "flat" || !delta.disponible
      ? "text-slate-500"
      : (dir === "up") !== invertColor
        ? "text-emerald-600"
        : "text-rose-600";
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums", colorClass)}
      title={`${label}: ${text}`}
    >
      {dir === "up" ? (
        <TrendingUp size={11} strokeWidth={2.5} className="shrink-0" />
      ) : dir === "down" ? (
        <TrendingDown size={11} strokeWidth={2.5} className="shrink-0" />
      ) : (
        <Minus size={11} strokeWidth={2.5} className="shrink-0" />
      )}
      <span className="leading-tight">
        {text} <span className="text-muted-foreground font-medium">{label}</span>
      </span>
    </span>
  );
}

interface AvanceVentasKpiStripProps {
  cards: AvanceKpiCard[] | undefined;
  modo: AvanceVentasModo;
  loading?: boolean;
  className?: string;
}

/** 4 KPI cards (bultos / unidades / clientes / SKUs) con deltas WoW/MoM. */
export function AvanceVentasKpiStrip({ cards, modo, loading, className }: AvanceVentasKpiStripProps) {
  const visibles = (cards ?? []).filter((c) => c.id in CARD_META);

  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-3", className)}>
      {(loading || visibles.length === 0 ? Object.keys(CARD_META) : visibles.map((c) => c.id)).map(
        (id, idx) => {
          const meta = CARD_META[id];
          const card = visibles.find((c) => c.id === id);
          const Icon = meta.icon;
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: idx * 0.06 }}
              className="min-w-0"
            >
              <Card className="border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate">
                        {meta.label}
                      </p>
                      {loading || !card ? (
                        <Skeleton className="mt-1 h-7 w-20 rounded" />
                      ) : (
                        <div className="mt-1 flex flex-col gap-0.5 min-w-0">
                          <p className="text-2xl font-black text-foreground tracking-tight leading-none tabular-nums">
                            {meta.fmt(card.valor)}
                          </p>
                          <div className="flex flex-col gap-0.5">
                            {card.wow != null && (
                              <DeltaRow delta={card.wow} label={deltaRefLabel(modo, "wow")} />
                            )}
                            {card.mom != null && (
                              <DeltaRow delta={card.mom} label={deltaRefLabel(modo, "mom")} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className={`size-9 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
                      <Icon size={17} className={meta.color} strokeWidth={2} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        },
      )}
    </div>
  );
}
