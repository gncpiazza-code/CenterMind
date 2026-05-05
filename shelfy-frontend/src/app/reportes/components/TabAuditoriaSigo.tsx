"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { Map, MapMarker, MarkerContent, MarkerPopup, MapControls } from "@/components/ui/map";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  MapPin, User, Calendar, DollarSign, Image as ImageIcon, ExternalLink, Navigation,
  UploadCloud, Check, AlertTriangle, Download, Send, Loader2, CheckCircle2, AlertCircle,
  ChevronUp, ChevronDown as ChevronDownIcon, Users,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/Button";
import {
  uploadERPFile, fetchAuditoriaSigo, fetchSigoDetail, exportSigoDetail,
  postDifusionSIGOTelegram, fetchDifusionVendedores,
  type SigoDetailResponse, type SigoVendorDia,
} from "@/lib/api";
import { reportesKeys } from "@/lib/query-keys";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const VIOLET = "var(--shelfy-primary)";
const DONUT_COLORS = [VIOLET, "#e2e8f0"];

type SortKey = keyof SigoVendorDia;
type SortDir = "asc" | "desc";

function coverageBadge(ejec: number, plan: number) {
  const pct = plan > 0 ? Math.round((ejec / plan) * 100) : 0;
  const color =
    pct >= 80 ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
    pct >= 60 ? "bg-amber-100 text-amber-700 border-amber-200" :
               "bg-rose-100 text-rose-700 border-rose-200";
  return <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border", color)}>{pct}%</span>;
}

function MiniDonut({ value, total }: { value: number; total: number }) {
  const data = [
    { value: Math.min(value, total) },
    { value: Math.max(0, total - value) },
  ];
  return (
    <ResponsiveContainer width={44} height={44}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={14} outerRadius={20} dataKey="value" strokeWidth={0}>
          <Cell fill={VIOLET} />
          <Cell fill="#e2e8f0" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function KpiCard({ label, value, sub, total, delay }: {
  label: string; value: number; sub?: string; total?: number; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.05, duration: 0.3 }}
    >
      <Card className="p-3 flex items-center gap-3 border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]">
        {total != null && <MiniDonut value={value} total={total} />}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wide truncate">{label}</p>
          <p className="text-lg font-black text-[var(--shelfy-text)] tabular-nums leading-tight">{value.toLocaleString()}</p>
          {sub && <p className="text-[10px] text-[var(--shelfy-muted)]">{sub}</p>}
        </div>
      </Card>
    </motion.div>
  );
}

