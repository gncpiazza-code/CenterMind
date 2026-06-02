"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Images,
  ChevronLeft,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Flame,
  Clock,
  CircleHelp,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { GaleriaVendedorCard } from "@/components/galeria/GaleriaVendedorCard";
import { GaleriaClienteCard } from "@/components/galeria/GaleriaClienteCard";
import { GaleriaToolbar } from "@/components/galeria/GaleriaToolbar";
import { GaleriaMesSelect } from "@/components/galeria/GaleriaMesSelect";
import { GaleriaMapViewWrapper } from "@/components/galeria/GaleriaMapViewWrapper";
import { GaleriaSinCoordsPanel } from "@/components/galeria/GaleriaSinCoordsPanel";
import { GaleriaExhibicionViewer } from "@/components/galeria/GaleriaExhibicionViewer";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchGaleriaVendedores,
  fetchGaleriaClientesPorVendedor,
  fetchGaleriaMeses,
  type GaleriaVendedorStats,
  type GaleriaClienteCard as GaleriaClienteCardType,
  type GaleriaMapaPin,
  fetchGaleriaSinCoords,
} from "@/lib/api";
import { useGaleriaStore } from "@/store/useGaleriaStore";
import { parseGaleriaSearchParams, buildGaleriaUrl, resolveGaleriaEstadoFilter } from "@/lib/galeria-url";
import { galeriaMonthBounds } from "@/lib/galeria-month";
import { galeriaKeys } from "@/lib/galeria-queries";
import { buildGaleriaViewerNavPins } from "@/lib/galeria-pdv-insights";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";

