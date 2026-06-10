"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Layers, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapaCapaPlanificacion, RutaSupervision, VendedorSupervision } from "@/lib/api";
import { fetchRutasSupervision } from "@/lib/api";
import { sortDiasSupervision } from "@/lib/supervision-map-dias";
import type { DrawnPolygon, RutasZonasTab } from "@/store/useSupervisionStore";
import { CrearRutasPanel } from "./CrearRutasPanel";

interface Props {
  distId: number;
  capas: MapaCapaPlanificacion[];
  vendedores: VendedorSupervision[];
  vendorNames: Record<number, string>;
  visibleCapaIds: Set<number>;
  visibleVends: Set<number>;
  activeTab: RutasZonasTab;
  onTabChange: (tab: RutasZonasTab) => void;
  onToggleCapa: (id: number) => void;
  onToggleVendorCapas: (ids: number[], visible: boolean) => void;
  pdvIds: number[];
  geoJson: DrawnPolygon["geoJson"] | null;
  onClearPolygon?: () => void;
}

function diaLabelForCapa(
  capa: MapaCapaPlanificacion,
  rutasById: Map<number, RutaSupervision>,
): string {
  if (!capa.id_ruta_anclada) return "Zona libre";
  const ruta = rutasById.get(capa.id_ruta_anclada);
  return ruta?.dia_semana ?? ruta?.nombre_ruta ?? `Ruta ${capa.id_ruta_anclada}`;
}

