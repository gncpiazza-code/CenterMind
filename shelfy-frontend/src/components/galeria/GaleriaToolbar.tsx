"use client";

import { useMemo, useState, useEffect } from "react";
import { Map, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GaleriaMesSelect } from "@/components/galeria/GaleriaMesSelect";
import { useGaleriaStore } from "@/store/useGaleriaStore";
import { GALERIA_FILTER_ALL } from "@/lib/galeria-url";
import { cn } from "@/lib/utils";
import type { GaleriaVendedorStats } from "@/lib/api";

interface GaleriaToolbarProps {
  vendedores: GaleriaVendedorStats[];
  distId: number;
  meses: string[];
  loadingMeses?: boolean;
  sinCoordsCount?: number;
  onOpenSinCoords?: () => void;
  activeVendedorId?: number | null;
  onVendedorChange?: (id: number | null) => void;
}

const ESTADOS = [
  { value: GALERIA_FILTER_ALL, label: "Todas" },
  { value: "Pendiente", label: "Pendiente" },
  { value: "Aprobado", label: "Aprobada" },
  { value: "Rechazado", label: "Rechazada" },
  { value: "Destacado", label: "Destacada" },
];

const SUCURSAL_TODAS = "__sucursal_todas__";

export function GaleriaToolbar({
  vendedores,
  distId: _distId,
  meses,
  loadingMeses,
  sinCoordsCount,
  onOpenSinCoords,
  activeVendedorId,
  onVendedorChange,
}: GaleriaToolbarProps) {
  const {
    viewMode,
    setViewMode,
    vendedorId,
    setVendedorId,
    mesGaleria,
    setMesGaleria,
    filtroEstado,
    setFiltroEstado,
  } = useGaleriaStore();

  const selectedVendorId = activeVendedorId ?? vendedorId;
  const sucursales = useMemo(() => {
    const set = new Set<string>();
    vendedores.forEach((v) => {
      if (v.sucursal_nombre?.trim()) set.add(v.sucursal_nombre.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [vendedores]);

  const showSucursalFilter = sucursales.length > 1;
  const [menuSucursal, setMenuSucursal] = useState<string>(SUCURSAL_TODAS);

  const activeVendor = useMemo(
    () => vendedores.find((v) => v.id_vendedor === selectedVendorId) ?? null,
    [vendedores, selectedVendorId],
  );

  useEffect(() => {
    if (!activeVendor?.sucursal_nombre || !showSucursalFilter) return;
    setMenuSucursal(activeVendor.sucursal_nombre);
  }, [activeVendor?.id_vendedor, activeVendor?.sucursal_nombre, showSucursalFilter]);

  const vendedoresEnMenu = useMemo(() => {
    let list =
      !showSucursalFilter || menuSucursal === SUCURSAL_TODAS
        ? vendedores
        : vendedores.filter((v) => v.sucursal_nombre === menuSucursal);
    if (
      activeVendor &&
      !list.some((v) => v.id_vendedor === activeVendor.id_vendedor)
    ) {
      list = [activeVendor, ...list];
    }
    return list;
  }, [vendedores, menuSucursal, showSucursalFilter, activeVendor]);

  const vendorSelectValue =
    selectedVendorId != null ? String(selectedVendorId) : GALERIA_FILTER_ALL;

  const estadoSelectValue = filtroEstado || GALERIA_FILTER_ALL;

  const handleVendorChange = (val: string) => {
    const nextId = val === GALERIA_FILTER_ALL ? null : Number(val);
    setVendedorId(nextId);
    onVendedorChange?.(nextId);
    if (nextId != null) {
      const v = vendedores.find((x) => x.id_vendedor === nextId);
      if (v?.sucursal_nombre && showSucursalFilter) {
        setMenuSucursal(v.sucursal_nombre);
      }
    }
  };

  const vendorTriggerLabel = activeVendor
    ? showSucursalFilter && activeVendor.sucursal_nombre
      ? `${activeVendor.nombre_erp} · ${activeVendor.sucursal_nombre}`
      : activeVendor.nombre_erp
    : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0">
      <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-none h-8 px-2.5 gap-1.5",
            viewMode === "mapa" && "bg-accent text-accent-foreground",
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
            viewMode === "grid" && "bg-accent text-accent-foreground",
          )}
          onClick={() => setViewMode("grid")}
          aria-pressed={viewMode === "grid"}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span className="text-xs">Grid</span>
        </Button>
      </div>

      <Select value={vendorSelectValue} onValueChange={handleVendorChange}>
        <SelectTrigger className="h-8 w-[min(220px,42vw)] text-xs">
          <SelectValue placeholder="Vendedor...">
            {vendorTriggerLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[min(420px,70vh)]">
          {showSucursalFilter && (
            <>
              <div className="px-2 pt-2 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
                  Sucursal
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5 px-0.5">
                  <button
                    type="button"
                    className={cn(
                      "text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors",
                      menuSucursal === SUCURSAL_TODAS
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                    )}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => setMenuSucursal(SUCURSAL_TODAS)}
                  >
                    Todas
                  </button>
                  {sucursales.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={cn(
                        "text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors max-w-[140px] truncate",
                        menuSucursal === s
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                      )}
                      title={s}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => setMenuSucursal(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <SelectSeparator />
            </>
          )}
          <SelectItem value={GALERIA_FILTER_ALL}>Todos los vendedores</SelectItem>
          {vendedoresEnMenu.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Sin vendedores en esta sucursal
            </div>
          ) : (
            vendedoresEnMenu.map((v) => (
              <SelectItem key={v.id_vendedor} value={String(v.id_vendedor)}>
                <span className="truncate">{v.nombre_erp}</span>
                {showSucursalFilter && v.sucursal_nombre && menuSucursal === SUCURSAL_TODAS && (
                  <span className="text-muted-foreground ml-1 text-[10px]">
                    · {v.sucursal_nombre}
                  </span>
                )}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      <GaleriaMesSelect
        meses={meses}
        value={mesGaleria}
        onChange={setMesGaleria}
        loading={loadingMeses}
      />

      <Select value={estadoSelectValue} onValueChange={setFiltroEstado}>
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
