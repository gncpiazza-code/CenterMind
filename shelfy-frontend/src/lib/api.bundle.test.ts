import { describe, expect, it } from "vitest";
import { coerceBundleList, coerceDashboardRankingRows } from "./api";

describe("coerceDashboardRankingRows", () => {
  it("pasa listas sin cambios", () => {
    const rows = [{ vendedor: "A", puntos: 1 }];
    expect(coerceDashboardRankingRows(rows)).toEqual(rows);
  });

  it("convierte dict aggregate a lista", () => {
    const raw = { A: { puntos: 2, aprobadas: 1, destacadas: 1, rechazadas: 0 } };
    const out = coerceDashboardRankingRows(raw);
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].vendedor).toBe("A");
    expect(out[0].puntos).toBe(2);
  });

  it("retorna [] para null/undefined", () => {
    expect(coerceDashboardRankingRows(null)).toEqual([]);
    expect(coerceDashboardRankingRows(undefined)).toEqual([]);
  });
});

describe("coerceBundleList", () => {
  it("normaliza dict indexado a array", () => {
    const raw = { "0": { id: 1 }, "1": { id: 2 } };
    expect(coerceBundleList<{ id: number }>(raw)).toHaveLength(2);
  });
});
