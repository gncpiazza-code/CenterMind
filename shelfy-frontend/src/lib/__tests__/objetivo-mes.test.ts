/**
 * objetivo-mes.test.ts
 * ====================
 * Tests para resolveObjetivoMes() en lib/objetivo-utils.ts
 *
 * Verifica que el filtro de mes funcione consistentemente para
 * objetivos de compañía (mes_referencia) y distribuidora (fecha_objetivo → fallbacks).
 */
import { resolveObjetivoMes } from "../objetivo-utils";
import type { Objetivo } from "../api";

function mkObj(overrides: Partial<Objetivo>): Objetivo {
  return {
    id: "test-id",
    id_distribuidor: 1,
    tipo: "exhibicion",
    origen: "distribuidora",
    cumplido: false,
    valor_actual: 0,
    valor_objetivo: 100,
    descripcion: null,
    fecha_objetivo: null,
    fecha_inicio: null,
    lanzado_at: null,
    created_at: "2026-04-10T00:00:00Z",
    mes_referencia: null,
    resultado_final: null,
    ...overrides,
  } as Objetivo;
}

describe("resolveObjetivoMes", () => {
  // ── Compañía ──────────────────────────────────────────────────────────────

  it("compañía con mes_referencia completo → devuelve YYYY-MM", () => {
    const o = mkObj({ origen: "compania", mes_referencia: "2026-06-01" });
    expect(resolveObjetivoMes(o)).toBe("2026-06");
  });

  it("compañía con mes_referencia YYYY-MM-01 → devuelve YYYY-MM (slice)", () => {
    const o = mkObj({ origen: "compania", mes_referencia: "2026-05-01" });
    expect(resolveObjetivoMes(o)).toBe("2026-05");
  });

  it("compañía sin mes_referencia, tiene fecha_objetivo → usa fecha_objetivo", () => {
    const o = mkObj({ origen: "compania", mes_referencia: null, fecha_objetivo: "2026-07-31" });
    expect(resolveObjetivoMes(o)).toBe("2026-07");
  });

  it("compañía sin nada → devuelve created_at mes", () => {
    const o = mkObj({
      origen: "compania",
      mes_referencia: null,
      fecha_objetivo: null,
      fecha_inicio: null,
      created_at: "2026-04-15T10:00:00Z",
    });
    expect(resolveObjetivoMes(o)).toBe("2026-04");
  });

  // ── Distribuidora ────────────────────────────────────────────────────────

  it("distribuidora con fecha_objetivo → devuelve YYYY-MM de fecha_objetivo", () => {
    const o = mkObj({ origen: "distribuidora", fecha_objetivo: "2026-06-30" });
    expect(resolveObjetivoMes(o)).toBe("2026-06");
  });

  it("distribuidora sin fecha_objetivo, tiene fecha_inicio → fallback a fecha_inicio", () => {
    const o = mkObj({
      origen: "distribuidora",
      fecha_objetivo: null,
      fecha_inicio: "2026-05-01",
    });
    expect(resolveObjetivoMes(o)).toBe("2026-05");
  });

  it("distribuidora sin fecha_objetivo ni fecha_inicio → fallback a created_at", () => {
    const o = mkObj({
      origen: "distribuidora",
      fecha_objetivo: null,
      fecha_inicio: null,
      created_at: "2026-03-20T00:00:00Z",
    });
    expect(resolveObjetivoMes(o)).toBe("2026-03");
  });

  it("distribuidora sin ninguna fecha → devuelve null", () => {
    const o = mkObj({
      origen: "distribuidora",
      fecha_objetivo: null,
      fecha_inicio: null,
      created_at: null,
    });
    expect(resolveObjetivoMes(o)).toBeNull();
  });

  // ── Filtro mes consistente ────────────────────────────────────────────────

  it("filtro YYYY-MM matchea compañía por mes_referencia", () => {
    const objetivos = [
      mkObj({ origen: "compania", mes_referencia: "2026-06-01" }),
      mkObj({ origen: "compania", mes_referencia: "2026-05-01" }),
      mkObj({ origen: "distribuidora", fecha_objetivo: "2026-06-30" }),
    ];
    const filtrados = objetivos.filter(o => resolveObjetivoMes(o) === "2026-06");
    expect(filtrados).toHaveLength(2); // junio compañía + junio distribuidora
  });

  it("filtro no mezcla meses distintos entre compañía y distribuidora", () => {
    const objetivos = [
      mkObj({ origen: "compania", mes_referencia: "2026-06-01" }),
      mkObj({ origen: "distribuidora", fecha_objetivo: "2026-07-31" }),
    ];
    const filtradosJunio = objetivos.filter(o => resolveObjetivoMes(o) === "2026-06");
    expect(filtradosJunio).toHaveLength(1);
    expect(filtradosJunio[0]!.origen).toBe("compania");
  });
});
