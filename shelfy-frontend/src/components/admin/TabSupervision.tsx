"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData, type QueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import {
  ChevronRight,
  MapPin,
  ShoppingCart,
  Calendar,
  Loader2,
  AlertCircle,
  RefreshCw,
  Route as RouteIcon,
  Map as MapIcon,
  Eye,
  EyeOff,
  Building2,
  CreditCard,
  Printer,
  X,
  Image as ImageIcon,
  Search,
  Target,
  HelpCircle,
} from "lucide-react";
import {
  fetchVendedoresSupervision,
  fetchRutasSupervision,
  fetchClientesSupervision,
  fetchCuentasSupervision,
  fetchSyncStatus,
  type CuentasSupervision,
  type SyncStatus,
  fetchClienteInfo,
  fetchReporteExhibiciones,
  resolveImageUrl,
  createObjetivo,
  type VendedorSupervision,
  type RutaSupervision,
  type ClienteSupervision,
  type Distribuidora,
  type ClienteContacto,
  type ObjetivoCreate,
  type ObjetivoTipo,
  fetchPdvsMovimiento,
  type PdvsMovimientoItem,
} from "@/lib/api";
import { openCuentasCorrientesPrintWindow } from "@/lib/printCuentasCorrientes";
import type { PinCliente } from "./MapaRutas";
import { useSupervisionStore } from "@/store/useSupervisionStore";
import { SyncStatusPanel } from "./SyncStatusPanel";
import { useObjetivosMenuStore } from "@/store/useObjetivosMenuStore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { uploadCCForDist, fetchCCStatus } from "@/lib/api";

// ── Map: SSR off ──────────────────────────────────────────────────────────────
const MapaRutas = dynamic(() => import("./MapaRutas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--shelfy-panel)]">
      <Loader2 className="w-5 h-5 animate-spin text-[var(--shelfy-muted)]" />
    </div>
  ),
});

// ── Vendor color palette ──────────────────────────────────────────────────────
// 20 colors that avoid Red, Blue, Orange, and Green (used for PDV statuses).
const VENDOR_COLORS = [
  "#FF00FF", // 1  — Magenta
  "#8B5CF6", // 2  — Violet
  "#06B6D4", // 3  — Cyan
  "#F472B6", // 4  — Pink
  "#D946EF", // 5  — Fuchsia
  "#71717A", // 6  — Grey
  "#78350F", // 7  — Brown
  "#4338CA", // 8  — Indigo
  "#BE123C", // 9  — Crimson
  "#CA8A04", // 10 — Ochre
  "#14B8A6", // 11 — Teal
  "#9333EA", // 12 — Purple
  "#DB2777", // 13 — Deep Pink
  "#0F766E", // 14 — Dark Teal
  "#0369A1", // 15 — Deep Sky
  "#57534E", // 16 — Stone
  "#A855F7", // 17 — Medium Purple
  "#0891B2", // 18 — Deep Cyan
  "#C026D3", // 19 — Fuchsia Deep
  "#4B5563", // 20 — Cool Grey
];
const defaultVendorColor = (i: number) => VENDOR_COLORS[i % VENDOR_COLORS.length];

/** Mapa debe alinearse al padrón: nunca usar staleTime Infinity aquí (ver handoff RPA/sync). */
const SUPERVISION_MAP_RUTAS_STALE_MS = 90_000;
const SUPERVISION_MAP_CLIENTES_STALE_MS = 90_000;
/** Detectar nuevo timestamp de padrón y disparar invalidateQueries antes de que el usuario recargue. */
const SUPERVISION_SYNC_POLL_MS = 45_000;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeExhibEstado(value: string | null | undefined): "pendiente" | "aprobada" | "rechazada" | "destacada" | "otros" {
  const s = normalizeText(value);
  if (s.includes("pend")) return "pendiente";
  if (s.includes("destac")) return "destacada";
  if (s.includes("rechaz")) return "rechazada";
  if (s.includes("aprobad")) return "aprobada";
  return "otros";
}

// ── Day badge ─────────────────────────────────────────────────────────────────
const DIA_COLOR: Record<string, string> = {
  "Lunes":     "bg-blue-500/15 text-blue-400 border-blue-500/25",
  "Martes":    "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  "Miércoles": "bg-violet-500/15 text-violet-400 border-violet-500/25",
  "Jueves":    "bg-orange-500/15 text-orange-400 border-orange-500/25",
  "Viernes":   "bg-rose-500/15 text-rose-400 border-rose-500/25",
  "Sábado":    "bg-amber-500/15 text-amber-400 border-amber-500/25",
  "Domingo":   "bg-red-500/15 text-red-400 border-red-500/25",
  "Variable":  "bg-slate-500/15 text-slate-400 border-slate-500/25",
};
function DiaBadge({ dia }: { dia: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${DIA_COLOR[dia] ?? DIA_COLOR["Variable"]}`}>
      {dia}
    </span>
  );
}

// ── Smooth accordion ──────────────────────────────────────────────────────────
function Accordion({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateRows: open ? "1fr" : "0fr",
      transition: "grid-template-rows 250ms ease",
    }}>
      <div style={{ overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}
function isInactivo(fecha: string | null): boolean {
  if (!fecha) return true;
  return Date.now() - new Date(fecha).getTime() > 90 * 86_400_000;
}
/** For map pins: inactive = no purchase in last 30 days (or never) */
function isInactivo30(fecha: string | null): boolean {
  if (!fecha) return true;
  return Date.now() - new Date(fecha).getTime() > 30 * 86_400_000;
}

/** Mismo ERP puede existir en varias rutas (filas viejas); el mapa debe mostrar un solo pin. */
interface PinDedupeRow {
  pin: PinCliente;
  estadoPdv: string | null | undefined;
  fechaUc: string | null;
  idCliente: number;
}

function pickBetterPinRow(a: PinDedupeRow, b: PinDedupeRow): PinDedupeRow {
  const aAct = a.estadoPdv === "activo";
  const bAct = b.estadoPdv === "activo";
  if (aAct !== bAct) return aAct ? a : b;

  const aRecent = !isInactivo30(a.fechaUc);
  const bRecent = !isInactivo30(b.fechaUc);
  if (aRecent !== bRecent) return aRecent ? a : b;

  const fa = a.fechaUc ?? "";
  const fb = b.fechaUc ?? "";
  if (fa !== fb) return fa > fb ? a : b;

  return a.idCliente > b.idCliente ? a : b;
}

function dedupePinsByClienteErp(rows: PinDedupeRow[]): PinCliente[] {
  const m = new Map<string, PinDedupeRow>();
  for (const row of rows) {
    const erp = row.pin.idClienteErp?.trim();
    const key = erp || `__pk_${row.idCliente}`;
    const prev = m.get(key);
    if (!prev) {
      m.set(key, row);
      continue;
    }
    m.set(key, pickBetterPinRow(prev, row));
  }
  return Array.from(m.values()).map((r) => r.pin);
}

/** Returns true if fecha is within `days` days from today */
function isRecentDate(fecha: string | null | undefined, days: number): boolean {
  if (!fecha) return false;
  return Date.now() - new Date(fecha).getTime() <= days * 86_400_000;
}
/**
 * Returns true only if the coords are non-null, non-zero, and within
 * Argentina's bounding box (lat -55..−21, lng -74..−53).
 * Filters null-island (0,0), missing data, and stray out-of-country values.
 */
function hasValidCoords(lat: number | null, lng: number | null): boolean {
  if (!lat || !lng) return false;
  return lat >= -55 && lat <= -21 && lng >= -74 && lng <= -53;
}

/** Keep active + inactive PDVs visible in Supervisión toggles/map. */
function isClientePadronActivo(c: ClienteSupervision): boolean {
  void c;
  return true;
}

interface VendorMapEligibleStats {
  /** PDV únicos con coords válidas (misma regla que pines del mapa) */
  totalMap: number;
  /** Subconjunto con compra en últimos 30 días (alineado a `isInactivo30` / leyenda del mapa) */
  activosMap: number;
  /** true si hay rutas y cada ruta tiene respuesta en caché (aunque sea []) */
  complete: boolean;
}

// Evita que los KPIs de activos/inactivos "salten" al prender/apagar capas del mapa.
// La referencia estable para UI operativa debe venir del backend (vendedores_v2 + RPC).
const USE_MAP_ELIGIBLE_STATS_FOR_KPIS = false;

function getVendorMapEligibleStats(
  qc: QueryClient,
  distId: number,
  idVendedor: number
): VendorMapEligibleStats {
  const vendRutas = qc.getQueryData<RutaSupervision[]>(["supervision-rutas", distId, idVendedor]);
  if (!vendRutas?.length) {
    return { totalMap: 0, activosMap: 0, complete: false };
  }
  const seen = new Set<string>();
  let totalMap = 0;
  let activosMap = 0;
  let complete = true;
  for (const r of vendRutas) {
    const rows = qc.getQueryData<ClienteSupervision[]>(["supervision-clientes", distId, r.id_ruta]);
    if (rows === undefined) {
      complete = false;
      continue;
    }
    for (const c of rows) {
      if (!isClientePadronActivo(c)) continue;
      if (!hasValidCoords(c.latitud, c.longitud)) continue;
      const erpKey = String(c.id_cliente_erp ?? "").trim();
      const dedupeKey = erpKey ? `erp:${erpKey}` : `pk:${c.id_cliente}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      totalMap++;
      if (!isInactivo30(c.fecha_ultima_compra)) activosMap++;
    }
  }
  return { totalMap, activosMap, complete };
}

function findClienteInDistCache(
  qc: QueryClient,
  distId: number,
  clienteId: number
): ClienteSupervision | null {
  const entries = qc.getQueriesData<ClienteSupervision[]>({ queryKey: ["supervision-clientes", distId] });
  for (const [, rows] of entries) {
    const hit = rows?.find((x) => x.id_cliente === clienteId);
    if (hit) return hit;
  }
  return null;
}
function diasDesde(fecha: string | null | undefined): string {
  if (!fecha) return "Sin registro";
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return `Hace ${dias} días`;
}

// ── Day sort order ─────────────────────────────────────────────────────────────
const DIA_ORDER: Record<string, number> = {
  lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4,
  viernes: 5, sabado: 6, sábado: 6, domingo: 7,
};

// ── Vendor avatar ─────────────────────────────────────────────────────────────
const RANGO_COLORS: Record<string, string> = {
  "1-7 Días":   "bg-green-500/15 text-green-400 border-green-500/25",
  "8-15 Días":  "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  "16-21 Días": "bg-orange-500/15 text-orange-400 border-orange-500/25",
  "22-30 Días": "bg-red-500/15 text-red-400 border-red-500/25",
  "+30 Días":   "bg-rose-500/15 text-rose-400 border-rose-500/25",
};

const VendorAvatar = ({ nombre, color }: { nombre: string; color: string }) => {
  const initials = nombre.trim().split(/\s+/).slice(0, 2)
    .map(w => w[0] ?? "").join("").toUpperCase() || "?";
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 select-none"
      style={{ backgroundColor: color + "22", color }}
    >
      {initials}
    </div>
  );
};

