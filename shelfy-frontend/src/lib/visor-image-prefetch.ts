import { resolveVisorImageSrc } from "@/components/visor/FotoViewer";
import type { GrupoPendiente } from "@/lib/api";

/** URLs ya decodificadas en esta sesión (Image() o <img> del visor). */
const loaded = new Set<string>();
const inflight = new Map<string, Promise<void>>();

export function isVisorImageCached(src: string | null | undefined): boolean {
  return !!src && loaded.has(src);
}

export function markVisorImageCached(src: string | null | undefined): void {
  if (src) loaded.add(src);
}

/** Misma política CORS que FotoViewer — sin esto el prefetch no alimenta el <img>. */
function applyVisorImgCors(img: HTMLImageElement, src: string): void {
  if (
    !src.startsWith("data:") &&
    !src.startsWith("blob:") &&
    !src.startsWith("/")
  ) {
    img.crossOrigin = "anonymous";
  }
}

export function preloadVisorImageUrl(src: string | null | undefined): Promise<void> {
  if (!src) return Promise.resolve();
  if (loaded.has(src)) return Promise.resolve();
  const pending = inflight.get(src);
  if (pending) return pending;

  const p = new Promise<void>((resolve) => {
    const img = new Image();
    applyVisorImgCors(img, src);
    img.decoding = "async";
    if ("fetchPriority" in img) {
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "high";
    }
    const done = () => {
      loaded.add(src);
      inflight.delete(src);
      if (typeof img.decode === "function") {
        img.decode().then(() => resolve()).catch(() => resolve());
      } else {
        resolve();
      }
    };
    img.onload = done;
    img.onerror = () => {
      inflight.delete(src);
      resolve();
    };
    img.src = src;
    if (img.complete) done();
  });
  inflight.set(src, p);
  return p;
}

type FotoRef = { drive_link?: string | null; id_exhibicion?: number };

function fotoUrl(f: FotoRef): string | null {
  return resolveVisorImageSrc(f.drive_link ?? "", f.id_exhibicion);
}

/** Prioridad: fotos vecinas del grupo actual + primera foto de grupos adyacentes. */
export function preloadVisorFotoNeighbors(
  grupos: GrupoPendiente[],
  groupIndex: number,
  fotoIndex: number,
): void {
  const fotos = grupos[groupIndex]?.fotos ?? [];
  const urls: string[] = [];

  for (let d = -2; d <= 3; d++) {
    const i = fotoIndex + d;
    if (i >= 0 && i < fotos.length) {
      const u = fotoUrl(fotos[i]);
      if (u) urls.push(u);
    }
  }

  for (const gIdx of [groupIndex - 1, groupIndex + 1]) {
    if (gIdx < 0 || gIdx >= grupos.length) continue;
    const neighborFotos = grupos[gIdx]?.fotos ?? [];
    for (let i = 0; i < Math.min(2, neighborFotos.length); i++) {
      const u = fotoUrl(neighborFotos[i]);
      if (u) urls.push(u);
    }
  }

  [...new Set(urls)].forEach((u) => void preloadVisorImageUrl(u));
}

/** Todas las fotos del grupo actual — prioridad al abrir/cambiar PDV. */
export function preloadVisorCurrentGroup(
  grupos: GrupoPendiente[],
  groupIndex: number,
): void {
  const fotos = grupos[groupIndex]?.fotos ?? [];
  for (const f of fotos) {
    const u = fotoUrl(f);
    if (u) void preloadVisorImageUrl(u);
  }
}

/** Resto del lote en idle — no compite con la foto visible. */
export function preloadVisorQueueIdle(grupos: GrupoPendiente[]): void {
  const all = [
    ...new Set(
      grupos
        .flatMap((g) => (g.fotos ?? []).map((f) => fotoUrl(f)))
        .filter((u): u is string => !!u),
    ),
  ];
  const run = () => {
    for (const url of all) {
      void preloadVisorImageUrl(url);
    }
  };
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 200);
  }
}
