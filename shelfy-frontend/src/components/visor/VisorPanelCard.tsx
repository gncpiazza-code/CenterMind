"use client";

import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Building2,
  Calendar,
  Globe,
  MapPin,
  Phone,
  Smartphone,
  Store,
  Tag,
  User,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export type VisorPanelAccent = "violet" | "sky" | "amber" | "slate";

const ACCENT_STYLES: Record<
  VisorPanelAccent,
  { border: string; gradient: string; headerBg: string; label: string; chip: string }
> = {
  violet: {
    border: "border-l-violet-500",
    gradient: "from-violet-50/95 to-white dark:from-violet-950/30 dark:to-slate-950/40",
    headerBg: "bg-white/55 dark:bg-slate-900/35",
    label: "text-slate-700 dark:text-slate-300",
    chip: "bg-violet-500/10 text-violet-800 dark:text-violet-300 border-violet-500/25",
  },
  sky: {
    border: "border-l-sky-500",
    gradient: "from-sky-50/95 to-white dark:from-sky-950/25 dark:to-slate-950/40",
    headerBg: "bg-white/55 dark:bg-slate-900/35",
    label: "text-slate-700 dark:text-slate-300",
    chip: "bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/25",
  },
  amber: {
    border: "border-l-amber-500",
    gradient: "from-amber-50/95 to-white dark:from-amber-950/25 dark:to-slate-950/40",
    headerBg: "bg-white/55 dark:bg-slate-900/35",
    label: "text-slate-700 dark:text-slate-300",
    chip: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25",
  },
  slate: {
    border: "border-l-slate-500",
    gradient: "from-slate-50/95 to-white dark:from-slate-900/40 dark:to-slate-950/40",
    headerBg: "bg-white/55 dark:bg-slate-900/35",
    label: "text-slate-700 dark:text-slate-300",
    chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-400/30",
  },
};

interface VisorPanelCardProps {
  title: string;
  icon: LucideIcon;
  accent?: VisorPanelAccent;
  headerRight?: ReactNode;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Estira el cuerpo para igualar altura en filas (eval / observaciones) */
  stretch?: boolean;
  className?: string;
}

