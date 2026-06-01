/** Sesión warm backend — evita import circular con portal-cache-queries. */
let warmSentForDist: number | null = null;

export function resetPortalWarmSession(): void {
  warmSentForDist = null;
  try {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("shelfy-portal-warm-session");
    }
  } catch {
    /* ignore */
  }
}

export function markPortalWarmSent(distId: number): boolean {
  if (warmSentForDist === distId) return false;
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem("shelfy-portal-warm-session");
      if (raw === String(distId)) {
        warmSentForDist = distId;
        return false;
      }
      sessionStorage.setItem("shelfy-portal-warm-session", String(distId));
    } catch {
      /* private mode */
    }
  }
  warmSentForDist = distId;
  return true;
}

export function wasPortalWarmSent(distId: number): boolean {
  return warmSentForDist === distId;
}
