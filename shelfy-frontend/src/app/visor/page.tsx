"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { PageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useViewerStore } from "../../store/useViewerStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchVisorBundle, fetchVendedores,
  evaluar, revertir,
  resolveImageUrl, getWSUrl,
  type GrupoPendiente, type VisorBundle,
} from "@/lib/api";
import { bundleKeys } from "@/lib/query-keys";
import { BUNDLE_STALE_MS, BUNDLE_GC_MS } from "@/components/providers/ReactQueryProvider";
import { BundleRevalidatingBadge } from "@/components/shared/BundleRevalidatingBadge";
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
import { UltimaCompraRemitoCard } from "@/components/visor/UltimaCompraDetalle";
import { VisorRemitoFocusLayout } from "@/components/visor/VisorRemitoFocusLayout";
import { VisorMetaMinimizedBar } from "@/components/visor/VisorMetaMinimizedBar";
import { VISOR_LAYOUT_TRANSITION } from "@/components/visor/visor-layout-motion";
import { PdvVitalidadBadges } from "@/components/visor/PdvVitalidadBadges";
import { VisorPdvIdentityHeader } from "@/components/visor/VisorPdvIdentityHeader";
import { VisorEvalBar } from "@/components/visor/VisorEvalBar";
import { VisorEvalPanel } from "@/components/visor/VisorEvalPanel";
import { VisorObservacionesCard } from "@/components/visor/VisorObservacionesCard";
import {
  VisorPanelCard,
  VisorPanelExhibicionGrid,
  VisorPanelField,
  VisorPanelFieldList,
  VisorPanelLocationFields,
  visorPanelChipClass,
} from "@/components/visor/VisorPanelCard";

const VISOR_TEMPLATE_KEY = "shelfy:visor:comment-templates";

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

function daysSinceIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

// ── FotoViewer ────────────────────────────────────────────────────────────────

