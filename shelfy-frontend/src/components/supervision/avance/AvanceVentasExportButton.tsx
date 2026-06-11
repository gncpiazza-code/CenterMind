"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { AvanceSkuRankingRow } from "@/lib/api";

interface AvanceVentasExportButtonProps {
  ranking: AvanceSkuRankingRow[];
  periodoLabel: string;
  /** Modo de volumen activo (R2): "desglose" agrega bultos enteros + unidades resto. */
  volumenModo?: "bultos" | "desglose";
}

function csvNum(n: number | null | undefined): string {
  if (n == null) return "";
  return String(n).replace(".", ",");
}

/** Exporta el ranking visible a CSV (es-AR, separador ;) — nombres completos, sin abreviar. */
export function AvanceVentasExportButton({
  ranking,
  periodoLabel,
  volumenModo = "bultos",
}: AvanceVentasExportButtonProps) {
  const handleExport = () => {
    if (!ranking.length) return;
    const desglose = volumenModo === "desglose";
    const header =
      "articulo;cod_articulo;agrupacion;bultos;unidades;clientes;intensidad;penetracion_pct;sin_venta" +
      (desglose ? ";bultos_enteros;unidades_resto" : "");
    const lines = ranking.map((r) =>
      [
        `"${(r.articulo ?? "").replaceAll('"', '""')}"`,
        r.cod_articulo ?? "",
        `"${(r.agrupacion ?? "").replaceAll('"', '""')}"`,
        csvNum(r.bultos),
        csvNum(r.unidades),
        String(r.clientes ?? 0),
        csvNum(r.intensidad),
        csvNum(r.penetracion_pct),
        r.sin_venta ? "1" : "0",
        ...(desglose ? [csvNum(r.bultos_enteros), csvNum(r.unidades_resto)] : []),
      ].join(";"),
    );
    // BOM para que Excel es-AR abra con acentos correctos.
    const blob = new Blob(["﻿" + [header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `avance-ventas-${periodoLabel.replaceAll(" ", "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-[10px] px-2 gap-1"
      disabled={!ranking.length}
      onClick={handleExport}
      title="Descarga el ranking visible como CSV"
    >
      <Download size={10} />
      Export CSV
    </Button>
  );
}
