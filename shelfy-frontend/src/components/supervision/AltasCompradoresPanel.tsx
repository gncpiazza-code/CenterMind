"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Target,
  Loader2,
  LayoutList,
  Store,
  ArrowUpFromLine,
  Star,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PdvMovimientoCard } from "@/components/supervision/PdvMovimientoCard";
import {
  buildMesOptions,
  filterAltasItems,
  useAltasCompradoresQuery,
  usePrefetchAltasCompradores,
} from "@/hooks/useAltasCompradores";
import { useSupervisionPanelStore } from "@/store/useSupervisionPanelStore";
import { mesEnLetras } from "@/lib/cuentasCorrientes";
import { SUPERVISION_PANEL_SCROLL_MIN_H } from "@/components/supervision/supervisionLayout";
import { cn } from "@/lib/utils";
import type { PdvsMovimientoItem } from "@/lib/api";

const MES_OPTIONS = buildMesOptions(12);

type Layout = "tabs" | "split";

type Props = {
  distId: number;
  vendedorId: number | null;
  layout?: Layout;
  className?: string;
};

function SplitRow({ item, index }: { item: PdvsMovimientoItem; index: number }) {
  return (
    <div className="px-4 py-2.5 flex items-start gap-2 hover:bg-white/5 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-[var(--shelfy-text)] truncate">
            {item.nombre || "—"}
          </p>
          <span className="text-[10px] text-[var(--shelfy-muted)] shrink-0">
            {item.fecha_evento ? String(item.fecha_evento).slice(0, 10) : "—"}
          </span>
        </div>
        <p className="text-[10px] text-[var(--shelfy-muted)] truncate">
          {item.id_cliente_erp ?? "Sin código ERP"} · {item.razon_social || "Sin razón social"}
        </p>
      </div>
      {item.exhibido && (
        <Star size={11} className="text-violet-400 fill-violet-400 shrink-0" />
      )}
    </div>
  );
}

