"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings2, RotateCcw, Copy, ChevronDown, ChevronUp } from "lucide-react";
import {
  VENDOR_DETALLE_LAYOUT_DEFAULTS,
  VENDOR_DETALLE_TUNING_SLIDERS,
  VENDOR_DETALLE_TUNING_TOGGLES,
  loadVendorDetalleLayoutTuning,
  saveVendorDetalleLayoutTuning,
  type VendorDetalleLayoutTuning,
} from "@/lib/vendor-detalle-layout-tuning";

interface Props {
  tuning: VendorDetalleLayoutTuning;
  onChange: (next: VendorDetalleLayoutTuning) => void;
  onClose: () => void;
}

export function VendorDetalleLayoutTuner({ tuning, onChange, onClose }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const reset = useCallback(() => {
    const next = { ...VENDOR_DETALLE_LAYOUT_DEFAULTS };
    onChange(next);
    saveVendorDetalleLayoutTuning(next);
  }, [onChange]);

  const patch = useCallback(
    (partial: Partial<VendorDetalleLayoutTuning>) => {
      const next = { ...tuning, ...partial };
      onChange(next);
      saveVendorDetalleLayoutTuning(next);
    },
    [onChange, tuning],
  );

  const copyJson = useCallback(async () => {
    await navigator.clipboard.writeText(JSON.stringify(tuning, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [tuning]);

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div
      className="vendor-detalle-layout-tuner"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="vendor-detalle-layout-tuner__header">
        <div className="vendor-detalle-layout-tuner__title">
          <Settings2 size={14} />
          Layout tuner (dev)
        </div>
        <div className="vendor-detalle-layout-tuner__actions">
          <button type="button" onClick={copyJson} title="Copiar JSON">
            <Copy size={13} />
            {copied ? "OK" : "JSON"}
          </button>
          <button type="button" onClick={reset} title="Reset defaults">
            <RotateCcw size={13} />
          </button>
          <button type="button" onClick={() => setCollapsed((v) => !v)} title="Colapsar">
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button type="button" onClick={onClose} title="Ocultar">
            ×
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="vendor-detalle-layout-tuner__body">
          {VENDOR_DETALLE_TUNING_SLIDERS.map(({ key, label, min, max, step, unit }) => {
            const val = tuning[key] as number;
            return (
              <label key={key} className="vendor-detalle-layout-tuner__row">
                <span className="vendor-detalle-layout-tuner__label">
                  {label}
                  <em>
                    {typeof val === "number" ? (Number.isInteger(val) ? val : val.toFixed(2)) : val}
                    {unit ?? ""}
                  </em>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={val}
                  onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<VendorDetalleLayoutTuning>)}
                />
              </label>
            );
          })}

          <div className="vendor-detalle-layout-tuner__toggles">
            {VENDOR_DETALLE_TUNING_TOGGLES.map(({ key, label }) => (
              <label key={key} className="vendor-detalle-layout-tuner__toggle">
                <input
                  type="checkbox"
                  checked={Boolean(tuning[key])}
                  onChange={(e) => patch({ [key]: e.target.checked } as Partial<VendorDetalleLayoutTuning>)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Botón flotante para reabrir el tuner si se cerró */
export function VendorDetalleLayoutTunerFab({
  visible,
  onOpen,
}: {
  visible: boolean;
  onOpen: () => void;
}) {
  if (process.env.NODE_ENV !== "development" || !visible) return null;
  return (
    <button
      type="button"
      className="vendor-detalle-layout-tuner-fab"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title="Abrir layout tuner"
    >
      <Settings2 size={16} />
    </button>
  );
}

export function useVendorDetalleLayoutTuning() {
  const [tuning, setTuning] = useState<VendorDetalleLayoutTuning>(VENDOR_DETALLE_LAYOUT_DEFAULTS);
  const [tunerOpen, setTunerOpen] = useState(true);

  useEffect(() => {
    setTuning(loadVendorDetalleLayoutTuning());
  }, []);

  return { tuning, setTuning, tunerOpen, setTunerOpen };
}
