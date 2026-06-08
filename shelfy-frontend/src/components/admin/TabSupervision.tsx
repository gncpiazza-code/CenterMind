"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData, type QueryClient } from "@tanstack/react-query";
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
  MessageSquare,
} from "lucide-react";
import {
  fetchVendedoresSupervision,
  fetchRutasSupervision,
  fetchClientesSupervision,
  fetchSyncStatus,
  type CuentasSupervision,
  type SyncStatus,
  fetchClienteInfo,
  fetchReporteExhibiciones,
  resolveImageUrl,
  createObjetivoAsync,
  previewObjetivoTelegram,
  type VendedorSupervision,
  type RutaSupervision,
  type ClienteSupervision,
  type Distribuidora,
  type ClienteContacto,
  type ObjetivoCreate,
  type ObjetivoTipo,
  fetchVendedorKpiMapa,
  fetchSupervisionBundle,
  type SupervisionBundle,
  type VendedorCuentas,
} from "@/lib/api";
import { openCuentasCorrientesPrintWindow } from "@/lib/printCuentasCorrientes";
import type { PinCliente, VendedorKpis } from "./MapaRutas";
import { isInactivo30, normalizeFechaPadrón } from "@/lib/supervisionMapHelpers";
import { hasValidCoords } from "@/lib/supervisionMapPinesBuilder";
import { useSupervisionStore } from "@/store/useSupervisionStore";
import { useObjetivosMenuStore } from "@/store/useObjetivosMenuStore";
import { useSupervisionMapPreload } from "@/hooks/useSupervisionMapPreload";
import { SupervisionMapToolbar } from "./map/SupervisionMapToolbar";
import { SupervisionMapView } from "./map/SupervisionMapView";
import { ObjetivoPorZonaPanel } from "./map/ObjetivoPorZonaPanel";
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
import {
  computeDeudaPorAntiguedad,
} from "@/lib/cuentasCorrientes";
import { CcDeudaResumenPanel } from "@/components/supervision/CcDeudaResumenPanel";
import { AltasCompradoresPanel } from "@/components/supervision/AltasCompradoresPanel";
import { ObjetivoCreateProgress } from "@/components/objetivos/ObjetivoCreateProgress";
import { TelegramRichEditor } from "@/components/objetivos/TelegramRichEditor";
import {
  useAltasCompradoresQuery,
  usePrefetchAltasCompradores,
} from "@/hooks/useAltasCompradores";
import { useInView } from "@/hooks/useInView";
import { useSupervisionPanelStore } from "@/store/useSupervisionPanelStore";
import { useSupervisionBundle } from "@/hooks/useSupervisionQueries";
import { bundleKeys } from "@/lib/query-keys";

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

/** Returns true if fecha is within `days` days from today */
function isRecentDate(fecha: string | null | undefined, days: number): boolean {
  if (!fecha) return false;
  return Date.now() - new Date(fecha).getTime() <= days * 86_400_000;
}

/** Keep active + inactive PDVs visible in Supervisión toggles/map. */
function isClientePadronActivo(c: ClienteSupervision): boolean {
  void c;
  return true;
}

interface VendorMapEligibleStats {
  /** PDV únicos con coords válidas (misma regla que mapPins del mapa) */
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

function normDia(dia?: string | null): string {
  return (dia ?? "sin día").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

type RouteLike = { id_ruta: number; dia_semana?: string | null; total_pdv?: number | null };

function groupRouteLikeByDay<T extends RouteLike>(rutas: T[]) {
  const byDay = new Map<string, T[]>();
  for (const r of rutas) {
    const day = r.dia_semana || "Sin día";
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(r);
  }
  return Array.from(byDay.entries())
    .sort((a, b) => (DIA_ORDER[normDia(a[0])] ?? 99) - (DIA_ORDER[normDia(b[0])] ?? 99))
    .map(([day, routes]) => ({
      day,
      routes,
      totalPdvs: routes.reduce((acc, r) => acc + (r.total_pdv ?? 0), 0),
    }));
}

type ObjVendedorRouteRow = import("@/store/useObjetivosMenuStore").ObjVendedorRoute;

function mapRutasSupervisionToObjRoutes(
  rutas: RutaSupervision[],
  idVendedor: number,
  nombreVendedor: string,
): ObjVendedorRouteRow[] {
  return [...rutas]
    .sort(
      (a, b) =>
        (DIA_ORDER[a.dia_semana?.toLowerCase() ?? ""] ?? 9) -
        (DIA_ORDER[b.dia_semana?.toLowerCase() ?? ""] ?? 9),
    )
    .map((r) => ({
      id_ruta: r.id_ruta,
      nro_ruta: r.nombre_ruta ?? String(r.id_ruta),
      dia_semana: r.dia_semana ?? "",
      total_pdv: r.total_pdv ?? 0,
      id_vendedor: idVendedor,
      nombre_vendedor: nombreVendedor,
    }));
}

/** Agrupa rutas por vendedor y día cuando hay selección multi-vendedor en el mapa. */
function groupRoutesForRuteoSelect(rutas: ObjVendedorRouteRow[]) {
  const vendorIds = new Set(
    rutas.map((r) => r.id_vendedor).filter((v): v is number => v != null),
  );
  if (vendorIds.size <= 1) {
    return groupRouteLikeByDay(rutas).map((g) => ({
      ...g,
      vendorLabel: null as string | null,
    }));
  }
  const byVendor = new Map<number, ObjVendedorRouteRow[]>();
  for (const r of rutas) {
    const vid = r.id_vendedor ?? 0;
    if (!byVendor.has(vid)) byVendor.set(vid, []);
    byVendor.get(vid)!.push(r);
  }
  const out: Array<{
    vendorLabel: string | null;
    day: string;
    routes: ObjVendedorRouteRow[];
    totalPdvs: number;
  }> = [];
  for (const routes of byVendor.values()) {
    const vendorLabel = routes[0]?.nombre_vendedor ?? null;
    for (const g of groupRouteLikeByDay(routes)) {
      out.push({ vendorLabel, ...g });
    }
  }
  return out;
}

function routesForPinVendor(
  allRoutes: ObjVendedorRouteRow[],
  idVendedor: number | undefined,
): ObjVendedorRouteRow[] {
  if (!idVendedor) return allRoutes;
  const filtered = allRoutes.filter((r) => r.id_vendedor === idVendedor);
  return filtered.length > 0 ? filtered : allRoutes;
}

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
  const { hasPermiso, user } = useAuth();
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
    mapToolMode,
    setMapToolMode,
    visibleCapaIds,
    toggleCapaVisibility,
    setVisibleCapaIds,
    setActivePolygon,
    clearRouteBuildState,
    activePolygonPdvIds,
    activePolygonGeoJson,
  } = useSupervisionStore();

