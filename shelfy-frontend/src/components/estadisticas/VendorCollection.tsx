"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
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
  hidden: { opacity: 0, scale: 0.92, y: 16 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  },
};

const CARD_DIMMED = { scale: 0.96, opacity: 0.62 };
const CARD_FOCUSED = { scale: 1, opacity: 1 };
const CARD_FOCUS_TRANSITION = { duration: 0.45, ease: [0.32, 0.72, 0, 1] as const };

/** Altura aprox. carta + gap para scroll-into-view en listas largas */
const CARD_ROW_H = 472;
const SCROLL_CONTAINER_MAX_H = "calc(100vh - 220px)";

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
  const [detailVisible, setDetailVisible] = useState(false);
  const detailVisibleRef = useRef(false);

  useEffect(() => {
    if (activeVendorId) setDetailVisible(true);
  }, [activeVendorId]);

  useEffect(() => {
    detailVisibleRef.current = detailVisible;
  }, [detailVisible]);

  const filtered = filterSucursal
    ? vendors.filter((v) => v.sucursal === filterSucursal)
    : vendors;

  const useContainedScroll = filtered.length > 12;
  const visibleVendors = filtered;

  const leadersByVendor = useMemo(
    () => computeStatLeadersByVendor(filtered),
    [filtered],
  );

  useEffect(() => {
    if (!activeVendorId || !scrollRef.current || !useContainedScroll) return;
    const idx = filtered.findIndex((v) => v.id_vendedor === activeVendorId);
    if (idx < 0) return;
    const cols = Math.max(
      1,
      Math.floor(scrollRef.current.clientWidth / 276),
    );
    const row = Math.floor(idx / cols);
    const target = row * CARD_ROW_H - 24;
    scrollRef.current.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeVendorId, filtered, useContainedScroll]);

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
    <LayoutGroup id="estadisticas-vendor-cards">
    <div
      style={{
        position: "relative",
        width: "100%",
        flex: useContainedScroll ? 1 : undefined,
        minHeight: useContainedScroll ? 0 : undefined,
        display: useContainedScroll ? "flex" : "block",
        flexDirection: "column",
      }}
    >
      <motion.div
        ref={scrollRef}
        variants={containerVariants}
        initial="hidden"
        animate="show"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(276px, 1fr))",
          gap: 20,
          alignContent: "start",
          overflowX: "hidden",
          overflowY: useContainedScroll ? "auto" : "visible",
          maxHeight: useContainedScroll ? SCROLL_CONTAINER_MAX_H : undefined,
          padding: "12px 24px 24px",
          WebkitOverflowScrolling: "touch",
          transition: "opacity 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
          opacity: activeVendorId ? 0.78 : 1,
        }}
        className="estadisticas-scroll-strip"
      >
        {visibleVendors.map((vendor) => (
          <motion.div
            key={vendor.id_vendedor}
            variants={cardVariants}
            style={{ minWidth: 0 }}
            animate={
              activeVendorId
                ? vendor.id_vendedor === activeVendorId
                  ? CARD_FOCUSED
                  : CARD_DIMMED
                : "show"
            }
            transition={CARD_FOCUS_TRANSITION}
          >
            <VendorCard
              vendor={vendor}
              isActive={vendor.id_vendedor === activeVendorId}
              overlayMode={overlayMode}
              compact={false}
              nombreDistribuidora={nombreDistribuidora}
              statLeaders={leadersByVendor.get(vendor.id_vendedor) ?? []}
              onPrefetchDetalle={() => handlePrefetchDetalle(vendor.id_vendedor)}
            />
          </motion.div>
        ))}
      </motion.div>

      <AnimatePresence
        mode="popLayout"
        onExitComplete={() => {
          if (!detailVisibleRef.current) setActiveVendorId(null);
        }}
      >
        {detailVisible && activeVendor && (
          <VendorCardExpanded
            key={activeVendor.id_vendedor}
            vendor={activeVendor}
            vendors={filtered}
            distId={distId}
            meses={meses}
            onClose={() => setDetailVisible(false)}
          />
        )}
      </AnimatePresence>

      <style>{`
        .estadisticas-scroll-strip {
          scrollbar-width: thin;
          scrollbar-color: ${ESTADISTICAS_FIFA.panelBorder} transparent;
        }
        .estadisticas-scroll-strip::-webkit-scrollbar {
          width: 6px;
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
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
      `}      </style>
    </div>
    </LayoutGroup>
  );
}
