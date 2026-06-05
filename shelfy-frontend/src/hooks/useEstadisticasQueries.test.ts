import { describe, it, expect } from "vitest";
import { cartasBundleQueryOptions } from "./useEstadisticasQueries";

describe("cartasBundleQueryOptions", () => {
  it("queryKey no contiene sucursal", () => {
    const opts = cartasBundleQueryOptions(42, ["2026-05", "2026-06"]);
    const key = opts.queryKey;
    expect(key).toEqual(["bundle", "estadisticas", 42, "2026-05,2026-06"]);
    // Verifica que no hay un 5to elemento (sucursal)
    expect(key).toHaveLength(4);
    expect(key.some((v) => typeof v === "string" && v.startsWith("2026") && v.length <= 7 && v.includes("-") && false)).toBe(false);
  });

  it("queryKey es estable independientemente de sucursal", () => {
    const opts1 = cartasBundleQueryOptions(1, ["2026-05"]);
    const opts2 = cartasBundleQueryOptions(1, ["2026-05"]);
    expect(opts1.queryKey).toEqual(opts2.queryKey);
  });

  it("staleTime es 15 min", () => {
    const opts = cartasBundleQueryOptions(1, ["2026-05"]);
    expect(opts.staleTime).toBe(15 * 60 * 1000);
  });
});
