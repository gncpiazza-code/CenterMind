"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  createMapaCapa,
  fetchMapaCapas,
  fetchRutasSupervision,
  fetchClientesSupervision,
  type MapaCapaPlanificacion,
  type RutaSupervision,
} from "@/lib/api";
import type { DrawnPolygon } from "@/store/useSupervisionStore";

interface CrearRutasPanelProps {
  distId: number;
  idVendedor: number;
  vendedorNombre: string;
  pdvIds: number[];
  geoJson: DrawnPolygon["geoJson"] | null;
  onSaved?: (capa: MapaCapaPlanificacion) => void;
  onClearPolygon?: () => void;
  /** Panel oscuro embebido en mapa (sin borde/card propio) */
  embedded?: boolean;
}

export function CrearRutasPanel({
  distId,
  idVendedor,
  vendedorNombre,
  pdvIds,
  geoJson,
  onSaved,
  onClearPolygon,
  embedded = false,
}: CrearRutasPanelProps) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [idRutaAnclada, setIdRutaAnclada] = useState<number | "">("");

  const { data: rutas = [], isLoading: loadingRutas } = useQuery({
    queryKey: ["supervision-rutas", distId, idVendedor],
    queryFn: () => fetchRutasSupervision(idVendedor),
    enabled: !!idVendedor,
  });

  const rutaSeleccionada = rutas.find((r) => r.id_ruta === idRutaAnclada);

  const { data: clientesRuta = [] } = useQuery({
    queryKey: ["supervision-clientes", distId, rutaSeleccionada?.id_ruta],
    queryFn: () => fetchClientesSupervision(rutaSeleccionada!.id_ruta),
    enabled: !!rutaSeleccionada?.id_ruta,
  });

  const padronIds = useMemo(
    () => new Set(clientesRuta.map((c) => c.id_cliente)),
    [clientesRuta],
  );
  const inBoth = pdvIds.filter((id) => padronIds.has(id));
  const onlyPolygon = pdvIds.filter((id) => !padronIds.has(id));
  const onlyRuta = [...padronIds].filter((id) => !pdvIds.includes(id));

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!geoJson || pdvIds.length === 0) throw new Error("Dibujá un polígono con PDVs");
      if (!nombre.trim()) throw new Error("Nombre requerido");
      return createMapaCapa({
        id_distribuidor: distId,
        id_vendedor: idVendedor,
        nombre: nombre.trim(),
        geojson: geoJson as unknown as Record<string, unknown>,
        pdv_ids: pdvIds,
        color,
        id_ruta_anclada: idRutaAnclada === "" ? null : Number(idRutaAnclada),
      });
    },
    onSuccess: (capa) => {
      toast.success("Capa guardada");
      void qc.invalidateQueries({ queryKey: ["mapa-capas", distId] });
      onSaved?.(capa);
      setNombre("");
      onClearPolygon?.();
    },
    onError: (e: Error) => {
      const msg =
        e.message === "Failed to fetch"
          ? "No se pudo conectar con la API (revisá red o que el backend tenga /api/supervision/mapa/capas)."
          : e.message;
      toast.error(msg);
    },
  });

  const saveLabel =
    idRutaAnclada !== ""
      ? "Guardar zona y vincular a ruta"
      : "Guardar zona";

  const shellClass = embedded
    ? "space-y-3 text-sm"
    : "w-80 max-w-full rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shadow-lg p-4 space-y-3 text-sm";

  const labelClass = embedded ? "text-white/60" : "text-[var(--shelfy-muted)]";
  const titleClass = embedded ? "text-white" : "text-[var(--shelfy-text)]";

  return (
    <div className={shellClass}>
      <div>
        <p className={cn("font-bold", titleClass)}>Nueva zona</p>
        <p className={cn("text-xs", labelClass)}>{vendedorNombre} · {pdvIds.length} PDV en polígono</p>
      </div>

      <Input
        placeholder="Nombre de la zona (ej. Zona norte martes)"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className={cn("h-8 text-sm", embedded && "bg-black/40 border-white/15 text-white placeholder:text-white/35")}
      />
      <div className="flex items-center gap-2">
        <label className={cn("text-xs", labelClass)}>Color</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 rounded border-0" />
      </div>

      <div>
        <label className={cn("text-xs font-semibold", labelClass)}>Vincular a ruta ERP (CHESS)</label>
        {loadingRutas ? (
          <div className="flex items-center gap-2 text-xs py-2"><Loader2 className="w-3 h-3 animate-spin" /> Cargando rutas…</div>
        ) : (
          <select
            className={cn(
              "mt-1 w-full h-8 rounded-md border text-xs px-2",
              embedded
                ? "border-white/15 bg-black/40 text-white"
                : "border-[var(--shelfy-border)] bg-[var(--shelfy-bg)]",
            )}
            value={idRutaAnclada}
            onChange={(e) => setIdRutaAnclada(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Sin anclar</option>
            {rutas.map((r: RutaSupervision) => (
              <option key={r.id_ruta} value={r.id_ruta}>
                {r.dia_semana ?? r.nombre_ruta ?? `Ruta ${r.id_ruta}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {idRutaAnclada !== "" && (
        <div className="rounded-lg border border-[var(--shelfy-border)] p-2 text-[10px] space-y-1 max-h-32 overflow-y-auto">
          <p className="font-semibold text-emerald-500">En polígono y ruta ({inBoth.length})</p>
          <p className="text-[var(--shelfy-muted)]">Solo polígono ({onlyPolygon.length})</p>
          <p className="text-amber-500">Solo padrón ruta ({onlyRuta.length})</p>
        </div>
      )}

      <Button
        size="sm"
        className={cn(
          "w-full gap-1.5 font-bold",
          embedded && "bg-sky-500 hover:bg-sky-600 text-white shadow-md h-10",
        )}
        disabled={saveMut.isPending || pdvIds.length === 0 || !nombre.trim()}
        onClick={() => saveMut.mutate()}
      >
        {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saveLabel}
      </Button>
      {idRutaAnclada === "" && (
        <p className={cn("text-[10px] text-center", labelClass)}>
          Podés guardar sin ruta y vincular después desde Ver capas.
        </p>
      )}
    </div>
  );
}

/** Prefetch capas list helper for MapaRutas */
export function useMapaCapasQuery(distId: number | undefined) {
  return useQuery({
    queryKey: ["mapa-capas", distId],
    queryFn: () => fetchMapaCapas(distId!, { estado: "activo", limit: 500 }),
    enabled: !!distId,
    staleTime: 60_000,
  });
}
