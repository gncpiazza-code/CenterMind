"use client";

import { useRef, useState } from "react";
import { ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  onConfirm: () => void;
  disabled?: boolean;
}

export function SlideToConfirm({
  label = "Deslizá para confirmar",
  onConfirm,
  disabled = false,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const isDragging = useRef(false);
  const startX = useRef(0);

  const THUMB_W = 48;

  function getTrackWidth() {
    return (trackRef.current?.clientWidth ?? 260) - THUMB_W;
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled || confirmed) return;
    isDragging.current = true;
    startX.current = e.clientX - offset;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging.current) return;
    const raw = e.clientX - startX.current;
    const max = getTrackWidth();
    setOffset(Math.max(0, Math.min(raw, max)));
  }

  function handlePointerUp() {
    if (!isDragging.current) return;
    isDragging.current = false;
    const max = getTrackWidth();
    if (offset >= max * 0.85) {
      setOffset(max);
      setConfirmed(true);
      onConfirm();
    } else {
      setOffset(0);
    }
  }

  const progress = getTrackWidth() > 0 ? offset / getTrackWidth() : 0;

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-12 rounded-full overflow-hidden select-none",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      )}
      style={{ background: "var(--shelfy-border)" }}
    >
      {/* Fill track */}
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-colors"
        style={{
          width: `${THUMB_W + offset}px`,
          background: confirmed
            ? "var(--shelfy-success, #22c55e)"
            : `color-mix(in srgb, var(--shelfy-primary) ${Math.round(progress * 100)}%, transparent)`,
          opacity: 0.25 + progress * 0.75,
        }}
      />

      {/* Label */}
      <span
        className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold pointer-events-none"
        style={{
          color: "var(--shelfy-muted)",
          opacity: confirmed ? 0 : Math.max(0, 1 - progress * 2),
        }}
      >
        {label}
      </span>

      {/* Thumb */}
      <div
        className={cn(
          "absolute top-1 bottom-1 flex items-center justify-center rounded-full shadow-md transition-colors",
          confirmed ? "bg-green-500" : "bg-white",
        )}
        style={{
          width: THUMB_W - 8,
          left: `${offset + 4}px`,
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {confirmed ? (
          <Check size={18} className="text-white" />
        ) : (
          <ChevronRight size={18} style={{ color: "var(--shelfy-primary)" }} />
        )}
      </div>
    </div>
  );
}
