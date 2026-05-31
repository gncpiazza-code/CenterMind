/** Dimensiones intrínsecas para data-URLs / mocks (zoom sin depender de naturalWidth). */

export function parseIntrinsicFromSrc(src: string | null): { w: number; h: number } | null {
  if (!src) return null;

  if (src.startsWith("data:image/svg")) {
    try {
      const payload = src.includes(",") ? src.slice(src.indexOf(",") + 1) : "";
      const decoded = decodeURIComponent(payload);
      const viewBox = decoded.match(/viewBox=["']([^"']+)["']/i);
      if (viewBox) {
        const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
          return { w: parts[2], h: parts[3] };
        }
      }
      const wh = decoded.match(
        /width=["'](\d+(?:\.\d+)?)["'][^>]*height=["'](\d+(?:\.\d+)?)["']/i,
      );
      if (wh) {
        const w = Number(wh[1]);
        const h = Number(wh[2]);
        if (w > 0 && h > 0) return { w, h };
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}
