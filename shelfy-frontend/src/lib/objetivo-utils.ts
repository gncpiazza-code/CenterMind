import type { Objetivo } from "@/lib/api";

/**
 * Detecta si la descripción de un objetivo es el payload crudo generado
 * por el bot de Telegram. En ese caso el modal no la renderiza directamente.
 */
export function isTelegramObjectiveMessage(desc: string | null | undefined): boolean {
  if (!desc) return false;
  return desc.startsWith("🚀") || desc.includes("¡Nuevo objetivo asignado");
}

export interface DiaHabil {
  date: Date;
  iso: string; // YYYY-MM-DD
  isPast: boolean;
  isToday: boolean;
  isFuture: boolean;
  /** true cuando el día es anterior al inicio real del objetivo (pre-inicio) */
  isPreStart: boolean;
}

export interface PeriodoProrrateo {
  /** Primer día del período (inclusive) — puede ser inicio de mes o fecha_inicio */
  start: Date;
  /** Último día del período (inclusive) — fin de mes o fecha_objetivo */
  end: Date;
  /** Días que cuentan hacia la meta (desde startEffective) */
  diasValidos: DiaHabil[];
  /** Todos los días del rango start→end (para grid del calendario) */
  todosDias: DiaHabil[];
  /** Primer día a partir del cual empieza la meta real */
  startEffective: Date;
  today: Date;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function parseLocalDate(iso: string): Date {
  return new Date(iso.substring(0, 10) + "T00:00:00");
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** Lunes=1 … Sábado=6; Domingo=0 → excluido */
function isBusinessDay(d: Date): boolean {
  const wd = d.getDay();
  return wd >= 1 && wd <= 6;
}

function todayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Calcula el período de prorrateo para mostrar en el calendario.
 *
 * Compañía: mes_referencia; lun–sáb del mes completo.
 *   - Exhibición/compradores: retroactividad desde día 1 del mes.
 *   - Alteo/activación: sin retro; meta arranca desde created_at o fecha_objetivo.
 *
 * Distribuidora: sin retroactividad; rango max(fecha_inicio, lanzado_at|created_at) → fecha_objetivo.
 */
export function periodoProrrateo(obj: Objetivo): PeriodoProrrateo | null {
  const today = todayLocal();

  if (obj.origen === "compania") {
    if (!obj.mes_referencia || !obj.valor_objetivo) return null;
    const mesRef = parseLocalDate(`${obj.mes_referencia}-01`);
    if (isNaN(mesRef.getTime())) return null;

    const start = monthStart(mesRef);
    const end = monthEnd(mesRef);

    const isNoRetro =
      obj.tipo === "ruteo_alteo" || obj.tipo === "conversion_estado";

    let startEffective: Date;
    if (isNoRetro) {
      const srcStr = obj.created_at || obj.fecha_objetivo || obj.mes_referencia;
      startEffective = srcStr
        ? parseLocalDate(srcStr)
        : start;
      // No puede ser antes del inicio del mes
      if (startEffective < start) startEffective = start;
    } else {
      startEffective = start;
    }

    return buildPeriod(start, end, startEffective, today);
  }

  // Distribuidora
  if (!obj.fecha_objetivo) return null;

  const fechaFin = parseLocalDate(obj.fecha_objetivo);
  if (isNaN(fechaFin.getTime())) return null;

  // startEffective = max(fecha_inicio, lanzado_at, created_at)
  const candidatos: Date[] = [];
  if (obj.fecha_inicio) {
    const d = parseLocalDate(obj.fecha_inicio);
    if (!isNaN(d.getTime())) candidatos.push(d);
  }
  if (obj.lanzado_at) {
    const d = parseLocalDate(obj.lanzado_at);
    if (!isNaN(d.getTime())) candidatos.push(d);
  }
  if (obj.created_at) {
    const d = parseLocalDate(obj.created_at);
    if (!isNaN(d.getTime())) candidatos.push(d);
  }

  const startEffective =
    candidatos.length > 0
      ? candidatos.reduce((a, b) => (a > b ? a : b))
      : fechaFin;

  // Grid: desde startEffective hasta fechaFin (sin pre-inicio)
  return buildPeriod(startEffective, fechaFin, startEffective, today);
}

function buildPeriod(
  start: Date,
  end: Date,
  startEffective: Date,
  today: Date
): PeriodoProrrateo {
  const todosDias: DiaHabil[] = [];
  const diasValidos: DiaHabil[] = [];

  let cur = new Date(start);
  while (cur <= end) {
    if (isBusinessDay(cur)) {
      const iso = isoDate(cur);
      const isPreStart = cur < startEffective;
      const isPast = cur <= today;
      const isToday = isoDate(cur) === isoDate(today);
      const isFuture = cur > today;
      const dia: DiaHabil = {
        date: new Date(cur),
        iso,
        isPast,
        isToday,
        isFuture,
        isPreStart,
      };
      todosDias.push(dia);
      if (!isPreStart) diasValidos.push(dia);
    }
    cur = addDays(cur, 1);
  }

  return { start, end, startEffective, diasValidos, todosDias, today };
}
