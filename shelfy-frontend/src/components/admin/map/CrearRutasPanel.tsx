"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import {
  anclarMapaCapa,
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
}

export function CrearRutasPanel({
  distId,
  idVendedor,
  vendedorNombre,
  pdvIds,
  geoJson,
  onSaved,
  onClearPolygon,
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
    onError: (e: Error) => toast.error(e.message),
  });

  const anclarMut = useMutation({
    mutationFn: async (capaId: number) => {
      if (idRutaAnclada === "") throw new Error("Elegí una ruta ERP");
      return anclarMapaCapa(capaId, distId, Number(idRutaAnclada));
    },
    onSuccess: () => {
      toast.success("Capa anclada a ruta");
      void qc.invalidateQueries({ queryKey: ["mapa-capas", distId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="w-80 max-w-full rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shadow-lg p-4 space-y-3 text-sm">
      <div>
        <p className="font-bold text-[var(--shelfy-text)]">Crear Rutas</p>
        <p className="text-xs text-[var(--shelfy-muted)]">{vendedorNombre} · {pdvIds.length} PDV en polígono</p>
      </div>

      <Input
        placeholder="Nombre de la capa"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="h-8 text-sm"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--shelfy-muted)]">Color</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 rounded border-0" />
      </div>

      <div>
        <label className="text-xs font-semibold text-[var(--shelfy-muted)]">Anclar a ruta ERP</label>
        {loadingRutas ? (
          <div className="flex items-center gap-2 text-xs py-2"><Loader2 className="w-3 h-3 animate-spin" /> Cargando rutas…</div>
        ) : (
          <select
            className="mt-1 w-full h-8 rounded-md border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-xs px-2"
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
        className="w-full gap-1.5"
        disabled={saveMut.isPending || pdvIds.length === 0}
        onClick={() => saveMut.mutate()}
      >
        {saveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        Guardar capa
      </Button>
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
