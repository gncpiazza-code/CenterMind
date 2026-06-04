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

export interface CeldaProrrateo {
  dia: DiaHabil;
  metaDia: number;
  avanceDia: number;
  pct: number;
  isPastOrToday: boolean;
}

export interface SemanaProrrateo {
  key: string;
  label: string;
  celdas: (CeldaProrrateo | "pre" | null)[];
  weekMeta: number;
  weekAvance: number;
  weekPct: number;
  aplicable: boolean;
}

export interface ProrrateoGridData {
  semanas: SemanaProrrateo[];
  metaDiariaFutura: number;
  restante: number;
  futuros: number;
  diasValidos: number;
  label: string;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function parseLocalDate(iso: string): Date {
  return new Date(iso.substring(0, 10) + "T00:00:00");
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function parseMesReferencia(mesRef: string): Date | null {
  const ym = mesRef.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const d = parseLocalDate(`${ym}-01`);
  return isNaN(d.getTime()) ? null : d;
}

/** Lunes=1 … Sábado=6; Domingo=0 → excluido */
function isBusinessDay(d: Date): boolean {
  const wd = d.getDay();
  return wd >= 1 && wd <= 6;
}

export function todayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Lun=0 … Sáb=5; domingo u otro → -1 */
function columnaDiaHabil(d: Date): number {
  const wd = d.getDay();
  if (wd < 1 || wd > 6) return -1;
  return wd - 1;
}

/** Lunes de la semana calendario (lun–dom) que contiene `d`. */
function lunesDeSemana(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = r.getDay() || 7;
  r.setDate(r.getDate() - (wd - 1));
  return r;
}

function formatDiaCorto(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function labelSemanaCalendario(dias: DiaHabil[]): string {
  const enSemana = dias.filter((d) => isBusinessDay(d.date));
  if (enSemana.length === 0) return "Semana";
  const first = enSemana[0]!.date;
  const last = enSemana[enSemana.length - 1]!.date;
  const a = formatDiaCorto(first);
  const b = formatDiaCorto(last);
  return a === b ? a : `${a} – ${b}`;
}

function inicioEfectivoNoRetro(obj: Objetivo, monthStartDate: Date): Date {
  const src =
    obj.fecha_inicio ||
    obj.lanzado_at ||
    obj.created_at ||
    obj.fecha_objetivo ||
    obj.mes_referencia;
  let startEffective = src ? parseLocalDate(src) : monthStartDate;
  if (startEffective < monthStartDate) startEffective = monthStartDate;
  return startEffective;
}

/**
 * Calcula el período de prorrateo para mostrar en el calendario.
 *
 * Compañía: mes_referencia; lun–sáb del mes completo.
 *   - Exhibición/compradores: retroactividad desde día 1 del mes.
 *   - Alteo/activación: sin retro; meta arranca desde fecha_inicio / lanzado_at.
 *
 * Distribuidora: sin retroactividad; rango max(fecha_inicio, lanzado_at|created_at) → fecha_objetivo.
 */
export function periodoProrrateo(obj: Objetivo): PeriodoProrrateo | null {
  const today = todayLocal();

  if (obj.origen === "compania") {
    if (!obj.mes_referencia || !obj.valor_objetivo) return null;
    const mesRef = parseMesReferencia(obj.mes_referencia);
    if (!mesRef) return null;

    const start = monthStart(mesRef);
    const end = monthEnd(mesRef);

    const isNoRetro =
      obj.tipo === "ruteo_alteo" || obj.tipo === "conversion_estado";

    const startEffective = isNoRetro
      ? inicioEfectivoNoRetro(obj, start)
      : start;

    return buildPeriod(start, end, startEffective, today);
  }

  // Distribuidora
  if (!obj.fecha_objetivo) return null;

  const fechaFin = parseLocalDate(obj.fecha_objetivo);
  if (isNaN(fechaFin.getTime())) return null;

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
  const startEffIso = isoDate(startEffective);

  let cur = new Date(start);
  while (cur <= end) {
    if (isBusinessDay(cur)) {
      const iso = isoDate(cur);
      const isPreStart = iso < startEffIso;
      const isPast = cur < today;
      const isToday = iso === isoDate(today);
      const isFuture = cur > today;
      const dia: DiaHabil = {
        date: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()),
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

function avanceDiaEnCelda(
  dia: DiaHabil,
  hasReal: boolean,
  progresoDiario: Record<string, number>,
  avgPasado: number,
  actual: number,
  pasadosCount: number,
): number {
  if (!dia.isPast && !dia.isToday) return 0;
  if (hasReal) return progresoDiario[dia.iso] ?? 0;
  if (dia.isPast && !dia.isToday) return avgPasado;
  if (dia.isToday && pasadosCount === 0) return actual;
  return progresoDiario[dia.iso] ?? 0;
}

/** Metas diarias: histórico rolling en pasado; plano uniforme en hoy y futuro. */
function computeMetasRolling(
  diasValidos: DiaHabil[],
  meta: number,
  actual: number,
  hasReal: boolean,
  progresoDiario: Record<string, number>,
  avgPasado: number,
): Map<string, { metaDia: number; avanceDia: number }> {
  const out = new Map<string, { metaDia: number; avanceDia: number }>();
  let remaining = meta;

  const pasadosCount = diasValidos.filter((d) => d.isPast && !d.isToday).length;
  const diasRestantesInclHoy = diasValidos.filter(
    (d) => d.isToday || d.isFuture,
  ).length;
  const restante = Math.max(0, meta - actual);
  const metaPlanaRestante =
    restante > 0 && diasRestantesInclHoy > 0
      ? restante / diasRestantesInclHoy
      : 0;

  for (const dia of diasValidos) {
    let metaDia: number;
    if (dia.isFuture || dia.isToday) {
      metaDia =
        dia.isToday && !hasReal && pasadosCount === 0 && diasRestantesInclHoy > 0
          ? meta / diasRestantesInclHoy
          : metaPlanaRestante;
    } else {
      const daysLeft = diasValidos.filter((d) => d.iso >= dia.iso).length;
      metaDia = daysLeft > 0 ? remaining / daysLeft : 0;
    }

    const avanceDia = avanceDiaEnCelda(
      dia,
      hasReal,
      progresoDiario,
      avgPasado,
      actual,
      pasadosCount,
    );
    out.set(dia.iso, { metaDia, avanceDia });

    if (dia.isPast || dia.isToday) {
      remaining = Math.max(0, remaining - avanceDia);
    }
  }

  return out;
}

/**
 * Grilla semanal (lun–sáb) con avance diario para el modal de detalle.
 * Meta diaria: histórico rolling en días pasados; recálculo plano en hoy y futuro.
 */
export function buildProrrateoGrid(
  obj: Objetivo,
  visualActual?: number
): ProrrateoGridData | null {
  const periodo = periodoProrrateo(obj);
  if (!periodo || obj.valor_objetivo == null) return null;

  const meta = Number(obj.valor_objetivo);
  if (!meta || meta <= 0) return null;

  const actual = Math.max(Number(obj.valor_actual ?? 0), visualActual ?? 0);
  const progresoDiario: Record<string, number> =
    (obj.desglose_cache as { progreso_diario?: Record<string, number> })
      ?.progreso_diario ?? {};
  const hasReal = Object.keys(progresoDiario).length > 0;

  const { diasValidos, todosDias } = periodo;
  const pasados = diasValidos.filter((d) => d.isPast && !d.isToday);
  const diasFuturos = diasValidos.filter((d) => d.isFuture);

  const restante = Math.max(0, meta - actual);

  const avgPasado = pasados.length > 0 ? actual / pasados.length : 0;
  const rolling = computeMetasRolling(
    diasValidos,
    meta,
    actual,
    hasReal,
    progresoDiario,
    avgPasado,
  );

  const diasRestantesInclHoy = diasValidos.filter(
    (d) => d.isToday || d.isFuture,
  ).length;
  const metaDiariaFutura =
    restante > 0 && diasRestantesInclHoy > 0
      ? restante / diasRestantesInclHoy
      : diasFuturos[0]
        ? (rolling.get(diasFuturos[0].iso)?.metaDia ?? 0)
        : diasValidos.find((d) => d.isToday)
          ? (rolling.get(diasValidos.find((d) => d.isToday)!.iso)?.metaDia ?? 0)
          : 0;

  const semanasMap = new Map<string, DiaHabil[]>();
  for (const dia of todosDias) {
    const key = isoDate(lunesDeSemana(dia.date));
    if (!semanasMap.has(key)) semanasMap.set(key, []);
    semanasMap.get(key)!.push(dia);
  }

  const semanas: SemanaProrrateo[] = Array.from(semanasMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, dias]) => {
      const celdas: (CeldaProrrateo | "pre" | null)[] = Array(6).fill(null);
      const aplicables = dias.filter((d) => !d.isPreStart);

      for (const dia of dias) {
        const col = columnaDiaHabil(dia.date);
        if (col < 0) continue;

        if (dia.isPreStart) {
          celdas[col] = "pre";
          continue;
        }

        const isPastOrToday = dia.isPast || dia.isToday;
        const cell = rolling.get(dia.iso);
        const metaDia = cell?.metaDia ?? 0;
        const avanceDia = isPastOrToday ? (cell?.avanceDia ?? 0) : 0;
        const pct =
          metaDia > 0
            ? Math.min(100, Math.round((avanceDia / metaDia) * 100))
            : avanceDia > 0
              ? 100
              : 0;

        celdas[col] = { dia, metaDia, avanceDia, pct, isPastOrToday };
      }

      const weekMeta = celdas.reduce(
        (s, c) => s + (c && c !== "pre" ? c.metaDia : 0),
        0
      );
      const weekAvance = celdas.reduce(
        (s, c) => s + (c && c !== "pre" ? c.avanceDia : 0),
        0
      );
      const weekPct =
        weekMeta > 0
          ? Math.min(100, Math.round((weekAvance / weekMeta) * 100))
          : 0;

      return {
        key,
        label: labelSemanaCalendario(dias),
        celdas,
        weekMeta,
        weekAvance,
        weekPct,
        aplicable: aplicables.length > 0,
      };
    });

  return {
    semanas,
    metaDiariaFutura,
    restante,
    futuros: diasFuturos.length,
    diasValidos: diasValidos.length,
    label:
      obj.origen === "compania"
        ? "Prorrateo mensual (lun–sáb)"
        : "Prorrateo por período (lun–sáb)",
  };
}
