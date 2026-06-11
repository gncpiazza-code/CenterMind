import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SupervisionCcClientesTable } from "./SupervisionCcClientesTable";
import type { ClienteCuenta } from "@/lib/api";

function ColumnHelp({ text }: { text: string }) {
  return <span data-testid="help">{text}</span>;
}

function makeRow(i: number, overrides: Partial<ClienteCuenta> = {}): ClienteCuenta {
  return {
    id_cliente_erp: `ERP-${i}`,
    cliente: `Cliente ${i}`,
    deuda_total: 1000 * i,
    antiguedad: i,
    cantidad_comprobantes: i,
    ...overrides,
  };
}

describe("SupervisionCcClientesTable", () => {
  it("renderiza todas las filas cuando la lista es corta", () => {
    const rows = [makeRow(1), makeRow(2), makeRow(3)];
    render(
      <SupervisionCcClientesTable
        rows={rows}
        rowKeyPrefix="v1"
        ccSort="deuda"
        ccSortDir="desc"
        selectedClienteErp={null}
        onToggleSort={vi.fn()}
        onSelectCliente={vi.fn()}
        onPrefetchDeudor={vi.fn()}
        columnHelp={ColumnHelp}
      />,
    );
    expect(screen.getByText("Cliente 1")).toBeTruthy();
    expect(screen.getByText("Cliente 2")).toBeTruthy();
    expect(screen.getByText("Cliente 3")).toBeTruthy();
  });

  it("virtualiza listas largas (solo subset en DOM)", () => {
    const rows = Array.from({ length: 60 }, (_, i) => makeRow(i + 1));
    render(
      <SupervisionCcClientesTable
        rows={rows}
        rowKeyPrefix="v-long"
        ccSort="antiguedad"
        ccSortDir="desc"
        selectedClienteErp={null}
        onToggleSort={vi.fn()}
        onSelectCliente={vi.fn()}
        onPrefetchDeudor={vi.fn()}
        columnHelp={ColumnHelp}
      />,
    );
    expect(screen.getByText("Cliente 1")).toBeTruthy();
    expect(screen.queryByText("Cliente 60")).toBeNull();
  });
});
