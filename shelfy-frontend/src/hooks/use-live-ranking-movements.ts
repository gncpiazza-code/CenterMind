"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { VendedorRanking } from "@/lib/api";
import {
  type ActiveRankMovement,
  applyRankingPositionChanges,
  buildRankPositionMap,
  isMovementActive,
  loadMovementScopeState,
  mapToRecord,
  movementStorageKey,
  recordToMap,
  saveMovementScopeState,
} from "@/lib/ranking-position-movement";
import {
  REORDER_ANIM_MS,
  collectPositionChanges,
} from "@/lib/ranking-reorder-animation";

const EXPIRY_TICK_MS = 60_000;
const REORDER_TICK_MS = 48;

function badgesEqual(
  a: Record<string, ActiveRankMovement>,
  b: Record<string, ActiveRankMovement>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => {
    const x = a[k];
    const y = b[k];
    return y && x.direction === y.direction && x.positions === y.positions && x.changedAt === y.changedAt;
  });
}

export interface LiveRankingMotionState {
  movements: Map<string, ActiveRankMovement>;
  /** Todos los que cambiaron de posición (subida o bajada) con su flecha/borde */
  moverVisuals: Map<string, ActiveRankMovement>;
  /** Vendedores en animación de reacomodo */
  pushing: Set<string>;
  reorderActive: boolean;
  animTick: number;
}

/**
 * Detecta cambios de posición en el ranking (p. ej. tras WS/refetch),
 * muestra flechas 8h y animación para todos los afectados (subidas y bajadas).
 */
export function useLiveRankingMovements(
  ranking: VendedorRanking[],
  distId: number,
  periodo: string,
  sucursalFiltro: string,
): LiveRankingMotionState {
  const storageKey = movementStorageKey(distId, periodo, sucursalFiltro);
  const lastSnapshotRef = useRef<Map<string, number> | null>(null);
  const reorderClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [badges, setBadges] = useState<Record<string, ActiveRankMovement>>({});
  const [now, setNow] = useState(() => Date.now());
  const [pushing, setPushing] = useState<Set<string>>(() => new Set());
  const [moverVisuals, setMoverVisuals] = useState<Map<string, ActiveRankMovement>>(
    () => new Map(),
  );
  const [reorderActive, setReorderActive] = useState(false);
  const [animTick, setAnimTick] = useState(0);

  const startReorderAnim = useCallback((changed: string[], visuals: Map<string, ActiveRankMovement>) => {
    if (changed.length === 0) return;
    setPushing(new Set(changed));
    setMoverVisuals(visuals);
    setReorderActive(true);
    setAnimTick((t) => t + 1);
    if (reorderClearRef.current) clearTimeout(reorderClearRef.current);
    reorderClearRef.current = setTimeout(() => {
      setPushing(new Set());
      setMoverVisuals(new Map());
      setReorderActive(false);
    }, REORDER_ANIM_MS + 80);
  }, []);

  useEffect(() => {
    const loaded = loadMovementScopeState(storageKey);
    setBadges(loaded.badges);
    lastSnapshotRef.current =
      Object.keys(loaded.lastPositions).length > 0
        ? recordToMap(loaded.lastPositions)
        : null;
  }, [storageKey]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), EXPIRY_TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!reorderActive) return;
    const id = setInterval(() => setAnimTick((t) => t + 1), REORDER_TICK_MS);
    return () => clearInterval(id);
  }, [reorderActive]);

  useEffect(() => {
    return () => {
      if (reorderClearRef.current) clearTimeout(reorderClearRef.current);
    };
  }, []);

  useEffect(() => {
    if (!distId || ranking.length === 0) return;

    const current = buildRankPositionMap(ranking);
    const previous = lastSnapshotRef.current;

    if (previous === null) {
      lastSnapshotRef.current = current;
      const loaded = loadMovementScopeState(storageKey);
      saveMovementScopeState(storageKey, {
        badges: loaded.badges,
        lastPositions: mapToRecord(current),
      });
      return;
    }

    const { changed, visuals } = collectPositionChanges(previous, current);

    setBadges((prev) => {
      const next = applyRankingPositionChanges(current, previous, prev);
      saveMovementScopeState(storageKey, {
        badges: next,
        lastPositions: mapToRecord(current),
      });
      return badgesEqual(prev, next) ? prev : next;
    });

    lastSnapshotRef.current = current;

    if (changed.length > 0) {
      startReorderAnim(changed, visuals);
    }
  }, [ranking, distId, storageKey, startReorderAnim]);

  const movements = useMemo(() => {
    const active = new Map<string, ActiveRankMovement>();
    for (const [v, m] of Object.entries(badges)) {
      if (isMovementActive(m, now)) active.set(v, m);
    }
    return active;
  }, [badges, now]);

  const displayMovements = useMemo(() => {
    const merged = new Map<string, ActiveRankMovement>(moverVisuals);
    for (const [v, m] of movements) {
      merged.set(v, m);
    }
    return merged;
  }, [movements, moverVisuals]);

  return {
    movements,
    moverVisuals: displayMovements,
    pushing,
    reorderActive,
    animTick,
  };
}
