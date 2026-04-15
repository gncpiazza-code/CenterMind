"use client";

import { UserCog, Wifi, WifiOff, Building2, MapPin } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FuerzaVentasVendedor } from "@/lib/api";

interface VendedorCardProps {
  vendedor: FuerzaVentasVendedor;
  onClick: () => void;
}

export function VendedorCard({ vendedor, onClick }: VendedorCardProps) {
  const initials = vendedor.nombre_erp
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-2xl border p-4 transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5 hover:border-[var(--shelfy-primary)]",
        "flex flex-col gap-3 bg-[var(--shelfy-panel)]"
      )}
      style={{ borderColor: "var(--shelfy-border)" }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar className="size-12 rounded-xl shrink-0">
          {vendedor.foto_url && (
            <AvatarImage src={vendedor.foto_url} alt={vendedor.nombre_erp} className="object-cover" />
          )}
          <AvatarFallback className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-sm font-black">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-bold truncate"
            style={{ color: "var(--shelfy-text)" }}
          >
            {vendedor.nombre_erp}
          </p>
          {vendedor.sucursal_nombre && (
            <p className="text-xs truncate flex items-center gap-1 mt-0.5" style={{ color: "var(--shelfy-muted)" }}>
              <Building2 size={11} className="shrink-0" />
              {vendedor.sucursal_nombre}
            </p>
          )}
          {(vendedor.ciudad || vendedor.localidad) && (
            <p className="text-xs truncate flex items-center gap-1 mt-0.5" style={{ color: "var(--shelfy-muted)" }}>
              <MapPin size={11} className="shrink-0" />
              {[vendedor.localidad, vendedor.ciudad].filter(Boolean).join(", ")}
            </p>
          )}
        </div>

        {/* Estado activo/inactivo */}
        <Badge
          variant={vendedor.activo !== false ? "default" : "secondary"}
          className="shrink-0 text-[10px] font-bold px-2"
        >
          {vendedor.activo !== false ? "Activo" : "Inactivo"}
        </Badge>
      </div>

      {/* Binding Telegram */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold",
          vendedor.tiene_binding
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-amber-50 text-amber-700 border border-amber-200"
        )}
      >
        {vendedor.tiene_binding ? (
          <>
            <Wifi size={12} className="shrink-0" />
            <span>
              Telegram vinculado
              {vendedor.binding_source === "legacy_admin" ? " (Legacy Admin)" : ""}
              {vendedor.binding_source === "fuerza_ventas" ? " (Fuerza de Ventas)" : ""}
            </span>
          </>
        ) : (
          <>
            <WifiOff size={12} className="shrink-0" />
            <span>Sin vincular</span>
          </>
        )}
      </div>

      {/* Edit hint */}
      <div
        className="text-[10px] font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--shelfy-primary)" }}
      >
        <UserCog size={11} />
        <span>Editar perfil</span>
      </div>
    </button>
  );
}
