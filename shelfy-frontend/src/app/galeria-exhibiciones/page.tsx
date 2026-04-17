"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Images, ChevronLeft, Search, Loader2, CheckCircle2, XCircle, Flame, Clock, CircleHelp } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { GaleriaVendedorCard } from "@/components/galeria/GaleriaVendedorCard";
import { GaleriaClienteCard } from "@/components/galeria/GaleriaClienteCard";
import { ExhibicionesTimelineDialog } from "@/components/galeria/ExhibicionesTimelineDialog";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchGaleriaVendedores,
  fetchGaleriaClientesPorVendedor,
  type GaleriaVendedorStats,
  type GaleriaClienteCard as GaleriaClienteCardType,
} from "@/lib/api";
import { useGaleriaStore } from "@/store/useGaleriaStore";

export default function GaleriaExhibicionesPage() {
  const { user } = useAuth();
  const distId = user?.id_distribuidor ?? 0;
  const [lastDistId, setLastDistId] = useState<number>(distId);

  // Navegación: vendedor seleccionado
  const [selectedVendedor, setSelectedVendedor] = useState<GaleriaVendedorStats | null>(null);

  // Timeline dialog
  const [timelineCliente, setTimelineCliente] = useState<GaleriaClienteCardType | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [coherenciaHelpOpen, setCoherenciaHelpOpen] = useState(false);
  const [hideSinExhib, setHideSinExhib] = useState(false);

  // Búsqueda + orden (persistidos en Zustand)
  type SortField = "exhibicion" | "compra";
  const {
    searchVendedor,
    setSearchVendedor,
    searchCliente,
    setSearchCliente,
    filtroSucursal,
    setFiltroSucursal,
    fechaDesde,
    setFechaDesde,
    fechaHasta,
    setFechaHasta,
    sortField,
    setSortField,
    sortDir,
    setSortDir,
    clearDateRange,
    clearClientSearch,
    timelinePageSize,
  } = useGaleriaStore();

  useEffect(() => {
    // Al cambiar de tenant, limpiar navegación y filtros para evitar quedar varado en
    // una vista heredada del tenant anterior (sin exhibiciones ni resultados aparentes).
    if (distId <= 0) return;
    if (distId !== lastDistId) {
      setLastDistId(distId);
      setSelectedVendedor(null);
      clearClientSearch();
      clearDateRange();
      setSearchVendedor("");
      setFiltroSucursal("todas");
    }
  }, [distId, lastDistId, clearClientSearch, clearDateRange, setSearchVendedor, setFiltroSucursal]);

  // Vista 1: vendedores
  const { data: vendedores = [], isLoading: loadingVendedores, error: errorVendedores } = useQuery<GaleriaVendedorStats[]>({
    queryKey: ["galeria-vendedores", distId, filtroSucursal, fechaDesde, fechaHasta],
    queryFn: () =>
      fetchGaleriaVendedores(distId, {
        sucursal: filtroSucursal === "todas" ? undefined : filtroSucursal,
        desde: fechaDesde || undefined,
        hasta: fechaHasta || undefined,
      }),
    enabled: distId > 0 && selectedVendedor === null,
    staleTime: 60_000,
  });

  // Vista 2: clientes del vendedor seleccionado
  const { data: clientes = [], isLoading: loadingClientes, error: errorClientes } = useQuery<GaleriaClienteCardType[]>({
    queryKey: ["galeria-clientes", selectedVendedor?.id_vendedor, fechaDesde, fechaHasta],
    queryFn: () =>
      fetchGaleriaClientesPorVendedor(selectedVendedor!.id_vendedor, {
        desde: fechaDesde || undefined,
        hasta: fechaHasta || undefined,
      }),
    enabled: selectedVendedor != null,
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
    // Sorting
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
      console.error("filtroSucursal:", filtroSucursal);
      console.error("fechaDesde:", fechaDesde);
      console.error("fechaHasta:", fechaHasta);
      console.error(errorVendedores);
      console.groupEnd();
    }
  }, [errorVendedores, distId, filtroSucursal, fechaDesde, fechaHasta]);

  useEffect(() => {
    if (errorClientes && selectedVendedor) {
      console.group("[Galeria Debug] Error cargando clientes");
      console.error("distId:", distId);
      console.error("idVendedor:", selectedVendedor.id_vendedor);
      console.error("fechaDesde:", fechaDesde);
      console.error("fechaHasta:", fechaHasta);
      console.error(errorClientes);
      console.groupEnd();
    }
  }, [errorClientes, selectedVendedor, distId, fechaDesde, fechaHasta]);

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "var(--shelfy-bg)" }}>
      {/* Header */}
      <div className="mb-6">
        {selectedVendedor ? (
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedVendedor(null); clearClientSearch(); }}
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
              <span className="text-sm font-black" style={{ color: "var(--shelfy-text)" }}>{selectedVendedor.nombre_erp}</span>
            </div>
          </div>
        ) : (
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
        )}

        {/* KPI global (solo vista 1) */}
        {!selectedVendedor && !loadingVendedores && vendedores.length > 0 && (
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

      {/* ── Vista 1: Vendedores ── */}
      {!selectedVendedor && (
        <>
          {/* Buscador */}
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
            <div className="w-[180px]">
              <DatePicker value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" />
            </div>
            <div className="w-[180px]">
              <DatePicker value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" minDate={fechaDesde || undefined} />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold"
              onClick={() => {
                clearDateRange();
              }}
            >
              Historico
            </Button>
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
                <GaleriaVendedorCard key={v.id_vendedor} vendedor={v} onClick={() => setSelectedVendedor(v)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Vista 2: Clientes del vendedor ── */}
      {selectedVendedor && (
        <>
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
                Se muestran como tarjetas “Cliente sin identificar” y podés abrir sus imágenes directamente.
                Total exhibiciones en detalle: {totalExhibClientes}.
              </AlertDescription>
              {coherenciaHelpOpen && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-white/80 p-3 text-xs text-amber-900 space-y-1.5">
                  <p><strong>¿Qué significa “sin referencia”?</strong> Son exhibiciones válidas, pero llegaron sin `id_cliente_pdv` (cliente/PDV no referenciado).</p>
                  <p><strong>¿Por qué igual se muestran?</strong> Para mantener coherencia con el total del vendedor y evitar “faltantes silenciosos”.</p>
                  <p><strong>¿Cómo verlas?</strong> Abrí la tarjeta “Cliente sin identificar”; el detalle muestra las imágenes directas con su fecha/estado.</p>
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
            <div className="w-[180px]">
              <DatePicker value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" />
            </div>
            <div className="w-[180px]">
              <DatePicker value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" minDate={fechaDesde || undefined} />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold"
              onClick={() => {
                clearDateRange();
              }}
            >
              Historico
            </Button>
            <Button
              variant={hideSinExhib ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs font-semibold"
              onClick={() => setHideSinExhib((v) => !v)}
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
                onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
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
                  ? (fechaDesde || fechaHasta)
                    ? "Sin exhibiciones en el rango seleccionado"
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
                  onClick={() => { setTimelineCliente(c); setTimelineOpen(true); }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Timeline Dialog */}
      <ExhibicionesTimelineDialog
        idClientePdv={timelineCliente?.id_cliente ?? null}
        distId={distId}
        nombreCliente={timelineCliente ? (timelineCliente.nombre_fantasia || timelineCliente.nombre_cliente) : ""}
        motivoNoReferencia={timelineCliente?.motivo_no_referencia ?? null}
        directItems={timelineCliente?.exhibiciones_directas ?? []}
        pageSize={timelinePageSize}
        open={timelineOpen}
        onClose={() => { setTimelineOpen(false); setTimelineCliente(null); }}
      />
    </div>
  );
}
