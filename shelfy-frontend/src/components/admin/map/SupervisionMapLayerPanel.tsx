"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { MapaCapaPlanificacion } from "@/lib/api";

interface VendorGroup {
  id_vendedor: number;
  nombre: string;
  capas: MapaCapaPlanificacion[];
}

interface SupervisionMapLayerPanelProps {
  capas: MapaCapaPlanificacion[];
  vendorNames: Record<number, string>;
  visibleCapaIds: Set<number>;
  onToggleCapa: (id: number) => void;
  onToggleVendorCapas: (ids: number[], visible: boolean) => void;
}

export function SupervisionMapLayerPanel({
  capas,
  vendorNames,
  visibleCapaIds,
  onToggleCapa,
  onToggleVendorCapas,
}: SupervisionMapLayerPanelProps) {
  const [openVendors, setOpenVendors] = useState<Set<number>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<number, VendorGroup>();
    for (const c of capas) {
      if (!map.has(c.id_vendedor)) {
        map.set(c.id_vendedor, {
          id_vendedor: c.id_vendedor,
          nombre: vendorNames[c.id_vendedor] ?? `Vendedor ${c.id_vendedor}`,
          capas: [],
        });
      }
      map.get(c.id_vendedor)!.capas.push(c);
    }
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [capas, vendorNames]);

  if (groups.length === 0) {
    return (
      <div className="p-3 text-xs text-[var(--shelfy-muted)]">
        Sin capas guardadas. Usá <strong>Rutas y Zonas</strong> para agregar polígonos tenant-wide.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2 max-h-64 overflow-y-auto text-xs">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--shelfy-muted)] px-1 mb-1">
        Capas My Maps
      </p>
      {groups.map((g) => {
        const open = openVendors.has(g.id_vendedor);
        const capaIds = g.capas.map((c) => c.id);
        const allOn = capaIds.every((id) => visibleCapaIds.has(id));
        return (
          <div key={g.id_vendedor} className="rounded-lg border border-[var(--shelfy-border)]/60">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5"
              onClick={() =>
                setOpenVendors((prev) => {
                  const next = new Set(prev);
                  if (next.has(g.id_vendedor)) next.delete(g.id_vendedor);
                  else next.add(g.id_vendedor);
                  return next;
                })
              }
            >
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="font-semibold flex-1 text-left truncate">{g.nombre}</span>
              <button
                type="button"
                className="text-[10px] text-violet-400 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVendorCapas(capaIds, !allOn);
                }}
              >
                {allOn ? "Off" : "On"}
              </button>
            </button>
            {open && (
              <div className="pb-1 px-1 space-y-0.5">
                {g.capas.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleCapaIds.has(c.id)}
                      onChange={() => onToggleCapa(c.id)}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: c.color || "#8b5cf6" }}
                    />
                    <span className="truncate flex-1">{c.nombre}</span>
                    <span className="text-[var(--shelfy-muted)] tabular-nums">{c.pdv_ids?.length ?? 0}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
