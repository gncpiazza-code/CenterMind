import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { VisorGlassMaterial } from "../VisorGlassMaterial";

describe("VisorGlassMaterial — H1/H6 regression (no filter on refract layer)", () => {
  it("refract layer has NO SVG filter (fix for niebla blanca)", () => {
    const { container } = render(
      <VisorGlassMaterial>
        <span>test</span>
      </VisorGlassMaterial>,
    );

    // Layer A is the first aria-hidden div (refract)
    const refractLayer = container.querySelector(
      "[aria-hidden]",
    ) as HTMLElement | null;
    expect(refractLayer).toBeTruthy();

    const styleAttr = refractLayer?.getAttribute("style") ?? "";
    // Must NOT contain a CSS filter pointing to an SVG id
    expect(styleAttr).not.toMatch(/filter:\s*url\(/);
  });

  it("refract layer has backdropFilter in its style attribute", () => {
    const { container } = render(
      <VisorGlassMaterial>
        <span>test</span>
      </VisorGlassMaterial>,
    );
    const refractLayer = container.querySelector(
      "[aria-hidden]",
    ) as HTMLElement | null;
    // Check raw style attribute string for any backdrop-filter variant
    const styleAttr = refractLayer?.getAttribute("style") ?? "";
    expect(styleAttr).toMatch(/backdrop-filter/i);
  });

  it("data-glyph-mode defaults to 'dark'", () => {
    const { container } = render(
      <VisorGlassMaterial>
        <span>test</span>
      </VisorGlassMaterial>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-glyph-mode")).toBe("dark");
  });

  it("data-glyph-mode reflects glyphMode prop", () => {
    const { container } = render(
      <VisorGlassMaterial glyphMode="light">
        <span>test</span>
      </VisorGlassMaterial>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-glyph-mode")).toBe("light");
  });
});
