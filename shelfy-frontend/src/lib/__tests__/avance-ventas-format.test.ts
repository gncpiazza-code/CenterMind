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
