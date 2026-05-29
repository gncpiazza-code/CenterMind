export type DashboardTheme = "light" | "dark";

const STORAGE_KEY = "shelfy-dashboard-theme";

export function loadDashboardTheme(): DashboardTheme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function saveDashboardTheme(theme: DashboardTheme) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, theme);
}

export function isDashboardDark(theme: DashboardTheme): boolean {
  return theme === "dark";
}
