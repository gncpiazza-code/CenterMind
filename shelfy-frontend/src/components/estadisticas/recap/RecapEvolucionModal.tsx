"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, ArrowRight, GitBranch, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { prefetchRecapEvolucion, useRecapEvolucion } from "@/hooks/useRecapQueries";
import { ESTADISTICAS_FIFA } from "@/lib/vendor-card-detalle-theme";
import { formatMesLabel } from "@/lib/recap-utils";
import { VendorCardFusion } from "../VendorCardFusion";
import { scoreToTier, VENDOR_CARD_TIER_THEME } from "@/lib/vendor-card-tier";
import type { VendorCartaResumen } from "@/lib/api";
import type { RecapEvolucionStep } from "@/lib/recap-types";
import "../vendor-card-fusion.css";

function scoreDelta(prev: number | null, curr: number | null): number | null {
  if (prev === null || curr === null) return null;
  return Math.round(curr) - Math.round(prev);
}

function DeltaPill({ delta }: { delta: number }) {
  const isUp = delta > 0;
  const isDown = delta < 0;
  const color = isUp ? "#10B981" : isDown ? "#EF4444" : "#64748B";
  const bg = isUp ? "rgba(16,185,129,0.12)" : isDown ? "rgba(239,68,68,0.12)" : "rgba(100,116,139,0.1)";
  const Icon = isUp ? ArrowUp : isDown ? ArrowDown : Minus;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "3px 8px",
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 800,
        fontFamily: "monospace",
      }}
    >
      <Icon size={11} />
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

function TimelineConnector({ delta }: { delta: number | null }) {
  const F = ESTADISTICAS_FIFA;
  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "0 4px",
        alignSelf: "center",
      }}
    >
      <div style={{ width: 28, height: 2, background: F.panelBorder, borderRadius: 1 }} />
      <ArrowRight size={18} color={F.accentDark} strokeWidth={2.5} />
      {delta !== null && delta !== 0 ? <DeltaPill delta={delta} /> : (
        <span style={{ fontSize: 10, color: "var(--shelfy-muted)", fontWeight: 600 }}>—</span>
      )}
      <div style={{ width: 28, height: 2, background: F.panelBorder, borderRadius: 1 }} />
    </div>
  );
}

