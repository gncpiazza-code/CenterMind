/**
 * WebGL lens — displacement shader for Firefox.
 * detectWebGLSupport and canUseLensStrategy kept for backward compat.
 */

export type LensStrategy = "svg" | "webgl" | "none";

export function detectWebGLSupport(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      (canvas.getContext as (ctx: string) => RenderingContext | null)(
        "experimental-webgl",
      )
    );
  } catch {
    return false;
  }
}

/** @deprecated Use pickLensStrategy() from visor-glass-lens-strategy.ts */
export function canUseLensStrategy(): LensStrategy {
  if (typeof window === "undefined") return "none";
  const hasBackdropFilter =
    typeof CSS !== "undefined" &&
    (CSS.supports("backdrop-filter", "blur(1px)") ||
      CSS.supports("-webkit-backdrop-filter", "blur(1px)"));
  if (!hasBackdropFilter) return "none";
  if ("chrome" in window || /\bChrome\/\d/.test(navigator.userAgent)) return "svg";
  if (detectWebGLSupport()) return "webgl";
  return "none";
}

// ── Vertex shader ─────────────────────────────────────────────────────────────
const VERT_SRC = `
  attribute vec2 a_position;
  attribute vec2 a_texcoord;
  varying vec2 v_uv;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_uv = a_texcoord;
  }
`;

// ── Fragment shader — fbm displacement ────────────────────────────────────────
const FRAG_SRC = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform float u_scale;
  uniform float u_time;
  varying vec2 v_uv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * smoothNoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float s = u_scale * 0.006;
    vec2 n = vec2(
      fbm(v_uv * 7.0 + vec2(u_time * 0.04, 0.0)) - 0.5,
      fbm(v_uv * 7.0 + vec2(0.0, u_time * 0.04) + 1.7) - 0.5
    );
    vec2 uv = clamp(v_uv + n * s, 0.0, 1.0);
    vec4 color = texture2D(u_image, uv);
    gl_FragColor = vec4(color.rgb, color.a * 0.38);
  }
`;

// ── VisorGlassWebGLLens ───────────────────────────────────────────────────────

export class VisorGlassWebGLLens {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private posBuf: WebGLBuffer | null = null;
  private uvBuf: WebGLBuffer | null = null;
  private _img: HTMLImageElement | null = null;
  private pillRect: DOMRect | null = null;
  private imgRect: DOMRect | null = null;
  private time = 0;
  private _lensScale = 5;
  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this._init();
  }

  get img() { return this._img; }

  private _init() {
    const c = this.canvas;
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return;
    this.gl = gl;
    this._buildProgram();
    this._buildGeometry();
    this._buildTexture();
  }

  private _buildProgram() {
    const gl = this.gl!;
    const vs = this._compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = this._compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    this.program = prog;
  }

  private _compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl!;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  }

  private _buildGeometry() {
    const gl = this.gl!;
    this.posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    this.uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,1, 1,1, 0,0, 1,0]), gl.STATIC_DRAW);
  }

  private _buildTexture() {
    const gl = this.gl!;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  setImg(img: HTMLImageElement) { this._img = img; }
  setLensScale(scale: number) { this._lensScale = scale; }
  setRects(imgRect: DOMRect, pillRect: DOMRect) {
    this.imgRect = imgRect;
    this.pillRect = pillRect;
    this._resize();
  }

  private _resize() {
    if (!this.pillRect) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.pillRect.width * dpr));
    const h = Math.max(1, Math.round(this.pillRect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = `${this.pillRect.width}px`;
      this.canvas.style.height = `${this.pillRect.height}px`;
      this.gl?.viewport(0, 0, w, h);
    }
  }

  render() {
    const gl = this.gl;
    const prog = this.program;
    const img = this._img;
    if (!gl || !prog || !img || !this.pillRect || !this.imgRect) return;
    if (!img.complete || img.naturalWidth === 0) return;

    try {
      const scaleX = img.naturalWidth / Math.max(1, this.imgRect.width);
      const scaleY = img.naturalHeight / Math.max(1, this.imgRect.height);
      const sx = Math.max(0, (this.pillRect.left - this.imgRect.left) * scaleX);
      const sy = Math.max(0, (this.pillRect.top - this.imgRect.top) * scaleY);
      const sw = Math.max(1, this.pillRect.width * scaleX);
      const sh = Math.max(1, this.pillRect.height * scaleY);

      const tmp = document.createElement("canvas");
      tmp.width = 64; tmp.height = 64;
      const ctx = tmp.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 64, 64);

      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tmp);
    } catch { return; }

    gl.useProgram(prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const posLoc = gl.getAttribLocation(prog, "a_position");
    const uvLoc = gl.getAttribLocation(prog, "a_texcoord");

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(gl.getUniformLocation(prog, "u_image"), 0);
    gl.uniform1f(gl.getUniformLocation(prog, "u_scale"), this._lensScale);
    gl.uniform1f(gl.getUniformLocation(prog, "u_time"), this.time);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.time += 0.016;
  }

  destroy() {
    this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
    this.program = null;
    this.texture = null;
  }
}
