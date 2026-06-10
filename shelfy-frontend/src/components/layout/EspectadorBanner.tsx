"use client";

import { Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/** Barra fija bajo el topbar cuando el usuario es espectador (demo sin escritura). */
export function EspectadorBanner() {
  const { isReadOnly } = useAuth();
  if (!isReadOnly) return null;

  return (
    <div
      className="shrink-0 z-40 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold border-b"
      style={{
        background: "linear-gradient(90deg, rgba(245,158,11,0.12), rgba(168,85,247,0.08))",
        borderColor: "rgba(245,158,11,0.35)",
        color: "var(--shelfy-text)",
      }}
    >
      <Eye className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden />
      <span>
        Modo demostración — podés explorar todo, pero los cambios{" "}
        <strong className="font-bold text-amber-700">no se guardan</strong>.
      </span>
    </div>
  );
}
