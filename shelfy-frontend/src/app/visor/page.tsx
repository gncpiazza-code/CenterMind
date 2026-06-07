"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useViewerStore } from "../../store/useViewerStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchVisorBundle, fetchVendedores,
  evaluar, revertir,
  getWSUrl,
  type GrupoPendiente, type VisorBundle,
} from "@/lib/api";
import { bundleKeys } from "@/lib/query-keys";
import { BUNDLE_STALE_MS, BUNDLE_GC_MS } from "@/components/providers/ReactQueryProvider";
import {
  useVisorClienteContext,
  useVisorPdvPrefetch,
} from "@/hooks/useVisorClienteContext";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check, X, Flame, RotateCcw, RefreshCw,
  ChevronLeft, ChevronRight, ImageOff,
  Lock, ChevronUp, Store,
  MessageSquarePlus,
  Calendar, ShoppingCart,
  Camera,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { daysSinceFechaAR } from "@/lib/fecha-ar";
import {
  preloadVisorCurrentGroup,
  preloadVisorFotoNeighbors,
  preloadVisorImageUrl,
  preloadVisorQueueIdle,
} from "@/lib/visor-image-prefetch";
import { UltimaCompraRemitoCard } from "@/components/visor/UltimaCompraDetalle";
import { VisorRemitoFocusLayout } from "@/components/visor/VisorRemitoFocusLayout";
import { VisorMetaMinimizedBar } from "@/components/visor/VisorMetaMinimizedBar";
import { VISOR_LAYOUT_TRANSITION } from "@/components/visor/visor-layout-motion";
import { PdvVitalidadBadges } from "@/components/visor/PdvVitalidadBadges";
import { VisorPdvIdentityHeader } from "@/components/visor/VisorPdvIdentityHeader";
import { VisorEvalBar } from "@/components/visor/VisorEvalBar";
import { VisorEvalPanel } from "@/components/visor/VisorEvalPanel";
import { VisorEnviarGuiaExhibicion } from "@/components/visor/VisorEnviarGuiaExhibicion";
import { VisorObservacionesCard } from "@/components/visor/VisorObservacionesCard";
import { FotoViewer, resolveVisorImageSrc, type FotoViewerHandle } from "@/components/visor/FotoViewer";
import { VisorPhotoControls } from "@/components/visor/VisorPhotoControls";
import {
  VisorGlassTunePanel,
  VisorGlassTuneProvider,
} from "@/components/visor/visor-glass-tune";
import { useVisorPublicDemo } from "@/components/visor/VisorDemoContext";
import {
  VISOR_DEMO_STATS,
  VISOR_DEMO_USER,
  VISOR_MOCK_GRUPOS,
} from "@/lib/visor-demo-data";
import {
  VisorPanelCard,
  VisorPanelExhibicionGrid,
  VisorPanelField,
  VisorPanelFieldList,
  VisorPanelLocationFields,
  visorPanelChipClass,
} from "@/components/visor/VisorPanelCard";

const VISOR_TEMPLATE_KEY = "shelfy:visor:comment-templates";