export function RutasZonasPanel({
  distId,
  capas,
  vendedores,
  vendorNames,
  visibleCapaIds,
  visibleVends,
  activeTab,
  onTabChange,
  onToggleCapa,
  onToggleVendorCapas,
  pdvIds,
  geoJson,
  onClearPolygon,
}: Props) {
  const [openVendors, setOpenVendors] = useState<Set<number>>(new Set());
  const [pickedVendor, setPickedVendor] = useState<number | "">("");

  const vendorIdsInCapas = useMemo(
    () => [...new Set(capas.map((c) => c.id_vendedor))],
    [capas],
  );

  const rutasQueries = useQueries({
    queries: vendorIdsInCapas.map((idV) => ({
      queryKey: ["supervision-rutas", distId, idV],
      queryFn: () => fetchRutasSupervision(idV),
      staleTime: 120_000,
    })),
  });

  const rutasByVendor = useMemo(() => {
    const m = new Map<number, RutaSupervision[]>();
    vendorIdsInCapas.forEach((idV, i) => {
      m.set(idV, rutasQueries[i]?.data ?? []);
    });
    return m;
  }, [vendorIdsInCapas, rutasQueries]);

  const effectiveVendorId = useMemo(() => {
    if (visibleVends.size === 1) return [...visibleVends][0];
    if (pickedVendor !== "") return pickedVendor;
    return null;
  }, [visibleVends, pickedVendor]);

  const groupedCapas = useMemo(() => {
    const byVendor = new Map<number, MapaCapaPlanificacion[]>();
    for (const c of capas) {
      if (!byVendor.has(c.id_vendedor)) byVendor.set(c.id_vendedor, []);
      byVendor.get(c.id_vendedor)!.push(c);
    }
    return [...byVendor.entries()]
      .map(([idV, items]) => {
        const rutas = rutasByVendor.get(idV) ?? [];
        const rutasById = new Map(rutas.map((r) => [r.id_ruta, r]));
        const byDay = new Map<string, MapaCapaPlanificacion[]>();
        for (const c of items) {
          const day = diaLabelForCapa(c, rutasById);
          if (!byDay.has(day)) byDay.set(day, []);
          byDay.get(day)!.push(c);
        }
        const days = [...byDay.entries()].sort(([a], [b]) => sortDiasSupervision(a, b));
        return {
          id_vendedor: idV,
          nombre: vendorNames[idV] ?? `Vendedor ${idV}`,
          days,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [capas, vendorNames, rutasByVendor]);

  return (
    <div className="w-[min(100%,22rem)] flex flex-col max-h-[min(52vh,420px)] text-xs text-white">
      <div className="px-3 pt-3 pb-2 border-b border-white/10 shrink-0">
        <p className="font-bold text-sm text-white">Rutas y Zonas</p>
        <p className="text-[10px] text-white/50 mt-0.5">Capas guardadas estilo My Maps</p>
        <div className="flex gap-1 mt-2 p-0.5 rounded-lg bg-black/30">
          <button
            type="button"
            onClick={() => onTabChange("ver")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
              activeTab === "ver"
                ? "bg-sky-500/90 text-white shadow-sm"
                : "text-white/55 hover:text-white/80",
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            Ver capas
          </button>
          <button
            type="button"
            onClick={() => onTabChange("dibujar")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
              activeTab === "dibujar"
                ? "bg-sky-500/90 text-white shadow-sm"
                : "text-white/55 hover:text-white/80",
            )}
          >
            <Pencil className="w-3.5 h-3.5" />
            Dibujar zona
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {activeTab === "ver" ? (
          <div className="p-2 space-y-1">
            {groupedCapas.length === 0 ? (
              <p className="text-white/50 text-[11px] px-2 py-4 text-center leading-relaxed">
                Todavía no hay zonas guardadas.
                <br />
                Andá a <strong className="text-white/70">Dibujar zona</strong> para crear una.
              </p>
            ) : (
              groupedCapas.map((g) => {
                const open = openVendors.has(g.id_vendedor);
                const allIds = g.days.flatMap(([, items]) => items.map((c) => c.id));
                const allOn = allIds.length > 0 && allIds.every((id) => visibleCapaIds.has(id));
                return (
                  <div key={g.id_vendedor} className="rounded-lg border border-white/10 bg-black/20">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-2 py-2 hover:bg-white/5"
                      onClick={() =>
                        setOpenVendors((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.id_vendedor)) next.delete(g.id_vendedor);
                          else next.add(g.id_vendedor);
                          return next;
                        })
                      }
                    >
                      {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                      <span className="font-semibold flex-1 text-left truncate text-[11px]">{g.nombre}</span>
                      <button
                        type="button"
                        className="text-[10px] text-sky-300 hover:underline shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleVendorCapas(allIds, !allOn);
                        }}
                      >
                        {allOn ? "Ocultar" : "Mostrar"}
                      </button>
                    </button>
                    {open && (
                      <div className="pb-2 px-1 space-y-2">
                        {g.days.map(([day, items]) => (
                          <div key={day}>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-white/40 px-2 py-0.5">
                              {day}
                            </p>
                            <div className="space-y-0.5">
                              {items.map((c) => (
                                <label
                                  key={c.id}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/8 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={visibleCapaIds.has(c.id)}
                                    onChange={() => onToggleCapa(c.id)}
                                    className="accent-sky-400"
                                  />
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/20"
                                    style={{ background: c.color || "#0ea5e9" }}
                                  />
                                  <span className="truncate flex-1 text-[11px]">{c.nombre}</span>
                                  <span className="text-white/40 tabular-nums text-[10px]">
                                    {c.pdv_ids?.length ?? 0}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {visibleVends.size !== 1 && (
              <div>
                <label className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">
                  Vendedor de la zona
                </label>
                <select
                  className="mt-1 w-full h-8 rounded-md border border-white/15 bg-black/40 text-[11px] px-2 text-white"
                  value={pickedVendor}
                  onChange={(e) =>
                    setPickedVendor(e.target.value ? Number(e.target.value) : "")
                  }
                >
                  <option value="">Elegí vendedor…</option>
                  {vendedores.map((v) => (
                    <option key={v.id_vendedor} value={v.id_vendedor}>
                      {v.nombre_vendedor}
                    </option>
                  ))}
                </select>
                {visibleVends.size > 1 && (
                  <p className="text-[10px] text-amber-300/90 mt-1">
                    Hay varios vendedores visibles en el mapa — elegí a quién pertenece la zona.
                  </p>
                )}
              </div>
            )}

            {!effectiveVendorId ? (
              <p className="text-[11px] text-white/55 leading-relaxed rounded-lg border border-white/10 bg-black/25 p-3">
                Activá <strong className="text-white/75">un vendedor</strong> en el panel derecho o elegilo arriba.
                Después dibujá el polígono en el mapa (clic = vértice, clic en punto 1 = cerrar).
              </p>
            ) : pdvIds.length === 0 ? (
              <p className="text-[11px] text-white/55 leading-relaxed rounded-lg border border-dashed border-sky-400/40 bg-sky-500/10 p-3">
                Dibujá la zona en el mapa. Cuando cierres el polígono vas a ver el formulario para{" "}
                <strong className="text-white/80">guardar y vincular</strong> con la ruta ERP (CHESS).
              </p>
            ) : (
              <CrearRutasPanel
                distId={distId}
                idVendedor={effectiveVendorId}
                vendedorNombre={vendorNames[effectiveVendorId] ?? ""}
                pdvIds={pdvIds}
                geoJson={geoJson}
                onClearPolygon={onClearPolygon}
                onSaved={() => {
                  onClearPolygon?.();
                  onTabChange("ver");
                }}
                embedded
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
