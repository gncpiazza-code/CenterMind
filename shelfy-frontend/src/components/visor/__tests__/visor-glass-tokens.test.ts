import { describe, it, expect } from "vitest";
import { GLASS_TOKENS } from "../visor-glass-tokens";

describe("GLASS_TOKENS", () => {
  it("clear variant has lower blur than regular", () => {
    const clearBlur = parseInt(GLASS_TOKENS.clear.blur);
    const regularBlur = parseInt(GLASS_TOKENS.regular.blur);
    expect(clearBlur).toBeLessThan(regularBlur);
  });

  it("clear tint is near-zero (≤ 2%)", () => {
    const match = GLASS_TOKENS.clear.tint.match(/[\d.]+\)$/);
    const opacity = match ? parseFloat(match[0]) : 1;
    expect(opacity).toBeLessThanOrEqual(0.02);
  });

  it("regular tint is higher than clear", () => {
    const parseOpacity = (s: string) => {
      const m = s.match(/[\d.]+\)$/);
      return m ? parseFloat(m[0]) : 0;
    };
    expect(parseOpacity(GLASS_TOKENS.regular.tint)).toBeGreaterThan(
      parseOpacity(GLASS_TOKENS.clear.tint),
    );
  });

  it("clear enables lens by default; regular does not", () => {
    expect(GLASS_TOKENS.clear.enableLens).toBe(true);
    expect(GLASS_TOKENS.regular.enableLens).toBe(false);
  });

  it("clear has a lensScale > 0", () => {
    expect(GLASS_TOKENS.clear.lensScale).toBeGreaterThan(0);
  });

  it("regular lensScale is 0", () => {
    expect(GLASS_TOKENS.regular.lensScale).toBe(0);
  });

  it("rim opacity is between 0.1 and 0.5 for both variants", () => {
    for (const variant of ["clear", "regular"] as const) {
      expect(GLASS_TOKENS[variant].rimOpacity).toBeGreaterThan(0.1);
      expect(GLASS_TOKENS[variant].rimOpacity).toBeLessThan(0.5);
    }
  });

  it("shadow contains two comma-separated shadow values for both variants", () => {
    for (const variant of ["clear", "regular"] as const) {
      const parts = GLASS_TOKENS[variant].shadow.split(",");
      expect(parts.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("radius and radiusCompact are positive", () => {
    for (const variant of ["clear", "regular"] as const) {
      expect(GLASS_TOKENS[variant].radius).toBeGreaterThan(0);
      expect(GLASS_TOKENS[variant].radiusCompact).toBeGreaterThan(0);
    }
  });
});
