import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SavedReport {
  distId: number;
  nombreEmpresa: string;
  periodo: string;
  html: string;
  generadoEn: string; // ISO timestamp
}

interface ReportStore {
  savedReport: SavedReport | null;
  generating: boolean;
  sizeWarning: boolean;
  setGenerating: (v: boolean) => void;
  saveReport: (report: SavedReport) => void;
  clearReport: () => void;
  clearSizeWarning: () => void;
}

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2MB

export const useReportStore = create<ReportStore>()(
  persist(
    (set) => ({
      savedReport: null,
      generating: false,
      sizeWarning: false,

      setGenerating: (v) => set({ generating: v }),

      saveReport: (report) => {
        const byteSize = new Blob([report.html]).size;
        if (byteSize > MAX_HTML_BYTES) {
          set({ sizeWarning: true });
          return;
        }
        set({ savedReport: report, sizeWarning: false });
      },

      clearReport: () => set({ savedReport: null }),
      clearSizeWarning: () => set({ sizeWarning: false }),
    }),
    {
      name: "shelfy-report-store",
      // Only persist the savedReport, not transient state
      partialize: (state) => ({ savedReport: state.savedReport }),
    }
  )
);
