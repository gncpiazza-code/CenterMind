"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { Map, MapMarker, MarkerContent, MarkerPopup, MapControls } from "@/components/ui/map";
import { MapPin, User, Calendar, DollarSign, Image as ImageIcon, ExternalLink, Navigation, UploadCloud, Check, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/Button";
import { uploadERPFile, fetchAuditoriaSigo } from "@/lib/api";
import { reportesKeys } from "@/lib/query-keys";

export default function TabAuditoriaSigo({ distId, desde, hasta }: { distId: number, desde: string, hasta: string }) {
  const queryClient = useQueryClient();
  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);
  const [uploadResult, setUploadResult] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: reportesKeys.auditoriaSigo(distId, desde, hasta),
    queryFn: () => fetchAuditoriaSigo(distId, desde, hasta),
    enabled: !!distId,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadERPFile("ventas", file),
    onSuccess: (res) => {
      setUploadResult({ msg: `Éxito: ${res.count} registros.`, type: "ok" });
      queryClient.invalidateQueries({ queryKey: reportesKeys.auditoriaSigo(distId, desde, hasta) });
    },
    onError: (err: any) => {
      setUploadResult({ msg: err.message || "Error al subir", type: "err" });
    },
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadResult(null);
    uploadMutation.mutate(file);
  };

  const mapCenter = useMemo(() => {
    if (data.length === 0) return [-58.4, -34.6];
    const avgLat = data.reduce((a: number, b: any) => a + Number(b.lat), 0) / data.length;
    const avgLon = data.reduce((a: number, b: any) => a + Number(b.lon), 0) / data.length;
    return [avgLon, avgLat];
  }, [data]);

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-250px)]">
      <div className="flex justify-between items-center shrink-0">
        <div>
           <h2 className="text-lg font-bold text-[var(--shelfy-text)]">Auditoría SIGO (Geo-Ventas)</h2>
           <p className="text-xs text-[var(--shelfy-muted)]">Visualización de visitas y peso de venta por ubicación.</p>
           {uploadResult && (
            <div className={`mt-2 px-2 py-0.5 rounded-lg text-[9px] font-bold border flex items-center gap-2 animate-in fade-in duration-300 w-fit ${
              uploadResult.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"
            }`}>
              {uploadResult.type === "ok" ? <Check size={10} /> : <AlertTriangle size={10} />}
              {uploadResult.msg}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <input
              type="file"
              accept=".xlsx"
              onChange={handleUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              disabled={uploadMutation.isPending}
            />
            <Button
              size="sm"
              variant="outline"
              loading={uploadMutation.isPending}
              className="flex items-center gap-2 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <UploadCloud size={14} />
              Actualizar Datos ERP
            </Button>
          </div>

          <div className="bg-[var(--shelfy-panel)] px-3 py-1 rounded-full border border-[var(--shelfy-border)] h-fit">
            <span className="text-xs font-bold text-[var(--shelfy-primary)]">{data.length} puntos</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 gap-6 min-h-0">
        {/* Mapa a la izquierda */}
        <Card className="flex-1 overflow-hidden relative border-none shadow-xl rounded-3xl">
           <Map
             viewport={{
               center: mapCenter as [number, number],
               zoom: 12
             }}
             className="w-full h-full"
           >
             <MapControls position="bottom-right" showZoom showLocate />

             {data.map((p: any) => (
               <MapMarker
                 key={p.id_exhibicion}
                 longitude={Number(p.lon)}
                 latitude={Number(p.lat)}
                 onClick={() => setSelectedPoint(p)}
               >
                 <MarkerContent>
                    <div className={`p-1 rounded-full border-2 border-white shadow-lg transition-transform hover:scale-125 cursor-pointer ${
                      Number(p.venta_periodo) > 500000 ? "bg-red-500" :
                      Number(p.venta_periodo) > 100000 ? "bg-orange-500" : "bg-blue-500"
                    }`}>
                       <MapPin size={14} className="text-white" />
                    </div>
                 </MarkerContent>
                 <MarkerPopup>
                    <div className="p-2 min-w-[200px]">
                       <p className="text-xs font-black uppercase text-slate-400 mb-2">Visita Detectada</p>
                       <h4 className="font-bold text-slate-900 border-b pb-2 mb-2">{p.cliente_nombre}</h4>
                       <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                             <User size={12} /> <span>{p.vendedor_nombre}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                             <DollarSign size={12} /> <span className="font-bold text-emerald-600">${Number(p.venta_periodo || 0).toLocaleString()} (Venta Mes)</span>
                          </div>
                          {p.url_foto && (
                             <a
                               href={p.url_foto}
                               target="_blank"
                               rel="noreferrer"
                               className="flex items-center justify-center gap-2 mt-2 py-1.5 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-200"
                             >
                                <ImageIcon size={12} /> Ver Evidencia Foto
                             </a>
                          )}
                       </div>
                    </div>
                 </MarkerPopup>
               </MapMarker>
             ))}
           </Map>

           {isLoading && (
             <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-50">
                <PageSpinner />
             </div>
           )}
        </Card>

        {/* Panel lateral derecho (Visitas recientes) */}
        <div className="w-80 hidden xl:flex flex-col gap-4 shrink-0 overflow-hidden">
           <Card className="flex-1 flex flex-col p-0 overflow-hidden border-[var(--shelfy-border)]">
              <div className="p-4 border-b bg-slate-50">
                 <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Últimas Visitas</h3>
              </div>
              <div className="flex-1 overflow-auto divide-y divide-slate-100">
                 {data.slice(0, 20).map((p: any) => (
                    <div
                      key={p.id_exhibicion}
                      onClick={() => setSelectedPoint(p)}
                      className={`p-4 cursor-pointer hover:bg-slate-50 transition-colors ${selectedPoint?.id_exhibicion === p.id_exhibicion ? "bg-indigo-50 border-l-4 border-l-indigo-600" : ""}`}
                    >
                       <div className="flex justify-between items-start mb-1">
                          <p className="text-xs font-bold text-slate-800 truncate pr-2">{p.cliente_nombre}</p>
                          <span className="text-[9px] font-bold text-slate-400">
                             {format(new Date(p.fecha_visita), "HH:mm")}
                          </span>
                       </div>
                       <p className="text-[10px] text-slate-500 mb-2">{p.vendedor_nombre}</p>
                       <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                             ${Number(p.venta_periodo || 0).toLocaleString()}
                          </span>
                          <div className="flex gap-1">
                             <Navigation size={10} className="text-slate-300" />
                          </div>
                       </div>
                    </div>
                 ))}
                 {data.length === 0 && !isLoading && (
                    <div className="p-10 text-center space-y-2">
                       <MapPin className="mx-auto text-slate-200" size={32} />
                       <p className="text-xs text-slate-400">No se detectaron visitas en el periodo.</p>
                    </div>
                 )}
              </div>
           </Card>

           {selectedPoint && (
              <Card className="p-4 bg-indigo-900 border-none text-white animate-in slide-in-from-right-2">
                 <h4 className="text-[10px] font-black uppercase mb-3 opacity-60">Punto Seleccionado</h4>
                 <div className="space-y-3">
                    <p className="text-sm font-bold truncate">{selectedPoint.cliente_nombre}</p>
                    <div className="flex justify-between items-center text-[10px]">
                       <span className="opacity-70">Fecha Visita:</span>
                       <span className="font-bold">{format(new Date(selectedPoint.fecha_visita), "dd MMM, yyyy", { locale: es })}</span>
                    </div>
                    {selectedPoint.url_foto && (
                       <a
                         href={selectedPoint.url_foto}
                         target="_blank"
                         rel="noreferrer"
                         className="flex items-center justify-center gap-2 mt-4 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors text-xs font-bold"
                       >
                          Abrir Foto <ExternalLink size={12} />
                       </a>
                    )}
                 </div>
              </Card>
           )}
        </div>
      </div>
    </div>
  );
}
