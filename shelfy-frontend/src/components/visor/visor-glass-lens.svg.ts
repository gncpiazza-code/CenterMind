export const LENS_FILTER_ID = "shelfy-glass-lens";

/** Inject once into <body>; idempotent. */
let _injected = false;

export function getLensSvgString(scale: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true"
  style="position:absolute;overflow:hidden;width:0;height:0;pointer-events:none">
  <defs>
    <filter id="${LENS_FILTER_ID}" x="-15%" y="-15%" width="130%" height="130%"
      color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.010 0.007"
        numOctaves="2" seed="5" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise"
        scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="disp"/>
      <feGaussianBlur in="disp" stdDeviation="0.25"/>
    </filter>
  </defs>
</svg>`;
}

export function injectLensSvgDefs(scale: number): void {
  if (_injected || typeof document === "undefined") return;
  const wrap = document.createElement("div");
  wrap.innerHTML = getLensSvgString(scale);
  const svg = wrap.firstElementChild;
  if (svg) document.body.appendChild(svg);
  _injected = true;
}

export function resetLensInjection(): void {
  _injected = false;
}

export function supportsBackdropFilter(): boolean {
  if (typeof CSS === "undefined") return false;
  return (
    CSS.supports("backdrop-filter", "blur(1px)") ||
    CSS.supports("-webkit-backdrop-filter", "blur(1px)")
  );
}

/** Only enable SVG lens on Chromium where filter+backdrop-filter coexist reliably. */
export function isChromiumEngine(): boolean {
  if (typeof window === "undefined") return false;
  return "chrome" in window || /\bChrome\/\d/.test(navigator.userAgent);
}
