"use client";

import { VISOR_LAYOUT_TRANSITION } from "@/components/visor/visor-layout-motion";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

/** Oculta bloques al expandir remito con altura + opacidad animadas */
export function VisorPanelCollapse({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="open"
          layout
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={VISOR_LAYOUT_TRANSITION}
          className="overflow-hidden min-h-0"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
