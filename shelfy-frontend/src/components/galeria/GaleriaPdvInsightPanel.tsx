"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  Receipt,
  Route,
  Phone,
  Loader2,
  TrendingUp,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetchGaleriaPdvInsight } from "@/lib/api";
import { galeriaKeys } from "@/lib/galeria-queries";
import { listComprasMesRemitos, listComprobantesDeuda } from "@/lib/galeria-pdv-insights";
import { formatFechaDiaAR, formatGaleriaFechaVisita } from "@/lib/fecha-ar";
import { BultosCantidadText } from "@/components/shared/BultosCantidadText";
import { GaleriaComprasRemitosList } from "./GaleriaComprasRemitosList";
import type { GaleriaPublicacion } from "@/lib/galeria-publicaciones";

interface GaleriaPdvInsightPanelProps {
  distId: number;
  idClienteErp?: string | null;
  nombreCliente: string;
  currentPub: GaleriaPublicacion | null;
  fechaDesde?: string;
  fechaHasta?: string;
  mesLabel?: string;
  totalVisitas: number;
  className?: string;
}

const ESTADO_COLOR: Record<string, string> = {
  Aprobada: "bg-green-500/20 text-green-200 border-green-500/40",
  Aprobado: "bg-green-500/20 text-green-200 border-green-500/40",
  Rechazada: "bg-red-500/20 text-red-200 border-red-500/40",
  Rechazado: "bg-red-500/20 text-red-200 border-red-500/40",
  Destacada: "bg-amber-500/20 text-amber-100 border-amber-500/40",
  Destacado: "bg-amber-500/20 text-amber-100 border-amber-500/40",
  Pendiente: "bg-white/10 text-white/80 border-white/20",
};

