/** Duración visible de una flecha tras un cambio de posición */
export const RANK_MOVEMENT_TTL_MS = 8 * 60 * 60 * 1000;

export type RankMovementDirection = "up" | "down";

export type ActiveRankMovement = {
  direction: RankMovementDirection;
  positions: number;
  changedAt: number;
};

type PersistedScopeState = {
  badges: Record<string, ActiveRankMovement>;
  lastPositions: Record<string, number>;
};

export function buildRankPositionMap(rows: { vendedor: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  rows.forEach((r, i) => map.set(r.vendedor, i + 1));
  return map;
}

export function movementStorageKey(
  distId: number,
  periodo: string,
  sucursalFiltro: string,
): string {
  return `shelfy-rank-movement:v1:${distId}:${periodo}:${sucursalFiltro || "all"}`;
}

function pruneBadges(
  badges: Record<string, ActiveRankMovement>,
  now = Date.now(),
): Record<string, ActiveRankMovement> {
  const out: Record<string, ActiveRankMovement> = {};
  for (const [v, b] of Object.entries(badges)) {
    if (now - b.changedAt < RANK_MOVEMENT_TTL_MS) out[v] = b;
  }
  return out;
}

export function loadMovementScopeState(key: string): PersistedScopeState {
  if (typeof window === "undefined") {
    return { badges: {}, lastPositions: {} };
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { badges: {}, lastPositions: {} };
    const parsed = JSON.parse(raw) as PersistedScopeState;
    return {
      badges: pruneBadges(parsed.badges ?? {}),
      lastPositions: parsed.lastPositions ?? {},
    };
  } catch {
    return { badges: {}, lastPositions: {} };
  }
}

export function saveMovementScopeState(
  key: string,
  state: PersistedScopeState,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        badges: pruneBadges(state.badges),
        lastPositions: state.lastPositions,
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function movementFromPositionChange(
  previousPos: number,
  currentPos: number,
): ActiveRankMovement | null {
  const diff = previousPos - currentPos;
  if (diff === 0) return null;
  return {
    direction: diff > 0 ? "up" : "down",
    positions: Math.abs(diff),
    changedAt: Date.now(),
  };
}

export function mapToRecord(map: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  map.forEach((pos, v) => {
    out[v] = pos;
  });
  return out;
}

export function recordToMap(record: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(record));
}

export function isMovementActive(
  movement: ActiveRankMovement | undefined,
  now = Date.now(),
): movement is ActiveRankMovement {
  return !!movement && now - movement.changedAt < RANK_MOVEMENT_TTL_MS;
}

export function applyRankingPositionChanges(
  current: Map<string, number>,
  previous: Map<string, number>,
  badges: Record<string, ActiveRankMovement>,
): Record<string, ActiveRankMovement> {
  const next = pruneBadges({ ...badges });
  current.forEach((pos, vendedor) => {
    const prevPos = previous.get(vendedor);
    if (prevPos === undefined || prevPos === pos) return;
    const movement = movementFromPositionChange(prevPos, pos);
    if (movement) next[vendedor] = movement;
  });
  return next;
}
