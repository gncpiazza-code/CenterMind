"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, FileSpreadsheet, Save, Settings2 } from "lucide-react";
import {
  fetchLiquidacionConfig,
  fetchLiquidacionPreview,
  fetchLiquidacionExportBlob,
  putLiquidacionConfig,
  type LiquidacionTarifaRow,
} from "@/lib/api";
import { formatObjetivoMesLabel } from "@/lib/objetivo-utils";
import { toast } from "sonner";

interface Props {
  distId: number;
  mes: string; // YYYY-MM
}

const TIPO_LABELS: Record<string, string> = {
  exhibicion: "Exhibición",
  ruteo_alteo: "Alteo",
  compradores: "Compradores",
  conversion_estado: "Activación",
};

function formatARS(n: number): string {
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ObjetivoLiquidacionPanel({ distId, mes }: Props) {
  const qc = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);
  const [editedTarifas, setEditedTarifas] = useState<LiquidacionTarifaRow[]>([]);
  const [editedBono, setEditedBono] = useState<number>(0);
  const [exporting, setExporting] = useState(false);

  const configQ = useQuery({
    queryKey: ["liquidacion-config"],
    queryFn: fetchLiquidacionConfig,
  });

  const previewQ = useQuery({
    queryKey: ["liquidacion-preview", distId, mes],
    queryFn: () => fetchLiquidacionPreview(distId, mes),
    enabled: !!distId && !!mes,
  });

  const saveMut = useMutation({
    mutationFn: () => putLiquidacionConfig({ tarifas: editedTarifas, bono_mando_medio: editedBono }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["liquidacion-config"] });
      qc.invalidateQueries({ queryKey: ["liquidacion-preview"] });
      toast.success("Configuración guardada");
      setConfigOpen(false);
    },
    onError: () => toast.error("Error al guardar configuración"),
  });

  const openConfig = () => {
    if (!configQ.data) return;
    setEditedTarifas(configQ.data.tarifas.map(t => ({ ...t })));
    setEditedBono(configQ.data.bono_mando_medio);
    setConfigOpen(true);
  };

  const handleExport = async () => {
    if (!mes) {
      toast.error("Seleccioná un mes para exportar");
      return;
    }
    setExporting(true);
    try {
      const blob = await fetchLiquidacionExportBlob(distId, mes);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `liquidacion_objetivos_${mes}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo exportar la liquidación");
    } finally {
      setExporting(false);
    }
  };

  const preview = previewQ.data;
  const mesLabel = formatObjetivoMesLabel(mes);

  return (
    <>
      <div className="rounded-lg border border-amber-500/30 bg-amber-50/40 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-amber-800 leading-tight">
            Liquidación · {mesLabel}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-xs gap-1.5 border-amber-500/50 text-amber-800 hover:bg-amber-100/80"
            onClick={openConfig}
            disabled={configQ.isLoading || !configQ.data}
          >
            <Settings2 className="w-3.5 h-3.5 shrink-0" />
            Configurar pagos por tipo
          </Button>
          <Button
            type="button"
            size="sm"
            className="w-full text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={handleExport}
            disabled={exporting || !mes}
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            )}
            Exportar XLSX
          </Button>
        </div>

        {previewQ.isLoading && (
          <div className="flex justify-center py-2">
            <Loader2 className="w-4 h-4 animate-spin text-amber-600/60" />
          </div>
        )}

        {preview && (
          <div className="space-y-2 pt-1 border-t border-amber-500/20">
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[
                { label: "Vendedores", value: preview.total_vendedores },
                { label: "Mando medio", value: preview.total_mando_medio },
                { label: "Total dist.", value: preview.total_distribuidora },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-md border border-amber-500/20 bg-white/70 px-1 py-1.5">
                  <div className="text-[9px] text-amber-800/70">{label}</div>
                  <div className="text-[11px] tabular-nums font-mono font-medium text-amber-900">
                    {formatARS(value)}
                  </div>
                </div>
              ))}
            </div>
            {preview.vendedores.length > 0 && (
              <p className="text-[10px] text-amber-800/60 text-center">
                {preview.vendedores.length} objetivo{preview.vendedores.length !== 1 ? "s" : ""} en el período
              </p>
            )}
          </div>
        )}
      </div>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar pagos — objetivos compañía</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[var(--shelfy-muted)] -mt-2">
            Montos globales por tipo de objetivo y bono mando medio al cumplir todos los objetivos del vendedor.
          </p>
          {configQ.data && (
            <div className="border border-[var(--shelfy-border)] rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--shelfy-panel)] border-b border-[var(--shelfy-border)]">
                    <th className="text-left px-3 py-2 font-medium text-[var(--shelfy-muted)]">Tipo</th>
                    <th className="text-right px-3 py-2 font-medium text-[var(--shelfy-muted)]">Monto $</th>
                  </tr>
                </thead>
                <tbody>
                  {editedTarifas
                    .filter(t => t.activo)
                    .map(tarifa => (
                      <tr key={tarifa.tipo} className="border-b border-[var(--shelfy-border)]/50">
                        <td className="px-3 py-2 text-[var(--shelfy-text)]">
                          {TIPO_LABELS[tarifa.tipo] ?? tarifa.tipo}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            step={100}
                            value={tarifa.monto_vendedor}
                            onChange={e => {
                              const val = Number(e.target.value);
                              setEditedTarifas(prev =>
                                prev.map(t =>
                                  t.tipo === tarifa.tipo ? { ...t, monto_vendedor: val } : t
                                )
                              );
                            }}
                            className="w-32 h-8 text-right text-xs ml-auto"
                          />
                        </td>
                      </tr>
                    ))}
                  <tr className="bg-amber-50/60">
                    <td className="px-3 py-2 font-medium text-amber-800">Bono mando medio</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        value={editedBono}
                        onChange={e => setEditedBono(Number(e.target.value))}
                        className="w-32 h-8 text-right text-xs ml-auto"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setConfigOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              {saveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