// ── Small eye toggle button ───────────────────────────────────────────────────
function EyeBtn({
  on, loading, color, onClick, title, className, disabled,
}: {
  on: boolean; loading?: boolean; color?: string;
  onClick: () => void; title?: string; className?: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={e => {
        e.stopPropagation();
        if (disabled) return;
        onClick();
      }}
      title={title ?? (on ? "Ocultar del mapa" : "Mostrar en mapa")}
      className={`flex rounded-md items-center justify-center border transition-all duration-200 shrink-0 ${
        disabled
          ? "border-transparent opacity-35 cursor-not-allowed text-[var(--shelfy-muted)]"
          : on
            ? "border-transparent text-white"
            : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:border-current"
      } ${className ?? "w-6 h-6"}`}
      style={on && color && !disabled ? { backgroundColor: color, boxShadow: `0 0 6px ${color}55` } : {}}
    >
      {loading
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : on
          ? <Eye className="w-3 h-3" />
          : <EyeOff className="w-3 h-3" />
      }
    </button>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface TabSupervisionProps {
  distId: number;
  isSuperadmin?: boolean;
  fullscreen?: boolean;
  mapOnly?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

function formatSyncTime(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3_600_000;
  const argTime = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  const argDate = d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  const nowDate = now.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  if (diffH < 24 && argDate === nowDate) return `hoy ${argTime}`;
  if (diffH < 48) return `ayer ${argTime}`;
  return `${argDate} ${argTime}`;
}


export default function TabSupervision({ distId, isSuperadmin, fullscreen = false, mapOnly = false }: TabSupervisionProps) {
  const queryClient = useQueryClient();
  const { hasPermiso } = useAuth();
  const [selectedDist, setSelectedDist]         = useState(distId);
  
  // Zustand store for persistent visibility state
  const {
    selectedSucursal,
    setSelectedSucursal,
    mapMode,
    setMapMode,
    visibleVends,
    visibleRutas,
    visibleClientes,
    toggleVendor: toggleVendorStore,
    toggleRuta: toggleRutaStore,
    toggleCliente: toggleClienteStore,
    setVisibleVends,
    setVisibleRutas,
    setVisibleClientes,
    clearAll,
    vendorColorOverrides,
    setVendorColorOverride,
    clearVendorColorOverride,
    selectedPDVsForObjective,
    togglePDVForObjective,
    clearSelectedPDVs,
    routeBuildEnabled,
    toggleRouteBuild,
    setActivePolygon,
    clearRouteBuildState,
    activePolygonPdvIds,
    activePolygonGeoJson,
  } = useSupervisionStore();

  // accordion state (local UI only)
  const [openVend, setOpenVend]                 = useState<number | null>(null);
  const [openRuta, setOpenRuta]                 = useState<number | null>(null);
  const [openCliente, setOpenCliente]           = useState<number | null>(null);

  // loading states for async operations
  const [loadingMap, setLoadingMap]             = useState<Set<number>>(new Set());
  /** Re-render conteos alineados al mapa cuando cambia caché de rutas/clientes */
  const [mapStatsTick, setMapStatsTick]         = useState(0);
  const lastPadronTsByDistRef = useRef<Record<number, string>>({});

  // ── Ventas & Cuentas ──────────────────────────────────────────────────────
  // Mobile tab: toggle between map and vendor list on small screens
  const [mobileView, setMobileView] = useState<'mapa' | 'lista'>('lista');

  // ── Ventas & Cuentas ──────────────────────────────────────────────────────
  const [openVentasVend, setOpenVentasVend]     = useState<string | null>(null);
  const [openCuentasVend, setOpenCuentasVend]   = useState<string | null>(null);
  const [clientePopup, setClientePopup]         = useState<{
    nombre: string;
    data: ClienteContacto[] | null;
    loading: boolean;
  } | null>(null);
  const [ccSort, setCcSort] = useState<{ col: "dias" | "deuda"; asc: boolean }>({ col: "dias", asc: false });

  // ── Exhibiciones ──────────────────────────────────────────────────────────
  const [exhibiciones, setExhibiciones] = useState<any[]>([]);
  const [loadingExhib, setLoadingExhib] = useState(false);
  const [exhibFilter, setExhibFilter] = useState<string>("Todos");
  const [exhibSearch, setExhibSearch] = useState("");
  const [exhibPeriodo, setExhibPeriodo] = useState<"hoy" | "7d" | "historico">("hoy");

  // ── Floating Objetivos Menu — state lives in Zustand store ───────────────
  // Fine-grained selectors: each subscription only triggers a re-render
  // of the consumer, not of MapaRutas or other unrelated siblings.
  const objMenuOpen          = useObjetivosMenuStore(s => s.objMenuOpen);
  const setObjMenuOpen       = useObjetivosMenuStore(s => s.setObjMenuOpen);
  const objTipo              = useObjetivosMenuStore(s => s.objTipo);
  const setObjTipo           = useObjetivosMenuStore(s => s.setObjTipo);
  const objFecha             = useObjetivosMenuStore(s => s.objFecha);
  const setObjFecha          = useObjetivosMenuStore(s => s.setObjFecha);
  const objDesc              = useObjetivosMenuStore(s => s.objDesc);
  const setObjDesc           = useObjetivosMenuStore(s => s.setObjDesc);
  const objSubmitting        = useObjetivosMenuStore(s => s.objSubmitting);
  const setObjSubmitting     = useObjetivosMenuStore(s => s.setObjSubmitting);
  const objVendedorRoutes    = useObjetivosMenuStore(s => s.objVendedorRoutes);
  const setObjVendedorRoutes = useObjetivosMenuStore(s => s.setObjVendedorRoutes);
  const objSelectedRutaId    = useObjetivosMenuStore(s => s.objSelectedRutaId);
  const setObjSelectedRutaId = useObjetivosMenuStore(s => s.setObjSelectedRutaId);
  const objDebtList          = useObjetivosMenuStore(s => s.objDebtList);
  const setObjDebtList       = useObjetivosMenuStore(s => s.setObjDebtList);
  const objInactivePdvCount  = useObjetivosMenuStore(s => s.objInactivePdvCount);
  const setObjInactivePdvCount = useObjetivosMenuStore(s => s.setObjInactivePdvCount);
  const objLoadingContext    = useObjetivosMenuStore(s => s.objLoadingContext);
  const setObjLoadingContext = useObjetivosMenuStore(s => s.setObjLoadingContext);
  const objCantidadAlteo     = useObjetivosMenuStore(s => s.objCantidadAlteo);
  const setObjCantidadAlteo  = useObjetivosMenuStore(s => s.setObjCantidadAlteo);
  const objCobranzaMode      = useObjetivosMenuStore(s => s.objCobranzaMode);
  const setObjCobranzaMode   = useObjetivosMenuStore(s => s.setObjCobranzaMode);
  const objCobranzaMonto     = useObjetivosMenuStore(s => s.objCobranzaMonto);
  const setObjCobranzaMonto  = useObjetivosMenuStore(s => s.setObjCobranzaMonto);
  const objSelectedDeudor    = useObjetivosMenuStore(s => s.objSelectedDeudor);
  const setObjSelectedDeudor = useObjetivosMenuStore(s => s.setObjSelectedDeudor);

  // Ruteo state (also in store)
  type ObjRuteoAccion = 'cambio_ruta' | 'baja';
  const objRuteoAccionGlobal    = useObjetivosMenuStore(s => s.objRuteoAccionGlobal);
  const setObjRuteoAccionGlobal = useObjetivosMenuStore(s => s.setObjRuteoAccionGlobal);
  const objRuteoItemsMap        = useObjetivosMenuStore(s => s.objRuteoItemsMap);
  const setObjRuteoItemsMap     = useObjetivosMenuStore(s => s.setObjRuteoItemsMap);
  const objRuteoConfigMode      = useObjetivosMenuStore(s => s.objRuteoConfigMode);
  const setObjRuteoConfigMode   = useObjetivosMenuStore(s => s.setObjRuteoConfigMode);
  const objRuteoGlobalDestinoId = useObjetivosMenuStore(s => s.objRuteoGlobalDestinoId);
  const setObjRuteoGlobalDestinoId = useObjetivosMenuStore(s => s.setObjRuteoGlobalDestinoId);
  const objRuteoGlobalMotivo    = useObjetivosMenuStore(s => s.objRuteoGlobalMotivo);
  const setObjRuteoGlobalMotivo = useObjetivosMenuStore(s => s.setObjRuteoGlobalMotivo);
  const resetObjForm            = useObjetivosMenuStore(s => s.resetObjForm);

  // ── CC Upload Dialog ──────────────────────────────────────────────────────
  type CCUploadStatus = "idle" | "uploading" | "polling" | "done" | "error";
  const [ccDialogOpen, setCCDialogOpen]     = useState(false);
  const [ccFile, setCCFile]                 = useState<File | null>(null);
  const [ccUploadStatus, setCCUploadStatus] = useState<CCUploadStatus>("idle");
  const [ccMessage, setCCMessage]           = useState("");
  const ccFileInputRef                      = useRef<HTMLInputElement>(null);
  const ccPollingRef                        = useRef<ReturnType<typeof setInterval> | null>(null);
  const ccTimeoutRef                        = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopCCPolling() {
    if (ccPollingRef.current) { clearInterval(ccPollingRef.current); ccPollingRef.current = null; }
    if (ccTimeoutRef.current) { clearTimeout(ccTimeoutRef.current); ccTimeoutRef.current = null; }
  }

  function resetCCDialog() {
    stopCCPolling();
    setCCFile(null);
    setCCUploadStatus("idle");
    setCCMessage("");
  }

  function handleCCDialogClose(open: boolean) {
    if (!open && ccUploadStatus !== "uploading" && ccUploadStatus !== "polling") {
      resetCCDialog();
      setCCDialogOpen(false);
    }
    if (open) setCCDialogOpen(true);
  }

  async function handleCCUpload() {
    if (!ccFile) return;
    setCCUploadStatus("uploading");
    setCCMessage("Enviando archivo...");
    try {
      await uploadCCForDist(selectedDist, ccFile);
      setCCUploadStatus("polling");
      setCCMessage("Procesando en segundo plano...");

      // Timeout de 2 minutos
      ccTimeoutRef.current = setTimeout(() => {
        stopCCPolling();
        toast.warning("El proceso está tardando. Refrescá la página en unos minutos.");
        resetCCDialog();
        setCCDialogOpen(false);
      }, 120_000);

      // Poll cada 3s
      ccPollingRef.current = setInterval(async () => {
        try {
          const status = await fetchCCStatus(selectedDist);
          if (status.estado === "completado") {
            stopCCPolling();
            toast.success(
              `Cuentas corrientes actualizadas. ${status.registros ?? 0} registros procesados.`
            );
            queryClient.invalidateQueries({ queryKey: ["supervision-cuentas"] });
            resetCCDialog();
            setCCDialogOpen(false);
          } else if (status.estado === "error") {
            stopCCPolling();
            toast.error(`Error: ${status.error_msg ?? "Error desconocido"}`);
            resetCCDialog();
            setCCDialogOpen(false);
          }
        } catch {
          // Transient network error — keep polling
        }
      }, 3_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error subiendo CC";
      toast.error(msg);
      setCCUploadStatus("error");
      setCCMessage(msg);
    }
  }

  // Cleanup polling on unmount
  useEffect(() => () => stopCCPolling(), []);

  // ── Sync selectedDist when distId changes (handles auth loading delay) ─────
  useEffect(() => {
    if (!isSuperadmin && distId > 0 && distId !== selectedDist) {
      setSelectedDist(distId);
    }
  }, [distId, isSuperadmin, selectedDist]);

  // Superadmin and cross-tenant users now use the global context switcher only.
  useEffect(() => {
    if (distId > 0 && distId !== selectedDist) {
      setSelectedDist(distId);
    }
  }, [distId, selectedDist]);

  const getVendorColor = useCallback((vendorId: number, idx: number) => {
    const key = `${selectedDist}:${vendorId}`;
    return vendorColorOverrides[key] ?? defaultVendorColor(idx);
  }, [selectedDist, vendorColorOverrides]);

  // ── TanStack Query: Vendedores ────────────────────────────────────────────
  const {
    data: vendedores = [],
    isLoading: loading,
    error: vendedoresError,
    refetch: refetchVendedores,
  } = useQuery({
    queryKey: ['supervision-vendedores', selectedDist],
    queryFn: () => fetchVendedoresSupervision(selectedDist),
    enabled: !!selectedDist,
    staleTime: 2 * 60 * 1000, // 2 minutes - vendedores don't change often
    placeholderData: (prev) => prev, // Keep previous data while refetching
  });

  const error = vendedoresError ? (vendedoresError instanceof Error ? vendedoresError.message : "Error cargando datos") : null;

  // Auto-select sucursal if only one exists
  useEffect(() => {
    if (vendedores.length > 0 && !selectedSucursal) {
      const slist = [...new Set(vendedores.map(v => v.sucursal_nombre))];
      if (slist.length === 1) setSelectedSucursal(slist[0]);
    }
  }, [vendedores, selectedSucursal, setSelectedSucursal]);

  // Clear visibility when changing distributor
  useEffect(() => {
    clearAll();
    setOpenVend(null);
    setOpenRuta(null);
    setOpenCliente(null);
    // Prevent cross-tenant cache bleeding (same route/vendor ids across dists).
    queryClient.removeQueries({ queryKey: ['supervision-rutas'] });
    queryClient.removeQueries({ queryKey: ['supervision-clientes'] });
  }, [selectedDist, clearAll, queryClient]);

  const { data: cuentasData = null, isLoading: loadingCuentas } = useQuery({
    queryKey: ['supervision-cuentas', selectedDist, selectedSucursal],
    queryFn: () => fetchCuentasSupervision(selectedDist!, selectedSucursal!),
    enabled: !!selectedDist && !!selectedSucursal,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const { data: syncStatus = null } = useQuery<SyncStatus>({
    queryKey: ['supervision-sync-status', selectedDist],
    queryFn: () => fetchSyncStatus(selectedDist!),
    enabled: !!selectedDist,
    staleTime: 30_000,
    refetchInterval: SUPERVISION_SYNC_POLL_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // ── Altas y Activaciones state ───────────────────────────────────────────
  const currentMes = new Date().toISOString().slice(0, 7);
  const [altasMes, setAltasMes] = useState(currentMes);
  const mesOptions = useMemo(() => {
    const opts: string[] = [];
    const d = new Date();
    for (let i = 0; i < 6; i++) {
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      d.setMonth(d.getMonth() - 1);
    }
    return opts;
  }, []);

  const selectedVendedorId = useMemo(() => {
    if (!openVend) return null;
    const v = vendedores.find(v => v.id_vendedor === openVend);
    return v?.id_vendedor ?? null;
  }, [openVend, vendedores]);

  const { data: altasData, isLoading: loadingAltas } = useQuery({
    queryKey: ['pdvs-movimiento', selectedDist, selectedVendedorId, altasMes],
    queryFn: () => fetchPdvsMovimiento(selectedDist!, selectedVendedorId!, altasMes),
    enabled: !!selectedDist && !!selectedVendedorId && !!altasMes,
    staleTime: 5 * 60_000,
  });

  // Cuando cambia last_updated del padrón (ingesta RPA), forzar rutas/clientes/vendedores.
  useEffect(() => {
    if (!selectedDist) return;
    const ts = syncStatus?.padron?.last_updated ?? null;
    if (!ts) return;
    const prev = lastPadronTsByDistRef.current[selectedDist];
    lastPadronTsByDistRef.current[selectedDist] = ts;
    if (prev === undefined) return;
    if (prev === ts) return;

    void queryClient.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey;
        if (!Array.isArray(k) || k[1] !== selectedDist) return false;
        const head = k[0];
        return (
          head === "supervision-vendedores" ||
          head === "supervision-rutas" ||
          head === "supervision-clientes"
        );
      },
    });
    setMapStatsTick((x) => x + 1);
  }, [syncStatus?.padron?.last_updated, selectedDist, queryClient]);

  // ── Exhibiciones fetch ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDist) return;
    let cancelled = false;
    setLoadingExhib(true);
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60 * 1000;
    const localToday = new Date(now.getTime() - offsetMs).toISOString().split("T")[0];

    let fechaDesde = localToday;
    if (exhibPeriodo === "7d") {
      const sevenDaysAgo = new Date(now.getTime() - (6 * 86_400_000));
      fechaDesde = new Date(sevenDaysAgo.getTime() - offsetMs).toISOString().split("T")[0];
    } else if (exhibPeriodo === "historico") {
      fechaDesde = "2000-01-01";
    }

    fetchReporteExhibiciones(selectedDist, { fecha_desde: fechaDesde, fecha_hasta: localToday })
      .then((res: any) => { if (!cancelled) setExhibiciones(Array.isArray(res) ? res : []); })
      .catch(() => { if (!cancelled) setExhibiciones([]); })
      .finally(() => { if (!cancelled) setLoadingExhib(false); });
    return () => { cancelled = true; };
  }, [selectedDist, exhibPeriodo]);

  // ── Derived & Filtered ────────────────────────────────────────────────────
  const sucursales = useMemo(() =>
    [...new Set(vendedores.map(v => v.sucursal_nombre))].sort(),
    [vendedores]
  );

  const vendedoresFiltrados = useMemo(() => {
    const filtered = selectedSucursal ? vendedores.filter(v => v.sucursal_nombre === selectedSucursal) : [];
    return [...filtered].sort((a, b) => {
      const pctA = a.total_pdv > 0 ? a.pdv_activos / a.total_pdv : 0;
      const pctB = b.total_pdv > 0 ? b.pdv_activos / b.total_pdv : 0;
      return pctB - pctA;
    });
  }, [vendedores, selectedSucursal]);

  useEffect(() => {
    const unsub = queryClient.getQueryCache().subscribe((e) => {
      const qk = e.query?.queryKey;
      if (!Array.isArray(qk) || qk[1] !== selectedDist) return;
      if (qk[0] === "supervision-clientes" || qk[0] === "supervision-rutas") {
        setMapStatsTick((t) => t + 1);
      }
    });
    return unsub;
  }, [queryClient, selectedDist]);

  const vendorMapEligibleStats = useMemo(() => {
    const m = new Map<number, VendorMapEligibleStats>();
    if (!selectedDist) return m;
    for (const v of vendedoresFiltrados) {
      m.set(v.id_vendedor, getVendorMapEligibleStats(queryClient, selectedDist, v.id_vendedor));
    }
    return m;
  }, [vendedoresFiltrados, selectedDist, queryClient, mapStatsTick]);

  const { totalPdv, totalActivos, pctActivos } = useMemo(() => {
    // Solo mezclar fuentes si TODOS los vendedores tienen datos de caché completos;
    // en caso contrario usar siempre los números del backend para evitar saltos al
    // ir cargando rutas/PDVs de forma incremental (toggle por vendedor).
    const allComplete = USE_MAP_ELIGIBLE_STATS_FOR_KPIS && vendedoresFiltrados.length > 0 &&
      vendedoresFiltrados.every(v => vendorMapEligibleStats.get(v.id_vendedor)?.complete);
    let tp = 0;
    let ta = 0;
    for (const v of vendedoresFiltrados) {
      if (allComplete) {
        const s = vendorMapEligibleStats.get(v.id_vendedor)!;
        tp += s.totalMap;
        ta += s.activosMap;
      } else {
        tp += v.total_pdv;
        ta += v.pdv_activos ?? 0;
      }
    }
    return {
      totalPdv: tp,
      totalActivos: ta,
      pctActivos: tp > 0 ? Math.round((ta / tp) * 100) : 0,
    };
  }, [vendedoresFiltrados, vendorMapEligibleStats]);

  // Backend ya filtra por sucursal — cuentasData llega pre-filtrado
  const cuentasFiltradas = cuentasData ?? null;

  const exhibicionesFiltradas = useMemo(() => {
    let filtered = exhibiciones;
    if (selectedSucursal) {
      const allowedVendors = new Set(vendedoresFiltrados.map(v => normalizeText(v.nombre_vendedor)));
      filtered = filtered.filter((e: any) => allowedVendors.has(normalizeText(e.vendedor)));
    }
    if (exhibFilter !== "Todos") {
      const target = normalizeExhibEstado(exhibFilter);
      filtered = filtered.filter((e: any) => normalizeExhibEstado(e.estado) === target);
    }
    if (exhibSearch.trim()) {
      const q = exhibSearch.trim().toLowerCase();
      filtered = filtered.filter(e =>
        (e.cliente ?? "").toLowerCase().includes(q) ||
        (e.vendedor ?? "").toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [exhibiciones, exhibFilter, exhibSearch, selectedSucursal, vendedoresFiltrados]);

  // ── CC Cliente info popup ────────────────────────────────────────────────
  const handleClienteClick = async (nombre: string, idClienteErp?: string | null) => {
    setClientePopup({ nombre, data: null, loading: true });
    try {
      const data = await fetchClienteInfo(selectedDist, nombre, idClienteErp);
      setClientePopup({ nombre, data, loading: false });
    } catch {
      setClientePopup({ nombre, data: [], loading: false });
    }
  };

  // ── TanStack Query: Rutas (lazy-loaded per vendor) ───────────────────────
  const getRutasQuery = (vendorId: number) => ({
    queryKey: ['supervision-rutas', selectedDist, vendorId],
    queryFn: () => fetchRutasSupervision(vendorId),
    staleTime: SUPERVISION_MAP_RUTAS_STALE_MS,
    gcTime: Infinity, // Mantener en memoria; staleTime permite refetch tras padrón / TTL
    enabled: false, // Lazy load
  });

  // ── TanStack Query: Clientes (lazy-loaded per ruta) ──────────────────────
  const getClientesQuery = (rutaId: number) => ({
    queryKey: ['supervision-clientes', selectedDist, rutaId],
    queryFn: () => fetchClientesSupervision(rutaId),
    staleTime: SUPERVISION_MAP_CLIENTES_STALE_MS,
    gcTime: Infinity,
    enabled: false, // Lazy load
  });

  // ── Accordion handlers with query prefetching ─────────────────────────────
  async function handleVend(id: number) {
    if (openVend === id) { 
      setOpenVend(null); 
      return; 
    }
    setOpenVend(id); 
    setOpenRuta(null); 
    setOpenCliente(null);
    
    // Prefetch rutas if not in cache
    await queryClient.prefetchQuery(getRutasQuery(id));
  }

  async function handleRuta(id: number) {
    if (openRuta === id) { 
      setOpenRuta(null); 
      return; 
    }
    setOpenRuta(id); 
    setOpenCliente(null);
    
    // Prefetch clientes if not in cache
    await queryClient.prefetchQuery(getClientesQuery(id));
  }

  function handleCliente(id: number) {
    setOpenCliente(openCliente === id ? null : id);
  }

  // ── Load helper: all routes+clients for one vendor (uses query cache) ────
  async function loadDataForVendor(vendId: number): Promise<{
    vendRutas: RutaSupervision[];
    allClientIds: number[];
    allRutaIds: number[];
  }> {
    // Fetch or get from cache
    const vendRutas = await queryClient.fetchQuery(getRutasQuery(vendId));
    const allRutaIds: number[] = vendRutas.map(r => r.id_ruta);
    const allClientIds: number[] = [];
    const seenCli = new Set<number>();

    await Promise.all(
      vendRutas.map(async r => {
        const cli = await queryClient.fetchQuery(getClientesQuery(r.id_ruta));
        cli.forEach((c) => {
          if (seenCli.has(c.id_cliente)) return;
          seenCli.add(c.id_cliente);
          allClientIds.push(c.id_cliente);
        });
      })
    );
    
    return { vendRutas, allClientIds, allRutaIds };
  }

  // ── VENDOR TOGGLE (uses Zustand store) ───────────────────────────────────
  async function toggleVendor(vendId: number) {
    const isOn = visibleVends.has(vendId);
    if (isOn) {
      // Turn OFF: remove vendor from map
      toggleVendorStore(vendId);
    } else {
      // Turn ON: load everything, enable all routes+clients
      setLoadingMap(p => new Set([...p, vendId]));
      try {
        const { allRutaIds, allClientIds } = await loadDataForVendor(vendId);
        setVisibleVends(new Set([...visibleVends, vendId]));
        setVisibleRutas(new Set([...visibleRutas, ...allRutaIds]));
        setVisibleClientes(new Set([...visibleClientes, ...allClientIds]));
      } finally {
        setLoadingMap(p => { const s = new Set(p); s.delete(vendId); return s; });
      }
    }
  }

  // ── ROUTE TOGGLE (uses Zustand store) ────────────────────────────────────
  async function toggleRuta(rutaId: number, vendId: number) {
    const isOn = visibleRutas.has(rutaId);
    if (isOn) {
      // Turn OFF: remove ruta; only hide clients not present in another visible route
      const rutaClientes = queryClient.getQueryData<ClienteSupervision[]>(['supervision-clientes', selectedDist, rutaId]) ?? [];
      const clientIds = rutaClientes.map(c => c.id_cliente);
      
      toggleRutaStore(rutaId);
      const newVisibleClientes = new Set(visibleClientes);
      const rutasRestantes = [...visibleRutas].filter((id) => id !== rutaId);
      clientIds.forEach((id) => {
        const stillVisibleInAnotherRoute = rutasRestantes.some((rid) => {
          const clientsInRoute = queryClient.getQueryData<ClienteSupervision[]>(['supervision-clientes', selectedDist, rid]) ?? [];
          return clientsInRoute.some((c) => c.id_cliente === id);
        });
        if (!stillVisibleInAnotherRoute) {
          newVisibleClientes.delete(id);
        }
      });
      setVisibleClientes(newVisibleClientes);
    } else {
      // Turn ON: ensure vendor + ruta are on, load clients
      setLoadingMap(p => new Set([...p, vendId]));
      try {
        const cli = await queryClient.fetchQuery(getClientesQuery(rutaId));

        setVisibleVends(new Set([...visibleVends, vendId]));
        setVisibleRutas(new Set([...visibleRutas, rutaId]));
        const ids = cli.map((c) => c.id_cliente);
        setVisibleClientes(new Set([...visibleClientes, ...ids]));
      } finally {
        setLoadingMap(p => { const s = new Set(p); s.delete(vendId); return s; });
      }
    }
  }

  // ── PDV TOGGLE (uses Zustand store) ──────────────────────────────────────
  function toggleCliente(clienteId: number) {
    toggleClienteStore(clienteId);
  }

  // ── Map pins — 3-level visibility check (uses query cache + server flag) ─
  const pines = useMemo<PinCliente[]>(() => {
    // Normaliza IDs ERP: elimina sufijo .0 (float→string de Excel), ceros a la izquierda y mayúsculas
    const normErpId = (id: string | null | undefined): string | null => {
      if (!id) return null;
      let s = String(id).trim();
      if (s.endsWith('.0')) s = s.slice(0, -2);
      s = s.replace(/^0+/, '') || '0';
      return s.toLowerCase();
    };

    // Normaliza nombres: quita acentos, puntuación y colapsa espacios.
    // Tolera diferencias entre CHESS ERP (CC) y Consolido (padrón).
    const normName = (s: string | null | undefined): string => {
      if (!s) return '';
      let n = s.trim().toUpperCase();
      n = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      n = n.replace(/[^A-Z0-9 ]/g, '');
      n = n.replace(/\s+/g, ' ').trim();
      return n;
    };

    // Build deuda lookup from cuentas corrientes
    const deudaByErpId = new Map<string, { deuda: number; antiguedad: number }>();
    const deudaByNombre = new Map<string, { deuda: number; antiguedad: number }>();
    const deudaById = new Map<number, { deuda: number; antiguedad: number }>();
    // Vendor-scoped name lookup: `${id_vendedor}:${normName}` → deuda
    // Más confiable que nombre global porque CHESS y Consolido tienen ERP IDs distintos
    const deudaByVendorClient = new Map<string, { deuda: number; antiguedad: number }>();
    if (cuentasData) {
      cuentasData.vendedores.forEach((v: any) => {
        const vId: number | null = v.id_vendedor ?? null;
        v.clientes.forEach((c: any) => {
          const entry = { deuda: c.deuda_total ?? 0, antiguedad: c.antiguedad ?? 0 };
          const normErp = normErpId(c.id_cliente_erp);
          if (normErp) {
            deudaByErpId.set(normErp, entry);
          }
          if (c.id_cliente) {
            deudaById.set(Number(c.id_cliente), entry);
          }
          if (c.cliente) {
            // Index both raw-lowercase AND normalized (accent+punct stripped) to match more names
            deudaByNombre.set(c.cliente.toLowerCase().trim(), entry);
            const nn = normName(c.cliente);
            if (nn) deudaByNombre.set(nn, entry);
            // Vendor-scoped: más fiable porque id_vendedor es mismo PK en ambos ERPs
            if (vId && nn) deudaByVendorClient.set(`${vId}:${nn}`, entry);
          }
        });
      });
    }

    const result: PinDedupeRow[] = [];
    vendedores.forEach((v, idx) => {
      if (!visibleVends.has(v.id_vendedor)) return;
      const color = getVendorColor(v.id_vendedor, idx);
      
      // Get rutas from query cache
      const vendRutas = queryClient.getQueryData<RutaSupervision[]>(['supervision-rutas', selectedDist, v.id_vendedor]) ?? [];
      
      vendRutas.forEach(r => {
        if (!visibleRutas.has(r.id_ruta)) return;
        
        // Get clientes from query cache
        const rutaClientes = queryClient.getQueryData<ClienteSupervision[]>(['supervision-clientes', selectedDist, r.id_ruta]) ?? [];
        
        rutaClientes.forEach(c => {
          if (!visibleClientes.has(c.id_cliente)) return;
          if (!hasValidCoords(c.latitud, c.longitud)) return;
          
          // Cross-reference deuda: PK > vendor-scoped nombre > ERP ID > nombre global
          const erpId = normErpId(c.id_cliente_erp);
          const nombreFantasia = (c.nombre_fantasia || "").toLowerCase().trim();
          const nombreRazon = (c.nombre_razon_social || "").toLowerCase().trim();
          const normFantasia = normName(c.nombre_fantasia);
          const normRazon = normName(c.nombre_razon_social);
          const deudaInfo = deudaById.get(c.id_cliente)
            // Vendor-scoped: id_vendedor es el mismo PK en ambos sistemas (resuelto en ingesta)
            ?? (v.id_vendedor && normFantasia ? deudaByVendorClient.get(`${v.id_vendedor}:${normFantasia}`) : null)
            ?? (v.id_vendedor && normRazon ? deudaByVendorClient.get(`${v.id_vendedor}:${normRazon}`) : null)
            ?? (erpId ? deudaByErpId.get(erpId) : null)
            ?? (nombreFantasia ? deudaByNombre.get(nombreFantasia) : null)
            ?? (normFantasia ? deudaByNombre.get(normFantasia) : null)
            ?? (nombreRazon ? deudaByNombre.get(nombreRazon) : null)
            ?? (normRazon ? deudaByNombre.get(normRazon) : null)
            ?? null;
          
          result.push({
            pin: {
              id:                    c.id_cliente,
              lat:                   c.latitud!,
              lng:                   c.longitud!,
              nombre:                c.nombre_fantasia || c.nombre_razon_social || "Sin nombre",
              razonSocial:           c.nombre_razon_social ?? null,
              color,
              activo:                !isInactivo30(c.fecha_ultima_compra),
              vendedor:              v.nombre_vendedor,
              ultimaCompra:          fmt(c.fecha_ultima_compra),
              conExhibicion:         c.fecha_ultima_exhibicion != null,
              idClienteErp:          c.id_cliente_erp ?? null,
              nroRuta:               r.dia_semana ?? null,
              fechaUltimaCompra:     c.fecha_ultima_compra ?? null,
              fechaUltimaExhibicion: c.fecha_ultima_exhibicion ?? null,
              urlExhibicion:         c.url_ultima_exhibicion ?? null,
              deuda:                 deudaInfo?.deuda ?? null,
              antiguedadDias:        deudaInfo?.antiguedad ?? null,
              totalExhibiciones:     c.total_exhibiciones ?? 0,
              id_vendedor:           v.id_vendedor,
            },
            estadoPdv: c.estado,
            fechaUc:   c.fecha_ultima_compra ?? null,
            idCliente: c.id_cliente,
          });
        });
      });
    });

    return dedupePinsByClienteErp(result);
  }, [vendedores, visibleVends, visibleRutas, visibleClientes, cuentasData, queryClient, mapStatsTick]);

  // ── Floating Objetivos: contextual data loader ───────────────────────────
  useEffect(() => {
    const firstPin = pines.find(p => selectedPDVsForObjective.includes(p.id) && p.id_vendedor);
    if (!firstPin?.id_vendedor) {
      setObjVendedorRoutes([]);
      setObjDebtList([]);
      return;
    }
    const vendedorId = firstPin.id_vendedor;

    if (objTipo === "ruteo_alteo") {
      setObjLoadingContext(true);
      fetchRutasSupervision(vendedorId)
        .then(rutas => setObjVendedorRoutes(
          [...rutas]
            .sort((a, b) => (DIA_ORDER[a.dia_semana?.toLowerCase() ?? ""] ?? 9) - (DIA_ORDER[b.dia_semana?.toLowerCase() ?? ""] ?? 9))
            .map((r: RutaSupervision) => ({
              id_ruta: r.id_ruta,
              nro_ruta: r.nombre_ruta ?? String(r.id_ruta),
              dia_semana: r.dia_semana ?? "",
              total_pdv: r.total_pdv ?? 0,
            }))
        ))
        .catch(() => setObjVendedorRoutes([]))
        .finally(() => setObjLoadingContext(false));
    } else if (objTipo === "cobranza") {
      setObjLoadingContext(true);
      fetchCuentasSupervision(selectedDist)
        .then((data: CuentasSupervision) => {
          // Match by vendor name since VendedorCuentas doesn't expose id_vendedor
          const firstPin = pines.find(p => p.id === selectedPDVsForObjective[0] && p.id_vendedor);
          const vendorName = firstPin?.vendedor ?? "";
          const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          const vend = data.vendedores.find((v) => norm(v.vendedor) === norm(vendorName));
          if (vend) {
            setObjDebtList(
              (vend.clientes ?? [])
                .filter((c) => (c.deuda_total ?? 0) > 0)
                .sort((a, b) => (b.deuda_total ?? 0) - (a.deuda_total ?? 0))
                .slice(0, 10)
                .map((c) => ({ cliente_nombre: c.cliente ?? "–", deuda_total: c.deuda_total ?? 0 }))
            );
          }
        })
        .catch(() => setObjDebtList([]))
        .finally(() => setObjLoadingContext(false));
    } else if (objTipo === "ruteo") {
      setObjLoadingContext(true);
      fetchRutasSupervision(vendedorId)
        .then(rutas => setObjVendedorRoutes(
          [...rutas]
            .sort((a, b) => (DIA_ORDER[a.dia_semana?.toLowerCase() ?? ""] ?? 9) - (DIA_ORDER[b.dia_semana?.toLowerCase() ?? ""] ?? 9))
            .map((r: RutaSupervision) => ({
              id_ruta: r.id_ruta,
              nro_ruta: r.nombre_ruta ?? String(r.id_ruta),
              dia_semana: r.dia_semana ?? "",
              total_pdv: r.total_pdv ?? 0,
            }))
        ))
        .catch(() => setObjVendedorRoutes([]))
        .finally(() => setObjLoadingContext(false));
    } else if (objTipo === "conversion_estado" || objTipo === "exhibicion") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const vendorPins = pines.filter(p => p.id_vendedor === vendedorId);
      const inactive = vendorPins.filter(p =>
        !p.fechaUltimaCompra || p.fechaUltimaCompra < thirtyDaysAgo
      );
      setObjInactivePdvCount(inactive.length);
    }
  }, [objTipo, selectedPDVsForObjective.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Objective phrase builder ─────────────────────────────────────────────
  function buildObjectivePhrase(
    tipo: ObjetivoTipo,
    vendorName: string,
    selectedRuta: { id_ruta: number; nro_ruta: string; dia_semana: string; total_pdv: number } | null,
    fecha: string,
    cantidadAlteo?: number | "",
    selectedDeudor?: {cliente_nombre: string; deuda_total: number} | null,
    cobranzaMode?: "total" | "parcial",
    cobranzaMonto?: number | "",
  ): string {
    const diasDisponibles = fecha
      ? Math.max(0, Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000))
      : null;
    const fechaLabel = fecha ? ` para el día ${fecha}` : "";
    const diasLabel = diasDisponibles !== null ? ` Tenés ${diasDisponibles} días para cumplir el objetivo.` : "";

    if (tipo === "ruteo_alteo" && selectedRuta) {
      const qty = cantidadAlteo || selectedRuta.total_pdv;
      return `${vendorName} debe Altear ${qty} PDVs en la ruta ${selectedRuta.nro_ruta} de los días ${selectedRuta.dia_semana}${fechaLabel}.${diasLabel}`;
    }
    if (tipo === "cobranza") {
      if (selectedDeudor) {
        const monto = cobranzaMode === "parcial" && cobranzaMonto ? cobranzaMonto : selectedDeudor.deuda_total;
        return `${vendorName} deberá cobrarle $${monto.toLocaleString("es-AR")} a ${selectedDeudor.cliente_nombre}${fechaLabel}.`;
      }
      return `${vendorName} deberá cobrar deuda pendiente${fechaLabel}.`;
    }
    if (tipo === "conversion_estado") {
      return `${vendorName} debe activar clientes inactivos${fechaLabel}.`;
    }
    if (tipo === "exhibicion") {
      return `${vendorName} debe exhibir en PDVs${fechaLabel}.`;
    }
    if (tipo === "ruteo") {
      return `${vendorName} debe reasignar PDVs${fechaLabel}.`;
    }
    return "";
  }

  // ── Floating Objetivos submit ─────────────────────────────────────────────
  const handleSubmitObjectives = async () => {
    if (selectedPDVsForObjective.length === 0) return;
    setObjSubmitting(true);
    try {
      if (objTipo === "ruteo") {
        if (objRuteoConfigMode === "global") {
          if (objRuteoAccionGlobal === "cambio_ruta" && !objRuteoGlobalDestinoId) {
            toast.error("Seleccioná la ruta destino");
            return;
          }
          if (objRuteoAccionGlobal === "baja" && !objRuteoGlobalMotivo.trim()) {
            toast.error("Indicá el motivo de baja");
            return;
          }
        }
        // For ruteo: group all selected PDVs into a single objetivo with pdv_items
        const firstPin = pines.find(p => selectedPDVsForObjective.includes(p.id) && p.id_vendedor);
        if (firstPin?.id_vendedor) {
          const autoDesc = objDesc || buildObjectivePhrase(objTipo, firstPin.vendedor, null, objFecha);
          const globalDestinoRuta = objVendedorRoutes.find(r => r.id_ruta === objRuteoGlobalDestinoId) ?? null;
          const pdvItems = selectedPDVsForObjective.map((pdvId, idx) => {
            const pin = pines.find(p => p.id === pdvId);
            if (objRuteoConfigMode === "global") {
              const acc = objRuteoAccionGlobal;
              return {
                id_cliente_pdv: pdvId,
                nombre_pdv: pin?.nombre,
                accion_ruteo: acc,
                ...(acc === "cambio_ruta" && objRuteoGlobalDestinoId
                  ? {
                      id_ruta_destino: objRuteoGlobalDestinoId,
                      metadata_ruteo: {
                        nro_ruta_destino: globalDestinoRuta?.nro_ruta ?? null,
                        dia_semana_destino: globalDestinoRuta?.dia_semana ?? null,
                      },
                    }
                  : {}),
                ...(acc === "baja" && objRuteoGlobalMotivo.trim()
                  ? { motivo_baja: objRuteoGlobalMotivo.trim() }
                  : {}),
                orden_sugerido: idx + 1,
              };
            }
            const item = objRuteoItemsMap[pdvId] ?? { accion: objRuteoAccionGlobal };
            const destinoRuta = objVendedorRoutes.find(r => r.id_ruta === item.id_ruta_destino) ?? null;
            return {
              id_cliente_pdv: pdvId,
              nombre_pdv: pin?.nombre,
              accion_ruteo: item.accion,
              ...(item.accion === 'cambio_ruta' && item.id_ruta_destino
                ? {
                    id_ruta_destino: item.id_ruta_destino,
                    metadata_ruteo: {
                      nro_ruta_destino: destinoRuta?.nro_ruta ?? null,
                      dia_semana_destino: destinoRuta?.dia_semana ?? null,
                    },
                  }
                : {}),
              ...(item.accion === 'baja' && item.motivo_baja ? { motivo_baja: item.motivo_baja } : {}),
              orden_sugerido: idx + 1,
            };
          });
          // Si "Armar Ruta" está activo, enriquecer items con metadata de polígono
          const hasValidPolygon =
            routeBuildEnabled &&
            !!activePolygonGeoJson &&
            Array.isArray(activePolygonGeoJson.geometry?.coordinates) &&
            Array.isArray(activePolygonGeoJson.geometry.coordinates[0]) &&
            activePolygonGeoJson.geometry.coordinates[0].length >= 4;
          const groupId = hasValidPolygon
            ? crypto.randomUUID()
            : undefined;
          const enrichedPdvItems = pdvItems.map(item => ({
            ...item,
            ...(groupId && activePolygonGeoJson ? {
              group_id: groupId,
              group_name: 'Polígono de ruteo',
              polygon_geojson: activePolygonGeoJson as Record<string, unknown>,
            } : {}),
          }));
          await createObjetivo({
            id_distribuidor: selectedDist,
            id_vendedor: firstPin.id_vendedor,
            tipo: objTipo,
            nombre_vendedor: firstPin.vendedor,
            descripcion: autoDesc || undefined,
            fecha_objetivo: objFecha || undefined,
            valor_objetivo: selectedPDVsForObjective.length,
            pdv_items: enrichedPdvItems,
            ruteo_build_mode: hasValidPolygon ? 'polygon' : 'manual',
          } as ObjetivoCreate);
        }
      } else {
        // Agrupar PDVs por vendedor → un solo objetivo por vendedor con pdv_items
        const byVendedor = new Map<number, { vendedor: string; pdvs: typeof pines }>();
        for (const pdvId of selectedPDVsForObjective) {
          const pin = pines.find(p => p.id === pdvId);
          if (!pin || !pin.id_vendedor) continue;
          if (!byVendedor.has(pin.id_vendedor)) {
            byVendedor.set(pin.id_vendedor, { vendedor: pin.vendedor, pdvs: [] });
          }
          byVendedor.get(pin.id_vendedor)!.pdvs.push(pin);
        }

        for (const [vendedorId, { vendedor, pdvs }] of byVendedor) {
          const selectedRuta = objVendedorRoutes.find(r => r.id_ruta === objSelectedRutaId) ?? null;
          const autoDesc = objDesc || buildObjectivePhrase(objTipo, vendedor, selectedRuta, objFecha, objCantidadAlteo, objSelectedDeudor, objCobranzaMode, objCobranzaMonto);

          // Para cobranza (objetivo de deuda, no multi-PDV) usar id_target_pdv del primer pin
          if (objTipo === "cobranza") {
            await createObjetivo({
              id_distribuidor: selectedDist,
              id_vendedor: vendedorId,
              tipo: objTipo,
              id_target_pdv: pdvs[0].id,
              nombre_pdv: pdvs[0].nombre,
              nombre_vendedor: vendedor,
              descripcion: autoDesc || undefined,
              fecha_objetivo: objFecha || undefined,
              ...(objSelectedDeudor ? {
                valor_objetivo: objCobranzaMode === "parcial" && objCobranzaMonto ? Number(objCobranzaMonto) : objSelectedDeudor.deuda_total,
              } : {}),
            } as ObjetivoCreate);
          } else {
            // Un solo objetivo con todos los PDVs como pdv_items
            await createObjetivo({
              id_distribuidor: selectedDist,
              id_vendedor: vendedorId,
              tipo: objTipo,
              nombre_vendedor: vendedor,
              descripcion: autoDesc || undefined,
              fecha_objetivo: objFecha || undefined,
              valor_objetivo: pdvs.length,
              pdv_items: pdvs.map(pin => ({
                id_cliente_pdv: pin.id,
                id_cliente_erp: pin.idClienteErp ?? undefined,
                nombre_pdv: pin.nombre,
              })),
            } as ObjetivoCreate);
          }
        }
      }
      clearSelectedPDVs();
      resetObjForm();
      setObjMenuOpen(false);
      // Limpiar estado de Armar Ruta tras submit exitoso
      if (routeBuildEnabled) clearRouteBuildState();
    } finally {
      setObjSubmitting(false);
    }
  };

  // ── Map layer controls (inline pill bar above the map) ────────────────────
  // Replaces the old MAP_MODES selector — only 'activos' and 'deudores' remain.
  // "Armar Ruta" is now a layer tool in this same control bar.
  function MapLayerControls() {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]/80 shrink-0 flex-wrap">
        {/* Capa Activos */}
        <button
          onClick={() => setMapMode('activos')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            mapMode === 'activos'
              ? 'border-[var(--shelfy-accent)] bg-[var(--shelfy-accent)]/15 text-[var(--shelfy-accent)]'
              : 'border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:border-[var(--shelfy-accent)]/40 hover:text-[var(--shelfy-text)]'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          Activos
        </button>

        {/* Separador */}
        {hasPermiso("action_edit_objetivos") && (
          <span className="w-px h-5 bg-[var(--shelfy-border)] mx-0.5" />
        )}

        {/* Armar Ruta — herramienta de polígono */}
        {hasPermiso("action_edit_objetivos") && (
          <button
            onClick={handleToggleRouteBuild}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              routeBuildEnabled
                ? 'border-violet-400/60 bg-violet-500/15 text-violet-400'
                : 'border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:border-violet-400/40 hover:text-violet-400'
            }`}
          >
            <RouteIcon className="w-3.5 h-3.5" />
            {routeBuildEnabled
              ? `Dibujar Zona · ${activePolygonPdvIds.length > 0 ? `${activePolygonPdvIds.length} PDVs` : 'dibujá'}`
              : 'Dibujar Zona'
            }
            {routeBuildEnabled && (
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse ml-0.5" />
            )}
          </button>
        )}
      </div>
    );
  }

  // ── Vendor panel content for MapaRutas fullscreen overlay ────────────────
  const vendorPanelContent = (
    <div className="flex flex-col h-full text-white" style={{ background: "rgba(10,14,24,0.97)" }}>
      {/* Header Sucursal selector (Compact) */}
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
          Sucursal
        </p>
        <div className="flex flex-wrap gap-1.5">
          {sucursales.map(suc => (
            <button
              key={suc}
              onClick={() => {
                  setSelectedSucursal(suc === selectedSucursal && sucursales.length > 1 ? null : suc);
                setVisibleVends(new Set());
                setVisibleRutas(new Set());
                setVisibleClientes(new Set());
              }}
              className={`px-3 py-1 rounded-lg text-[10px] font-semibold border transition-all duration-200 ${
                selectedSucursal === suc
                  ? "bg-[var(--shelfy-primary)] text-white border-transparent"
                  : "bg-white/5 text-white/50 border-white/10 hover:text-white/80"
              }`}
            >
              {suc}
            </button>
          ))}
        </div>
      </div>

      {/* List of Vendors + Routes + PDVs (Cascada) */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-white/5">
        {!selectedSucursal && (
          <div className="flex flex-col items-center justify-center py-12 text-white/20">
            <Building2 className="w-8 h-8 opacity-20" />
            <p className="text-[10px] text-center px-6 mt-2">Seleccioná una sucursal</p>
          </div>
        )}
        {vendedoresFiltrados.map(v => {
          const idx       = vendedores.indexOf(v);
          const color     = getVendorColor(v.id_vendedor, idx);
          const vOpen     = openVend === v.id_vendedor;
          const vRutasRaw = queryClient.getQueryData<RutaSupervision[]>(['supervision-rutas', selectedDist, v.id_vendedor]) ?? [];
          const vRutas    = [...vRutasRaw].sort(
            (a, b) =>
              (DIA_ORDER[a.dia_semana?.toLowerCase() ?? ""] ?? 9) -
              (DIA_ORDER[b.dia_semana?.toLowerCase() ?? ""] ?? 9)
          );
          const isVendOn  = visibleVends.has(v.id_vendedor);
          const isVendLoad = loadingMap.has(v.id_vendedor);
          const mapS      = vendorMapEligibleStats.get(v.id_vendedor);
          const pdvTot    = USE_MAP_ELIGIBLE_STATS_FOR_KPIS && mapS?.complete ? mapS.totalMap : v.total_pdv;
          const pdvAct    = USE_MAP_ELIGIBLE_STATS_FOR_KPIS && mapS?.complete ? mapS.activosMap : (v.pdv_activos ?? 0);
          const pct       = pdvTot > 0 ? Math.round((pdvAct / pdvTot) * 100) : 0;

          return (
            <div key={v.id_vendedor}>
              <div className="flex items-stretch px-3 py-2.5 hover:bg-white/5 transition-colors">
                <div className="w-1 shrink-0 rounded-full mr-3" style={{ backgroundColor: isVendOn ? color : "transparent" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <VendorAvatar nombre={v.nombre_vendedor} color={color} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-white truncate leading-snug">{v.nombre_vendedor}</p>
                      <p className="text-[10px] text-white/40">{pdvTot} PDV · {pct}% activos</p>
                      {/* Stats 7d pills */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(v.pdv_nuevos_7d ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/20">
                            +{v.pdv_nuevos_7d} nuevos
                          </span>
                        )}
                        {(v.pdv_activados_7d ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            {v.pdv_activados_7d} activ. 7d
                          </span>
                        )}
                        {(v.pdv_exhibidos ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/20">
                            {v.pdv_exhibidos} exhibidos
                          </span>
                        )}
                        {(v.pdv_exhibidos_nuevos_7d ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/20">
                            {v.pdv_exhibidos_nuevos_7d} 1ª vez
                          </span>
                        )}
                        {((v.pdv_nuevos_7d ?? 0) > 0 || (v.pdv_activados_7d ?? 0) > 0 || (v.pdv_exhibidos ?? 0) > 0 || (v.pdv_exhibidos_nuevos_7d ?? 0) > 0) && (
                          <span
                            title={"🟠 Nuevos: PDVs dados de alta en los últimos 7 días\n🟢 Activ. 7d: PDVs con compra en los últimos 7 días\n🟣 Exhibidos: PDVs con foto de exhibición en últimos 30 días\n🔵 1ª vez: PDVs con primera exhibición en los últimos 7 días"}
                            className="inline-flex items-center px-1 py-0.5 rounded text-white/25 hover:text-white/60 transition-colors cursor-help"
                          >
                            <HelpCircle className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setVendorColorOverride(selectedDist, v.id_vendedor, e.target.value)}
                        title="Personalizar color del vendedor"
                        className="w-5 h-5 p-0 border border-white/20 rounded bg-transparent cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => clearVendorColorOverride(selectedDist, v.id_vendedor)}
                        title="Restaurar color automático"
                        className="w-5 h-5 rounded border border-white/15 text-[10px] text-white/50 hover:text-white/80 hover:border-white/30 transition-colors"
                      >
                        ↺
                      </button>
                    </div>
                    <button
                      onClick={() => toggleVendor(v.id_vendedor)}
                      className={`w-6 h-6 rounded flex items-center justify-center border transition-all shrink-0 ${
                        isVendOn ? "border-transparent text-white" : "border-white/10 text-white/30"
                      }`}
                      style={isVendOn ? { backgroundColor: color, boxShadow: `0 0 6px ${color}55` } : {}}
                    >
                      {isVendLoad
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : isVendOn ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />
                      }
                    </button>
                  </div>
                  <button
                    onClick={() => handleVend(v.id_vendedor)}
                    className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
                  >
                    <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${vOpen ? "rotate-90" : ""}`} />
                    {vOpen ? "Ocultar rutas" : "Ver rutas"}
                  </button>
                </div>
              </div>

              <Accordion open={vOpen}>
                <div className="bg-black/20 divide-y divide-white/5">
                  {vRutas.map(r => {
                    const rOpen    = openRuta === r.id_ruta;
                    const isRutaOn = visibleRutas.has(r.id_ruta);
                    const rCli     = queryClient.getQueryData<ClienteSupervision[]>(['supervision-clientes', selectedDist, r.id_ruta]) ?? [];
                    const cliVis   = rCli.filter(c => visibleClientes.has(c.id_cliente)).length;

                    return (
                      <div key={r.id_ruta}>
                        <div className="flex items-center gap-2 px-6 py-2 hover:bg-white/5 transition-colors">
                          <button onClick={() => handleRuta(r.id_ruta)} className="flex-1 flex items-center gap-2 text-left min-w-0">
                            <ChevronRight className={`w-3 h-3 text-white/20 transition-transform ${rOpen ? "rotate-90" : ""}`} />
                            <RouteIcon className="w-3 h-3" style={{ color: isRutaOn ? color : color + "66" }} />
                            <span className="text-[11px] font-semibold text-white/70 truncate">Ruta {r.nombre_ruta}</span>
                          </button>
                          <div className="flex items-center gap-2">
                             <span className="text-[9px] font-bold text-white/30">{isRutaOn ? cliVis : r.total_pdv}</span>
                             <EyeBtn on={isRutaOn} color={color} className="w-5 h-5" onClick={() => toggleRuta(r.id_ruta, v.id_vendedor)} />
                          </div>
                        </div>
                        <Accordion open={rOpen}>
                          <div className="bg-black/40">
                            {rCli.map(c => {
                              const padronOff = !isClientePadronActivo(c);
                              const isCliOn = visibleClientes.has(c.id_cliente);
                              const inactivo = isInactivo(c.fecha_ultima_compra);
                              const dotColor = padronOff ? "#374151" : !isRutaOn || !isCliOn ? "#4b5563" : inactivo ? "#6b7280" : color;
                              return (
                                <div key={c.id_cliente} className="flex items-center gap-2 pl-10 pr-2 py-1.5 hover:bg-white/5 transition-colors">
                                  <div
                                    className="flex-1 flex items-center gap-2 min-w-0"
                                    onClick={() => { if (!padronOff) toggleCliente(c.id_cliente); }}
                                  >
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                                    <span className={`text-[10px] truncate ${padronOff ? "text-white/25 line-through" : !isCliOn ? "text-white/20" : inactivo ? "text-white/40" : "text-white/80"}`}>
                                      {c.nombre_fantasia || c.nombre_razon_social}
                                    </span>
                                  </div>
                                  <EyeBtn
                                    on={isCliOn}
                                    color={inactivo ? "#6b7280" : color}
                                    className="w-4 h-4"
                                    disabled={padronOff}
                                    title={padronOff ? "Dado de baja en padrón" : undefined}
                                    onClick={() => toggleCliente(c.id_cliente)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </Accordion>
                      </div>
                    );
                  })}
                </div>
              </Accordion>
            </div>
          );
        })}
      </div>
    </div>
  );

  const handleToggleRouteBuild = () => {
    toggleRouteBuild();
    if (routeBuildEnabled) {
      clearRouteBuildState();
    } else {
      toast.info('Dibujá un polígono en el mapa para seleccionar PDVs');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={fullscreen ? "flex flex-col h-full gap-0" : "flex flex-col gap-4"}>

      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-[var(--shelfy-text)]">Rutas de Venta</h2>
          {selectedSucursal && totalPdv > 0 && (
            <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
              {vendedoresFiltrados.length} vendedores · {totalPdv.toLocaleString()} PDV ·{" "}
              <span className="text-emerald-400 font-semibold">{pctActivos}% activos</span>
              <span className="mx-1 opacity-40">·</span>
              <span className="text-red-400 font-semibold">{100 - pctActivos}% inactivos</span>
            </p>
          )}
          {cuentasData?.fecha ? (
            <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
              Cuentas corrientes actualizadas el{" "}
              {new Date(cuentasData.fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}{" "}
              a las{" "}
              {new Date(cuentasData.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })}
            </p>
          ) : selectedDist ? (
            <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">Sin datos de CC recientes</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-xl px-3 py-1.5 shadow-sm">
              <Building2 className="w-4 h-4 text-amber-400" />
              {loading && sucursales.length === 0 ? (
                <div className="h-5 w-36 rounded bg-[var(--shelfy-border)] animate-pulse" />
              ) : (
                <select
                  value={selectedSucursal || ""}
                  onChange={e => {
                    setSelectedSucursal(e.target.value || null);
                    setVisibleVends(new Set());
                    setVisibleRutas(new Set());
                    setVisibleClientes(new Set());
                  }}
                  className="bg-transparent text-[var(--shelfy-text)] text-sm font-semibold focus:outline-none min-w-[140px]"
                >
                  {sucursales.length === 0
                    ? <option value="">Sin sucursales</option>
                    : <>
                        {sucursales.length > 1 && <option value="">Seleccionar Sucursal...</option>}
                        {sucursales.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </>
                  }
                </select>
              )}
            </div>
          <button
            onClick={() => refetchVendedores()}
            disabled={loading}
            title="Actualizar todo"
            className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors p-2 rounded-xl hover:bg-white/5 border border-[var(--shelfy-border)] h-[38px]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-2 border border-red-500/20">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Mobile map / lista tab switcher */}
      {!mapOnly && (
        <div className="lg:hidden flex rounded-xl overflow-hidden border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] shrink-0">
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
              mobileView === 'mapa' ? "bg-[var(--shelfy-primary)]/20 text-[var(--shelfy-primary)]" : "text-[var(--shelfy-muted)]"
            }`}
            onClick={() => setMobileView('mapa')}
          >
            <MapIcon className="w-3.5 h-3.5" />
            Mapa
          </button>
          <div className="w-px bg-[var(--shelfy-border)]" />
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
              mobileView === 'lista' ? "bg-[var(--shelfy-primary)]/20 text-[var(--shelfy-primary)]" : "text-[var(--shelfy-muted)]"
            }`}
            onClick={() => setMobileView('lista')}
          >
            <Building2 className="w-3.5 h-3.5" />
            Vendedores
          </button>
        </div>
      )}

      {/* Main split */}
      <div className={`${mapOnly ? "flex flex-col lg:grid lg:grid-cols-5 gap-3 flex-1 min-h-0" : `flex flex-col lg:grid lg:grid-cols-5 gap-3 ${fullscreen ? "flex-1 min-h-0 lg:h-auto" : "lg:h-[680px]"}`}`}>

        {/* ── MAP — responsive: tabs en mobile, siempre visible en lg+ ──── */}
        <div className={`${mapOnly ? "flex flex-1 min-h-0 lg:col-span-3" : `${mobileView === 'mapa' ? "flex min-h-[350px]" : "hidden"} lg:flex lg:col-span-3`} flex-col rounded-2xl overflow-hidden border border-[var(--shelfy-border)] relative bg-[var(--shelfy-panel)]`}>
          <MapLayerControls />
          <div className="flex-1 relative">
            {loading ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-[var(--shelfy-muted)]">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-sm">Cargando...</p>
              </div>
            ) : pines.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-[var(--shelfy-muted)]">
                <MapIcon className="w-12 h-12 opacity-15" />
                <p className="text-sm font-medium text-center px-8 leading-relaxed">
                  {!selectedSucursal
                    ? "Seleccioná una sucursal para comenzar"
                    : "Activá un vendedor, ruta o PDV para verlos en el mapa"
                  }
                </p>
              </div>
            ) : (
              <MapaRutas
                pines={pines}
                fullscreenPanel={vendorPanelContent}
                selectedPDVs={hasPermiso("action_edit_objetivos") ? selectedPDVsForObjective : []}
                onTogglePDV={hasPermiso("action_edit_objetivos") ? togglePDVForObjective : undefined}
                routeBuildEnabled={routeBuildEnabled}
                onToggleRouteBuild={hasPermiso("action_edit_objetivos") ? handleToggleRouteBuild : undefined}
                onPolygonSelectionChange={(pdvIds, geoJson) => {
                  setActivePolygon(pdvIds, geoJson);
                  // En modo polígono, la selección debe representar exactamente
                  // el polígono actual (evita mezclar con selecciones previas).
                  clearSelectedPDVs();
                  pdvIds.forEach(id => togglePDVForObjective(id));
                  if (pdvIds.length > 0) {
                    toast.success(`${pdvIds.length} PDVs seleccionados por polígono`);
                  }
                }}
              />
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL — lista vendedores/rutas ────────────────────────── */}
        <div className={`lg:col-span-2 ${!mapOnly && mobileView === 'mapa' ? "hidden" : "flex"} lg:flex flex-col rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden min-h-[400px] lg:min-h-0`}>

          {/* Panel header */}
          <div className="px-4 py-2.5 border-b border-[var(--shelfy-border)]/60 shrink-0 flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-[var(--shelfy-text)]">
              {selectedSucursal ? selectedSucursal : "Vendedores"}
            </span>
            {selectedSucursal && vendedoresFiltrados.length > 0 && (
              <span className="text-[10px] text-[var(--shelfy-muted)] ml-auto">
                {vendedoresFiltrados.length} vendedor{vendedoresFiltrados.length !== 1 ? "es" : ""}
              </span>
            )}
          </div>

          {/* Scrollable vendor list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {!selectedSucursal && !loading && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--shelfy-muted)] py-12">
                <Building2 className="w-8 h-8 opacity-20" />
                <p className="text-xs text-center px-6 leading-relaxed">
                  Seleccioná una sucursal para ver los vendedores
                </p>
              </div>
            )}
            {selectedSucursal && vendedoresFiltrados.length === 0 && !loading && (
              <p className="text-xs text-[var(--shelfy-muted)] text-center py-10">
                No hay vendedores para esta sucursal.
              </p>
            )}

            <div className="divide-y divide-[var(--shelfy-border)]/40">
              {vendedoresFiltrados.map(v => {
                const idx       = vendedores.indexOf(v);
                const color     = getVendorColor(v.id_vendedor, idx);
                const vOpen     = openVend === v.id_vendedor;
                const vRutasRaw = queryClient.getQueryData<RutaSupervision[]>(['supervision-rutas', selectedDist, v.id_vendedor]) ?? [];
                const vRutas    = [...vRutasRaw].sort(
                  (a, b) =>
                    (DIA_ORDER[a.dia_semana?.toLowerCase() ?? ""] ?? 9) -
                    (DIA_ORDER[b.dia_semana?.toLowerCase() ?? ""] ?? 9)
                );
                const isVendOn  = visibleVends.has(v.id_vendedor);
                const isVendLoad = loadingMap.has(v.id_vendedor);
                const mapS      = vendorMapEligibleStats.get(v.id_vendedor);
                const pdvTot    = USE_MAP_ELIGIBLE_STATS_FOR_KPIS && mapS?.complete ? mapS.totalMap : v.total_pdv;
                const pdvAct    = USE_MAP_ELIGIBLE_STATS_FOR_KPIS && mapS?.complete ? mapS.activosMap : (v.pdv_activos ?? 0);
                const pct       = pdvTot > 0 ? Math.round((pdvAct / pdvTot) * 100) : 0;

                return (
                  <div key={v.id_vendedor}>

                    {/* ── Vendor row ── */}
                    <div className="flex items-stretch">
                      <div
                        className="w-0.5 shrink-0 transition-colors duration-300"
                        style={{ backgroundColor: isVendOn ? color : "transparent" }}
                      />
                      <div className="flex-1 min-w-0 px-3 py-2.5">
                        {/* Avatar + name + eye */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <VendorAvatar nombre={v.nombre_vendedor} color={color} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-[var(--shelfy-text)] truncate leading-snug">
                              {v.nombre_vendedor}
                            </p>
                            <p className="text-[11px] text-[var(--shelfy-muted)]">
                              {pdvTot.toLocaleString()} PDV · {v.total_rutas} rutas
                            </p>
                            {/* Stats 7d pills */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(v.pdv_nuevos_7d ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/20">
                                  +{v.pdv_nuevos_7d} nuevos
                                </span>
                              )}
                              {(v.pdv_activados_7d ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                  {v.pdv_activados_7d} activ. 7d
                                </span>
                              )}
                              {(v.pdv_exhibidos ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/20">
                                  {v.pdv_exhibidos} exhibidos
                                </span>
                              )}
                              {(v.pdv_exhibidos_nuevos_7d ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/20">
                                  {v.pdv_exhibidos_nuevos_7d} 1ª vez
                                </span>
                              )}
                              {((v.pdv_nuevos_7d ?? 0) > 0 || (v.pdv_activados_7d ?? 0) > 0 || (v.pdv_exhibidos ?? 0) > 0 || (v.pdv_exhibidos_nuevos_7d ?? 0) > 0) && (
                                <span
                                  title={"🟠 Nuevos: PDVs dados de alta en los últimos 7 días\n🟢 Activ. 7d: PDVs con compra en los últimos 7 días\n🟣 Exhibidos: PDVs con foto de exhibición en últimos 30 días\n🔵 1ª vez: PDVs con primera exhibición en los últimos 7 días"}
                                  className="inline-flex items-center px-1 py-0.5 rounded text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors cursor-help"
                                >
                                  <HelpCircle className="w-3 h-3" />
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="color"
                              value={color}
                              onChange={(e) => setVendorColorOverride(selectedDist, v.id_vendedor, e.target.value)}
                              title="Personalizar color del vendedor"
                              className="w-6 h-6 p-0 border border-[var(--shelfy-border)] rounded bg-transparent cursor-pointer"
                            />
                            <button
                              type="button"
                              onClick={() => clearVendorColorOverride(selectedDist, v.id_vendedor)}
                              title="Restaurar color automático"
                              className="w-6 h-6 rounded border border-[var(--shelfy-border)] text-[11px] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
                            >
                              ↺
                            </button>
                          </div>
                          {/* Vendor eye: bigger, toggles everything */}
                          <button
                            onClick={() => toggleVendor(v.id_vendedor)}
                            title={isVendOn ? "Ocultar vendedor del mapa" : "Mostrar todos los PDV en mapa"}
                            className={`flex w-7 h-7 rounded-lg items-center justify-center border transition-all duration-200 shrink-0 ${
                              isVendOn
                                ? "border-transparent text-white"
                                : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:border-current"
                            }`}
                            style={isVendOn ? { backgroundColor: color, boxShadow: `0 0 8px ${color}55` } : {}}
                          >
                            {isVendLoad
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : isVendOn
                                ? <Eye className="w-3.5 h-3.5" />
                                : <EyeOff className="w-3.5 h-3.5" />
                            }
                          </button>
                        </div>
                        {/* Activity bar */}
                        {pdvTot > 0 && (
                          <div className="mb-2">
                            <div className="flex justify-between items-center mb-0.5">
                              <span className="text-[10px] text-emerald-400 font-semibold">
                                {pdvAct.toLocaleString()} activos
                              </span>
                              <span className="text-[10px] font-bold" style={{ color }}>
                                {pct}%
                              </span>
                            </div>
                            <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, backgroundColor: color }}
                              />
                            </div>
                          </div>
                        )}
                        {/* Expand rutas */}
                        <button
                          onClick={() => handleVend(v.id_vendedor)}
                          className="flex items-center gap-1 text-[11px] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
                        >
                          <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${vOpen ? "rotate-90" : ""}`} />
                          {vOpen ? "Ocultar rutas" : "Ver rutas"}
                          {loadingMap.has(v.id_vendedor) && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                        </button>
                      </div>
                    </div>

                    {/* ── Rutas accordion ── */}
                    <Accordion open={vOpen}>
                      <div className="bg-[var(--shelfy-bg)]/50 divide-y divide-[var(--shelfy-border)]/30">
                        {vRutas.length === 0 && loadingMap.has(v.id_vendedor) && (
                          <div className="flex items-center gap-2 py-2 px-5 text-[11px] text-[var(--shelfy-muted)]">
                            <Loader2 className="w-3 h-3 animate-spin" /> Cargando rutas...
                          </div>
                        )}
                        {vRutas.length === 0 && !loadingMap.has(v.id_vendedor) && vOpen && (
                          <p className="text-[11px] text-[var(--shelfy-muted)] px-5 py-2 italic">
                            Sin rutas asignadas.
                          </p>
                        )}

                        {vRutas.map(r => {
                          const rOpen    = openRuta === r.id_ruta;
                          const rCli     = queryClient.getQueryData<ClienteSupervision[]>(['supervision-clientes', selectedDist, r.id_ruta]) ?? [];
                          const isRutaOn = visibleRutas.has(r.id_ruta);
                          // count how many clients in this route are visible
                          const cliVisible = rCli.filter(c => visibleClientes.has(c.id_cliente)).length;

                          return (
                            <div key={r.id_ruta}>
                              {/* Route row */}
                              <div className="flex items-center gap-2 px-5 py-2 hover:bg-white/5 transition-colors">
                                {/* Expand button */}
                                <button
                                  onClick={() => handleRuta(r.id_ruta)}
                                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                >
                                  <ChevronRight
                                    className={`w-3 h-3 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-200 ${rOpen ? "rotate-90" : ""}`}
                                  />
                                  <RouteIcon
                                    className="w-3 h-3 shrink-0"
                                    style={{ color: isRutaOn ? color : color + "66" }}
                                  />
                                  <span className="text-[11px] font-semibold text-[var(--shelfy-text)] flex-1 truncate">
                                    Ruta {r.nombre_ruta}
                                  </span>
                                </button>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <DiaBadge dia={r.dia_semana} />
                                  <span className="text-[10px] text-[var(--shelfy-muted)]">
                                    {isRutaOn && rCli.length > 0
                                      ? <span style={{ color }}>{cliVisible}</span>
                                      : r.total_pdv
                                    }
                                  </span>
                                  {loadingMap.has(v.id_vendedor) && !visibleRutas.has(r.id_ruta) && (
                                    <Loader2 className="w-3 h-3 animate-spin text-[var(--shelfy-muted)]" />
                                  )}
                                  {/* Route eye toggle */}
                                  <EyeBtn
                                    on={isRutaOn}
                                    color={color}
                                    loading={loadingMap.has(v.id_vendedor) && !isRutaOn}
                                    onClick={() => toggleRuta(r.id_ruta, v.id_vendedor)}
                                    title={isRutaOn ? "Ocultar ruta del mapa" : "Mostrar ruta en mapa"}
                                  />
                                </div>
                              </div>

                              {/* ── Clientes accordion ── */}
                              <Accordion open={rOpen}>
                                <div className="bg-[var(--shelfy-bg)]/60 divide-y divide-[var(--shelfy-border)]/20">
                                  {rCli.length === 0 && loadingMap.has(v.id_vendedor) && (
                                    <div className="flex items-center gap-2 py-2 px-8 text-[11px] text-[var(--shelfy-muted)]">
                                      <Loader2 className="w-3 h-3 animate-spin" /> Cargando clientes...
                                    </div>
                                  )}

                                  {rCli.map(c => {
                                    const padronOff  = !isClientePadronActivo(c);
                                    const cOpen      = openCliente === c.id_cliente;
                                    const inactivo   = isInactivo(c.fecha_ultima_compra);
                                    const fechaAlta  = fmt(c.fecha_alta);
                                    const ultimaComp = fmt(c.fecha_ultima_compra);
                                    const isCliOn    = visibleClientes.has(c.id_cliente);
                                    const mapUrl     = c.latitud && c.longitud
                                      ? `https://www.google.com/maps/search/?api=1&query=${c.latitud},${c.longitud}`
                                      : null;
                                    const dotColor   = padronOff
                                      ? "#4b5563"
                                      : !isRutaOn || !isCliOn
                                        ? "#4b5563"
                                        : inactivo ? "#6b7280" : color;

                                    return (
                                      <div key={c.id_cliente}>
                                        <div className="flex items-center gap-2 pl-8 pr-2 py-1.5 hover:bg-white/5 transition-colors">
                                          {/* Detail toggle */}
                                          <button
                                            onClick={() => handleCliente(c.id_cliente)}
                                            className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                          >
                                            <ChevronRight
                                              className={`w-3 h-3 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-200 ${cOpen ? "rotate-90" : ""}`}
                                            />
                                            {/* Dot = PDV map toggle */}
                                            <span
                                              className={`w-2 h-2 rounded-full shrink-0 transition-all ${padronOff ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                                              style={{ backgroundColor: dotColor, boxShadow: isCliOn && isRutaOn && !inactivo && !padronOff ? `0 0 4px ${color}88` : "none" }}
                                              onClick={e => {
                                                e.stopPropagation();
                                                if (!padronOff) toggleCliente(c.id_cliente);
                                              }}
                                              title={padronOff ? "Dado de baja en padrón" : isCliOn ? "Ocultar PDV del mapa" : "Mostrar PDV en mapa"}
                                            />
                                            <span className={`text-[11px] flex-1 truncate ${padronOff ? "line-through opacity-50" : !isCliOn || !isRutaOn ? "opacity-50" : inactivo ? "text-[var(--shelfy-muted)]" : "text-[var(--shelfy-text)]"}`}>
                                              <span className="font-mono text-[9px] bg-white/10 px-1 rounded mr-1 opacity-70">
                                                {c.id_cliente_erp}
                                              </span>
                                              {c.nombre_fantasia || c.nombre_razon_social || "Sin nombre"}
                                            </span>
                                          </button>
                                          {/* PDV eye mini toggle */}
                                          <EyeBtn
                                            on={isCliOn}
                                            color={inactivo ? "#6b7280" : color}
                                            onClick={() => toggleCliente(c.id_cliente)}
                                            disabled={padronOff}
                                            title={padronOff ? "Dado de baja en padrón" : isCliOn ? "Ocultar PDV del mapa" : "Mostrar PDV en mapa"}
                                          />
                                        </div>

                                        {/* Detail card */}
                                        <Accordion open={cOpen}>
                                          <div className="mx-3 mb-1.5 rounded-lg border border-[var(--shelfy-border)]/50 bg-[var(--shelfy-panel)] px-3 py-2 space-y-1.5">
                                            <div className="flex items-center justify-between gap-2 border-b border-[var(--shelfy-border)]/30 pb-1.5">
                                              <span className="text-[10px] font-bold text-[var(--shelfy-muted)] uppercase tracking-tight">Código ERP</span>
                                              <span className="text-[11px] font-mono font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">{c.id_cliente_erp}</span>
                                            </div>

                                            {c.domicilio && (
                                              <div className="flex items-start gap-1.5">
                                                <MapPin className="w-3 h-3 text-[var(--shelfy-muted)] mt-0.5 shrink-0" />
                                                <span className="text-[11px] text-[var(--shelfy-text)] flex-1 leading-snug">
                                                  {c.domicilio}{c.localidad ? `, ${c.localidad}` : ""}{c.provincia ? ` (${c.provincia})` : ""}
                                                </span>
                                                {mapUrl && (
                                                  <a
                                                    href={mapUrl} target="_blank" rel="noopener noreferrer"
                                                    onClick={e => e.stopPropagation()}
                                                    className="text-[10px] text-[var(--shelfy-primary)] hover:underline shrink-0"
                                                  >
                                                    mapa ↗
                                                  </a>
                                                )}
                                              </div>
                                            )}
                                            <div className="flex flex-col gap-1">
                                              <div className="flex items-center gap-1">
                                                <ShoppingCart className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
                                                <span className={`text-[11px] font-semibold ${inactivo ? "text-red-400" : "text-emerald-400"}`}>
                                                  {ultimaComp
                                                    ? <>Últ. compra: {ultimaComp} <span className="font-normal opacity-70">({diasDesde(c.fecha_ultima_compra)})</span></>
                                                    : "Sin compras"}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
                                                <span className="text-[11px] text-[var(--shelfy-text)]">
                                                  {c.fecha_ultima_exhibicion
                                                    ? <>Últ. exhibición: <span className="font-semibold">{fmt(c.fecha_ultima_exhibicion?.split("T")[0])}</span> <span className="opacity-60">({diasDesde(c.fecha_ultima_exhibicion)})</span></>
                                                    : <span className="opacity-40 italic text-[10px]">Sin exhibiciones registradas</span>
                                                  }
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3 text-[var(--shelfy-muted)] shrink-0" />
                                                <span className="text-[11px] text-[var(--shelfy-text)]">
                                                  Alta:{" "}
                                                  {fechaAlta
                                                    ? <span className="font-semibold">{fechaAlta}</span>
                                                    : <span className="italic opacity-40 text-[10px]">re-subir padrón*</span>
                                                  }
                                                </span>
                                              </div>
                                            </div>
                                            {c.canal && (
                                              <span
                                                className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border"
                                                style={{ backgroundColor: color + "15", color, borderColor: color + "30" }}
                                              >
                                                {c.canal}
                                              </span>
                                            )}
                                          </div>
                                        </Accordion>
                                      </div>
                                    );
                                  })}
                                </div>
                              </Accordion>

                            </div>
                          );
                        })}
                      </div>
                    </Accordion>

                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* ── MOBILE CC — debajo de rutas en mobile (xl:hidden) ──────────── */}
        {!mapOnly && <div className="xl:hidden flex flex-col rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-y-auto min-h-[300px]">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--shelfy-border)]/50 shrink-0">
            <CreditCard className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-[var(--shelfy-text)]">Cuentas</span>
            {cuentasFiltradas?.fecha && (
              <span className="text-[10px] text-[var(--shelfy-muted)] truncate">· {fmt(cuentasFiltradas.fecha)}</span>
            )}
            {loadingCuentas && <Loader2 className="w-3 h-3 animate-spin text-[var(--shelfy-muted)] ml-auto" />}
          </div>
          {cuentasFiltradas?.metadatos && (
            <div className="grid grid-cols-2 divide-x divide-[var(--shelfy-border)]/40 border-b border-[var(--shelfy-border)]/30 shrink-0">
              <div className="px-3 py-2">
                <p className="text-[9px] text-[var(--shelfy-muted)] uppercase tracking-wide">Deuda</p>
                <p className="text-sm font-bold text-amber-400">${(cuentasFiltradas.metadatos.total_deuda??0).toLocaleString("es-AR",{maximumFractionDigits:0})}</p>
              </div>
              <div className="px-3 py-2">
                <p className="text-[9px] text-[var(--shelfy-muted)] uppercase tracking-wide">Prom. días</p>
                <p className="text-sm font-bold text-[var(--shelfy-text)]">{Math.round(cuentasFiltradas.metadatos.promedio_dias_retraso??0)}d</p>
              </div>
            </div>
          )}
          {!selectedSucursal && !loadingCuentas && (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-xs text-[var(--shelfy-muted)] text-center">Seleccioná una sucursal</p>
            </div>
          )}
          {cuentasFiltradas && cuentasFiltradas.vendedores.length === 0 && !loadingCuentas && (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-xs text-[var(--shelfy-muted)] text-center">Sin deudas registradas</p>
            </div>
          )}
          {cuentasFiltradas && cuentasFiltradas.vendedores.length > 0 && (
            <div className="divide-y divide-[var(--shelfy-border)]/30 overflow-y-auto">
              {cuentasFiltradas.vendedores.map((v: any, idx: number) => {
                const color = defaultVendorColor(idx);
                const isOpen = openCuentasVend === v.vendedor;
                return (
                  <div key={v.vendedor}>
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                      onClick={() => setOpenCuentasVend(isOpen ? null : v.vendedor)}
                    >
                      <VendorAvatar nombre={v.vendedor} color={color} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--shelfy-text)] truncate">{v.vendedor}</p>
                        <p className="text-xs font-bold text-amber-400">${v.deuda_total.toLocaleString("es-AR",{maximumFractionDigits:0})}</p>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                    <Accordion open={isOpen}>
                      <div className="px-2 pb-2 overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead><tr className="bg-[var(--shelfy-bg)] text-[var(--shelfy-muted)] uppercase text-[9px]">
                            <th className="text-left px-2 py-1.5 font-semibold">Cliente</th>
                            <th className="text-center px-2 py-1.5 font-semibold">Días</th>
                            <th className="text-right px-2 py-1.5 font-semibold">Deuda</th>
                          </tr></thead>
                          <tbody className="divide-y divide-[var(--shelfy-border)]/20">
                            {v.clientes.map((c: any, ci: number) => {
                              const dias = c.antiguedad ?? 0;
                              const diasColor = dias > 30 ? "text-rose-400 font-bold" : dias > 21 ? "text-orange-400" : dias > 15 ? "text-amber-400" : "text-[var(--shelfy-text)]";
                              return (
                                <tr key={ci} className="hover:bg-white/5 text-[var(--shelfy-text)]">
                                  <td className="px-2 py-1.5 max-w-[90px] truncate" title={c.cliente ?? undefined}>{c.cliente ?? "-"}</td>
                                  <td className={`px-2 py-1.5 text-center tabular-nums ${diasColor}`}>{c.antiguedad ?? "-"}</td>
                                  <td className="px-2 py-1.5 text-right font-semibold text-amber-400 tabular-nums">${c.deuda_total.toLocaleString("es-AR",{maximumFractionDigits:0})}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Accordion>
                  </div>
                );
              })}
            </div>
          )}
        </div>}

      </div>

      {/* ── SECCIÓN CUENTAS CORRIENTES — solo desktop (xl+) ─────────────────── */}
      {!mapOnly && <div className="hidden xl:grid xl:grid-cols-2 gap-4">

        {/* Columna izquierda: CC */}
        <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden shadow-sm">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--shelfy-border)]/50">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-[var(--shelfy-text)]">Cuentas Corrientes</h3>
            {cuentasFiltradas?.fecha && (
              <span className="text-[11px] text-[var(--shelfy-muted)]">· Al {fmt(cuentasFiltradas.fecha)}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {cuentasFiltradas && cuentasFiltradas.vendedores.length > 0 && (
              <>
                <button
                  onClick={() => cuentasFiltradas && openCuentasCorrientesPrintWindow(cuentasFiltradas)}
                  title="Hoja A4 para imprimir y entregar al vendedor"
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:border-amber-500/40 transition-colors"
                >
                  <Printer className="w-3 h-3" />
                  Hoja vendedor
                </button>
                <button
                  onClick={() => {
                    const rows = [["Vendedor","Cliente","Sucursal","Rango","Antigüedad (días)","Comprobantes","Últ. Compra","Deuda"]];
                    cuentasFiltradas.vendedores.forEach((v: any) => v.clientes.forEach((c: any) =>
                      rows.push([v.vendedor, c.cliente??'', c.sucursal??'', c.rango_antiguedad??'', String(c.antiguedad??''), String(c.cantidad_comprobantes??''), c.fecha_ultima_compra ? new Date(c.fecha_ultima_compra).toLocaleDateString("es-AR") : '', String(c.deuda_total)])
                    ));
                    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));
                    a.download = `cuentas_${cuentasFiltradas.fecha??'sin_fecha'}.csv`;
                    a.click();
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] transition-colors"
                >
                  ↓ CSV
                </button>
              </>
            )}
            {isSuperadmin && selectedDist > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCCDialogOpen(true)}
                className="flex items-center gap-1.5 text-xs h-7 px-2.5"
              >
                <RefreshCw className="w-3 h-3" />
                Actualizar CC
              </Button>
            )}
            {loadingCuentas && <Loader2 className="w-4 h-4 animate-spin text-[var(--shelfy-muted)]" />}
          </div>
        </div>

        {/* Sin distribuidor seleccionado */}
        {!selectedDist ? (
          <div className="py-12 flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
              <CreditCard className="w-6 h-6 text-amber-500/50" />
            </div>
            <p className="text-sm text-[var(--shelfy-muted)] max-w-[240px]">
              Seleccioná un distribuidor para ver las cuentas corrientes.
            </p>
          </div>
        ) : (
          <>
            {/* KPIs strip */}
            {cuentasFiltradas?.metadatos && (
              <div className="grid grid-cols-4 divide-x divide-[var(--shelfy-border)]/40 border-b border-[var(--shelfy-border)]/30">
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Deuda Total</p>
                  <p className="text-base font-bold text-amber-400">${(cuentasFiltradas.metadatos.total_deuda??0).toLocaleString("es-AR",{maximumFractionDigits:0})}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Clientes Deudores</p>
                  <p className="text-base font-bold text-[var(--shelfy-text)]">{(cuentasFiltradas.metadatos.clientes_deudores??0).toLocaleString()}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Vendedores</p>
                  <p className="text-base font-bold text-[var(--shelfy-text)]">{cuentasFiltradas.vendedores.length}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Prom. Días Atraso</p>
                  <p className="text-base font-bold text-[var(--shelfy-text)]">{Math.round(cuentasFiltradas.metadatos.promedio_dias_retraso??0)} días</p>
                </div>
              </div>
            )}

            {/* Sin sucursal seleccionada */}
            {!selectedSucursal && !loadingCuentas && (
              <div className="py-10 flex flex-col items-center justify-center text-center px-6">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                  <Building2 className="w-5 h-5 text-amber-500/50" />
                </div>
                <p className="text-sm text-[var(--shelfy-muted)]">Seleccioná una sucursal para ver las cuentas corrientes.</p>
              </div>
            )}

            {/* Loading */}
            {loadingCuentas && !cuentasFiltradas && (
              <div className="flex items-center gap-2 justify-center py-10 text-[var(--shelfy-muted)]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Cargando cuentas corrientes...</span>
              </div>
            )}

            {/* Sin datos */}
            {cuentasFiltradas && cuentasFiltradas.vendedores.length === 0 && !loadingCuentas && (
              <div className="py-10 flex flex-col items-center justify-center text-center px-6">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                  <CreditCard className="w-5 h-5 text-emerald-500/50" />
                </div>
                <p className="text-sm text-[var(--shelfy-muted)]">Sin deudas registradas para este distribuidor.</p>
              </div>
            )}


            {/* Tarjetas de vendedores */}
            {cuentasFiltradas && cuentasFiltradas.vendedores.length > 0 && (
              <div className="divide-y divide-[var(--shelfy-border)]/30">
                {cuentasFiltradas.vendedores.map((v: any, idx: number) => {
                  const color = defaultVendorColor(idx);
                  const isOpen = openCuentasVend === v.vendedor;

                  // Distribución por rango para mostrar en el header de la tarjeta
                  const rangeDist: Record<string, number> = {};
                  v.clientes.forEach((c: any) => {
                    const r = c.rango_antiguedad ?? "Sin datos";
                    rangeDist[r] = (rangeDist[r] ?? 0) + 1;
                  });

                  return (
                    <div key={v.vendedor}>
                      {/* Cabecera clickeable */}
                      <button
                        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors text-left"
                        onClick={() => setOpenCuentasVend(isOpen ? null : v.vendedor)}
                      >
                        <VendorAvatar nombre={v.vendedor} color={color} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--shelfy-text)] truncate">{v.vendedor}</p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-xs font-bold text-amber-400">
                              ${v.deuda_total.toLocaleString("es-AR",{maximumFractionDigits:0})}
                            </span>
                            <span className="text-[11px] text-[var(--shelfy-muted)]">
                              {v.cantidad_clientes} {v.cantidad_clientes === 1 ? "cliente" : "clientes"}
                            </span>
                            {/* Chips de rango compactos */}
                            {Object.entries(rangeDist).map(([r, count]) => (
                              <span key={r} className={`text-[10px] px-1.5 py-0.5 rounded border ${RANGO_COLORS[r] ?? "bg-white/5 text-[var(--shelfy-muted)] border-[var(--shelfy-border)]"}`}>
                                {r.replace(" Días","d").replace("+30","30+")}·{count}
                              </span>
                            ))}
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-[var(--shelfy-muted)] transition-transform duration-200 shrink-0 ${isOpen ? "rotate-90" : ""}`} />
                      </button>

                      {/* Contenido expandido */}
                      <Accordion open={isOpen}>
                        <div className="px-5 pb-4">
                          <div className="rounded-xl border border-[var(--shelfy-border)]/50 overflow-auto">
                            <table className="w-full text-[11px]">
                              <thead className="sticky top-0 z-10">
                                <tr className="bg-[var(--shelfy-bg)] text-[var(--shelfy-muted)] uppercase tracking-wide text-[10px]">
                                  <th className="text-left px-3 py-2.5 font-semibold">Cliente</th>
                                  <th className="text-left px-3 py-2.5 font-semibold">Sucursal</th>
                                  <th className="text-center px-3 py-2.5 font-semibold">Rango</th>
                                  <th className="text-center px-3 py-2.5 font-semibold cursor-pointer select-none hover:text-[var(--shelfy-text)] transition-colors"
                                    onClick={() => setCcSort(s => s.col === "dias" ? { col: "dias", asc: !s.asc } : { col: "dias", asc: false })}>
                                    Días {ccSort.col === "dias" ? (ccSort.asc ? "↑" : "↓") : <span className="opacity-30">↕</span>}
                                  </th>
                                  <th className="text-center px-3 py-2.5 font-semibold">Comprob.</th>
                                  <th className="text-right px-3 py-2.5 font-semibold cursor-pointer select-none hover:text-[var(--shelfy-text)] transition-colors"
                                    onClick={() => setCcSort(s => s.col === "deuda" ? { col: "deuda", asc: !s.asc } : { col: "deuda", asc: false })}>
                                    Deuda {ccSort.col === "deuda" ? (ccSort.asc ? "↑" : "↓") : <span className="opacity-30">↕</span>}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--shelfy-border)]/20">
                                {[...v.clientes].sort((a: any, b: any) => {
                                  const val = ccSort.col === "dias"
                                    ? (a.antiguedad ?? 0) - (b.antiguedad ?? 0)
                                    : (a.deuda_total ?? 0) - (b.deuda_total ?? 0);
                                  return ccSort.asc ? val : -val;
                                }).map((c: any, ci: number) => {
                                  const dias = c.antiguedad ?? 0;
                                  const diasColor = dias > 30
                                    ? "text-rose-400 font-bold"
                                    : dias > 21
                                      ? "text-orange-400 font-semibold"
                                      : dias > 15
                                        ? "text-amber-400"
                                        : "text-[var(--shelfy-text)]";
                                  return (
                                    <tr key={ci} className="hover:bg-white/5 text-[var(--shelfy-text)] cursor-pointer" onClick={() => c.cliente && handleClienteClick(c.cliente, c.id_cliente_erp)}>
                                      <td className="px-3 py-2 max-w-[200px] truncate group" title={c.cliente ?? undefined}>
                                        <span className="group-hover:text-[var(--shelfy-primary)] transition-colors">{c.cliente ?? "-"}</span>
                                        <span className="ml-1 text-[9px] text-[var(--shelfy-muted)] opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                                      </td>
                                      <td className="px-3 py-2 text-[var(--shelfy-muted)]">{c.sucursal ?? "-"}</td>
                                      <td className="px-3 py-2 text-center">
                                        {c.rango_antiguedad ? (
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${RANGO_COLORS[c.rango_antiguedad] ?? "bg-white/5 text-[var(--shelfy-muted)] border-[var(--shelfy-border)]"}`}>
                                            {c.rango_antiguedad}
                                          </span>
                                        ) : "-"}
                                      </td>
                                      <td className={`px-3 py-2 text-center tabular-nums ${diasColor}`}>
                                        {c.antiguedad ?? "-"}
                                      </td>
                                      <td className="px-3 py-2 text-center text-[var(--shelfy-muted)]">
                                        {c.cantidad_comprobantes ?? "-"}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-amber-400 tabular-nums">
                                        ${c.deuda_total.toLocaleString("es-AR",{maximumFractionDigits:0})}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="border-t-2 border-[var(--shelfy-border)]/40 bg-white/3">
                                  <td colSpan={5} className="px-3 py-2 text-right text-[11px] font-bold text-[var(--shelfy-muted)] uppercase tracking-wide">
                                    Total
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-amber-400 tabular-nums">
                                    ${v.deuda_total.toLocaleString("es-AR",{maximumFractionDigits:0})}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      </Accordion>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        </div>{/* fin columna CC */}

        {/* Columna derecha: Altas y Activaciones */}
        <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden shadow-sm flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--shelfy-border)]/50">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-[var(--shelfy-text)]">Altas y Activaciones</h3>
            </div>
            <select
              value={altasMes}
              onChange={e => setAltasMes(e.target.value)}
              className="text-xs bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-2 py-1 text-[var(--shelfy-text)] focus:outline-none"
            >
              {mesOptions.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {!openVend ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center px-6">
              <Target className="w-8 h-8 text-[var(--shelfy-muted)]/30 mb-2" />
              <p className="text-sm text-[var(--shelfy-muted)]">Seleccioná un vendedor para ver altas y activaciones</p>
            </div>
          ) : loadingAltas ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--shelfy-muted)]" />
            </div>
          ) : !altasData?.items.length ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center px-6">
              <p className="text-sm text-[var(--shelfy-muted)]">Sin altas ni activaciones en {altasMes}</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* KPI strip */}
              <div className="grid grid-cols-2 divide-x divide-[var(--shelfy-border)]/40 border-b border-[var(--shelfy-border)]/30">
                <div className="px-4 py-2.5">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Altas</p>
                  <p className="text-base font-bold text-emerald-400">{altasData.total_altas}</p>
                </div>
                <div className="px-4 py-2.5">
                  <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mb-0.5">Activaciones</p>
                  <p className="text-base font-bold text-blue-400">{altasData.total_activaciones}</p>
                </div>
              </div>
              {/* Items */}
              <div className="divide-y divide-[var(--shelfy-border)]/30">
                {altasData.items.map((item: PdvsMovimientoItem, i: number) => (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-3 hover:bg-white/5 transition-colors">
                    <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      item.categoria === 'alta'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                    }`}>
                      {item.categoria === 'alta' ? 'Alta' : 'Activ.'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--shelfy-text)] truncate">{item.nombre || '—'}</p>
                      <p className="text-[10px] text-[var(--shelfy-muted)] truncate">{item.id_cliente_erp ?? 'Sin código ERP'} · {item.localidad || item.direccion || '—'}</p>
                    </div>
                    {item.exhibido && (
                      <span title="Exhibido este mes" className="text-[10px] text-violet-400 font-bold shrink-0">★</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>{/* fin columna Altas */}

      </div>}

      {/* ── SECCIÓN EXHIBICIONES ────────────────────────────────────────────── */}
      {!mapOnly && <div className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--shelfy-border)]/50 flex-wrap">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-bold text-[var(--shelfy-text)]">Exhibiciones</h3>
            <span className="text-[11px] text-[var(--shelfy-muted)]">· {exhibicionesFiltradas.length} registros</span>
          </div>
          <div className="flex items-center gap-2">
            {loadingExhib && <Loader2 className="w-4 h-4 animate-spin text-[var(--shelfy-muted)]" />}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--shelfy-border)]/30 flex-wrap">
          {[
            { id: "hoy", label: "Hoy" },
            { id: "7d", label: "7 días" },
            { id: "historico", label: "Histórico" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setExhibPeriodo(opt.id as "hoy" | "7d" | "historico")}
              className={`text-xs px-3 py-1 rounded-lg border transition-all ${
                exhibPeriodo === opt.id
                  ? "bg-violet-500/20 border-violet-500/40 text-violet-400 font-semibold"
                  : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="w-px h-5 bg-[var(--shelfy-border)] mx-1" />
          {["Todos", "Pendiente", "Aprobado", "Rechazado", "Destacado"].map(st => (
            <button
              key={st}
              onClick={() => setExhibFilter(st)}
              className={`text-xs px-3 py-1 rounded-lg border transition-all ${
                exhibFilter === st
                  ? st === "Pendiente" ? "bg-amber-500/20 border-amber-500/40 text-amber-400 font-semibold"
                  : st === "Aprobado" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 font-semibold"
                  : st === "Rechazado" ? "bg-red-500/20 border-red-500/40 text-red-400 font-semibold"
                  : st === "Destacado" ? "bg-violet-500/20 border-violet-500/40 text-violet-400 font-semibold"
                  : "bg-white/10 border-white/20 text-[var(--shelfy-text)] font-semibold"
                  : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
              }`}
            >
              {st}
            </button>
          ))}
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--shelfy-muted)]" />
            <input
              type="text"
              placeholder="Buscar cliente o vendedor..."
              value={exhibSearch}
              onChange={e => setExhibSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] text-[var(--shelfy-text)] text-xs focus:outline-none focus:ring-1 focus:ring-violet-500/50 w-48"
            />
          </div>
        </div>

        {/* Grid */}
        {exhibicionesFiltradas.length === 0 && !loadingExhib ? (
          <div className="py-12 flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center mb-3">
              <ImageIcon className="w-6 h-6 text-violet-500/50" />
            </div>
            <p className="text-sm text-[var(--shelfy-muted)] max-w-[240px]">
              {loadingExhib ? "Cargando..." : exhibiciones.length === 0 ? "Sin exhibiciones hoy" : "Sin resultados para el filtro"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 max-h-[600px] overflow-y-auto">
            {exhibicionesFiltradas.map((ex: any) => {
              const imgUrl = resolveImageUrl(ex.link_foto, ex.id_exhibicion);
              const estadoNorm = normalizeExhibEstado(ex.estado);
              const badgeCls =
                estadoNorm === "pendiente"
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
                  : estadoNorm === "aprobada"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                    : estadoNorm === "rechazada"
                      ? "bg-red-500/15 text-red-400 border-red-500/25"
                      : estadoNorm === "destacada"
                        ? "bg-violet-500/15 text-violet-400 border-violet-500/25"
                        : "bg-slate-500/15 text-slate-400 border-slate-500/25";
              const fecha = ex.fecha_carga ? new Date(ex.fecha_carga) : null;
              return (
                <div key={ex.id_exhibicion} className="rounded-xl border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] overflow-hidden hover:border-violet-500/30 transition-colors group">
                  {/* Thumbnail */}
                  <div className="relative w-full h-36 bg-black/20 overflow-hidden">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt="Exhibición"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--shelfy-muted)]">
                        <ImageIcon className="w-8 h-8 opacity-30" />
                      </div>
                    )}
                    <span className={`absolute top-2 right-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${badgeCls}`}>
                      {ex.estado}
                    </span>
                  </div>
                  {/* Info */}
                  <div className="px-3 py-2.5 space-y-1">
                    <p className="text-xs font-bold text-[var(--shelfy-text)] truncate">{ex.vendedor ?? "Sin nombre"}</p>
                    <p className="text-[11px] text-[var(--shelfy-muted)] truncate">{ex.cliente || ex.tipo_pdv || "—"}</p>
                    {fecha && (
                      <p className="text-[10px] text-[var(--shelfy-muted)]">
                        {fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {/* Cliente Contacto Popup */}
      {clientePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setClientePopup(null)}
        >
          <div
            className="bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--shelfy-border)]/60">
              <div>
                <p className="text-sm font-bold text-[var(--shelfy-text)] truncate max-w-[220px]">{clientePopup.nombre}</p>
                <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide mt-0.5">Datos de contacto</p>
              </div>
              <button onClick={() => setClientePopup(null)} className="text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] p-1 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4">
              {clientePopup.loading && (
                <div className="flex items-center justify-center gap-2 py-6 text-[var(--shelfy-muted)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Buscando...</span>
                </div>
              )}
              {!clientePopup.loading && clientePopup.data && clientePopup.data.length === 0 && (
                <p className="text-sm text-[var(--shelfy-muted)] text-center py-6 italic">Sin datos de contacto registrados</p>
              )}
              {!clientePopup.loading && clientePopup.data && clientePopup.data.length > 0 && (() => {
                const c = clientePopup.data![0];
                const mapsUrl = c.latitud && c.longitud
                  ? `https://www.google.com/maps/search/?api=1&query=${c.latitud},${c.longitud}`
                  : null;
                return (
                  <div className="space-y-3">
                    {(c.nombre_fantasia || c.nombre_razon_social) && (
                      <div>
                        <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide">Razón social</p>
                        <p className="text-sm text-[var(--shelfy-text)] font-medium">
                          {c.nombre_razon_social || c.nombre_fantasia}
                        </p>
                      </div>
                    )}
                    {c.id_cliente_erp && (
                      <div>
                        <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide">N° Cliente ERP</p>
                        <p className="text-sm text-[var(--shelfy-text)] font-mono">{c.id_cliente_erp}</p>
                      </div>
                    )}
                    {(c.domicilio || c.localidad || c.provincia) && (
                      <div>
                        <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide">Dirección</p>
                        <p className="text-sm text-[var(--shelfy-text)]">
                          {[c.domicilio, c.localidad, c.provincia].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    )}
                    {c.canal && (
                      <div>
                        <p className="text-[10px] text-[var(--shelfy-muted)] uppercase tracking-wide">Canal</p>
                        <p className="text-sm text-[var(--shelfy-text)]">{c.canal}</p>
                      </div>
                    )}
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors mt-1"
                      >
                        <MapPin size={14} />
                        Ver en Google Maps
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Floating Objetivos Menu ("Shopping Cart") ────────────────────── */}
      {selectedPDVsForObjective.length > 0 && hasPermiso("action_edit_objetivos") && (
        <div className="fixed bottom-6 right-6 z-[10050] flex flex-col items-end gap-3">
          {objMenuOpen && (
            <div className="w-96 rounded-2xl border border-white/10 bg-white/90 dark:bg-[#1a1a2e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] overflow-hidden"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.22), 0 0 0 0.5px rgba(255,255,255,0.12)' }}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/8 dark:border-white/10 bg-gradient-to-r from-[var(--shelfy-accent)]/10 to-violet-500/5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[var(--shelfy-accent)]/15 flex items-center justify-center">
                    <Target className="w-3.5 h-3.5 text-[var(--shelfy-accent)]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--shelfy-text)] leading-none">Nuevo Objetivo</p>
                    <p className="text-[10px] text-[var(--shelfy-muted)] mt-0.5">{selectedPDVsForObjective.length} PDV{selectedPDVsForObjective.length !== 1 ? 's' : ''} seleccionado{selectedPDVsForObjective.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <button onClick={() => setObjMenuOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-lg text-[var(--shelfy-muted)] hover:bg-black/8 dark:hover:bg-white/10 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Selected PDVs chips */}
              <div className="px-4 pt-3 pb-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--shelfy-muted)] mb-2">PDVs</p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {selectedPDVsForObjective.map(id => {
                    const pin = pines.find(p => p.id === id);
                    if (!pin) return null;
                    return (
                      <span key={id}
                        className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 text-[var(--shelfy-text)]"
                        style={{ borderLeftColor: pin.color, borderLeftWidth: 2 }}>
                        {pin.nombre.length > 18 ? pin.nombre.slice(0, 18) + '…' : pin.nombre}
                        {objTipo === "cobranza" && pin.deuda != null && pin.deuda > 0 && (
                          <span className="text-orange-500 font-semibold ml-0.5">${(pin.deuda / 1000).toFixed(0)}K</span>
                        )}
                        <button onClick={() => togglePDVForObjective(id)} className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-500/20 text-[var(--shelfy-muted)] hover:text-red-500 transition-colors ml-0.5">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Form */}
              <div className="px-4 pb-4 space-y-3 border-t border-black/8 dark:border-white/8 pt-3 mt-1">
                {/* Tipo — pill buttons */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--shelfy-muted)] mb-2">Tipo de objetivo</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { id: 'conversion_estado', label: 'Activación', color: '#8b5cf6' },
                      { id: 'cobranza',          label: 'Cobranza',   color: '#f97316' },
                      { id: 'ruteo_alteo',       label: 'Alteo',      color: '#0ea5e9' },
                      { id: 'ruteo',             label: 'Ruteo',      color: '#22c55e' },
                      { id: 'exhibicion',        label: 'Exhibición', color: '#ec4899' },
                    ] as { id: ObjetivoTipo; label: string; color: string }[]).map(t => (
                      <button key={t.id}
                        onClick={() => setObjTipo(t.id)}
                        className={`py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                          objTipo === t.id
                            ? 'text-white border-transparent shadow-sm'
                            : 'border-black/10 dark:border-white/10 text-[var(--shelfy-muted)] bg-transparent hover:border-black/20 dark:hover:border-white/20'
                        }`}
                        style={objTipo === t.id ? { background: t.color } : {}}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Contextual section: Alteo — ruta selector */}
                {objTipo === "ruteo_alteo" && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">Ruta</label>
                      {objLoadingContext ? (
                        <div className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)]">
                          <Loader2 className="w-3 h-3 animate-spin" /> Cargando rutas...
                        </div>
                      ) : objVendedorRoutes.length === 0 ? (
                        <p className="text-xs text-[var(--shelfy-muted)]">Sin rutas encontradas</p>
                      ) : (
                        <select
                          className="w-full appearance-none bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                          value={objSelectedRutaId ?? ""}
                          onChange={e => setObjSelectedRutaId(e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">Seleccionar ruta...</option>
                          {objVendedorRoutes.map(r => (
                            <option key={r.id_ruta} value={r.id_ruta}>
                              {r.nro_ruta} · {r.dia_semana} · {r.total_pdv} PDVs
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {/* Cantidad a altear */}
                    {objSelectedRutaId && (
                      <div>
                        <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">
                          Cantidad de PDVs a altear
                        </label>
                        <input
                          type="number"
                          min={1}
                          placeholder={String(objVendedorRoutes.find(r => r.id_ruta === objSelectedRutaId)?.total_pdv ?? "N PDVs")}
                          className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                          value={objCantidadAlteo}
                          onChange={e => setObjCantidadAlteo(e.target.value ? Number(e.target.value) : "")}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Contextual section: Cobranza — top debtors list */}
                {objTipo === "cobranza" && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block">Seleccionar deudor</label>
                    {objLoadingContext ? (
                      <div className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)]">
                        <Loader2 className="w-3 h-3 animate-spin" /> Cargando...
                      </div>
                    ) : objDebtList.length === 0 ? (
                      <p className="text-xs text-[var(--shelfy-muted)]">Sin deuda registrada</p>
                    ) : (
                      <div className="max-h-28 overflow-y-auto space-y-0.5 rounded-lg border border-[var(--shelfy-border)] p-1.5 bg-[var(--shelfy-bg)]">
                        {objDebtList.map((c, i) => (
                          <button
                            key={i}
                            onClick={() => setObjSelectedDeudor(objSelectedDeudor?.cliente_nombre === c.cliente_nombre ? null : c)}
                            className={`w-full flex items-center justify-between text-xs px-2 py-1 rounded-md transition-colors ${
                              objSelectedDeudor?.cliente_nombre === c.cliente_nombre
                                ? "bg-[var(--shelfy-accent)]/20 border border-[var(--shelfy-accent)]/40"
                                : "hover:bg-white/5"
                            }`}
                          >
                            <span className="text-[var(--shelfy-text)] truncate max-w-[60%] text-left">{c.cliente_nombre}</span>
                            <span className="text-orange-400 font-medium tabular-nums">${c.deuda_total.toLocaleString("es-AR")}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Total / Parcial toggle */}
                    {objSelectedDeudor && (
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setObjCobranzaMode("total")}
                            className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${
                              objCobranzaMode === "total"
                                ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                                : "border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-white"
                            }`}
                          >
                            Total (${objSelectedDeudor.deuda_total.toLocaleString("es-AR")})
                          </button>
                          <button
                            onClick={() => setObjCobranzaMode("parcial")}
                            className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${
                              objCobranzaMode === "parcial"
                                ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                                : "border border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-white"
                            }`}
                          >
                            Parcial
                          </button>
                        </div>
                        {objCobranzaMode === "parcial" && (
                          <input
                            type="number"
                            min={1}
                            max={objSelectedDeudor.deuda_total}
                            placeholder="Monto a cobrar..."
                            className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                            value={objCobranzaMonto}
                            onChange={e => setObjCobranzaMonto(e.target.value ? Number(e.target.value) : "")}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Contextual section: Ruteo */}
                {objTipo === "ruteo" && (
                  <div className="space-y-2">
                    {objLoadingContext ? (
                      <div className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)]">
                        <Loader2 className="w-3 h-3 animate-spin" /> Cargando rutas del vendedor...
                      </div>
                    ) : objVendedorRoutes.length === 0 ? (
                      <p className="text-xs text-amber-500/90">No hay rutas cargadas para este vendedor.</p>
                    ) : (
                      <div className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] p-2 max-h-28 overflow-y-auto">
                        <p className="text-[9px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-1">Rutas asignadas al vendedor</p>
                        <ul className="text-[11px] text-[var(--shelfy-text)] space-y-0.5">
                          {objVendedorRoutes.map(r => (
                            <li key={r.id_ruta}>
                              <span className="font-mono text-[var(--shelfy-accent)]">Ruta {r.nro_ruta ?? "—"}</span>
                              {" · "}
                              <span className="capitalize">{r.dia_semana || "—"}</span>
                              {r.total_pdv != null ? <span className="text-[var(--shelfy-muted)]"> · {r.total_pdv} PDV</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block">
                      Modo de configuración
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setObjRuteoConfigMode("global")}
                        className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors border ${
                          objRuteoConfigMode === "global"
                            ? "bg-[var(--shelfy-accent)]/20 text-[var(--shelfy-accent)] border-[var(--shelfy-accent)]/40"
                            : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-white"
                        }`}
                      >
                        Global (todos los PDV)
                      </button>
                      <button
                        type="button"
                        onClick={() => setObjRuteoConfigMode("per_pdv")}
                        className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors border ${
                          objRuteoConfigMode === "per_pdv"
                            ? "bg-[var(--shelfy-accent)]/20 text-[var(--shelfy-accent)] border-[var(--shelfy-accent)]/40"
                            : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-white"
                        }`}
                      >
                        Por PDV
                      </button>
                    </div>

                    <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block">
                      Acción
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setObjRuteoAccionGlobal('cambio_ruta')}
                        className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors border ${
                          objRuteoAccionGlobal === 'cambio_ruta'
                            ? "bg-purple-500/20 text-purple-400 border-purple-500/40"
                            : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-white"
                        }`}
                      >
                        Cambio de ruta
                      </button>
                      <button
                        type="button"
                        onClick={() => setObjRuteoAccionGlobal('baja')}
                        className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors border ${
                          objRuteoAccionGlobal === 'baja'
                            ? "bg-red-500/20 text-red-400 border-red-500/40"
                            : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-white"
                        }`}
                      >
                        Baja
                      </button>
                    </div>

                    {objRuteoConfigMode === "global" && (
                      <div className="space-y-2 pt-1">
                        {objRuteoAccionGlobal === "cambio_ruta" && (
                          <div>
                            <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">Ruta destino</label>
                            <Select
                              value={objRuteoGlobalDestinoId != null ? String(objRuteoGlobalDestinoId) : ""}
                              onValueChange={v => setObjRuteoGlobalDestinoId(v ? Number(v) : null)}
                            >
                              <SelectTrigger className="h-9 w-full bg-[var(--shelfy-bg)] border-[var(--shelfy-border)] text-sm text-[var(--shelfy-text)]">
                                <SelectValue placeholder="Elegir ruta destino..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-60 z-[10060]">
                                {objVendedorRoutes.map(r => (
                                  <SelectItem key={r.id_ruta} value={String(r.id_ruta)}>
                                    Ruta {r.nro_ruta ?? "—"} · {r.dia_semana || "—"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {objRuteoAccionGlobal === "baja" && (
                          <div>
                            <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">Motivo de baja (todos los PDV)</label>
                            <input
                              type="text"
                              placeholder="Motivo..."
                              className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-red-500/60"
                              value={objRuteoGlobalMotivo}
                              onChange={e => setObjRuteoGlobalMotivo(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {objRuteoConfigMode === "per_pdv" && selectedPDVsForObjective.length > 0 && (
                      <div className="max-h-44 overflow-y-auto space-y-1.5 rounded-lg border border-[var(--shelfy-border)] p-2 bg-[var(--shelfy-bg)]">
                        {selectedPDVsForObjective.map(pdvId => {
                          const pin = pines.find(p => p.id === pdvId);
                          if (!pin) return null;
                          const item = objRuteoItemsMap[pdvId] ?? { accion: objRuteoAccionGlobal };
                          return (
                            <div key={pdvId} className="space-y-1 p-2 rounded-lg bg-white/5">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: pin.color }} />
                                <span className="text-xs text-[var(--shelfy-text)] truncate flex-1">{pin.nombre}</span>
                              </div>
                              <div className="flex gap-1">
                                {(['cambio_ruta', 'baja'] as ObjRuteoAccion[]).map(accion => (
                                  <button
                                    type="button"
                                    key={accion}
                                    onClick={() => setObjRuteoItemsMap({ ...objRuteoItemsMap, [pdvId]: { ...(objRuteoItemsMap[pdvId] ?? {}), accion } })}
                                    className={`flex-1 py-0.5 rounded text-[10px] font-medium border transition-all ${
                                      item.accion === accion
                                        ? accion === 'cambio_ruta'
                                          ? "border-purple-500/50 bg-purple-500/15 text-purple-400"
                                          : "border-red-500/50 bg-red-500/15 text-red-400"
                                        : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)]"
                                    }`}
                                  >
                                    {accion === 'cambio_ruta' ? 'Cambio' : 'Baja'}
                                  </button>
                                ))}
                              </div>
                              {item.accion === 'cambio_ruta' && (
                                <Select
                                  value={item.id_ruta_destino != null ? String(item.id_ruta_destino) : ""}
                                  onValueChange={v => setObjRuteoItemsMap({
                                    ...objRuteoItemsMap,
                                    [pdvId]: { ...(objRuteoItemsMap[pdvId] ?? { accion: objRuteoAccionGlobal }), id_ruta_destino: v ? Number(v) : undefined },
                                  })}
                                >
                                  <SelectTrigger className="h-8 w-full bg-[var(--shelfy-panel)] border-[var(--shelfy-border)] text-xs">
                                    <SelectValue placeholder="Ruta destino..." />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-52 z-[10060]">
                                    {objVendedorRoutes.map(r => (
                                      <SelectItem key={`${pdvId}-${r.id_ruta}`} value={String(r.id_ruta)}>
                                        Ruta {r.nro_ruta ?? "—"} · {r.dia_semana || "—"}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {item.accion === 'baja' && (
                                <input
                                  type="text"
                                  placeholder="Motivo de baja..."
                                  className="w-full bg-[var(--shelfy-panel)] border border-[var(--shelfy-border)] rounded px-2 py-0.5 text-xs text-[var(--shelfy-text)] focus:outline-none focus:border-red-500/60"
                                  value={item.motivo_baja ?? ""}
                                  onChange={e => setObjRuteoItemsMap({
                                    ...objRuteoItemsMap,
                                    [pdvId]: { ...(objRuteoItemsMap[pdvId] ?? { accion: objRuteoAccionGlobal }), motivo_baja: e.target.value },
                                  })}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Contextual section: Activación / Exhibición — inactive PDV count */}
                {/* (Phrase builder preview hidden per v12 plan) */}

                {/* Descripción */}
                <div>
                  <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">Descripción</label>
                  <textarea
                    rows={2}
                    placeholder="Qué debe lograr el vendedor..."
                    className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--shelfy-text)] placeholder-[var(--shelfy-muted)]/60 focus:outline-none focus:border-[var(--shelfy-accent)]/60 resize-none"
                    value={objDesc}
                    onChange={e => setObjDesc(e.target.value)}
                  />
                </div>

                {/* Fecha */}
                <div>
                  <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">Fecha límite</label>
                  <DatePicker
                    value={objFecha}
                    onChange={setObjFecha}
                    placeholder="Fecha límite"
                    contentClassName="z-[10070]"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { clearSelectedPDVs(); setObjMenuOpen(false); }}
                    className="flex-1 py-2 rounded-xl border border-black/10 dark:border-white/10 text-xs font-semibold text-[var(--shelfy-muted)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmitObjectives}
                    disabled={objSubmitting}
                    className="flex-1 py-2 rounded-xl text-white text-xs font-bold shadow-md hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, var(--shelfy-accent) 0%, #7c3aed 100%)' }}
                  >
                    {objSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Target className="w-3.5 h-3.5" />}
                    Crear objetivo · {selectedPDVsForObjective.length} PDV{selectedPDVsForObjective.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cart trigger button */}
          <button
            onClick={() => setObjMenuOpen(!objMenuOpen)}
            className="flex items-center gap-2.5 px-5 py-3 rounded-2xl text-white text-sm font-bold shadow-xl hover:opacity-90 active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg, var(--shelfy-accent) 0%, #7c3aed 100%)', boxShadow: '0 4px 20px rgba(139,92,246,0.45)' }}
          >
            <Target className="w-4 h-4" />
            <span>{selectedPDVsForObjective.length} PDV{selectedPDVsForObjective.length !== 1 ? 's' : ''}</span>
            <span className="opacity-70 text-xs font-normal">· Crear objetivo</span>
          </button>
        </div>
      )}

      {/* ── Dialog: Actualizar Cuentas Corrientes ──────────────────────────── */}
      <Dialog open={ccDialogOpen} onOpenChange={handleCCDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-400" />
              Actualizar Cuentas Corrientes
            </DialogTitle>
            <DialogDescription>
              Subí el Excel de cuentas corrientes para actualizar los datos de este distribuidor.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 pt-1">
            {/* File picker */}
            {ccUploadStatus === "idle" || ccUploadStatus === "error" ? (
              <>
                <label
                  htmlFor="cc-file-input"
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--shelfy-border)] hover:border-amber-400/50 hover:bg-amber-500/5 cursor-pointer transition-colors py-8 text-center"
                >
                  <div className="w-9 h-9 rounded-lg bg-amber-400/10 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-amber-400" />
                  </div>
                  {ccFile ? (
                    <p className="text-sm font-medium text-[var(--shelfy-text)]">{ccFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-[var(--shelfy-text)]">
                        Seleccioná el archivo Excel
                      </p>
                      <p className="text-xs text-[var(--shelfy-muted)]">Solo .xlsx</p>
                    </>
                  )}
                  <input
                    id="cc-file-input"
                    ref={ccFileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files?.[0]) setCCFile(e.target.files[0]);
                    }}
                  />
                </label>

                {ccUploadStatus === "error" && ccMessage && (
                  <p className="text-xs text-rose-400 text-center">{ccMessage}</p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => { resetCCDialog(); setCCDialogOpen(false); }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!ccFile}
                    onClick={handleCCUpload}
                  >
                    Subir y Procesar
                  </Button>
                </div>
              </>
            ) : (
              /* Upload / polling state */
              <div className="flex flex-col gap-3 py-4">
                <Progress
                  value={ccUploadStatus === "uploading" ? 60 : 80}
                  className="h-1.5"
                />
                <p className="text-sm text-[var(--shelfy-muted)] text-center">{ccMessage}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
