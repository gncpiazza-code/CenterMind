import { describe, it, expect } from "vitest";
import { glyphMode, sampleBackdropLuma } from "../visor-glass-luminance";

describe("glyphMode", () => {
  it("returns 'light' for bright backdrop (luma > 0.55)", () => {
    expect(glyphMode(0.8)).toBe("light");
    expect(glyphMode(0.56)).toBe("light");
    expect(glyphMode(1.0)).toBe("light");
  });

  it("returns 'dark' for dark backdrop (luma ≤ 0.55)", () => {
    expect(glyphMode(0.0)).toBe("dark");
    expect(glyphMode(0.2)).toBe("dark");
    expect(glyphMode(0.55)).toBe("dark");
  });

  it("uses 0.55 as the exact threshold", () => {
    expect(glyphMode(0.55)).toBe("dark");
    expect(glyphMode(0.551)).toBe("light");
  });
});

describe("sampleBackdropLuma", () => {
  it("returns 0.2 when img is null", () => {
    const r = new DOMRect(0, 0, 100, 50);
    expect(sampleBackdropLuma(null, r, r)).toBe(0.2);
  });

  it("returns 0.2 when img is not complete", () => {
    const img = {} as HTMLImageElement;
    Object.defineProperty(img, "complete", { value: false });
    Object.defineProperty(img, "naturalWidth", { value: 0 });
    const r = new DOMRect(0, 0, 100, 50);
    expect(sampleBackdropLuma(img, r, r)).toBe(0.2);
  });

  it("returns 0.2 when img has zero natural width", () => {
    const img = { complete: true, naturalWidth: 0 } as HTMLImageElement;
    const r = new DOMRect(0, 0, 100, 50);
    expect(sampleBackdropLuma(img, r, r)).toBe(0.2);
  });
});
