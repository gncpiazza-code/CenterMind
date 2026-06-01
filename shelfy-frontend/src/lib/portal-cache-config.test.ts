import { describe, expect, it } from "vitest";
import { canAccessModule, resolveModuleFromPath } from "@/lib/portal-cache-config";

describe("portal-cache-config", () => {
  it("resolveModuleFromPath reconoce rutas P0", () => {
    expect(resolveModuleFromPath("/dashboard")).toBe("dashboard");
    expect(resolveModuleFromPath("/estadisticas/foo")).toBe("estadisticas");
    expect(resolveModuleFromPath("/objetivos")).toBeNull();
  });

  it("canAccessModule respeta permiso dashboard", () => {
    const has = (k: string) => k === "menu_dashboard";
    expect(canAccessModule("dashboard", "supervisor", has)).toBe(true);
    expect(canAccessModule("dashboard", "evaluador", () => false)).toBe(false);
  });
});
