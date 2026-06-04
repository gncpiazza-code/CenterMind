import { describe, expect, it } from "vitest";
import {
  groupTimelinePublicaciones,
  pickFotoEvaluadaParaReeval,
} from "@/lib/galeria-publicaciones";

describe("pickFotoEvaluadaParaReeval", () => {
  it("elige la foto evaluada aunque la primera del día sea Pendiente", () => {
    const pub = groupTimelinePublicaciones([
      {
        id_exhibicion: 1,
        url_foto_drive: "a",
        estado: "Pendiente",
        timestamp_subida: "2026-06-01T09:00:00",
      },
      {
        id_exhibicion: 2,
        url_foto_drive: "b",
        estado: "Aprobada",
        timestamp_subida: "2026-06-01T10:00:00",
      },
    ])[0]!;

    const foto = pickFotoEvaluadaParaReeval(pub.fotos);
    expect(foto?.id_exhibicion).toBe(2);
    expect(foto?.estado).toBe("Aprobada");
  });

  it("retorna null si todas las fotos están pendientes", () => {
    const pub = groupTimelinePublicaciones([
      {
        id_exhibicion: 1,
        url_foto_drive: "a",
        estado: "Pendiente",
        timestamp_subida: "2026-06-01T09:00:00",
      },
    ])[0]!;

    expect(pickFotoEvaluadaParaReeval(pub.fotos)).toBeNull();
  });
});