  // accordion state (local UI only)
  const [openVend, setOpenVend]                 = useState<number | null>(null);
  const [openRuta, setOpenRuta]                 = useState<number | null>(null);
  const [openCliente, setOpenCliente]           = useState<number | null>(null);
  const [expandedDias, setExpandedDias]         = useState<Set<string>>(new Set());

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
  const { ref: exhibSectionRef, inView: exhibSectionInView } = useInView<HTMLDivElement>();
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
  const [activeJobId, setActiveJobId]       = useState<string | null>(null);
  const [activeJobDistId, setActiveJobDistId] = useState<number | null>(null);
  const objVendedorRoutes    = useObjetivosMenuStore(s => s.objVendedorRoutes);
  const setObjVendedorRoutes = useObjetivosMenuStore(s => s.setObjVendedorRoutes);
  const objSelectedDias      = useObjetivosMenuStore(s => s.objSelectedDias);
  const setObjSelectedDias   = useObjetivosMenuStore(s => s.setObjSelectedDias);
  const objAlteoMode         = useObjetivosMenuStore(s => s.objAlteoMode);
  const setObjAlteoMode      = useObjetivosMenuStore(s => s.setObjAlteoMode);
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
  const objOrigen               = useObjetivosMenuStore(s => s.objOrigen);
  const setObjOrigen            = useObjetivosMenuStore(s => s.setObjOrigen);
  const objMesReferencia        = useObjetivosMenuStore(s => s.objMesReferencia);
  const setObjMesReferencia     = useObjetivosMenuStore(s => s.setObjMesReferencia);
  const objTasaPendientes       = useObjetivosMenuStore(s => s.objTasaPendientes);
  const setObjTasaPendientes    = useObjetivosMenuStore(s => s.setObjTasaPendientes);
  const objAlteoConVenta        = useObjetivosMenuStore(s => s.objAlteoConVenta);
  const setObjAlteoConVenta     = useObjetivosMenuStore(s => s.setObjAlteoConVenta);
  const objEnableMinPdvs        = useObjetivosMenuStore(s => s.objEnableMinPdvs);
  const setObjEnableMinPdvs     = useObjetivosMenuStore(s => s.setObjEnableMinPdvs);
  const objMinPdvsDistintos     = useObjetivosMenuStore(s => s.objMinPdvsDistintos);
  const setObjMinPdvsDistintos  = useObjetivosMenuStore(s => s.setObjMinPdvsDistintos);

  const objDescWasAutoFilled = useRef(true);
  const objPreviewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objDescRef = useRef(objDesc);
  objDescRef.current = objDesc;

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
            queryClient.invalidateQueries({ queryKey: ['bundle', 'supervision'] });
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

  const { ref: ccSectionRef, inView: ccSectionInView } = useInView<HTMLDivElement>();
  const { ref: ccMobileRef, inView: ccMobileInView } = useInView<HTMLDivElement>();
  const ccPanelVisible = ccSectionInView || ccMobileInView;

