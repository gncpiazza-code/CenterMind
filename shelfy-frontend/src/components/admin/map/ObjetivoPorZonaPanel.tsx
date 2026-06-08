"use client";

/**
 * Panel flotante de objetivos por zona — wrapper semántico sobre el menú de objetivos.
 * TabSupervision renderiza el formulario completo como children cuando mapToolMode === 'objetivo_zona'.
 */
interface ObjetivoPorZonaPanelProps {
  open: boolean;
  pdvCount: number;
  onClose: () => void;
  children: React.ReactNode;
}

export function ObjetivoPorZonaPanel({ open, pdvCount, onClose, children }: ObjetivoPorZonaPanelProps) {
  if (!open) return null;

  return (
    <div
      className="w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-white/90 dark:bg-[#1a1a2e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col min-h-0"
      style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.22), 0 0 0 0.5px rgba(255,255,255,0.12)" }}
    >
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/8 dark:border-white/10 bg-gradient-to-r from-[var(--shelfy-accent)]/10 to-violet-500/5">
            <div>
              <p className="text-sm font-bold text-[var(--shelfy-text)] leading-none">Objetivo por zona</p>
              <p className="text-[10px] text-[var(--shelfy-muted)] mt-0.5">
                {pdvCount} PDV{pdvCount !== 1 ? "s" : ""} en polígono
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)]"
            >
              Cerrar
            </button>
          </div>
          {children}
    </div>
  );
}
