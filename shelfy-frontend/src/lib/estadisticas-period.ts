// Month label: "2026-03" → "Marzo 2026"
const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function mesLabel(mes: string): string {
  const [year, month] = mes.split('-');
  const idx = parseInt(month, 10) - 1;
  return `${MESES_ES[idx] ?? mes} ${year}`;
}

export function mesLabelCorto(mes: string): string {
  const [year, month] = mes.split('-');
  const idx = parseInt(month, 10) - 1;
  const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${nombres[idx] ?? mes} ${year.slice(2)}`;
}

export function rangoLabel(meses: string[]): string {
  if (!meses.length) return '';
  const sorted = [...meses].sort();
  if (sorted.length === 1) {
    return mesLabel(sorted[0]);
  }
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  // "01/03/26 – 31/05/26"
  const [fy, fm] = from.split('-');
  const [ty, tm] = to.split('-');
  // last day of last month
  const lastDay = new Date(parseInt(ty), parseInt(tm), 0).getDate();
  return `01/${fm}/${fy.slice(2)} – ${String(lastDay).padStart(2, '0')}/${tm}/${ty.slice(2)}`;
}

export function mesActual(): string {
  // Use AR timezone (UTC-3)
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function sortMeses(meses: string[]): string[] {
  return [...meses].sort();
}
