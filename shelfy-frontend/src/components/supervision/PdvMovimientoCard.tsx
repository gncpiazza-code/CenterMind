"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Star, ChevronDown, ChevronUp } from "lucide-react";
import type { PdvsMovimientoItem } from "@/lib/api";

interface PdvMovimientoCardProps {
  item: PdvsMovimientoItem;
  index: number;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PdvMovimientoCard({ item, index }: PdvMovimientoCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isAlta = item.categoria === "alta";
  const delay = Math.min(index * 0.04, 0.4);

  const infoLine = [item.localidad, item.direccion].filter(Boolean).join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
    >
      <div
        className="px-4 py-3 flex items-start gap-3 hover:bg-black/[0.02] transition-colors cursor-pointer border-b border-[var(--shelfy-border)]/30 last:border-0"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Categoria badge */}
        <span
          className={`mt-0.5 shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border select-none ${
            isAlta
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600"
              : "bg-violet-500/15 border-violet-500/30 text-violet-600"
          }`}
        >
          {isAlta ? "Alta" : "Comp."}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Línea 1: código ERP + nombre */}
          <div className="flex items-baseline gap-1.5 flex-wrap">
            {item.id_cliente_erp && (
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                #{item.id_cliente_erp}
              </span>
            )}
            <p className="text-xs font-bold text-[var(--shelfy-text)] leading-tight">
              {item.nombre || "—"}
            </p>
          </div>

          {/* Línea 2: razón social */}
          {item.razon_social && item.razon_social !== item.nombre && (
            <p className="text-[10px] text-[var(--shelfy-muted)] truncate leading-tight mt-0.5">
              {item.razon_social}
            </p>
          )}

          {/* Línea 3: localidad + dirección (siempre visible) */}
          {infoLine && (
            <p className="text-[10px] text-[var(--shelfy-muted)] truncate mt-0.5">
              {infoLine}
            </p>
          )}

          {/* Línea 4: fecha evento (siempre visible) */}
          {item.fecha_evento && (
            <p className="text-[10px] text-[var(--shelfy-muted)] mt-0.5">
              <span className="font-medium">{isAlta ? "Alta:" : "Compra:"}</span>{" "}
              {fmtDate(item.fecha_evento)}
            </p>
          )}

          {/* Expanded: info extra si hubiera */}
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="mt-1.5 pt-1.5 border-t border-[var(--shelfy-border)]/30 flex flex-wrap gap-x-3 gap-y-0.5"
            >
              {item.exhibido && (
                <span className="text-[10px] text-violet-500 font-semibold flex items-center gap-0.5">
                  <Star size={9} className="fill-violet-500" />
                  Exhibido este mes
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                Categoría: <span className="font-medium">{isAlta ? "Alta de padrón" : "Comprador activo"}</span>
              </span>
            </motion.div>
          )}
        </div>

        {/* Right-side indicators */}
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {item.exhibido && !expanded && (
            <Star size={11} className="text-violet-500 fill-violet-500" />
          )}
          {expanded ? (
            <ChevronUp size={12} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={12} className="text-muted-foreground" />
          )}
        </div>
      </div>
    </motion.div>
  );
}
