"use client";

import React from "react";
import { Eye, EyeOff, Layers, MapPin, Route, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MapToolMode } from "@/store/useSupervisionStore";

interface SupervisionMapToolbarProps {
  mapToolMode: MapToolMode;
  onMapToolModeChange: (mode: MapToolMode) => void;
  onShowAllVendors: () => void;
  onHideAllVendors: () => void;
  canEdit: boolean;
  vertexCount?: number;
  onFinishPolygon?: () => void;
  /** Mostrar hint de dibujo (objetivo_zona o rutas en sub-tab dibujar) */
  showDrawHint?: boolean;
  /** Glass overlay variant — renders as absolute overlay with backdrop-blur */
  glass?: boolean;
  /** Sucursal selector rendered at the start of the glass chrome */
  sucursalSlot?: React.ReactNode;
  /** Vendor dock toggle state (glass only) */
  vendorsDockOpen?: boolean;
  /** Vendor dock toggle handler (glass only) */
  onVendorsDockToggle?: () => void;
  /** ShowAll loading progress */
  showAllProgress?: { done: number; total: number } | null;
}

export function SupervisionMapToolbar({
  mapToolMode,
  onMapToolModeChange,
  onShowAllVendors,
  onHideAllVendors,
  canEdit,
  vertexCount = 0,
  onFinishPolygon,
  showDrawHint = false,
  glass,
  sucursalSlot,
  vendorsDockOpen,
  onVendorsDockToggle,
  showAllProgress,
}: SupervisionMapToolbarProps) {
  const glassItemClass = glass
    ? "h-7 min-h-7 text-xs text-white/90 border border-white/25 bg-black/35 hover:bg-white/15 hover:text-white data-[state=on]:bg-amber-500/35 data-[state=on]:text-amber-200 data-[state=on]:border-amber-400/60"
    : "text-xs gap-1.5 px-3";

  const wrapperClass = glass
    ? "absolute top-0 left-0 right-0 z-30 flex items-center gap-2 px-3 py-2.5 bg-slate-950/92 backdrop-blur-lg border-b border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.45)] text-white flex-wrap"
    : "flex items-center gap-2 px-3 py-2 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]/90 shrink-0 flex-wrap";

  return (
    <div className={wrapperClass}>
      {/* Sucursal slot (glass only) */}
      {glass && sucursalSlot && (
        <>
          {sucursalSlot}
          <span className="w-px h-5 bg-white/15 hidden sm:block" />
        </>
      )}

      <ToggleGroup
        type="single"
        value={mapToolMode}
        onValueChange={(v) => v && onMapToolModeChange(v as MapToolMode)}
        className="flex flex-wrap gap-1"
      >
        <ToggleGroupItem value="explorar" aria-label="Explorar" className={glassItemClass}>
          <MapPin className="w-3.5 h-3.5" />
          Explorar
        </ToggleGroupItem>
        {canEdit && (
          <>
            <ToggleGroupItem value="objetivo_zona" aria-label="Objetivo por zona" className={glassItemClass}>
              <Target className="w-3.5 h-3.5" />
              Objetivo
            </ToggleGroupItem>
            <ToggleGroupItem value="crear_rutas" aria-label="Rutas y Zonas" className={glassItemClass}>
              <Route className="w-3.5 h-3.5" />
              Rutas y Zonas
            </ToggleGroupItem>
          </>
        )}
      </ToggleGroup>

      <span className={`w-px h-5 mx-0.5 hidden sm:block ${glass ? "bg-white/25" : "bg-[var(--shelfy-border)]"}`} />

      {showAllProgress ? (
        <span className={`text-xs flex items-center gap-1.5 ${glass ? "text-white/80" : "text-[var(--shelfy-muted)]"}`}>
          <span className="w-3 h-3 border-2 border-amber-400/60 border-t-amber-400 rounded-full animate-spin" />
          Cargando {showAllProgress.done}/{showAllProgress.total}…
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`h-7 text-xs gap-1 ${glass ? "border-white/30 bg-black/30 text-white hover:bg-white/15 hover:text-white" : ""}`}
          onClick={onShowAllVendors}
        >
          <Eye className="w-3.5 h-3.5" />
          Mostrar todos
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`h-7 text-xs gap-1 ${glass ? "text-white/85 hover:bg-white/10 hover:text-white" : ""}`}
        onClick={onHideAllVendors}
      >
        <EyeOff className="w-3.5 h-3.5" />
        Ocultar todos
      </Button>

      {/* Vendor dock toggle (glass only) */}
      {glass && onVendorsDockToggle !== undefined && (
        <button
          type="button"
          onClick={onVendorsDockToggle}
          className={`h-7 px-2.5 flex items-center gap-1.5 text-xs font-semibold rounded-md border transition-colors
            ${vendorsDockOpen
              ? "bg-amber-500/35 text-amber-200 border-amber-400/60"
              : "bg-black/30 text-white/85 border-white/25 hover:bg-white/10 hover:text-white"
            }`}
        >
          <Users className="w-3.5 h-3.5" />
          Vendedores
        </button>
      )}

      {showDrawHint && (
        <div className="flex items-center gap-2 ml-auto text-xs text-violet-400">
          <Layers className="w-3.5 h-3.5" />
          {vertexCount >= 3 ? (
            <button
              type="button"
              className="font-semibold underline-offset-2 hover:underline"
              onClick={onFinishPolygon}
            >
              Cerrar polígono ({vertexCount} pts)
            </button>
          ) : (
            <span>
              Clic = vértice · Ctrl+arrastrar = mover · punto 1 / Enter = cerrar · Backspace deshacer
              {vertexCount > 0 ? ` · ${vertexCount} pts` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