export default function GaleriaExhibicionesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const distId = user?.id_distribuidor ?? 0;
  const canReevaluarCompania =
    user?.is_superadmin ||
    ["compania", "directorio"].includes((user?.rol ?? "").toLowerCase());

  const [lastDistId, setLastDistId] = useState<number>(distId);

  // Navegación: vendedor seleccionado (vista 1 / vista 2)
  const [selectedVendedor, setSelectedVendedor] = useState<GaleriaVendedorStats | null>(null);

  // Viewer IG
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerCliente, setViewerCliente] = useState<{
    idCliente: number;
    nombreCliente: string;
    idClienteErp?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null>(null);

  // Sin coords panel
  const [sinCoordsOpen, setSinCoordsOpen] = useState(false);

  const [coherenciaHelpOpen, setCoherenciaHelpOpen] = useState(false);

  // Búsqueda + orden (persistidos en Zustand)
  type SortField = "exhibicion" | "compra";
  const {
    searchVendedor,
    setSearchVendedor,
    searchCliente,
    setSearchCliente,
    filtroSucursal,
    setFiltroSucursal,
    mesGaleria,
    setMesGaleria,
    sortField,
    setSortField,
    sortDir,
    setSortDir,
    clearMesGaleria,
    clearClientSearch,
    viewMode,
    setViewMode,
    vendedorId,
    setVendedorId,
    filtroEstado,
    hideSinExhib,
    setHideSinExhib,
    mapPins,
    setMapPins,
  } = useGaleriaStore();

  // Hydrate store desde URL en mount
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (typeof window === "undefined") return;
    const urlState = parseGaleriaSearchParams(new URLSearchParams(window.location.search));
    if (urlState.vendedorId != null) setVendedorId(urlState.vendedorId);
    if (urlState.viewMode) setViewMode(urlState.viewMode);
    if (urlState.mes) setMesGaleria(urlState.mes);
    if (urlState.clienteSearch) setSearchCliente(urlState.clienteSearch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincronizar URL cuando cambian filtros relevantes
  useEffect(() => {
    if (!hydratedRef.current) return;
    const url = buildGaleriaUrl({
      vendedorId: vendedorId ?? undefined,
      viewMode,
      mes: mesGaleria || undefined,
      estado: resolveGaleriaEstadoFilter(filtroEstado),
    });
    router.replace(url, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedorId, viewMode, mesGaleria, filtroEstado]);

  // Resetear al cambiar tenant
  useEffect(() => {
    if (distId <= 0) return;
    if (distId !== lastDistId) {
      setLastDistId(distId);
      setSelectedVendedor(null);
      clearClientSearch();
      clearMesGaleria();
      setSearchVendedor("");
      setFiltroSucursal("todas");
      setVendedorId(null);
    }
  }, [distId, lastDistId, clearClientSearch, clearMesGaleria, setSearchVendedor, setFiltroSucursal, setVendedorId]);

  const mesesScopeVendedorId = selectedVendedor?.id_vendedor ?? vendedorId ?? undefined;

  const { data: mesesDisponibles = [], isLoading: loadingMeses } = useQuery<string[]>({
    queryKey: galeriaKeys.meses(distId, mesesScopeVendedorId ?? null),
    queryFn: () => fetchGaleriaMeses(distId, mesesScopeVendedorId ?? null),
    enabled: distId > 0,
    staleTime: 120_000,
  });

  const mesesKey = mesesDisponibles.join(",");
  useEffect(() => {
    if (!mesesKey) return;
    if (mesGaleria && mesesDisponibles.includes(mesGaleria)) return;
    setMesGaleria(mesesDisponibles[0]);
  }, [mesesKey, mesGaleria, mesesDisponibles, setMesGaleria]);

  const { desde: fechaDesde, hasta: fechaHasta } = useMemo(
    () => (mesGaleria ? galeriaMonthBounds(mesGaleria) : { desde: "", hasta: "" }),
    [mesGaleria],
  );

  // Vista 1: vendedores
  const { data: vendedores = [], isLoading: loadingVendedores, error: errorVendedores } = useQuery<GaleriaVendedorStats[]>({
    queryKey: galeriaKeys.vendedores(distId, filtroSucursal, mesGaleria),
    queryFn: () =>
      fetchGaleriaVendedores(distId, {
        sucursal: filtroSucursal === "todas" ? undefined : filtroSucursal,
        desde: fechaDesde || undefined,
        hasta: fechaHasta || undefined,
      }),
    enabled: distId > 0 && Boolean(mesGaleria),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  // Vista 2: clientes del vendedor seleccionado (solo cuando viewMode=grid)
  const gridVendedorId = selectedVendedor?.id_vendedor ?? (vendedorId ?? null);
  const { data: clientes = [], isLoading: loadingClientes, error: errorClientes } = useQuery<GaleriaClienteCardType[]>({
    queryKey: ["galeria-clientes", gridVendedorId, mesGaleria],
    queryFn: () =>
      fetchGaleriaClientesPorVendedor(gridVendedorId!, {
        desde: fechaDesde || undefined,
        hasta: fechaHasta || undefined,
      }),
    enabled: gridVendedorId != null && viewMode === "grid" && selectedVendedor != null && Boolean(mesGaleria),
    staleTime: 60_000,
  });

  const sucursales = useMemo(() => {
    const set = new Set<string>();
    vendedores.forEach((v) => {
      if (v.sucursal_nombre) set.add(v.sucursal_nombre);
    });
    return Array.from(set).sort();
  }, [vendedores]);

  // Filtros vendedores
  const filteredVendedores = useMemo(() => {
    if (!searchVendedor) return vendedores;
    const q = searchVendedor.toLowerCase();
    return vendedores.filter((v) => v.nombre_erp.toLowerCase().includes(q));
  }, [vendedores, searchVendedor]);

  // Filtros clientes
  const filteredClientes = useMemo(() => {
    let list = clientes;
    if (hideSinExhib) {
      list = list.filter((c) => (c.total_exhibiciones ?? 0) > 0);
    }
    if (searchCliente) {
      const q = searchCliente.toLowerCase();
      list = list.filter(
        (c) =>
          c.nombre_cliente.toLowerCase().includes(q) ||
          (c.nombre_fantasia?.toLowerCase().includes(q) ?? false) ||
          (c.id_cliente_erp?.toLowerCase().includes(q) ?? false)
      );
    }
    list = [...list].sort((a, b) => {
      const dateA = sortField === "exhibicion"
        ? (a.ultima_exhibicion_fecha ?? "")
        : (a.fecha_ultima_compra ?? "");
      const dateB = sortField === "exhibicion"
        ? (b.ultima_exhibicion_fecha ?? "")
        : (b.fecha_ultima_compra ?? "");
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return sortDir === "desc"
        ? dateB.localeCompare(dateA)
        : dateA.localeCompare(dateB);
    });
    return list;
  }, [clientes, hideSinExhib, searchCliente, sortField, sortDir]);

  const totalExhibClientes = useMemo(
    () => clientes.reduce((acc, c) => acc + (c.total_exhibiciones ?? 0), 0),
    [clientes]
  );
  const sinRefClientes = useMemo(
    () => clientes.filter((c) => c.es_sin_referencia),
    [clientes]
  );
  const sinRefExhibTotal = useMemo(
    () => sinRefClientes.reduce((acc, c) => acc + (c.total_exhibiciones ?? 0), 0),
    [sinRefClientes]
  );

  // Stats globales
  const globalStats = useMemo(() => ({
    total: vendedores.reduce((a, v) => a + v.total_exhibiciones, 0),
    aprobadas: vendedores.reduce((a, v) => a + v.aprobadas, 0),
    rechazadas: vendedores.reduce((a, v) => a + v.rechazadas, 0),
    destacadas: vendedores.reduce((a, v) => a + v.destacadas, 0),
    pendientes: vendedores.reduce((a, v) => a + v.pendientes, 0),
  }), [vendedores]);

  const initials = selectedVendedor?.nombre_erp
    .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() ?? "";

  useEffect(() => {
    if (errorVendedores) {
      console.group("[Galeria Debug] Error cargando vendedores");
      console.error("distId:", distId);
      console.error(errorVendedores);
      console.groupEnd();
    }
  }, [errorVendedores, distId]);

  useEffect(() => {
    if (errorClientes && selectedVendedor) {
      console.group("[Galeria Debug] Error cargando clientes");
      console.error("idVendedor:", selectedVendedor.id_vendedor);
      console.error(errorClientes);
      console.groupEnd();
    }
  }, [errorClientes, selectedVendedor]);

  // Handlers viewer
  const openViewer = (
    idCliente: number,
    nombreCliente: string,
    opts?: { lat?: number | null; lng?: number | null; idClienteErp?: string | null },
  ) => {
    setViewerCliente({
      idCliente,
      nombreCliente,
      lat: opts?.lat,
      lng: opts?.lng,
      idClienteErp: opts?.idClienteErp,
    });
    setViewerOpen(true);
  };

  const handlePinSelect = (pin: GaleriaMapaPin) => {
    openViewer(pin.id_cliente, pin.nombre_cliente, {
      lat: pin.latitud,
      lng: pin.longitud,
      idClienteErp: pin.id_cliente_erp,
    });
  };

  const handleSinCoordsClienteClick = (idCliente: number, nombreCliente: string) => {
    openViewer(idCliente, nombreCliente);
    setSinCoordsOpen(false);
  };

  const handleMapPinsChange = useCallback(
    (p: GaleriaMapaPin[]) => setMapPins(p),
    [setMapPins],
  );

  const viewerNavPins = useMemo(
    () => buildGaleriaViewerNavPins(mapPins, filteredClientes),
    [mapPins, filteredClientes],
  );

  // GaleriaMapView sinCoordsCount: se obtiene del hook interno, lo exponemos via callback
  const [sinCoordsCount, setSinCoordsCount] = useState<number>(0);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--shelfy-bg)" }}>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <Topbar title="Galería de Exhibiciones" />
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* ── Vista 1: sin vendedor → lista de vendedores ── */}
          {!selectedVendedor && (
            <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-8">
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="size-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "var(--shelfy-primary)", boxShadow: "0 4px 14px var(--shelfy-glow)" }}
                  >
                    <Images size={20} className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-black" style={{ color: "var(--shelfy-text)" }}>
                      Galería de Exhibiciones
                    </h1>
                    <p className="text-sm" style={{ color: "var(--shelfy-muted)" }}>
                      Exploración por vendedor → cliente → historial
                    </p>
                  </div>
                </div>

                {/* KPI global */}
                {!loadingVendedores && vendedores.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs font-bold">{globalStats.total} exhibiciones</Badge>
                    <Badge className="gap-1.5 px-3 py-1 text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                      <CheckCircle2 size={11} /> {globalStats.aprobadas} aprobadas
                    </Badge>
                    <Badge className="gap-1.5 px-3 py-1 text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                      <Flame size={11} /> {globalStats.destacadas} destacadas
                    </Badge>
                    <Badge className="gap-1.5 px-3 py-1 text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                      <XCircle size={11} /> {globalStats.rechazadas} rechazadas
                    </Badge>
                    <Badge className="gap-1.5 px-3 py-1 text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      <Clock size={11} /> {globalStats.pendientes} pendientes
                    </Badge>
                  </div>
                )}
              </div>

              {/* Buscador vendedores */}
              <div
                className="rounded-2xl border p-3 mb-5 flex flex-wrap items-center gap-2"
                style={{ background: "var(--shelfy-panel)", borderColor: "var(--shelfy-border)" }}
              >
                <Search size={14} style={{ color: "var(--shelfy-muted)" }} className="shrink-0" />
                <Input
                  value={searchVendedor}
                  onChange={(e) => setSearchVendedor(e.target.value)}
                  placeholder="Buscar vendedor..."
                  className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm p-0 bg-transparent min-w-[180px] flex-1"
                />
                <Select value={filtroSucursal} onValueChange={setFiltroSucursal}>
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue placeholder="Sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas las sucursales</SelectItem>
                    {sucursales.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <GaleriaMesSelect
                  meses={mesesDisponibles}
                  value={mesGaleria}
                  onChange={setMesGaleria}
                  loading={loadingMeses}
                  className="w-[180px]"
                />
              </div>

              {errorVendedores ? (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    No se pudo cargar la galería.{" "}
                    {errorVendedores instanceof Error ? errorVendedores.message : "Reintenta más tarde."}
                  </AlertDescription>
                </Alert>
              ) : loadingVendedores ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
                </div>
              ) : filteredVendedores.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <Images size={48} style={{ color: "var(--shelfy-muted)" }} />
                  <p className="text-lg font-bold" style={{ color: "var(--shelfy-muted)" }}>Sin resultados</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredVendedores.map((v) => (
                    <GaleriaVendedorCard
                      key={v.id_vendedor}
                      vendedor={v}
                      onClick={() => {
                        setSelectedVendedor(v);
                        setVendedorId(v.id_vendedor);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Vista 2: vendedor seleccionado ── */}
          {selectedVendedor && (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Breadcrumb header */}
              <div className="px-4 md:px-6 pt-4 pb-2 shrink-0">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedVendedor(null);
                      setVendedorId(null);
                      clearClientSearch();
                    }}
                    className="gap-1.5 font-bold"
                    style={{ color: "var(--shelfy-muted)" }}
                  >
                    <ChevronLeft size={16} />
                    Vendedores
                  </Button>
                  <span style={{ color: "var(--shelfy-muted)" }}>/</span>
                  <div className="flex items-center gap-2">
                    <Avatar className="size-7 rounded-lg shrink-0">
                      {selectedVendedor.foto_url && <AvatarImage src={selectedVendedor.foto_url} alt={selectedVendedor.nombre_erp} />}
                      <AvatarFallback className="rounded-lg text-xs font-black bg-gradient-to-br from-violet-500 to-indigo-500 text-white">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-black" style={{ color: "var(--shelfy-text)" }}>
                      {selectedVendedor.nombre_erp}
                    </span>
                  </div>
                </div>
              </div>

              {/* GaleriaToolbar */}
              <GaleriaToolbar
                vendedores={vendedores}
                distId={distId}
                meses={mesesDisponibles}
                loadingMeses={loadingMeses}
                sinCoordsCount={sinCoordsCount}
                onOpenSinCoords={() => setSinCoordsOpen(true)}
                activeVendedorId={selectedVendedor.id_vendedor}
                onVendedorChange={(id) => {
                  if (id == null) {
                    setSelectedVendedor(null);
                    clearClientSearch();
                    return;
                  }
                  const v = vendedores.find((x) => x.id_vendedor === id);
                  if (v) setSelectedVendedor(v);
                }}
              />

              {/* Contenido condicional por viewMode */}
              {viewMode === "mapa" ? (
                <div
                  className={cn(
                    "flex-1 min-h-0 relative transition-[filter] duration-300",
                    viewerOpen && "blur-md scale-[1.01]",
                  )}
                >
                  <GaleriaMapViewWrapper
                    vendedorId={selectedVendedor.id_vendedor}
                    distId={distId}
                    desde={fechaDesde || undefined}
                    hasta={fechaHasta || undefined}
                    estado={resolveGaleriaEstadoFilter(filtroEstado)}
                    onPinSelect={handlePinSelect}
                    onPinsChange={handleMapPinsChange}
                    disableMapKeyboard={viewerOpen}
                    sinCoordsCount={sinCoordsCount}
                    onOpenSinCoords={() => setSinCoordsOpen(true)}
                  />
                </div>
              ) : (
                /* Grid view */
                <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-8">
                  {sinRefExhibTotal > 0 && (
                    <Alert className="mb-4 border-amber-200 bg-amber-50">
                      <AlertTitle className="flex items-center justify-between gap-2">
                        <span>Coherencia de datos</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs border-amber-300 text-amber-900 bg-white hover:bg-amber-100"
                          onClick={() => setCoherenciaHelpOpen((v) => !v)}
                          title="¿Qué significa este aviso?"
                        >
                          <CircleHelp size={13} className="mr-1" /> ?
                        </Button>
                      </AlertTitle>
                      <AlertDescription>
                        Se detectaron {sinRefExhibTotal} exhibiciones sin referencia a PDV en {sinRefClientes.length} agrupaciones.
                        Total exhibiciones en detalle: {totalExhibClientes}.
                      </AlertDescription>
                      {coherenciaHelpOpen && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-white/80 p-3 text-xs text-amber-900 space-y-1.5">
                          <p><strong>¿Qué significa "sin referencia"?</strong> Son exhibiciones válidas, pero llegaron sin `id_cliente_pdv`.</p>
                          <p><strong>¿Cómo verlas?</strong> Abrí la tarjeta "Cliente sin identificar"; el detalle muestra las imágenes directas.</p>
                        </div>
                      )}
                    </Alert>
                  )}

                  {/* Buscador clientes */}
                  <div
                    className="rounded-2xl border p-3 mb-5 flex flex-wrap items-center gap-2"
                    style={{ background: "var(--shelfy-panel)", borderColor: "var(--shelfy-border)" }}
                  >
                    <Search size={14} style={{ color: "var(--shelfy-muted)" }} className="shrink-0" />
                    <Input
                      value={searchCliente}
                      onChange={(e) => setSearchCliente(e.target.value)}
                      placeholder="Buscar cliente por nombre o código..."
                      className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm p-0 bg-transparent min-w-[180px] flex-1"
                    />
                    <GaleriaMesSelect
                      meses={mesesDisponibles}
                      value={mesGaleria}
                      onChange={setMesGaleria}
                      loading={loadingMeses}
                      className="w-[180px]"
                    />
                    <Button
                      variant={hideSinExhib ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs font-semibold"
                      onClick={() => setHideSinExhib(!hideSinExhib)}
                      title="Ocultar/mostrar PDV sin exhibición"
                    >
                      {hideSinExhib ? "Mostrar PDV sin exhibición" : "Ocultar PDV sin exhibición"}
                    </Button>
                    {filteredClientes.length !== clientes.length && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {filteredClientes.length}/{clientes.length}
                      </Badge>
                    )}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className="text-xs font-semibold" style={{ color: "var(--shelfy-muted)" }}>Ordenar:</span>
                      <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                        <SelectTrigger className="h-8 w-[148px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="exhibicion">Última exhibición</SelectItem>
                          <SelectItem value="compra">Última compra</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title={sortDir === "desc" ? "Más reciente primero" : "Más antiguo primero"}
                        onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
                      >
                        {sortDir === "desc" ? "↓" : "↑"}
                      </Button>
                    </div>
                  </div>

                  {errorClientes ? (
                    <Alert variant="destructive">
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>
                        No se pudo cargar los clientes.{" "}
                        {errorClientes instanceof Error ? errorClientes.message : ""}
                      </AlertDescription>
                    </Alert>
                  ) : loadingClientes ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-60 rounded-2xl" />)}
                    </div>
                  ) : filteredClientes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                      <Images size={48} style={{ color: "var(--shelfy-muted)" }} />
                      <p className="text-lg font-bold" style={{ color: "var(--shelfy-muted)" }}>
                        {clientes.length === 0
                          ? mesGaleria
                            ? "Sin exhibiciones en el mes seleccionado"
                            : "Sin exhibiciones para este vendedor"
                          : "Sin resultados"}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {filteredClientes.map((c) => (
                        <GaleriaClienteCard
                          key={c.id_cliente}
                          cliente={c}
                          onClick={() => {
                            const nombre = (c.nombre_fantasia || c.nombre_cliente || "").trim() || "Cliente sin nombre";
                            openViewer(c.id_cliente, nombre, { idClienteErp: c.id_cliente_erp });
                          }}
                          onOpenViewer={(idCliente, nombreCliente) => openViewer(idCliente, nombreCliente)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── GaleriaExhibicionViewer — sobre ambas vistas ── */}
          <GaleriaExhibicionViewer
            open={viewerOpen}
            onClose={() => { setViewerOpen(false); setViewerCliente(null); }}
            idCliente={viewerCliente?.idCliente ?? null}
            nombreCliente={viewerCliente?.nombreCliente ?? ""}
            idClienteErp={viewerCliente?.idClienteErp}
            distId={distId}
            idVendedor={selectedVendedor?.id_vendedor ?? vendedorId}
            canReevaluarCompania={canReevaluarCompania}
            lat={viewerCliente?.lat}
            lng={viewerCliente?.lng}
            fechaDesde={fechaDesde || undefined}
            fechaHasta={fechaHasta || undefined}
            mesGaleria={mesGaleria}
            mapPins={viewerNavPins}
          />

          {/* ── GaleriaSinCoordsPanel ── */}
          <GaleriaSinCoordsPanel
            open={sinCoordsOpen}
            onClose={() => setSinCoordsOpen(false)}
            vendedorId={selectedVendedor?.id_vendedor ?? vendedorId}
            distId={distId}
            desde={fechaDesde || undefined}
            hasta={fechaHasta || undefined}
            estado={resolveGaleriaEstadoFilter(filtroEstado)}
            onClienteClick={handleSinCoordsClienteClick}
          />
        </main>

        {/* sinCoordsCount bridge: GaleriaMapView lo reporta internamente via prop callback */}
        {/* La query de sinCoords se hace desde GaleriaSinCoordsPanel,
            para sinCoordsCount en toolbar usamos el conteo del mapQuery que ya incluye sin_coords_count */}
        <SinCoordsCountBridge
          vendedorId={selectedVendedor?.id_vendedor ?? null}
          distId={distId}
          desde={fechaDesde || undefined}
          hasta={fechaHasta || undefined}
          estado={resolveGaleriaEstadoFilter(filtroEstado)}
          enabled={selectedVendedor != null}
          onCount={setSinCoordsCount}
        />

        <BottomNav />
      </div>
    </div>
  );
}

// Helper para sincronizar sinCoordsCount desde el mapa al toolbar
function SinCoordsCountBridge({
  vendedorId,
  distId,
  desde,
  hasta,
  estado,
  enabled,
  onCount,
}: {
  vendedorId: number | null;
  distId: number;
  desde?: string;
  hasta?: string;
  estado?: string;
  enabled: boolean;
  onCount: (n: number) => void;
}) {
  const { data } = useQuery({
    queryKey: ["galeria-sin-coords-count", vendedorId, distId, desde, hasta, estado],
    queryFn: () => fetchGaleriaSinCoords(vendedorId!, { distId, desde, hasta, estado }),
    enabled: enabled && vendedorId != null,
    staleTime: 60_000,
  });

  useEffect(() => {
    onCount(data?.length ?? 0);
  }, [data, onCount]);

  return null;
}
