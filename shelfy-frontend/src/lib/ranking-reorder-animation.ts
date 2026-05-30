import type { ActiveRankMovement } from "@/lib/ranking-position-movement";
import { movementFromPositionChange } from "@/lib/ranking-position-movement";

/** Duración del reacomodo visual (fila grande + empuje) */
export const REORDER_ANIM_MS = 1_400;

/** Entrada rápida, salida suave — sensación más agresiva */
export const REORDER_EASE = [0.16, 0.9, 0.22, 1] as const;

export const PUSH_UP_SCALE_KEYFRAMES = [1, 1.07, 1.16, 1.12, 1.06, 1.02, 1] as const;
export const PUSH_UP_Y_KEYFRAMES = [0, -8, -18, -12, -5, -1, 0] as const;
export const PUSH_UP_SCALE_TIMES = [0, 0.1, 0.32, 0.52, 0.72, 0.9, 1] as const;

export const PUSH_DOWN_SCALE_KEYFRAMES = [1, 1.06, 1.14, 1.1, 1.04, 1.01, 1] as const;
export const PUSH_DOWN_Y_KEYFRAMES = [0, 6, 14, 10, 4, 1, 0] as const;
export const PUSH_DOWN_SCALE_TIMES = [0, 0.1, 0.32, 0.52, 0.72, 0.9, 1] as const;

/**
 * Todos los vendedores cuya posición cambió en el reshuffle del ranking.
 * Cada uno recibe subida (verde) o bajada (roja) según su delta individual.
 */
export function collectPositionChanges(
  previous: Map<string, number>,
  current: Map<string, number>,
): { changed: string[]; visuals: Map<string, ActiveRankMovement> } {
  const changed: string[] = [];
  const visuals = new Map<string, ActiveRankMovement>();

  current.forEach((newPos, vendedor) => {
    const oldPos = previous.get(vendedor);
    if (oldPos === undefined || oldPos === newPos) return;
    changed.push(vendedor);
    const movement = movementFromPositionChange(oldPos, newPos);
    if (movement) visuals.set(vendedor, movement);
  });

  return { changed, visuals };
}
