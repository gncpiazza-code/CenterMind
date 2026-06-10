"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, ChevronUp, ChevronDown, RotateCcw, Loader2, Images } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { fetchGaleriaTimelineCliente } from "@/lib/api";
import {
  groupTimelinePublicaciones,
  pickFotoEvaluadaParaReeval,
  type GaleriaPublicacion,
} from "@/lib/galeria-publicaciones";
import {
  galeriaKeys,
  prefetchGaleriaTimeline,
  prefetchGaleriaPdvDetalle,
  fetchAllGaleriaTimeline,
} from "@/lib/galeria-queries";
import { formatGaleriaMesLabel } from "@/lib/galeria-month";
import {
  GaleriaPublicationCarousel,
  type GaleriaCarouselHandle,
} from "./GaleriaPublicationCarousel";
import { GaleriaExhibicionTimeline } from "./GaleriaExhibicionTimeline";
import { ReevaluarCompaniaSheet } from "./ReevaluarCompaniaSheet";
import { GaleriaPdvInsightPanel } from "./GaleriaPdvInsightPanel";
import { useGaleriaViewerNav, type GaleriaViewerNavTarget } from "@/hooks/useGaleriaViewerNav";
import type { GaleriaMapaPin } from "@/lib/api";
import { formatGaleriaFechaVisita } from "@/lib/fecha-ar";
import { useAuth } from "@/hooks/useAuth";

export interface GaleriaExhibicionViewerProps {
  open: boolean;
  onClose: () => void;
  idCliente: number | null;
  nombreCliente: string;
  distId: number;
  idVendedor?: number | null;
  idClienteErp?: string | null;
  canReevaluarCompania?: boolean;
  lat?: number | null;
  lng?: number | null;
  fechaDesde?: string;
  fechaHasta?: string;
  mesGaleria?: string;
  filtroEstado?: string;
  mapPins?: GaleriaMapaPin[];
}

