"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import { VendorCard } from "./VendorCard";
import { VendorCardExpanded } from "./VendorCardExpanded";
import { useEstadisticasStore } from "@/store/useEstadisticasStore";
import type { VendorCartaResumen } from "@/lib/api";

interface VendorCollectionProps {
  vendors: VendorCartaResumen[];
  distId: number;
  meses: string[];
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
const CARD_W = 272; // ~260 card + gap for scroll mode

export function VendorCollection({ vendors, distId, meses }: VendorCollectionProps) {
  const {
    activeVendorId,
    setActiveVendorId,
    filterSucursal,
    overlayMode,
  } = useEstadisticasStore();

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
            : "repeat(auto-fill, minmax(260px, 1fr))",
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
          scrollbar-color: rgba(168,85,247,0.3) transparent;
        }
        .estadisticas-scroll-strip::-webkit-scrollbar {
          height: 4px;
        }
        .estadisticas-scroll-strip::-webkit-scrollbar-track {
          background: transparent;
        }
        .estadisticas-scroll-strip::-webkit-scrollbar-thumb {
          background: rgba(168,85,247,0.3);
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
