#!/usr/bin/env python3
"""Genera JPG explicativo de gestos mobile del visor Evaluar."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "public/docs/visor-mobile-raw.png"
OUT = ROOT / "public/docs/visor-mobile-gestos.jpg"


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def main() -> None:
    if not RAW.exists():
        raise SystemExit(f"Falta captura: {RAW}")

    shot = Image.open(RAW).convert("RGBA")
    sw, sh = shot.size

    pad_x, pad_top, pad_bottom = 28, 36, 40
    title_h = 92
    legend_h = 220
    canvas_w = sw + pad_x * 2
    canvas_h = pad_top + title_h + sh + legend_h + pad_bottom

    canvas = Image.new("RGB", (canvas_w, canvas_h), "#f4f0ff")
    draw = ImageDraw.Draw(canvas)

    title_font = load_font(28, bold=True)
    sub_font = load_font(16)
    label_font = load_font(18, bold=True)
    body_font = load_font(15)
    small_font = load_font(13)

    draw.text((pad_x, pad_top), "Gestos — Visor mobile (Evaluar)", fill="#312e81", font=title_font)
    draw.text(
        (pad_x, pad_top + 38),
        "Navegá exhibiciones y fotos sin usar los botones inferiores",
        fill="#6366f1",
        font=sub_font,
    )

    y0 = pad_top + title_h
    canvas.paste(shot, (pad_x, y0), shot)
    overlay = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    ov = ImageDraw.Draw(overlay)

    # Zona foto (debajo del header overlay, arriba de la píldora glass)
    photo_top = int(sh * 0.17)
    photo_bottom = int(sh * 0.72)
    edge_w = int(sw * 0.34)

    # Tap izquierda / derecha — cambiar foto
    ov.rectangle((0, photo_top, edge_w, photo_bottom), fill=(99, 102, 241, 48))
    ov.rectangle((sw - edge_w, photo_top, sw, photo_bottom), fill=(99, 102, 241, 48))

    # Swipe vertical — cambiar exhibición (centro)
    center_left = edge_w + 8
    center_right = sw - edge_w - 8
    ov.rectangle((center_left, photo_top, center_right, photo_bottom), fill=(168, 85, 247, 28))

    cx = sw // 2
    cy = (photo_top + photo_bottom) // 2
    arrow_color = (255, 255, 255, 230)
    ov.line((cx, photo_top + 28, cx, cy - 36), fill=arrow_color, width=4)
    ov.polygon([(cx, photo_top + 16), (cx - 14, photo_top + 44), (cx + 14, photo_top + 44)], fill=arrow_color)
    ov.line((cx, photo_bottom - 28, cx, cy + 36), fill=arrow_color, width=4)
    ov.polygon([(cx, photo_bottom - 16), (cx - 14, photo_bottom - 44), (cx + 14, photo_bottom - 44)], fill=arrow_color)

    canvas.paste(overlay, (pad_x, y0), overlay)

    # Etiquetas sobre la captura
    draw.text((pad_x + 18, y0 + photo_top + 12), "TOCAR\n◀ foto ant.", fill="#ffffff", font=label_font, stroke_width=2, stroke_fill="#4338ca")
    draw.text((pad_x + sw - edge_w + 12, y0 + photo_top + 12), "TOCAR\nfoto sig. ▶", fill="#ffffff", font=label_font, stroke_width=2, stroke_fill="#4338ca")
    draw.text((pad_x + cx - 72, y0 + cy - 14), "DESLIZAR\n↑ ↓ exhib.", fill="#ffffff", font=label_font, stroke_width=2, stroke_fill="#7c3aed")

    ly = y0 + sh + 24
    items = [
        ("Deslizar ↑", "Siguiente exhibición (otro PDV / vendedor en cola)."),
        ("Deslizar ↓", "Exhibición anterior."),
        ("Tocar borde izquierdo", "Foto anterior del mismo PDV (solo si hay 2+ fotos)."),
        ("Tocar borde derecho", "Foto siguiente del mismo PDV (solo si hay 2+ fotos)."),
        ("Centro + doble tap", "Zoom como antes. Arrastrar con zoom para mover la imagen."),
    ]
    for i, (key, desc) in enumerate(items):
        y = ly + i * 34
        draw.rounded_rectangle((pad_x, y, pad_x + 148, y + 26), radius=8, fill="#ede9fe")
        draw.text((pad_x + 10, y + 5), key, fill="#5b21b6", font=small_font)
        draw.text((pad_x + 160, y + 5), desc, fill="#334155", font=body_font)

    draw.text(
        (pad_x, canvas_h - pad_bottom + 8),
        "Captura real: Real Distribución · /visor · Shelfy Evaluar",
        fill="#94a3b8",
        font=small_font,
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, "JPEG", quality=92, optimize=True)
    print(f"OK → {OUT}")


if __name__ == "__main__":
    main()
