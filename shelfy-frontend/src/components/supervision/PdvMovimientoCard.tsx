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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
    >
      <div
        className="px-4 py-2.5 flex items-start gap-3 hover:bg-white/5 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Categoria badge */}
        <span
          className={`mt-0.5 shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border select-none ${
            isAlta
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600"
              : "bg-blue-500/15 border-blue-500/30 text-blue-600"
          }`}
        >
          {isAlta ? "Alta" : "Activ."}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {item.id_cliente_erp && (
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                #{item.id_cliente_erp}
              </span>
            )}
            <p className="text-xs font-semibold text-[var(--shelfy-text)] truncate">
              {item.nombre || "—"}
            </p>
          </div>

          {item.razon_social && (
            <p className="text-[10px] text-[var(--shelfy-muted)] truncate">{item.razon_social}</p>
          )}

          {!expanded && (
            <p className="text-[10px] text-[var(--shelfy-muted)] truncate">
              {[item.localidad, item.direccion].filter(Boolean).join(" · ") || "—"}
            </p>
          )}

          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-1 flex flex-col gap-0.5"
            >
              {item.localidad && (
                <p className="text-[10px] text-[var(--shelfy-muted)]">{item.localidad}</p>
              )}
              {item.direccion && (
                <p className="text-[10px] text-[var(--shelfy-muted)]">{item.direccion}</p>
              )}
              {item.fecha_evento && (
                <p className="text-[10px] text-[var(--shelfy-muted)]">
                  {isAlta ? "Alta:" : "Evento:"} {fmtDate(item.fecha_evento)}
                </p>
              )}
            </motion.div>
          )}
        </div>

        {/* Right-side indicators */}
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {item.exhibido && (
            <Star size={12} className="text-violet-500 fill-violet-500" />
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
