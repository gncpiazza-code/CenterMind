import { describe, it, expect, afterEach } from "vitest";
import { shouldThrottlePrefetch } from "@/lib/portal-idle-scheduler";
import { BACKGROUND_MODULE_ORDER, ROUTE_PREFETCH_ORDER } from "@/lib/portal-cache-config";

describe("shouldThrottlePrefetch", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it("returns true when saveData is true", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { connection: { saveData: true, effectiveType: "4g" } },
      writable: true,
      configurable: true,
    });
    expect(shouldThrottlePrefetch()).toBe(true);
  });

  it("returns true on 2g connection", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { connection: { saveData: false, effectiveType: "2g" } },
      writable: true,
      configurable: true,
    });
    expect(shouldThrottlePrefetch()).toBe(true);
  });

  it("returns true on 3g connection", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { connection: { saveData: false, effectiveType: "3g" } },
      writable: true,
      configurable: true,
    });
    expect(shouldThrottlePrefetch()).toBe(true);
  });

  it("returns false on 4g connection", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { connection: { saveData: false, effectiveType: "4g" } },
      writable: true,
      configurable: true,
    });
    expect(shouldThrottlePrefetch()).toBe(false);
  });

  it("returns false when navigator.connection is undefined", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      writable: true,
      configurable: true,
    });
    expect(shouldThrottlePrefetch()).toBe(false);
  });
});

describe("BACKGROUND_MODULE_ORDER", () => {
  it("starts with dashboard", () => {
    expect(BACKGROUND_MODULE_ORDER[0]).toBe("dashboard");
  });

  it("follows order: dashboard → visor → estadisticas → supervision", () => {
    expect(Array.from(BACKGROUND_MODULE_ORDER)).toEqual([
      "dashboard",
      "visor",
      "estadisticas",
      "supervision",
    ]);
  });
});

describe("ROUTE_PREFETCH_ORDER", () => {
  it("starts with /dashboard", () => {
    expect(ROUTE_PREFETCH_ORDER[0]).toBe("/dashboard");
  });

  it("has 4 routes in correct order", () => {
    expect(Array.from(ROUTE_PREFETCH_ORDER)).toEqual([
      "/dashboard",
      "/visor",
      "/estadisticas",
      "/supervision",
    ]);
  });
});
