"use client";

import type { Objetivo, ObjetivoTipo } from "@/lib/api";
import { isTelegramObjectiveMessage } from "@/lib/objetivo-utils";
import { Crown, Calendar, User, Target, MapPin } from "lucide-react";

// ── config (espejo de page.tsx para evitar prop drilling) ─────────────────────

const TIPO_CONFIG: Record<ObjetivoTipo, { label: string; color: string; bg: string }> = {
  conversion_estado: { label: "Activación",             color: "text-blue-500",    bg: "bg-blue-500/10 border-blue-500/20" },
  cobranza:          { label: "Cobranza",               color: "text-orange-500",  bg: "bg-orange-500/10 border-orange-500/20" },
  ruteo_alteo:       { label: "Alteo",                  color: "text-violet-600",  bg: "bg-violet-500/10 border-violet-500/20" },
  exhibicion:        { label: "Exhibición",             color: "text-emerald-600", bg: "bg-emerald-500/10 border-emerald-500/20" },
  ruteo:             { label: "Guía de cambio de ruta", color: "text-purple-600",  bg: "bg-purple-500/10 border-purple-500/20" },
  compradores:       { label: "Compradores",            color: "text-teal-600",    bg: "bg-teal-500/10 border-teal-500/20" },
};

const INSTRUCCION_TIPO: Partial<Record<ObjetivoTipo, string>> = {
  exhibicion:        "Registrar foto de exhibición en el PDV.",
  conversion_estado: "Reactivar PDVs inactivos — lograr que vuelvan a comprar.",
  ruteo_alteo:       "Dar de alta PDVs nuevos en la ruta (altas de padrón, sin compra previa).",
  cobranza:          "Cobrar el monto objetivo dentro del período.",
  compradores:       "Registrar ventas a N clientes distintos en el período.",
};

const MESES_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function formatDate(d: string | null | undefined): string | null {
  if (!d) return null;
  try {
    const [y, m, day] = d.slice(0, 10).split("-");
    return `${day}/${m}/${y}`;
  } catch {
    return d;
  }
}

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const diff = new Date(d.slice(0, 10) + "T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86400000);
}

// ── componente ────────────────────────────────────────────────────────────────

export function ObjetivoResumen({ obj }: { obj: Objetivo }) {
  const cfg = TIPO_CONFIG[obj.tipo] ?? {
    label: obj.tipo,
    color: "text-slate-500",
    bg: "bg-slate-500/10 border-slate-500/20",
  };

  const isCompania = obj.origen === "compania";
  const dias = daysUntil(obj.fecha_objetivo);
  const instruccion = INSTRUCCION_TIPO[obj.tipo];

  const mesRefLabel = (() => {
    if (!obj.mes_referencia) return null;
    const [y, m] = obj.mes_referencia.split("-").map(Number);
    if (!y || !m) return obj.mes_referencia;
    return `${MESES_ES[m - 1]} ${y}`;
  })();

  // Descripción: si es payload Telegram crudo, no renderizar
  const descripcionVisible =
    obj.descripcion && !isTelegramObjectiveMessage(obj.descripcion)
      ? obj.descripcion
      : null;

  return (
    <div className="space-y-3">
      {/* Badges tipo + origen */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
        {isCompania && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-600">
            <Crown className="w-3.5 h-3.5" />
            Compañía
          </span>
        )}
        {obj.cumplido && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
            Cumplido
          </span>
        )}
      </div>

      {/* Vendedor */}
      <div className="flex items-center gap-2 text-sm text-[var(--shelfy-text)]">
        <User className="w-4 h-4 text-[var(--shelfy-muted)] shrink-0" />
        <span className="font-medium">{obj.nombre_vendedor ?? `Vendedor ID ${obj.id_vendedor}`}</span>
      </div>

      {/* PDV si aplica */}
      {obj.nombre_pdv && (
        <div className="flex items-center gap-2 text-sm text-[var(--shelfy-text)]">
          <MapPin className="w-4 h-4 text-[var(--shelfy-muted)] shrink-0" />
          {obj.id_cliente_erp && (
            <span className="text-xs text-[var(--shelfy-muted)] font-mono shrink-0">#{obj.id_cliente_erp}</span>
          )}
          <span>{obj.nombre_pdv}</span>
        </div>
      )}

      {/* Meta */}
      {obj.valor_objetivo != null && (
        <div className="flex items-center gap-2 text-sm">
          <Target className="w-4 h-4 text-[var(--shelfy-muted)] shrink-0" />
          <span className="text-[var(--shelfy-muted)]">Meta:</span>
          <span className="font-semibold text-[var(--shelfy-text)]">
            {obj.tipo === "cobranza"
              ? `$${obj.valor_objetivo.toLocaleString("es-AR")}`
              : Math.round(obj.valor_objetivo)}
          </span>
          {obj.tipo === "cobranza" && obj.valor_actual > 0 && (
            <span className="text-emerald-600 text-xs">
              · Cobrado: ${obj.valor_actual.toLocaleString("es-AR")}
            </span>
          )}
        </div>
      )}

      {/* Mes referencia (compañía) */}
      {isCompania && mesRefLabel && (
        <div className="flex items-center gap-2 text-sm text-[var(--shelfy-muted)]">
          <Calendar className="w-4 h-4 shrink-0" />
          <span>Mes de referencia: <span className="font-medium text-[var(--shelfy-text)]">{mesRefLabel}</span></span>
        </div>
      )}

      {/* Fechas */}
      <div className="flex flex-wrap gap-3">
        {obj.fecha_inicio && (
          <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded border bg-blue-500/5 border-blue-500/20">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-blue-600/70">Inicio</span>
            <span className="text-xs font-medium text-blue-700">{formatDate(obj.fecha_inicio)}</span>
          </div>
        )}
        {obj.fecha_objetivo && (
          <div className={`flex flex-col gap-0.5 px-2.5 py-1.5 rounded border ${
            dias !== null && dias <= 0
              ? "bg-red-500/5 border-red-500/20"
              : dias !== null && dias <= 3
              ? "bg-orange-500/5 border-orange-500/20"
              : "bg-orange-500/5 border-orange-500/20"
          }`}>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-orange-600/70">Vencimiento</span>
            <span className="text-xs font-medium text-orange-700">
              {formatDate(obj.fecha_objetivo)}
              {dias !== null && (
                <span className="ml-1 text-[10px] font-normal">
                  {dias < 0 ? `(vencido hace ${Math.abs(dias)}d)` : dias === 0 ? "(vence hoy)" : `(${dias}d)`}
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Instrucción por tipo */}
      {instruccion && (
        <p className="text-xs text-[var(--shelfy-muted)] leading-snug border-l-2 border-[var(--shelfy-border)] pl-3">
          {instruccion}
        </p>
      )}

      {/* Descripción libre (no Telegram) */}
      {descripcionVisible && (
        <p className="text-xs text-[var(--shelfy-muted)] leading-relaxed">{descripcionVisible}</p>
      )}
    </div>
  );
}
