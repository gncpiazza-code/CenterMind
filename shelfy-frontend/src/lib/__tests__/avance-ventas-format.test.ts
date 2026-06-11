import { describe, expect, it } from "vitest";
import { fmtVolumenCell } from "@/lib/avance-ventas-format";

describe("fmtVolumenCell", () => {
  it("modo bultos: solo decimal, sin unidades totales", () => {
    const out = fmtVolumenCell(
      { bultos: 1.05, unidades: 263, volumen_kind: "cig_default" },
      "bultos",
    );
    expect(out).toEqual({ primary: "1,05", secondary: null });
  });

  it("modo desglose: bultos enteros + resto (no total unidades)", () => {
    const out = fmtVolumenCell(
      { bultos: 1.05, unidades: 263, volumen_kind: "cig_default" },
      "desglose",
    );
    expect(out.primary).toBe("1 bto");
    expect(out.secondary).toBe("+ 13 u");
  });

  it("modo desglose: bulto exacto sin resto", () => {
    const out = fmtVolumenCell(
      { bultos: 1, unidades: 250, volumen_kind: "cig_default" },
      "desglose",
    );
    expect(out).toEqual({ primary: "1 bto", secondary: null });
  });

  it("desglose: infiere factor 250 con agrupación placeholder y unidades ERP", () => {
    const out = fmtVolumenCell(
      {
        bultos: 66.56,
        unidades: 16640,
        articulo: "DOLCHESTER GOLDEN EDITION BOX 20X250",
        volumen_kind: "otro_raw",
      },
      "desglose",
    );
    expect(out.primary).toBe("66 btos");
    expect(out.secondary).toBe("+ 140 u");
  });

  it("usa bultos_enteros/unidades_resto del BE cuando vienen", () => {
    const out = fmtVolumenCell(
      {
        bultos: 0.75,
        unidades: 188,
        volumen_kind: "cig_default",
        bultos_enteros: 0,
        unidades_resto: 188,
      },
      "desglose",
    );
    expect(out.primary).toBe("0 btos");
    expect(out.secondary).toBe("+ 188 u");
  });
});
