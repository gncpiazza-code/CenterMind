"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings2, X, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  TOPBAR_BRAND_DEFAULTS,
  type TopbarBrandSizes,
} from "@/hooks/useTopbarBrandSizes";
import { toast } from "sonner";

type Props = {
  sizes: TopbarBrandSizes;
  onChange: (patch: Partial<TopbarBrandSizes>) => void;
  onReset: () => void;
};

function snippet(s: TopbarBrandSizes) {
  return `iconPx: ${s.iconPx}, wordmarkPx: ${s.wordmarkPx}, gapPx: ${s.gapPx}`;
}

export function TopbarBrandTuner({ sizes, onChange, onReset }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const copyValues = () => {
    void navigator.clipboard.writeText(snippet(sizes));
    toast.success("Valores copiados — pasámelos para fijar en código");
  };

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="fixed bottom-4 left-4 z-[9999] flex items-center gap-2 rounded-full border border-violet-300 bg-violet-950 px-3 py-2 text-xs font-medium text-violet-100 shadow-lg hover:bg-violet-900"
        title="Ajustar logo topbar (Ctrl+Shift+B)"
      >
        <Settings2 className="size-4" />
        Brand
      </button>

      {open && (
        <div className="fixed bottom-16 left-4 z-[9999] w-72 rounded-xl border border-violet-300/40 bg-violet-950 p-4 text-violet-50 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Topbar — ícono y letra</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 hover:bg-violet-800"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </button>
          </div>

          <label className="mb-3 block text-xs">
            <span className="mb-1 flex justify-between text-violet-200">
              Ícono <strong>{sizes.iconPx}px</strong>
            </span>
            <input
              type="range"
              min={20}
              max={64}
              step={1}
              value={sizes.iconPx}
              onChange={(e) => onChange({ iconPx: Number(e.target.value) })}
              className="w-full accent-violet-400"
            />
          </label>

          <label className="mb-3 block text-xs">
            <span className="mb-1 flex justify-between text-violet-200">
              Letra SHELFY <strong>{sizes.wordmarkPx}px</strong>
            </span>
            <input
              type="range"
              min={12}
              max={48}
              step={1}
              value={sizes.wordmarkPx}
              onChange={(e) => onChange({ wordmarkPx: Number(e.target.value) })}
              className="w-full accent-violet-400"
            />
          </label>

          <label className="mb-4 block text-xs">
            <span className="mb-1 flex justify-between text-violet-200">
              Separación <strong>{sizes.gapPx}px</strong>
            </span>
            <input
              type="range"
              min={0}
              max={32}
              step={1}
              value={sizes.gapPx}
              onChange={(e) => onChange({ gapPx: Number(e.target.value) })}
              className="w-full accent-violet-400"
            />
          </label>

          <p className="mb-3 text-[10px] leading-snug text-violet-300/90">
            Default = proporción de LOGO_NUEVO a h-12. Persiste en localStorage.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 text-xs"
              onClick={copyValues}
            >
              <Copy className="size-3.5 mr-1" />
              Copiar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 text-xs"
              onClick={onReset}
            >
              <RotateCcw className="size-3.5 mr-1" />
              Defaults prod
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
