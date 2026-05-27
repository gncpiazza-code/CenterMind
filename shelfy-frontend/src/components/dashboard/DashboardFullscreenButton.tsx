"use client";

import React, { useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface DashboardFullscreenButtonProps {
  isImmersive: boolean;
  onToggle: () => void;
  className?: string;
}

export function DashboardFullscreenButton({
  isImmersive,
  onToggle,
  className,
}: DashboardFullscreenButtonProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isImmersive) onToggle();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isImmersive, onToggle]);

  function handleClick() {
    if (!isImmersive) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    }
    onToggle();
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleClick}
      title={isImmersive ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
      className={cn(
        "h-8 w-8 rounded-xl border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all",
        isImmersive && "bg-slate-900 text-white border-slate-900 hover:bg-slate-800 hover:text-white",
        className,
      )}
    >
      {isImmersive ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
    </Button>
  );
}
