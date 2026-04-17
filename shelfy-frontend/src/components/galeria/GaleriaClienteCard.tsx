"use client";

import { Images, ShoppingCart, CheckCircle2, XCircle, Flame, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GaleriaClienteCard as GaleriaClienteCardType } from "@/lib/api";

interface Props {
  cliente: GaleriaClienteCardType;
  onClick: () => void;
}

const ESTADO_CONFIG: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  Aprobado:   { label: "Aprobado",   cls: "bg-green-500/90 text-white",       Icon: CheckCircle2 },
  Aprobada:   { label: "Aprobado",   cls: "bg-green-500/90 text-white",       Icon: CheckCircle2 },
  Rechazado:  { label: "Rechazado",  cls: "bg-red-500/90 text-white",         Icon: XCircle },
  Rechazada:  { label: "Rechazada",  cls: "bg-red-500/90 text-white",         Icon: XCircle },
  Destacado:  { label: "Destacado",  cls: "bg-amber-400/95 text-amber-950",   Icon: Flame },
  Destacada:  { label: "Destacada",  cls: "bg-amber-400/95 text-amber-950",   Icon: Flame },
  Pendiente:  { label: "Pendiente",  cls: "bg-slate-600/80 text-white",       Icon: Clock },
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

function DaysChip({ days }: { days: number }) {
  const cls =
    days === 0 ? "text-green-600 font-bold" :
    days <= 7  ? "text-green-600 font-semibold" :
    days <= 30 ? "text-amber-500 font-semibold" :
    "text-red-500 font-bold";
  return <span className={cls}>hace {days}d</span>;
}

export function GaleriaClienteCard({ cliente, onClick }: Props) {
  const cfg = ESTADO_CONFIG[cliente.ultimo_estado ?? ""] ?? ESTADO_CONFIG.Pendiente;
  const { Icon } = cfg;
  const dias = daysSince(cliente.ultima_exhibicion_fecha);
  const diasCompra = daysSince(cliente.fecha_ultima_compra);
  const nombre = (cliente.nombre_fantasia || cliente.nombre_cliente || "").trim() || "Cliente sin nombre";
  const clienteIdLabel = (cliente.id_cliente_erp && String(cliente.id_cliente_erp).trim()) || String(cliente.id_cliente);
  const hasExhib = cliente.total_exhibiciones > 0;
  const isSinReferencia = !!cliente.es_sin_referencia;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-2xl border overflow-hidden transition-all duration-200",
        "hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]",
        "bg-[var(--shelfy-panel)] flex flex-col",
        hasExhib
          ? "border-[var(--shelfy-border)] hover:border-[var(--shelfy-primary)]"
          : "border-dashed border-[var(--shelfy-border)] opacity-75 hover:opacity-100"
      )}
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
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
            <Images size={28} style={{ color: "var(--shelfy-muted)", opacity: 0.4 }} />
            <span className="text-[10px] font-semibold" style={{ color: "var(--shelfy-muted)", opacity: 0.5 }}>
              Sin exhibición
            </span>
          </div>
        )}

        {/* Estado badge — top-right */}
        {cliente.ultimo_estado && hasExhib && (
          <div className={cn(
            "absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm",
            cfg.cls
          )}>
            <Icon size={10} />
            {cfg.label}
          </div>
        )}
        {isSinReferencia && (
          <div className="absolute top-2 left-2 bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300">
            Sin referencia
          </div>
        )}

        {/* Total counter — bottom-left */}
        <div className={cn(
          "absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5",
          hasExhib ? "bg-black/60 backdrop-blur-sm" : "bg-black/30"
        )}>
          <Images size={10} className="text-white/80" />
          <span className="text-white text-[10px] font-bold">{cliente.total_exhibiciones}</span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5">
        <div>
          <p className="text-[10px] font-bold tracking-wide" style={{ color: "var(--shelfy-muted)" }}>
            #{clienteIdLabel}
          </p>
          <p className="text-sm font-bold leading-tight line-clamp-2" style={{ color: "var(--shelfy-text)" }}>
            {nombre}
          </p>
          {cliente.nombre_fantasia && cliente.nombre_cliente !== nombre && (
            <p className="text-xs truncate mt-0.5" style={{ color: "var(--shelfy-muted)" }}>
              {cliente.nombre_cliente}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 text-xs" style={{ color: "var(--shelfy-muted)" }}>
          {/* Exhibición */}
          <span className="flex items-center gap-1 flex-wrap">
            <Images size={11} className="shrink-0" />
            {cliente.ultima_exhibicion_fecha ? (
              <>
                {formatDate(cliente.ultima_exhibicion_fecha)}
                {dias != null && <DaysChip days={dias} />}
              </>
            ) : (
              <span className="italic opacity-60">Sin exhibición</span>
            )}
          </span>
          {/* Compra */}
          <span className="flex items-center gap-1 flex-wrap">
            <ShoppingCart size={11} className="shrink-0" />
            {cliente.fecha_ultima_compra ? (
              <>
                {formatDate(cliente.fecha_ultima_compra)}
                {diasCompra != null && <DaysChip days={diasCompra} />}
              </>
            ) : (
              <span className="italic opacity-60">Sin registro</span>
            )}
          </span>
        </div>
      </div>
    </button>
  );
}
