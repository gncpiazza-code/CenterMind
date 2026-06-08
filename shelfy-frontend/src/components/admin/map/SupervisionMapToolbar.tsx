"use client";

import { Eye, EyeOff, Layers, MapPin, Route, Target } from "lucide-react";
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
}

export function SupervisionMapToolbar({
  mapToolMode,
  onMapToolModeChange,
  onShowAllVendors,
  onHideAllVendors,
  canEdit,
  vertexCount = 0,
  onFinishPolygon,
}: SupervisionMapToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]/90 shrink-0 flex-wrap">
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
              Objetivo por zona
            </ToggleGroupItem>
            <ToggleGroupItem value="crear_rutas" aria-label="Crear Rutas" className="text-xs gap-1.5 px-3">
              <Route className="w-3.5 h-3.5" />
              Crear Rutas
            </ToggleGroupItem>
          </>
        )}
      </ToggleGroup>

      <span className="w-px h-5 bg-[var(--shelfy-border)] mx-0.5 hidden sm:block" />

      <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onShowAllVendors}>
        <Eye className="w-3.5 h-3.5" />
        Mostrar todos
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onHideAllVendors}>
        <EyeOff className="w-3.5 h-3.5" />
        Ocultar todos
      </Button>

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
            <span>Clic = vértice · doble clic o botón cerrar · ESC cancelar</span>
          )}
        </div>
      )}
    </div>
  );
}
