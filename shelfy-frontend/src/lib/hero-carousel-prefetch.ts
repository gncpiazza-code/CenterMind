import { resolveImageUrl, type UltimaEvaluada } from "@/lib/api";

const DEFAULT_PRELOAD = 4;

/** Precarga URLs de fotos para evitar hueco negro al abrir el dashboard. */
export function preloadStoryImageUrl(src: string): Promise<void> {
  if (!src) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.fetchPriority = "high";
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.src = src;
  });
}

export function preloadStoryItems(
  items: UltimaEvaluada[],
  limit = DEFAULT_PRELOAD,
): Promise<void> {
  const slice = items.slice(0, Math.max(1, limit));
  const urls = slice
    .map((item) => resolveImageUrl(item.drive_link, item.id_exhibicion))
    .filter(Boolean);
  if (urls.length === 0) return Promise.resolve();
  return Promise.all(urls.map((u) => preloadStoryImageUrl(u))).then(() => undefined);
}