/** Mock solo si se pide explícito (?mock=fit|1). Datos reales por defecto (también en dev). */
function isVisorMockMode(mockParam: string | null): boolean {
  return mockParam === "fit" || mockParam === "1";
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function formatFechaAR(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

function readCommentTemplates(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VISOR_TEMPLATE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function saveCommentTemplates(templates: string[]) {
  try {
    localStorage.setItem(VISOR_TEMPLATE_KEY, JSON.stringify(templates));
  } catch {
    /* ignore */
  }
}

// ── Subcomponents for panels ──────────────────────────────────────────────────

function ShortcutItem({
  keys,
  label,
}: {
  keys: React.ReactNode;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]/60 px-2 py-1">
      {keys}
      <span className="text-[10px] font-semibold text-[var(--shelfy-muted)]">{label}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function VisorPageContent() {
  const searchParams = useSearchParams();
  const mockParam = searchParams.get("mock");
  const publicDemo = useVisorPublicDemo();
  const mockFitDemo = publicDemo || isVisorMockMode(mockParam);
  const { user: authUser } = useAuth();
  const user = publicDemo ? VISOR_DEMO_USER : authUser;
  const queryClient = useQueryClient();
  const [lastEvalIds, setLastEvalIds] = useState<number[]>([]);
  const desktopFotoViewerRef = useRef<FotoViewerHandle>(null);
  const mobileFotoViewerRef = useRef<FotoViewerHandle>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoBaselineZoom, setPhotoBaselineZoom] = useState(1);

  const handlePhotoZoomChange = useCallback((user: number, baseline: number) => {
    setPhotoZoom(user);
    setPhotoBaselineZoom(baseline);
  }, []);

  const [isMdUp, setIsMdUp] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsMdUp(mq.matches);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /** Mobile: vista fija sin scroll del documento (gestos swipe en Evaluar). */
  useEffect(() => {
    if (isMdUp || typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [isMdUp]);

  const getActiveFotoViewer = useCallback((): FotoViewerHandle | null => {
    return isMdUp ? desktopFotoViewerRef.current : mobileFotoViewerRef.current;
  }, [isMdUp]);

  const photoZoomActions = useMemo(
    () => ({
      zoomIn: () => getActiveFotoViewer()?.zoomIn(),
      zoomOut: () => getActiveFotoViewer()?.zoomOut(),
      resetZoom: () => getActiveFotoViewer()?.resetZoom(),
    }),
    [getActiveFotoViewer],
  );

  const {
    currentIndex, currentFotoIdx, vistas,
    setCurrentIndex, setCurrentFotoIdx, resetGroupState,
  } = useViewerStore();

  const [filtroVendedor, setFiltroVendedor] = useState("Todos");
  const [filtroSucursal, setFiltroSucursal] = useState("Todas");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [focusHoldActive, setFocusHoldActive] = useState(false);
  const [visorTab, setVisorTab] = useState<"todas" | "objetivo">("todas");
  const [comentario, setComentario] = useState("");
  const [flash, setFlash] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [commentTemplates, setCommentTemplates] = useState<string[]>([]);
  const [newTemplateText, setNewTemplateText] = useState("");

  const distId = user?.id_distribuidor || 0;
  const isSubmittingRef = useRef(false);
  const focusHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const {
    data: visorBundle,
    isLoading: loadingPendientesRaw,
    error: errorPend,
  } = useQuery({
    queryKey: bundleKeys.visor(distId),
    queryFn: () => fetchVisorBundle(distId),
    enabled: !!user && distId > 0 && !mockFitDemo,
    staleTime: BUNDLE_STALE_MS,
    gcTime: BUNDLE_GC_MS,
    placeholderData: (prev) => prev,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.meta?.revalidating && (data.pendientes?.length ?? 0) === 0) return 5_000;
      return 90_000;
    },
  });

  const loadingPendientes = loadingPendientesRaw && !visorBundle;


  // Extract data from bundle (field names adapted to match existing JSX)
  const gruposFromApi: GrupoPendiente[] = (visorBundle?.pendientes ?? [])
    .filter((g) => Array.isArray(g.fotos) && g.fotos.length > 0) as GrupoPendiente[];
  const grupos: GrupoPendiente[] = mockFitDemo ? VISOR_MOCK_GRUPOS : gruposFromApi;

  useEffect(() => {
    if (!mockFitDemo) return;
    setFiltroVendedor("Todos");
    setFiltroSucursal("Todas");
    setVisorTab("todas");
    setCurrentIndex(0);
    setCurrentFotoIdx(0);
    resetGroupState();
  }, [mockFitDemo, resetGroupState, setCurrentFotoIdx, setCurrentIndex]);

  const stats = mockFitDemo
    ? VISOR_DEMO_STATS
    : visorBundle?.stats
      ? {
          pendientes: visorBundle.stats.pendientes,
          aprobadas: visorBundle.stats.aprobados,
          rechazadas: 0,
          destacadas: visorBundle.stats.destacados,
          total: visorBundle.stats.total,
        }
      : undefined;

  const { data: vendedores = [] } = useQuery({
    queryKey: ["vendedores", distId],
    queryFn: () => fetchVendedores(distId),
    enabled: !!user && distId > 0 && !mockFitDemo,
  });

  // ── Filtered data ────────────────────────────────────────────────────────────

  const sucursalesDisponibles = Array.from(
    new Set(grupos.map((g) => (g.sucursal || "Sin sucursal").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "es"));

  const filtrados = useMemo(() => {
    let base = filtroVendedor === "Todos" ? grupos : grupos.filter((g) => g.vendedor === filtroVendedor);
    base = filtroSucursal === "Todas" ? base : base.filter((g) => (g.sucursal || "Sin sucursal") === filtroSucursal);
    if (visorTab === "objetivo") base = base.filter((g) => (g.fotos ?? []).some((f) => f.es_objetivo));
    return base;
  }, [grupos, filtroVendedor, filtroSucursal, visorTab]);

  const grupo = filtrados[currentIndex] ?? null;

  useVisorPdvPrefetch(
    distId,
    filtrados,
    grupos,
    currentIndex,
    !!user?.usa_contexto_erp,
  );

  const {
    nroForErp,
    skipErpFetch,
    pdvInfo,
    erpContext,
    pdvLoading,
    loadingERP,
  } = useVisorClienteContext({
    distId,
    grupo,
    usaContextoErp: !!user?.usa_contexto_erp,
  });

  const ultimaCompraFuente = pdvInfo?.fecha_ultima_compra ?? erpContext?.ultima_compra;
  const ultimaCompraArticulos =
    pdvInfo?.ultima_compra_articulos ?? erpContext?.ultima_compra_articulos;
  const ultimaCompraResumen =
    pdvInfo?.ultima_compra_articulos_resumen ?? erpContext?.ultima_compra_articulos_resumen;
  const ultimoComprobante =
    pdvInfo?.ultimo_comprobante ?? erpContext?.ultimo_comprobante;
  const ultimaCompraComprobantes =
    pdvInfo?.ultima_compra_comprobantes ?? erpContext?.ultima_compra_comprobantes;

  const tieneComprobante = Boolean(
    ultimoComprobante?.label ||
      ultimoComprobante?.numero_documento ||
      (ultimaCompraComprobantes?.length ?? 0) > 0,
  );

  const diasUltCompra = daysSinceFechaAR(ultimaCompraFuente);
  const ventas30 = typeof erpContext?.total_30d === "number" && erpContext.total_30d > 0;
  const compraUltimos30 =
    ventas30 ||
    tieneComprobante ||
    (diasUltCompra !== null && diasUltCompra <= 30 && !!ultimaCompraFuente);
  const conIngresoComercio =
    ventas30 ||
    tieneComprobante ||
    (diasUltCompra !== null && diasUltCompra < 90 && !!ultimaCompraFuente) ||
    (erpContext?.cant_facturas != null && erpContext.cant_facturas > 0);
  const activoComercial =
    pdvInfo?.activo_comercial ??
    erpContext?.activo_comercial ??
    compraUltimos30;

  const tipoPdvDisplay = useMemo(() => {
    const t = (grupo?.tipo_pdv || "").trim();
    if (t && t !== "S/D") return t;
    if (conIngresoComercio) return "Comercio con Ingreso";
    if (pdvInfo || ultimaCompraFuente || tieneComprobante) return "Comercio sin Ingreso";
    return "—";
  }, [grupo?.tipo_pdv, conIngresoComercio, pdvInfo, ultimaCompraFuente, tieneComprobante]);

  const vendedorExhibicion = useMemo(() => {
    const erp = erpContext?.vendedor_erp?.trim();
    if (erp) return erp;
    return grupo?.vendedor?.trim() || "Sin asignar";
  }, [erpContext?.vendedor_erp, grupo?.vendedor]);

  const sucursalExhibicion = useMemo(() => {
    const erp = erpContext?.sucursal_erp?.trim();
    if (erp) return erp;
    return grupo?.sucursal?.trim() || "Sin sucursal";
  }, [erpContext?.sucursal_erp, grupo?.sucursal]);

  const remitoPanelKey = `${currentIndex}-${nroForErp ?? grupo?.nro_cliente ?? ""}`;

  const pdvNombreMin = (
    pdvInfo?.nombre_fantasia ||
    pdvInfo?.nombre_razon_social ||
    erpContext?.nombre_fantasia ||
    erpContext?.razon_social ||
    "Sin nombre"
  ).trim();

  const sinContactoPdv = !(
    (pdvInfo?.telefono ?? erpContext?.telefono)?.trim() ||
    (pdvInfo?.celular ?? erpContext?.celular)?.trim()
  );

  const totalGrupos = filtrados.length;
  const fotosGrupo = grupo?.fotos ?? [];
  const idExhibicionActiva = fotosGrupo[currentFotoIdx]?.id_exhibicion ?? null;
  const totalFotos = fotosGrupo.length;
  const todasVistas = vistas.size >= totalFotos;
  const isValidacion = fotosGrupo.some((f) => f.estado === "VALIDACION");

  useEffect(() => {
    if (!filtrados.length) return;
    preloadVisorCurrentGroup(filtrados, currentIndex);
    preloadVisorFotoNeighbors(filtrados, currentIndex, currentFotoIdx);
  }, [filtrados, currentIndex, currentFotoIdx]);

  useEffect(() => {
    if (!filtrados.length) return;
    if (isMdUp) return;
    preloadVisorQueueIdle(filtrados);
  }, [filtrados, isMdUp]);

  const navigateToFoto = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(totalFotos - 1, idx));
      const f = fotosGrupo[clamped];
      if (f) {
        void preloadVisorImageUrl(
          resolveVisorImageSrc(f.drive_link, f.id_exhibicion),
        );
      }
      setCurrentFotoIdx(clamped);
    },
    [fotosGrupo, totalFotos, setCurrentFotoIdx],
  );

  // ── Mutations ────────────────────────────────────────────────────────────────

  const mutationEvaluar = useMutation({
    mutationFn: ({ ids, estado, comentario }: { ids: number[]; estado: string; comentario: string }) =>
      evaluar(ids, estado, user?.usuario || "system", comentario),
    onSettled: () => {
      isSubmittingRef.current = false;
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: bundleKeys.visor(distId) });
      const previousBundle = queryClient.getQueryData<VisorBundle>(bundleKeys.visor(distId));

      queryClient.setQueryData<VisorBundle>(bundleKeys.visor(distId), (old) => {
        if (!old) return old;
        const firstEvalId = variables.ids[0];
        const nextPendientes = old.pendientes.filter(
          (g: GrupoPendiente) => !(g.fotos ?? []).some((f) => f.id_exhibicion === firstEvalId)
        );
        setCurrentIndex(Math.min(currentIndex, Math.max(0, nextPendientes.length - 1)));
        resetGroupState();
        setComentario("");
        return {
          ...old,
          pendientes: nextPendientes,
          stats: {
            ...old.stats,
            pendientes: Math.max(0, old.stats.pendientes - 1),
            aprobados: variables.estado === "Aprobado" ? old.stats.aprobados + 1 : old.stats.aprobados,
            destacados: variables.estado === "Destacado" ? old.stats.destacados + 1 : old.stats.destacados,
          },
        };
      });

      setFlash({ msg: variables.estado, type: "ok" });
      setTimeout(() => setFlash(null), 2000);

      return { previousBundle };
    },
    onSuccess: (data: { affected?: number } | undefined, _vars, context) => {
      if (data?.affected === 0) {
        setFlash({ msg: "Ya evaluado por otro usuario", type: "err" });
        setTimeout(() => setFlash(null), 2000);
        if (context?.previousBundle) {
          queryClient.setQueryData(bundleKeys.visor(distId), context.previousBundle);
        }
        queryClient.invalidateQueries({ queryKey: bundleKeys.visor(distId) });
        return;
      }
      queryClient.invalidateQueries({ queryKey: bundleKeys.visor(distId) });
    },
    onError: (err, _vars, context) => {
      setFlash({ msg: "Error al evaluar", type: "err" });
      console.error(err);
      if (context?.previousBundle) {
        queryClient.setQueryData(bundleKeys.visor(distId), context.previousBundle);
      }
      queryClient.invalidateQueries({ queryKey: bundleKeys.visor(distId) });
    },
  });

  const mutationRevertir = useMutation({
    mutationFn: (ids: number[]) => revertir(ids),
    onSuccess: (data: { affected?: number } | undefined) => {
      setLastEvalIds([]);
      if ((data?.affected ?? 0) === 0) {
        setFlash({ msg: "No se pudo revertir", type: "err" });
        setTimeout(() => setFlash(null), 2000);
        return;
      }
      setFlash({ msg: "Revertido", type: "ok" });
      setTimeout(() => setFlash(null), 2000);
      queryClient.invalidateQueries({ queryKey: bundleKeys.visor(distId) });
    },
    onError: () => {
      setFlash({ msg: "Error al revertir", type: "err" });
      setTimeout(() => setFlash(null), 2000);
    },
  });

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    resetGroupState();
    setComentario("");
    setNewTemplateText("");
  }, [currentIndex, filtroVendedor, filtroSucursal, resetGroupState]);

  useEffect(() => {
    setComentario("");
  }, [currentFotoIdx]);

  useEffect(() => {
    setMobileFiltersOpen(false);
    setMobileToolsOpen(false);
  }, [currentIndex, filtroVendedor, filtroSucursal, visorTab]);

  useEffect(() => {
    if (totalGrupos <= 0) return;
    if (currentIndex < totalGrupos) return;
    setCurrentIndex(totalGrupos - 1);
    resetGroupState();
  }, [currentIndex, totalGrupos, setCurrentIndex, resetGroupState]);

  useEffect(() => {
    setCommentTemplates(readCommentTemplates());
  }, []);

  // WS: refrescar bundle al evaluar o cargar nueva exhibición
  useEffect(() => {
    if (!distId) return;
    let socket: WebSocket | null = null;
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const closeSocket = () => {
      if (!socket) return;
      socket.onclose = null;
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.onopen = () => socket?.close();
      } else {
        socket.close();
      }
    };

    const connect = () => {
      socket = new WebSocket(getWSUrl(distId));
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_exhibition" || data.type === "evaluation_updated") {
            queryClient.invalidateQueries({ queryKey: bundleKeys.visor(distId) });
          }
        } catch {
          /* ignore */
        }
      };
      socket.onclose = () => {
        if (!alive) return;
        reconnectTimer = setTimeout(connect, 5000);
      };
      socket.onerror = () => {};
    };

    connect();

    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      closeSocket();
    };
  }, [distId, queryClient]);

  // ── Combined keyboard handler ─────────────────────────────────────────────────

  useEffect(() => {
    const clearFocusTimer = () => {
      if (focusHoldTimerRef.current) {
        clearTimeout(focusHoldTimerRef.current);
        focusHoldTimerRef.current = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Space: focus-hold mode (keep existing)
      if (e.code === "Space") {
        if (isTypingTarget(e.target) || e.repeat) return;
        clearFocusTimer();
        focusHoldTimerRef.current = setTimeout(() => setFocusHoldActive(true), 500);
        return;
      }

      if (isTypingTarget(e.target)) return;

      const canEval =
        !publicDemo &&
        grupo &&
        todasVistas &&
        !isValidacion &&
        !mutationEvaluar.isPending &&
        !isSubmittingRef.current;
      const withMod = e.ctrlKey || e.metaKey;

      switch (e.key) {
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
          if (!(withMod && e.altKey)) return;
          {
            const idx = Number(e.key) - 1;
            const tpl = commentTemplates[idx];
            if (!tpl) return;
            e.preventDefault();
            applyCommentTemplate(tpl);
          }
          break;

        case "a":
        case "A":
          if (!withMod) return;
          e.preventDefault();
          if (!canEval) return;
          isSubmittingRef.current = true;
          {
            const ids = fotosGrupo.map((f) => f.id_exhibicion);
            setLastEvalIds(ids);
            mutationEvaluar.mutate({ ids, estado: "Aprobado", comentario });
          }
          break;

        case "r":
        case "R":
          if (!withMod) return;
          e.preventDefault();
          if (!canEval) return;
          isSubmittingRef.current = true;
          {
            const ids = fotosGrupo.map((f) => f.id_exhibicion);
            setLastEvalIds(ids);
            mutationEvaluar.mutate({ ids, estado: "Rechazado", comentario });
          }
          break;

        case "d":
        case "D":
          if (!withMod) return;
          e.preventDefault();
          if (!canEval) return;
          isSubmittingRef.current = true;
          {
            const ids = fotosGrupo.map((f) => f.id_exhibicion);
            setLastEvalIds(ids);
            mutationEvaluar.mutate({ ids, estado: "Destacado", comentario });
          }
          break;

        case "z":
        case "Z":
          if (!withMod) return;
          e.preventDefault();
          if (!lastEvalIds.length || mutationRevertir.isPending) return;
          mutationRevertir.mutate(lastEvalIds);
          break;

        case "ArrowRight":
          e.preventDefault();
          if (currentFotoIdx < totalFotos - 1) navigateToFoto(currentFotoIdx + 1);
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (currentFotoIdx > 0) navigateToFoto(currentFotoIdx - 1);
          break;

        case "ArrowDown":
          e.preventDefault();
          if (currentIndex < totalGrupos - 1) {
            setCurrentIndex(currentIndex + 1);
            resetGroupState();
            setComentario("");
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
            resetGroupState();
            setComentario("");
          }
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      clearFocusTimer();
      setFocusHoldActive(false);
    };

    const onBlur = () => {
      clearFocusTimer();
      setFocusHoldActive(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      clearFocusTimer();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    grupo, fotosGrupo, todasVistas, isValidacion, comentario,
    mutationEvaluar, mutationRevertir, lastEvalIds,
    currentIndex, currentFotoIdx, totalFotos, totalGrupos,
    setCurrentIndex, setCurrentFotoIdx, resetGroupState,
    navigateToFoto,
    commentTemplates,
  ]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function applyCommentTemplate(text: string) {
    const t = text.trim();
    if (!t) return;
    setComentario((c) => (c.trim() ? `${c.trim()} ${t}` : t));
  }

  function addCommentTemplate() {
    const t = newTemplateText.trim();
    if (!t) return;
    const next = [...commentTemplates.filter((x) => x !== t), t];
    setCommentTemplates(next);
    saveCommentTemplates(next);
    setNewTemplateText("");
  }

  async function handleEvaluar(estado: "Aprobado" | "Destacado" | "Rechazado") {
    if (publicDemo) {
      setFlash({ msg: "Solo vista demo (sin guardar)", type: "err" });
      setTimeout(() => setFlash(null), 2200);
      return;
    }
    if (!grupo || !user || mutationEvaluar.isPending || !todasVistas || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    const ids = fotosGrupo.map((f) => f.id_exhibicion);
    setLastEvalIds(ids);
    mutationEvaluar.mutate({ ids, estado, comentario });
  }

  function handleNextFoto() {
    navigateToFoto(currentFotoIdx + 1);
  }
  function handlePrevFoto() {
    navigateToFoto(currentFotoIdx - 1);
  }

  const handleNextExhibicion = useCallback(() => {
    if (currentIndex >= totalGrupos - 1) return;
    setCurrentIndex(currentIndex + 1);
    resetGroupState();
    setComentario("");
  }, [currentIndex, resetGroupState, setCurrentIndex, totalGrupos]);

  const handlePrevExhibicion = useCallback(() => {
    if (currentIndex <= 0) return;
    setCurrentIndex(currentIndex - 1);
    resetGroupState();
    setComentario("");
  }, [currentIndex, resetGroupState, setCurrentIndex]);

  function handleRevertir() {
    if (!lastEvalIds.length || mutationRevertir.isPending) return;
    mutationRevertir.mutate(lastEvalIds);
  }

  // ── Loading state ─────────────────────────────────────────────────────────────

  if (loadingPendientes && !mockFitDemo) {
    return (
      <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
        <Sidebar />
        <BottomNav />
        <div className="flex flex-col flex-1">
          <Topbar title="Evaluar" />
          <div className="flex-1 flex items-center justify-center">
            <PageSpinner />
          </div>
        </div>
      </div>
    );
  }

  // ── Shared: filter bar tab content ────────────────────────────────────────────

  const filterBarContent = (
    <div className="hidden md:flex shrink-0 items-center gap-2 px-4 py-1.5 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]">
      <div className="flex gap-1 bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg p-0.5">
        <button
          onClick={() => { setVisorTab("todas"); setCurrentIndex(0); resetGroupState(); }}
          className={cn(
            "px-3 py-1 text-xs font-semibold rounded-md transition-colors",
            visorTab === "todas"
              ? "bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]"
              : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]",
          )}
        >
          Todas
        </button>
        <button
          onClick={() => { setVisorTab("objetivo"); setCurrentIndex(0); resetGroupState(); }}
          className={cn(
            "px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1",
            visorTab === "objetivo"
              ? "bg-[var(--shelfy-accent)]/10 text-[var(--shelfy-accent)]"
              : "text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]",
          )}
        >
          Con Objetivo
          {grupos.filter((g) => g.fotos.some((f) => f.es_objetivo)).length > 0 && (
            <span className="text-[9px] font-black bg-[var(--shelfy-accent)]/20 text-[var(--shelfy-accent)] px-1 rounded-full">
              {grupos.filter((g) => g.fotos.some((f) => f.es_objetivo)).length}
            </span>
          )}
        </button>
      </div>
      <select
        value={filtroSucursal}
        onChange={(e) => { setFiltroSucursal(e.target.value); setCurrentIndex(0); }}
        className="h-8 px-2.5 rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-xs font-semibold text-[var(--shelfy-text)]"
      >
        <option value="Todas">Todas las sucursales</option>
        {sucursalesDisponibles.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select
        value={filtroVendedor}
        onChange={(e) => { setFiltroVendedor(e.target.value); setCurrentIndex(0); }}
        className="h-8 px-2.5 rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-xs font-semibold text-[var(--shelfy-text)]"
      >
        <option value="Todos">Todos los vendedores</option>
        {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      {/* Stats chips */}
      {stats && (
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-[var(--shelfy-muted)] bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] px-2 py-0.5 rounded-full">
            {stats.pendientes} pendientes
          </span>
          {stats.aprobadas > 0 && (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              {stats.aprobadas} ✓
            </span>
          )}
          {stats.rechazadas > 0 && (
            <span className="text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
              {stats.rechazadas} ✗
            </span>
          )}
        </div>
      )}
    </div>
  );

  // ── Empty state ───────────────────────────────────────────────────────────────

  const emptyState = (
    <div className="flex flex-col items-center justify-center flex-1 text-center px-6">
      <div className="w-20 h-20 bg-violet-100 rounded-3xl flex items-center justify-center text-violet-500 mb-6 shadow-inner">
        <Check size={32} strokeWidth={3} />
      </div>
      <p className="text-2xl font-black text-slate-800 mb-2 tracking-tight">¡Todo al día!</p>
      <p className="text-slate-500 font-medium mb-8">No hay exhibiciones pendientes de evaluación</p>
      <button
        onClick={() => queryClient.invalidateQueries({ queryKey: bundleKeys.visor(distId) })}
        className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold shadow-sm hover:bg-slate-50 transition-all active:scale-95"
      >
        <RefreshCw size={16} /> Buscar nuevas
      </button>
    </div>
  );

  // ── Flash notification ────────────────────────────────────────────────────────

  const flashEl = (
    <AnimatePresence>
      {flash && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          className={cn(
            "absolute top-3 left-1/2 -translate-x-1/2 z-50 px-5 py-2 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 pointer-events-none",
            flash.msg === "Rechazado" && "bg-red-500 text-white",
            flash.msg === "Destacado" && "bg-amber-500 text-white",
            flash.msg === "Aprobado" && "bg-emerald-500 text-white",
            flash.type === "err" && flash.msg !== "Rechazado" && "bg-red-500 text-white",
            flash.type === "ok" && flash.msg !== "Rechazado" && flash.msg !== "Destacado" && flash.msg !== "Aprobado" && "bg-emerald-500 text-white",
          )}
        >
          {flash.msg === "Aprobado" && <Check size={16} strokeWidth={3} />}
          {flash.msg === "Rechazado" && <X size={16} strokeWidth={3} />}
          {flash.msg === "Destacado" && <Flame size={16} strokeWidth={3} />}
          {flash.msg}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── Kbd shortcuts legend ──────────────────────────────────────────────────────

  const kbdLegend = (
    <div className="flex items-center flex-wrap justify-center gap-1.5">
      <ShortcutItem
        keys={<KbdGroup><Kbd>⌘/Ctrl</Kbd><span>+</span><Kbd>R</Kbd></KbdGroup>}
        label="Rechazar"
      />
      <ShortcutItem
        keys={<KbdGroup><Kbd>⌘/Ctrl</Kbd><span>+</span><Kbd>D</Kbd></KbdGroup>}
        label="Destacar"
      />
      <ShortcutItem
        keys={<KbdGroup><Kbd>⌘/Ctrl</Kbd><span>+</span><Kbd>A</Kbd></KbdGroup>}
        label="Aprobar"
      />
      <ShortcutItem
        keys={<KbdGroup><Kbd>⌘/Ctrl</Kbd><span>+</span><Kbd>Z</Kbd></KbdGroup>}
        label="Revertir"
      />
      <ShortcutItem
        keys={<KbdGroup><Kbd>⌘/Ctrl</Kbd><span>+</span><Kbd>+</Kbd><Kbd>-</Kbd><Kbd>0</Kbd></KbdGroup>}
        label="Zoom"
      />
      <ShortcutItem
        keys={<KbdGroup><Kbd>⌘/Ctrl</Kbd><span>+</span><Kbd>Alt</Kbd><span>+</span><Kbd>1..9</Kbd></KbdGroup>}
        label="Frases"
      />
      <ShortcutItem keys={<KbdGroup><Kbd>←</Kbd><Kbd>→</Kbd></KbdGroup>} label="Fotos" />
      <ShortcutItem keys={<KbdGroup><Kbd>↑</Kbd><Kbd>↓</Kbd></KbdGroup>} label="Grupos" />
    </div>
  );

  // ── Frases rápidas popover ────────────────────────────────────────────────────

  const frasesPopover = (dark = false) => (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
            dark
              ? "border-white/20 bg-white/10 text-white hover:bg-white/15"
              : "border-slate-200/90 bg-white/80 text-slate-700 hover:bg-white dark:bg-slate-950/40 dark:border-slate-600 dark:text-slate-200",
          )}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <MessageSquarePlus className={cn("size-3.5 shrink-0", dark ? "text-white/70" : "text-slate-500")} />
            <span className="text-[11px] font-semibold truncate">Frases rápidas</span>
          </span>
          <ChevronUp className={cn("size-3.5 shrink-0 opacity-60", dark && "text-white/70")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className={cn(
          "w-72 max-h-72 overflow-y-auto p-3",
          dark
            ? "border-white/10 bg-zinc-900 text-white"
            : "border-slate-200/90 bg-white text-slate-800 shadow-lg",
        )}
      >
        <p
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider mb-2",
            dark ? "text-white/50" : "text-slate-500",
          )}
        >
          Insertar con un clic
        </p>
        <div className="flex flex-col gap-1 mb-3">
          {commentTemplates.length === 0 ? (
            <span className={cn("text-xs", dark ? "text-white/40" : "text-slate-500")}>No hay frases guardadas.</span>
          ) : (
            commentTemplates.map((t) => (
              <button
                key={t}
                type="button"
                className={cn(
                  "text-left text-xs py-1.5 px-2 rounded-md border",
                  dark
                    ? "bg-white/5 hover:bg-violet-500/25 border-white/10"
                    : "bg-slate-50 hover:bg-violet-50 border-slate-200/80 text-slate-700",
                )}
                onClick={() => applyCommentTemplate(t)}
              >
                {t}
              </button>
            ))
          )}
        </div>
        <p className={cn("text-[10px] font-bold uppercase tracking-wider mb-1", dark ? "text-white/50" : "text-slate-500")}>
          Nueva frase
        </p>
        <div className="flex gap-1">
          <input
            type="text"
            value={newTemplateText}
            onChange={(e) => setNewTemplateText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCommentTemplate(); }}
            placeholder="Ej. Falta cartel con precios"
            className={cn(
              "flex-1 min-w-0 rounded-md border px-2 py-1.5 text-xs",
              dark
                ? "border-white/15 bg-black/40 text-white placeholder:text-white/35"
                : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400",
            )}
          />
          <Button type="button" size="sm" className="shrink-0 h-8 text-xs" onClick={addCommentTemplate}>
            Guardar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "flex bg-[var(--shelfy-bg)] overflow-hidden overscroll-none",
        isMdUp ? "h-[100dvh]" : "fixed inset-0 z-0 h-[100dvh] w-full max-h-[100dvh]",
      )}
    >
      <Sidebar />
      <div className="hidden md:block">
        <BottomNav />
      </div>
      <div className="flex flex-col flex-1 min-w-0 h-full min-h-0 overflow-hidden overscroll-none">

        {/* Topbar (desktop) */}
        <div className="hidden md:block shrink-0">
          <Topbar title="Evaluar Exhibiciones" />
        </div>

        {/* Filter bar */}
        {filterBarContent}

        {mockFitDemo && (
          <div className="shrink-0 px-4 py-2 bg-violet-600/90 text-white text-xs font-semibold text-center border-b border-violet-500/50">
            {publicDemo ? (
              <>
                Vista demo completa (PDV + evaluación simulados, sin login). Con sesión:{" "}
                <a href="/visor?mock=fit" className="underline font-bold">
                  /visor?mock=fit
                </a>
              </>
            ) : (
              <>
                Vista mock (?mock=fit). Datos reales:{" "}
                <a href="/visor" className="underline font-bold">
                  /visor
                </a>
                {" · "}Demo sin login:{" "}
                <a href="/visor/demo" className="underline font-bold">
                  /visor/demo
                </a>
              </>
            )}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 flex min-h-0">

          {errorPend && (
            <p className="absolute top-2 left-1/2 -translate-x-1/2 z-50 text-red-500 text-xs font-semibold bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg">
              {(errorPend as Error).message}
            </p>
          )}

          {totalGrupos === 0 ? (
            emptyState
          ) : !grupo ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-slate-200/80 flex items-center justify-center mb-4">
                <RefreshCw size={20} className="text-slate-500 animate-spin" />
              </div>
              <p className="text-slate-700 font-semibold">Reacomodando exhibiciones...</p>
            </div>
          ) : (
            <>
              {/* ═══ DESKTOP 3-PANEL LAYOUT ═══ */}
              <div className="hidden md:flex flex-1 min-h-0 relative">

                {/* ── CENTER CANVAS — imagen principal ────────────────────── */}
                {/* (order-first so left side is the photo, right side is the info panel) */}

                {/* ── RIGHT PANEL — Exhibición ────────────────────────────── */}
                {/* Rendered after center canvas in DOM but visually on the right via flex order */}
                <div className="order-last w-[26rem] shrink-0 border-l border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] flex flex-col overflow-hidden overflow-x-hidden">
                  {/* Panel body: tarjetas meta + remito (colapsable) */}
                  <VisorRemitoFocusLayout
                    resetKey={remitoPanelKey}
                    showRemito={!!ultimaCompraFuente}
                    meta={(remitoExpanded) => (
                      <div
                        className={cn(
                          "px-3 flex flex-col min-w-0",
                          remitoExpanded ? "py-1.5 pb-1" : "py-2 pb-3 gap-2",
                        )}
                      >
                        {remitoExpanded ? (
                          <motion.div layout transition={VISOR_LAYOUT_TRANSITION} className="min-w-0">
                            <VisorMetaMinimizedBar
                              vendedor={vendedorExhibicion}
                              pdvNombre={pdvNombreMin}
                              codigoCliente={String(nroForErp || grupo?.nro_cliente || "")}
                              envio={formatFechaAR(grupo?.fecha_hora ?? "")}
                              currentIndex={currentIndex}
                              totalGrupos={totalGrupos}
                              sinContacto={sinContactoPdv}
                            />
                          </motion.div>
                        ) : (
                          <>
                        <motion.div layout transition={VISOR_LAYOUT_TRANSITION}>
                          <VisorPanelCard
                            title="Exhibición"
                            icon={Camera}
                            accent="violet"
                            headerRight={
                              <Badge
                                variant="outline"
                                className={cn(
                                  "h-5 px-2 text-[10px] font-semibold tabular-nums border",
                                  visorPanelChipClass("violet"),
                                )}
                              >
                                <span className="font-black">{currentIndex + 1}</span>
                                <span className="opacity-60 font-normal">/{totalGrupos}</span>
                              </Badge>
                            }
                            headerExtra={
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (currentIndex > 0) {
                                        setCurrentIndex(currentIndex - 1);
                                        resetGroupState();
                                        setComentario("");
                                      }
                                    }}
                                    disabled={currentIndex === 0}
                                    className="flex-1 h-8 flex items-center justify-center rounded-md border border-slate-200/90 bg-white/80 text-slate-600 hover:bg-white disabled:opacity-30 transition-colors text-xs gap-1 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-300"
                                  >
                                    <ChevronLeft size={13} /> Anterior
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (currentIndex < totalGrupos - 1) {
                                        setCurrentIndex(currentIndex + 1);
                                        resetGroupState();
                                        setComentario("");
                                      }
                                    }}
                                    disabled={currentIndex >= totalGrupos - 1}
                                    className="flex-1 h-8 flex items-center justify-center rounded-md border border-slate-200/90 bg-white/80 text-slate-600 hover:bg-white disabled:opacity-30 transition-colors text-xs gap-1 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-300"
                                  >
                                    Siguiente <ChevronRight size={13} />
                                  </button>
                                </div>
                            }
                          >
                            {fotosGrupo.some((f) => f.es_objetivo) ? (
                              <motion.div
                                animate={{ opacity: [0.8, 1, 0.8] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 border border-violet-200 text-violet-700 text-[10px] font-bold mb-1.5"
                              >
                                🎯 Con Objetivo
                              </motion.div>
                            ) : null}

                            <VisorPanelFieldList>
                              <VisorPanelExhibicionGrid
                                vendedor={
                                  loadingERP && user?.usa_contexto_erp && !skipErpFetch
                                    ? "…"
                                    : vendedorExhibicion
                                }
                                sucursal={sucursalExhibicion}
                                tipoPdv={tipoPdvDisplay}
                                envio={formatFechaAR(grupo.fecha_hora)}
                              />
                            </VisorPanelFieldList>

                            {user?.usa_contexto_erp && !skipErpFetch ? (
                              <div className="mt-1.5 rounded-md border border-slate-200/80 dark:border-slate-700/60 bg-white/60 dark:bg-slate-950/25 px-2.5 py-1.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 leading-none">
                                  Contexto ERP
                                </p>
                                {loadingERP ? (
                                  <div className="flex flex-col gap-1">
                                    <Skeleton className="h-3.5 w-full rounded" />
                                    <Skeleton className="h-3.5 w-3/4 rounded" />
                                  </div>
                                ) : erpContext?.encontrado || pdvInfo || tieneComprobante ? (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[11px] text-slate-500 leading-tight">Tipo comercio</span>
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "h-5 px-1.5 text-[9px] font-bold border-0",
                                          conIngresoComercio
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "bg-red-100 text-red-600",
                                        )}
                                      >
                                        {conIngresoComercio ? "Con ingreso" : "Sin ingreso"}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[11px] text-slate-500 leading-tight">Compró 30d</span>
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "h-5 px-1.5 text-[9px] font-black border-0",
                                          compraUltimos30
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "bg-red-100 text-red-600",
                                        )}
                                      >
                                        {compraUltimos30 ? "SÍ" : "NO"}
                                      </Badge>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-amber-600 font-semibold">No encontrado en ERP</span>
                                )}
                              </div>
                            ) : null}
                          </VisorPanelCard>
                        </motion.div>

                        <motion.div layout transition={VISOR_LAYOUT_TRANSITION}>
                          <VisorPanelCard
                            title="Info del PDV"
                            icon={Store}
                            accent="sky"
                            footer={
                              pdvInfo && !pdvLoading ? (
                                <PdvVitalidadBadges activoComercial={activoComercial} className="pt-0" />
                              ) : undefined
                            }
                          >
                      {pdvLoading ? (
                        <div className="flex flex-col gap-1.5 animate-pulse">
                          <Skeleton className="h-4 w-4/5 rounded" />
                          <Skeleton className="h-3 w-full rounded" />
                          <Skeleton className="h-12 w-full rounded-md" />
                        </div>
                      ) : pdvInfo ? (
                        <>
                          <VisorPdvIdentityHeader
                            nombreFantasia={pdvInfo.nombre_fantasia}
                            nombreRazon={pdvInfo.nombre_razon_social}
                            codigoCliente={nroForErp || grupo.nro_cliente}
                            fechaAlta={pdvInfo.fecha_alta ?? erpContext?.fecha_alta}
                          />
                          <VisorPanelFieldList>
                            <VisorPanelLocationFields
                              domicilio={pdvInfo.domicilio}
                              provincia={pdvInfo.provincia}
                              localidad={pdvInfo.localidad}
                              telefono={pdvInfo.telefono}
                              celular={pdvInfo.celular}
                            />
                          </VisorPanelFieldList>
                          {erpContext?.nro_ruta || erpContext?.dia_visita ? (
                            <VisorPanelFieldList className="mt-1.5">
                              <VisorPanelField
                                icon={Calendar}
                                label="Ruta / Visita"
                                value={[erpContext?.nro_ruta && `R${erpContext.nro_ruta}`, erpContext?.dia_visita]
                                  .filter(Boolean)
                                  .join(" · ")}
                              />
                            </VisorPanelFieldList>
                          ) : null}
                        </>
                      ) : skipErpFetch ? (
                        <p className="text-[11px] text-slate-500 italic">Sin código ERP en la exhibición</p>
                      ) : erpContext?.encontrado ? (
                        <>
                          <VisorPdvIdentityHeader
                            nombreFantasia={erpContext.nombre_fantasia}
                            nombreRazon={erpContext.razon_social}
                            codigoCliente={nroForErp || grupo.nro_cliente}
                            fechaAlta={erpContext.fecha_alta}
                          />
                          <VisorPanelFieldList>
                            <VisorPanelLocationFields
                              domicilio={erpContext.domicilio}
                              localidad={erpContext.localidad}
                              telefono={erpContext.telefono}
                              celular={erpContext.celular}
                            />
                          </VisorPanelFieldList>
                          {erpContext.nro_ruta || erpContext.dia_visita ? (
                            <VisorPanelFieldList className="mt-1.5">
                              <VisorPanelField
                                icon={Calendar}
                                label="Ruta / Visita"
                                value={[erpContext.nro_ruta && `R${erpContext.nro_ruta}`, erpContext.dia_visita]
                                  .filter(Boolean)
                                  .join(" · ")}
                              />
                            </VisorPanelFieldList>
                          ) : null}
                        </>
                      ) : !skipErpFetch && user?.usa_contexto_erp && !loadingERP ? (
                        <p className="text-[11px] text-amber-600 font-semibold">No encontrado en ERP</p>
                      ) : (
                        <p className="text-[11px] text-slate-500 italic">Sin datos en padrón</p>
                      )}
                          </VisorPanelCard>
                        </motion.div>
                          </>
                        )}
                      </div>
                    )}
                    remito={(remitoExpanded) => (
                      <UltimaCompraRemitoCard
                        layout="panel-fill"
                        adaptive
                        density="compact"
                        focusMode={remitoExpanded}
                        fillHeight={!remitoExpanded}
                        fecha={ultimaCompraFuente!}
                        comprobantes={ultimaCompraComprobantes}
                        comprobante={ultimoComprobante}
                        articulos={ultimaCompraArticulos}
                        resumen={ultimaCompraResumen}
                        diasDesde={diasUltCompra}
                        className="w-full"
                      />
                    )}
                  />
                </div>

                {/* ── CENTER CANVAS ───────────────────────────────────────── */}
                <div className="order-first flex-1 flex flex-col min-h-0 min-w-0 relative z-[1]">
                  {/* Flash */}
                  {flashEl}

                  {/* Image area — edge-to-edge, sin caja anidada */}
                  <div className="flex-1 min-h-0 relative overflow-hidden">
                    <div className="absolute inset-0">
                      {isMdUp ? (
                        <FotoViewer
                          key={`g-${currentIndex}`}
                          ref={desktopFotoViewerRef}
                          driveUrl={fotosGrupo[currentFotoIdx]?.drive_link ?? ""}
                          idExhibicion={fotosGrupo[currentFotoIdx]?.id_exhibicion}
                          priority
                          onZoomChange={handlePhotoZoomChange}
                          overlay={
                            !focusHoldActive ? (
                              <VisorPhotoControls
                                viewerRef={desktopFotoViewerRef}
                                zoomActions={photoZoomActions}
                                userZoom={photoZoom}
                                presentationZoom={photoBaselineZoom}
                                totalFotos={fotosGrupo.length}
                                currentFotoIdx={currentFotoIdx}
                                onPrevFoto={handlePrevFoto}
                                onNextFoto={handleNextFoto}
                                onSelectFoto={navigateToFoto}
                              />
                            ) : null
                          }
                        />
                      ) : null}
                    </div>

                    {/* Validation lock overlay */}
                    {isValidacion && (
                      <div className="absolute inset-0 bg-amber-900/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20 pointer-events-none">
                        <Lock size={40} className="text-amber-200" />
                        <p className="text-white font-black text-base tracking-tight">VALIDACIÓN ERP</p>
                        <p className="text-amber-100 text-xs font-semibold text-center px-8">
                          El cliente no figura en el ERP.<br />
                          Se habilitará cuando impacten los datos.
                        </p>
                      </div>
                    )}

                    {/* Focus-hold hint (subtle) */}
                    <AnimatePresence>
                      {focusHoldActive && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 z-30 ring-4 ring-inset ring-[var(--shelfy-primary)]/40 pointer-events-none"
                        />
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Evaluar (70%) | Observaciones (30%) — bajo la foto, misma altura */}
                  <div className="shrink-0 px-4 pb-3 pt-2 space-y-2">
                    <div className="grid w-full grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-2 min-h-[10.5rem] auto-rows-[1fr]">
                      <VisorEvalPanel className="min-w-0 h-full min-h-0">
                        <VisorEvalBar
                          prominent
                          onRevertir={handleRevertir}
                          onRechazado={() => handleEvaluar("Rechazado")}
                          onDestacado={() => handleEvaluar("Destacado")}
                          onAprobado={() => handleEvaluar("Aprobado")}
                          onRefresh={() => queryClient.invalidateQueries({ queryKey: bundleKeys.visor(distId) })}
                          canRevertir={lastEvalIds.length > 0}
                          revertirPending={mutationRevertir.isPending}
                          evaluarPending={mutationEvaluar.isPending}
                          evaluarDisabled={publicDemo || !todasVistas || isValidacion}
                          kbdLegend={kbdLegend}
                        />
                      </VisorEvalPanel>
                      <VisorObservacionesCard
                        className="min-w-0 h-full min-h-0"
                        value={comentario}
                        onChange={setComentario}
                        frasesSlot={frasesPopover(false)}
                      />
                    </div>
                    <VisorEnviarGuiaExhibicion
                      distId={distId}
                      idExhibicion={idExhibicionActiva}
                      nombreVendedor={vendedorExhibicion}
                      className="w-full"
                    />
                  </div>
                </div>

              </div>

              {/* ═══ MOBILE LAYOUT ════════════════════════════════════════════ */}
              <div className="flex md:hidden flex-col flex-1 min-h-0 max-h-full p-0 relative overflow-hidden overscroll-none">
                {/* Flash */}
                {flashEl}

                {/* Canvas + overlays */}
                <div className="flex-1 min-h-0 relative">
                  <div className="absolute inset-0">
                    {!isMdUp ? (
                      <FotoViewer
                        key={`g-${currentIndex}`}
                        ref={mobileFotoViewerRef}
                        driveUrl={fotosGrupo[currentFotoIdx]?.drive_link ?? ""}
                        idExhibicion={fotosGrupo[currentFotoIdx]?.id_exhibicion}
                        priority
                        onZoomChange={handlePhotoZoomChange}
                        photoNavigation={{
                          onPrev: handlePrevFoto,
                          onNext: handleNextFoto,
                          canPrev: fotosGrupo.length > 1 && currentFotoIdx > 0,
                          canNext: fotosGrupo.length > 1 && currentFotoIdx < fotosGrupo.length - 1,
                          onPrevExhibicion: handlePrevExhibicion,
                          onNextExhibicion: handleNextExhibicion,
                          canPrevExhibicion: currentIndex > 0,
                          canNextExhibicion: currentIndex < totalGrupos - 1,
                        }}
                        overlay={
                          !focusHoldActive ? (
                            <VisorPhotoControls
                              viewerRef={mobileFotoViewerRef}
                              zoomActions={photoZoomActions}
                              userZoom={photoZoom}
                              presentationZoom={photoBaselineZoom}
                              totalFotos={fotosGrupo.length}
                              currentFotoIdx={currentFotoIdx}
                              onPrevFoto={handlePrevFoto}
                              onNextFoto={handleNextFoto}
                              onSelectFoto={navigateToFoto}
                            />
                          ) : null
                        }
                      />
                    ) : null}
                  </div>

                  {/* Mobile top overlay */}
                  <AnimatePresence>
                    {!focusHoldActive && (
                      <motion.div
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/42 via-black/12 to-transparent pt-3 pb-5 px-3 text-white z-10"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                            <span className="text-[10px] font-black bg-violet-600/90 px-2 py-0.5 rounded-md">
                              #{fotosGrupo[currentFotoIdx]?.id_exhibicion || "—"}
                            </span>
                            <span className="text-[10px] font-bold truncate text-white/90">
                              🏪 Cód. {grupo.nro_cliente ?? "—"}
                            </span>
                            <span className="text-[10px] font-bold truncate text-white/70">
                              👤 {vendedorExhibicion}
                            </span>
                            {fotosGrupo.some((f) => f.es_objetivo) && (
                              <motion.span
                                animate={{ scale: [1, 1.08, 1] }}
                                transition={{ duration: 1.6, repeat: Infinity }}
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/30 text-violet-200 border border-violet-400/40"
                              >
                                🎯 Objetivo
                              </motion.span>
                            )}
                          </div>
                          <span className="text-[9px] font-bold text-white/50 shrink-0 ml-2">
                            {currentIndex + 1}/{totalGrupos}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => setMobileFiltersOpen((v) => !v)}
                            className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/35 px-2 py-1 text-[10px] font-bold text-white/85 backdrop-blur-sm"
                          >
                            Filtros
                            <ChevronUp size={11} className={cn("transition-transform", mobileFiltersOpen && "rotate-180")} />
                          </button>
                        </div>

                        {mobileFiltersOpen && (
                          <div className="mt-2 rounded-xl border border-white/15 bg-black/45 p-2 backdrop-blur-md">
                            <div className="grid grid-cols-1 gap-2">
                              <label className="flex flex-col gap-1">
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-white/65">Sucursal</span>
                                <select
                                  value={filtroSucursal}
                                  onChange={(e) => { setFiltroSucursal(e.target.value); setCurrentIndex(0); }}
                                  className="h-7 rounded-md border border-white/20 bg-black/30 px-2 text-[11px] font-semibold text-white"
                                >
                                  <option value="Todas">Todas las sucursales</option>
                                  {sucursalesDisponibles.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1">
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-white/65">Vendedor</span>
                                <select
                                  value={filtroVendedor}
                                  onChange={(e) => { setFiltroVendedor(e.target.value); setCurrentIndex(0); }}
                                  className="h-7 rounded-md border border-white/20 bg-black/30 px-2 text-[11px] font-semibold text-white"
                                >
                                  <option value="Todos">Todos los vendedores</option>
                                  {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
                                </select>
                              </label>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Validation lock */}
                  {isValidacion && (
                    <div className="absolute inset-0 bg-amber-900/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20 pointer-events-none">
                      <Lock size={40} className="text-amber-200" />
                      <p className="text-white font-black text-base tracking-tight">VALIDACIÓN ERP</p>
                      <p className="text-amber-100 text-xs font-semibold text-center px-8">
                        El cliente no figura en el ERP.
                      </p>
                    </div>
                  )}

                  {/* Mobile bottom bar */}
                  <AnimatePresence>
                    {!focusHoldActive && (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-2 left-2 right-2 z-10 flex flex-col pointer-events-auto rounded-2xl gap-1.5 px-3 py-2 text-white overflow-hidden"
                        style={{
                          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
                          background: "linear-gradient(160deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 55%, rgba(120,80,255,0.07) 100%)",
                          backdropFilter: "blur(20px) saturate(160%)",
                          WebkitBackdropFilter: "blur(20px) saturate(160%)",
                          border: "1px solid rgba(255,255,255,0.18)",
                          boxShadow: "0 14px 32px rgba(2,6,23,0.5), inset 0 1px 0 rgba(255,255,255,0.26)",
                        }}
                      >
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] leading-tight">
                          <span className="font-bold truncate max-w-[45%]">{vendedorExhibicion}</span>
                          <span className="text-white/50 font-mono">#{nroForErp || grupo.nro_cliente || "—"}</span>
                          <span className="text-white/45">{formatFechaAR(grupo.fecha_hora)}</span>
                          {erpContext?.encontrado && !loadingERP && (
                            <>
                              <span className={conIngresoComercio ? "text-emerald-400" : "text-red-400"}>
                                {conIngresoComercio ? "Con ingreso" : "Sin ingreso"}
                              </span>
                              <span className={compraUltimos30 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                30d: {compraUltimos30 ? "SÍ" : "NO"}
                              </span>
                            </>
                          )}
                        </div>

                        {mobileToolsOpen && (
                          <>
                            {frasesPopover(true)}
                            <Textarea
                              placeholder="Observaciones…"
                              rows={2}
                              value={comentario}
                              onChange={(e) => setComentario(e.target.value)}
                              className="min-h-[44px] resize-none bg-white/10 border-white/15 text-xs text-white placeholder:text-white/35"
                            />
                          </>
                        )}

                        <div className="flex justify-center pb-1">
                          <VisorEnviarGuiaExhibicion
                            distId={distId}
                            idExhibicion={idExhibicionActiva}
                            nombreVendedor={vendedorExhibicion}
                            variant="compact"
                            className="bg-white/10 border-white/20 text-white hover:bg-white/15 text-[10px]"
                          />
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 justify-center">
                          <button
                            onClick={handleRevertir}
                            disabled={!lastEvalIds.length || mutationRevertir.isPending}
                            className="size-9 flex items-center justify-center rounded-full bg-white/10 text-white/50 disabled:opacity-30 transition-all active:scale-90 border border-white/10"
                          >
                            <RotateCcw size={14} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => handleEvaluar("Rechazado")}
                            disabled={publicDemo || mutationEvaluar.isPending || !todasVistas || isValidacion}
                            className="size-11 flex items-center justify-center rounded-full bg-[#fa5252] text-white shadow-[0_2px_10px_rgba(250,82,82,0.4)] disabled:opacity-20 transition-all active:scale-90"
                          >
                            <X size={20} strokeWidth={3.5} />
                          </button>
                          <button
                            onClick={() => handleEvaluar("Destacado")}
                            disabled={publicDemo || mutationEvaluar.isPending || !todasVistas || isValidacion}
                            className="size-12 flex items-center justify-center rounded-full bg-[#f97316] text-white shadow-[0_2px_12px_rgba(249,115,22,0.45)] disabled:opacity-20 transition-all active:scale-90"
                          >
                            <Flame size={22} strokeWidth={3} className="fill-white/20" />
                          </button>
                          <button
                            onClick={() => handleEvaluar("Aprobado")}
                            disabled={publicDemo || mutationEvaluar.isPending || !todasVistas || isValidacion}
                            className="size-11 flex items-center justify-center rounded-full bg-[#10b981] text-white shadow-[0_2px_10px_rgba(16,185,129,0.4)] disabled:opacity-20 transition-all active:scale-90"
                          >
                            <Check size={20} strokeWidth={3.5} />
                          </button>
                          <button
                            onClick={() => queryClient.invalidateQueries({ queryKey: bundleKeys.visor(distId) })}
                            className="size-9 flex items-center justify-center rounded-full bg-amber-400/80 text-white transition-all active:scale-90"
                          >
                            <RefreshCw size={14} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => setMobileToolsOpen((v) => !v)}
                            className="h-9 px-2.5 flex items-center justify-center rounded-full bg-white/10 text-white/85 transition-all active:scale-90 border border-white/10 text-[10px] font-bold"
                          >
                            {mobileToolsOpen ? "Ocultar" : "Obs"}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VisorPageWithGlassTune() {
  const searchParams = useSearchParams();
  const glassTuneEnabled =
    process.env.NODE_ENV === "development" && searchParams.get("glassTune") !== "0";

  return (
    <VisorGlassTuneProvider enabled={glassTuneEnabled}>
      <VisorPageContent />
      {glassTuneEnabled ? <VisorGlassTunePanel /> : null}
    </VisorGlassTuneProvider>
  );
}

export default function VisorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen bg-[var(--shelfy-bg)] items-center justify-center">
          <PageSpinner />
        </div>
      }
    >
      <VisorPageWithGlassTune />
    </Suspense>
  );
}
