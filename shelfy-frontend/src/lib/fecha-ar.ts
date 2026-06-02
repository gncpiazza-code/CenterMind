/**
 * Fechas operativas Shelfy (ERP / ventas / padrón): día calendario en Argentina.
 * `YYYY-MM-DD` sin hora NO debe pasar por `new Date(iso)` (UTC → −1 día en AR).
 */

export const TZ_AR = "America/Argentina/Buenos_Aires";

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Instant representando el día calendario AR (mediodía -03:00). */
export function parseFechaShelf(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const raw = iso.trim();
  if (!raw) return null;

  const dateOnly = raw.match(DATE_ONLY_RE);
  if (dateOnly) {
    return new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T12:00:00-03:00`);
  }

  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : new Date(t);
}

/** `YYYY-MM-DD` del instante en calendario AR. */
export function calendarDayAR(ref: Date = new Date()): string {
  return ref.toLocaleDateString("en-CA", { timeZone: TZ_AR });
}

/** DD/MM/YYYY (es-AR) para fechas de compra / padrón. */
export function formatFechaDiaAR(iso: string | null | undefined): string {
  const d = parseFechaShelf(iso);
  if (!d) return "—";
  try {
    return d.toLocaleDateString("es-AR", {
      timeZone: TZ_AR,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

/** Días calendario entre la fecha (AR) y `ref` (default: hoy AR). */
export function daysSinceFechaAR(
  iso: string | null | undefined,
  ref: Date = new Date(),
): number | null {
  const d = parseFechaShelf(iso);
  if (!d) return null;
  const start = calendarDayAR(d);
  const end = calendarDayAR(ref);
  const [y0, m0, d0] = start.split("-").map(Number);
  const [y1, m1, d1] = end.split("-").map(Number);
  const a = Date.UTC(y0, m0 - 1, d0);
  const b = Date.UTC(y1, m1 - 1, d1);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** "Hace N horas" / "Hace N días" / "Hoy" (calendario AR). */
export function formatFechaRelativaAR(
  iso: string | null | undefined,
  ref: Date = new Date(),
): string {
  const raw = (iso ?? "").trim();
  if (!raw) return "";

  const d = parseFechaShelf(iso);
  if (!d) return "";

  const isDateOnly = DATE_ONLY_RE.test(raw.slice(0, 10));
  if (isDateOnly) {
    const days = daysSinceFechaAR(iso, ref);
    if (days == null) return "";
    if (days === 0) return "Hoy";
    if (days === 1) return "Hace 1 día";
    return `Hace ${days} días`;
  }

  const diffMs = ref.getTime() - d.getTime();
  if (diffMs < 0) return "";

  if (calendarDayAR(d) === calendarDayAR(ref)) {
    const hours = Math.floor(diffMs / 3_600_000);
    if (hours < 1) return "Hace menos de 1 hora";
    if (hours === 1) return "Hace 1 hora";
    return `Hace ${hours} horas`;
  }

  const days = daysSinceFechaAR(iso, ref);
  if (days == null) return "";
  if (days === 0) return "Hoy";
  if (days === 1) return "Hace 1 día";
  return `Hace ${days} días`;
}

/** Fecha de visita galería: DD/MM/AAAA + relativo. */
export function formatGaleriaFechaVisita(
  diaAr: string,
  timestamp?: string | null,
): { fecha: string; relativo: string } {
  const source = timestamp?.trim() ? timestamp : diaAr;
  const fecha = formatFechaDiaAR(source);
  const relativo = formatFechaRelativaAR(source);
  return { fecha, relativo };
}
