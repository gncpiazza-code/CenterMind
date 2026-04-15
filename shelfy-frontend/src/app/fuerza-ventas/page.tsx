"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserCog, Search, Filter, Wifi, WifiOff, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { VendedorCard } from "@/components/fuerza-ventas/VendedorCard";
import { VendedorEditSheet } from "@/components/fuerza-ventas/VendedorEditSheet";
import { useAuth } from "@/hooks/useAuth";
import { fetchFuerzaVentasVendedores, type FuerzaVentasVendedor } from "@/lib/api";

export default function FuerzaVentasPage() {
  const { user } = useAuth();
  const distId = user?.id_distribuidor ?? 0;

  const [search, setSearch] = useState("");
  const [filtroSucursal, setFiltroSucursal] = useState("todas");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroBinding, setFiltroBinding] = useState("todos");
  const [selectedVendedorId, setSelectedVendedorId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: vendedores = [], isLoading, error } = useQuery<FuerzaVentasVendedor[]>({
    queryKey: ["fv-vendedores", distId],
    queryFn: () => fetchFuerzaVentasVendedores(distId),
    enabled: distId > 0,
    staleTime: 60_000,
  });

  // Sucursales únicas
  const sucursales = useMemo(() => {
    const set = new Set<string>();
    vendedores.forEach((v) => { if (v.sucursal_nombre) set.add(v.sucursal_nombre); });
    return Array.from(set).sort();
  }, [vendedores]);

  // Filtrado
  const filtered = useMemo(() => {
    return vendedores.filter((v) => {
      if (search && !v.nombre_erp.toLowerCase().includes(search.toLowerCase())) return false;
      if (filtroSucursal !== "todas" && v.sucursal_nombre !== filtroSucursal) return false;
      if (filtroEstado === "activo" && v.activo === false) return false;
      if (filtroEstado === "inactivo" && v.activo !== false) return false;
      if (filtroBinding === "vinculado" && !v.tiene_binding) return false;
      if (filtroBinding === "sin_vincular" && v.tiene_binding) return false;
      return true;
    });
  }, [vendedores, search, filtroSucursal, filtroEstado, filtroBinding]);

  // Stats
  const stats = useMemo(() => ({
    total: vendedores.length,
    vinculados: vendedores.filter((v) => v.tiene_binding).length,
    sin_vincular: vendedores.filter((v) => !v.tiene_binding).length,
    activos: vendedores.filter((v) => v.activo !== false).length,
  }), [vendedores]);

  const handleCardClick = (v: FuerzaVentasVendedor) => {
    setSelectedVendedorId(v.id_vendedor);
    setSheetOpen(true);
  };

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "var(--shelfy-bg)" }}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="size-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--shelfy-primary)", boxShadow: "0 4px 14px var(--shelfy-glow)" }}
          >
            <UserCog size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black" style={{ color: "var(--shelfy-text)" }}>
              Fuerza de Ventas
            </h1>
            <p className="text-sm" style={{ color: "var(--shelfy-muted)" }}>
              Gestión operativa de vendedores — perfil, estado y vinculación Telegram
            </p>
          </div>
        </div>

        {/* KPI Pills */}
        {!isLoading && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs font-bold">
              <span>{stats.total}</span> vendedores
            </Badge>
            <Badge className="gap-1.5 px-3 py-1 text-xs font-bold bg-green-100 text-green-700 border border-green-200">
              <Wifi size={11} />
              {stats.vinculados} vinculados
            </Badge>
            <Badge className="gap-1.5 px-3 py-1 text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
              <WifiOff size={11} />
              {stats.sin_vincular} sin vincular
            </Badge>
            <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs font-bold">
              {stats.activos} activos
            </Badge>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div
        className="rounded-2xl border p-4 mb-6 flex flex-wrap gap-3"
        style={{ background: "var(--shelfy-panel)", borderColor: "var(--shelfy-border)" }}
      >
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--shelfy-muted)" }} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar vendedor..."
            className="pl-8 h-9 text-sm"
          />
        </div>

        <Select value={filtroSucursal} onValueChange={setFiltroSucursal}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue placeholder="Sucursal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las sucursales</SelectItem>
            {sucursales.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activo">Activos</SelectItem>
            <SelectItem value="inactivo">Inactivos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtroBinding} onValueChange={setFiltroBinding}>
          <SelectTrigger className="h-9 w-[150px] text-sm">
            <SelectValue placeholder="Telegram" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="vinculado">Vinculados</SelectItem>
            <SelectItem value="sin_vincular">Sin vincular</SelectItem>
          </SelectContent>
        </Select>

        {filtered.length !== vendedores.length && (
          <Badge variant="secondary" className="self-center text-xs font-semibold">
            <Filter size={11} className="mr-1" />
            {filtered.length} de {vendedores.length}
          </Badge>
        )}
      </div>

      {/* Content */}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>No se pudo cargar la fuerza de ventas. Reintenta más tarde.</AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <UserCog size={48} style={{ color: "var(--shelfy-muted)" }} />
          <p className="text-lg font-bold" style={{ color: "var(--shelfy-muted)" }}>
            {vendedores.length === 0 ? "No hay vendedores cargados" : "Sin resultados para los filtros aplicados"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((v) => (
            <VendedorCard key={v.id_vendedor} vendedor={v} onClick={() => handleCardClick(v)} />
          ))}
        </div>
      )}

      {/* Edit Sheet */}
      <VendedorEditSheet
        idVendedor={selectedVendedorId}
        distId={distId}
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setSelectedVendedorId(null); }}
      />
    </div>
  );
}