function FotoViewer({
  driveUrl,
  idExhibicion,
  priority = false,
}: {
  driveUrl: string;
  idExhibicion?: number;
  priority?: boolean;
}) {
  const [err, setErr] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const frameRef = useRef<HTMLDivElement | null>(null);
  const src = resolveImageUrl(driveUrl, idExhibicion);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDragging(false);
  }, [src]);

  const clampPan = useCallback((nextX: number, nextY: number, nextZoom: number) => {
    const frame = frameRef.current;
    if (!frame || nextZoom <= 1) return { x: 0, y: 0 };
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    const maxX = ((nextZoom - 1) * w) / 2;
    const maxY = ((nextZoom - 1) * h) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, nextX)),
      y: Math.max(-maxY, Math.min(maxY, nextY)),
    };
  }, []);

  const applyZoom = useCallback(
    (nextZoomRaw: number) => {
      const nextZoom = Math.max(1, Math.min(5, Number(nextZoomRaw.toFixed(2))));
      setZoom(nextZoom);
      setPan((prev) => clampPan(prev.x, prev.y, nextZoom));
    },
    [clampPan],
  );

  const onWheelZoom = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      applyZoom(zoom + (e.deltaY < 0 ? 0.2 : -0.2));
    },
    [applyZoom, zoom],
  );

  const onDoubleClickZoom = useCallback(() => {
    applyZoom(zoom <= 1 ? 2 : 1);
  }, [applyZoom, zoom]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (zoom <= 1) return;
      setDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pan.x, pan.y, zoom],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging || zoom <= 1) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan(clampPan(dragStartRef.current.panX + dx, dragStartRef.current.panY + dy, zoom));
    },
    [clampPan, dragging, zoom],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        applyZoom(zoom + 0.2);
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        applyZoom(zoom - 0.2);
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        applyZoom(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyZoom, zoom]);

  if (!src || err) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-slate-100 text-slate-400 gap-2 rounded-2xl">
        <ImageOff size={40} className="opacity-40" />
        <span className="text-xs font-medium">Sin imagen disponible</span>
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-900/20 border border-white/5 shadow-[0_8px_26px_rgba(2,6,23,0.22)] select-none"
      onWheel={onWheelZoom}
      onDoubleClick={onDoubleClickZoom}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      tabIndex={-1}
      title="Doble click o rueda para zoom. Arrastrar para mover."
      style={{ cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-30"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/18 via-slate-900/8 to-slate-900/20" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Exhibición ${idExhibicion}`}
        className="relative z-[1] w-full h-full object-contain rounded-2xl p-1 md:p-2"
        loading={priority ? "eager" : "lazy"}
        onError={() => setErr(true)}
        draggable={false}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center center",
          transition: dragging ? "none" : "transform 120ms ease-out",
        }}
      />
      <div className="absolute z-[2] left-2 bottom-2 text-[10px] px-1.5 py-0.5 rounded bg-black/35 text-white/80 font-mono">
        {zoom.toFixed(1)}×
      </div>
    </div>
  );
}

function useEagerPreload(grupos: GrupoPendiente[]) {
  useEffect(() => {
    if (!grupos.length) return;
    const allUrls = grupos
      .flatMap((g) => (g.fotos ?? []).map((f) => resolveImageUrl(f.drive_link, f.id_exhibicion)))
      .filter((u): u is string => !!u);
    [...new Set(allUrls)].forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, [grupos]);
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

export default function VisorPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lastEvalIds = useRef<number[]>([]);

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
    isLoading: loadingPendientes,
    error: errorPend,
  } = useQuery({
    queryKey: bundleKeys.visor(distId),
    queryFn: () => fetchVisorBundle(distId),
    enabled: !!user && distId > 0,
    staleTime: BUNDLE_STALE_MS,
    gcTime: BUNDLE_GC_MS,
    placeholderData: (prev) => prev,
    refetchInterval: 90_000,
  });

  const revalidatingVisor = !!visorBundle?.meta?.revalidating;

  // Extract data from bundle (field names adapted to match existing JSX)
  const grupos: GrupoPendiente[] = (visorBundle?.pendientes ?? [])
    .filter((g) => Array.isArray(g.fotos) && g.fotos.length > 0) as GrupoPendiente[];
  const stats = visorBundle?.stats
    ? {
        pendientes: visorBundle.stats.pendientes,
        aprobadas: visorBundle.stats.aprobados,
        rechazadas: 0, // not provided by bundle; display suppressed when 0
        destacadas: visorBundle.stats.destacados,
        total: visorBundle.stats.total,
      }
    : undefined;

  const { data: vendedores = [] } = useQuery({
    queryKey: ["vendedores", distId],
    queryFn: () => fetchVendedores(distId),
    enabled: !!user,
  });

  // ── Filtered data ────────────────────────────────────────────────────────────

  const sucursalesDisponibles = Array.from(
    new Set(grupos.map((g) => (g.sucursal || "Sin sucursal").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "es"));

  const filtrados = (() => {
    let base = filtroVendedor === "Todos" ? grupos : grupos.filter((g) => g.vendedor === filtroVendedor);
    base = filtroSucursal === "Todas" ? base : base.filter((g) => (g.sucursal || "Sin sucursal") === filtroSucursal);
    if (visorTab === "objetivo") base = base.filter((g) => (g.fotos ?? []).some((f) => f.es_objetivo));
    return base;
  })();

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

  const diasUltCompra = daysSinceIso(ultimaCompraFuente);
  const ventas30 = typeof erpContext?.total_30d === "number" && erpContext.total_30d > 0;
  const compraUltimos30 =
    ventas30 || (diasUltCompra !== null && diasUltCompra <= 30 && !!ultimaCompraFuente);
  const activoComercial =
    pdvInfo?.activo_comercial ?? erpContext?.activo_comercial ?? compraUltimos30;
  const conIngresoComercio =
    !!erpContext?.encontrado &&
    (ventas30 ||
      (diasUltCompra !== null && diasUltCompra < 90) ||
      (erpContext.cant_facturas != null && erpContext.cant_facturas > 0));

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
  const totalFotos = fotosGrupo.length;
  const todasVistas = vistas.size >= totalFotos;
  const isValidacion = fotosGrupo.some((f) => f.estado === "VALIDACION");

  useEagerPreload(filtrados);

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
    onSuccess: (data: { affected?: number } | undefined) => {
      if (data?.affected === 0) {
        setFlash({ msg: "Ya evaluado por otro usuario", type: "err" });
        setTimeout(() => setFlash(null), 2000);
        queryClient.invalidateQueries({ queryKey: ['bundle', 'visor'] });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['bundle', 'visor'] });
    },
    onError: (err) => {
      setFlash({ msg: "Error al evaluar", type: "err" });
      console.error(err);
      queryClient.invalidateQueries({ queryKey: ['bundle', 'visor'] });
    },
  });

  const mutationRevertir = useMutation({
    mutationFn: (ids: number[]) => revertir(ids),
    onSuccess: () => {
      setFlash({ msg: "Revertido", type: "ok" });
      queryClient.invalidateQueries({ queryKey: ['bundle', 'visor'] });
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
        grupo && todasVistas && !isValidacion && !mutationEvaluar.isPending && !isSubmittingRef.current;
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
            lastEvalIds.current = ids;
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
            lastEvalIds.current = ids;
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
            lastEvalIds.current = ids;
            mutationEvaluar.mutate({ ids, estado: "Destacado", comentario });
          }
          break;

        case "z":
        case "Z":
          if (!withMod) return;
          e.preventDefault();
          if (!lastEvalIds.current.length || mutationRevertir.isPending) return;
          mutationRevertir.mutate(lastEvalIds.current);
          lastEvalIds.current = [];
          break;

        case "ArrowRight":
          e.preventDefault();
          if (currentFotoIdx < totalFotos - 1) setCurrentFotoIdx(currentFotoIdx + 1);
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (currentFotoIdx > 0) setCurrentFotoIdx(currentFotoIdx - 1);
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
    mutationEvaluar, mutationRevertir,
    currentIndex, currentFotoIdx, totalFotos, totalGrupos,
    setCurrentIndex, setCurrentFotoIdx, resetGroupState,
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
    if (!grupo || !user || mutationEvaluar.isPending || !todasVistas || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    const ids = fotosGrupo.map((f) => f.id_exhibicion);
    lastEvalIds.current = ids;
    mutationEvaluar.mutate({ ids, estado, comentario });
  }

  function handleNextFoto() {
    setCurrentFotoIdx(Math.min(totalFotos - 1, currentFotoIdx + 1));
  }
  function handlePrevFoto() {
    setCurrentFotoIdx(Math.max(0, currentFotoIdx - 1));
  }

  async function handleRevertir() {
    if (!lastEvalIds.current.length || mutationRevertir.isPending) return;
    mutationRevertir.mutate(lastEvalIds.current);
    lastEvalIds.current = [];
  }

  // ── Loading state ─────────────────────────────────────────────────────────────

  if (loadingPendientes) {
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
        onClick={() => queryClient.invalidateQueries({ queryKey: ['bundle', 'visor'] })}
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
    <div className="flex h-[100dvh] bg-[var(--shelfy-bg)] overflow-hidden">
      <Sidebar />
      <div className="hidden md:block">
        <BottomNav />
      </div>
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">

        {/* Topbar (desktop) */}
        <div className="hidden md:block shrink-0">
          <Topbar title="Evaluar Exhibiciones" />
          {revalidatingVisor && (
            <div className="px-4 pb-1">
              <BundleRevalidatingBadge visible />
            </div>
          )}
        </div>

        {/* Filter bar */}
        {filterBarContent}

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
                                tipoPdv={grupo.tipo_pdv || "—"}
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
                                ) : erpContext?.encontrado ? (
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
                <div className="flex-1 flex flex-col min-h-0 p-3 gap-2 relative">
                  {/* Flash */}
                  {flashEl}

                  {/* Image area */}
                  <div className="flex-1 min-h-0 relative">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`${currentIndex}-${currentFotoIdx}`}
                        initial={{ opacity: 0, x: 14 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -14 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute inset-0"
                      >
                        <FotoViewer
                          driveUrl={fotosGrupo[currentFotoIdx]?.drive_link ?? ""}
                          idExhibicion={fotosGrupo[currentFotoIdx]?.id_exhibicion}
                          priority
                        />
                      </motion.div>
                    </AnimatePresence>

                    {/* Validation lock overlay */}
                    {isValidacion && (
                      <div className="absolute inset-0 bg-amber-900/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20 pointer-events-none rounded-2xl">
                        <Lock size={40} className="text-amber-200" />
                        <p className="text-white font-black text-base tracking-tight">VALIDACIÓN ERP</p>
                        <p className="text-amber-100 text-xs font-semibold text-center px-8">
                          El cliente no figura en el ERP.<br />
                          Se habilitará cuando impacten los datos.
                        </p>
                      </div>
                    )}

                    {/* Photo navigation arrows */}
                    {fotosGrupo.length > 1 && (
                      <>
                        <button
                          onClick={handlePrevFoto}
                          disabled={currentFotoIdx === 0}
                          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 size-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 hover:bg-black/60 disabled:opacity-25 transition-all"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          onClick={handleNextFoto}
                          disabled={currentFotoIdx >= fotosGrupo.length - 1}
                          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 size-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 hover:bg-black/60 disabled:opacity-25 transition-all"
                        >
                          <ChevronRight size={18} />
                        </button>
                        {/* Photo dots */}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1">
                          {fotosGrupo.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setCurrentFotoIdx(i)}
                              className={cn(
                                "rounded-full transition-all",
                                i === currentFotoIdx
                                  ? "w-4 h-2 bg-white"
                                  : "size-2 bg-white/40 hover:bg-white/70"
                              )}
                            />
                          ))}
                        </div>
                      </>
                    )}

                    {/* Focus-hold hint (subtle) */}
                    <AnimatePresence>
                      {focusHoldActive && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 z-30 rounded-2xl ring-4 ring-[var(--shelfy-primary)]/40 pointer-events-none"
                        />
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Evaluar (70%) | Observaciones (30%) — bajo la foto, misma altura */}
                  <div className="shrink-0 px-4 pb-3 pt-2">
                    <div className="grid w-full grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-2 min-h-[10.5rem] auto-rows-[1fr]">
                      <VisorEvalPanel className="min-w-0 h-full min-h-0">
                        <VisorEvalBar
                          prominent
                          onRevertir={handleRevertir}
                          onRechazado={() => handleEvaluar("Rechazado")}
                          onDestacado={() => handleEvaluar("Destacado")}
                          onAprobado={() => handleEvaluar("Aprobado")}
                          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['bundle', 'visor'] })}
                          canRevertir={lastEvalIds.current.length > 0}
                          revertirPending={mutationRevertir.isPending}
                          evaluarPending={mutationEvaluar.isPending}
                          evaluarDisabled={!todasVistas || isValidacion}
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
                  </div>
                </div>

              </div>

              {/* ═══ MOBILE LAYOUT ════════════════════════════════════════════ */}
              <div className="flex md:hidden flex-col flex-1 min-h-0 p-0 relative">
                {/* Flash */}
                {flashEl}

                {/* Canvas + overlays */}
                <div className="flex-1 min-h-0 relative bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_rgba(15,23,42,0.2)_52%,_rgba(2,6,23,0.35)_100%)]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`mob-${currentIndex}-${currentFotoIdx}`}
                      initial={{ opacity: 0, x: 14 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -14 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-0"
                    >
                      <FotoViewer
                        driveUrl={fotosGrupo[currentFotoIdx]?.drive_link ?? ""}
                        idExhibicion={fotosGrupo[currentFotoIdx]?.id_exhibicion}
                        priority
                      />
                    </motion.div>
                  </AnimatePresence>

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

                  {/* Photo navigation */}
                  {fotosGrupo.length > 1 && (
                    <>
                      <button
                        onClick={handlePrevFoto}
                        disabled={currentFotoIdx === 0}
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 size-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 hover:bg-black/60 disabled:opacity-25 transition-all"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        onClick={handleNextFoto}
                        disabled={currentFotoIdx >= fotosGrupo.length - 1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 size-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 hover:bg-black/60 disabled:opacity-25 transition-all"
                      >
                        <ChevronRight size={18} />
                      </button>
                      <div className="absolute top-10 right-3 z-20 bg-black/35 backdrop-blur-md px-2 py-1 rounded-full text-white/90 text-[10px] font-bold font-mono border border-white/15">
                        {currentFotoIdx + 1}/{fotosGrupo.length}
                      </div>
                    </>
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
                          backdropFilter: "blur(40px) saturate(180%)",
                          WebkitBackdropFilter: "blur(40px) saturate(180%)",
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

                        <div className="flex items-center gap-1.5 shrink-0 justify-center">
                          <button
                            onClick={handleRevertir}
                            disabled={!lastEvalIds.current.length || mutationRevertir.isPending}
                            className="size-9 flex items-center justify-center rounded-full bg-white/10 text-white/50 disabled:opacity-30 transition-all active:scale-90 border border-white/10"
                          >
                            <RotateCcw size={14} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => handleEvaluar("Rechazado")}
                            disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                            className="size-11 flex items-center justify-center rounded-full bg-[#fa5252] text-white shadow-[0_2px_10px_rgba(250,82,82,0.4)] disabled:opacity-20 transition-all active:scale-90"
                          >
                            <X size={20} strokeWidth={3.5} />
                          </button>
                          <button
                            onClick={() => handleEvaluar("Destacado")}
                            disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                            className="size-12 flex items-center justify-center rounded-full bg-[#f97316] text-white shadow-[0_2px_12px_rgba(249,115,22,0.45)] disabled:opacity-20 transition-all active:scale-90"
                          >
                            <Flame size={22} strokeWidth={3} className="fill-white/20" />
                          </button>
                          <button
                            onClick={() => handleEvaluar("Aprobado")}
                            disabled={mutationEvaluar.isPending || !todasVistas || isValidacion}
                            className="size-11 flex items-center justify-center rounded-full bg-[#10b981] text-white shadow-[0_2px_10px_rgba(16,185,129,0.4)] disabled:opacity-20 transition-all active:scale-90"
                          >
                            <Check size={20} strokeWidth={3.5} />
                          </button>
                          <button
                            onClick={() => queryClient.invalidateQueries({ queryKey: ['bundle', 'visor'] })}
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
