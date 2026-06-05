"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FileSpreadsheet, Save } from "lucide-react";
import {
  fetchLiquidacionConfig,
  fetchLiquidacionPreview,
  getLiquidacionExportUrl,
  putLiquidacionConfig,
  type LiquidacionPreviewOut,
  type LiquidacionTarifaRow,
} from "@/lib/api";
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
  const [editMode, setEditMode] = useState(false);
  const [editedTarifas, setEditedTarifas] = useState<LiquidacionTarifaRow[]>([]);
  const [editedBono, setEditedBono] = useState<number>(0);

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
      setEditMode(false);
    },
    onError: () => toast.error("Error al guardar configuración"),
  });

  const startEdit = () => {
    if (!configQ.data) return;
    setEditedTarifas(configQ.data.tarifas.map(t => ({ ...t })));
    setEditedBono(configQ.data.bono_mando_medio);
    setEditMode(true);
  };

  const preview = previewQ.data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-700">Liquidación {mes}</h3>
        <div className="flex gap-2">
          {!editMode && (
            <Button variant="outline" size="sm" onClick={startEdit} className="text-xs h-7">
              Editar tarifas
            </Button>
          )}
          {editMode && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditMode(false)} className="text-xs h-7">
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                className="text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {saveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Guardar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabla de tarifas */}
      {configQ.data && (
        <div className="border border-[var(--shelfy-border)] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--shelfy-panel)] border-b border-[var(--shelfy-border)]">
                <th className="text-left px-3 py-2 font-medium text-[var(--shelfy-muted)]">Tipo</th>
                <th className="text-right px-3 py-2 font-medium text-[var(--shelfy-muted)]">Monto vendedor $</th>
                {editMode && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {(editMode ? editedTarifas : configQ.data.tarifas)
                .filter(t => t.activo)
                .map((tarifa, i) => (
                  <tr key={tarifa.tipo} className="border-b border-[var(--shelfy-border)]/50">
                    <td className="px-3 py-2 text-[var(--shelfy-text)]">{TIPO_LABELS[tarifa.tipo] ?? tarifa.tipo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {editMode ? (
                        <Input
                          type="number"
                          min={0}
                          step={100}
                          value={editedTarifas[i]?.monto_vendedor ?? 0}
                          onChange={e => {
                            const next = [...editedTarifas];
                            next[i] = { ...next[i]!, monto_vendedor: Number(e.target.value) };
                            setEditedTarifas(next);
                          }}
                          className="w-28 h-7 text-right text-xs ml-auto"
                        />
                      ) : (
                        <span className="font-mono">{formatARS(tarifa.monto_vendedor)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              {/* Bono mando medio */}
              <tr className="bg-amber-50/60">
                <td className="px-3 py-2 text-amber-800 font-medium">Bono mando medio</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {editMode ? (
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={editedBono}
                      onChange={e => setEditedBono(Number(e.target.value))}
                      className="w-28 h-7 text-right text-xs ml-auto"
                    />
                  ) : (
                    <span className="font-mono font-medium text-amber-700">{formatARS(configQ.data.bono_mando_medio)}</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Preview totales */}
      {previewQ.isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--shelfy-muted)]" />
        </div>
      )}
      {preview && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Vendedores", value: preview.total_vendedores, bold: false },
              { label: "Mando Medio", value: preview.total_mando_medio, bold: false },
              { label: "Total Dist.", value: preview.total_distribuidora, bold: true },
            ].map(({ label, value, bold }) => (
              <div
                key={label}
                className={`rounded-lg border p-2 ${bold ? "border-amber-500/40 bg-amber-50" : "border-[var(--shelfy-border)] bg-[var(--shelfy-panel)]"}`}
              >
                <div className="text-[10px] text-[var(--shelfy-muted)]">{label}</div>
                <div className={`text-sm tabular-nums font-mono ${bold ? "font-bold text-amber-700" : "text-[var(--shelfy-text)]"}`}>
                  {formatARS(value)}
                </div>
              </div>
            ))}
          </div>

          {/* Detalle vendedores */}
          {preview.vendedores.length > 0 && (
            <div className="border border-[var(--shelfy-border)] rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-[var(--shelfy-panel)] border-b border-[var(--shelfy-border)] sticky top-0">
                    <th className="text-left px-2 py-1.5 font-medium text-[var(--shelfy-muted)]">Vendedor</th>
                    <th className="text-left px-2 py-1.5 font-medium text-[var(--shelfy-muted)]">Tipo</th>
                    <th className="text-right px-2 py-1.5 font-medium text-[var(--shelfy-muted)]">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.vendedores.map(row => (
                    <tr key={row.id_objetivo} className="border-b border-[var(--shelfy-border)]/30">
                      <td className="px-2 py-1 text-[var(--shelfy-text)] truncate max-w-[100px]">
                        {row.nombre_vendedor ?? `ID ${row.id_vendedor}`}
                      </td>
                      <td className="px-2 py-1 text-[var(--shelfy-muted)]">{TIPO_LABELS[row.tipo] ?? row.tipo}</td>
                      <td className={`px-2 py-1 text-right tabular-nums font-mono ${row.monto > 0 ? "text-emerald-600" : "text-[var(--shelfy-muted)]"}`}>
                        {formatARS(row.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Export */}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs gap-1.5 border-amber-500/40 text-amber-700 hover:bg-amber-50"
            onClick={() => {
              const url = getLiquidacionExportUrl(distId, mes);
              window.open(url, '_blank');
            }}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Exportar XLSX
          </Button>
        </div>
      )}
    </div>
  );
}
