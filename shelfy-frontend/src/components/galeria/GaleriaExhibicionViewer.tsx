"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight, RotateCcw, Loader2, Images } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  fetchGaleriaTimelineCliente,
  fetchGaleriaVecino,
  type GaleriaVecinoResponse,
} from "@/lib/api";
import {
  groupTimelinePublicaciones,
  type GaleriaPublicacion,
} from "@/lib/galeria-publicaciones";
import { GaleriaPublicationCarousel } from "./GaleriaPublicationCarousel";
import { ReevaluarCompaniaSheet } from "./ReevaluarCompaniaSheet";

export interface GaleriaExhibicionViewerProps {
  open: boolean;
  onClose: () => void;
  idCliente: number | null;
  nombreCliente: string;
  distId: number;
  idVendedor?: number | null;
  canReevaluarCompania?: boolean;
  /** Coordenadas actuales para navegación vecino */
  lat?: number | null;
  lng?: number | null;
  /** Fechas de filtro */
  fechaDesde?: string;
  fechaHasta?: string;
  filtroEstado?: string;
}

const ESTADO_COLOR: Record<string, string> = {
  Aprobada: "bg-green-100 text-green-700 border-green-200",
  Aprobado: "bg-green-100 text-green-700 border-green-200",
  Rechazada: "bg-red-100 text-red-700 border-red-200",
  Rechazado: "bg-red-100 text-red-700 border-red-200",
  Destacada: "bg-amber-100 text-amber-700 border-amber-200",
  Destacado: "bg-amber-100 text-amber-700 border-amber-200",
  Pendiente: "bg-slate-100 text-slate-600 border-slate-200",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function GaleriaExhibicionViewer({
  open,
  onClose,
  idCliente: initialIdCliente,
  nombreCliente: initialNombreCliente,
  distId,
  idVendedor,
  canReevaluarCompania = false,
  lat: initialLat,
  lng: initialLng,
  fechaDesde,
  fechaHasta,
  filtroEstado,
}: GaleriaExhibicionViewerProps) {
  // Estado interno para navegación vecino
  const [idCliente, setIdCliente] = useState<number | null>(initialIdCliente);
  const [nombreCliente, setNombreCliente] = useState(initialNombreCliente);
  const [lat, setLat] = useState<number | null>(initialLat ?? null);
  const [lng, setLng] = useState<number | null>(initialLng ?? null);

  // Current pub + foto para el panel derecho
  const [currentPub, setCurrentPub] = useState<GaleriaPublicacion | null>(null);
  const [currentPubIdx, setCurrentPubIdx] = useState(0);
  const [reevalOpen, setReevalOpen] = useState(false);

  // Navegación vecino
  const [isLoadingVecino, setIsLoadingVecino] = useState(false);

  // Sincronizar props cuando cambia desde afuera
  useEffect(() => {
    setIdCliente(initialIdCliente);
    setNombreCliente(initialNombreCliente);
    setLat(initialLat ?? null);
    setLng(initialLng ?? null);
    setCurrentPub(null);
    setCurrentPubIdx(0);
  }, [initialIdCliente, initialNombreCliente, initialLat, initialLng]);

  // Fetch publicaciones del cliente
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "galeria-viewer-timeline",
      distId,
      idCliente,
      idVendedor ?? "all",
      fechaDesde ?? "",
      fechaHasta ?? "",
    ],
    queryFn: () =>
      fetchGaleriaTimelineCliente(idCliente!, distId, {
        idVendedor,
        desde: fechaDesde,
        hasta: fechaHasta,
      }),
    enabled: open && idCliente != null,
    staleTime: 30_000,
  });

  const publicaciones: GaleriaPublicacion[] = data
    ? groupTimelinePublicaciones(data.items)
    : [];

  // Cuando cargan publicaciones, inicializar publicación actual (la más reciente)
  useEffect(() => {
    if (publicaciones.length > 0 && !currentPub) {
      const lastIdx = publicaciones.length - 1;
      setCurrentPub(publicaciones[lastIdx]);
      setCurrentPubIdx(lastIdx);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicaciones.length]);

  const handlePublicacionChange = (idx: number, pub: GaleriaPublicacion) => {
    setCurrentPub(pub);
    setCurrentPubIdx(idx);
  };

  const handleLoadVecino = async (vecino: GaleriaVecinoResponse) => {
    setIdCliente(vecino.id_cliente);
    setNombreCliente(vecino.nombre_cliente);
    setLat(vecino.latitud);
    setLng(vecino.longitud);
    setCurrentPub(null);
    setCurrentPubIdx(0);
  };

  const handleNavVecino = async (direction: "prev" | "next") => {
    if (!idVendedor || !lat || !lng || isLoadingVecino) return;
    setIsLoadingVecino(true);
    try {
      const vecino = await fetchGaleriaVecino(idVendedor, {
        distId,
        fromCliente: idCliente!,
        lat,
        lng,
        desde: fechaDesde,
        hasta: fechaHasta,
        estado: filtroEstado || undefined,
      });
      // direction es informativo — el backend retorna el vecino más cercano
      // En una implementación completa se pasaría prev/next, por ahora solo next
      void direction;
      await handleLoadVecino(vecino);
    } catch {
      // silencioso si no hay vecino
    } finally {
      setIsLoadingVecino(false);
    }
  };

  // Panel derecho — info del cliente
  const activeFoto = currentPub
    ? currentPub.fotos[0]
    : null;

  const needsReevaluar =
    canReevaluarCompania &&
    activeFoto &&
    activeFoto.estado !== "Pendiente";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-[100vw] h-[100dvh] p-0 gap-0 border-0 rounded-none bg-black"
        aria-describedby={undefined}
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2">
            {/* Navegación vecino — anterior */}
            {idVendedor && lat && lng && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-white/80 hover:text-white hover:bg-white/15 rounded-full"
                onClick={() => handleNavVecino("prev")}
                disabled={isLoadingVecino}
                title="PDV anterior"
              >
                <ChevronLeft size={18} />
              </Button>
            )}
            <div className="flex flex-col">
              <p className="text-white font-bold text-sm leading-tight line-clamp-1">
                {nombreCliente}
              </p>
              {currentPub && (
                <p className="text-white/60 text-[10px]">{formatDate(currentPub.dia_ar)}</p>
              )}
            </div>
            {/* Navegación vecino — siguiente */}
            {idVendedor && lat && lng && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-white/80 hover:text-white hover:bg-white/15 rounded-full"
                onClick={() => handleNavVecino("next")}
                disabled={isLoadingVecino}
                title="PDV siguiente"
              >
                {isLoadingVecino ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ChevronRight size={18} />
                )}
              </Button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/70 flex items-center justify-center transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Layout principal */}
        <div className="flex w-full h-full">
          {/* Carrusel — principal */}
          <div className="flex-1 min-w-0 h-full relative">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <Loader2 size={32} className="text-white/60 animate-spin" />
                <p className="text-white/50 text-sm">Cargando exhibiciones...</p>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
                <Images size={40} className="text-white/30" />
                <p className="text-white/60 text-sm text-center">
                  No se pudo cargar el historial
                </p>
              </div>
            ) : publicaciones.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
                <Images size={40} className="text-white/30" />
                <p className="text-white/60 text-sm text-center">
                  Sin exhibiciones registradas
                </p>
              </div>
            ) : (
              <GaleriaPublicationCarousel
                key={idCliente ?? 0}
                publicaciones={publicaciones}
                onPublicacionChange={handlePublicacionChange}
              />
            )}
          </div>

          {/* Panel derecho — solo desktop (w-72) */}
          {currentPub && (
            <div className="hidden md:flex w-72 shrink-0 flex-col border-l border-white/10 bg-black/80 backdrop-blur-md overflow-y-auto">
              <div className="p-5 space-y-4 pt-16">
                {/* Nombre cliente */}
                <div>
                  <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-0.5">PDV</p>
                  <p className="text-white font-bold text-sm leading-snug">{nombreCliente}</p>
                </div>

                {/* Estado del día */}
                <div>
                  <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-1">Estado</p>
                  <Badge
                    className={cn(
                      "text-[11px] font-bold px-2 border",
                      ESTADO_COLOR[currentPub.estado_dia] ?? "bg-slate-100 text-slate-600 border-slate-200",
                    )}
                  >
                    {currentPub.estado_dia}
                  </Badge>
                </div>

                {/* Fecha */}
                <div>
                  <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-0.5">Fecha</p>
                  <p className="text-white text-sm">{formatDate(currentPub.dia_ar)}</p>
                </div>

                {/* Fotos */}
                <div>
                  <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-0.5">
                    Fotos del día
                  </p>
                  <p className="text-white text-sm">{currentPub.total_fotos}</p>
                </div>

                {/* Supervisor y comentario de la primera foto */}
                {activeFoto?.supervisor && (
                  <div>
                    <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-0.5">Supervisor</p>
                    <p className="text-white/80 text-sm">{activeFoto.supervisor}</p>
                  </div>
                )}
                {activeFoto?.comentario && (
                  <div>
                    <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-0.5">Comentario</p>
                    <p className="text-white/70 text-sm italic">"{activeFoto.comentario}"</p>
                  </div>
                )}

                {/* Publicaciones resumen */}
                {publicaciones.length > 1 && (
                  <div>
                    <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-1.5">
                      Historial ({publicaciones.length} visitas)
                    </p>
                    <div className="space-y-1">
                      {publicaciones.map((p, i) => (
                        <div
                          key={p.dia_ar}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition-colors",
                            i === currentPubIdx
                              ? "bg-white/15 text-white"
                              : "text-white/50 hover:bg-white/5",
                          )}
                        >
                          <div
                            className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              ESTADO_COLOR[p.estado_dia]?.includes("green")
                                ? "bg-green-400"
                                : ESTADO_COLOR[p.estado_dia]?.includes("amber")
                                ? "bg-amber-400"
                                : ESTADO_COLOR[p.estado_dia]?.includes("red")
                                ? "bg-red-400"
                                : "bg-slate-400",
                            )}
                          />
                          <span>{formatDate(p.dia_ar)}</span>
                          <span className="ml-auto opacity-60">{p.total_fotos}f</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botón re-evaluar */}
                {needsReevaluar && (
                  <div className="pt-2 border-t border-white/10">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 h-9 text-xs border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent"
                      onClick={() => setReevalOpen(true)}
                    >
                      <RotateCcw size={13} />
                      Re-evaluar (Compañía)
                    </Button>
                  </div>
                )}

                {/* Skeleton si hay más publicaciones */}
                {isLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-2/3 bg-white/10" />
                    <Skeleton className="h-4 w-1/2 bg-white/10" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ReevaluarCompaniaSheet */}
        {needsReevaluar && activeFoto && (
          <ReevaluarCompaniaSheet
            open={reevalOpen}
            onClose={() => setReevalOpen(false)}
            idExhibicion={activeFoto.id_exhibicion}
            estadoActual={activeFoto.estado}
            distId={distId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
