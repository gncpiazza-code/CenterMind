"use client";

import { Images, ShoppingCart, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GaleriaClienteCard as GaleriaClienteCardType } from "@/lib/api";

interface Props {
  cliente: GaleriaClienteCardType;
  onClick: () => void;
}

const ESTADO_COLOR: Record<string, string> = {
  Aprobada: "bg-green-100 text-green-700 border-green-200",
  Rechazada: "bg-red-100 text-red-700 border-red-200",
  Destacada: "bg-amber-100 text-amber-700 border-amber-200",
  Pendiente: "bg-slate-100 text-slate-600 border-slate-200",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  try {
    const diff = Date.now() - new Date(iso).getTime();
    return Math.floor(diff / 86_400_000);
  } catch {
    return null;
  }
}

export function GaleriaClienteCard({ cliente, onClick }: Props) {
  const estadoClass = ESTADO_COLOR[cliente.ultimo_estado ?? ""] ?? ESTADO_COLOR.Pendiente;
  const dias = daysSince(cliente.ultima_exhibicion_fecha);
  const nombre = cliente.nombre_fantasia || cliente.nombre_cliente;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-2xl border overflow-hidden transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5 hover:border-[var(--shelfy-primary)]",
        "bg-[var(--shelfy-panel)] flex flex-col"
      )}
      style={{ borderColor: "var(--shelfy-border)" }}
    >
      {/* Thumbnail */}
      <div className="relative h-32 bg-slate-100 overflow-hidden">
        {cliente.ultima_exhibicion_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cliente.ultima_exhibicion_url}
            alt={nombre}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Images size={32} style={{ color: "var(--shelfy-muted)" }} />
          </div>
        )}

        {/* Estado badge */}
        {cliente.ultimo_estado && (
          <div className={cn("absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full border", estadoClass)}>
            {cliente.ultimo_estado}
          </div>
        )}

        {/* Counter */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5">
          <Images size={10} className="text-white" />
          <span className="text-white text-[10px] font-bold">{cliente.total_exhibiciones}</span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5">
        <div>
          {cliente.id_cliente_erp && (
            <p className="text-[10px] font-semibold" style={{ color: "var(--shelfy-muted)" }}>
              #{cliente.id_cliente_erp}
            </p>
          )}
          <p className="text-sm font-bold leading-tight line-clamp-2" style={{ color: "var(--shelfy-text)" }}>
            {nombre}
          </p>
          {cliente.nombre_fantasia && (
            <p className="text-xs truncate" style={{ color: "var(--shelfy-muted)" }}>
              {cliente.nombre_cliente}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 text-xs" style={{ color: "var(--shelfy-muted)" }}>
          {cliente.ultima_exhibicion_fecha && (
            <span className="flex items-center gap-1">
              <Images size={11} />
              {formatDate(cliente.ultima_exhibicion_fecha)}
              {dias != null && (
                <span className={cn("font-semibold ml-1", dias > 30 ? "text-red-500" : dias > 14 ? "text-amber-500" : "text-green-600")}>
                  (hace {dias}d)
                </span>
              )}
            </span>
          )}
          {cliente.fecha_ultima_compra && (
            <span className="flex items-center gap-1">
              <ShoppingCart size={11} />
              Compra: {formatDate(cliente.fecha_ultima_compra)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
