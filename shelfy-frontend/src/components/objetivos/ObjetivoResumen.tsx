"use client";

import type { Objetivo, ObjetivoTipo } from "@/lib/api";
import { isTelegramObjectiveMessage } from "@/lib/objetivo-utils";
import { Crown, User } from "lucide-react";

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

export function ObjetivoResumen({
  obj,
  compact = false,
}: {
  obj: Objetivo;
  compact?: boolean;
}) {
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

  const descripcionVisible =
    obj.descripcion && !isTelegramObjectiveMessage(obj.descripcion)
      ? obj.descripcion
      : null;

  const metaLabel =
    obj.valor_objetivo != null
      ? obj.tipo === "cobranza"
        ? `$${obj.valor_objetivo.toLocaleString("es-AR")}`
        : String(Math.round(obj.valor_objetivo))
      : null;

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${cfg.bg} ${cfg.color}`}
          >
            {cfg.label}
          </span>
          {isCompania && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-600">
              <Crown className="w-3 h-3" />
              Compañía
            </span>
          )}
          {obj.cumplido && obj.resultado_final === "exito" && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
              Cumplido
            </span>
          )}
          {obj.cumplido && obj.resultado_final === "falla" && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 border border-red-500/20 text-red-600">
              No cumplido
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--shelfy-text)] ml-0.5">
            <User className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
            {obj.nombre_vendedor ?? `ID ${obj.id_vendedor}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--shelfy-muted)]">
          {metaLabel != null && (
            <span>
              Meta <span className="font-semibold text-[var(--shelfy-text)]">{metaLabel}</span>
            </span>
          )}
          {isCompania && mesRefLabel && (
            <>
              <span className="text-[var(--shelfy-border)]">·</span>
              <span>{mesRefLabel}</span>
            </>
          )}
          {obj.fecha_inicio && (
            <>
              <span className="text-[var(--shelfy-border)]">·</span>
              <span className="text-blue-600">
                Inicio {formatDate(obj.fecha_inicio)}
              </span>
            </>
          )}
          {obj.fecha_objetivo && (
            <>
              <span className="text-[var(--shelfy-border)]">·</span>
              <span
                className={
                  dias !== null && dias <= 0
                    ? "text-red-600"
                    : dias !== null && dias <= 3
                      ? "text-orange-600"
                      : "text-orange-600/90"
                }
              >
                Vence {formatDate(obj.fecha_objetivo)}
                {dias !== null && (
                  <span className="font-normal">
                    {dias < 0
                      ? ` (hace ${Math.abs(dias)}d)`
                      : dias === 0
                        ? " (hoy)"
                        : ` (${dias}d)`}
                  </span>
                )}
              </span>
            </>
          )}
        </div>

        {instruccion && (
          <p className="text-[10px] text-[var(--shelfy-muted)] leading-snug">{instruccion}</p>
        )}
        {descripcionVisible && (
          <p className="text-[10px] text-[var(--shelfy-muted)] leading-snug line-clamp-2">
            {descripcionVisible}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
        {obj.cumplido && obj.resultado_final === "exito" && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
            Cumplido
          </span>
        )}
        {obj.cumplido && obj.resultado_final === "falla" && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-600">
            No cumplido
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-[var(--shelfy-text)]">
        <User className="w-4 h-4 text-[var(--shelfy-muted)] shrink-0" />
        <span className="font-medium">{obj.nombre_vendedor ?? `Vendedor ID ${obj.id_vendedor}`}</span>
      </div>

      {obj.nombre_pdv && (
        <p className="text-xs text-[var(--shelfy-text)] pl-6">{obj.nombre_pdv}</p>
      )}

      {metaLabel != null && (
        <p className="text-sm text-[var(--shelfy-muted)]">
          Meta: <span className="font-semibold text-[var(--shelfy-text)]">{metaLabel}</span>
        </p>
      )}

      {isCompania && mesRefLabel && (
        <p className="text-sm text-[var(--shelfy-muted)]">
          Mes de referencia:{" "}
          <span className="font-medium text-[var(--shelfy-text)]">{mesRefLabel}</span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {obj.fecha_inicio && (
          <div className="px-2 py-1 rounded border bg-blue-500/5 border-blue-500/20 text-[10px]">
            <span className="text-blue-600/70 uppercase font-semibold">Inicio </span>
            <span className="font-medium text-blue-700">{formatDate(obj.fecha_inicio)}</span>
          </div>
        )}
        {obj.fecha_objetivo && (
          <div className="px-2 py-1 rounded border bg-orange-500/5 border-orange-500/20 text-[10px]">
            <span className="text-orange-600/70 uppercase font-semibold">Vence </span>
            <span className="font-medium text-orange-700">
              {formatDate(obj.fecha_objetivo)}
              {dias !== null &&
                (dias < 0 ? ` (${Math.abs(dias)}d vencido)` : dias === 0 ? " (hoy)" : ` (${dias}d)`)}
            </span>
          </div>
        )}
      </div>

      {instruccion && (
        <p className="text-xs text-[var(--shelfy-muted)] leading-snug border-l-2 border-[var(--shelfy-border)] pl-2">
          {instruccion}
        </p>
      )}
      {descripcionVisible && (
        <p className="text-xs text-[var(--shelfy-muted)] leading-relaxed">{descripcionVisible}</p>
      )}
    </div>
  );
}
