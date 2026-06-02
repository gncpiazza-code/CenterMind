"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPinOff } from "lucide-react";
import { fetchGaleriaSinCoords } from "@/lib/api";

interface GaleriaSinCoordsPanelProps {
  open: boolean;
  onClose: () => void;
  vendedorId: number | null;
  distId: number;
  desde?: string;
  hasta?: string;
  estado?: string;
}

export function GaleriaSinCoordsPanel({
  open,
  onClose,
  vendedorId,
  distId,
  desde,
  hasta,
  estado,
}: GaleriaSinCoordsPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["galeria-sin-coords", vendedorId, distId, desde, hasta, estado],
    queryFn: () =>
      fetchGaleriaSinCoords(vendedorId!, { distId, desde, hasta, estado }),
    enabled: open && vendedorId !== null,
    staleTime: 30_000,
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-80 sm:w-96 overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MapPinOff className="w-4 h-4 text-orange-500" />
            PDVs sin coordenadas
          </SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Cargando...</span>
          </div>
        )}

        {!isLoading && data?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <MapPinOff className="w-8 h-8 opacity-50" />
            <p className="text-sm">No hay PDVs sin coordenadas</p>
          </div>
        )}

        {!isLoading && data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((item) => (
              <li
                key={item.id_cliente}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 bg-slate-50"
              >
                <span className="text-sm text-slate-700 leading-tight line-clamp-2 flex-1">
                  {item.nombre_cliente}
                </span>
                <Badge
                  variant="secondary"
                  className="shrink-0 bg-orange-100 text-orange-700 border-orange-200 text-xs"
                >
                  {item.total_exhibiciones}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
