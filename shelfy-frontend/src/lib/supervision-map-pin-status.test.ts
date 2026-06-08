import { describe, expect, it } from "vitest";
import { getPinStatus, type PinCliente } from "@/components/admin/MapaRutas";

function pin(partial: Partial<PinCliente> & Pick<PinCliente, "activo" | "conExhibicion">): PinCliente {
  return {
    id: 1,
    lat: 0,
    lng: 0,
    nombre: "Test",
    color: "#000",
    vendedor: "V",
    ultimaCompra: null,
    ...partial,
  };
}

describe("supervision map pin status (30d exhibición)", () => {
  it("tiene_exhibicion_reciente=false → no activo_exhibicion", () => {
    expect(getPinStatus(pin({ activo: true, conExhibicion: false }))).toBe("activo");
    expect(getPinStatus(pin({ activo: false, conExhibicion: false }))).toBe("inactivo");
  });

  it("tiene_exhibicion_reciente=true → estados con exhibición", () => {
    expect(getPinStatus(pin({ activo: true, conExhibicion: true }))).toBe("activo_exhibicion");
    expect(getPinStatus(pin({ activo: false, conExhibicion: true }))).toBe("inactivo_exhibicion");
  });
});
