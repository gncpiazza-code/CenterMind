import { describe, it, expect } from "vitest";
import { filterCartasBySucursal } from "./estadisticas-filter";
import type { VendorCartaResumen } from "@/lib/api";

function makeVendor(id: string, sucursal: string | null): VendorCartaResumen {
  return { id_vendedor: id, sucursal } as VendorCartaResumen;
}

describe("filterCartasBySucursal", () => {
  const cartas = [
    makeVendor("v1", "Norte"),
    makeVendor("v2", "Sur"),
    makeVendor("v3", "Norte"),
    makeVendor("v4", null),
  ];

  it("null sucursal devuelve todas las cartas", () => {
    expect(filterCartasBySucursal(cartas, null)).toHaveLength(4);
  });

  it("filtra por sucursal exacta", () => {
    const res = filterCartasBySucursal(cartas, "Norte");
    expect(res).toHaveLength(2);
    expect(res.every((v) => v.sucursal === "Norte")).toBe(true);
  });

  it("sucursal sin matches devuelve array vacío", () => {
    expect(filterCartasBySucursal(cartas, "Centro")).toHaveLength(0);
  });

  it("array vacío devuelve array vacío", () => {
    expect(filterCartasBySucursal([], "Norte")).toHaveLength(0);
  });

  it("no muta el array original", () => {
    const original = [...cartas];
    filterCartasBySucursal(cartas, "Sur");
    expect(cartas).toHaveLength(original.length);
  });
});