export function VisorPanelCard({
  title,
  icon: Icon,
  accent = "violet",
  headerRight,
  headerExtra,
  footer,
  children,
  stretch = false,
  className,
}: VisorPanelCardProps) {
  const a = ACCENT_STYLES[accent];

  return (
    <div
      className={cn(
        "w-full overflow-visible rounded-lg border border-slate-200/90 dark:border-slate-700/80",
        "border-l-[4px] shadow-sm bg-gradient-to-b",
        a.border,
        a.gradient,
        stretch && "h-full min-h-0 flex flex-col",
        className,
      )}
    >
      <div className={cn("shrink-0 border-b border-slate-200/70 dark:border-slate-700/50 px-3 py-2", a.headerBg)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Icon className="w-3.5 h-3.5 shrink-0 text-slate-500" aria-hidden />
            <span className={cn("font-bold uppercase tracking-wider text-[10px]", a.label)}>{title}</span>
          </div>
          {headerRight ? <div className="shrink-0 flex items-center gap-1.5">{headerRight}</div> : null}
        </div>
        {headerExtra ? <div className="mt-2">{headerExtra}</div> : null}
      </div>

      <div className={cn("px-3 py-2", stretch && "flex-1 min-h-0 flex flex-col")}>{children}</div>

      {footer ? (
        <div className="shrink-0 border-t border-slate-200/70 dark:border-slate-700/50 bg-white/40 dark:bg-slate-900/25 px-3 py-2">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/** Lista interna tipo remito (campos apilados con divisores) */
export function VisorPanelFieldList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul
      className={cn(
        "flex flex-col list-none rounded-md border border-slate-200/80 dark:border-slate-700/60",
        "bg-white/70 dark:bg-slate-950/30 overflow-visible divide-y divide-slate-200/70 dark:divide-slate-700/50",
        className,
      )}
    >
      {children}
    </ul>
  );
}

interface VisorPanelFieldProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  valueClassName?: string;
  /** Más legible y menos interlineado (tarjeta Exhibición) */
  density?: "default" | "comfortable";
}

export function VisorPanelGridCell({
  icon: Icon,
  label,
  value,
  className,
  variant = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  className?: string;
  variant?: "default" | "warning";
}) {
  const isWarning = variant === "warning";

  return (
    <div className={cn("flex items-start gap-1.5 min-w-0", className)}>
      <Icon
        className={cn(
          "w-3.5 h-3.5 shrink-0 mt-0.5",
          isWarning ? "text-amber-600 dark:text-amber-400" : "text-slate-500",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider leading-none",
            isWarning ? "text-amber-800 dark:text-amber-300" : "text-slate-500 dark:text-slate-400",
          )}
        >
          {label}
        </p>
        <div
          className={cn(
            "mt-0.5 text-[11px] font-semibold leading-snug break-words",
            isWarning ? "text-amber-900 dark:text-amber-100" : "text-slate-800 dark:text-slate-100",
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export type VisorPanelGridSlot = {
  key: string;
  icon: LucideIcon;
  label: string;
  value?: ReactNode;
  variant?: "default" | "warning";
};

/** Grilla 2×2 compacta (mismo estilo en Exhibición y PDV) */
export function VisorPanelCompactGrid({ slots, className }: { slots: VisorPanelGridSlot[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-2.5 min-w-0", className)}>
      {slots.map((slot) => (
        <VisorPanelGridCell
          key={slot.key}
          icon={slot.icon}
          label={slot.label}
          value={slot.value ?? "—"}
          variant={slot.variant}
        />
      ))}
    </div>
  );
}

export function VisorPanelExhibicionGrid({
  vendedor,
  sucursal,
  tipoPdv,
  envio,
}: {
  vendedor: ReactNode;
  sucursal: ReactNode;
  tipoPdv: ReactNode;
  envio: ReactNode;
}) {
  return (
    <li className="px-2.5 py-2">
      <VisorPanelCompactGrid
        slots={[
          { key: "vend", icon: User, label: "Vendedor ERP", value: vendedor },
          { key: "suc", icon: Store, label: "Sucursal", value: sucursal },
          { key: "tipo", icon: Tag, label: "Tipo PDV", value: tipoPdv },
          { key: "env", icon: Calendar, label: "Envío", value: envio },
        ]}
      />
    </li>
  );
}

/** Teléfono y celular en fila horizontal; aviso si no hay ninguno en padrón */
export function VisorPanelContactFields({
  telefono,
  celular,
  embedded = false,
}: {
  telefono?: string | null;
  celular?: string | null;
  /** Dentro de VisorPanelFieldList (<li>); false = bloque debajo de la lista */
  embedded?: boolean;
}) {
  const tel = telefono?.trim();
  const cel = celular?.trim();

  const wrapClass = embedded ? "px-2.5 py-2" : "mt-2";

  if (!tel && !cel) {
    const banner = (
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border border-amber-300/80 bg-amber-50/95 px-2.5 py-2.5",
          "dark:border-amber-700/60 dark:bg-amber-950/40",
        )}
        role="status"
      >
        <AlertTriangle
          className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 leading-tight">
            Sin contacto
          </p>
          <p className="mt-1 text-[11px] font-semibold text-amber-900 dark:text-amber-100 leading-relaxed break-words">
            No hay teléfono ni celular registrados en el padrón
          </p>
        </div>
      </div>
    );
    if (embedded) return <li className={wrapClass}>{banner}</li>;
    return <div className={wrapClass}>{banner}</div>;
  }

  const phones = (
    <div
      className={cn(
        "grid gap-x-3 gap-y-2 min-w-0",
        tel && cel ? "grid-cols-2" : "grid-cols-1",
      )}
    >
      {tel ? <VisorPanelGridCell icon={Phone} label="Teléfono" value={tel} /> : null}
      {cel ? <VisorPanelGridCell icon={Smartphone} label="Celular" value={cel} /> : null}
    </div>
  );

  if (embedded) {
    return <li className={wrapClass}>{phones}</li>;
  }

  return <div className={wrapClass}>{phones}</div>;
}

/** 2×2: Domicilio | Celular / Provincia | Localidad */
export function VisorPanelLocationFields({
  domicilio,
  provincia,
  localidad,
  telefono,
  celular,
}: {
  domicilio?: string | null;
  provincia?: string | null;
  localidad?: string | null;
  telefono?: string | null;
  celular?: string | null;
}) {
  const calle = domicilio?.trim();
  const prov = provincia?.trim();
  const loc = localidad?.trim();
  const tel = telefono?.trim();
  const cel = celular?.trim();

  if (!calle && !prov && !loc && !tel && !cel) return null;

  const contactLabel = cel ? "Celular" : tel ? "Teléfono" : "Celular";
  const contactValue = cel || tel;
  const contactIcon = cel ? Smartphone : tel ? Phone : Smartphone;

  const slots: VisorPanelGridSlot[] = [
    { key: "dom", icon: MapPin, label: "Domicilio", value: calle || "—" },
    contactValue
      ? { key: "contact", icon: contactIcon, label: contactLabel, value: contactValue }
      : {
          key: "contact",
          icon: AlertTriangle,
          label: "Sin contacto",
          value: "Sin tel. en padrón",
          variant: "warning",
        },
    { key: "prov", icon: Globe, label: "Provincia", value: prov || "—" },
    { key: "loc", icon: Building2, label: "Localidad", value: loc || "—" },
  ];

  return (
    <li className="px-2.5 py-2">
      <VisorPanelCompactGrid slots={slots} />
    </li>
  );
}

export function VisorPanelField({
  label,
  value,
  icon: Icon,
  valueClassName,
  density = "default",
}: VisorPanelFieldProps) {
  const comfortable = density === "comfortable";

  return (
    <li className={cn("px-2.5", comfortable ? "py-1.5" : "py-2")}>
      <div className="flex items-start gap-2">
        {Icon ? (
          <Icon
            className={cn("w-3.5 h-3.5 shrink-0 text-slate-500", comfortable ? "mt-0" : "mt-0.5")}
            aria-hidden
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-none">
            {label}
          </p>
          <div
            className={cn(
              "font-semibold text-slate-800 dark:text-slate-100 break-words",
              comfortable
                ? "mt-0 text-[12px] leading-tight"
                : "mt-0.5 text-[11px] leading-snug",
              valueClassName,
            )}
          >
            {value}
          </div>
        </div>
      </div>
    </li>
  );
}

export function visorPanelChipClass(accent: VisorPanelAccent): string {
  return ACCENT_STYLES[accent].chip;
}
