"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Flame, Clock, ExternalLink, Loader2, Images } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { fetchGaleriaTimelineCliente, type GaleriaTimelineItem } from "@/lib/api";

interface Props {
  idClientePdv: number | null;
  distId: number;
  nombreCliente: string;
  open: boolean;
  onClose: () => void;
}

const ESTADO_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  Aprobada:  { icon: CheckCircle2, color: "text-green-700", bg: "bg-green-50",  border: "border-green-200" },
  Rechazada: { icon: XCircle,      color: "text-red-700",   bg: "bg-red-50",    border: "border-red-200" },
  Destacada: { icon: Flame,        color: "text-amber-700", bg: "bg-amber-50",  border: "border-amber-200" },
  Pendiente: { icon: Clock,        color: "text-slate-600", bg: "bg-slate-50",  border: "border-slate-200" },
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function TimelineItem({ item, index, total }: { item: GaleriaTimelineItem; index: number; total: number }) {
  const cfg = ESTADO_CONFIG[item.estado] ?? ESTADO_CONFIG.Pendiente;
  const Icon = cfg.icon;
  const isLast = index === total - 1;

  return (
    <div className="flex gap-3">
      {/* Línea temporal */}
      <div className="flex flex-col items-center shrink-0">
        <div className={cn("size-8 rounded-full flex items-center justify-center border-2 shrink-0", cfg.bg, cfg.border)}>
          <Icon size={14} className={cfg.color} />
        </div>
        {!isLast && <div className="w-0.5 flex-1 mt-1" style={{ background: "var(--shelfy-border)" }} />}
      </div>

      {/* Contenido */}
      <div className={cn("flex-1 rounded-2xl border overflow-hidden mb-4", cfg.border)} style={{ background: "var(--shelfy-panel)" }}>
        {/* Foto */}
        {item.url_foto && (
          <div className="relative h-40 bg-slate-100 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url_foto}
              alt={`Exhibición #${item.id_exhibicion}`}
              className="w-full h-full object-cover"
            />
            <a
              href={item.url_foto}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-full hover:bg-black/80 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={10} />
              Ver original
            </a>
          </div>
        )}

        {/* Meta */}
        <div className="p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Badge className={cn("text-[10px] font-bold px-2 border", cfg.bg, cfg.color, cfg.border)}>
              {item.estado}
            </Badge>
            {item.tipo_pdv && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--shelfy-border)", color: "var(--shelfy-muted)" }}>
                {item.tipo_pdv}
              </span>
            )}
            <span className="text-xs ml-auto" style={{ color: "var(--shelfy-muted)" }}>
              #{item.id_exhibicion}
            </span>
          </div>

          <p className="text-xs font-semibold" style={{ color: "var(--shelfy-text)" }}>
            {formatDateTime(item.timestamp_subida)}
          </p>

          {item.fecha_evaluacion && (
            <p className="text-[11px]" style={{ color: "var(--shelfy-muted)" }}>
              Evaluado: {formatDateTime(item.fecha_evaluacion)}
              {item.supervisor && <span> · {item.supervisor}</span>}
            </p>
          )}

          {item.comentario && (
            <p className="text-[11px] italic rounded-lg px-2 py-1.5" style={{ background: "var(--shelfy-border)", color: "var(--shelfy-text)" }}>
              "{item.comentario}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExhibicionesTimelineDialog({ idClientePdv, distId, nombreCliente, open, onClose }: Props) {
  const { data: timeline = [], isLoading } = useQuery<GaleriaTimelineItem[]>({
    queryKey: ["galeria-timeline", distId, idClientePdv],
    queryFn: () => fetchGaleriaTimelineCliente(idClientePdv!, distId),
    enabled: open && idClientePdv != null,
    staleTime: 30_000,
  });

  // Stats from timeline
  const stats = {
    total: timeline.length,
    aprobadas: timeline.filter((t) => t.estado === "Aprobada").length,
    rechazadas: timeline.filter((t) => t.estado === "Rechazada").length,
    destacadas: timeline.filter((t) => t.estado === "Destacada").length,
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0" style={{ borderColor: "var(--shelfy-border)" }}>
          <DialogTitle className="font-black text-base" style={{ color: "var(--shelfy-text)" }}>
            {nombreCliente}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <Badge variant="outline" className="text-[10px]">{stats.total} exhibiciones</Badge>
              {stats.aprobadas > 0 && <Badge className="text-[10px] bg-green-100 text-green-700 border border-green-200">{stats.aprobadas} aprobadas</Badge>}
              {stats.destacadas > 0 && <Badge className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200">{stats.destacadas} destacadas</Badge>}
              {stats.rechazadas > 0 && <Badge className="text-[10px] bg-red-100 text-red-700 border border-red-200">{stats.rechazadas} rechazadas</Badge>}
            </div>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 rounded-full shrink-0" />
                  <Skeleton className="flex-1 h-48 rounded-2xl" />
                </div>
              ))}
            </div>
          ) : timeline.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Images size={40} style={{ color: "var(--shelfy-muted)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--shelfy-muted)" }}>
                Sin exhibiciones registradas
              </p>
            </div>
          ) : (
            <div className="pt-2">
              {timeline.map((item, idx) => (
                <TimelineItem key={item.id_exhibicion} item={item} index={idx} total={timeline.length} />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
