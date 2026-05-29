"use client";

import React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface DashboardThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
  className?: string;
}

export function DashboardThemeToggle({
  isDark,
  onToggle,
  className,
}: DashboardThemeToggleProps) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onToggle}
      title={isDark ? "Modo claro" : "Modo oscuro"}
      aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
      className={cn(
        "h-8 w-8 rounded-xl transition-all",
        isDark
          ? "border-slate-600 text-amber-300 hover:text-amber-200 hover:bg-slate-800 hover:border-slate-500"
          : "border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50",
        className,
      )}
    >
      {isDark ? <Sun size={14} /> : <Moon size={14} />}
    </Button>
  );
}
