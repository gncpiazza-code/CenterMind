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
import { FileSpreadsheet, Loader2, Save, Settings2 } from "lucide-react";
import {
  fetchLiquidacionConfig,
  fetchLiquidacionPreview,
  fetchLiquidacionExportBlob,
  putLiquidacionConfig,
  type LiquidacionTarifaRow,
} from "@/lib/api";
import { toast } from "sonner";

const TIPO_LABELS: Record<string, string> = {
  exhibicion: "Exhibición",
  ruteo_alteo: "Alteo",
  compradores: "Compradores",
  conversion_estado: "Activación",
};

function formatARS(n: number): string {
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
  distId: number;
  filterMes: string | null;
}

export function ObjetivoLiquidacionToolbar({ distId, filterMes }: Props) {
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
    queryKey: ["liquidacion-preview", distId, filterMes],
    queryFn: () => fetchLiquidacionPreview(distId, filterMes!),
    enabled: !!distId && !!filterMes,
  });

  const saveMut = useMutation({
    mutationFn: () => putLiquidacionConfig({ tarifas: editedTarifas, bono_mando_medio: editedBono }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["liquidacion-config"] });
      qc.invalidateQueries({ queryKey: ["liquidacion-preview"] });
      toast.success("Bonos globales guardados");
      setConfigOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Error al guardar configuración");
    },
  });

  const openConfig = () => {
    if (!configQ.data) {
      toast.error("No se pudo cargar la configuración");
      return;
    }
    setEditedTarifas(configQ.data.tarifas.map(t => ({ ...t })));
    setEditedBono(configQ.data.bono_mando_medio);
    setConfigOpen(true);
  };

  const handleExport = async () => {
    if (!filterMes) {
      toast.error("Seleccioná un mes en el filtro para exportar la liquidación");
      return;
    }
    setExporting(true);
    try {
      const blob = await fetchLiquidacionExportBlob(distId, filterMes);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `liquidacion_objetivos_${filterMes}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo exportar la liquidación";
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  const preview = previewQ.data;

  return (
    <>
      <div className="mb-4 print-hidden rounded-xl border border-amber-500/35 bg-amber-50/50 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
              Liquidación compañía
            </span>
            {preview && (
              <span className="text-[11px] text-amber-800/80 tabular-nums">
                Total dist. {formatARS(preview.total_distribuidora)}
              </span>
            )}
            {!filterMes && (
              <span className="text-[11px] text-amber-800/60">
                Elegí un mes en el filtro para ver totales y exportar
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-amber-500/50 text-amber-900 hover:bg-amber-100/80"
              onClick={openConfig}
              disabled={configQ.isLoading}
            >
              <Settings2 className="w-4 h-4 shrink-0" />
              Configurar bonos globales
            </Button>

            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleExport}
              disabled={exporting || !filterMes}
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
              )}
              Exportar liquidación
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bonos globales — objetivos compañía</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[var(--shelfy-muted)] -mt-2 leading-relaxed">
            Montos válidos para <strong>todos los tenants</strong> y <strong>todos los meses</strong>,
            hasta que los modifiques manualmente de nuevo.
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
