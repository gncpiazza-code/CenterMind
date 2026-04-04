"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import TabSupervision from "@/components/admin/TabSupervision";
import { FileBarChart2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { generateInformeExcel } from "@/lib/api";

const ALLOWED_ROLES = ["superadmin", "admin", "supervisor"];

export default function SupervisionPage() {
  const { user } = useAuth();
  const router = useRouter();

  // ── Informe sheet state ───────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen]       = useState(false);
  const [files, setFiles]               = useState<File[]>([]);
  const [generating, setGenerating]     = useState(false);
  const [dragOver, setDragOver]         = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  // Guard: solo roles permitidos
  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.rol)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user || !ALLOWED_ROLES.includes(user.rol)) return null;

  const isSuperadmin = user.rol === "superadmin";
  const distId       = user.id_distribuidor || 0;

  // ── Informe handlers ──────────────────────────────────────────────────────
  function handleFileDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
    );
    if (dropped.length > 0) setFiles(prev => [...prev, ...dropped]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleGenerate() {
    if (files.length === 0) return;
    setGenerating(true);
    try {
      const blob = await generateInformeExcel(distId, files);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `informe_ventas_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF generado y descargado.");
      setSheetOpen(false);
      setFiles([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error generando informe";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  function handleSheetOpenChange(open: boolean) {
    if (!open && !generating) {
      setSheetOpen(false);
      setFiles([]);
    }
    if (open) setSheetOpen(true);
  }

  return (
    <div className="flex min-h-screen bg-[var(--shelfy-bg)]">
      <Sidebar />
      <BottomNav />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title="Panel de Supervisión" />

        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-12 overflow-auto">
          <div className="max-w-[1600px] mx-auto space-y-10">

            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-black text-[var(--shelfy-text)] tracking-tight">
                  Panel de Supervisión
                </h1>
                <p className="text-sm text-[var(--shelfy-muted)] mt-1">
                  Visualizá rutas, vendedores y puntos de venta en tiempo real.
                </p>
              </div>

              {isSuperadmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSheetOpen(true)}
                  className="flex items-center gap-2 shrink-0"
                >
                  <FileBarChart2 className="w-4 h-4" />
                  Generar Informe
                </Button>
              )}
            </div>

            {/* ── Mapa de Rutas ─────────────────────────────────────────────── */}
            <section>
              <TabSupervision distId={distId} isSuperadmin={isSuperadmin} />
            </section>

          </div>
        </main>
      </div>

      {/* ── Sheet: Generar Informe de Ventas ────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-[var(--shelfy-border)]/50">
            <SheetTitle className="flex items-center gap-2 text-[var(--shelfy-text)]">
              <FileBarChart2 className="w-5 h-5 text-[var(--shelfy-primary)]" />
              Generar Informe de Ventas
            </SheetTitle>
            <SheetDescription className="text-[var(--shelfy-muted)]">
              Subí uno o más archivos Excel de ventas para obtener un PDF analítico.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-6 py-6 flex-1 overflow-y-auto">

            {/* Edge case: superadmin sin dist */}
            {distId === 0 && (
              <Alert>
                <AlertTitle>Sin distribuidora seleccionada</AlertTitle>
                <AlertDescription>
                  Para generar un informe necesitás tener una distribuidora activa en tu sesión. Cambiá de contexto desde el selector de distribuidoras.
                </AlertDescription>
              </Alert>
            )}

            {/* Drop zone */}
            {distId !== 0 && (
              <>
                <label
                  htmlFor="informe-file-input"
                  className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors py-10 px-4 text-center select-none
                    ${dragOver
                      ? "border-[var(--shelfy-primary)] bg-[var(--shelfy-primary)]/5"
                      : "border-[var(--shelfy-border)] hover:border-[var(--shelfy-primary)]/50 hover:bg-[var(--shelfy-primary)]/5"
                    }`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--shelfy-primary)]/10 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-[var(--shelfy-primary)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--shelfy-text)]">
                      Arrastrá archivos acá o hacé click
                    </p>
                    <p className="text-xs text-[var(--shelfy-muted)] mt-0.5">
                      Soporta .xlsx y .xls — múltiples archivos
                    </p>
                  </div>
                  <input
                    id="informe-file-input"
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>

                {/* File list */}
                {files.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {files.map((f, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--shelfy-border)] px-3 py-2 text-sm"
                      >
                        <span className="text-[var(--shelfy-text)] truncate">{f.name}</span>
                        <button
                          onClick={() => removeFile(idx)}
                          className="text-[var(--shelfy-muted)] hover:text-rose-400 transition-colors shrink-0 text-xs"
                          aria-label="Eliminar archivo"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Progress while generating */}
                {generating && (
                  <div className="flex flex-col gap-2">
                    <Progress value={75} className="h-1.5" />
                    <p className="text-xs text-[var(--shelfy-muted)] text-center">Generando PDF...</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={generating}
                    onClick={() => { setSheetOpen(false); setFiles([]); }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={files.length === 0 || generating}
                    onClick={handleGenerate}
                  >
                    {generating ? "Generando..." : "Generar PDF"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
