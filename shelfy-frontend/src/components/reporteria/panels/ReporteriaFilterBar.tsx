"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/Button";

export interface FilterDef {
  key: string;
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minWidth?: string;
}

interface Props {
  filters: FilterDef[];
  onClear?: () => void;
  className?: string;
}

export function ReporteriaFilterBar({ filters, onClear, className }: Props) {
  const hasActive = filters.some((f) => f.value !== "");

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {filters.map((f) => (
        <div key={f.key} className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-[var(--shelfy-muted)] shrink-0">
            {f.label}:
          </span>
          <Select
            value={f.value || "__all__"}
            onValueChange={(v) => f.onChange(v === "__all__" ? "" : v)}
          >
            <SelectTrigger
              className={cn(
                "h-7 text-xs rounded-lg border-[var(--shelfy-border)]",
                f.minWidth ?? "min-w-[130px]"
              )}
            >
              <SelectValue placeholder={f.placeholder ?? "Todos"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      {hasActive && onClear && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-7 px-2 text-xs text-[var(--shelfy-muted)] rounded-lg hover:text-red-500"
        >
          <X size={11} className="mr-1" />
          Limpiar
        </Button>
      )}
    </div>
  );
}
