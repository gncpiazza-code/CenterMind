"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCountUp } from "./useCountUp";

const COLOR_MAP = {
  violet:  { bg: "bg-violet-500/8",  icon: "text-violet-600",  border: "border-violet-200/60" },
  emerald: { bg: "bg-emerald-500/8", icon: "text-emerald-600", border: "border-emerald-200/60" },
  amber:   { bg: "bg-amber-500/8",   icon: "text-amber-600",   border: "border-amber-200/60" },
  rose:    { bg: "bg-rose-500/8",    icon: "text-rose-600",    border: "border-rose-200/60" },
  blue:    { bg: "bg-blue-500/8",    icon: "text-blue-600",    border: "border-blue-200/60" },
} as const;

interface AnimatedKpiCardProps {
  label: string;
  value: number;
  formatter?: (n: number) => string;
  subtext?: string;
  icon: React.ElementType;
  color: keyof typeof COLOR_MAP;
  loading?: boolean;
  delay?: number;
}

export function AnimatedKpiCard({
  label,
  value,
  formatter = (n) => n.toLocaleString("es-AR"),
  subtext,
  icon: Icon,
  color,
  loading = false,
  delay = 0,
}: AnimatedKpiCardProps) {
  const animated = useCountUp(value);
  const { bg, icon: iconColor, border } = COLOR_MAP[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className={`border ${border} bg-card`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate">
                {label}
              </p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-24 rounded" />
              ) : (
                <p className="mt-1 text-2xl font-black text-foreground tracking-tight leading-none tabular-nums">
                  {formatter(animated)}
                </p>
              )}
              {subtext && !loading && (
                <p className="mt-1 text-[10px] text-muted-foreground">{subtext}</p>
              )}
            </div>
            <div className={`shrink-0 size-9 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon size={17} className={iconColor} strokeWidth={2} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
