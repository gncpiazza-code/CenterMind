import type { RecapPendienteItem } from "./recap-types";

/** Normaliza respuesta legacy (string[]) o nueva ({ periodo_key, id_vendedor }[]). */
export function normalizeRecapPendientes(raw: unknown): RecapPendienteItem[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: RecapPendienteItem[] = [];

  for (const entry of raw) {
    let periodoKey = "";
    let idVendedor = "";

    if (typeof entry === "string") {
      periodoKey = entry.trim();
    } else if (entry && typeof entry === "object") {
      periodoKey = String((entry as RecapPendienteItem).periodo_key ?? "").trim();
      idVendedor = String((entry as RecapPendienteItem).id_vendedor ?? "").trim();
    }

    if (!periodoKey || seen.has(periodoKey)) continue;
    seen.add(periodoKey);
    out.push({ periodo_key: periodoKey, id_vendedor: idVendedor });
  }

  return out;
}

/** YYYY-MM desde periodo_key (ej. 2026-05-Q1 → 2026-05). */
export function mesFromPeriodoKey(periodoKey: string): string {
  const parts = periodoKey.split("-");
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return periodoKey.slice(0, 7);
}

export function formatRecapPeriodo(key: string | undefined | null): string {
  if (!key) return "Repaso";
  const parts = key.split("-");
  if (parts.length < 3) return key;
  const [year, month, tipo] = parts;
  const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const mes = MESES[parseInt(month, 10) - 1] ?? month;
  if (tipo === "Q1") return `1ra quincena ${mes} ${year}`;
  if (tipo === "Q2") return `2da quincena ${mes} ${year}`;
  return `Cierre de mes ${mes} ${year}`;
}

/** Etiqueta legible del período de comparación inmediato anterior. */
export function periodoComparacionLabel(periodoKey: string): string {
  const parts = periodoKey.split("-");
  if (parts.length < 3) return "Período anterior";
  const tipo = parts[2];
  if (tipo === "Q1") return "Quincena anterior";
  if (tipo === "Q2") return "1ra quincena del mes";
  return "2da quincena del mes";
}

/** Mes legible (2026-05 → mayo 2026). */
export function formatMesLabel(mes: string): string {
  const parts = mes.split("-");
  if (parts.length < 2) return mes;
  const [year, month] = parts;
  const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const m = MESES[parseInt(month, 10) - 1] ?? month;
  return `${m} ${year}`;
}

/** Mes de referencia para evolución desde selector de estadísticas. */
export function mesForRecapEvolucion(meses: string[]): string | null {
  if (!meses.length) return null;
  return meses.length === 1 ? meses[0] : meses[meses.length - 1];
}