export function GaleriaExhibicionViewer({
  open,
  onClose,
  idCliente: initialIdCliente,
  nombreCliente: initialNombreCliente,
  distId,
  idVendedor,
  idClienteErp: initialIdClienteErp,
  canReevaluarCompania = false,
  lat: initialLat,
  lng: initialLng,
  fechaDesde,
  fechaHasta,
  mesGaleria,
  mapPins = [],
}: GaleriaExhibicionViewerProps) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const carouselRef = useRef<GaleriaCarouselHandle>(null);

  const [idCliente, setIdCliente] = useState<number | null>(initialIdCliente);
  const [nombreCliente, setNombreCliente] = useState(initialNombreCliente);
  const [idClienteErp, setIdClienteErp] = useState<string | null>(initialIdClienteErp ?? null);
  const [lat, setLat] = useState<number | null>(initialLat ?? null);
  const [lng, setLng] = useState<number | null>(initialLng ?? null);

  const [currentPub, setCurrentPub] = useState<GaleriaPublicacion | null>(null);
  const [currentPubIdx, setCurrentPubIdx] = useState(0);
  const [reevalOpen, setReevalOpen] = useState(false);
  // Tracks whether we've initialized to the most-recent pub for the current client
  const pendingInitRef = useRef(true);

  useEffect(() => {
    setIdCliente(initialIdCliente);
    setNombreCliente(initialNombreCliente);
    setIdClienteErp(initialIdClienteErp ?? null);
    setLat(initialLat ?? null);
    setLng(initialLng ?? null);
    setCurrentPub(null);
    setCurrentPubIdx(0);
  }, [
    initialIdCliente,
    initialNombreCliente,
    initialIdClienteErp,
    initialLat,
    initialLng,
  ]);

  // Mark as pending whenever idCliente changes so we re-initialize to most recent pub
  useEffect(() => {
    pendingInitRef.current = true;
    setCurrentPub(null);
    setCurrentPubIdx(0);
  }, [idCliente]);

  const { data, isLoading, isError } = useQuery({
    queryKey: galeriaKeys.timeline(
      distId,
      idCliente ?? 0,
      idVendedor,
      fechaDesde ?? "",
      fechaHasta ?? "",
    ),
    queryFn: () =>
      fetchGaleriaTimelineCliente(idCliente!, distId, {
        idVendedor,
        desde: fechaDesde,
        hasta: fechaHasta,
      }),
    enabled: open && idCliente != null,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const publicaciones: GaleriaPublicacion[] = useMemo(
    () => (data ? groupTimelinePublicaciones(data.items) : []),
    [data],
  );

  // Full (unfiltered) timeline for the PDV — used for the timeline strip
  const { data: dataFull } = useQuery({
    queryKey: galeriaKeys.timelineFull(distId, idCliente ?? 0, idVendedor),
    queryFn: () => fetchAllGaleriaTimeline(idCliente!, distId, idVendedor ?? undefined),
    enabled: open && idCliente != null,
    staleTime: 120_000,
    placeholderData: (prev) => prev,
  });

  const publicacionesFull: GaleriaPublicacion[] = useMemo(
    () => (dataFull ? groupTimelinePublicaciones(dataFull) : []),
    [dataFull],
  );

  useEffect(() => {
    if (idClienteErp?.trim()) return;
    const pin = mapPins.find((p) => p.id_cliente === idCliente);
    if (pin?.id_cliente_erp) setIdClienteErp(pin.id_cliente_erp);
  }, [idCliente, idClienteErp, mapPins]);

  // Initialize to most-recent pub when data arrives — only once per client change
  useEffect(() => {
    if (!pendingInitRef.current) return;
    if (publicaciones.length === 0) return;
    pendingInitRef.current = false;
    const lastIdx = publicaciones.length - 1;
    setCurrentPub(publicaciones[lastIdx]);
    setCurrentPubIdx(lastIdx);
  }, [publicaciones]);

  const handlePublicacionChange = (idx: number, pub: GaleriaPublicacion) => {
    setCurrentPub(pub);
    setCurrentPubIdx(idx);
  };

  const handleSelectPdv = useCallback(
    (target: GaleriaViewerNavTarget) => {
      setIdCliente(target.idCliente);
      setNombreCliente(target.nombreCliente);
      setLat(target.lat);
      setLng(target.lng);
      if (target.idClienteErp) setIdClienteErp(target.idClienteErp);
      setCurrentPub(null);
      setCurrentPubIdx(0);

      void prefetchGaleriaTimeline(qc, {
        distId,
        idCliente: target.idCliente,
        idVendedor,
        desde: fechaDesde,
        hasta: fechaHasta,
      });
      if (target.idClienteErp) {
        void prefetchGaleriaPdvDetalle(qc, distId, target.idClienteErp, {
          desde: fechaDesde,
          hasta: fechaHasta,
        });
      }
    },
    [qc, distId, idVendedor, fechaDesde, fechaHasta],
  );

  const { activeIndex, totalPdvs, canGoPdvPrev, canGoPdvNext, goPdvPrev, goPdvNext } =
    useGaleriaViewerNav({
      open,
      mapPins,
      activeClienteId: idCliente,
      onSelectPdv: handleSelectPdv,
      onPhotoPrev: () => carouselRef.current?.photoPrev(),
      onPhotoNext: () => carouselRef.current?.photoNext(),
    });

  // Index of the current pub in the full (unfiltered) list — for timeline strip dot
  const activeTimelineIdx = useMemo(() => {
    if (!currentPub) return -1;
    return publicacionesFull.findIndex((p) => p.dia_ar === currentPub.dia_ar);
  }, [publicacionesFull, currentPub]);

  const activeFoto = useMemo(
    () => (currentPub ? pickFotoEvaluadaParaReeval(currentPub.fotos) : null),
    [currentPub],
  );
  const visitaTsHeader = currentPub?.fotos.reduce<string | null>((acc, f) => {
    const ts = f.timestamp_subida?.trim();
    if (!ts) return acc;
    if (!acc || ts > acc) return ts;
    return acc;
  }, null);
  const visitaFechaHeader = currentPub
    ? formatGaleriaFechaVisita(currentPub.dia_ar, visitaTsHeader)
    : null;
  const puedeReevaluarCompania =
    canReevaluarCompania ||
    Boolean(user?.is_superadmin) ||
    ["compania", "directorio"].includes((user?.rol ?? "").toLowerCase());
  const needsReevaluar = puedeReevaluarCompania && activeFoto != null;

  const mesLabel = mesGaleria ? formatGaleriaMesLabel(mesGaleria) : undefined;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col md:flex-row"
      role="dialog"
      aria-modal="true"
      aria-label={`Galería de ${nombreCliente}`}
    >
      {/* Capa oscura semitransparente — el mapa difuminado queda detrás (page.tsx) */}
      <div className="absolute inset-0 bg-black/45 pointer-events-none" aria-hidden />

      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default"
        aria-label="Cerrar galería"
        onClick={onClose}
      />

      <div className="relative z-10 flex flex-col md:flex-row w-full h-full pointer-events-none">
        {/* Carrusel central */}
        <div className="flex-1 min-w-0 h-full flex flex-col pointer-events-auto">
          <div className="flex items-center justify-between px-4 py-3 shrink-0 bg-gradient-to-b from-black/50 to-transparent">
            <div className="flex items-center gap-2 min-w-0">
              {totalPdvs > 1 && (
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={goPdvPrev}
                    disabled={!canGoPdvPrev}
                    className="w-7 h-7 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 disabled:opacity-30"
                    title="PDV anterior (↑)"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={goPdvNext}
                    disabled={!canGoPdvNext}
                    className="w-7 h-7 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 disabled:opacity-30"
                    title="PDV siguiente (↓)"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-white font-bold text-sm leading-tight truncate drop-shadow-md">
                  {nombreCliente}
                </p>
                {totalPdvs > 1 && activeIndex >= 0 && (
                  <p className="text-white/70 text-[10px] drop-shadow">
                    PDV {activeIndex + 1} de {totalPdvs} · ←→ fotos · ↑↓ PDVs
                  </p>
                )}
                {visitaFechaHeader && (
                  <p className="text-white/60 text-[10px] drop-shadow tabular-nums">
                    {visitaFechaHeader.fecha}
                    {visitaFechaHeader.relativo ? ` · ${visitaFechaHeader.relativo}` : ""}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {needsReevaluar && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9 text-xs border-white/30 text-white hover:bg-white/15 bg-black/35 backdrop-blur-md shrink-0"
                  onClick={() => setReevalOpen(true)}
                >
                  <RotateCcw size={13} />
                  <span className="hidden sm:inline">Re-evaluar (Compañía)</span>
                  <span className="sm:hidden">Re-evaluar</span>
                </Button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60 shrink-0"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 relative rounded-t-2xl md:rounded-none overflow-hidden mx-2 md:mx-4 shadow-2xl ring-1 ring-white/10 bg-black/30 backdrop-blur-sm">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <Loader2 size={32} className="text-white/70 animate-spin" />
                <p className="text-white/60 text-sm">Cargando exhibiciones...</p>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
                <Images size={40} className="text-white/40" />
                <p className="text-white/70 text-sm text-center">No se pudo cargar el historial</p>
              </div>
            ) : publicaciones.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
                <Images size={40} className="text-white/40" />
                <p className="text-white/70 text-sm text-center">Sin exhibiciones registradas</p>
              </div>
            ) : (
              <GaleriaPublicationCarousel
                ref={carouselRef}
                key={idCliente ?? 0}
                publicaciones={publicaciones}
                activePubIdx={currentPubIdx}
                onPublicacionChange={handlePublicacionChange}
              />
            )}
          </div>

          {/* Timeline strip — all visits for this PDV, no date filter */}
          {publicacionesFull.length > 1 && (
            <GaleriaExhibicionTimeline
              publicaciones={publicacionesFull}
              activePubIdx={activeTimelineIdx}
              onSelectPub={(idx) => {
                const pub = publicacionesFull[idx];
                if (!pub) return;
                // Navigate carousel only if date is within the filtered set
                const filteredIdx = publicaciones.findIndex((p) => p.dia_ar === pub.dia_ar);
                if (filteredIdx >= 0) handlePublicacionChange(filteredIdx, publicaciones[filteredIdx]);
              }}
            />
          )}
        </div>

        {/* Panel insights — desktop siempre; mobile sheet inferior */}
        <aside
          className={cn(
            "pointer-events-auto shrink-0 w-full md:w-[min(440px,38vw)] lg:w-[440px]",
            "bg-black/60 backdrop-blur-xl border-t md:border-t-0 md:border-l border-white/10",
            "max-h-[48vh] md:max-h-none md:h-full",
            "flex flex-col min-h-0 overflow-hidden",
          )}
        >
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <GaleriaPdvInsightPanel
              distId={distId}
              idClienteErp={idClienteErp}
              nombreCliente={nombreCliente}
              currentPub={currentPub}
              fechaDesde={fechaDesde}
              fechaHasta={fechaHasta}
              mesLabel={mesLabel}
              totalVisitas={publicaciones.length}
              className="h-auto overflow-visible"
            />

            {publicaciones.length > 1 && (
              <div className="hidden md:block px-4 pb-3 border-t border-white/10 max-h-36 overflow-y-auto">
                <p className="text-[10px] text-white/45 uppercase tracking-widest py-2">
                  Historial ({publicaciones.length})
                </p>
                <div className="space-y-1">
                  {publicaciones.map((p, i) => (
                    <button
                      key={p.dia_ar}
                      type="button"
                      onClick={() => handlePublicacionChange(i, p)}
                      className={cn(
                        "w-full text-left text-[11px] px-2 py-1.5 rounded-lg transition-colors",
                        i === currentPubIdx
                          ? "bg-white/15 text-white"
                          : "text-white/50 hover:bg-white/10",
                      )}
                    >
                      {formatGaleriaFechaVisita(p.dia_ar).fecha} · {p.total_fotos}f
                    </button>
                  ))}
                </div>
              </div>
            )}

            {publicaciones.length > 1 && (
              <div className="px-4 pb-4 md:hidden border-t border-white/10 max-h-24 overflow-y-auto">
                <p className="text-[10px] text-white/45 uppercase tracking-widest py-2">Historial</p>
                <div className="flex gap-2 overflow-x-auto">
                  {publicaciones.map((p, i) => (
                    <button
                      key={p.dia_ar}
                      type="button"
                      onClick={() => handlePublicacionChange(i, p)}
                      className={cn(
                        "shrink-0 text-[10px] px-2 py-1 rounded-full border",
                        i === currentPubIdx
                          ? "bg-white/20 border-white/40 text-white"
                          : "border-white/15 text-white/50",
                      )}
                    >
                      {formatGaleriaFechaVisita(p.dia_ar).fecha}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {needsReevaluar && activeFoto && (
        <ReevaluarCompaniaSheet
          open={reevalOpen}
          onClose={() => setReevalOpen(false)}
          idExhibicion={activeFoto.id_exhibicion}
          estadoActual={activeFoto.estado}
          distId={distId}
        />
      )}
    </div>
  );
}
