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
  prefetchGaleriaTimelineFull,
  prefetchGaleriaPdvDetalle,
  fetchAllGaleriaTimeline,
  pickInitialPublicationIndex,
  preloadGaleriaPublication,
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
import { useGaleriaViewerStore } from "@/store/useGaleriaViewerStore";

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

function timelinePlaceholder<T>(
  prev: T | undefined,
  query: { queryKey: readonly unknown[] },
  idCliente: number | null,
  keyIndex: number,
): T | undefined {
  if (!prev || idCliente == null) return undefined;
  return query.queryKey[keyIndex] === idCliente ? prev : undefined;
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

  const {
    readyClienteId,
    transitionEpoch,
    beginPdvTransition,
    commitPdvReady,
    setActivePubDiaAr,
    reset: resetViewerStore,
  } = useGaleriaViewerStore();

  const [idCliente, setIdCliente] = useState<number | null>(initialIdCliente);
  const [nombreCliente, setNombreCliente] = useState(initialNombreCliente);
  const [idClienteErp, setIdClienteErp] = useState<string | null>(initialIdClienteErp ?? null);
  const [lat, setLat] = useState<number | null>(initialLat ?? null);
  const [lng, setLng] = useState<number | null>(initialLng ?? null);

  const [currentPub, setCurrentPub] = useState<GaleriaPublicacion | null>(null);
  const [currentPubIdx, setCurrentPubIdx] = useState(0);
  const [reevalOpen, setReevalOpen] = useState(false);
  const pendingInitRef = useRef(true);
  const initEpochRef = useRef(0);

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

  useEffect(() => {
    if (!open) {
      resetViewerStore();
      return;
    }
    if (idCliente != null) {
      pendingInitRef.current = true;
      initEpochRef.current += 1;
    }
  }, [open, idCliente, resetViewerStore]);

  useEffect(() => {
    pendingInitRef.current = true;
    setCurrentPub(null);
    setCurrentPubIdx(0);
    initEpochRef.current += 1;
  }, [idCliente]);

  const { data, isLoading, isError, isFetching } = useQuery({
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
    placeholderData: (prev, query) =>
      timelinePlaceholder(prev, query, idCliente, 3),
  });

  const publicacionesMes: GaleriaPublicacion[] = useMemo(
    () => (data ? groupTimelinePublicaciones(data.items) : []),
    [data],
  );

  const {
    data: dataFull,
    isLoading: loadingFull,
    isFetching: fetchingFull,
  } = useQuery({
    queryKey: galeriaKeys.timelineFull(distId, idCliente ?? 0, idVendedor),
    queryFn: () =>
      fetchAllGaleriaTimeline(idCliente!, distId, idVendedor ?? undefined),
    enabled: open && idCliente != null,
    staleTime: 120_000,
    placeholderData: (prev, query) =>
      timelinePlaceholder(prev, query, idCliente, 3),
  });

  const publicacionesFull: GaleriaPublicacion[] = useMemo(
    () => (dataFull ? groupTimelinePublicaciones(dataFull) : []),
    [dataFull],
  );

  /** Carrusel usa historial completo; mes filtrado solo define visita inicial. */
  const carouselPubs = useMemo(
    () => (publicacionesFull.length > 0 ? publicacionesFull : publicacionesMes),
    [publicacionesFull, publicacionesMes],
  );

  useEffect(() => {
    if (idClienteErp?.trim()) return;
    const pin = mapPins.find((p) => p.id_cliente === idCliente);
    if (pin?.id_cliente_erp) setIdClienteErp(pin.id_cliente_erp);
  }, [idCliente, idClienteErp, mapPins]);

  const handlePublicacionChange = useCallback(
    (idx: number, pub: GaleriaPublicacion) => {
      setCurrentPub(pub);
      setCurrentPubIdx(idx);
      setActivePubDiaAr(pub.dia_ar);
    },
    [setActivePubDiaAr],
  );

  // Inicializar visita + precargar imagen antes de mostrar carrusel
  useEffect(() => {
    if (!open || idCliente == null) return;
    if (!pendingInitRef.current) return;
    if (carouselPubs.length === 0) return;
    if (isLoading || loadingFull) return;

    const epoch = initEpochRef.current;
    const idx = pickInitialPublicationIndex(carouselPubs, publicacionesMes);
    const pub = carouselPubs[idx];
    if (!pub) return;

    pendingInitRef.current = false;
    void preloadGaleriaPublication(pub).then(() => {
      if (epoch !== initEpochRef.current || idCliente == null) return;
      setCurrentPub(pub);
      setCurrentPubIdx(idx);
      commitPdvReady(idCliente, pub.dia_ar);
    });
  }, [
    open,
    idCliente,
    carouselPubs,
    publicacionesMes,
    isLoading,
    loadingFull,
    commitPdvReady,
  ]);

  const prefetchPdvBundle = useCallback(
    (target: GaleriaViewerNavTarget) => {
      void prefetchGaleriaTimeline(qc, {
        distId,
        idCliente: target.idCliente,
        idVendedor,
        desde: fechaDesde,
        hasta: fechaHasta,
      });
      void prefetchGaleriaTimelineFull(qc, {
        distId,
        idCliente: target.idCliente,
        idVendedor,
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

  const handleSelectPdv = useCallback(
    (target: GaleriaViewerNavTarget) => {
      beginPdvTransition(target.idCliente);
      pendingInitRef.current = true;
      initEpochRef.current += 1;

      setIdCliente(target.idCliente);
      setNombreCliente(target.nombreCliente);
      setLat(target.lat);
      setLng(target.lng);
      if (target.idClienteErp) setIdClienteErp(target.idClienteErp);
      setCurrentPub(null);
      setCurrentPubIdx(0);

      prefetchPdvBundle(target);

      const ordered = mapPins.length > 0 ? mapPins : [];
      const idx = ordered.findIndex((p) => p.id_cliente === target.idCliente);
      if (idx >= 0) {
        if (idx > 0) {
          const prev = ordered[idx - 1];
          prefetchPdvBundle({
            idCliente: prev.id_cliente,
            nombreCliente: prev.nombre_cliente,
            lat: prev.latitud,
            lng: prev.longitud,
            idClienteErp: prev.id_cliente_erp,
          });
        }
        if (idx < ordered.length - 1) {
          const next = ordered[idx + 1];
          prefetchPdvBundle({
            idCliente: next.id_cliente,
            nombreCliente: next.nombre_cliente,
            lat: next.latitud,
            lng: next.longitud,
            idClienteErp: next.id_cliente_erp,
          });
        }
      }
    },
    [beginPdvTransition, prefetchPdvBundle, mapPins],
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

  const carouselReady =
    idCliente != null &&
    readyClienteId === idCliente &&
    carouselPubs.length > 0 &&
    currentPub != null;

  const showCarouselLoading =
    !carouselReady &&
    (isLoading || loadingFull || isFetching || fetchingFull || carouselPubs.length === 0);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col md:flex-row"
      role="dialog"
      aria-modal="true"
      aria-label={`Galería de ${nombreCliente}`}
    >
      <div className="absolute inset-0 bg-black/45 pointer-events-none" aria-hidden />

      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default"
        aria-label="Cerrar galería"
        onClick={onClose}
      />

      <div className="relative z-10 flex flex-col md:flex-row w-full h-full pointer-events-none">
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

          {/* Timeline prominente — arriba del carrusel para jerarquía visual */}
          {carouselPubs.length > 1 && !isError && (
            <GaleriaExhibicionTimeline
              publicaciones={carouselPubs}
              activePubIdx={currentPubIdx}
              mesLabel={mesLabel}
              onSelectPub={(idx) => {
                const pub = carouselPubs[idx];
                if (!pub) return;
                void preloadGaleriaPublication(pub).then(() => {
                  handlePublicacionChange(idx, pub);
                  if (idCliente != null) commitPdvReady(idCliente, pub.dia_ar);
                });
              }}
            />
          )}

          <div className="flex-1 min-h-0 relative rounded-t-2xl md:rounded-none overflow-hidden mx-2 md:mx-4 shadow-2xl ring-1 ring-white/10 bg-black/30 backdrop-blur-sm">
            {isError ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
                <Images size={40} className="text-white/40" />
                <p className="text-white/70 text-sm text-center">No se pudo cargar el historial</p>
              </div>
            ) : showCarouselLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <Loader2 size={32} className="text-white/70 animate-spin" />
                <p className="text-white/60 text-sm">Cargando exhibiciones...</p>
              </div>
            ) : carouselPubs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
                <Images size={40} className="text-white/40" />
                <p className="text-white/70 text-sm text-center">Sin exhibiciones registradas</p>
              </div>
            ) : (
              <GaleriaPublicationCarousel
                ref={carouselRef}
                key={`${idCliente}-${transitionEpoch}`}
                clienteId={idCliente}
                publicaciones={carouselPubs}
                activePubIdx={currentPubIdx}
                onPublicacionChange={handlePublicacionChange}
              />
            )}
          </div>
        </div>

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
              totalVisitas={publicacionesMes.length}
              className="h-auto overflow-visible"
            />

            {carouselPubs.length > 1 && (
              <div className="hidden md:block px-4 pb-3 border-t border-white/10 max-h-36 overflow-y-auto">
                <p className="text-[10px] text-white/45 uppercase tracking-widest py-2">
                  Historial ({carouselPubs.length})
                </p>
                <div className="space-y-1">
                  {carouselPubs.map((p, i) => (
                    <button
                      key={p.dia_ar}
                      type="button"
                      onClick={() => {
                        void preloadGaleriaPublication(p).then(() => {
                          handlePublicacionChange(i, p);
                          if (idCliente != null) commitPdvReady(idCliente, p.dia_ar);
                        });
                      }}
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
