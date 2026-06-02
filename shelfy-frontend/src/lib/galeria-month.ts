/** Mes calendario AR en formato YYYY-MM. */
export type GaleriaMes = `${number}-${string}`;

export function currentMonthAR(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

export function galeriaMonthBounds(yyyyMm: string): { desde: string; hasta: string } {
  const [yStr, mStr] = yyyyMm.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const desde = `${yyyyMm}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const hasta = `${yyyyMm}-${String(lastDay).padStart(2, "0")}`;
  return { desde, hasta };
}

export function formatGaleriaMesLabel(yyyyMm: string): string {
  const [yStr, mStr] = yyyyMm.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return yyyyMm;
  const label = new Date(y, m - 1, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Convierte desde/hasta legacy (URL o persist) a YYYY-MM. */
export function mesFromLegacyRange(desde?: string | null, hasta?: string | null): string | null {
  const raw = (desde || hasta || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null;
}
