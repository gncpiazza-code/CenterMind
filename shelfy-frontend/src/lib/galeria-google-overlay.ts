/** Overlay HTML anclado a lat/lng en Google Maps (pines y clusters). */

export type OverlayAnchor = { x: number; y: number };

/**
 * Crea un OverlayView solo cuando `google.maps` ya está cargado (evita ReferenceError en SSR/import).
 * Posiciona con left/top + translate(%) — sin medir offsetWidth/Height en cada draw.
 */
export function createGoogleMapsHtmlOverlay(
  position: google.maps.LatLngLiteral,
  content: HTMLElement,
  anchor: OverlayAnchor = { x: 0.5, y: 1 },
): google.maps.OverlayView {
  class HtmlOverlay extends google.maps.OverlayView {
    private container: HTMLDivElement | null = null;

    constructor(
      private pos: google.maps.LatLngLiteral,
      private el: HTMLElement,
      private anchorPoint: OverlayAnchor,
    ) {
      super();
    }

    setPosition(pos: google.maps.LatLngLiteral) {
      this.pos = pos;
      this.draw();
    }

    onAdd() {
      this.container = document.createElement("div");
      this.container.style.position = "absolute";
      this.container.style.pointerEvents = "auto";
      this.container.style.willChange = "transform";
      this.container.style.transform = `translate(-${this.anchorPoint.x * 100}%, -${this.anchorPoint.y * 100}%)`;
      this.container.appendChild(this.el);
      const panes = this.getPanes();
      panes?.overlayMouseTarget.appendChild(this.container);
    }

    draw() {
      if (!this.container) return;
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(
        new google.maps.LatLng(this.pos.lat, this.pos.lng),
      );
      if (!point) return;
      this.container.style.left = `${point.x}px`;
      this.container.style.top = `${point.y}px`;
    }

    onRemove() {
      this.container?.remove();
      this.container = null;
    }
  }

  return new HtmlOverlay(position, content, anchor);
}
