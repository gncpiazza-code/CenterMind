"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, FileSpreadsheet, X, Loader2, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { uploadReporteriaManualFile, type ReporteriaSource } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  distId: number;
  onJobCreated: (jobId: string) => void;
}

const SOURCES: { value: ReporteriaSource; label: string }[] = [
  { value: "sigo",         label: "SIGO" },
  { value: "comprobantes", label: "Comprobantes CHESS" },
  { value: "bultos",       label: "Bultos / Detalle" },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function ReporteriaManualUploadDialog({ open, onClose, distId, onJobCreated }: Props) {
  const [source, setSource] = useState<ReporteriaSource>("comprobantes");
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setDone(false);
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFile(f: File | null) {
    if (!f) return;
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Solo se aceptan archivos .xlsx, .xls o .csv");
      return;
    }
    setFile(f);
  }

  async function handleSubmit() {
    if (!file) return;
    setLoading(true);
    try {
      const job = await uploadReporteriaManualFile(distId, source, file, dateFrom, dateTo);
      setDone(true);
      onJobCreated(job.id);
      toast.success("Archivo procesado. Analizando datos…");
      setTimeout(handleClose, 1500);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Error procesando archivo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-black text-[var(--shelfy-text)]">
            Carga manual de archivo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Source */}
          <div>
            <label className="block text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-2">
              Tipo de reporte
            </label>
            <div className="flex gap-2">
              {SOURCES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSource(s.value)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                    source === s.value
                      ? "bg-[var(--shelfy-primary)] text-white border-transparent"
                      : "border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:border-[var(--shelfy-primary)]/50"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-1.5">Desde</label>
              <input
                type="date" value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full text-sm bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--shelfy-primary)]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--shelfy-muted)] uppercase tracking-wider mb-1.5">Hasta</label>
              <input
                type="date" value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full text-sm bg-[var(--shelfy-bg)] border border-[var(--shelfy-border)] rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--shelfy-primary)]"
              />
            </div>
          </div>

          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
              "relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all",
              file
                ? "border-[var(--shelfy-primary)] bg-[var(--shelfy-primary)]/5"
                : "border-[var(--shelfy-border)] hover:border-[var(--shelfy-primary)]/50 hover:bg-[var(--shelfy-primary)]/3"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet size={20} className="text-[var(--shelfy-primary)]" />
                <div className="text-left">
                  <p className="text-sm font-bold text-[var(--shelfy-text)] truncate max-w-[200px]">{file.name}</p>
                  <p className="text-[10px] text-[var(--shelfy-muted)]">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="ml-auto text-[var(--shelfy-muted)] hover:text-rose-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div>
                <Upload size={24} className="mx-auto mb-2 text-[var(--shelfy-muted)]" />
                <p className="text-sm font-semibold text-[var(--shelfy-text)]">Arrastrá o hacé clic para subir</p>
                <p className="text-[11px] text-[var(--shelfy-muted)] mt-1">XLSX, XLS o CSV · máx. 50 MB</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose} className="flex-1 rounded-xl h-10">
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!file || loading || done}
              className="flex-1 rounded-xl h-10 bg-[var(--shelfy-primary)] hover:bg-[var(--shelfy-accent)] text-white font-bold"
            >
              {done ? (
                <><CheckCircle2 size={14} className="mr-1.5" /> Listo</>
              ) : loading ? (
                <><Loader2 size={14} className="animate-spin mr-1.5" /> Procesando…</>
              ) : (
                <><Upload size={14} className="mr-1.5" /> Procesar</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
