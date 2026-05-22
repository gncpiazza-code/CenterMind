"use client";

import type { Objetivo } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { ObjetivoResumen } from "./ObjetivoResumen";
import { ObjetivoProrrateoCalendario } from "./ObjetivoProrrateoCalendario";
import {
  FileDown,
  RefreshCw,
  Rocket,
  MapPin,
  CheckCircle2,
} from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────

function ProgressSection({ obj, visualActual }: { obj: Objetivo; visualActual?: number }) {
  if (!obj.valor_objetivo) return null;

  const actual = Math.max(obj.valor_actual ?? 0, visualActual ?? 0);
  const meta = obj.valor_objetivo;
  const umbral =
    obj.tasa_pendientes != null && obj.tasa_pendientes > 0
      ? Math.max(0, meta - obj.tasa_pendientes)
      : meta;
  const pct = umbral > 0 ? Math.min(100, Math.round((actual / umbral) * 100)) : 0;
  const superado = actual > meta;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--shelfy-muted)]">Progreso</span>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--shelfy-text)] tabular-nums">
            {obj.tipo === "cobranza"
              ? `$${actual.toLocaleString("es-AR")} / $${meta.toLocaleString("es-AR")}`
              : `${Math.round(actual)} / ${Math.round(meta)}`}
          </span>
          <span className="text-xs text-[var(--shelfy-muted)]">({pct}%)</span>
          {superado && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-medium">
              Superó meta
            </span>
          )}
        </div>
      </div>
      <Progress value={pct} className="h-2" />
      {obj.tasa_pendientes != null && (obj.desglose_cache?.pendientes_count ?? 0) > 0 && (
        <p className="text-[10px] text-[var(--shelfy-muted)]">
          Tasa pendientes: {obj.tasa_pendientes} · {obj.desglose_cache!.pendientes_count} pendiente{obj.desglose_cache!.pendientes_count !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

function ItemsSection({ obj }: { obj: Objetivo }) {
  if (!obj.items || obj.items.length === 0) return null;

  const colorDot: Record<string, string> = {
    cumplido:    "bg-emerald-500",
    foto_subida: "bg-yellow-400",
    falla:       "bg-red-500",
    pendiente:   "bg-[var(--shelfy-border)]",
  };

  const labelEstado: Record<string, string> = {
    cumplido:    "Cumplido",
    foto_subida: "Foto subida",
    falla:       "Falla",
    pendiente:   "Pendiente",
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider">
        PDVs ({obj.items.length})
      </p>
      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
        {obj.items.map((it) => {
          const code =
            it.id_cliente_erp ??
            ((it.metadata_ruteo as Record<string, unknown>)?.["id_cliente_erp"] as string | undefined) ??
            null;
          const name =
            ((it.metadata_ruteo as Record<string, unknown>)?.["nombre_fantasia"] as string | undefined)?.trim() ||
            it.nombre_pdv?.trim() ||
            "Cliente sin nombre";

          return (
            <div key={it.id_cliente_pdv} className="flex items-center gap-2 text-xs py-1 border-b border-[var(--shelfy-border)]/40 last:border-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${colorDot[it.estado_item] ?? "bg-slate-300"}`} />
              <MapPin className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
              {code && (
                <span className="text-[10px] text-[var(--shelfy-muted)] font-mono shrink-0">#{code}</span>
              )}
              <span className="flex-1 truncate text-[var(--shelfy-text)]">{name}</span>
              <span className="shrink-0 text-[10px] text-[var(--shelfy-muted)]">
                {labelEstado[it.estado_item] ?? it.estado_item}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccionesSection({
  obj,
  onLanzar,
  onReagendar,
  onDownloadCertificado,
  onOpenRuteoPdf,
  onClose,
}: {
  obj: Objetivo;
  onLanzar?: (obj: Objetivo) => void;
  onReagendar?: (obj: Objetivo) => void;
  onDownloadCertificado?: (obj: Objetivo) => void;
  onOpenRuteoPdf?: (obj: Objetivo) => void;
  onClose: () => void;
}) {
  const actions: React.ReactNode[] = [];

  if (!obj.lanzado_at && !obj.cumplido && onLanzar) {
    actions.push(
      <button
        key="lanzar"
        onClick={() => { onLanzar(obj); onClose(); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-violet-500/30 text-violet-600 hover:bg-violet-500/10 transition-colors"
      >
        <Rocket className="w-3.5 h-3.5" />
        Lanzar ahora
      </button>
    );
  }

  if (obj.resultado_final === "falla" && onReagendar) {
    actions.push(
      <button
        key="reagendar"
        onClick={() => { onReagendar(obj); onClose(); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-orange-500/30 text-orange-500 hover:bg-orange-500/10 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Re-agendar
      </button>
    );
  }

  if (obj.cumplido && onDownloadCertificado) {
    actions.push(
      <button
        key="cert"
        onClick={() => { onDownloadCertificado(obj); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-accent)] hover:border-[var(--shelfy-accent)]/40 transition-colors"
      >
        <FileDown className="w-3.5 h-3.5" />
        Certificado PDF
      </button>
    );
  }

  if (obj.tipo === "ruteo" && onOpenRuteoPdf) {
    actions.push(
      <button
        key="ruteo-pdf"
        onClick={() => { onOpenRuteoPdf(obj); onClose(); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-purple-500/30 text-purple-600 hover:bg-purple-500/10 transition-colors"
      >
        <FileDown className="w-3.5 h-3.5" />
        PDF Ruteo
      </button>
    );
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {actions}
    </div>
  );
}

// ── Modal principal ───────────────────────────────────────────────────────────

interface ObjetivoDetalleModalProps {
  obj: Objetivo | null;
  onClose: () => void;
  onLanzar?: (obj: Objetivo) => void;
  onReagendar?: (obj: Objetivo) => void;
  onDownloadCertificado?: (obj: Objetivo) => void;
  onOpenRuteoPdf?: (obj: Objetivo) => void;
}

export function ObjetivoDetalleModal({
  obj,
  onClose,
  onLanzar,
  onReagendar,
  onDownloadCertificado,
  onOpenRuteoPdf,
}: ObjetivoDetalleModalProps) {
  if (!obj) return null;

  const pendingEvidenceCount =
    (obj.items ?? []).filter((it) => it.estado_item === "foto_subida").length ||
    (obj.tiene_exhibicion_pendiente ? 1 : 0);

  const visualActual =
    obj.tipo === "exhibicion"
      ? (obj.valor_actual ?? 0) + pendingEvidenceCount
      : obj.valor_actual ?? 0;

  const needsCalendar =
    !!obj.valor_objetivo &&
    (obj.origen === "compania"
      ? !!obj.mes_referencia
      : !!obj.fecha_objetivo);

  return (
    <Dialog open={!!obj} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 border-b border-[var(--shelfy-border)] shrink-0">
          <DialogTitle className="text-base font-semibold text-[var(--shelfy-text)] flex items-center gap-2">
            {obj.cumplido && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
            Detalle del objetivo
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-5">
            {/* Resumen estructurado */}
            <ObjetivoResumen obj={obj} />

            {/* Separador */}
            <div className="border-t border-[var(--shelfy-border)]" />

            {/* Progreso */}
            <ProgressSection obj={obj} visualActual={visualActual} />

            {/* Calendario prorrateo */}
            {needsCalendar && (
              <>
                <div className="border-t border-[var(--shelfy-border)]" />
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <ObjetivoProrrateoCalendario obj={obj} visualActual={visualActual} />
                </div>
              </>
            )}

            {/* Lista PDVs / ítems */}
            {obj.items && obj.items.length > 0 && (
              <>
                <div className="border-t border-[var(--shelfy-border)]" />
                <ItemsSection obj={obj} />
              </>
            )}

            {/* Acciones */}
            <div className="border-t border-[var(--shelfy-border)]" />
            <AccionesSection
              obj={obj}
              onLanzar={onLanzar}
              onReagendar={onReagendar}
              onDownloadCertificado={onDownloadCertificado}
              onOpenRuteoPdf={onOpenRuteoPdf}
              onClose={onClose}
            />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
