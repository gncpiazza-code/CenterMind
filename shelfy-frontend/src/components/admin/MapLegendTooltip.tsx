"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

export function MapLegendTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        className="rounded-full w-8 h-8 text-xs font-bold bg-[var(--shelfy-surface)] border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:border-[var(--shelfy-accent)]/50 shadow-md"
        title="Cómo leer el mapa"
      >
        ?
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[340px] sm:w-[400px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Cómo leer el mapa</SheetTitle>
            <SheetDescription>Guía de formas, bordes y estadísticas</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-5">
            {/* Section 1: Pin shapes */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Formas de pin</h3>
              <div className="space-y-2">
                {[
                  { symbol: '★', label: 'Activo + fotografiado', desc: 'PDV activo con foto en los últimos 30 días', color: '#22c55e' },
                  { symbol: '$', label: 'Activo sin foto', desc: 'PDV activo pero sin exhibición reciente', color: '#3b82f6' },
                  { symbol: '?', label: 'Inactivo + fotografiado', desc: 'Sin compras en 30d pero con foto reciente', color: '#f59e0b' },
                  { symbol: '✕', label: 'Inactivo sin foto', desc: 'Sin compras ni foto reciente', color: '#ef4444' },
                ].map(({ symbol, label, desc, color }) => (
                  <div key={symbol} className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: color }}
                    >
                      {symbol}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            {/* Section 2: Border colors */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Color del borde</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full border-[3px] border-[#f97316] bg-muted/30 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold">Naranja</p>
                    <p className="text-[11px] text-muted-foreground">Dado de alta en el padrón hace menos de 7 días</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full border-[3px] border-[#38bdf8] bg-muted/30 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold">Celeste</p>
                    <p className="text-[11px] text-muted-foreground">Dado de alta entre 7 y 30 días atrás</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full border-[3px] border-border bg-muted/30 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold">Sin borde especial</p>
                    <p className="text-[11px] text-muted-foreground">Alta hace más de 30 días</p>
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Section 3: Vendor stats */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Números del vendedor</h3>
              <div className="space-y-2 text-[12px]">
                <p><span className="font-semibold">N PDVs totales</span> — puntos de venta asignados en el padrón (excluye anulados).</p>
                <p><span className="font-semibold">N rutas</span> — cantidad de rutas activas del vendedor.</p>
                <p><span className="font-semibold text-orange-400">N nuevos (últ. 7d)</span> — PDVs dados de alta en el padrón en los últimos 7 días.</p>
                <p><span className="font-semibold">N activos</span> — PDVs con al menos una compra en los últimos 30 días.</p>
                <p><span className="font-semibold text-emerald-400">N activ. semana</span> — de los activos, cuántos compraron por primera vez esta semana.</p>
                <p><span className="font-semibold text-violet-400">N exhibidos</span> — PDVs únicos con foto aprobada en los últimos 30 días.</p>
                <p><span className="font-semibold text-sky-400">N 1ª vez</span> — PDVs que recibieron su primera foto histórica en los últimos 7 días.</p>
              </div>
            </section>

            <Separator />

            {/* Section 4: Data latency */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Latencia de datos</h3>
              <p className="text-[12px] text-muted-foreground">
                Los datos del padrón se actualizan <strong>una vez por día</strong> a las 07:00 (hora Argentina).
                Las cuentas corrientes se actualizan tres veces al día (07:00, 14:30 y 20:00).
                Las exhibiciones son en tiempo real.
              </p>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
