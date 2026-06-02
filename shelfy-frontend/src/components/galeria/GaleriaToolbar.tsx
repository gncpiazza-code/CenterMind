"use client";

import { Map, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useGaleriaStore } from "@/store/useGaleriaStore";
import { cn } from "@/lib/utils";
import type { GaleriaVendedorStats } from "@/lib/api";

interface GaleriaToolbarProps {
  vendedores: GaleriaVendedorStats[];
  distId: number;
  sinCoordsCount?: number;
  onOpenSinCoords?: () => void;
}

const ESTADOS = [
  { value: "", label: "Todas" },
  { value: "Pendiente", label: "Pendiente" },
  { value: "Aprobado", label: "Aprobada" },
  { value: "Rechazado", label: "Rechazada" },
  { value: "Destacado", label: "Destacada" },
];

export function GaleriaToolbar({
  vendedores,
  distId: _distId,
  sinCoordsCount,
  onOpenSinCoords,
}: GaleriaToolbarProps) {
  const {
    viewMode,
    setViewMode,
    vendedorId,
    setVendedorId,
    fechaDesde,
    setFechaDesde,
    fechaHasta,
    setFechaHasta,
    filtroEstado,
    setFiltroEstado,
  } = useGaleriaStore();

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-background">
      {/* Toggle Mapa / Grid */}
      <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-none h-8 px-2.5 gap-1.5",
            viewMode === "mapa" && "bg-accent text-accent-foreground"
          )}
          onClick={() => setViewMode("mapa")}
          aria-pressed={viewMode === "mapa"}
        >
          <Map className="w-3.5 h-3.5" />
          <span className="text-xs">Mapa</span>
        </Button>
        <div className="w-px h-5 bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-none h-8 px-2.5 gap-1.5",
            viewMode === "grid" && "bg-accent text-accent-foreground"
          )}
          onClick={() => setViewMode("grid")}
          aria-pressed={viewMode === "grid"}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span className="text-xs">Grid</span>
        </Button>
      </div>

      {/* Dropdown vendedor */}
      <Select
        value={vendedorId !== null ? String(vendedorId) : ""}
        onValueChange={(val) =>
          setVendedorId(val ? Number(val) : null)
        }
      >
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue placeholder="Vendedor..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Todos los vendedores</SelectItem>
          {vendedores.map((v) => (
            <SelectItem key={v.id_vendedor} value={String(v.id_vendedor)}>
              {v.nombre_erp}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* DatePicker Desde */}
      <DatePicker
        value={fechaDesde}
        onChange={setFechaDesde}
        placeholder="Desde"
        className="h-8 w-32 text-xs"
      />

      {/* DatePicker Hasta */}
      <DatePicker
        value={fechaHasta}
        onChange={setFechaHasta}
        placeholder="Hasta"
        className="h-8 w-32 text-xs"
      />

      {/* Select Estado */}
      <Select value={filtroEstado} onValueChange={setFiltroEstado}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue placeholder="Estado..." />
        </SelectTrigger>
        <SelectContent>
          {ESTADOS.map((e) => (
            <SelectItem key={e.value} value={e.value}>
              {e.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Badge sin coords */}
      {sinCoordsCount !== undefined && sinCoordsCount > 0 && onOpenSinCoords && (
        <Badge
          className="cursor-pointer bg-orange-500 hover:bg-orange-600 text-white border-0 text-xs h-8 px-3 rounded-md"
          onClick={onOpenSinCoords}
        >
          Sin coords ({sinCoordsCount})
        </Badge>
      )}
    </div>
  );
}
