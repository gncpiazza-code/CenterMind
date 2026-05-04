"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, X, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ReporteriaSource } from "@/lib/api";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;
const ACCEPTED = /\.(xlsx|xls|csv)$/i;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  source: ReporteriaSource;
  onFileReady: (file: File) => void;
  onBack: () => void;
  isLoading?: boolean;
}

const SOURCE_LABELS: Record<ReporteriaSource, string> = {
  sigo: "SIGO",
  comprobantes: "Comprobantes",
  bultos: "Bultos",
};

export function ReporteriaDropzone({ source, onFileReady, onBack, isLoading }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function validateFile(f: File): string | null {
    if (!ACCEPTED.test(f.name)) return "Solo se aceptan archivos .xlsx, .xls o .csv";
    if (f.size > MAX_SIZE_BYTES) return "El archivo supera los 50 MB";
    return null;
  }

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  const handleFile = useCallback((f: File | null | undefined) => {
    if (!f) return;
    const err = validateFile(f);
    if (err) {
      setError(err);
      triggerShake();
      return;
    }
    setError(null);
    setFile(f);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
  }

  function removeFile(e: React.MouseEvent) {
    e.stopPropagation();
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-black text-[var(--shelfy-text)] tracking-tight mb-1">
          Subí el archivo de {SOURCE_LABELS[source]}
        </h2>
        <p className="text-sm text-[var(--shelfy-muted)]">
          El período se detecta automáticamente desde las fechas del archivo
        </p>
      </div>

      {/* Dropzone */}
      <motion.div
        animate={shake ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : {}}
        transition={{ duration: 0.45, ease: "easeInOut" }}
        className={cn(
          "relative rounded-2xl border-2 transition-all duration-200 cursor-pointer select-none",
          dragOver
            ? "border-[var(--shelfy-primary)] bg-[var(--shelfy-primary)]/5 ring-4 ring-[var(--shelfy-primary)]/15"
            : file
              ? "border-[var(--shelfy-primary)] bg-[var(--shelfy-primary)]/[0.03]"
              : error
                ? "border-rose-400 bg-rose-50/50"
                : "border-dashed border-[var(--shelfy-border)] hover:border-[var(--shelfy-primary)]/50 hover:bg-[var(--shelfy-primary)]/[0.02]"
        )}
        onClick={() => !file && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        <div className="p-10">
          <AnimatePresence mode="wait">
            {file ? (
              <motion.div
                key="file"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-4"
              >
                <div className="size-12 rounded-xl bg-[var(--shelfy-primary)]/10 flex items-center justify-center shrink-0">
                  <FileSpreadsheet size={22} className="text-[var(--shelfy-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-[var(--shelfy-text)] truncate">{file.name}</p>
                  <p className="text-[11px] text-[var(--shelfy-muted)] mt-0.5 font-medium">
                    {formatFileSize(file.size)} · El período se detectará del archivo
                  </p>
                </div>
                <button
                  onClick={removeFile}
                  className="size-7 rounded-full flex items-center justify-center text-[var(--shelfy-muted)] hover:text-rose-500 hover:bg-rose-50 transition-all duration-150"
                >
                  <X size={14} />
                </button>
              </motion.div>
            ) : dragOver ? (
              <motion.div
                key="drag"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="size-14 rounded-2xl bg-[var(--shelfy-primary)]/15 flex items-center justify-center">
                  <Upload size={26} className="text-[var(--shelfy-primary)]" />
                </div>
                <p className="text-[14px] font-bold text-[var(--shelfy-primary)]">Soltá el archivo aquí</p>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 text-center"
              >
                <div className={cn(
                  "size-14 rounded-2xl flex items-center justify-center transition-colors duration-200",
                  error ? "bg-rose-100" : "bg-[var(--shelfy-bg)]"
                )}>
                  {error
                    ? <AlertCircle size={26} className="text-rose-500" />
                    : <Upload size={26} className="text-[var(--shelfy-muted)]" />
                  }
                </div>
                <div>
                  <p className={cn(
                    "text-[14px] font-bold",
                    error ? "text-rose-600" : "text-[var(--shelfy-text)]"
                  )}>
                    {error ?? "Arrastrá tu Excel aquí o hacé clic para seleccionar"}
                  </p>
                  {!error && (
                    <p className="text-[11px] text-[var(--shelfy-muted)] mt-1 font-medium">
                      XLSX, XLS o CSV · máx. 50 MB
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!file && !dragOver && !error && (
          <div className="absolute inset-0 rounded-2xl pointer-events-none">
            <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-[var(--shelfy-primary)]/20 animate-pulse" />
          </div>
        )}
      </motion.div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isLoading}
          className="rounded-xl h-11 px-6 font-bold border-[var(--shelfy-border)] text-[var(--shelfy-muted)] hover:text-[var(--shelfy-text)] hover:border-[var(--shelfy-muted)]/40"
        >
          ← Atrás
        </Button>
        <Button
          onClick={() => file && onFileReady(file)}
          disabled={!file || isLoading}
          className={cn(
            "flex-1 h-11 rounded-xl font-bold text-[15px] transition-all duration-200",
            file && !isLoading
              ? "bg-[var(--shelfy-primary)] hover:bg-[var(--shelfy-accent)] text-white shadow-md hover:shadow-lg shadow-[var(--shelfy-primary)]/20"
              : "bg-[var(--shelfy-border)] text-[var(--shelfy-muted)] cursor-not-allowed"
          )}
        >
          <span className="flex items-center justify-center gap-2">
            Procesar archivo
            <ArrowRight size={16} />
          </span>
        </Button>
      </div>
    </div>
  );
}