function formatMoney(n: number): string {
  if (!n) return "$0";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDiaVisita(dia: string | null | undefined): string {
  if (!dia?.trim()) return "Sin día de visita";
  const d = dia.trim();
  if (/^\d+$/.test(d)) return `Día ${d}`;
  return d;
}

function formatDeudaAntiguedad(dias: number): string {
  if (dias <= 0) return "Sin registro de días en deuda";
  return `Este cliente debe hace ${dias} día${dias !== 1 ? "s" : ""}`;
}

export function GaleriaPdvInsightPanel({
  distId,
  idClienteErp,
  nombreCliente,
  currentPub,
  fechaDesde = "",
  fechaHasta = "",
  mesLabel,
  totalVisitas,
  className,
}: GaleriaPdvInsightPanelProps) {
  const erp = idClienteErp?.trim() ?? "";

  const { data: detalle, isLoading, isError } = useQuery({
    queryKey: galeriaKeys.pdvDetalle(distId, erp, fechaDesde, fechaHasta),
    queryFn: () =>
      fetchGaleriaPdvInsight(distId, erp, {
        desde: fechaDesde,
        hasta: fechaHasta,
      }),
    enabled: Boolean(erp) && distId > 0 && Boolean(fechaDesde && fechaHasta),
    staleTime: 120_000,
  });

  const comprasMes = useMemo(
    () => listComprasMesRemitos(detalle, fechaDesde, fechaHasta),
    [detalle, fechaDesde, fechaHasta],
  );

  const comprobantesDeuda = useMemo(() => listComprobantesDeuda(detalle), [detalle]);

  const perfil = detalle?.perfil;
  const deuda = detalle?.deuda;
  const tieneDeuda = Boolean(deuda && deuda.total_deuda > 0);
  const activeFoto = currentPub?.fotos[0];
  const visitaFecha = currentPub
    ? formatGaleriaFechaVisita(currentPub.dia_ar, activeFoto?.timestamp_subida)
    : null;
  const ultimaCompraFueraMes =
    perfil?.fecha_ultima_compra &&
    (comprasMes.comprobantesEnMes === 0 ||
      !comprasMes.remitos.some((r) => r.fecha === perfil.fecha_ultima_compra?.slice(0, 10)));

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-y-auto text-white",
        className,
      )}
    >
      <div className="p-5 space-y-4 pt-14 md:pt-5">
        <div>
          <p className="text-white/45 text-[10px] font-semibold uppercase tracking-widest mb-0.5">
            PDV
          </p>
          <p className="text-white font-bold text-lg leading-snug">{nombreCliente}</p>
          {erp && (
            <p className="text-white/50 text-[11px] mt-0.5 font-mono">ERP {erp}</p>
          )}
        </div>

        {perfil?.dia_visita && (
          <div className="flex items-center gap-2.5 rounded-xl bg-sky-500/15 border border-sky-400/30 px-3.5 py-2.5">
            <CalendarDays size={18} className="text-sky-300 shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-200/80">
                Día de visita
              </p>
              <p className="text-sm font-bold text-white">
                {formatDiaVisita(perfil.dia_visita)}
                {perfil.ruta_nombre ? ` · ${perfil.ruta_nombre}` : ""}
              </p>
            </div>
          </div>
        )}

        {currentPub && (
          <div className="flex flex-wrap gap-2">
            <Badge
              className={cn(
                "text-[11px] font-bold border",
                ESTADO_COLOR[currentPub.estado_dia] ?? ESTADO_COLOR.Pendiente,
              )}
            >
              {currentPub.estado_dia}
            </Badge>
            <span className="text-white/60 text-xs self-center">
              {visitaFecha?.fecha ?? "—"}
              {visitaFecha?.relativo ? ` · ${visitaFecha.relativo}` : ""} · {currentPub.total_fotos}{" "}
              foto{currentPub.total_fotos !== 1 ? "s" : ""}
              {currentPub.total_fotos !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {erp && isLoading && (
          <Skeleton className="h-20 w-full bg-white/10 rounded-xl" />
        )}

        {erp && !isLoading && tieneDeuda && deuda && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-400/35 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-300 shrink-0" />
              <p className="text-[11px] font-bold uppercase tracking-wide text-rose-200">
                Deuda activa
              </p>
            </div>
            <p className="text-2xl font-black text-white tabular-nums">
              {formatMoney(deuda.total_deuda)}
            </p>
            <p className="text-xs text-rose-100/90">
              {formatDeudaAntiguedad(deuda.antiguedad_dias)}
              {deuda.rango_antiguedad ? ` · ${deuda.rango_antiguedad}` : ""}
            </p>
            {deuda.cantidad_comprobantes > 0 && (
              <p className="text-[10px] text-white/55">
                {deuda.cantidad_comprobantes} comprobante
                {deuda.cantidad_comprobantes !== 1 ? "s" : ""} en deuda
              </p>
            )}
            {deuda.desglose_antiguedad?.length > 0 && (
              <ul className="space-y-1 pt-1 border-t border-rose-400/20">
                {deuda.desglose_antiguedad.map((row) => (
                  <li
                    key={row.rango}
                    className="flex justify-between text-[11px] text-white/80"
                  >
                    <span>{row.rango}</span>
                    <span className="font-semibold tabular-nums">{formatMoney(row.monto)}</span>
                  </li>
                ))}
              </ul>
            )}
            {comprobantesDeuda.length > 0 ? (
              <div className="max-h-40 overflow-y-auto pt-1">
                <GaleriaComprasRemitosList remitos={comprobantesDeuda} />
              </div>
            ) : detalle?.comprobantes_adeuda_resumen ? (
              <p className="text-[10px] text-white/50 italic leading-snug">
                {detalle.comprobantes_adeuda_resumen}
              </p>
            ) : deuda.cantidad_comprobantes > 0 ? (
              <p className="text-[10px] text-white/45">
                Detalle de comprobantes no disponible (CC reporta {deuda.cantidad_comprobantes}).
              </p>
            ) : null}
          </div>
        )}

        {erp && !isLoading && deuda && !tieneDeuda && (
          <p className="text-xs text-emerald-300/90 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3 py-2">
            Sin deuda registrada en cuentas corrientes.
          </p>
        )}

        {perfil && (
          <div className="space-y-2 rounded-xl bg-white/5 border border-white/10 p-3">
            {perfil.domicilio && (
              <div className="flex items-start gap-2 text-xs text-white/75">
                <MapPin size={13} className="shrink-0 mt-0.5 text-rose-300" />
                <span>{perfil.domicilio}</span>
              </div>
            )}
            {(perfil.telefono || perfil.celular) && (
              <div className="flex items-center gap-2 text-xs text-white/75">
                <Phone size={13} className="shrink-0 text-white/50" />
                <span>{[perfil.telefono, perfil.celular].filter(Boolean).join(" · ")}</span>
              </div>
            )}
            {(perfil.ruta_nombre || perfil.dia_visita) && !perfil.dia_visita && (
              <div className="flex items-center gap-2 text-xs text-white/75">
                <Route size={13} className="shrink-0 text-white/50" />
                <span>{perfil.ruta_nombre}</span>
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-300" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">
              Compras {mesLabel ? `· ${mesLabel}` : "del mes"}
            </p>
          </div>

          {!erp ? (
            <p className="text-xs text-white/50">Sin código ERP — no hay detalle de ventas.</p>
          ) : isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full bg-white/10" />
              <Skeleton className="h-4 w-2/3 bg-white/10" />
            </div>
          ) : isError ? (
            <p className="text-xs text-rose-300/90">No se pudo cargar el detalle comercial.</p>
          ) : comprasMes.comprobantesEnMes === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-white/50">
                Sin compras registradas en ventas para este mes.
              </p>
              {perfil?.fecha_ultima_compra && (
                <p className="text-xs text-white/70 rounded-lg bg-black/25 px-2.5 py-2">
                  Última compra registrada:{" "}
                  <span className="font-semibold text-white">
                    {formatFechaDiaAR(perfil.fecha_ultima_compra)}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <>
              {perfil?.fecha_ultima_compra && (
                <p className="text-[11px] text-white/65 flex items-center gap-1.5">
                  <Receipt size={12} className="text-emerald-300/80 shrink-0" />
                  Última compra:{" "}
                  <span className="font-semibold text-white">
                    {formatFechaDiaAR(perfil.fecha_ultima_compra)}
                  </span>
                  {ultimaCompraFueraMes && (
                    <span className="text-white/40 text-[10px]">(fuera del mes filtrado)</span>
                  )}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-black/30 px-2.5 py-2">
                  <p className="text-white/45 text-[10px]">Total período</p>
                  <BultosCantidadText
                    bultos={comprasMes.totalBultos}
                    className="items-start font-bold text-white text-sm"
                    secondaryClassName="text-white/55"
                  />
                </div>
                <div className="rounded-lg bg-black/30 px-2.5 py-2">
                  <p className="text-white/45 text-[10px]">Importe</p>
                  <p className="font-bold text-white">{formatMoney(comprasMes.totalImporte)}</p>
                </div>
              </div>
              <p className="text-[10px] text-white/45">
                {comprasMes.comprobantesEnMes} remito
                {comprasMes.comprobantesEnMes !== 1 ? "s" : ""} en el mes · tocá para ver artículos
              </p>
              <div className="max-h-56 overflow-y-auto">
                <GaleriaComprasRemitosList remitos={comprasMes.remitos} />
              </div>
            </>
          )}
        </div>

        {totalVisitas > 1 && (
          <p className="text-[10px] text-white/40 text-center">
            {totalVisitas} visitas con exhibición en el período
          </p>
        )}

        {activeFoto?.supervisor && (
          <div>
            <p className="text-white/45 text-[10px] font-semibold uppercase tracking-widest mb-0.5">
              Supervisor
            </p>
            <p className="text-white/80 text-sm">{activeFoto.supervisor}</p>
          </div>
        )}
        {activeFoto?.comentario && (
          <div>
            <p className="text-white/45 text-[10px] font-semibold uppercase tracking-widest mb-0.5">
              Comentario
            </p>
            <p className="text-white/70 text-sm italic">&ldquo;{activeFoto.comentario}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  );
}