export default function TabAuditoriaSigo({ distId, desde, hasta }: { distId: number; desde: string; hasta: string }) {
  const queryClient = useQueryClient();

  // ── Map state ──
  const [selectedPoint, setSelectedPoint] = useState<Record<string, unknown> | null>(null);
  const [uploadResult, setUploadResult] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // ── Detail table state ──
  const [filterVendedor, setFilterVendedor] = useState<string>("__all__");
  const [filterFecha, setFilterFecha] = useState<string>("__all__");
  const [sortKey, setSortKey] = useState<SortKey>("fecha");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [difusionOpen, setDifusionOpen] = useState(false);

  // ── Difusion dialog state ──
  const [difModo, setDifModo] = useState<"uno" | "todos">("todos");
  const [difVendedor, setDifVendedor] = useState<number | null>(null);
  const [difMensaje, setDifMensaje] = useState("");
  const [difResult, setDifResult] = useState<{ enviados: { ok: boolean; vendedor: string; error?: string }[]; errores: { ok: boolean; vendedor: string; error?: string }[] } | null>(null);

  // ── Queries ──
  const { data: geoData = [], isLoading: geoLoading } = useQuery({
    queryKey: reportesKeys.auditoriaSigo(distId, desde, hasta),
    queryFn: () => fetchAuditoriaSigo(distId, desde, hasta),
    enabled: !!distId,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const { data: sigoDetail, isLoading: detailLoading } = useQuery<SigoDetailResponse>({
    queryKey: reportesKeys.sigoDetail(distId),
    queryFn: () => fetchSigoDetail(distId),
    enabled: !!distId,
    staleTime: 5 * 60_000,
  });

  const { data: vendedoresDif = [] } = useQuery({
    queryKey: ["difusion-vendedores-sigo", distId],
    queryFn: () => fetchDifusionVendedores(distId),
    enabled: difusionOpen && !!distId,
    staleTime: 5 * 60_000,
  });

  // ── Upload mutation ──
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadERPFile("ventas", file),
    onSuccess: (res) => {
      setUploadResult({ msg: `Éxito: ${res.count} registros.`, type: "ok" });
      queryClient.invalidateQueries({ queryKey: reportesKeys.auditoriaSigo(distId, desde, hasta) });
    },
    onError: (err: Error) => {
      setUploadResult({ msg: err.message || "Error al subir", type: "err" });
    },
  });

  const difusionMutation = useMutation({
    mutationFn: () =>
      postDifusionSIGOTelegram({
        dist_id: distId,
        modo: difModo,
        id_vendedor: difModo === "uno" && difVendedor ? difVendedor : undefined,
        mensaje_template: difMensaje || undefined,
        sigo_data: sigoDetail,
      }),
    onSuccess: (data) => {
      setDifResult(data);
      if (data.enviados.length > 0) toast.success(`${data.enviados.length} envío(s) completado(s)`);
      if (data.errores.length > 0) toast.error(`${data.errores.length} envío(s) fallido(s)`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Error al enviar");
    },
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadResult(null);
    uploadMutation.mutate(file);
  };

  const handleExport = async () => {
    try {
      const blob = await exportSigoDetail(distId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sigo-detalle-${distId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Error al exportar SIGO");
    }
  };

  const mapCenter = useMemo(() => {
    if (geoData.length === 0) return [-58.4, -34.6] as [number, number];
    const avgLat = geoData.reduce((a: number, b: Record<string, unknown>) => a + Number(b.lat), 0) / geoData.length;
    const avgLon = geoData.reduce((a: number, b: Record<string, unknown>) => a + Number(b.lon), 0) / geoData.length;
    return [avgLon, avgLat] as [number, number];
  }, [geoData]);

  // ── Derived data from sigoDetail ──
  const rows = sigoDetail?.por_vendedor_y_dia ?? [];
  const serieTemporal = sigoDetail?.serie_temporal ?? [];
  const kpis = sigoDetail?.kpis ?? [];

  const vendedoresUnicos = useMemo(() => Array.from(new Set(rows.map((r) => r.vendedor))).sort(), [rows]);
  const fechasUnicas = useMemo(() => Array.from(new Set(rows.map((r) => r.fecha))).sort().reverse(), [rows]);

  const filteredRows = useMemo(() => {
    let r = [...rows];
    if (filterVendedor !== "__all__") r = r.filter((x) => x.vendedor === filterVendedor);
    if (filterFecha !== "__all__") r = r.filter((x) => x.fecha === filterFecha);
    r.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [rows, filterVendedor, filterFecha, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortDir === "asc" ? <ChevronUp size={11} className="inline ml-0.5" /> : <ChevronDownIcon size={11} className="inline ml-0.5" />
    ) : null;

  // ── KPI aggregates from rows ──
  const kpiAgg = useMemo(() => {
    const planeadas = rows.reduce((s, r) => s + r.planeadas, 0);
    const ejecutadas = rows.reduce((s, r) => s + r.ejecutadas, 0);
    const conVenta = rows.reduce((s, r) => s + r.con_venta, 0);
    const sinInfo = rows.reduce((s, r) => s + r.sin_info, 0);
    const conMotivo = rows.reduce((s, r) => s + r.motivo_no_venta, 0);
    return { planeadas, ejecutadas, conVenta, sinInfo, conMotivo };
  }, [rows]);

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-250px)]">
      {/* ── Header ── */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-lg font-bold text-[var(--shelfy-text)]">Auditoría SIGO (Geo-Ventas)</h2>
          <p className="text-xs text-[var(--shelfy-muted)]">Visualización de visitas y peso de venta por ubicación.</p>
          {uploadResult && (
            <div className={cn(
              "mt-2 px-2 py-0.5 rounded-lg text-[9px] font-bold border flex items-center gap-2 animate-in fade-in duration-300 w-fit",
              uploadResult.type === "ok"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-rose-50 border-rose-200 text-rose-700"
            )}>
              {uploadResult.type === "ok" ? <Check size={10} /> : <AlertTriangle size={10} />}
              {uploadResult.msg}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            className="flex items-center gap-2 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <Download size={14} />
            Exportar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setDifusionOpen(true); setDifResult(null); }}
            className="flex items-center gap-2 bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 shadow-sm"
          >
            <Send size={14} />
            Enviar por DIFusión
          </Button>
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
            <span className="text-xs font-bold text-[var(--shelfy-primary)]">{geoData.length} puntos</span>
          </div>
        </div>
      </div>

      {/* ── Map + sidebar ── */}
      <div className="flex flex-1 gap-6 min-h-0">
        <Card className="flex-1 overflow-hidden relative border-none shadow-xl rounded-3xl">
          <Map
            viewport={{ center: mapCenter, zoom: 12 }}
            className="w-full h-full"
          >
            <MapControls position="bottom-right" showZoom showLocate />
            {geoData.map((p: Record<string, unknown>) => (
              <MapMarker
                key={String(p.id_exhibicion)}
                longitude={Number(p.lon)}
                latitude={Number(p.lat)}
                onClick={() => setSelectedPoint(p)}
              >
                <MarkerContent>
                  <div className={cn(
                    "p-1 rounded-full border-2 border-white shadow-lg cursor-pointer",
                    Number(p.venta_periodo) > 500000 ? "bg-red-500" :
                    Number(p.venta_periodo) > 100000 ? "bg-orange-500" : "bg-blue-500"
                  )}>
                    <MapPin size={14} className="text-white" />
                  </div>
                </MarkerContent>
                <MarkerPopup>
                  <div className="p-2 min-w-[200px]">
                    <p className="text-xs font-black uppercase text-slate-400 mb-2">Visita Detectada</p>
                    <h4 className="font-bold text-slate-900 border-b pb-2 mb-2">{String(p.cliente_nombre)}</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <User size={12} /> <span>{String(p.vendedor_nombre)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <DollarSign size={12} />
                        <span className="font-bold text-emerald-600">
                          ${Number(p.venta_periodo || 0).toLocaleString()} (Venta Mes)
                        </span>
                      </div>
                      {!!p.url_foto && (
                        <a
                          href={String(p.url_foto)}
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
          {geoLoading && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-50">
              <PageSpinner />
            </div>
          )}
        </Card>

        <div className="w-80 hidden xl:flex flex-col gap-4 shrink-0 overflow-hidden">
          <Card className="flex-1 flex flex-col p-0 overflow-hidden border-[var(--shelfy-border)]">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Últimas Visitas</h3>
            </div>
            <div className="flex-1 overflow-auto divide-y divide-slate-100">
              {geoData.slice(0, 20).map((p: Record<string, unknown>) => (
                <div
                  key={String(p.id_exhibicion)}
                  onClick={() => setSelectedPoint(p)}
                  className={cn(
                    "p-4 cursor-pointer hover:bg-slate-50 transition-colors",
                    selectedPoint?.id_exhibicion === p.id_exhibicion
                      ? "bg-indigo-50 border-l-4 border-l-indigo-600"
                      : ""
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-xs font-bold text-slate-800 truncate pr-2">{String(p.cliente_nombre)}</p>
                    <span className="text-[9px] font-bold text-slate-400">
                      {format(new Date(String(p.fecha_visita)), "HH:mm")}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2">{String(p.vendedor_nombre)}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                      ${Number(p.venta_periodo || 0).toLocaleString()}
                    </span>
                    <Navigation size={10} className="text-slate-300" />
                  </div>
                </div>
              ))}
              {geoData.length === 0 && !geoLoading && (
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
                <p className="text-sm font-bold truncate">{String(selectedPoint.cliente_nombre)}</p>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="opacity-70">Fecha Visita:</span>
                  <span className="font-bold">
                    {format(new Date(String(selectedPoint.fecha_visita)), "dd MMM, yyyy", { locale: es })}
                  </span>
                </div>
                {!!selectedPoint.url_foto && (
                  <a
                    href={String(selectedPoint.url_foto)}
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

      {/* ── Análisis de Visitas ── */}
      <div className="shrink-0 space-y-5 pb-6">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-[var(--shelfy-primary)]" />
          <h3 className="text-base font-black text-[var(--shelfy-text)] tracking-tight">Análisis de Visitas</h3>
        </div>

        {/* KPI Cards */}
        {detailLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-[72px] rounded-2xl" />)}
          </div>
        ) : sigoDetail?.disponible === false ? (
          <Card className="p-6 text-center border-[var(--shelfy-border)]">
            <p className="text-sm text-[var(--shelfy-muted)]">{sigoDetail.mensaje ?? "Sin datos SIGO disponibles."}</p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {kpis.length > 0 ? kpis.map((k, i) => (
                <KpiCard
                  key={k.label}
                  label={k.label}
                  value={k.value}
                  sub={k.unit}
                  delay={i}
                />
              )) : (
                <>
                  <KpiCard label="Planeadas" value={kpiAgg.planeadas} delay={0} />
                  <KpiCard label="Ejecutadas" value={kpiAgg.ejecutadas}
                    sub={kpiAgg.planeadas > 0 ? `${Math.round((kpiAgg.ejecutadas / kpiAgg.planeadas) * 100)}% del plan` : undefined}
                    total={kpiAgg.planeadas} delay={1} />
                  <KpiCard label="Con venta" value={kpiAgg.conVenta}
                    sub={kpiAgg.ejecutadas > 0 ? `${Math.round((kpiAgg.conVenta / kpiAgg.ejecutadas) * 100)}% de ejecutadas` : undefined}
                    total={kpiAgg.ejecutadas} delay={2} />
                  <KpiCard label="Sin info" value={kpiAgg.sinInfo} delay={3} />
                  <KpiCard label="Con motivo" value={kpiAgg.conMotivo} delay={4} />
                </>
              )}
            </div>

            {/* Serie temporal */}
            {serieTemporal.length > 0 && (
              <Card className="p-4 border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--shelfy-muted)] mb-3">Visitados por día</p>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={serieTemporal} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="violetGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={VIOLET} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={VIOLET} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                      labelFormatter={(v) => `Fecha: ${v}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="valor"
                      stroke={VIOLET}
                      strokeWidth={2}
                      fill="url(#violetGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Tabla por vendedor y día */}
            <Card className="border-[var(--shelfy-border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--shelfy-border)]/50 flex flex-wrap items-center gap-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--shelfy-muted)] mr-auto">
                  Detalle por vendedor y día
                </p>
                <Select value={filterVendedor} onValueChange={setFilterVendedor}>
                  <SelectTrigger className="h-7 w-44 text-xs bg-transparent border-[var(--shelfy-border)]">
                    <SelectValue placeholder="Todos los vendedores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos los vendedores</SelectItem>
                    {vendedoresUnicos.map((v) => (
                      <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterFecha} onValueChange={setFilterFecha}>
                  <SelectTrigger className="h-7 w-36 text-xs bg-transparent border-[var(--shelfy-border)]">
                    <SelectValue placeholder="Todas las fechas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas las fechas</SelectItem>
                    {fechasUnicas.map((f) => (
                      <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {detailLoading ? (
                <div className="divide-y divide-[var(--shelfy-border)]/30">
                  {[0,1,2,3,4].map((i) => (
                    <div key={i} className="flex gap-4 px-4 py-3">
                      <Skeleton className="h-4 flex-1 rounded" />
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-4 w-10 rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {([
                          ["vendedor", "Vendedor"],
                          ["fecha", "Fecha"],
                          ["planeadas", "Plan."],
                          ["ejecutadas", "Ejec."],
                          ["con_venta", "Venta"],
                          ["motivo_no_venta", "Motivo"],
                          ["sin_info", "Sin info"],
                          ["hora_primera_visita", "1ª Visita"],
                          ["hora_primera_venta", "1ª Venta"],
                          ["tiempo_promedio_venta_min", "Prom. Venta (min)"],
                        ] as [SortKey, string][]).map(([key, label]) => (
                          <TableHead
                            key={key}
                            className="text-[10px] font-bold uppercase cursor-pointer select-none whitespace-nowrap"
                            onClick={() => toggleSort(key)}
                          >
                            {label}<SortIcon k={key} />
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-xs text-[var(--shelfy-muted)] py-8">
                            Sin datos para los filtros seleccionados.
                          </TableCell>
                        </TableRow>
                      ) : filteredRows.map((r, i) => (
                        <TableRow key={i} className="text-xs">
                          <TableCell className="font-medium truncate max-w-[140px]">{r.vendedor}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.fecha}</TableCell>
                          <TableCell>{r.planeadas}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5">
                              {r.ejecutadas}
                              {coverageBadge(r.ejecutadas, r.planeadas)}
                            </span>
                          </TableCell>
                          <TableCell>{r.con_venta}</TableCell>
                          <TableCell>{r.motivo_no_venta}</TableCell>
                          <TableCell>{r.sin_info}</TableCell>
                          <TableCell className="whitespace-nowrap text-[var(--shelfy-muted)]">
                            {r.hora_primera_visita ?? "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-[var(--shelfy-muted)]">
                            {r.hora_primera_venta ?? "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {r.tiempo_promedio_venta_min != null
                              ? r.tiempo_promedio_venta_min.toFixed(1)
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      {/* ── Difusión Dialog ── */}
      <Dialog open={difusionOpen} onOpenChange={(v) => { setDifusionOpen(v); if (!v) setDifResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Send size={15} className="text-violet-500" />
              Enviar resumen SIGO por Telegram
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Modo */}
            <div>
              <p className="text-[10px] font-bold text-[var(--shelfy-muted)] uppercase tracking-wide mb-2">Destinatarios</p>
              <div className="flex rounded-xl overflow-hidden border border-[var(--shelfy-border)]">
                {(["todos", "uno"] as const).map((m) => (
                  <button
                    key={m}
                    className={cn(
                      "flex-1 py-2 text-xs font-semibold transition-colors",
                      difModo === m
                        ? "bg-[var(--shelfy-primary)]/20 text-[var(--shelfy-primary)]"
                        : "text-[var(--shelfy-muted)]"
                    )}
                    onClick={() => { setDifModo(m); setDifVendedor(null); }}
                  >
                    {m === "todos" ? "Todos" : "Un vendedor"}
                  </button>
                ))}
              </div>
            </div>

            {/* Selector vendedor */}
            {difModo === "uno" && (
              <div>
                <p className="text-[10px] font-bold text-[var(--shelfy-muted)] uppercase tracking-wide mb-2">
                  <Users size={11} className="inline mr-1" />Vendedor
                </p>
                <Select
                  value={difVendedor ? String(difVendedor) : ""}
                  onValueChange={(v) => setDifVendedor(Number(v))}
                >
                  <SelectTrigger className="h-9 text-sm bg-transparent border-[var(--shelfy-border)]">
                    <SelectValue placeholder="Elegí un vendedor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendedoresDif.filter((v) => v.tiene_telegram).map((v) => (
                      <SelectItem key={v.id_vendedor} value={String(v.id_vendedor)} className="text-xs">
                        {v.nombre_erp}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Mensaje */}
            <div>
              <p className="text-[10px] font-bold text-[var(--shelfy-muted)] uppercase tracking-wide mb-2">Mensaje adicional (opcional)</p>
              <textarea
                value={difMensaje}
                onChange={(e) => setDifMensaje(e.target.value)}
                rows={3}
                placeholder="Mensaje extra que acompañará al resumen SIGO..."
                className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--shelfy-text)] placeholder:text-[var(--shelfy-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--shelfy-primary)]/50 resize-none"
              />
            </div>

            {/* Preview */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 text-xs text-[var(--shelfy-text)] space-y-1"
            >
              <p className="font-bold text-violet-700 text-[10px] uppercase tracking-wide mb-2">Preview del mensaje</p>
              <p>📊 <strong>Resumen SIGO</strong></p>
              <p>🏃 Visitados: {kpiAgg.ejecutadas} / {kpiAgg.planeadas} planeados</p>
              <p>💰 Con venta: {kpiAgg.conVenta}</p>
              <p>⏰ Sin info: {kpiAgg.sinInfo}</p>
              {difMensaje && <p className="text-[var(--shelfy-muted)] italic">"{difMensaje}"</p>}
            </motion.div>

            {/* Botón enviar */}
            <Button
              className="w-full gap-2"
              disabled={difusionMutation.isPending || (difModo === "uno" && !difVendedor)}
              onClick={() => difusionMutation.mutate()}
            >
              {difusionMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
              ) : (
                <><Send className="w-4 h-4" />Difundir</>
              )}
            </Button>

            {/* Resultados */}
            <AnimatePresence>
              {difResult && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl border border-[var(--shelfy-border)] overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-[var(--shelfy-border)]/50 flex items-center gap-2 bg-[var(--shelfy-panel)]">
                    <span className="text-[10px] font-bold text-[var(--shelfy-text)] uppercase tracking-wide">Resultado</span>
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                      {difResult.enviados.length} OK
                    </Badge>
                    {difResult.errores.length > 0 && (
                      <Badge variant="outline" className="text-[10px] text-rose-500 border-rose-300">
                        {difResult.errores.length} error
                      </Badge>
                    )}
                  </div>
                  <div className="divide-y divide-[var(--shelfy-border)]/30 max-h-40 overflow-auto">
                    {difResult.enviados.map((r, i) => (
                      <motion.div
                        key={`ok-${i}`}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-2 px-3 py-2 text-xs"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="truncate text-[var(--shelfy-text)]">{r.vendedor}</span>
                        <span className="ml-auto text-emerald-500 shrink-0">Enviado</span>
                      </motion.div>
                    ))}
                    {difResult.errores.map((r, i) => (
                      <motion.div
                        key={`err-${i}`}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-2 px-3 py-2 text-xs"
                      >
                        <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                        <span className="truncate text-[var(--shelfy-muted)]">{r.vendedor}</span>
                        <span className="ml-auto text-rose-500 shrink-0 max-w-[100px] truncate">{r.error}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
