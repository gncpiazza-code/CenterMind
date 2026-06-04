import { describe, expect, it, vi, afterEach } from "vitest";
import type { Objetivo } from "@/lib/api";
import { buildProrrateoGrid, isoDate, todayLocal } from "@/lib/objetivo-utils";

function makeObj(overrides: Partial<Objetivo> = {}): Objetivo {
  return {
    id: 1,
    id_distribuidor: 3,
    id_vendedor: 10,
    tipo: "ruteo_alteo",
    origen: "compania",
    mes_referencia: "2026-06-01",
    valor_objetivo: 60,
    valor_actual: 3,
    fecha_objetivo: "2026-06-30",
    fecha_inicio: "2026-06-02",
    lanzado_at: "2026-06-02T10:00:00Z",
    created_at: "2026-06-02T10:00:00Z",
    desglose_cache: {
      progreso_diario: {
        "2026-06-02": 2,
        "2026-06-03": 1,
      },
    },
    cumplido: false,
    ...overrides,
  } as Objetivo;
}

describe("buildProrrateoGrid rolling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("recalcula meta de hoy y futuro según pendiente / días restantes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));

    const grid = buildProrrateoGrid(makeObj());
    expect(grid).not.toBeNull();

    const findCelda = (iso: string) => {
      for (const semana of grid!.semanas) {
        for (const celda of semana.celdas) {
          if (celda && celda !== "pre" && typeof celda === "object" && celda.dia.iso === iso) {
            return celda;
          }
        }
      }
      return null;
    };

    const celdaMar = findCelda("2026-06-02");
    const celdaMie = findCelda("2026-06-03");
    const celdaJue = findCelda("2026-06-04");

    expect(celdaMar && celdaMar !== "pre" && typeof celdaMar === "object").toBe(true);
    expect(celdaMie && celdaMie !== "pre" && typeof celdaMie === "object").toBe(true);
    expect(celdaJue && celdaJue !== "pre" && typeof celdaJue === "object").toBe(true);

    expect(celdaMar).toBeTruthy();
    expect(celdaMie).toBeTruthy();
    expect(celdaJue).toBeTruthy();

    expect(celdaMar!.avanceDia).toBe(2);
    expect(celdaMar!.metaDia).toBeCloseTo(2.4, 5);

    expect(celdaMie!.avanceDia).toBe(1);
    expect(celdaMie!.metaDia).toBeCloseTo(57 / 24, 5);

    expect(celdaJue!.avanceDia).toBe(0);
    expect(celdaJue!.metaDia).toBeCloseTo(57 / 24, 5);

    expect(grid!.restante).toBe(57);
    expect(grid!.metaDiariaFutura).toBeCloseTo(57 / 24, 5);
    expect(grid!.futuros).toBe(23);
  });

  it("mantiene la misma meta plana en todos los días futuros del mes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));

    const grid = buildProrrateoGrid(
      makeObj({
        tipo: "exhibicion",
        mes_referencia: "2026-06-01",
        valor_objetivo: 100,
        valor_actual: 35,
        desglose_cache: {
          progreso_diario: {
            "2026-06-01": 10,
            "2026-06-02": 13,
            "2026-06-03": 0,
          },
        },
      }),
    );

    const findCelda = (iso: string) => {
      for (const semana of grid!.semanas) {
        for (const celda of semana.celdas) {
          if (celda && celda !== "pre" && typeof celda === "object" && celda.dia.iso === iso) {
            return celda;
          }
        }
      }
      return null;
    };

    const metaEsperada = 65 / 24;
    expect(findCelda("2026-06-04")!.metaDia).toBeCloseTo(metaEsperada, 5);
    expect(findCelda("2026-06-27")!.metaDia).toBeCloseTo(metaEsperada, 5);
    expect(findCelda("2026-06-04")!.metaDia).toBeCloseTo(
      findCelda("2026-06-27")!.metaDia,
      5,
    );
  });

  it("expone días futuros sin contar hoy", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));
    const grid = buildProrrateoGrid(makeObj());
    expect(grid!.futuros).toBe(23);
  });

  it("recalcula meta futura con valor_actual aunque progreso_diario no incluya pendientes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));

    const grid = buildProrrateoGrid(
      makeObj({
        tipo: "exhibicion",
        valor_objetivo: 100,
        valor_actual: 30,
        desglose_cache: {
          progreso_diario: {
            "2026-06-02": 10,
            "2026-06-03": 10,
          },
        },
      }),
    );

    expect(grid).not.toBeNull();
    expect(grid!.restante).toBe(70);
    expect(grid!.metaDiariaFutura).toBeCloseTo(70 / 24, 5);
  });
});

describe("isoDate", () => {
  it("formatea fecha local", () => {
    expect(isoDate(todayLocal())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
