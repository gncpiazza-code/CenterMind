import type { AvanceDeltaKpi, AvanceVentasModo } from "@/lib/api";

/** Formato es-AR para bultos (2 dec. si tiene fracción) y unidades (enteros). */
export function fmtBultos(n: number): string {
  const v = Number(n ?? 0);
  const hasFraction = Math.abs(v % 1) > 0.005;
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
}

export function fmtUnidades(n: number): string {
  return Math.round(Number(n ?? 0)).toLocaleString("es-AR");
}

export function fmtEntero(n: number): string {
  return Math.round(Number(n ?? 0)).toLocaleString("es-AR");
}

/** "+12,5% (ant. 80)" / "Sin dato" para deltas WoW/MoM. */
export function fmtDelta(delta: AvanceDeltaKpi | null | undefined): string {
  if (!delta || !delta.disponible) return "Sin dato";
  if (delta.pct == null) {
    const sign = delta.diff > 0 ? "+" : "";
    return `${sign}${fmtBultos(delta.diff)}`;
  }
  const sign = delta.pct > 0 ? "+" : "";
  return `${sign}${delta.pct.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

function unidadesPorBultoFactor(kind: string | null | undefined): number | null {
  if (kind === "cig_papelillo") return 100;
  if (kind === "cig_mix_exhib") return 25;
  if (kind === "cig_default") return 250;
  return null;
}

/** Desglose desde unidades ERP (misma regla que `bultos_desglose_from_unidades` en BE). */
function desgloseFromUnidades(
  unidades: number,
  factor: number,
): { enteros: number; resto: number } {
  const u = Number(unidades) || 0;
  if (Math.abs(u) < 0.005) return { enteros: 0, resto: 0 };
  const f = Math.max(1, Math.round(factor));
  const sign = u < 0 ? -1 : 1;
  const uAbs = Math.abs(u);
  let enteros = Math.floor(uAbs / f);
  let resto = Math.round(uAbs - enteros * f);
  if (resto >= f) {
    enteros += Math.floor(resto / f);
    resto = resto % f;
  }
  return { enteros: sign * enteros, resto };
}

function fmtDesgloseBultosUnidades(enteros: number, resto: number): { primary: string; secondary: string | null } {
  const btoLabel = Math.abs(enteros) === 1 ? "bto" : "btos";
  return {
    primary: `${fmtEntero(enteros)} ${btoLabel}`,
    secondary: resto > 0 ? `+ ${fmtUnidades(resto)} u` : null,
  };
}

/**
 * Celda de volumen según modo (R2).
 * - `bultos`: solo bultos netos (decimal si aplica).
 * - `desglose`: una sola celda — bultos enteros + unidades RESTO (no el total ERP).
 */
export function fmtVolumenCell(
  row: {
    bultos: number;
    unidades: number;
    volumen_kind?: string | null;
    bultos_enteros?: number;
    unidades_resto?: number;
  },
  modo: "bultos" | "desglose",
): { primary: string; secondary: string | null } {
  if (modo === "bultos") return { primary: fmtBultos(row.bultos), secondary: null };

  const factor = unidadesPorBultoFactor(row.volumen_kind);
  if (factor != null && Math.abs(row.unidades) > 0.005) {
    const { enteros, resto } = desgloseFromUnidades(row.unidades, factor);
    return fmtDesgloseBultosUnidades(enteros, resto);
  }

  if (row.volumen_kind === "encendedor_raw" && Math.abs(row.bultos) > 0.005) {
    const qty = Math.abs(row.unidades) > 0.005 ? row.unidades : row.bultos;
    const n = Math.round(Math.abs(qty));
    const sign = qty < 0 ? -1 : 1;
    return { primary: `${fmtEntero(sign * n)} u`, secondary: null };
  }

  if (row.bultos_enteros != null && row.unidades_resto != null) {
    return fmtDesgloseBultosUnidades(row.bultos_enteros, row.unidades_resto);
  }

  return { primary: fmtBultos(row.bultos), secondary: null };
}

export type DeltaDir = "up" | "down" | "flat";

export function deltaDir(delta: AvanceDeltaKpi | null | undefined): DeltaDir {
  if (!delta || !delta.disponible || Math.abs(delta.diff) < 0.005) return "flat";
  return delta.diff > 0 ? "up" : "down";
}

/** Etiqueta de la referencia según modo: WoW/MoM en día; vs anterior en semana/mes. */
export function deltaRefLabel(modo: AvanceVentasModo, kind: "wow" | "mom"): string {
  if (modo === "semana") return "vs sem. ant.";
  if (modo === "mes") return "vs mes ant.";
  return kind === "wow" ? "vs sem. pasada" : "vs mes pasado";
}

export function todayIsoAr(): string {
  // Calendario AR (UTC-3) sin depender del TZ del navegador.
  const now = new Date();
  const ar = new Date(now.getTime() + (now.getTimezoneOffset() - 180) * 60_000);
  return ar.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Lunes de la semana que contiene la fecha (lun–sáb AR). */
export function mondayOfWeek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = (date.getUTCDay() + 6) % 7; // lun=0 … dom=6
  return addDaysIso(iso, -weekday);
}

export interface SemanaOption {
  /** Lunes (ancla que viaja al backend) */
  value: string;
  label: string;
  parcial: boolean;
}

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function diaMes(iso: string): { d: number; m: number; y: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { d, m, y };
}

/** Últimas N semanas lun–sáb (incluida la semana en curso, marcada parcial). */
export function buildSemanaOptions(n = 12, hoy = todayIsoAr()): SemanaOption[] {
  const out: SemanaOption[] = [];
  let lunes = mondayOfWeek(hoy);
  for (let i = 0; i < n; i++) {
    const sabado = addDaysIso(lunes, 5);
    const a = diaMes(lunes);
    const b = diaMes(sabado);
    const label =
      a.m === b.m
        ? `${a.d}–${b.d} ${MESES_CORTOS[b.m - 1]} ${b.y}`
        : `${a.d} ${MESES_CORTOS[a.m - 1]} – ${b.d} ${MESES_CORTOS[b.m - 1]} ${b.y}`;
    out.push({ value: lunes, label, parcial: sabado >= hoy && lunes <= hoy });
    lunes = addDaysIso(lunes, -7);
  }
  return out;
}

export interface MesOption {
  /** Primer día del mes (ancla backend) */
  value: string;
  label: string;
  parcial: boolean;
}

const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Últimos N meses calendario (incluido el mes en curso, marcado parcial). */
export function buildMesOptions(n = 12, hoy = todayIsoAr()): MesOption[] {
  const out: MesOption[] = [];
  let [y, m] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))];
  for (let i = 0; i < n; i++) {
    const value = `${y}-${String(m).padStart(2, "0")}-01`;
    out.push({
      value,
      label: `${MESES_LARGOS[m - 1]} ${y}`,
      parcial: value.slice(0, 7) === hoy.slice(0, 7),
    });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/** "HH:MM" hora AR de un ISO timestamp (para banner parcial). */
export function fmtHoraAr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
