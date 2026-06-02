"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatGaleriaMesLabel } from "@/lib/galeria-month";
import { cn } from "@/lib/utils";

interface GaleriaMesSelectProps {
  meses: string[];
  value: string;
  onChange: (mes: string) => void;
  loading?: boolean;
  className?: string;
  placeholder?: string;
}

export function GaleriaMesSelect({
  meses,
  value,
  onChange,
  loading,
  className,
  placeholder = "Mes…",
}: GaleriaMesSelectProps) {
  const disabled = loading || meses.length === 0;
  const safeValue = value && meses.includes(value) ? value : meses[0] ?? "";

  return (
    <Select
      value={safeValue || undefined}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className={cn("h-8 w-[168px] text-xs", className)}>
        <SelectValue placeholder={loading ? "Cargando…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {meses.map((mes) => (
          <SelectItem key={mes} value={mes}>
            {formatGaleriaMesLabel(mes)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
