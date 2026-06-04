// Mirror TypeScript del agrupador backend galeria_publicaciones.py
// Agrupa filas de exhibiciones en publicaciones por día (dia_ar).

export interface GaleriaFotoPublicacion {
  id_exhibicion: number;
  url_foto: string;
  estado: string;
  timestamp_subida: string;
  comentario?: string | null;
  supervisor?: string | null;
}

export interface GaleriaPublicacion {
  dia_ar: string; // YYYY-MM-DD
  fotos: GaleriaFotoPublicacion[];
  estado_dia: string;
  total_fotos: number;
}

const ESTADO_SCORE: Record<string, number> = {
  Destacado: 3,
  Destacada: 3,
  Aprobado: 2,
  Aprobada: 2,
  Rechazado: 1,
  Rechazada: 1,
  Pendiente: 0,
};

export function scoreEstadoExhibicion(estado: string | null | undefined): number {
  const key = (estado ?? "").trim();
  if (!key) return 0;
  return ESTADO_SCORE[key] ?? ESTADO_SCORE[key[0]?.toUpperCase() + key.slice(1).toLowerCase()] ?? 0;
}

export function isEstadoExhibicionPendiente(estado: string | null | undefined): boolean {
  return scoreEstadoExhibicion(estado) <= 0;
}

/** Foto con mayor score del día (la evaluación lógica vigente). */
export function pickFotoEvaluadaParaReeval(
  fotos: GaleriaFotoPublicacion[],
): GaleriaFotoPublicacion | null {
  let best: GaleriaFotoPublicacion | null = null;
  let bestScore = 0;
  for (const foto of fotos) {
    const score = scoreEstadoExhibicion(foto.estado);
    if (score > bestScore) {
      bestScore = score;
      best = foto;
    }
  }
  return bestScore > 0 ? best : null;
}

type RawExhibicionRow = {
  id_exhibicion: number;
  url_foto_drive?: string | null;
  url_foto?: string | null;
  estado?: string | null;
  timestamp_subida?: string | null;
  comentario_evaluacion?: string | null;
  supervisor_nombre?: string | null;
};

/**
 * Agrupa filas crudas de exhibiciones en publicaciones por día (dia_ar).
 *
 * Reglas:
 * - dia_ar = primeros 10 chars de timestamp_subida (YYYY-MM-DD)
 * - Dentro de cada grupo: fotos ordenadas por timestamp_subida asc
 * - estado_dia = estado con mayor score del grupo
 * - Retorna días ordenados asc por dia_ar
 */
export function groupTimelinePublicaciones(
  rows: RawExhibicionRow[],
): GaleriaPublicacion[] {
  const byDay = new Map<string, GaleriaFotoPublicacion[]>();

  for (const row of rows) {
    const ts = row.timestamp_subida ?? "";
    const dia_ar = ts.length >= 10 ? ts.slice(0, 10) : "0000-00-00";
    const url = row.url_foto_drive ?? row.url_foto ?? "";
    const estado = row.estado ?? "Pendiente";

    const foto: GaleriaFotoPublicacion = {
      id_exhibicion: row.id_exhibicion,
      url_foto: url,
      estado,
      timestamp_subida: ts,
      comentario: row.comentario_evaluacion ?? null,
      supervisor: row.supervisor_nombre ?? null,
    };

    const existing = byDay.get(dia_ar);
    if (existing) {
      existing.push(foto);
    } else {
      byDay.set(dia_ar, [foto]);
    }
  }

  // Ordenar días asc
  const sortedDays = Array.from(byDay.keys()).sort();

  return sortedDays.map((dia_ar) => {
    const fotos = byDay.get(dia_ar)!;

    // Ordenar fotos por timestamp_subida asc
    fotos.sort((a, b) => a.timestamp_subida.localeCompare(b.timestamp_subida));

    // estado_dia = max score del día
    let maxScore = -1;
    let estadoDia = "Pendiente";
    for (const foto of fotos) {
      const score = scoreEstadoExhibicion(foto.estado);
      if (score > maxScore) {
        maxScore = score;
        estadoDia = foto.estado;
      }
    }

    return {
      dia_ar,
      fotos,
      estado_dia: estadoDia,
      total_fotos: fotos.length,
    };
  });
}
