import { describe, it, expect } from "vitest";
import { calendarDayAR, daysSinceFechaAR, formatFechaDiaAR, parseFechaShelf } from "../fecha-ar";

describe("fecha-ar", () => {
  it("parseFechaShelf: YYYY-MM-DD no retrocede un día en AR", () => {
    const d = parseFechaShelf("2026-05-29");
    expect(d).not.toBeNull();
    expect(calendarDayAR(d!)).toBe("2026-05-29");
    expect(formatFechaDiaAR("2026-05-29")).toBe("29/05/2026");
  });

  it("new Date(iso) sin helper mostraría 28/05 en AR para 2026-05-29", () => {
    const naive = new Date("2026-05-29").toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    expect(naive).toBe("28/05/2026");
    expect(formatFechaDiaAR("2026-05-29")).toBe("29/05/2026");
  });

  it("daysSinceFechaAR usa días calendario AR", () => {
    const ref = parseFechaShelf("2026-05-31")!;
    expect(daysSinceFechaAR("2026-05-29", ref)).toBe(2);
    expect(daysSinceFechaAR("2026-05-28", ref)).toBe(3);
  });
});
