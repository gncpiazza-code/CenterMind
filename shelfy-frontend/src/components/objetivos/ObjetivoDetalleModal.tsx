"use client";

import { useState, useCallback } from "react";
import type { Objetivo } from "@/lib/api";
import { recalcularObjetivo, fetchObjetivoJob } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ObjetivoResumen } from "./ObjetivoResumen";
import { ObjetivoProrrateoCalendario } from "./ObjetivoProrrateoCalendario";
import {
  FileDown,
  RefreshCw,
  Rocket,
  MapPin,
  CheckCircle2,
  ChevronDown,
  Loader2,
} from "lucide-react";

function ProgressSection({
  obj,
  visualActual,
  compact,
}: {
  obj: Objetivo;
  visualActual?: number;
  compact?: boolean;
}) {
  if (!obj.valor_objetivo) return null;

  const actual = Math.max(obj.valor_actual ?? 0, visualActual ?? 0);
  const meta = obj.valor_objetivo;
  const umbral =
    obj.tasa_pendientes != null && obj.tasa_pendientes > 0
      ? Math.max(0, meta - obj.tasa_pendientes)
      : meta;
  const pct = umbral > 0 ? Math.min(100, Math.round((actual / umbral) * 100)) : 0;
  const superado = actual > meta;

  const valueStr =
    obj.tipo === "cobranza"
      ? `$${actual.toLocaleString("es-AR")} / $${meta.toLocaleString("es-AR")}`
      : `${Math.round(actual)} / ${Math.round(meta)}`;

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="text-[var(--shelfy-muted)] font-medium uppercase tracking-wide">
            Progreso
          </span>
          <div className="flex items-center gap-1.5 tabular-nums">
            <span className="font-semibold text-[var(--shelfy-text)]">{valueStr}</span>
            <span className="text-[var(--shelfy-muted)]">({pct}%)</span>
            {superado && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
                Superó
              </span>
            )}
          </div>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--shelfy-muted)]">Progreso</span>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--shelfy-text)] tabular-nums">{valueStr}</span>
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
          Tasa pendientes: {obj.tasa_pendientes} · {obj.desglose_cache!.pendientes_count}{" "}
          pendiente{obj.desglose_cache!.pendientes_count !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

function ItemsSection({ obj }: { obj: Objetivo }) {
  if (!obj.items || obj.items.length === 0) return null;

  const colorDot: Record<string, string> = {
    cumplido: "bg-emerald-500",
    foto_subida: "bg-yellow-400",
    falla: "bg-red-500",
    pendiente: "bg-[var(--shelfy-border)]",
  };

  const labelEstado: Record<string, string> = {
    cumplido: "Cumplido",
    foto_subida: "Foto subida",
    falla: "Falla",
    pendiente: "Pendiente",
  };

  const cumplidos = obj.items.filter((it) => it.estado_item === "cumplido").length;

  return (
    <details className="group rounded-md border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-[var(--shelfy-text)] hover:bg-[var(--shelfy-bg)]/50 [&::-webkit-details-marker]:hidden">
        <span>Detalle de PDVs ({obj.items.length})</span>
        <span className="flex items-center gap-2 text-[10px] font-normal text-[var(--shelfy-muted)]">
          {cumplidos} cumplidos
          <ChevronDown className="w-3.5 h-3.5 shrink-0 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-[var(--shelfy-border)] px-2 py-1.5 max-h-40 overflow-y-auto">
        {obj.items.map((it) => {
          const code =
            it.id_cliente_erp ??
            ((it.metadata_ruteo as Record<string, unknown>)?.["id_cliente_erp"] as
              | string
              | undefined) ??
            null;
          const name =
            (
              (it.metadata_ruteo as Record<string, unknown>)?.["nombre_fantasia"] as
                | string
                | undefined
            )?.trim() ||
            it.nombre_pdv?.trim() ||
            "Cliente sin nombre";

          return (
            <div
              key={it.id_cliente_pdv}
              className="flex items-center gap-1.5 text-[10px] py-1 border-b border-[var(--shelfy-border)]/30 last:border-0"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${colorDot[it.estado_item] ?? "bg-slate-300"}`}
              />
              <MapPin className="w-2.5 h-2.5 text-[var(--shelfy-muted)] shrink-0" />
              {code && (
                <span className="text-[9px] text-[var(--shelfy-muted)] font-mono shrink-0">
                  #{code}
                </span>
              )}
              <span className="flex-1 truncate text-[var(--shelfy-text)]">{name}</span>
              <span className="shrink-0 text-[var(--shelfy-muted)]">
                {labelEstado[it.estado_item] ?? it.estado_item}
              </span>
            </div>
          );
        })}
      </div>
    </details>
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
        onClick={() => {
          onLanzar(obj);
          onClose();
        }}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-violet-500/30 text-violet-600 hover:bg-violet-500/10 transition-colors"
      >
        <Rocket className="w-3 h-3" />
        Lanzar
      </button>
    );
  }

  if (obj.resultado_final === "falla" && onReagendar) {
    actions.push(
      <button
        key="reagendar"
        onClick={() => {
          onReagendar(obj);
          onClose();
        }}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-orange-500/30 text-orange-500 hover:bg-orange-500/10 transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
        Re-agendar
      </button>
    );
  }

  if (obj.cumplido && onDownloadCertificado) {
    actions.push(
      <button
        key="cert"
        onClick={() => onDownloadCertificado(obj)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-accent)] transition-colors"
      >
        <FileDown className="w-3 h-3" />
        Certificado
      </button>
    );
  }

  if (obj.tipo === "ruteo" && onOpenRuteoPdf) {
    actions.push(
      <button
        key="ruteo-pdf"
        onClick={() => {
          onOpenRuteoPdf(obj);
          onClose();
        }}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-purple-500/30 text-purple-600 hover:bg-purple-500/10 transition-colors"
      >
        <FileDown className="w-3 h-3" />
        PDF Ruteo
      </button>
    );
  }

  if (actions.length === 0) return null;

  return <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[var(--shelfy-border)]">{actions}</div>;
}

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
  const [recalcState, setRecalcState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  const handleRecalcular = useCallback(async () => {
    if (!obj) return;
    setRecalcState('running');
    try {
      const { job_id } = await recalcularObjetivo(obj.id, obj.id_distribuidor);
      // Poll until done
      const poll = async () => {
        const status = await fetchObjetivoJob(job_id, obj.id_distribuidor);
        if (status.estado === 'done') {
          setRecalcState('done');
        } else if (status.estado === 'error') {
          setRecalcState('error');
        } else {
          setTimeout(poll, 2000);
        }
      };
      await poll();
    } catch {
      setRecalcState('error');
    }
  }, [obj]);

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
    (obj.origen === "compania" ? !!obj.mes_referencia : !!obj.fecha_objetivo);

  const hasItems = !!(obj.items && obj.items.length > 0);

  const isRetroCompania =
    obj.origen === "compania" &&
    (obj.tipo === "exhibicion" || obj.tipo === "compradores");

  return (
    <Dialog open={!!obj} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl w-[calc(100%-1.5rem)] max-h-[min(90vh,720px)] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-[var(--shelfy-border)] shrink-0">
          <DialogTitle className="text-sm font-semibold text-[var(--shelfy-text)] flex items-center gap-2">
            {obj.cumplido && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
            Detalle del objetivo
          </DialogTitle>
        </DialogHeader>

        {/* Cabecera fija compacta */}
        <div className="shrink-0 px-4 py-2.5 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] space-y-2">
          <ObjetivoResumen obj={obj} compact />
          {isRetroCompania && (
            <p className="text-xs text-zinc-400">Período: desde el 1° del mes</p>
          )}
          <ProgressSection obj={obj} visualActual={visualActual} compact />
        </div>

        {/* Cuerpo con scroll: calendario + PDVs + acciones */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
          <div className="space-y-3">
            {/* Alteo con venta: dual métricas */}
            {obj.tipo === "ruteo_alteo" && obj.alteo_con_venta && obj.desglose_cache && (
              <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 space-y-1">
                <p className="text-xs font-semibold text-violet-700">Alteo con venta requerida</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-[10px] text-[var(--shelfy-muted)]">Altas totales</div>
                    <div className="font-bold text-violet-700">{obj.desglose_cache.alteos_totales ?? obj.valor_actual ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--shelfy-muted)]">Con venta</div>
                    <div className="font-bold text-emerald-600">{obj.desglose_cache.alteos_con_venta ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--shelfy-muted)]">Sin venta aún</div>
                    <div className="font-bold text-amber-600">{obj.desglose_cache.alteos_sin_venta ?? "—"}</div>
                  </div>
                </div>
                <p className="text-[10px] text-[var(--shelfy-muted)]">Meta: {Math.round(obj.valor_objetivo ?? 0)} PDVs con primera venta</p>
              </div>
            )}

            {/* Exhibición con PDVs distintos: dual métricas */}
            {obj.tipo === "exhibicion" && obj.min_pdvs_distintos && obj.desglose_cache && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-1">
                <p className="text-xs font-semibold text-emerald-700">Meta doble: exhibiciones + PDVs distintos</p>
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div>
                    <div className="text-[10px] text-[var(--shelfy-muted)]">Exhibiciones aprobadas</div>
                    <div className="font-bold text-emerald-700">{Math.round(obj.valor_actual ?? 0)} / {Math.round(obj.valor_objetivo ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--shelfy-muted)]">PDVs distintos</div>
                    <div className={`font-bold ${(obj.desglose_cache.pdvs_distintos_count ?? 0) >= obj.min_pdvs_distintos ? "text-emerald-600" : "text-amber-600"}`}>
                      {obj.desglose_cache.pdvs_distintos_count ?? "—"} / {obj.min_pdvs_distintos}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-[var(--shelfy-muted)]">Cumplido cuando se alcanzan AMBAS metas simultáneamente.</p>
              </div>
            )}

            {needsCalendar && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
                <ObjetivoProrrateoCalendario obj={obj} visualActual={visualActual} compact />
              </div>
            )}

            {hasItems && <ItemsSection obj={obj} />}

            <AccionesSection
              obj={obj}
              onLanzar={onLanzar}
              onReagendar={onReagendar}
              onDownloadCertificado={onDownloadCertificado}
              onOpenRuteoPdf={onOpenRuteoPdf}
              onClose={onClose}
            />

            {/* Botón Recalcular avance */}
            <div className="flex items-center justify-end pt-1">
              <button
                onClick={() => { void handleRecalcular(); }}
                disabled={recalcState === 'running'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-accent)] hover:border-[var(--shelfy-accent)]/40 transition-colors disabled:opacity-50"
              >
                {recalcState === 'running' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                {recalcState === 'running'
                  ? 'Recalculando…'
                  : recalcState === 'done'
                    ? 'Recalculado'
                    : recalcState === 'error'
                      ? 'Error al recalcular'
                      : 'Recalcular avance'}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
