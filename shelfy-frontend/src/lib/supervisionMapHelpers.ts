/**
 * Mapa supervisión: última compra operativa = **Informe de Ventas** (nomcli = padrón)
 * y, si no hay venta válida, **fecha_ultima_compra del padrón** (API ya devuelve la mezcla).
 * Comparaciones de “últimos 30 días” usan días calendario locales (es-AR).
 */

/** Primera aparición de YYYY-MM-DD en string API/Postgres. */
export function normalizeFechaPadrón(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmY = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*$/.exec(s);
  if (dmY) {
    const d = parseInt(dmY[1], 10);
    const mo = parseInt(dmY[2], 10);
    const y = parseInt(dmY[3], 10);
    if (y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const n = normalizeFechaPadrón(ymd);
  if (!n) return null;
  const p = n.split("-");
  if (p.length !== 3) return null;
  const y = parseInt(p[0], 10);
  const m = parseInt(p[1], 10);
  const d = parseInt(p[2], 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m, d };
}

/** Días calendario entre la fecha de compra (padrón) y hoy (hora local). */
export function diasCalendarioDesdeFechaCompra(fecha: string | null | undefined): number | null {
  const ymd = parseYmd(fecha ?? "");
  if (!ymd) return null;
  const t0 = new Date(ymd.y, ymd.m - 1, ymd.d);
  const now = new Date();
  const t1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((t1.getTime() - t0.getTime()) / 86_400_000);
}

/**
 * Inactivo en mapa (sin compra en últimos 30 días según padrón), o sin fecha.
 */
export function isInactivo30(fecha: string | null): boolean {
  const n = normalizeFechaPadrón(fecha);
  if (!n) return true;
  const dias = diasCalendarioDesdeFechaCompra(n);
  if (dias === null) return true;
  return dias > 30;
}
