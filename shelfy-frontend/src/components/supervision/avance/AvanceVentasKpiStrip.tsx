"use client";

import { Package, Store, Barcode, Target } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { AvanceCoberturaPdvs, AvanceKpiCard, AvanceVentasModo } from "@/lib/api";
import {
  deltaDir,
  deltaRefLabel,
  fmtBultos,
  fmtDelta,
  fmtEntero,
  fmtUnidades,
} from "@/lib/avance-ventas-format";
import { AVANCE_KPI_HELP } from "@/lib/avance-ventas-kpi-help";
import { KpiHelpTip } from "@/components/estadisticas/KpiHelpTip";
import { cn } from "@/lib/utils";

const STRIP_IDS = ["volumen", "cobertura_pdvs", "clientes", "skus"] as const;
type StripId = (typeof STRIP_IDS)[number];

const CARD_META: Record<
  StripId,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    bg: string;
    help?: string;
  }
> = {
  volumen: {
    label: "Volumen Cigarrillos",
    icon: Package,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/8 dark:bg-emerald-500/15",
    help: AVANCE_KPI_HELP.volumenCigarrillos,
  },
  cobertura_pdvs: {
    label: "Cobertura PDV",
    icon: Target,
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/8 dark:bg-sky-500/15",
    help: AVANCE_KPI_HELP.coberturaPdvs,
  },
  clientes: {
    label: "Clientes con compra",
    icon: Store,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/8 dark:bg-violet-500/15",
    help: AVANCE_KPI_HELP.clientes,
  },
  skus: {
    label: "SKUs activos",
    icon: Barcode,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/8 dark:bg-amber-500/15",
    help: AVANCE_KPI_HELP.skus,
  },
};

/** API legacy: bultos + unidades por separado → card unificada volumen. */
function normalizeKpiCards(cards: AvanceKpiCard[] | undefined): AvanceKpiCard[] {
  if (!cards?.length) return [];
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));

  const volumen: AvanceKpiCard | undefined =
    byId.volumen ??
    (byId.bultos
      ? {
          ...byId.bultos,
          id: "volumen",
          extra: { unidades: byId.unidades?.valor ?? 0 },
        }
      : undefined);

  return STRIP_IDS.map((id) => {
    if (id === "volumen") return volumen;
    return byId[id];
  }).filter((c): c is AvanceKpiCard => !!c);
}

function withCoberturaCard(
  cards: AvanceKpiCard[],
  cobertura?: AvanceCoberturaPdvs,
): AvanceKpiCard[] {
  if (cards.some((c) => c.id === "cobertura_pdvs")) return cards;
  if (!cobertura?.disponible || !cobertura.cartera) return cards;
  return [
    ...cards,
    {
      id: "cobertura_pdvs",
      valor: cobertura.pct_cobertura ?? 0,
      extra: {
        disponible: true,
        cartera: cobertura.cartera,
        con_compra: cobertura.con_compra,
      },
    },
  ];
}

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
  const colorClass =
    dir === "flat" || !delta.disponible
      ? "text-slate-500 dark:text-slate-400"
      : (dir === "up") !== invertColor
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400";
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

function KpiValue({ id, card }: { id: StripId; card: AvanceKpiCard }) {
  if (id === "volumen") {
    const enteros =
      card.extra?.bultos_enteros ??
      (Number.isFinite(card.valor) ? Math.trunc(card.valor) : 0);
    const resto = card.extra?.unidades_resto ?? 0;
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-2xl font-black text-foreground tracking-tight leading-none tabular-nums">
          {fmtBultos(card.valor)}
        </p>
        <p className="text-sm font-semibold text-muted-foreground tabular-nums leading-tight">
          {fmtEntero(enteros)} bultos
          {resto > 0 ? (
            <>
              {" "}
              + {fmtUnidades(resto)}{" "}
              <span className="text-[11px] font-medium">unidades</span>
            </>
          ) : null}
        </p>
      </div>
    );
  }

  if (id === "cobertura_pdvs") {
    const disponible = card.extra?.disponible !== false && (card.extra?.cartera ?? 0) > 0;
    const cartera = card.extra?.cartera ?? 0;
    const conCompra = card.extra?.con_compra ?? 0;
    if (!disponible) {
      return (
        <p className="text-2xl font-black text-muted-foreground tracking-tight leading-none">N/D</p>
      );
    }
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-2xl font-black text-foreground tracking-tight leading-none tabular-nums">
          {card.valor.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%
        </p>
        <p className="text-[11px] font-medium text-muted-foreground tabular-nums leading-tight">
          {fmtEntero(conCompra)} / {fmtEntero(cartera)} PDVs
        </p>
      </div>
    );
  }

  const fmt = id === "clientes" || id === "skus" ? fmtEntero : fmtBultos;
  return (
    <p className="text-2xl font-black text-foreground tracking-tight leading-none tabular-nums">
      {fmt(card.valor)}
    </p>
  );
}

interface AvanceVentasKpiStripProps {
  cards: AvanceKpiCard[] | undefined;
  modo: AvanceVentasModo;
  /** Fallback si el BE aún no envía `cobertura_pdvs` en kpis_cards. */
  coberturaPdvs?: AvanceCoberturaPdvs;
  loading?: boolean;
  className?: string;
}

/** 4 KPI cards: volumen (bultos+unidades) · cobertura PDV · clientes · SKUs. */
export function AvanceVentasKpiStrip({
  cards,
  modo,
  coberturaPdvs,
  loading,
  className,
}: AvanceVentasKpiStripProps) {
  const visibles = withCoberturaCard(normalizeKpiCards(cards), coberturaPdvs);
  const idsToRender = STRIP_IDS;

  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-3", className)}>
      {idsToRender.map((id, idx) => {
        const meta = CARD_META[id];
        const card = visibles.find((c) => c.id === id);
        const Icon = meta.icon;
        const showDeltas = id !== "cobertura_pdvs";

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
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1 min-w-0">
                      <span className="truncate">{meta.label}</span>
                      {meta.help ? <KpiHelpTip text={meta.help} size={11} side="top" /> : null}
                    </p>
                    {loading || !card ? (
                      <Skeleton className="mt-1 h-7 w-20 rounded" />
                    ) : (
                      <div className="mt-1 flex flex-col gap-0.5 min-w-0">
                        <KpiValue id={id} card={card} />
                        {showDeltas && (
                          <div className="flex flex-col gap-0.5 mt-1">
                            {card.wow != null && (
                              <DeltaRow delta={card.wow} label={deltaRefLabel(modo, "wow")} />
                            )}
                            {card.mom != null && (
                              <DeltaRow delta={card.mom} label={deltaRefLabel(modo, "mom")} />
                            )}
                          </div>
                        )}
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
      })}
    </div>
  );
}
