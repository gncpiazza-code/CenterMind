export function scheduleWhenIdle(cb: () => void): void {
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(cb, { timeout: 2000 });
  } else {
    setTimeout(cb, 1);
  }
}

export function shouldThrottlePrefetch(): boolean {
  if (typeof navigator === "undefined") return false;
  const c = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!c) return false;
  if (c.saveData) return true;
  return ["slow-2g", "2g", "3g"].includes(c.effectiveType ?? "");
}
