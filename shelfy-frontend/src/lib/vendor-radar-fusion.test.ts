import { describe, expect, it } from "vitest";
import {
  cexRadarValue,
  exhibitionCoveragePct,
  mergeFusionRadarFromRaw,
} from "@/lib/vendor-radar-fusion";
import type { RadarKPI, VendorRawKpis } from "@/lib/api";

const emptyRadar: RadarKPI = {
  pdvs: 0,
  altas: 0,
  exhibiciones: 0,
  compradores: 0,
  bultos: 0,
  cobertura: 0,
  objetivos: 0,
  pdvs_exhibidos: 0,
};

describe("exhibitionCoveragePct", () => {
  it("returns 0 when no exhibitions and stale cobertura_pct", () => {
    const raw: VendorRawKpis = {
      pdvs: 200,
      pdvs_exhibidos: 0,
      cobertura_pct: 12.5,
      exhibiciones: 0,
      altas: 0,
      compradores: 0,
      bultos: 0,
      objetivos_pct: 0,
    };
    expect(exhibitionCoveragePct(raw)).toBe(0);
  });

  it("calculates real pct from pdvs_exhibidos ÷ pdvs", () => {
    const raw: VendorRawKpis = {
      pdvs: 100,
      pdvs_exhibidos: 25,
      cobertura_pct: 0,
      exhibiciones: 10,
      altas: 0,
      compradores: 0,
      bultos: 0,
      objetivos_pct: 0,
    };
    expect(exhibitionCoveragePct(raw)).toBe(25);
  });

  it("uses cobertura_pct when backend sends it with exhibitions", () => {
    const raw: VendorRawKpis = {
      pdvs: 100,
      pdvs_exhibidos: 0,
      cobertura_pct: 42.5,
      exhibiciones: 30,
      altas: 0,
      compradores: 0,
      bultos: 0,
      objetivos_pct: 0,
    };
    expect(exhibitionCoveragePct(raw)).toBe(42.5);
  });
});

describe("cexRadarValue", () => {
  it("ignores radar compliance score (not raw coverage)", () => {
    const raw: VendorRawKpis = {
      pdvs: 150,
      pdvs_exhibidos: 0,
      cobertura_pct: 0,
      exhibiciones: 0,
      altas: 0,
      compradores: 0,
      bultos: 0,
      objetivos_pct: 0,
    };
    const radar: RadarKPI = { ...emptyRadar, pdvs_exhibidos: 22 };
    expect(cexRadarValue(raw, radar)).toBe(0);
  });

  it("reflects real coverage for active vendors", () => {
    const raw: VendorRawKpis = {
      pdvs: 255,
      pdvs_exhibidos: 63,
      cobertura_pct: 24.7,
      exhibiciones: 101,
      altas: 0,
      compradores: 0,
      bultos: 0,
      objetivos_pct: 0,
    };
    expect(cexRadarValue(raw, emptyRadar)).toBe(25);
  });
});

describe("mergeFusionRadarFromRaw", () => {
  it("sets CEX to 0 only when there is no exhibition activity", () => {
    const raw: VendorRawKpis = {
      pdvs: 180,
      pdvs_exhibidos: 0,
      cobertura_pct: 8,
      exhibiciones: 0,
      altas: 0,
      compradores: 0,
      bultos: 0,
      objetivos_pct: 0,
    };
    const radar: RadarKPI = { ...emptyRadar, pdvs: 90, pdvs_exhibidos: 15 };
    const merged = mergeFusionRadarFromRaw(radar, raw);
    expect(merged.pdvs_exhibidos).toBe(0);
  });
});
