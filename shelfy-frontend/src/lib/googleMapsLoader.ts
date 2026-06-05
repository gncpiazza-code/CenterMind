import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

/** Lee la key en runtime (evita quedar vacía tras HMR si el módulo se evaluó antes del .env). */
function readGoogleMapsApiKey(): string {
  const raw =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAP_KEY ??
    "";
  return String(raw).trim();
}

let configured = false;
let authFailed = false;
let authFailureHandlerInstalled = false;
const authFailureListeners = new Set<() => void>();

export function getGoogleMapsApiKey(): string {
  return readGoogleMapsApiKey();
}

export function isGoogleMapsAlreadyLoaded(): boolean {
  return typeof window !== "undefined" && Boolean(window.google?.maps);
}

export function hasGoogleMapsApiKey(): boolean {
  return Boolean(readGoogleMapsApiKey()) || isGoogleMapsAlreadyLoaded();
}

export function isGoogleMapsAuthFailed(): boolean {
  return authFailed;
}

export function subscribeGoogleMapsAuthFailure(cb: () => void): () => void {
  authFailureListeners.add(cb);
  return () => {
    authFailureListeners.delete(cb);
  };
}

export function notifyGoogleMapsAuthFailure(): void {
  if (authFailed) return;
  authFailed = true;
  for (const cb of authFailureListeners) cb();
}

/** Dominio actual — útil para mensajes de whitelist en Google Cloud Console. */
export function currentMapsReferrerHost(): string {
  if (typeof window === "undefined") return "shelfycenter.com";
  return window.location.hostname || "shelfycenter.com";
}

export function googleMapsReferrerWhitelistHint(): string {
  const host = currentMapsReferrerHost();
  return `https://${host}/*, https://shelfycenter.com/*, http://localhost:3000/*`;
}

function installGoogleMapsAuthFailureHandler(): void {
  if (typeof window === "undefined" || authFailureHandlerInstalled) return;
  authFailureHandlerInstalled = true;
  (window as Window & { gm_authFailure?: () => void }).gm_authFailure = () => {
    notifyGoogleMapsAuthFailure();
  };
}

export function ensureGoogleMapsConfigured(): void {
  installGoogleMapsAuthFailureHandler();
  const key = readGoogleMapsApiKey();
  if (!configured && key) {
    setOptions({
      key,
      v: "weekly",
      // Necesario con keys restringidas por referrer tras cambio de dominio (shelfycenter.com).
      authReferrerPolicy: "origin",
    });
    configured = true;
  }
}

/** Carga la librería `maps` (marcador único, panel deudor, galería). */
export async function loadGoogleMapsLibrary(
  lib: "maps" | "drawing" | "geometry" = "maps",
): Promise<void> {
  if (isGoogleMapsAlreadyLoaded() && lib === "maps") {
    ensureGoogleMapsConfigured();
    return;
  }

  const key = readGoogleMapsApiKey();
  if (!key) throw new Error("NO_GOOGLE_MAPS_KEY");
  ensureGoogleMapsConfigured();
  await importLibrary(lib);
}

/** Carga maps + geometry (MapaRutas — sin drawing library, deprecada en Maps 3.65+). */
export async function loadGoogleMapsFull(): Promise<void> {
  const key = readGoogleMapsApiKey();
  if (!key && !isGoogleMapsAlreadyLoaded()) throw new Error("NO_GOOGLE_MAPS_KEY");
  ensureGoogleMapsConfigured();
  await importLibrary("maps");
  await importLibrary("geometry");
}
