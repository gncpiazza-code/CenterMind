export interface VendorDetalleLayoutTuning {
  shellMaxWidth: number;
  shellMaxHeightVh: number;
  shellMinHeight: number;
  sidebarWidth: number;
  scoreSize: number;
  scoreFontSize: number;
  nameFontSize: number;
  radarMinHeight: number;
  kpisMaxHeight: number;
  contentPadding: number;
  profilePadding: number;
  uiScale: number;
  shellRadius: number;
  showIdealBanner: boolean;
  showKpisBlock: boolean;
  showEvolucionBtn: boolean;
}

export const VENDOR_DETALLE_LAYOUT_DEFAULTS: VendorDetalleLayoutTuning = {
  shellMaxWidth: 1140,
  shellMaxHeightVh: 78,
  shellMinHeight: 530,
  sidebarWidth: 368,
  scoreSize: 54,
  scoreFontSize: 26,
  nameFontSize: 22,
  radarMinHeight: 200,
  kpisMaxHeight: 100,
  contentPadding: 10,
  profilePadding: 16,
  uiScale: 0.82,
  shellRadius: 23,
  showIdealBanner: true,
  showKpisBlock: true,
  showEvolucionBtn: true,
};

const STORAGE_KEY = "vendor-detalle-layout-tuning-v3";

export function loadVendorDetalleLayoutTuning(): VendorDetalleLayoutTuning {
  if (typeof window === "undefined") return { ...VENDOR_DETALLE_LAYOUT_DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...VENDOR_DETALLE_LAYOUT_DEFAULTS };
    return { ...VENDOR_DETALLE_LAYOUT_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...VENDOR_DETALLE_LAYOUT_DEFAULTS };
  }
}

export function saveVendorDetalleLayoutTuning(tuning: VendorDetalleLayoutTuning) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
}

export function tuningToCssVars(t: VendorDetalleLayoutTuning): Record<string, string> {
  return {
    "--vd-shell-max-w": `${t.shellMaxWidth}px`,
    "--vd-shell-max-h": `${t.shellMaxHeightVh}vh`,
    "--vd-shell-min-h": `${t.shellMinHeight}px`,
    "--vd-sidebar-w": `${t.sidebarWidth}px`,
    "--vd-score-size": `${t.scoreSize}px`,
    "--vd-score-font": `${t.scoreFontSize}px`,
    "--vd-name-font": `${t.nameFontSize}px`,
    "--vd-radar-min-h": `${t.radarMinHeight}px`,
    "--vd-kpis-max-h": `${t.kpisMaxHeight}px`,
    "--vd-content-pad": `${t.contentPadding}px`,
    "--vd-profile-pad": `${t.profilePadding}px`,
    "--vd-ui-scale": String(t.uiScale),
    "--vd-shell-radius": `${t.shellRadius}px`,
  };
}

export type TuningSliderDef = {
  key: keyof VendorDetalleLayoutTuning;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

export const VENDOR_DETALLE_TUNING_SLIDERS: TuningSliderDef[] = [
  { key: "shellMaxWidth", label: "Ancho modal", min: 720, max: 1280, step: 10, unit: "px" },
  { key: "shellMaxHeightVh", label: "Alto modal", min: 72, max: 96, step: 1, unit: "vh" },
  { key: "shellMinHeight", label: "Alto mínimo", min: 420, max: 780, step: 10, unit: "px" },
  { key: "sidebarWidth", label: "Ancho sidebar", min: 280, max: 420, step: 4, unit: "px" },
  { key: "scoreSize", label: "Círculo score", min: 44, max: 84, step: 2, unit: "px" },
  { key: "scoreFontSize", label: "Fuente score", min: 16, max: 28, step: 1, unit: "px" },
  { key: "nameFontSize", label: "Fuente nombre", min: 13, max: 22, step: 1, unit: "px" },
  { key: "radarMinHeight", label: "Alto radar mín.", min: 200, max: 420, step: 10, unit: "px" },
  { key: "kpisMaxHeight", label: "Alto bloque KPIs", min: 100, max: 360, step: 10, unit: "px" },
  { key: "contentPadding", label: "Padding contenido", min: 8, max: 28, step: 2, unit: "px" },
  { key: "profilePadding", label: "Padding perfil", min: 8, max: 28, step: 2, unit: "px" },
  { key: "uiScale", label: "Escala UI", min: 0.82, max: 1.15, step: 0.01 },
  { key: "shellRadius", label: "Border radius", min: 10, max: 28, step: 1, unit: "px" },
];

export const VENDOR_DETALLE_TUNING_TOGGLES: {
  key: keyof VendorDetalleLayoutTuning;
  label: string;
}[] = [
  { key: "showIdealBanner", label: "Banner vendedor ideal" },
  { key: "showKpisBlock", label: "Bloque KPIs sidebar" },
  { key: "showEvolucionBtn", label: "Botón evolución" },
];
