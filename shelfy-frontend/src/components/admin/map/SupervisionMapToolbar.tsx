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
  glass,
  sucursalSlot,
  vendorsDockOpen,
  onVendorsDockToggle,
  showAllProgress,
}: SupervisionMapToolbarProps) {
  const wrapperClass = glass
    ? "absolute top-0 left-0 right-0 z-30 flex items-center gap-2 px-3 py-2.5 bg-[var(--shelfy-bg)]/80 backdrop-blur-md border-b border-white/10 flex-wrap"
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
        <ToggleGroupItem value="explorar" aria-label="Explorar" className="text-xs gap-1.5 px-3">
          <MapPin className="w-3.5 h-3.5" />
          Explorar
        </ToggleGroupItem>
        {canEdit && (
          <>
            <ToggleGroupItem value="objetivo_zona" aria-label="Objetivo por zona" className="text-xs gap-1.5 px-3">
              <Target className="w-3.5 h-3.5" />
              Objetivo
            </ToggleGroupItem>
            <ToggleGroupItem value="crear_rutas" aria-label="Crear Rutas" className="text-xs gap-1.5 px-3">
              <Route className="w-3.5 h-3.5" />
              Rutas
            </ToggleGroupItem>
          </>
        )}
      </ToggleGroup>

      <span className="w-px h-5 bg-[var(--shelfy-border)] mx-0.5 hidden sm:block" />

      {showAllProgress ? (
        <span className="text-xs text-[var(--shelfy-muted)] flex items-center gap-1.5">
          <span className="w-3 h-3 border-2 border-amber-400/60 border-t-amber-400 rounded-full animate-spin" />
          Cargando {showAllProgress.done}/{showAllProgress.total}…
        </span>
      ) : (
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onShowAllVendors}>
          <Eye className="w-3.5 h-3.5" />
          Mostrar todos
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onHideAllVendors}>
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
              ? "bg-[var(--shelfy-primary)]/20 text-[var(--shelfy-primary)] border-[var(--shelfy-primary)]/40"
              : "bg-transparent text-[var(--shelfy-muted)] border-[var(--shelfy-border)] hover:text-[var(--shelfy-text)]"
            }`}
        >
          <Users className="w-3.5 h-3.5" />
          Vendedores
        </button>
      )}

      {mapToolMode !== "explorar" && (
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
              Clic = vértice · clic punto 1 = cerrar · Backspace deshacer
              {vertexCount > 0 ? ` · ${vertexCount} pts` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
