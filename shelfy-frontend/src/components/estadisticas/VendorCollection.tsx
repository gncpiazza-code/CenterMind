"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import { VendorCard } from "./VendorCard";
import { VendorCardExpanded } from "./VendorCardExpanded";
import { useEstadisticasStore } from "@/store/useEstadisticasStore";
import type { VendorCartaResumen } from "@/lib/api";
import { computeStatLeadersByVendor } from "@/lib/vendor-card-fusion-kpi";
import {
  prefetchEstadisticasDetalle,
  useEstadisticasWarmCache,
} from "@/hooks/useEstadisticasQueries";
import { ESTADISTICAS_FIFA } from "@/lib/vendor-card-detalle-theme";

interface VendorCollectionProps {
  vendors: VendorCartaResumen[];
  distId: number;
  meses: string[];
  nombreDistribuidora?: string | null;
}

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85, y: 20 },
  show: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 25 },
  },
};

const WINDOW_BUFFER = 20;
const CARD_W = 276; // 260 card + 16 gap (scroll)

export function VendorCollection({
  vendors,
  distId,
  meses,
  nombreDistribuidora,
}: VendorCollectionProps) {
  const {
    activeVendorId,
    setActiveVendorId,
    filterSucursal,
    overlayMode,
  } = useEstadisticasStore();

  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollCenter, setScrollCenter] = useState(0);

  const filtered = filterSucursal
    ? vendors.filter((v) => v.sucursal === filterSucursal)
    : vendors;

  const useScrollMode = filtered.length > 40;
  const windowedStart = Math.max(0, scrollCenter - WINDOW_BUFFER);
  const windowedEnd = Math.min(filtered.length, scrollCenter + WINDOW_BUFFER);

  const visibleVendors = useScrollMode
    ? filtered.slice(windowedStart, windowedEnd)
    : filtered;

  const leadersByVendor = useMemo(
    () => computeStatLeadersByVendor(filtered),
    [filtered],
  );

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const x = scrollRef.current.scrollLeft;
      setScrollCenter(Math.round(x / CARD_W));
    }
  }, []);

  useEffect(() => {
    if (!useScrollMode) return;
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, useScrollMode]);

  useEffect(() => {
    if (!activeVendorId || !scrollRef.current || !useScrollMode) return;
    const idx = filtered.findIndex((v) => v.id_vendedor === activeVendorId);
    if (idx < 0) return;
    const target = idx * CARD_W - scrollRef.current.clientWidth / 2 + CARD_W / 2;
    scrollRef.current.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [activeVendorId, filtered, useScrollMode]);

  const activeVendor = activeVendorId
    ? vendors.find((v) => v.id_vendedor === activeVendorId) ?? null
    : null;

  const activeIdx = activeVendor
    ? filtered.findIndex((v) => v.id_vendedor === activeVendor.id_vendedor)
    : -1;
  const neighborIds = useMemo(() => {
    if (activeIdx < 0) return [] as string[];
    const ids: string[] = [];
    const prev = filtered[activeIdx - 1];
    const next = filtered[activeIdx + 1];
    if (prev) ids.push(prev.id_vendedor);
    if (next) ids.push(next.id_vendedor);
    return ids;
  }, [activeIdx, filtered]);

  useEstadisticasWarmCache(queryClient, distId, meses, filterSucursal, neighborIds);

  const handlePrefetchDetalle = useCallback(
    (vendedorId: string) => {
      prefetchEstadisticasDetalle(queryClient, distId, vendedorId, meses);
    },
    [queryClient, distId, meses],
  );

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <motion.div
        ref={scrollRef}
        variants={containerVariants}
        initial="hidden"
        animate="show"
        style={{
          display: useScrollMode ? "flex" : "grid",
          gridTemplateColumns: useScrollMode
            ? undefined
            : "repeat(auto-fill, minmax(276px, 1fr))",
          gap: useScrollMode ? 16 : 20,
          overflowX: useScrollMode ? "auto" : "visible",
          overflowY: "visible",
          padding: "12px 24px 24px",
          scrollSnapType: useScrollMode ? "x mandatory" : undefined,
          WebkitOverflowScrolling: "touch",
          transition: "opacity 0.2s ease",
          opacity: activeVendorId ? 0.65 : 1,
        }}
        className="estadisticas-scroll-strip"
      >
        {useScrollMode && windowedStart > 0 && (
          <div style={{ width: windowedStart * CARD_W, flexShrink: 0 }} aria-hidden="true" />
        )}

        {visibleVendors.map((vendor) => (
          <motion.div
            key={vendor.id_vendedor}
            layout
            style={useScrollMode ? { flexShrink: 0, width: 260 } : { minWidth: 0 }}
            animate={
              activeVendorId && vendor.id_vendedor !== activeVendorId
                ? { scale: 0.82, opacity: 0.45 }
                : { scale: 1, opacity: 1 }
            }
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
          >
            <VendorCard
              vendor={vendor}
              isActive={vendor.id_vendedor === activeVendorId}
              overlayMode={overlayMode}
              variants={cardVariants}
              compact={useScrollMode}
              nombreDistribuidora={nombreDistribuidora}
              statLeaders={leadersByVendor.get(vendor.id_vendedor) ?? []}
              onPrefetchDetalle={() => handlePrefetchDetalle(vendor.id_vendedor)}
            />
          </motion.div>
        ))}

        {useScrollMode && windowedEnd < filtered.length && (
          <div
            style={{ width: (filtered.length - windowedEnd) * CARD_W, flexShrink: 0 }}
            aria-hidden="true"
          />
        )}
      </motion.div>

      <AnimatePresence>
        {activeVendor && (
          <VendorCardExpanded
            key={activeVendor.id_vendedor}
            vendor={activeVendor}
            vendors={filtered}
            distId={distId}
            meses={meses}
            onClose={() => setActiveVendorId(null)}
          />
        )}
      </AnimatePresence>

      <style>{`
        .estadisticas-scroll-strip {
          scrollbar-width: thin;
          scrollbar-color: ${ESTADISTICAS_FIFA.panelBorder} transparent;
        }
        .estadisticas-scroll-strip::-webkit-scrollbar {
          height: 4px;
        }
        .estadisticas-scroll-strip::-webkit-scrollbar-track {
          background: transparent;
        }
        .estadisticas-scroll-strip::-webkit-scrollbar-thumb {
          background: ${ESTADISTICAS_FIFA.panelBorder};
          border-radius: 4px;
        }
        @media (max-width: 640px) {
          .estadisticas-scroll-strip {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            overflow-x: hidden !important;
          }
        }
      `}</style>
    </div>
  );
}
