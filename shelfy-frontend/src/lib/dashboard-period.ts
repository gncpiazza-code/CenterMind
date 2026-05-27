/**
 * Utilidades de período para el dashboard.
 * Maneja los presets Hoy | Semana | Mes | Mes-custom con TZ Argentina (UTC-3).
 */

export type PeriodPreset = "hoy" | "semana" | "mes" | "mes-custom";

export interface PeriodBounds {
  start: Date;
  end: Date;
  /** Hint visible: DD/MM/AA - DD/MM/AA (o solo DD/MM/AA si es un día) */
  hint: string;
  /** Valor enviado al backend como query param `periodo` */
  apiPeriodo: string;
}

const AR_OFFSET_HOURS = -3;

function arNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utcMs + AR_OFFSET_HOURS * 3_600_000);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDate(d: Date): string {
  const day = pad2(d.getDate());
  const mon = pad2(d.getMonth() + 1);
  const yr  = String(d.getFullYear()).slice(-2);
  return `${day}/${mon}/${yr}`;
}

export function formatDateRangeAR(start: Date, end: Date): string {
  if (start.toDateString() === end.toDateString()) return fmtDate(start);
  return `${fmtDate(start)} - ${fmtDate(end)}`;
}

export function resolvePeriodBounds(
  preset: PeriodPreset,
  year?: number,
  month?: number,
): PeriodBounds {
  const ar  = arNow();
  const arY = ar.getFullYear();
  const arM = ar.getMonth();   // 0-indexed
  const arD = ar.getDate();

  if (preset === "hoy") {
    const start = new Date(arY, arM, arD);
    const end   = new Date(arY, arM, arD + 1);
    return { start, end, hint: fmtDate(start), apiPeriodo: "hoy" };
  }

  if (preset === "semana") {
    const dow = ar.getDay(); // 0=sun … 6=sat
    const daysFromMon = dow === 0 ? 6 : dow - 1;
    const start = new Date(arY, arM, arD - daysFromMon);
    const end   = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    return {
      start,
      end,
      hint: formatDateRangeAR(start, lastDay),
      apiPeriodo: "semana",
    };
  }

  if (preset === "mes") {
    const start   = new Date(arY, arM, 1);
    const end     = new Date(arY, arM + 1, 1);
    const lastDay = new Date(arY, arM + 1, 0);
    return {
      start,
      end,
      hint: formatDateRangeAR(start, lastDay),
      apiPeriodo: "mes",
    };
  }

  // mes-custom
  const y = year  ?? arY;
  const m = (month ?? (arM + 1)) - 1; // convert to 0-indexed
  const start   = new Date(y, m, 1);
  const end     = new Date(y, m + 1, 1);
  const lastDay = new Date(y, m + 1, 0);
  return {
    start,
    end,
    hint: formatDateRangeAR(start, lastDay),
    apiPeriodo: `${y}-${pad2(m + 1)}`,
  };
}

export const PERIOD_PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "hoy",    label: "Hoy"    },
  { key: "semana", label: "Semana" },
  { key: "mes",    label: "Mes"    },
];
