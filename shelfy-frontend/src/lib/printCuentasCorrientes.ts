import { downloadCuentasSupervisionPdf } from "@/lib/api";
import { toast } from "sonner";

export type CuentasCorrientesPrintOptions = {
  distId: number;
  sucursal?: string;
  fecha?: string;
  vendedor?: string;
  idVendedor?: number | null;
};

/** Abre el PDF de CC (mismo que difusión Telegram) para imprimir o guardar. */
export async function openCuentasCorrientesPrintWindow(
  opts: CuentasCorrientesPrintOptions,
): Promise<void> {
  try {
    const blob = await downloadCuentasSupervisionPdf(opts.distId, {
      sucursal: opts.sucursal,
      fecha: opts.fecha,
      vendedor: opts.vendedor,
      idVendedor: opts.idVendedor,
    });
    const url = URL.createObjectURL(blob);
    const isZip = blob.type === "application/zip" || blob.type === "application/x-zip-compressed";
    const win = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url;
      a.download = isZip ? "cuentas_corrientes.zip" : "cuentas_corrientes.pdf";
      a.click();
      toast.info(isZip ? "ZIP descargado (varios vendedores)" : "PDF descargado");
    } else if (!isZip) {
      setTimeout(() => {
        try {
          win.print();
        } catch {
          /* el visor PDF del navegador puede bloquear print() automático */
        }
      }, 600);
    } else {
      toast.success("ZIP con un PDF por vendedor (mismo formato que difusión)");
    }
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
  }
}
