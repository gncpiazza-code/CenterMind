import { describe, it, expect } from "vitest";
import { pickLensStrategy } from "../visor-glass-lens-strategy";
import { resolveGlassAnchor } from "../visor-glass-placement";

describe("pickLensStrategy", () => {
  it("returns 'none' in jsdom (no Chromium/Firefox WebGL)", () => {
    // jsdom: no chrome key in window, no WebGL support → 'none'
    expect(pickLensStrategy()).toBe("none");
  });
});

describe("resolveGlassAnchor", () => {
  it("returns default when rects are null", () => {
    const a = resolveGlassAnchor(null, null);
    expect(a.reason).toBe("default");
    expect(a.bottomPx).toBe(16);
  });

  it("returns default when pill is fully inside image", () => {
    // Shell 400×600, image occupies full shell, pill at bottom-16 is inside
    const imgRect = new DOMRect(0, 0, 400, 600);
    const shellRect = new DOMRect(0, 0, 400, 600);
    const a = resolveGlassAnchor(imgRect, shellRect);
    expect(a.reason).toBe("default");
  });

  it("raises pill when more than 40% falls below image bottom", () => {
    // Shell 400×800, image only 200px tall from top
    // Pill at bottom-16: pillBottom = 800-16 = 784, pillTop = 784-56 = 728
    // imageBtm = 200 → belowImagePx = 784-200 = 584, ratio = 584/56 > 0.4 → raise
    const imgRect = new DOMRect(0, 0, 400, 200);
    const shellRect = new DOMRect(0, 0, 400, 800);
    const a = resolveGlassAnchor(imgRect, shellRect);
    expect(a.reason).not.toBe("default");
    expect(a.bottomPx).toBeGreaterThan(16);
  });

  it("raises pill when pill is entirely below image", () => {
    // Shell 400×400, image only top 50px, pill at bottom would be below image
    const imgRect = new DOMRect(0, 0, 400, 50);
    const shellRect = new DOMRect(0, 0, 400, 400);
    const a = resolveGlassAnchor(imgRect, shellRect);
    expect(a.reason).not.toBe("default");
  });
});
