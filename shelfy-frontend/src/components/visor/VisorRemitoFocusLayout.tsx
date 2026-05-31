"use client";

import { VISOR_LAYOUT_TRANSITION } from "@/components/visor/visor-layout-motion";
import { cn } from "@/lib/utils";
import { LayoutGroup, motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface VisorRemitoFocusLayoutProps {
  resetKey: string | number;
  /** Tarjetas Exhibición + PDV; reciben si el remito está expandido para compactar */
  meta: (remitoExpanded: boolean) => ReactNode;
  remito: (remitoExpanded: boolean) => ReactNode;
  showRemito: boolean;
}

/**
 * Al expandir: las tarjetas meta se compactan in-place (layout spring) y el remito sube a la vez.
 */
export function VisorRemitoFocusLayout({
  resetKey,
  meta,
  remito,
  showRemito,
}: VisorRemitoFocusLayoutProps) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpanded(false);
  }, [resetKey]);

  const measureClip = useCallback(() => {
    if (expanded || !showRemito) {
      setClipped(false);
      return;
    }
    const slot = slotRef.current;
    const wrap = cardRef.current;
    if (!slot || !wrap) return;
    const content = wrap.firstElementChild as HTMLElement | null;
    const contentHeight = content?.offsetHeight ?? wrap.scrollHeight;
    setClipped(contentHeight > slot.clientHeight + 8);
  }, [expanded, showRemito]);

  useEffect(() => {
    measureClip();
    const raf = requestAnimationFrame(() => measureClip());
    const ro = new ResizeObserver(() => measureClip());
    const slot = slotRef.current;
    const wrap = cardRef.current;
    if (slot) ro.observe(slot);
    if (wrap) ro.observe(wrap);
    const content = wrap?.firstElementChild;
    if (content instanceof HTMLElement) ro.observe(content);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [measureClip, resetKey, showRemito]);

  /** Solo si el remito no entra en el slot o ya está expandido (para volver) */
  const showToggle = showRemito && (expanded || clipped);

  return (
    <LayoutGroup id="visor-remito-panel">
      <motion.div
        layout
        transition={VISOR_LAYOUT_TRANSITION}
        className="flex flex-1 flex-col min-h-0 overflow-hidden"
      >
        <motion.div
          layout
          transition={VISOR_LAYOUT_TRANSITION}
          className="shrink-0 min-w-0 z-[1]"
        >
          {meta(expanded)}
        </motion.div>

        {showRemito ? (
          <>
            <motion.div
              ref={slotRef}
              layout
              transition={VISOR_LAYOUT_TRANSITION}
              className={cn(
                "px-3 min-w-0 z-[3]",
                expanded ? "pb-1" : "pb-2",
                expanded
                  ? "shrink-0 overflow-y-auto overflow-x-hidden overscroll-contain max-h-[min(78vh,100%)]"
                  : "flex-1 min-h-0 flex flex-col overflow-hidden",
              )}
            >
              <motion.div
                ref={cardRef}
                layout
                transition={VISOR_LAYOUT_TRANSITION}
                className="w-full min-w-0 shrink-0"
              >
                {remito(expanded)}
              </motion.div>
            </motion.div>

            {showToggle ? (
              <motion.div
                layout
                transition={VISOR_LAYOUT_TRANSITION}
                className="shrink-0 flex justify-center px-3 pt-1 pb-2 z-[2]"
              >
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  aria-label={
                    expanded
                      ? "Restaurar exhibición e información del PDV"
                      : "Expandir última compra"
                  }
                  className={cn(
                    "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
                    "text-[10px] font-bold uppercase tracking-wide transition-colors duration-200",
                    "shadow-sm hover:shadow-md active:scale-[0.98]",
                    expanded
                      ? "border-slate-300/90 bg-white/95 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/90 dark:text-slate-200"
                      : "border-emerald-400/70 bg-emerald-50/95 text-emerald-800 hover:bg-emerald-100/90 dark:border-emerald-600/50 dark:bg-emerald-950/50 dark:text-emerald-200",
                  )}
                >
                  {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="whitespace-nowrap">
                    {expanded ? "Exhibición y PDV" : "Ver remito completo"}
                  </span>
                </button>
              </motion.div>
            ) : null}
          </>
        ) : null}
      </motion.div>
    </LayoutGroup>
  );
}
