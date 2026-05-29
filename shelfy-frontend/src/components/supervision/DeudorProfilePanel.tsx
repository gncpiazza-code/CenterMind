"use client";

import { DeudorComprobantesList } from "./DeudorComprobantesList";
import { DeudorMapaEstatico } from "./DeudorMapaEstatico";
import { useDeudorDetalleQuery } from "@/hooks/useSupervisionQueries";
import {
  User, Phone, Smartphone, MapPin, Calendar, Hash,
  CreditCard, Loader2, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { rangoBadgeClass, formatRangoBadgeLabel } from "@/lib/cuentasCorrientes";

function fmt$$(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

function InfoRow({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) return null;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Icon size={12} className="text-muted-foreground shrink-0" />
      <span className="text-[10px] text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium truncate">{value}</span>
    </div>
  );
}

interface DeudorProfilePanelProps {
  distId: number;
  idClienteErp: string | null;
  className?: string;
}

export function DeudorProfilePanel({ distId, idClienteErp, className }: DeudorProfilePanelProps) {
  const { data, isLoading, isFetching, error } = useDeudorDetalleQuery(distId, idClienteErp);
  const showLoading = isLoading && !data;

  return (
    <Card className={cn("flex flex-col h-full rounded-2xl shadow-sm border overflow-hidden", className)}>
      <CardHeader className="pb-3 pt-4 px-5 shrink-0">
        <div className="flex items-center gap-2">
          <User size={15} className="text-blue-500" />
          <CardTitle className="text-sm font-bold">Seguimiento de deudores</CardTitle>
        </div>
      </CardHeader>
      <Separator />

      <CardContent className="p-0 flex flex-col flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {!idClienteErp ? (
          <EmptyState />
        ) : showLoading ? (
          <LoadingState />
        ) : error && !data ? (
          <ErrorState />
        ) : data ? (
          <ProfileContent data={data} fetching={isFetching && !!idClienteErp} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-14 gap-3 text-center px-6 min-h-0">
      <div className="size-12 rounded-2xl bg-blue-500/8 flex items-center justify-center">
        <User size={22} className="text-blue-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Seleccioná un cliente</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Hacé click en un deudor de la tabla izquierda para ver su perfil completo
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Cargando perfil…</p>
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full rounded" />
      ))}
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 px-4 text-center">
      <AlertCircle size={20} className="text-rose-500" />
      <p className="text-xs text-muted-foreground">No se pudo cargar el perfil del deudor</p>
    </div>
  );
}

function ProfileContent({
  data,
  fetching,
}: {
  data: import("@/lib/api").DeudorDetalle;
  fetching?: boolean;
}) {
  const { perfil, deuda } = data;

  return (
    <div className="flex flex-col min-h-0 pb-4">
      {fetching && (
        <div className="px-4 py-1 bg-muted/40 border-b text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Loader2 size={10} className="animate-spin" />
          Actualizando…
        </div>
      )}
      {/* ── Cabecera compacta ── */}
      <div className="px-4 py-2.5 bg-muted/25 border-b shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground leading-tight truncate">
              {perfil.nombre_fantasia || "—"}
            </p>
            {perfil.razon_social && perfil.razon_social !== perfil.nombre_fantasia && (
              <p className="text-[11px] text-muted-foreground truncate">{perfil.razon_social}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-black font-mono text-rose-600 leading-tight">
              {fmt$$(deuda.total_deuda)}
            </p>
            {deuda.rango_antiguedad && (
              <span
                className={`inline-flex items-center text-[9px] px-1.5 py-0.5 rounded border font-semibold mt-0.5 ${rangoBadgeClass(deuda.rango_antiguedad)}`}
              >
                {formatRangoBadgeLabel(deuda.rango_antiguedad)}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[11px]">
          <InfoRow icon={Hash} label="ERP" value={perfil.id_cliente_erp} />
          <InfoRow icon={Phone} label="Tel" value={perfil.telefono} />
          <InfoRow icon={Smartphone} label="Cel" value={perfil.celular} />
          <InfoRow icon={Calendar} label="Visita" value={perfil.dia_visita} />
          {(perfil.ruta_numero || perfil.ruta_nombre) && (
            <InfoRow
              icon={Hash}
              label="Ruta"
              value={
                perfil.ruta_numero
                  ? `${perfil.ruta_numero}${perfil.ruta_nombre && perfil.ruta_nombre !== perfil.ruta_numero ? ` · ${perfil.ruta_nombre}` : ""}`
                  : perfil.ruta_nombre
              }
            />
          )}
        </div>

        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/40 text-[11px]">
          <span>
            <span className="text-muted-foreground">Antig. </span>
            <span className="font-bold tabular-nums">{deuda.antiguedad_dias}d</span>
          </span>
          <span>
            <span className="text-muted-foreground">Cbtes. </span>
            <span className="font-bold tabular-nums">{deuda.cantidad_comprobantes}</span>
          </span>
          {perfil.domicilio && (
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={perfil.domicilio}>
              <MapPin size={10} className="inline mr-0.5 -mt-px" />
              {perfil.domicilio}
            </span>
          )}
        </div>
      </div>

      {/* ── Comprobantes ── */}
      <div className="px-4 pt-2.5 pb-2 shrink-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
          <CreditCard size={10} />
          Comprobantes de deuda
        </p>
        <DeudorComprobantesList
          deuda={data.deuda}
          estado={data.estado}
          confianza={data.confianza}
          comprobantes={data.comprobantes}
        />
      </div>

      {/* ── Mapa compacto ── */}
      <div className="px-4 pt-1 shrink-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
          <MapPin size={10} />
          Ubicación
        </p>
        <DeudorMapaEstatico
          latitud={perfil.latitud}
          longitud={perfil.longitud}
          domicilio={perfil.domicilio}
        />
      </div>
    </div>
  );
}
