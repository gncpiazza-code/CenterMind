"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import type { Variants } from "framer-motion";
import { MousePointerClick } from "lucide-react";
import dynamic from "next/dynamic";
import { VendorCard } from "./VendorCard";
const VendorCardExpanded = dynamic(
  () => import("./VendorCardExpanded").then((m) => ({ default: m.VendorCardExpanded })),
  { ssr: false, loading: () => null },
);
import { useEstadisticasStore } from "@/store/useEstadisticasStore";
import type { VendorCartaResumen } from "@/lib/api";
import { computeStatLeadersByVendor } from "@/lib/vendor-card-fusion-kpi";
import { mesForRecapEvolucion } from "@/lib/recap-utils";
import {
  prefetchEstadisticasDetalle,
  useEstadisticasWarmCache,
} from "@/hooks/useEstadisticasQueries";

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

export function VendorCollection({
  vendors,
  distId,
  meses,
  nombreDistribuidora,
}: VendorCollectionProps) {
  const {
    activeVendorId,
    setActiveVendorId,
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

  // vendors ya llega filtrado por sucursal desde page.tsx
  const filtered = vendors;

  // Render progresivo: monta las primeras 12 cartas de inmediato y el resto en el siguiente tick
  // (evita bloquear el hilo principal con 30+ cartas complejas a la vez)
  const vendorsKey = vendors.length;
  const [renderLimit, setRenderLimit] = useState(12);
  useEffect(() => { setRenderLimit(12); }, [vendorsKey]);
  useEffect(() => {
    if (renderLimit < filtered.length) {
      const id = setTimeout(() => setRenderLimit((p) => p + 20), 80);
      return () => clearTimeout(id);
    }
  }, [renderLimit, filtered.length]);
  const visibleVendors = filtered.slice(0, renderLimit);

  const leadersByVendor = useMemo(
    () => computeStatLeadersByVendor(filtered),
    [filtered],
  );

  useEffect(() => {
    if (!activeVendorId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(
      `[data-vendor-id="${activeVendorId}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeVendorId, filtered]);

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

  useEstadisticasWarmCache(queryClient, distId, meses, neighborIds);

  const handlePrefetchDetalle = useCallback(
    (vendedorId: string) => {
      prefetchEstadisticasDetalle(queryClient, distId, vendedorId, meses);
    },
    [queryClient, distId, meses],
  );

  const evolucionMes = useMemo(() => mesForRecapEvolucion(meses), [meses]);

  return (
    <LayoutGroup id="estadisticas-vendor-cards">
    <div style={{ position: "relative", width: "100%" }}>
      {!activeVendorId && (
        <div
          style={{
            margin: "0 24px 12px",
            padding: "8px 14px",
            borderRadius: 10,
            background: "rgba(124,58,237,0.08)",
            border: "1px solid rgba(124,58,237,0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <MousePointerClick size={15} color="#7c3aed" strokeWidth={2.25} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--shelfy-text)" }}>
            Hace click en la carta para ver detalle
          </span>
        </div>
      )}

      <motion.div
        ref={scrollRef}
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="estadisticas-vendor-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(276px, 1fr))",
          gap: 20,
          alignContent: "start",
          padding: "12px 24px 32px",
          transition: "opacity 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
          opacity: activeVendorId ? 0.78 : 1,
        }}
      >
        {visibleVendors.map((vendor) => (
          <motion.div
            key={vendor.id_vendedor}
            data-vendor-id={vendor.id_vendedor}
            variants={cardVariants}
            style={{ minWidth: 0, contentVisibility: "auto", containIntrinsicSize: "0 300px" }}
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
              evolucionDistId={distId}
              evolucionMes={evolucionMes}
              evolucionVendorName={vendor.nombre}
              evolucionCartaReferencia={vendor}
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
        @media (max-width: 640px) {
          .estadisticas-vendor-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
      `}</style>
    </div>
    </LayoutGroup>
  );
}
