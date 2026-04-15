"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Images, ChevronLeft, Search, Loader2, CheckCircle2, XCircle, Flame, Clock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

export default function GaleriaExhibicionesPage() {
  const { user } = useAuth();
  const distId = user?.id_distribuidor ?? 0;

  // Navegación: vendedor seleccionado
  const [selectedVendedor, setSelectedVendedor] = useState<GaleriaVendedorStats | null>(null);

  // Timeline dialog
  const [timelineCliente, setTimelineCliente] = useState<GaleriaClienteCardType | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Búsqueda
  const [searchVendedor, setSearchVendedor] = useState("");
  const [searchCliente, setSearchCliente] = useState("");

  // Vista 1: vendedores
  const { data: vendedores = [], isLoading: loadingVendedores, error: errorVendedores } = useQuery<GaleriaVendedorStats[]>({
    queryKey: ["galeria-vendedores", distId],
    queryFn: () => fetchGaleriaVendedores(distId),
    enabled: distId > 0 && selectedVendedor === null,
    staleTime: 60_000,
  });

  // Vista 2: clientes del vendedor seleccionado
  const { data: clientes = [], isLoading: loadingClientes, error: errorClientes } = useQuery<GaleriaClienteCardType[]>({
    queryKey: ["galeria-clientes", selectedVendedor?.id_vendedor],
    queryFn: () => fetchGaleriaClientesPorVendedor(selectedVendedor!.id_vendedor),
    enabled: selectedVendedor != null,
    staleTime: 60_000,
  });

  // Filtros vendedores
  const filteredVendedores = useMemo(() => {
    if (!searchVendedor) return vendedores;
    const q = searchVendedor.toLowerCase();
    return vendedores.filter((v) => v.nombre_erp.toLowerCase().includes(q));
  }, [vendedores, searchVendedor]);

  // Filtros clientes
  const filteredClientes = useMemo(() => {
    if (!searchCliente) return clientes;
    const q = searchCliente.toLowerCase();
    return clientes.filter(
      (c) =>
        c.nombre_cliente.toLowerCase().includes(q) ||
        (c.nombre_fantasia?.toLowerCase().includes(q)) ||
        (c.id_cliente_erp?.toLowerCase().includes(q))
    );
  }, [clientes, searchCliente]);

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

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "var(--shelfy-bg)" }}>
      {/* Header */}
      <div className="mb-6">
        {selectedVendedor ? (
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedVendedor(null); setSearchCliente(""); }}
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
            className="rounded-2xl border p-3 mb-5 flex items-center gap-2"
            style={{ background: "var(--shelfy-panel)", borderColor: "var(--shelfy-border)" }}
          >
            <Search size={14} style={{ color: "var(--shelfy-muted)" }} />
            <Input
              value={searchVendedor}
              onChange={(e) => setSearchVendedor(e.target.value)}
              placeholder="Buscar vendedor..."
              className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm p-0 bg-transparent"
            />
          </div>

          {errorVendedores ? (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>No se pudo cargar la galería. Reintenta más tarde.</AlertDescription>
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
          {/* Buscador clientes */}
          <div
            className="rounded-2xl border p-3 mb-5 flex items-center gap-2"
            style={{ background: "var(--shelfy-panel)", borderColor: "var(--shelfy-border)" }}
          >
            <Search size={14} style={{ color: "var(--shelfy-muted)" }} />
            <Input
              value={searchCliente}
              onChange={(e) => setSearchCliente(e.target.value)}
              placeholder="Buscar cliente por nombre o código..."
              className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm p-0 bg-transparent"
            />
            {filteredClientes.length !== clientes.length && (
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {filteredClientes.length}/{clientes.length}
              </Badge>
            )}
          </div>

          {errorClientes ? (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>No se pudo cargar los clientes.</AlertDescription>
            </Alert>
          ) : loadingClientes ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-60 rounded-2xl" />)}
            </div>
          ) : filteredClientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Images size={48} style={{ color: "var(--shelfy-muted)" }} />
              <p className="text-lg font-bold" style={{ color: "var(--shelfy-muted)" }}>
                {clientes.length === 0 ? "Sin exhibiciones para este vendedor" : "Sin resultados"}
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
        open={timelineOpen}
        onClose={() => { setTimelineOpen(false); setTimelineCliente(null); }}
      />
    </div>
  );
}
