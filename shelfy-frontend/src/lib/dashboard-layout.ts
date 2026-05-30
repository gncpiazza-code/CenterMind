export type DashboardLayoutConfig = {
  /** Altura fija de la banda de KPIs (px) */
  kpiHeightPx: number;
  /** Ancho del carrusel hero en desktop (% del row) */
  heroWidthPercent: number;
};

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutConfig = {
  kpiHeightPx: 136,
  heroWidthPercent: 35,
};

const STORAGE_KEY = "shelfy-dashboard-layout-v2";

export function loadDashboardLayout(): DashboardLayoutConfig {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_LAYOUT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DASHBOARD_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<DashboardLayoutConfig>;
    return {
      kpiHeightPx: clampNum(parsed.kpiHeightPx, 72, 200, DEFAULT_DASHBOARD_LAYOUT.kpiHeightPx),
      heroWidthPercent: clampNum(parsed.heroWidthPercent, 22, 55, DEFAULT_DASHBOARD_LAYOUT.heroWidthPercent),
    };
  } catch {
    return DEFAULT_DASHBOARD_LAYOUT;
  }
}

export function saveDashboardLayout(config: DashboardLayoutConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