function TimelineStep({
  step,
  highlight,
  nombreDistribuidora,
}: {
  step: RecapEvolucionStep;
  highlight?: boolean;
  nombreDistribuidora?: string | null;
}) {
  const F = ESTADISTICAS_FIFA;
  const carta = step.carta;
  const tier = carta ? scoreToTier(carta.score) : null;
  const theme = tier ? VENDOR_CARD_TIER_THEME[tier] : null;

  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 0,
        maxWidth: 280,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          padding: "6px 14px",
          borderRadius: 999,
          background: highlight ? F.accentDark : "rgba(100,116,139,0.1)",
          color: highlight ? "#fffef8" : "var(--shelfy-muted)",
          fontSize: 10,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
        }}
      >
        {step.label}
      </div>

      {carta && theme ? (
        <div
          style={{
            width: "100%",
            borderRadius: 16,
            boxShadow: highlight
              ? `0 10px 32px ${theme.glow}, 0 0 0 2px ${F.accent}`
              : undefined,
          }}
        >
          <VendorCardFusion
            vendor={carta}
            isActive={false}
            overlayMode="none"
            previewMode
            animationPaused
            nombreDistribuidora={nombreDistribuidora}
          />
        </div>
      ) : (
        <div
          style={{
            width: "100%",
            minHeight: 280,
            borderRadius: 14,
            border: `2px dashed ${F.panelBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            textAlign: "center",
            background: "rgba(248,250,252,0.8)",
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: "var(--shelfy-muted)", fontWeight: 600 }}>
            Sin snapshot
            <br />
            <span style={{ fontWeight: 500, fontSize: 11 }}>para este tramo</span>
          </p>
        </div>
      )}
    </div>
  );
}

interface RecapEvolucionModalProps {
  open: boolean;
  onClose: () => void;
  distId: number;
  vendedorId: string;
  mes: string;
  vendorName?: string;
  nombreDistribuidora?: string | null;
  /** Misma carta que la grilla de estadísticas para el paso C (cierre). */
  cartaReferencia?: VendorCartaResumen | null;
}

export function RecapEvolucionModal({
  open,
  onClose,
  distId,
  vendedorId,
  mes,
  vendorName,
  nombreDistribuidora,
  cartaReferencia,
}: RecapEvolucionModalProps) {
  useBodyScrollLock(open);
  const { data, isLoading, isError } = useRecapEvolucion(distId, vendedorId, mes, open);
  const F = ESTADISTICAS_FIFA;
  const nombre = vendorName ?? data?.nombre ?? "Vendedor";

  const steps = useMemo(() => {
    const base = data?.steps ?? [];
    if (!cartaReferencia) return base;
    return base.map((step) =>
      step.tipo === "C"
        ? {
            ...step,
            carta: cartaReferencia,
            available: true,
          }
        : step,
    );
  }, [data?.steps, cartaReferencia]);

  const scores = steps.map((s) => (s.carta ? Math.round(s.carta.score) : null));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 320,
            background: F.backdrop,
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(98vw, 1180px)",
              maxHeight: "min(94vh, 820px)",
              borderRadius: 20,
              overflow: "hidden",
              background: "var(--est-modal-bg, #fffef8)",
              boxShadow: F.shadow,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ height: 5, background: F.footerBg, flexShrink: 0 }} />

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 18px",
                borderBottom: `1px solid ${F.panelBorderLight}`,
                flexShrink: 0,
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: F.accentDark, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                  <GitBranch size={12} />
                  Evolución del mes
                </p>
                <p style={{ margin: "3px 0 0", fontSize: 16, fontWeight: 800, color: F.textOnLight }}>
                  {nombre} · {formatMesLabel(mes)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: "rgba(100,116,139,0.08)",
                  border: "1px solid rgba(100,116,139,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={16} color="var(--shelfy-muted)" />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 28px" }}>
              {isLoading && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 320 }}>
                  <Loader2 size={24} className="animate-spin" color={F.accentDark} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--shelfy-muted)" }}>Cargando evolución…</span>
                </div>
              )}

              {isError && !isLoading && (
                <div style={{ textAlign: "center", padding: 48 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: F.textOnLight }}>No se pudo cargar la evolución</p>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--shelfy-muted)" }}>
                    El vendedor no tiene actividad registrada en mayo o hubo un error al consultar.
                  </p>
                </div>
              )}

              {data && !isLoading && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    gap: 0,
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {steps.flatMap((step, i) => {
                    const isLast = i === steps.length - 1;
                    const delta = !isLast ? scoreDelta(scores[i], scores[i + 1]) : null;
                    const highlight = step.tipo === "C";
                    const nodes = [
                      <TimelineStep
                        key={step.periodo_key}
                        step={step}
                        highlight={highlight}
                        nombreDistribuidora={nombreDistribuidora}
                      />,
                    ];
                    if (!isLast) {
                      nodes.push(<TimelineConnector key={`conn-${step.periodo_key}`} delta={delta} />);
                    }
                    return nodes;
                  })}
                </div>
              )}

              {data && data.steps.some((s) => s.available) && (
                <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: 11, color: "var(--shelfy-muted)", lineHeight: 1.5 }}>
                  Cada carta refleja el score al cierre de ese tramo del mes — de izquierda a derecha se forma el mes completo.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface RecapEvolucionButtonProps {
  distId: number;
  vendedorId: string;
  mes: string | null;
  vendorName?: string;
  nombreDistribuidora?: string | null;
  cartaReferencia?: VendorCartaResumen | null;
  variant?: "card" | "panel";
  className?: string;
}

/** Botón reutilizable para abrir la línea de tiempo Q1 → Q2 → C. */
export function RecapEvolucionButton({
  distId,
  vendedorId,
  mes,
  vendorName,
  nombreDistribuidora,
  cartaReferencia,
  variant = "card",
}: RecapEvolucionButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const handlePrefetch = useCallback(() => {
    if (mes) prefetchRecapEvolucion(queryClient, distId, vendedorId, mes);
  }, [queryClient, distId, vendedorId, mes]);

  const handleOpen = useCallback(() => {
    handlePrefetch();
    setOpen(true);
  }, [handlePrefetch]);

  if (!mes) return null;

  const isPanel = variant === "panel";

  return (
    <>
      <button
        type="button"
        className={`vendor-fifa-evolucion-btn${isPanel ? " vendor-fifa-evolucion-btn--panel" : ""}`}
        onClick={handleOpen}
        onPointerEnter={handlePrefetch}
      >
        <GitBranch size={isPanel ? 14 : 13} strokeWidth={2.5} />
        Ver evolución
      </button>

      <RecapEvolucionModal
        open={open}
        onClose={() => setOpen(false)}
        distId={distId}
        vendedorId={vendedorId}
        mes={mes}
        vendorName={vendorName}
        nombreDistribuidora={nombreDistribuidora}
        cartaReferencia={cartaReferencia}
      />
    </>
  );
}