  // ── TanStack Query: Vendedores (lite → full en background) ─────────────────
  const {
    data: vendedoresLite = [],
    isLoading: loadingLite,
    error: vendedoresLiteError,
  } = useQuery({
    queryKey: ["supervision-vendedores-lite", selectedDist],
    queryFn: () => fetchVendedoresSupervision(selectedDist, { lite: true }),
    enabled: !!selectedDist,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const {
    data: vendedoresFull,
    isFetching: fetchingVendedoresFull,
    error: vendedoresFullError,
    refetch: refetchVendedores,
  } = useQuery({
    queryKey: ["supervision-vendedores", selectedDist],
    queryFn: () => fetchVendedoresSupervision(selectedDist),
    enabled: !!selectedDist && !loadingLite,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const vendedores = vendedoresFull ?? vendedoresLite;
  const loading = loadingLite && vendedores.length === 0;
  const vendedoresError = vendedoresFullError ?? vendedoresLiteError;
  const error = vendedoresError
    ? vendedoresError instanceof Error
      ? vendedoresError.message
      : "Error cargando datos"
    : null;

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

  const supervisionBundleDist =
    selectedDist && (!mapOnly || ccPanelVisible) ? selectedDist : 0;
  const { data: supervisionBundle, isLoading: loadingCuentas } = useSupervisionBundle(
    supervisionBundleDist,
    selectedSucursal ?? null,
    null, // id_vendedor: null para cargar todos, filtrar en FE
  );
  // Adaptar shape para compatibilidad con JSX existente:
  const cuentasData: CuentasSupervision | null = supervisionBundle?.cuentas
    ? {
        fecha: supervisionBundle.cuentas.fecha ?? null,
        metadatos: (supervisionBundle.cuentas as any).metadatos ?? {},
        vendedores: (supervisionBundle.cuentas.vendedores ?? []) as VendedorCuentas[],
      }
    : null;

  const { data: syncStatus = null } = useQuery<SyncStatus>({
    queryKey: ['supervision-sync-status', selectedDist],
    queryFn: () => fetchSyncStatus(selectedDist!),
    enabled: !!selectedDist,
    staleTime: 30_000,
    refetchInterval: SUPERVISION_SYNC_POLL_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const { altasMes } = useSupervisionPanelStore();

  const selectedVendedorId = useMemo(() => {
    if (!openVend) return null;
    const v = vendedores.find(v => v.id_vendedor === openVend);
    return v?.id_vendedor ?? null;
  }, [openVend, vendedores]);

  const { data: altasData } = useAltasCompradoresQuery(
    selectedDist ?? 0,
    selectedVendedorId,
    altasMes,
    { enabled: !mapOnly },
  );
  usePrefetchAltasCompradores(selectedDist ?? 0, selectedVendedorId, altasMes, !mapOnly);

  const { data: kpiMapa } = useQuery({
    queryKey: ['vendedor-kpi-mapa', selectedDist, openVend, altasMes],
    queryFn: () => fetchVendedorKpiMapa(selectedDist!, openVend!, altasMes),
    enabled: !!selectedDist && !!openVend && !!altasMes,
    staleTime: 5 * 60 * 1000,
  });

  const vendedorKpis = useMemo<VendedorKpis | undefined>(() => {
    if (!kpiMapa || !openVend) return undefined;
    const v = vendedores.find((v) => v.id_vendedor === openVend);
    return { ...kpiMapa, nombre: v?.nombre_vendedor ?? '' };
  }, [kpiMapa, openVend, vendedores]);

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

  const exhibFechas = useMemo(() => {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60 * 1000;
    const localToday = new Date(now.getTime() - offsetMs).toISOString().split("T")[0];
    let fechaDesde = localToday;
    if (exhibPeriodo === "7d") {
      const sevenDaysAgo = new Date(now.getTime() - 6 * 86_400_000);
      fechaDesde = new Date(sevenDaysAgo.getTime() - offsetMs).toISOString().split("T")[0];
    } else if (exhibPeriodo === "historico") {
      fechaDesde = "2000-01-01";
    }
    return { fechaDesde, fechaHasta: localToday };
  }, [exhibPeriodo]);

  const { data: exhibiciones = [], isLoading: loadingExhib } = useQuery({
    queryKey: [
      "supervision-exhibiciones",
      selectedDist,
      exhibPeriodo,
      exhibFechas.fechaDesde,
      exhibFechas.fechaHasta,
    ],
    queryFn: async () => {
      const res = await fetchReporteExhibiciones(selectedDist!, exhibFechas);
      return Array.isArray(res) ? res : [];
    },
    enabled: !!selectedDist && !mapOnly && exhibSectionInView,
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });

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

  useSupervisionMapPreload(selectedDist, vendedoresFiltrados, !!selectedSucursal && vendedoresFiltrados.length > 0);

  const mapPins = useSupervisionStore((s) => s.mapPins);
  const finishPolygonRef = useRef<(() => void) | null>(null);
  const vendorPanelRef = useRef<React.ReactNode>(null);
  const getFullscreenPanel = useCallback(() => vendorPanelRef.current, []);

  const handleShowAllVendors = useCallback(async () => {
    const ids = new Set(vendedoresFiltrados.map(v => v.id_vendedor));
    setVisibleVends(ids);
    const rutaIds = new Set<number>();
    const clienteIds = new Set<number>();
    for (const v of vendedoresFiltrados) {
      const rutas = await queryClient.fetchQuery({
        queryKey: ['supervision-rutas', selectedDist, v.id_vendedor],
        queryFn: () => fetchRutasSupervision(v.id_vendedor),
      });
      for (const r of rutas ?? []) {
        rutaIds.add(r.id_ruta);
        const clientes = await queryClient.fetchQuery({
          queryKey: ['supervision-clientes', selectedDist, r.id_ruta],
          queryFn: () => fetchClientesSupervision(r.id_ruta),
        });
        for (const c of clientes ?? []) {
          if (c.latitud != null && c.longitud != null) clienteIds.add(c.id_cliente);
        }
      }
    }
    setVisibleRutas(rutaIds);
    setVisibleClientes(clienteIds);
  }, [vendedoresFiltrados, selectedDist, queryClient, setVisibleVends, setVisibleRutas, setVisibleClientes]);

  const handleHideAllVendors = useCallback(() => {
    setVisibleVends(new Set());
    setVisibleRutas(new Set());
    setVisibleClientes(new Set());
    setVisibleCapaIds(new Set());
  }, [setVisibleVends, setVisibleRutas, setVisibleClientes, setVisibleCapaIds]);

  const handleMapToolModeChange = useCallback((mode: typeof mapToolMode) => {
    setMapToolMode(mode);
    if (mode === 'explorar') clearRouteBuildState();
    else toast.info(mode === 'objetivo_zona' ? 'Dibujá la zona del objetivo' : 'Dibujá la capa de ruteo');
  }, [setMapToolMode, clearRouteBuildState]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsub = queryClient.getQueryCache().subscribe((e) => {
      const qk = e.query?.queryKey;
      if (!Array.isArray(qk) || qk[1] !== selectedDist) return;
      if (qk[0] === "supervision-clientes" || qk[0] === "supervision-rutas") {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => setMapStatsTick((t) => t + 1), 400);
      }
    });
    return () => {
      unsub();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
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

  const ccClientesFlat = useMemo(() => {
    if (!cuentasFiltradas?.vendedores.length) return [];
    return cuentasFiltradas.vendedores.flatMap((v: { clientes: unknown[] }) => v.clientes);
  }, [cuentasFiltradas]);

  const ccDeudaPorAntiguedad = useMemo(
    () => computeDeudaPorAntiguedad(ccClientesFlat as Parameters<typeof computeDeudaPorAntiguedad>[0]),
    [ccClientesFlat],
  );
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

  // Map pins: derivados en Zustand vía SupervisionMapView + useSupervisionMapPinsEngine

  const selectedVendorIdsKey = useMemo(() => {
    const ids = [
      ...new Set(
        selectedPDVsForObjective
          .map((id) => mapPins.find((p) => p.id === id)?.id_vendedor)
          .filter((v): v is number => v != null),
      ),
    ].sort((a, b) => a - b);
    return ids.join(",");
  }, [selectedPDVsForObjective, mapPins]);

  // ── Floating Objetivos: contextual data loader ───────────────────────────
  useEffect(() => {
    const firstPin = mapPins.find(p => selectedPDVsForObjective.includes(p.id) && p.id_vendedor);
    if (!firstPin?.id_vendedor) {
      setObjVendedorRoutes([]);
      setObjDebtList([]);
      return;
    }
    const vendedorId = firstPin.id_vendedor;

    if (objTipo === "ruteo_alteo") {
      setObjLoadingContext(true);
      fetchRutasSupervision(vendedorId)
        .then((rutas) =>
          setObjVendedorRoutes(
            mapRutasSupervisionToObjRoutes(
              rutas,
              vendedorId,
              firstPin.vendedor ?? vendedores.find((v) => v.id_vendedor === vendedorId)?.nombre_vendedor ?? "",
            ),
          ),
        )
        .catch(() => setObjVendedorRoutes([]))
        .finally(() => setObjLoadingContext(false));
    } else if (objTipo === "cobranza") {
      setObjLoadingContext(true);
      {
        // Match by vendor name since VendedorCuentas doesn't expose id_vendedor
        const firstPin = mapPins.find(p => p.id === selectedPDVsForObjective[0] && p.id_vendedor);
        const vendorName = firstPin?.vendedor ?? "";
        const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const bundleData = queryClient.getQueryData<SupervisionBundle>(
          bundleKeys.supervision(selectedDist ?? 0, null, null)
        );
        if (bundleData?.cuentas?.vendedores) {
          const vend = (bundleData.cuentas.vendedores as VendedorCuentas[]).find(
            (v) => norm(v.vendedor ?? "") === norm(vendorName)
          );
          if (vend) {
            setObjDebtList(
              (vend.clientes ?? [])
                .filter((c) => (c.deuda_total ?? 0) > 0)
                .sort((a, b) => (b.deuda_total ?? 0) - (a.deuda_total ?? 0))
                .slice(0, 10)
                .map((c) => ({ cliente_nombre: c.cliente ?? "–", deuda_total: c.deuda_total ?? 0 }))
            );
          }
          setObjLoadingContext(false);
        } else {
          // Fallback: llamar API directamente si no hay cache
          fetchSupervisionBundle(selectedDist)
            .then((bundle: SupervisionBundle) => {
              const vend = (bundle.cuentas?.vendedores ?? []).find(
                (v: any) => norm(v.vendedor ?? "") === norm(vendorName)
              );
              if (vend) {
                setObjDebtList(
                  (vend.clientes ?? [])
                    .filter((c: any) => (c.deuda_total ?? 0) > 0)
                    .sort((a: any, b: any) => (b.deuda_total ?? 0) - (a.deuda_total ?? 0))
                    .slice(0, 10)
                    .map((c: any) => ({ cliente_nombre: c.cliente ?? "–", deuda_total: c.deuda_total ?? 0 }))
                );
              }
            })
            .catch(() => setObjDebtList([]))
            .finally(() => setObjLoadingContext(false));
        }
      }
    } else if (objTipo === "ruteo") {
      const vendorIds = selectedVendorIdsKey
        ? selectedVendorIdsKey
            .split(",")
            .map((s) => Number(s))
            .filter((n) => Number.isFinite(n) && n > 0)
        : [];
      if (vendorIds.length === 0) {
        setObjVendedorRoutes([]);
        return;
      }
      setObjLoadingContext(true);
      Promise.all(
        vendorIds.map(async (vId) => {
          const rutas = await fetchRutasSupervision(vId);
          const vend = vendedores.find((v) => v.id_vendedor === vId);
          return mapRutasSupervisionToObjRoutes(
            rutas,
            vId,
            vend?.nombre_vendedor ?? `Vendedor ${vId}`,
          );
        }),
      )
        .then((groups) => setObjVendedorRoutes(groups.flat()))
        .catch(() => setObjVendedorRoutes([]))
        .finally(() => setObjLoadingContext(false));
    } else if (objTipo === "conversion_estado" || objTipo === "exhibicion") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const vendorPins = mapPins.filter(p => p.id_vendedor === vendedorId);
      const inactive = vendorPins.filter(p =>
        !p.fechaUltimaCompra || p.fechaUltimaCompra < thirtyDaysAgo
      );
      setObjInactivePdvCount(inactive.length);
    }
  }, [objTipo, selectedVendorIdsKey, selectedPDVsForObjective.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Objective phrase builder ─────────────────────────────────────────────
  function buildObjectivePhrase(
    tipo: ObjetivoTipo,
    vendorName: string,
    selectedDays: string[],
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

    if (tipo === "ruteo_alteo") {
      const qty = cantidadAlteo ? Number(cantidadAlteo) : null;
      if (selectedDays.length > 0) {
        const diasLabelTxt = selectedDays.map((d) => d.toUpperCase()).join(", ");
        return `${vendorName} debe ALTEAR los ${diasLabelTxt}${qty ? ` y sumar ${qty} PDVs nuevos` : ""}${fechaLabel}.${diasLabel}`;
      }
      if (qty) {
        return `${vendorName} debe ALTEAR ${qty} PDVs nuevos${fechaLabel}.${diasLabel}`;
      }
      return `${vendorName} debe ALTEAR nuevos PDVs${fechaLabel}.`;
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
    if (tipo === "compradores") {
      const n = cantidadAlteo || '';
      return `Compradores${n ? ` — meta ${n}` : ''}`;
    }
    if (tipo === "ruteo") {
      return `${vendorName} debe reasignar PDVs${fechaLabel}.`;
    }
    return "";
  }

  const selectedPdvsKey = selectedPDVsForObjective.join(",");

  // Refrescar pre-mensaje al cambiar PDVs seleccionados
  useEffect(() => {
    objDescWasAutoFilled.current = true;
  }, [selectedPdvsKey]);

  useEffect(() => {
    if (objTipo === "ruteo") {
      setObjDesc("");
      objDescWasAutoFilled.current = false;
    }
  }, [objTipo, setObjDesc]);

  // Auto-fill mensaje Telegram (preview API — mismo flujo que /objetivos)
  useEffect(() => {
    if (!selectedDist || selectedPDVsForObjective.length === 0) return;
    if (objTipo === "ruteo") return;

    const primaryPin = selectedPDVsForObjective
      .map((id) => mapPins.find((p) => p.id === id))
      .find((p) => p?.id_vendedor);
    if (!primaryPin?.id_vendedor) return;

    const pdvItems = selectedPDVsForObjective
      .map((id) => mapPins.find((p) => p.id === id))
      .filter((p): p is PinCliente => !!p)
      .map((pin) => ({
        nombre_pdv: pin.nombre,
        id_cliente_erp: pin.idClienteErp ?? undefined,
      }));

    const normMes =
      objMesReferencia && /^\d{4}-\d{2}$/.test(objMesReferencia)
        ? `${objMesReferencia}-01`
        : objMesReferencia || undefined;

    if (objPreviewDebounceRef.current) clearTimeout(objPreviewDebounceRef.current);
    objPreviewDebounceRef.current = setTimeout(async () => {
      const vendorName = primaryPin.vendedor;
      const canOverwrite =
        objDescWasAutoFilled.current || !objDescRef.current.trim();

      try {
        const preview = await previewObjetivoTelegram({
          id_distribuidor: selectedDist,
          id_vendedor: primaryPin.id_vendedor!,
          tipo: objTipo,
          fecha_objetivo: objOrigen === "distribuidora" ? objFecha || undefined : undefined,
          valor_objetivo:
            objTipo === "ruteo_alteo"
              ? objCantidadAlteo !== ""
                ? Number(objCantidadAlteo)
                : pdvItems.length
              : pdvItems.length,
          pdv_items: pdvItems,
          origen: objOrigen,
          mes_referencia: objOrigen === "compania" ? normMes : undefined,
          nombre_vendedor: vendorName,
          ...(objTipo === "ruteo_alteo" && objSelectedDias.length > 0
            ? { estado_inicial: objSelectedDias.map((d) => d.toUpperCase()).join(", ") }
            : {}),
        });
        if (preview?.preview_html && canOverwrite) {
          setObjDesc(preview.preview_html);
          objDescWasAutoFilled.current = true;
        }
      } catch {
        const fallback = buildObjectivePhrase(
          objTipo,
          vendorName,
          objSelectedDias,
          objFecha,
          objCantidadAlteo,
          objSelectedDeudor,
          objCobranzaMode,
          objCobranzaMonto,
        );
        if (fallback && canOverwrite) {
          setObjDesc(fallback);
          objDescWasAutoFilled.current = true;
        }
      }
    }, 500);

    return () => {
      if (objPreviewDebounceRef.current) clearTimeout(objPreviewDebounceRef.current);
    };
  }, [
    selectedDist,
    selectedPdvsKey,
    mapPins,
    objTipo,
    objFecha,
    objOrigen,
    objMesReferencia,
    objCantidadAlteo,
    objSelectedDias,
    objSelectedDeudor,
    objCobranzaMode,
    objCobranzaMonto,
    setObjDesc,
  ]);

  // ── Floating Objetivos submit ─────────────────────────────────────────────
  const handleSubmitObjectives = async () => {
    if (selectedPDVsForObjective.length === 0) return;
    setObjSubmitting(true);
    // Normalizar mes_referencia: YYYY-MM → YYYY-MM-01
    const normMesReferencia = (mr: string | undefined) => {
      if (!mr) return mr;
      if (/^\d{4}-\d{2}$/.test(mr)) return `${mr}-01`;
      return mr;
    };
    try {
      if (objTipo === "ruteo") {
        if (objOrigen === "distribuidora" && !objFecha) {
          toast.error("Indicá la fecha límite del objetivo");
          return;
        }
        if (objOrigen === "compania" && !objMesReferencia) {
          toast.error("Indicá el mes de referencia");
          return;
        }
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

        const byVendedor = new Map<number, { vendedor: string; pdvIds: number[] }>();
        for (const pdvId of selectedPDVsForObjective) {
          const pin = mapPins.find((p) => p.id === pdvId);
          if (!pin?.id_vendedor) continue;
          if (!byVendedor.has(pin.id_vendedor)) {
            byVendedor.set(pin.id_vendedor, { vendedor: pin.vendedor, pdvIds: [] });
          }
          byVendedor.get(pin.id_vendedor)!.pdvIds.push(pdvId);
        }
        if (byVendedor.size === 0) {
          toast.error("Los PDVs seleccionados no tienen vendedor asignado");
          return;
        }

        const hasValidPolygon =
          routeBuildEnabled &&
          !!activePolygonGeoJson &&
          Array.isArray(activePolygonGeoJson.geometry?.coordinates) &&
          Array.isArray(activePolygonGeoJson.geometry.coordinates[0]) &&
          activePolygonGeoJson.geometry.coordinates[0].length >= 4;
        const groupId = hasValidPolygon ? crypto.randomUUID() : undefined;

        const buildRuteoPdvItems = (pdvIds: number[]) =>
          pdvIds.map((pdvId, idx) => {
            const pin = mapPins.find((p) => p.id === pdvId);
            if (objRuteoConfigMode === "global") {
              const acc = objRuteoAccionGlobal;
              const globalDestinoRuta =
                objVendedorRoutes.find((r) => r.id_ruta === objRuteoGlobalDestinoId) ?? null;
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
            const destinoRuta =
              objVendedorRoutes.find((r) => r.id_ruta === item.id_ruta_destino) ?? null;
            return {
              id_cliente_pdv: pdvId,
              nombre_pdv: pin?.nombre,
              accion_ruteo: item.accion,
              ...(item.accion === "cambio_ruta" && item.id_ruta_destino
                ? {
                    id_ruta_destino: item.id_ruta_destino,
                    metadata_ruteo: {
                      nro_ruta_destino: destinoRuta?.nro_ruta ?? null,
                      dia_semana_destino: destinoRuta?.dia_semana ?? null,
                    },
                  }
                : {}),
              ...(item.accion === "baja" && item.motivo_baja
                ? { motivo_baja: item.motivo_baja }
                : {}),
              orden_sugerido: idx + 1,
            };
          });

        const enrichItems = (items: ReturnType<typeof buildRuteoPdvItems>) =>
          items.map((item) => ({
            ...item,
            ...(groupId && activePolygonGeoJson
              ? {
                  group_id: groupId,
                  group_name: "Polígono de ruteo",
                  polygon_geojson: activePolygonGeoJson as Record<string, unknown>,
                }
              : {}),
          }));

        const globalDestinoRuta =
          objVendedorRoutes.find((r) => r.id_ruta === objRuteoGlobalDestinoId) ?? null;
        const multiVendor = byVendedor.size > 1;
        const useSingleCrossVendorGuide =
          multiVendor &&
          objRuteoConfigMode === "global" &&
          objRuteoAccionGlobal === "cambio_ruta" &&
          !!objRuteoGlobalDestinoId;

        let created = 0;

        if (useSingleCrossVendorGuide) {
          const cabeceraVendId =
            globalDestinoRuta?.id_vendedor ??
            [...byVendedor.keys()][0];
          const cabeceraNombre =
            vendedores.find((v) => v.id_vendedor === cabeceraVendId)?.nombre_vendedor ??
            globalDestinoRuta?.nombre_vendedor ??
            [...byVendedor.values()][0]?.vendedor ??
            "";
          const allPdvIds = selectedPDVsForObjective;
          const autoDesc =
            objDesc ||
            buildObjectivePhrase(objTipo, cabeceraNombre, [], objFecha);
          const _jobResult0 = await createObjetivoAsync({
            id_distribuidor: selectedDist,
            id_vendedor: cabeceraVendId,
            tipo: objTipo,
            nombre_vendedor: cabeceraNombre,
            descripcion: autoDesc || undefined,
            fecha_objetivo: objOrigen === "distribuidora" ? objFecha : undefined,
            valor_objetivo: allPdvIds.length,
            pdv_items: enrichItems(buildRuteoPdvItems(allPdvIds)),
            ruteo_build_mode: hasValidPolygon ? "polygon" : "manual",
            origen: objOrigen,
            mes_referencia:
              objOrigen === "compania" ? normMesReferencia(objMesReferencia) || undefined : undefined,
            tasa_pendientes:
              objTasaPendientes !== "" ? Number(objTasaPendientes) : undefined,
          } as ObjetivoCreate);
          if (_jobResult0.job_id) {
            setActiveJobId(_jobResult0.job_id);
            setActiveJobDistId(selectedDist);
          }
          created = 1;
        } else {
          let isFirstRuteo = true;
          for (const [vendedorId, { vendedor, pdvIds }] of byVendedor) {
            const autoDesc =
              objDesc || buildObjectivePhrase(objTipo, vendedor, [], objFecha);
            const _jobResultR = await createObjetivoAsync({
              id_distribuidor: selectedDist,
              id_vendedor: vendedorId,
              tipo: objTipo,
              nombre_vendedor: vendedor,
              descripcion: autoDesc || undefined,
              fecha_objetivo: objOrigen === "distribuidora" ? objFecha : undefined,
              valor_objetivo: pdvIds.length,
              pdv_items: enrichItems(buildRuteoPdvItems(pdvIds)),
              ruteo_build_mode: hasValidPolygon ? "polygon" : "manual",
              origen: objOrigen,
              mes_referencia:
                objOrigen === "compania" ? normMesReferencia(objMesReferencia) || undefined : undefined,
              tasa_pendientes:
                objTasaPendientes !== "" ? Number(objTasaPendientes) : undefined,
            } as ObjetivoCreate);
            if (isFirstRuteo && _jobResultR.job_id) {
              setActiveJobId(_jobResultR.job_id);
              setActiveJobDistId(selectedDist);
              isFirstRuteo = false;
            }
            created += 1;
          }
        }

        toast.success(
          created === 1
            ? "Guía de ruteo creada con PDF"
            : `${created} guías de ruteo creadas (una por vendedor)`,
        );
      } else {
        // Agrupar PDVs por vendedor → un solo objetivo por vendedor con pdv_items
        const byVendedor = new Map<number, { vendedor: string; pdvs: typeof mapPins }>();
        for (const pdvId of selectedPDVsForObjective) {
          const pin = mapPins.find(p => p.id === pdvId);
          if (!pin || !pin.id_vendedor) continue;
          if (!byVendedor.has(pin.id_vendedor)) {
            byVendedor.set(pin.id_vendedor, { vendedor: pin.vendedor, pdvs: [] });
          }
          byVendedor.get(pin.id_vendedor)!.pdvs.push(pin);
        }

        let isFirstCreate = true;
        for (const [vendedorId, { vendedor, pdvs }] of byVendedor) {
          const autoDesc = objDesc || buildObjectivePhrase(objTipo, vendedor, objSelectedDias, objFecha, objCantidadAlteo, objSelectedDeudor, objCobranzaMode, objCobranzaMonto);

          // Para cobranza (objetivo de deuda, no multi-PDV) usar id_target_pdv del primer pin
          if (objTipo === "cobranza") {
            const _jobResultC = await createObjetivoAsync({
              id_distribuidor: selectedDist,
              id_vendedor: vendedorId,
              tipo: objTipo,
              id_target_pdv: pdvs[0].id,
              nombre_pdv: pdvs[0].nombre,
              nombre_vendedor: vendedor,
              descripcion: autoDesc || undefined,
              fecha_objetivo: objOrigen === 'distribuidora' ? (objFecha || undefined) : undefined,
              ...(objSelectedDeudor ? {
                valor_objetivo: objCobranzaMode === "parcial" && objCobranzaMonto ? Number(objCobranzaMonto) : objSelectedDeudor.deuda_total,
              } : {}),
              origen: objOrigen,
              mes_referencia: objOrigen === 'compania' ? (normMesReferencia(objMesReferencia) || undefined) : undefined,
              tasa_pendientes: objTasaPendientes !== '' ? Number(objTasaPendientes) : undefined,
            } as ObjetivoCreate);
            if (isFirstCreate && _jobResultC.job_id) {
              setActiveJobId(_jobResultC.job_id);
              setActiveJobDistId(selectedDist);
              isFirstCreate = false;
            }
          } else {
            // Un solo objetivo con todos los PDVs como pdv_items
            const _jobResultE = await createObjetivoAsync({
              id_distribuidor: selectedDist,
              id_vendedor: vendedorId,
              tipo: objTipo,
              nombre_vendedor: vendedor,
              descripcion: autoDesc || undefined,
              fecha_objetivo: objOrigen === 'distribuidora' ? (objFecha || undefined) : undefined,
              valor_objetivo: objTipo === "ruteo_alteo"
                ? (objCantidadAlteo !== '' ? Number(objCantidadAlteo) : pdvs.length)
                : pdvs.length,
              pdv_items: pdvs.map(pin => ({
                id_cliente_pdv: pin.id,
                id_cliente_erp: pin.idClienteErp ?? undefined,
                nombre_pdv: pin.nombre,
              })),
              ...(objTipo === "ruteo_alteo" && objSelectedDias.length > 0
                ? { estado_inicial: objSelectedDias.map((d) => d.toUpperCase()).join(", ") }
                : {}),
              ...(objTipo === "ruteo_alteo" ? { alteo_con_venta: objAlteoConVenta } : {}),
              origen: objOrigen,
              mes_referencia: objOrigen === 'compania' ? (normMesReferencia(objMesReferencia) || undefined) : undefined,
              tasa_pendientes: objTasaPendientes !== '' ? Number(objTasaPendientes) : undefined,
            } as ObjetivoCreate);
            if (isFirstCreate && _jobResultE.job_id) {
              setActiveJobId(_jobResultE.job_id);
              setActiveJobDistId(selectedDist);
              isFirstCreate = false;
            }
          }
        }
      }
      clearSelectedPDVs();
      resetObjForm();
      setObjMenuOpen(false);
      // Limpiar estado de Armar Ruta tras submit exitoso
      if (routeBuildEnabled) clearRouteBuildState();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo crear el objetivo";
      toast.error(msg);
    } finally {
      setObjSubmitting(false);
    }
  };

  // ── Map layer controls (My Maps toolbar) ───────────────────────────────────
  function MapLayerControls() {
    const drawVertexCount = useSupervisionStore((s) => s.drawVertexCount);
    return (
      <SupervisionMapToolbar
        mapToolMode={mapToolMode}
        onMapToolModeChange={handleMapToolModeChange}
        onShowAllVendors={() => void handleShowAllVendors()}
        onHideAllVendors={handleHideAllVendors}
        canEdit={hasPermiso("action_edit_objetivos")}
        vertexCount={drawVertexCount}
        onFinishPolygon={() => finishPolygonRef.current?.()}
      />
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
                  {groupRouteLikeByDay(vRutas).map(({ day, routes }) => (
                    <div key={`${v.id_vendedor}-${day}`} className="py-1">
                      <div className="px-6 py-1 text-[10px] font-bold uppercase tracking-wide text-white/45">
                        {day}
                      </div>
                      {routes.map((r) => {
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
                  ))}
                </div>
              </Accordion>
            </div>
          );
        })}
      </div>
    </div>
  );
  vendorPanelRef.current = vendorPanelContent;

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
            {loading && mapPins.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--shelfy-bg)]/40 animate-pulse">
                <Loader2 className="w-6 h-6 animate-spin text-amber-400/70" />
                <p className="text-sm text-[var(--shelfy-muted)]">Preparando mapa…</p>
              </div>
            ) : mapPins.length === 0 ? (
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
              <SupervisionMapView
                distId={selectedDist}
                isSuperadmin={isSuperadmin}
                canEditObjetivos={hasPermiso("action_edit_objetivos")}
                vendedores={vendedores}
                cuentasData={cuentasData}
                getVendorColor={getVendorColor}
                vendedorKpis={vendedorKpis}
                getFullscreenPanel={getFullscreenPanel}
                onFinishPolygonRef={finishPolygonRef}
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
            {loading && (
              <div className="p-3 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-lg bg-white/5 animate-pulse border border-[var(--shelfy-border)]/30"
                    style={{ animationDelay: `${i * 80}ms` }}
                  />
                ))}
              </div>
            )}
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
                        {openVend === v.id_vendedor && altasData && (
                          <p className="text-[10px] text-violet-400 font-semibold mb-1">
                            {(altasData.total_compradores ?? 0).toLocaleString()} compradores en {altasMes.slice(5)}/{altasMes.slice(0, 4)}
                          </p>
                        )}
                        {/* Activity bar (activos = ventana 30 días, distinto de compradores del mes) */}
                        {pdvTot > 0 && (
                          <div className="mb-2">
                            <div className="flex justify-between items-center mb-0.5">
                              <span className="text-[10px] text-emerald-400 font-semibold">
                                {pdvAct.toLocaleString()} activos 30d
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

                        {(() => {
                          // Group rutas by dia_semana
                          const diaGroups: { dia: string; rutas: typeof vRutas }[] = [];
                          const diaMap = new Map<string, typeof vRutas>();
                          for (const r of vRutas) {
                            const dia = r.dia_semana ?? "Sin día";
                            if (!diaMap.has(dia)) diaMap.set(dia, []);
                            diaMap.get(dia)!.push(r);
                          }
                          // Sort days by DIA_ORDER
                          const sortedDias = Array.from(diaMap.keys()).sort(
                            (a, b) => (DIA_ORDER[a.toLowerCase()] ?? 9) - (DIA_ORDER[b.toLowerCase()] ?? 9)
                          );
                          for (const dia of sortedDias) {
                            diaGroups.push({ dia, rutas: diaMap.get(dia)! });
                          }

                          return diaGroups.map(({ dia, rutas: diaRutas }) => {
                            const diaKey = `${v.id_vendedor}-${dia}`;
                            const diaOpen = expandedDias.has(diaKey);
                            const diaTotalPDVs = diaRutas.reduce((sum, r) => sum + (r.total_pdv ?? 0), 0);
                            const diaLabel = dia.charAt(0).toUpperCase() + dia.slice(1).toLowerCase();

                            return (
                              <div key={diaKey}>
                                {/* ── Day header ── */}
                                <button
                                  onClick={() => {
                                    setExpandedDias(prev => {
                                      const next = new Set(prev);
                                      if (next.has(diaKey)) next.delete(diaKey);
                                      else next.add(diaKey);
                                      return next;
                                    });
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors text-left"
                                >
                                  <ChevronRight
                                    className={`w-3.5 h-3.5 text-[var(--shelfy-muted)] shrink-0 transition-transform duration-200 ${diaOpen ? "rotate-90" : ""}`}
                                  />
                                  <span className="text-[12px] font-bold text-[var(--shelfy-text)] uppercase tracking-wide flex-1">
                                    {diaLabel}
                                  </span>
                                  <span className="text-[10px] font-semibold text-[var(--shelfy-muted)]">
                                    {diaTotalPDVs.toLocaleString()} PDV{diaTotalPDVs !== 1 ? "s" : ""}
                                  </span>
                                  <span className="text-[9px] text-[var(--shelfy-muted)]/60 ml-1">
                                    {diaRutas.length} ruta{diaRutas.length !== 1 ? "s" : ""}
                                  </span>
                                </button>

                                {/* ── Day children (rutas) ── */}
                                <Accordion open={diaOpen}>
                                  <div className="divide-y divide-[var(--shelfy-border)]/20">
                                    {diaRutas.map(r => {
                                      const rOpen    = openRuta === r.id_ruta;
                                      const rCli     = queryClient.getQueryData<ClienteSupervision[]>(['supervision-clientes', selectedDist, r.id_ruta]) ?? [];
                                      const isRutaOn = visibleRutas.has(r.id_ruta);
                                      const cliVisible = rCli.filter(c => visibleClientes.has(c.id_cliente)).length;

                                      return (
                                        <div key={r.id_ruta}>
                                          {/* Route row (indented) */}
                                          <div className="flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-white/5 transition-colors">
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
                                                                ? (
                                                                  <>
                                                                    Últ. compra: {ultimaComp}{" "}
                                                                    <span className="font-normal opacity-70">({diasDesde(c.fecha_ultima_compra)})</span>
                                                                    {c.ultimo_comprobante?.label ? (
                                                                      <span className="font-normal opacity-60 block truncate max-w-[220px]" title={c.ultimo_comprobante.label}>
                                                                        {c.ultimo_comprobante.label}
                                                                      </span>
                                                                    ) : null}
                                                                  </>
                                                                )
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
                          });
                        })()}
                      </div>
                    </Accordion>

                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* ── MOBILE CC — debajo de rutas en mobile (lg:hidden) ──────────── */}
        {!mapOnly && <div ref={ccMobileRef} className="lg:hidden flex flex-col rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-y-auto min-h-[300px]">
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

      {/* ── SECCIÓN CUENTAS CORRIENTES — solo desktop (lg+) ─────────────────── */}
      {!mapOnly && <div ref={ccSectionRef} className="hidden lg:grid lg:grid-cols-2 gap-4">

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
                  onClick={() => {
                    if (!selectedDist || !cuentasFiltradas?.vendedores.length) return;
                    void openCuentasCorrientesPrintWindow({
                      distId: selectedDist,
                      sucursal: selectedSucursal ?? undefined,
                      fecha: cuentasFiltradas.fecha ?? undefined,
                    });
                  }}
                  title="PDF de cuentas corrientes (mismo formato que difusión)"
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

            {cuentasFiltradas && cuentasFiltradas.vendedores.length > 0 && selectedSucursal && (
              <CcDeudaResumenPanel
                embedded
                variant="amber"
                antiguedad={ccDeudaPorAntiguedad}
                rangoBadgeClassFn={(label) =>
                  RANGO_COLORS[label] ??
                  "bg-white/5 text-[var(--shelfy-muted)] border-[var(--shelfy-border)]"
                }
              />
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

        <AltasCompradoresPanel
          distId={selectedDist!}
          vendedorId={selectedVendedorId}
          layout="split"
        />

      </div>}

      {/* ── SECCIÓN EXHIBICIONES ────────────────────────────────────────────── */}
      {!mapOnly && <div
        ref={exhibSectionRef}
        className="rounded-2xl border border-[var(--shelfy-border)] bg-[var(--shelfy-panel)] overflow-hidden shadow-sm"
      >
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

      {/* ── Objetivo por zona (panel flotante) ─────────────────────────────── */}
      {mapToolMode === 'objetivo_zona' && selectedPDVsForObjective.length > 0 && hasPermiso("action_edit_objetivos") && (
        <div className="fixed bottom-6 right-6 z-[10050] flex flex-col items-end gap-3">
          {objMenuOpen && (
            <div className="flex flex-row items-stretch gap-2 max-h-[min(85vh,720px)]">
              <ObjetivoPorZonaPanel
                open
                pdvCount={selectedPDVsForObjective.length}
                onClose={() => setObjMenuOpen(false)}
              >
              <div className="px-4 pt-3 pb-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--shelfy-muted)] mb-2">PDVs</p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {selectedPDVsForObjective.map(id => {
                    const pin = mapPins.find(p => p.id === id);
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

              {/* Form — scroll independiente del mensaje */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3 border-t border-black/8 dark:border-white/8 pt-3 mt-1 custom-scrollbar">
                {/* Tipo — pill buttons */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--shelfy-muted)] mb-2">Tipo de objetivo</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { id: 'conversion_estado', label: 'Activación', color: '#8b5cf6' },
                      { id: 'ruteo_alteo',       label: 'Alteo',      color: '#0ea5e9' },
                      { id: 'ruteo',             label: 'Guía de cambio de ruta', color: '#22c55e' },
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

                {/* Contextual section: Alteo — día selector */}
                {objTipo === "ruteo_alteo" && (
                  <div className="space-y-2">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setObjAlteoMode("por_dia")}
                        className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors border ${
                          objAlteoMode === "por_dia"
                            ? "bg-[var(--shelfy-accent)]/20 text-[var(--shelfy-accent)] border-[var(--shelfy-accent)]/40"
                            : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-white"
                        }`}
                      >
                        Por día
                      </button>
                      <button
                        type="button"
                        onClick={() => setObjAlteoMode("general")}
                        className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors border ${
                          objAlteoMode === "general"
                            ? "bg-[var(--shelfy-accent)]/20 text-[var(--shelfy-accent)] border-[var(--shelfy-accent)]/40"
                            : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-white"
                        }`}
                      >
                        General
                      </button>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">Día asignado</label>
                      {objLoadingContext ? (
                        <div className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)]">
                          <Loader2 className="w-3 h-3 animate-spin" /> Cargando rutas...
                        </div>
                      ) : objVendedorRoutes.length === 0 ? (
                        <p className="text-xs text-[var(--shelfy-muted)]">Sin rutas encontradas</p>
                      ) : objAlteoMode === "general" ? (
                        <p className="text-xs text-[var(--shelfy-muted)]">Modo general activo: el objetivo no depende de una ruta puntual.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] p-2">
                          {groupRouteLikeByDay(objVendedorRoutes).map(({ day, routes, totalPdvs }) => {
                            const dayKey = normDia(day);
                            const on = objSelectedDias.includes(dayKey);
                            return (
                              <button
                                key={dayKey}
                                type="button"
                                onClick={() =>
                                  setObjSelectedDias(
                                    on
                                      ? objSelectedDias.filter((d) => d !== dayKey)
                                      : [...objSelectedDias, dayKey]
                                  )
                                }
                                className={`w-full text-left px-2.5 py-1.5 rounded-md border transition-colors ${
                                  on
                                    ? "border-[var(--shelfy-accent)]/50 bg-[var(--shelfy-accent)]/10"
                                    : "border-transparent hover:bg-white/5"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-semibold uppercase text-[var(--shelfy-text)]">{day}</span>
                                  <span className="text-[10px] text-[var(--shelfy-muted)]">{totalPdvs} PDVs</span>
                                </div>
                                <p className="text-[10px] text-[var(--shelfy-muted)]">
                                  {routes.length} ruta{routes.length !== 1 ? "s" : ""} asignada{routes.length !== 1 ? "s" : ""}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {/* Cantidad a altear */}
                    {(objAlteoMode === "general" || objSelectedDias.length > 0) && (
                      <div>
                        <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">
                          Cantidad de PDVs a altear
                        </label>
                        <input
                          type="number"
                          min={1}
                          placeholder="N PDVs"
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
                    {selectedVendorIdsKey.includes(",") && (
                      <p className="text-[10px] text-violet-400/95 bg-violet-500/10 border border-violet-500/20 rounded-lg px-2.5 py-1.5 leading-relaxed">
                        Varias zonas/vendedores: se cargan todas las rutas. Con cambio de ruta global se genera una guía unificada; con baja o config por PDV, una guía por vendedor.
                      </p>
                    )}
                    {objLoadingContext ? (
                      <div className="flex items-center gap-1.5 text-xs text-[var(--shelfy-muted)]">
                        <Loader2 className="w-3 h-3 animate-spin" /> Cargando rutas...
                      </div>
                    ) : objVendedorRoutes.length === 0 ? (
                      <p className="text-xs text-amber-500/90">No hay rutas cargadas para los vendedores seleccionados.</p>
                    ) : (
                      <div className="rounded-lg border border-[var(--shelfy-border)] bg-[var(--shelfy-bg)] p-2 max-h-28 overflow-y-auto">
                        <p className="text-[9px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-1">Rutas de los vendedores seleccionados</p>
                        <div className="space-y-1">
                          {groupRoutesForRuteoSelect(objVendedorRoutes).map(({ day, routes, totalPdvs, vendorLabel }) => (
                            <details key={`${vendorLabel ?? ""}-${day}`} className="rounded border border-[var(--shelfy-border)]/60 bg-[var(--shelfy-panel)] px-2 py-1">
                              <summary className="cursor-pointer text-[10px] font-semibold text-[var(--shelfy-text)] uppercase">
                                {vendorLabel ? `${vendorLabel} · ` : ""}{day} · {totalPdvs} PDVs
                              </summary>
                              <ul className="text-[11px] text-[var(--shelfy-text)] space-y-0.5 mt-1">
                                {routes.map(r => (
                                  <li key={r.id_ruta}>
                                    <span className="font-mono text-[var(--shelfy-accent)]">Ruta {r.nro_ruta ?? "—"}</span>
                                    {r.total_pdv != null ? <span className="text-[var(--shelfy-muted)]"> · {r.total_pdv} PDV</span> : null}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ))}
                        </div>
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
                                {groupRoutesForRuteoSelect(objVendedorRoutes).map(({ day, routes, totalPdvs, vendorLabel }) => (
                                  <div key={`${vendorLabel ?? ""}-${day}`}>
                                    <div className="px-2 py-1 text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase">
                                      {vendorLabel ? `${vendorLabel} · ` : ""}{day} · {totalPdvs} PDVs
                                    </div>
                                    {routes.map(r => (
                                      <SelectItem key={r.id_ruta} value={String(r.id_ruta)}>
                                        Ruta {r.nro_ruta ?? "—"} · {r.total_pdv ?? 0} PDVs
                                      </SelectItem>
                                    ))}
                                  </div>
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
                          const pin = mapPins.find(p => p.id === pdvId);
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
                                    {groupRoutesForRuteoSelect(
                                      routesForPinVendor(objVendedorRoutes, pin.id_vendedor),
                                    ).map(({ day, routes, totalPdvs, vendorLabel }) => (
                                      <div key={`${pdvId}-${vendorLabel ?? ""}-${day}`}>
                                        <div className="px-2 py-1 text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase">
                                          {vendorLabel ? `${vendorLabel} · ` : ""}{day} · {totalPdvs} PDVs
                                        </div>
                                        {routes.map(r => (
                                          <SelectItem key={`${pdvId}-${r.id_ruta}`} value={String(r.id_ruta)}>
                                            Ruta {r.nro_ruta ?? "—"} · {r.total_pdv ?? 0} PDVs
                                          </SelectItem>
                                        ))}
                                      </div>
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

                {/* Origen: Distribuidora / Compañía — solo para directorio o superadmin */}
                {(user?.is_superadmin || ['directorio', 'compania'].includes(user?.rol ?? '')) && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--shelfy-muted)] mb-2">Origen</p>
                    <div className="flex gap-1.5">
                      {(['distribuidora', 'compania'] as const).map(op => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setObjOrigen(op)}
                          className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                            objOrigen === op
                              ? 'border-[var(--shelfy-accent)] bg-[var(--shelfy-accent)]/15 text-[var(--shelfy-accent)]'
                              : 'border-black/10 dark:border-white/10 text-[var(--shelfy-muted)] hover:border-black/20 dark:hover:border-white/20'
                          }`}
                        >
                          {op === 'distribuidora' ? 'Distribuidora' : 'Compañía'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mes de referencia — solo cuando origen === compania */}
                {objOrigen === 'compania' && (
                  <div>
                    <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">Mes de referencia</label>
                    <select
                      className="w-full appearance-none bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                      value={objMesReferencia}
                      onChange={e => setObjMesReferencia(e.target.value)}
                    >
                      <option value="">Seleccionar mes...</option>
                      {Array.from({ length: 4 }, (_, i) => {
                        const d = new Date();
                        d.setDate(1);
                        d.setMonth(d.getMonth() + i);
                        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                        const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                        return <option key={val} value={val}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>;
                      })}
                    </select>
                  </div>
                )}

                {objTipo === "ruteo" ? (
                  <p className="text-[10px] text-purple-600/90 bg-purple-500/5 border border-purple-500/15 rounded-lg px-2.5 py-2 leading-relaxed">
                    Guía de cambio de ruta: uso interno en portal/PDF. No se envía mensaje por Telegram.
                  </p>
                ) : (
                  <div className="sm:hidden space-y-1">
                    <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block">Mensaje al vendedor</label>
                    <TelegramRichEditor
                      value={objDesc}
                      onChange={(val) => {
                        setObjDesc(val);
                        objDescWasAutoFilled.current = false;
                      }}
                      placeholder="Qué debe lograr el vendedor..."
                      rows={5}
                      maxHeight={280}
                    />
                  </div>
                )}

                {/* Fecha límite — solo cuando origen === distribuidora */}
                {objOrigen === 'distribuidora' && (
                  <div>
                    <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">Fecha límite</label>
                    <DatePicker
                      value={objFecha}
                      onChange={setObjFecha}
                      placeholder="Fecha límite"
                      contentClassName="z-[10070]"
                    />
                  </div>
                )}

                {/* Tasa de pendientes — siempre visible, opcional */}
                <div>
                  <label className="text-[10px] font-medium text-[var(--shelfy-muted)] uppercase tracking-wider block mb-1">Tasa de pendientes (opcional)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="w-full bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--shelfy-text)] focus:outline-none focus:border-[var(--shelfy-accent)]/60"
                    value={objTasaPendientes}
                    onChange={e => setObjTasaPendientes(e.target.value ? Number(e.target.value) : '')}
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
              </ObjetivoPorZonaPanel>

            {objTipo !== "ruteo" && (
              <div
                className="w-[min(340px,38vw)] shrink-0 rounded-2xl border border-white/10 bg-white/90 dark:bg-[#1a1a2e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden hidden sm:flex"
                style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.22), 0 0 0 0.5px rgba(255,255,255,0.12)' }}
              >
                <div className="px-4 py-3 border-b border-black/8 dark:border-white/10 flex items-center gap-2 shrink-0">
                  <MessageSquare className="w-3.5 h-3.5 text-[var(--shelfy-accent)] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--shelfy-text)] leading-none">Mensaje al vendedor</p>
                    <p className="text-[10px] text-[var(--shelfy-muted)] mt-0.5">Vista previa Telegram — editá antes de crear</p>
                  </div>
                </div>
                <div className="flex-1 min-h-0 p-3 flex flex-col overflow-hidden">
                  <TelegramRichEditor
                    value={objDesc}
                    onChange={(val) => {
                      setObjDesc(val);
                      objDescWasAutoFilled.current = false;
                    }}
                    placeholder="Qué debe lograr el vendedor..."
                    rows={10}
                    maxHeight={320}
                    className="flex-1 min-h-0"
                  />
                </div>
              </div>
            )}
            </div>
          )}

          <button
            onClick={() => setObjMenuOpen(!objMenuOpen)}
            className="flex items-center gap-2.5 px-5 py-3 rounded-2xl text-white text-sm font-bold shadow-xl hover:opacity-90 active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg, var(--shelfy-accent) 0%, #7c3aed 100%)', boxShadow: '0 4px 20px rgba(139,92,246,0.45)' }}
          >
            <Target className="w-4 h-4" />
            <span>{selectedPDVsForObjective.length} PDV{selectedPDVsForObjective.length !== 1 ? 's' : ''}</span>
            <span className="opacity-70 text-xs font-normal">· Objetivo por zona</span>
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

      {activeJobId && activeJobDistId && (
        <ObjetivoCreateProgress
          jobId={activeJobId}
          distId={activeJobDistId}
          onDone={() => {
            setActiveJobId(null);
            void queryClient.invalidateQueries({ queryKey: ['supervision-objetivos'] });
          }}
          onError={() => setActiveJobId(null)}
          onDismiss={() => setActiveJobId(null)}
        />
      )}
    </div>
  );
}
