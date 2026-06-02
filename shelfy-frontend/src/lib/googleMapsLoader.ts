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

export function getGoogleMapsApiKey(): string {
  return readGoogleMapsApiKey();
}

export function isGoogleMapsAlreadyLoaded(): boolean {
  return typeof window !== "undefined" && Boolean(window.google?.maps);
}

export function hasGoogleMapsApiKey(): boolean {
  return Boolean(readGoogleMapsApiKey()) || isGoogleMapsAlreadyLoaded();
}

export function ensureGoogleMapsConfigured(): void {
  const key = readGoogleMapsApiKey();
  if (!configured && key) {
    setOptions({ key, v: "weekly" });
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

/** Carga maps + drawing + geometry (MapaRutas). */
export async function loadGoogleMapsFull(): Promise<void> {
  const key = readGoogleMapsApiKey();
  if (!key && !isGoogleMapsAlreadyLoaded()) throw new Error("NO_GOOGLE_MAPS_KEY");
  ensureGoogleMapsConfigured();
  await importLibrary("maps");
  await importLibrary("drawing");
  await importLibrary("geometry");
}
