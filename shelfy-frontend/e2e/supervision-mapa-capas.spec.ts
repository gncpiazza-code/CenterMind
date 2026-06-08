import { test, expect } from "@playwright/test";

/**
 * E2E mapa supervisión — capas My Maps.
 * Requiere auth portal + dist de prueba; marcar skip en CI sin credenciales.
 */
test.describe.skip("supervision mapa capas", () => {
  test("dibujar polígono, guardar capa, toggle visibilidad", async ({ page }) => {
    await page.goto("/admin");
    // TODO: login + navegar supervisión mapa + crear_rutas flow
    await expect(page.getByText("Crear Rutas")).toBeVisible();
  });
});
