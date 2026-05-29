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

// Simple windowing: keep ±20 cards around center visible for large lists
const WINDOW_BUFFER = 20;

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

  // Windowing for large lists
  const CARD_W = 200; // 188 + 12 gap
  const windowedStart = Math.max(0, scrollCenter - WINDOW_BUFFER);
  const windowedEnd   = Math.min(filtered.length, scrollCenter + WINDOW_BUFFER);
  const useWindowing  = filtered.length > 40;

  const visibleVendors = useWindowing
    ? filtered.slice(windowedStart, windowedEnd)
    : filtered;

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const x = scrollRef.current.scrollLeft;
      setScrollCenter(Math.round(x / CARD_W));
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Scroll active card into view
  useEffect(() => {
    if (!activeVendorId || !scrollRef.current) return;
    const idx = filtered.findIndex((v) => v.id_vendedor === activeVendorId);
    if (idx < 0) return;
    const target = idx * CARD_W - scrollRef.current.clientWidth / 2 + CARD_W / 2;
    scrollRef.current.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [activeVendorId, filtered]);

  const activeVendor = activeVendorId
    ? vendors.find((v) => v.id_vendedor === activeVendorId) ?? null
    : null;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Card strip */}
      <motion.div
        ref={scrollRef}
        variants={containerVariants}
        initial="hidden"
        animate="show"
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          overflowY: "visible",
          padding: "12px 20px 16px",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          transition: "opacity 0.2s ease",
          opacity: activeVendorId ? 0.65 : 1,
          pointerEvents: "auto",
        }}
        className="estadisticas-scroll-strip"
      >
        {/* Windowing offset spacer */}
        {useWindowing && windowedStart > 0 && (
          <div style={{ width: windowedStart * CARD_W, flexShrink: 0 }} aria-hidden="true" />
        )}

        {visibleVendors.map((vendor) => (
          <motion.div
            key={vendor.id_vendedor}
            layout
            animate={
              activeVendorId && vendor.id_vendedor !== activeVendorId
                ? { scale: 0.75, opacity: 0.4 }
                : { scale: 1,    opacity: 1 }
            }
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
          >
            <VendorCard
              vendor={vendor}
              isActive={vendor.id_vendedor === activeVendorId}
              overlayMode={overlayMode}
              variants={cardVariants}
            />
          </motion.div>
        ))}

        {/* Windowing tail spacer */}
        {useWindowing && windowedEnd < filtered.length && (
          <div
            style={{ width: (filtered.length - windowedEnd) * CARD_W, flexShrink: 0 }}
            aria-hidden="true"
          />
        )}
      </motion.div>

      {/* Expanded overlay */}
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

      {/* Scrollbar styling */}
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
            grid-template-columns: repeat(2, 1fr) !important;
            overflow-x: hidden !important;
            overflow-y: visible !important;
          }
        }
      `}</style>
    </div>
  );
}
