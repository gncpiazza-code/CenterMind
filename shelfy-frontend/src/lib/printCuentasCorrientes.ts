import type { CuentasSupervision, ClienteCuenta, VendedorCuentas } from "@/lib/api";

function esc(s: string | null | undefined): string {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtN(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

/** HTML listo para imprimir / entregar al vendedor (A4, tablas por vendedor). */
export function buildCuentasCorrientesPrintHtml(data: CuentasSupervision): string {
  const coloresDia: Record<string, string> = {
    "1-7 Días": "#16a34a",
    "8-15 Días": "#ca8a04",
    "16-21 Días": "#ea580c",
    "22-30 Días": "#dc2626",
    "+30 Días": "#9f1239",
  };

  const vendedoresHTML = data.vendedores.map((v: VendedorCuentas, vIdx: number) => {
    const filas = v.clientes.map((c: ClienteCuenta) => {
      const dias = c.antiguedad ?? 0;
      const colorDias =
        dias > 30 ? "#dc2626" : dias > 21 ? "#ea580c" : dias > 15 ? "#ca8a04" : dias > 7 ? "#16a34a" : "#6b7280";
      return `<tr>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px">${esc(c.cliente) || "-"}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;color:#6b7280">${esc(c.sucursal) || "-"}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;text-align:center;color:${colorDias};font-weight:bold">${dias}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;text-align:center">${c.cantidad_comprobantes ?? "-"}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:9px;text-align:right;font-weight:600">$${fmtN(c.deuda_total)}</td>
        </tr>`;
    }).join("");
    return `<div style="${vIdx > 0 ? "page-break-before:always;" : ""}margin-bottom:20px">
        <div style="background:#1f2937;color:white;padding:8px 12px;border-radius:6px 6px 0 0;display:flex;align-items:center;gap:16px">
          <span style="font-weight:700;font-size:11px;flex:1">${esc(v.vendedor)}</span>
          <span style="font-size:10px;color:#fbbf24">Deuda: $${fmtN(v.deuda_total)}</span>
          <span style="font-size:9px;color:#9ca3af">${v.cantidad_clientes} clientes</span>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f3f4f6">
            <th style="padding:5px 8px;border:1px solid #d1d5db;font-size:8px;text-align:left;text-transform:uppercase;letter-spacing:.4px">Cliente</th>
            <th style="padding:5px 8px;border:1px solid #d1d5db;font-size:8px;text-align:left;text-transform:uppercase;letter-spacing:.4px">Sucursal</th>
            <th style="padding:5px 8px;border:1px solid #d1d5db;font-size:8px;text-align:center;text-transform:uppercase;letter-spacing:.4px">Días</th>
            <th style="padding:5px 8px;border:1px solid #d1d5db;font-size:8px;text-align:center;text-transform:uppercase;letter-spacing:.4px">Comprobantes</th>
            <th style="padding:5px 8px;border:1px solid #d1d5db;font-size:8px;text-align:right;text-transform:uppercase;letter-spacing:.4px">Deuda</th>
          </tr></thead>
          <tbody>${filas}</tbody>
          <tfoot><tr style="background:#f9fafb;border-top:2px solid #d1d5db">
            <td colspan="4" style="padding:5px 8px;font-size:9px;text-align:right;font-weight:700">Total</td>
            <td style="padding:5px 8px;font-size:9px;text-align:right;font-weight:700">$${fmtN(v.deuda_total)}</td>
          </tr></tfoot>
        </table>
      </div>`;
  }).join("");

  const rangoBadges = Object.entries(coloresDia)
    .map(([label, color]) => {
      const count = data.vendedores
        .flatMap((v) => v.clientes)
        .filter((c) => c.rango_antiguedad === label).length;
      if (!count) return "";
      return `<span style="display:inline-block;margin:2px 4px;padding:3px 8px;border-radius:4px;font-size:9px;background:${color}22;color:${color};border:1px solid ${color}55;font-weight:600">${esc(label)}: ${count}</span>`;
    })
    .join("");

  const hoy = new Date().toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return `<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8">
      <title>Cuentas corrientes — hoja vendedor</title>
      <style>
        @page { size: A4 portrait; margin: 1.5cm 1.2cm; }
        body { font-family: Arial, sans-serif; color: #1a1a1a; margin: 0; }
        @media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
    </head><body>
      <div style="border-bottom:3px solid #1f2937;padding-bottom:12px;margin-bottom:12px">
        <h1 style="margin:0;font-size:18px;font-weight:900">Cuentas corrientes</h1>
        <p style="margin:6px 0 0;font-size:12px;font-weight:600;color:#374151">Hoja para el vendedor · Llevá esta lista en tus visitas</p>
        <p style="margin:4px 0 0;font-size:11px;color:#6b7280">Datos al ${esc(data.fecha) || "—"} · Impreso el ${hoy}</p>
      </div>
      <div style="display:flex;gap:20px;margin-bottom:16px;padding:10px 14px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb">
        <div><div style="font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Deuda total</div><div style="font-size:16px;font-weight:900;color:#d97706">$${fmtN(data.metadatos?.total_deuda ?? 0)}</div></div>
        <div><div style="font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Clientes deudores</div><div style="font-size:16px;font-weight:900">${(data.metadatos?.clientes_deudores ?? 0).toLocaleString("es-AR")}</div></div>
        <div><div style="font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Vendedores en hoja</div><div style="font-size:16px;font-weight:900">${data.vendedores.length}</div></div>
        <div><div style="font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Prom. días atraso</div><div style="font-size:16px;font-weight:900">${Math.round(data.metadatos?.promedio_dias_retraso ?? 0)} días</div></div>
      </div>
      ${rangoBadges ? `<div style="margin-bottom:16px">${rangoBadges}</div>` : ""}
      ${vendedoresHTML}
      <p style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:9px;color:#9ca3af">
        Generado desde Shelfy · El supervisor puede imprimir esta hoja y entregarla al vendedor para facilitar el cobro y seguimiento en ruta.
      </p>
    </body></html>`;
}

/** Abre ventana con el reporte imprimible (misma experiencia que el botón en TabSupervision). */
export function openCuentasCorrientesPrintWindow(data: CuentasSupervision): void {
  if (!data.vendedores?.length) return;
  const html = buildCuentasCorrientesPrintHtml(data);
  const win = window.open("", "_blank", "width=900,height=950");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
