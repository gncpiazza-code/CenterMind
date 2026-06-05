"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar, ChevronDown, FileSpreadsheet, Loader2, Save, Settings2 } from "lucide-react";
import {
  fetchLiquidacionConfig,
  fetchLiquidacionPreview,
  fetchLiquidacionExportBlob,
  putLiquidacionConfig,
  type LiquidacionTarifaRow,
} from "@/lib/api";
import { formatObjetivoMesLabel } from "@/lib/objetivo-utils";
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
  mesesConDatos: string[];
  filterMes: string | null;
  onFilterMesChange: (mes: string | null) => void;
}

export function ObjetivoLiquidacionToolbar({
  distId,
  mesesConDatos,
  filterMes,
  onFilterMesChange,
}: Props) {
  const qc = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);
  const [editedTarifas, setEditedTarifas] = useState<LiquidacionTarifaRow[]>([]);
  const [editedBono, setEditedBono] = useState<number>(0);
  const [exporting, setExporting] = useState(false);

  const mesActivo = filterMes ?? mesesConDatos[0] ?? null;

  useEffect(() => {
    if (!filterMes && mesesConDatos.length > 0) {
      onFilterMesChange(mesesConDatos[0]!);
    }
  }, [filterMes, mesesConDatos, onFilterMesChange]);

  const configQ = useQuery({
    queryKey: ["liquidacion-config"],
    queryFn: fetchLiquidacionConfig,
  });

  const previewQ = useQuery({
    queryKey: ["liquidacion-preview", distId, mesActivo],
    queryFn: () => fetchLiquidacionPreview(distId, mesActivo!),
    enabled: !!distId && !!mesActivo,
  });

  const saveMut = useMutation({
    mutationFn: () => putLiquidacionConfig({ tarifas: editedTarifas, bono_mando_medio: editedBono }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["liquidacion-config"] });
      qc.invalidateQueries({ queryKey: ["liquidacion-preview"] });
      toast.success("Bonos globales guardados");
      setConfigOpen(false);
    },
    onError: () => toast.error("Error al guardar configuración"),
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
    if (!mesActivo) {
      toast.error("Seleccioná un mes con objetivos para exportar");
      return;
    }
    setExporting(true);
    try {
      const blob = await fetchLiquidacionExportBlob(distId, mesActivo);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `liquidacion_objetivos_${mesActivo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo exportar la liquidación");
    } finally {
      setExporting(false);
    }
  };

  const preview = previewQ.data;

  return (
    <>
      <div className="mb-4 print-hidden rounded-xl border border-amber-500/35 bg-amber-50/50 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
              Liquidación compañía
            </span>
            {preview && (
              <span className="text-[11px] text-amber-800/80 tabular-nums">
                Total dist. {formatARS(preview.total_distribuidora)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Selector de mes — solo meses con datos */}
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-700/70 pointer-events-none z-10" />
              <select
                aria-label="Mes de liquidación"
                value={mesActivo ?? ""}
                onChange={e => onFilterMesChange(e.target.value || null)}
                disabled={mesesConDatos.length === 0}
                className="appearance-none h-9 min-w-[11rem] max-w-[11rem] rounded-lg border border-amber-500/40 bg-white pl-8 pr-8 text-sm font-medium text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:opacity-50"
              >
                {mesesConDatos.length === 0 ? (
                  <option value="">Sin meses con datos</option>
                ) : (
                  mesesConDatos.map(m => (
                    <option key={m} value={m}>
                      {formatObjetivoMesLabel(m)}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-700/70 pointer-events-none" />
            </div>

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
              disabled={exporting || !mesActivo}
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
