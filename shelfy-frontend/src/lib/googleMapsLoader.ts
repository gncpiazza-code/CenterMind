import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

let configured = false;

export function getGoogleMapsApiKey(): string {
  return GMAPS_KEY;
}

export function hasGoogleMapsApiKey(): boolean {
  return Boolean(GMAPS_KEY);
}

export function ensureGoogleMapsConfigured(): void {
  if (!configured && GMAPS_KEY) {
    setOptions({ key: GMAPS_KEY, v: "weekly" });
    configured = true;
  }
}

/** Carga la librería `maps` (marcador único, panel deudor). */
export async function loadGoogleMapsLibrary(
  lib: "maps" | "drawing" | "geometry" = "maps",
): Promise<void> {
  if (!GMAPS_KEY) throw new Error("NO_GOOGLE_MAPS_KEY");
  ensureGoogleMapsConfigured();
  await importLibrary(lib);
}

/** Carga maps + drawing + geometry (MapaRutas). */
export async function loadGoogleMapsFull(): Promise<void> {
  if (!GMAPS_KEY) throw new Error("NO_GOOGLE_MAPS_KEY");
  ensureGoogleMapsConfigured();
  await importLibrary("maps");
  await importLibrary("drawing");
  await importLibrary("geometry");
}
