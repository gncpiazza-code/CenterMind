"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { GLASS_TOKENS, type GlassTokenSet, type GlassVariant } from "./visor-glass-tokens";

/** Valores de producción (clear) — referencia para el panel dev. */
export const GLASS_CLEAR_DEFAULTS = {
  refractBaseOpacity: 0.11,
  tintOpacity: 0.044,
  blurPx: 2,
  lensOpacity: 0.5,
  rimOpacity: 0.05,
  rimTopOpacity: 0.28,
} as const;

export type GlassTuneValues = typeof GLASS_CLEAR_DEFAULTS;

const STORAGE_KEY = "shelfy:visor:glass-tune";

function loadStored(): GlassTuneValues | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...GLASS_CLEAR_DEFAULTS, ...JSON.parse(raw) } as GlassTuneValues;
  } catch {
    return null;
  }
}

export function mergeGlassTokens(
  base: GlassTokenSet,
  tune: GlassTuneValues | null,
): GlassTokenSet {
  if (!tune) return base;
  return {
    ...base,
    blur: `${tune.blurPx}px`,
    tint: `rgba(255,255,255,${tune.tintOpacity})`,
    refractBase: `rgba(255,255,255,${tune.refractBaseOpacity})`,
    rimOpacity: tune.rimOpacity,
    rimTopOpacity: tune.rimTopOpacity,
  };
}

type Ctx = {
  enabled: boolean;
  values: GlassTuneValues;
  setValues: (patch: Partial<GlassTuneValues>) => void;
  reset: () => void;
  lensOpacity: number;
};

const VisorGlassTuneContext = createContext<Ctx | null>(null);

export function VisorGlassTuneProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const [values, setValuesState] = useState<GlassTuneValues>(() => ({
    ...GLASS_CLEAR_DEFAULTS,
    ...loadStored(),
  }));

  useEffect(() => {
    if (!enabled) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  }, [enabled, values]);

  const setValues = useCallback((patch: Partial<GlassTuneValues>) => {
    setValuesState((v) => ({ ...v, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setValuesState({ ...GLASS_CLEAR_DEFAULTS });
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const ctx = useMemo<Ctx>(
    () => ({
      enabled,
      values,
      setValues,
      reset,
      lensOpacity: values.lensOpacity,
    }),
    [enabled, values, setValues, reset],
  );

  return (
    <VisorGlassTuneContext.Provider value={ctx}>
      {children}
    </VisorGlassTuneContext.Provider>
  );
}

export function useVisorGlassTune(): Ctx | null {
  return useContext(VisorGlassTuneContext);
}

export function useGlassTokensForVariant(variant: GlassVariant): GlassTokenSet {
  const tune = useVisorGlassTune();
  const base = GLASS_TOKENS[variant];
  return tune?.enabled ? mergeGlassTokens(base, tune.values) : base;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-semibold text-white/80">
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <span className="font-mono text-emerald-300/90">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet-400"
      />
    </label>
  );
}

/** Panel flotante — solo con VisorGlassTuneProvider enabled. */
export function VisorGlassTunePanel() {
  const tune = useVisorGlassTune();
  const [open, setOpen] = useState(true);

  if (!tune?.enabled) return null;

  const { values, setValues, reset } = tune;

  return (
    <div className="fixed top-14 right-3 z-[200] pointer-events-auto max-w-[240px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-1 rounded-lg border border-violet-400/50 bg-violet-600/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg"
      >
        {open ? "▾ Glass tune" : "▸ Glass tune"}
      </button>
      {open ? (
        <div className="rounded-xl border border-white/15 bg-black/80 backdrop-blur-md p-3 space-y-2.5 shadow-2xl">
          <p className="text-[9px] text-white/45 leading-snug">
            Prod clear: base {GLASS_CLEAR_DEFAULTS.refractBaseOpacity * 100}% · tint{" "}
            {(GLASS_CLEAR_DEFAULTS.tintOpacity * 100).toFixed(1)}% · lens{" "}
            {GLASS_CLEAR_DEFAULTS.lensOpacity * 100}%
          </p>
          <SliderRow
            label="Base frosted (refract)"
            value={values.refractBaseOpacity}
            min={0}
            max={0.35}
            step={0.005}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            onChange={(v) => setValues({ refractBaseOpacity: v })}
          />
          <SliderRow
            label="Tint illuminate"
            value={values.tintOpacity}
            min={0}
            max={0.2}
            step={0.002}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            onChange={(v) => setValues({ tintOpacity: v })}
          />
          <SliderRow
            label="Backdrop blur"
            value={values.blurPx}
            min={0}
            max={28}
            step={1}
            format={(v) => `${v}px`}
            onChange={(v) => setValues({ blurPx: v })}
          />
          <SliderRow
            label="Lens canvas"
            value={values.lensOpacity}
            min={0}
            max={0.5}
            step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => setValues({ lensOpacity: v })}
          />
          <SliderRow
            label="Rim ring"
            value={values.rimOpacity}
            min={0}
            max={0.5}
            step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => setValues({ rimOpacity: v })}
          />
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-lg border border-white/20 py-1.5 text-[10px] font-bold text-white/70 hover:bg-white/10"
          >
            Reset a prod
          </button>
        </div>
      ) : null}
    </div>
  );
}
