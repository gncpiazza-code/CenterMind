"use client";

import { useState } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { mesLabel, mesLabelCorto, rangoLabel } from "@/lib/estadisticas-period";
import { useEstadisticasStore } from "@/store/useEstadisticasStore";

interface PeriodSelectorProps {
  mesesDisponibles: string[];
  isLoading?: boolean;
}

export function PeriodSelector({ mesesDisponibles, isLoading = false }: PeriodSelectorProps) {
  const [open, setOpen] = useState(false);
  const { mesesSeleccionados, toggleMes, setMesesSeleccionados } = useEstadisticasStore();

  const sorted = [...mesesSeleccionados].sort();
  const triggerLabel =
    sorted.length === 0
      ? "Seleccionar período"
      : sorted.length === 1
      ? mesLabelCorto(sorted[0])
      : `${mesLabelCorto(sorted[0])} – ${mesLabelCorto(sorted[sorted.length - 1])}`;

  const rangoText = sorted.length > 0 ? rangoLabel(sorted) : null;

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 10,
          background: "rgba(168,85,247,0.06)",
          border: "1px solid rgba(168,85,247,0.18)",
        }}
      >
        <Calendar size={14} color="#a855f7" />
        <span style={{ fontSize: 12, color: "var(--shelfy-muted)", fontWeight: 600 }}>
          Cargando períodos…
        </span>
      </div>
    );
  }

  if (!mesesDisponibles.length) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 10,
          background: "rgba(100,116,139,0.08)",
          border: "1px solid rgba(100,116,139,0.15)",
        }}
      >
        <Calendar size={14} color="var(--shelfy-muted)" />
        <span style={{ fontSize: 12, color: "var(--shelfy-muted)" }}>Sin datos disponibles</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid rgba(168,85,247,0.25)",
              background: mesesSeleccionados.length > 0
                ? "rgba(168,85,247,0.08)"
                : "white",
              cursor: "pointer",
              transition: "all 0.16s ease",
              minWidth: 180,
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Calendar size={14} color="#a855f7" />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: mesesSeleccionados.length > 0 ? "#7C3AED" : "var(--shelfy-muted)",
                }}
              >
                {triggerLabel}
              </span>
            </div>
            <ChevronDown
              size={14}
              color="var(--shelfy-muted)"
              style={{
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.18s ease",
              }}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          style={{
            padding: 12,
            borderRadius: 14,
            border: "1px solid rgba(168,85,247,0.15)",
            background: "white",
            boxShadow: "0 8px 32px rgba(168,85,247,0.12), 0 2px 8px rgba(0,0,0,0.08)",
            width: 240,
          }}
          align="start"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--shelfy-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Período
            </span>
            {mesesSeleccionados.length > 0 && (
              <button
                onClick={() => setMesesSeleccionados([])}
                style={{
                  fontSize: 11, fontWeight: 600, color: "#a855f7",
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 3,
                }}
              >
                <X size={11} />
                Limpiar
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {mesesDisponibles.map((mes) => {
              const selected = mesesSeleccionados.includes(mes);
              return (
                <button
                  key={mes}
                  onClick={() => toggleMes(mes)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: `1px solid ${selected ? "rgba(168,85,247,0.3)" : "transparent"}`,
                    background: selected ? "rgba(168,85,247,0.08)" : "transparent",
                    cursor: "pointer",
                    transition: "all 0.14s ease",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  {/* Checkbox */}
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      border: `2px solid ${selected ? "#a855f7" : "rgba(100,116,139,0.4)"}`,
                      background: selected ? "#a855f7" : "transparent",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.14s ease",
                    }}
                  >
                    {selected && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: selected ? 700 : 500,
                      color: selected ? "#7C3AED" : "var(--shelfy-text)",
                    }}
                  >
                    {mesLabel(mes)}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Range label below trigger */}
      {rangoText && (
        <p
          style={{
            fontSize: 11,
            color: "var(--shelfy-muted)",
            margin: 0,
            paddingLeft: 2,
          }}
        >
          {rangoText}
        </p>
      )}
    </div>
  );
}
