import { describe, expect, it } from "vitest";
import {
  ccRowMatchesVendedor,
  ccVendedorMatchScore,
  erpCodesMatchCcVendor,
  resolveClientesCCForVendedor,
} from "../cuentasCorrientes";

describe("erpCodesMatchCcVendor", () => {
  it("no matchea tokens de 1 dígito por sufijo", () => {
    expect(erpCodesMatchCcVendor("717 0717 - LUCIANO GONZALEZ", "10107")).toBe(false);
  });

  it("matchea código ERP exacto o sufijo >= 2 chars", () => {
    expect(erpCodesMatchCcVendor("717 0717 - LUCIANO GONZALEZ", "10717")).toBe(true);
    expect(erpCodesMatchCcVendor("717 0717 - LUCIANO GONZALEZ", "717")).toBe(true);
  });
});

describe("resolveClientesCCForVendedor", () => {
  const rows = [
    {
      vendedor: "717 0717 - LUCIANO GONZALEZ",
      id_vendedor: 10,
      clientes: [{ id_cliente_erp: "011395", cliente: "011395 - SOLEDAD" }],
    },
    {
      vendedor: "818 0818 - MARIA PEREZ",
      id_vendedor: 20,
      clientes: [{ id_cliente_erp: "012428", cliente: "012428 - YONATAN" }],
    },
    {
      vendedor: "717 0717 - LUCIANO GONZALEZ",
      id_vendedor: null,
      clientes: [{ id_cliente_erp: "011395", cliente: "011395 - SOLEDAD" }],
    },
  ];

  it("elige un solo vendedor por id_vendedor", () => {
    const clientes = resolveClientesCCForVendedor(rows, "LUCIANO GONZALEZ", 10, "10717");
    expect(clientes.map((c) => c.id_cliente_erp)).toEqual(["011395"]);
  });

  it("cambia la cartera al cambiar vendedor", () => {
    const luciano = resolveClientesCCForVendedor(rows, "LUCIANO GONZALEZ", 10, "10717");
    const maria = resolveClientesCCForVendedor(rows, "MARIA PEREZ", 20, "10818");
    expect(luciano.map((c) => c.id_cliente_erp)).toEqual(["011395"]);
    expect(maria.map((c) => c.id_cliente_erp)).toEqual(["012428"]);
  });

  it("deduplica buckets del mismo vendedor", () => {
    const clientes = resolveClientesCCForVendedor(rows, "LUCIANO GONZALEZ", 10, "10717");
    expect(clientes).toHaveLength(1);
  });
});

describe("ccRowMatchesVendedor", () => {
  it("prioriza id_vendedor sobre heurísticas débiles", () => {
    expect(
      ccRowMatchesVendedor("999 0007 - OTRO", 20, "MARIA PEREZ", 20, "10818"),
    ).toBe(true);
    expect(
      ccRowMatchesVendedor("999 0007 - OTRO", 20, "LUCIANO GONZALEZ", 10, "10717"),
    ).toBe(false);
  });

  it("expone score coherente con el match", () => {
    expect(ccVendedorMatchScore("717 0717 - LUCIANO GONZALEZ", 10, "LUCIANO GONZALEZ", 10, "10717")).toBe(100);
    expect(ccVendedorMatchScore("717 0717 - LUCIANO GONZALEZ", null, "LUCIANO GONZALEZ", 10, "10717")).toBe(80);
  });
});