/** Panel Altas y Compradores — TanStack cache compartida + filtros en Zustand. */
export function AltasCompradoresPanel({
  distId,
  vendedorId,
  layout = "tabs",
  className = "",
}: Props) {
  const { altasMes, altasTab, setAltasMes, setAltasTab } = useSupervisionPanelStore();
  const { data: altasData, isLoading, isFetching } = useAltasCompradoresQuery(
    distId,
    vendedorId,
    altasMes,
  );
  usePrefetchAltasCompradores(distId, vendedorId, altasMes);

  const altasMesLabel = mesEnLetras(altasMes);
  const showLoading = isLoading && !altasData;
  const showStale = isFetching && !!altasData;

  const itemsFiltrados = useMemo(
    () => filterAltasItems(altasData?.items ?? [], altasTab),
    [altasData, altasTab],
  );

  const mesSelect =
    layout === "tabs" ? (
      <Select
        value={altasMes}
        onValueChange={(v) => setAltasMes(v)}
      >
        <SelectTrigger className="h-7 text-xs w-44 border-[var(--shelfy-border)]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MES_OPTIONS.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <select
        value={altasMes}
        onChange={(e) => setAltasMes(e.target.value)}
        className="text-xs bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-2 py-1 text-[var(--shelfy-text)] focus:outline-none"
      >
        {MES_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    );

  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden shadow-sm flex flex-col flex-1 min-h-0",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--shelfy-border)]/50">
        <div className="flex items-center gap-2 min-w-0">
          <Target
            className={`w-4 h-4 shrink-0 ${layout === "split" ? "text-emerald-400" : "text-violet-500"}`}
          />
          <h3 className="text-sm font-bold text-[var(--shelfy-text)] truncate">
            Altas y Compradores
          </h3>
          {showStale && (
            <Loader2 className="w-3 h-3 animate-spin text-[var(--shelfy-muted)] shrink-0" />
          )}
        </div>
        {mesSelect}
      </div>

      <AnimatePresence mode="wait">
        {!vendedorId ? (
          <motion.div
            key="empty-vendor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center justify-center py-10 md:py-16 gap-3 text-center px-6"
          >
            <Target
              className={`w-8 h-8 ${layout === "split" ? "text-[var(--shelfy-muted)]/30" : "text-violet-500/40"}`}
            />
            <p className="text-sm text-[var(--shelfy-muted)]">
              {layout === "split"
                ? "Seleccioná un vendedor para ver altas y compradores"
                : "Seleccioná un vendedor para ver sus altas y compradores del mes"}
            </p>
          </motion.div>
        ) : showLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={layout === "tabs" ? "p-4 flex flex-col gap-2" : "flex items-center justify-center py-10"}
          >
            {layout === "tabs" ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))
            ) : (
              <Loader2 className="w-5 h-5 animate-spin text-[var(--shelfy-muted)]" />
            )}
          </motion.div>
        ) : !altasData?.items?.length ? (
          <motion.div
            key={`empty-${altasMes}-${vendedorId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-10 md:py-12 text-sm text-[var(--shelfy-muted)] px-6 text-center"
          >
            Sin altas ni compradores en {altasMesLabel}
          </motion.div>
        ) : layout === "split" ? (
          <motion.div
            key={`split-${altasMes}-${vendedorId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="grid grid-cols-2 divide-x divide-[var(--shelfy-border)]/40 border-b border-[var(--shelfy-border)]/30">
              <div className="px-4 py-2.5">
                <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">
                  Altas
                </p>
                <p className="text-base font-bold text-emerald-400">{altasData.total_altas}</p>
              </div>
              <div className="px-4 py-2.5">
                <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">
                  Compradores
                </p>
                <p className="text-base font-bold text-violet-400">
                  {altasData.total_compradores}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--shelfy-border)]/30 flex-1 overflow-y-auto max-h-[420px]">
              {(["alta", "comprador"] as const).map((cat) => {
                const rows = filterAltasItems(altasData.items, cat);
                return (
                  <div key={cat} className="min-h-[180px]">
                    <div className="px-4 py-2 border-b border-[var(--shelfy-border)]/30">
                      <p
                        className={`text-[11px] font-bold uppercase tracking-wide ${
                          cat === "alta" ? "text-emerald-400" : "text-violet-400"
                        }`}
                      >
                        {cat === "alta" ? "Altas" : "Compradores"}
                      </p>
                    </div>
                    {!rows.length ? (
                      <div className="px-4 py-6 text-[11px] text-[var(--shelfy-muted)]">
                        Sin datos
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--shelfy-border)]/30">
                        {rows.map((item, i) => (
                          <SplitRow key={`${cat}-${item.id_cliente_erp ?? i}`} item={item} index={i} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`tabs-${altasMes}-${vendedorId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="border-b border-[var(--shelfy-border)]/40">
              <div className="grid grid-cols-2 divide-x divide-[var(--shelfy-border)]/30">
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5 flex items-center gap-1">
                    <ArrowUpFromLine size={9} className="text-emerald-500" />
                    Altas en {altasMesLabel}
                  </p>
                  <p className="text-xl font-black text-emerald-500 tabular-nums leading-none">
                    {altasData.total_altas}
                  </p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5 flex items-center gap-1">
                    <Store size={9} className="text-violet-500" />
                    Compradores en {altasMesLabel}
                  </p>
                  <p className="text-xl font-black text-violet-500 tabular-nums leading-none">
                    {altasData.total_compradores}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 px-4 pb-2.5 pt-1">
                {(
                  [
                    { key: "todos" as const, label: "Todos", icon: LayoutList, count: altasData.items.length },
                    { key: "alta" as const, label: "Altas", icon: ArrowUpFromLine, count: altasData.total_altas },
                    { key: "comprador" as const, label: "Compradores", icon: Store, count: altasData.total_compradores },
                  ] as const
                ).map(({ key, label, icon: Icon, count }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAltasTab(key)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                      altasTab === key
                        ? key === "alta"
                          ? "bg-emerald-500 text-white"
                          : key === "comprador"
                            ? "bg-violet-500 text-white"
                            : "bg-[var(--shelfy-text)] text-white"
                        : "bg-black/5 text-muted-foreground hover:bg-black/8"
                    }`}
                  >
                    <Icon size={10} />
                    {label}
                    <span
                      className={`text-[10px] font-mono ${altasTab === key ? "opacity-80" : "opacity-60"}`}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className={cn("flex-1 min-h-0 overflow-y-auto", SUPERVISION_PANEL_SCROLL_MIN_H)}>
              <AnimatePresence mode="wait">
                {itemsFiltrados.length === 0 ? (
                  <motion.p
                    key="empty-tab"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center text-xs text-muted-foreground py-8"
                  >
                    Sin registros en esta categoría
                  </motion.p>
                ) : (
                  <motion.div
                    key={altasTab}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {itemsFiltrados.map((item, i) => (
                      <PdvMovimientoCard
                        key={`${item.id_cliente_erp ?? i}-${altasTab}`}
                        item={item}
                        index={i}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
