#!/usr/bin/env python3
"""Genera JPG explicativo de gestos mobile del visor Evaluar."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "public/docs/visor-mobile-raw.png"
OUT = ROOT / "public/docs/visor-mobile-gestos.jpg"

# Paleta alto contraste
BG = "#ffffff"
INK = "#0f172a"
MUTED = "#475569"
ACCENT = "#4338ca"
ACCENT_DARK = "#312e81"
PURPLE = "#7c3aed"
BORDER = "#cbd5e1"
CARD = "#f8fafc"
LEFT_ZONE = (49, 46, 129, 150)
RIGHT_ZONE = (49, 46, 129, 150)
CENTER_ZONE = (109, 40, 217, 95)


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


def text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def draw_pill(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    lines: list[str],
    *,
    bg: str,
    fg: str = "#ffffff",
    font: ImageFont.ImageFont,
    pad_x: int = 16,
    pad_y: int = 10,
    radius: int = 14,
) -> None:
    line_h = text_size(draw, "Ay", font)[1] + 4
    widths = [text_size(draw, line, font)[0] for line in lines]
    w = max(widths) + pad_x * 2
    h = len(lines) * line_h + pad_y * 2 - 4
    x0, y0 = cx - w // 2, cy - h // 2
    draw.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=radius, fill=bg, outline="#ffffff", width=3)
    for i, line in enumerate(lines):
        tw, _ = text_size(draw, line, font)
        draw.text((cx - tw // 2, y0 + pad_y + i * line_h), line, fill=fg, font=font)


def draw_legend_item(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    *,
    badge: str,
    badge_bg: str,
    title: str,
    desc: str,
    badge_font: ImageFont.ImageFont,
    title_font: ImageFont.ImageFont,
    body_font: ImageFont.ImageFont,
) -> int:
    row_h = 72
    draw.rounded_rectangle((x, y, x + w, y + row_h), radius=12, fill=CARD, outline=BORDER, width=2)
    badge_w = 88
    draw.rounded_rectangle((x + 12, y + 12, x + 12 + badge_w, y + row_h - 12), radius=10, fill=badge_bg)
    bw, bh = text_size(draw, badge, badge_font)
    draw.text((x + 12 + (badge_w - bw) // 2, y + (row_h - bh) // 2), badge, fill="#ffffff", font=badge_font)
    draw.text((x + 12 + badge_w + 16, y + 14), title, fill=INK, font=title_font)
    draw.text((x + 12 + badge_w + 16, y + 38), desc, fill=MUTED, font=body_font)
    return row_h + 10


def main() -> None:
    if not RAW.exists():
        raise SystemExit(f"Falta captura: {RAW}")

    shot = Image.open(RAW).convert("RGBA")
    sw, sh = shot.size

    pad_x, pad_top, pad_bottom = 32, 40, 36
    title_h = 88
    legend_h = 520
    canvas_w = sw + pad_x * 2
    canvas_h = pad_top + title_h + sh + legend_h + pad_bottom

    canvas = Image.new("RGB", (canvas_w, canvas_h), BG)
    draw = ImageDraw.Draw(canvas)

    title_font = load_font(32, bold=True)
    sub_font = load_font(17)
    pill_font = load_font(20, bold=True)
    badge_font = load_font(15, bold=True)
    item_title = load_font(16, bold=True)
    body_font = load_font(14)
    small_font = load_font(12)

    draw.text((pad_x, pad_top), "Gestos — Visor mobile", fill=INK, font=title_font)
    draw.text(
        (pad_x, pad_top + 42),
        "Evaluar · navegá sin los botones inferiores",
        fill=MUTED,
        font=sub_font,
    )

    y0 = pad_top + title_h
    canvas.paste(shot, (pad_x, y0), shot)

    overlay = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    ov = ImageDraw.Draw(overlay)

    photo_top = int(sh * 0.17)
    photo_bottom = int(sh * 0.72)
    edge_w = int(sw * 0.30)
    center_left = edge_w
    center_right = sw - edge_w

    ov.rectangle((0, photo_top, edge_w, photo_bottom), fill=LEFT_ZONE)
    ov.rectangle((sw - edge_w, photo_top, sw, photo_bottom), fill=RIGHT_ZONE)
    ov.rectangle((center_left, photo_top, center_right, photo_bottom), fill=CENTER_ZONE)

    # Bordes de zona (blanco sólido)
    border = (255, 255, 255, 220)
    for x in (edge_w, sw - edge_w):
        ov.line((x, photo_top, x, photo_bottom), fill=border, width=3)
    ov.line((center_left, photo_top, center_right, photo_top), fill=border, width=2)
    ov.line((center_left, photo_bottom, center_right, photo_bottom), fill=border, width=2)

    cx = sw // 2
    cy = (photo_top + photo_bottom) // 2
    arrow = (255, 255, 255, 255)
    ov.line((cx, photo_top + 36, cx, cy - 52), fill=arrow, width=5)
    ov.polygon([(cx, photo_top + 18), (cx - 16, photo_top + 52), (cx + 16, photo_top + 52)], fill=arrow)
    ov.line((cx, photo_bottom - 36, cx, cy + 52), fill=arrow, width=5)
    ov.polygon([(cx, photo_bottom - 18), (cx - 16, photo_bottom - 52), (cx + 16, photo_bottom - 52)], fill=arrow)

    canvas.paste(overlay, (pad_x, y0), overlay)

    # Badges sobre captura (fondo sólido, texto blanco)
    left_cx = edge_w // 2
    right_cx = sw - edge_w // 2
    zone_cy = (photo_top + photo_bottom) // 2

    overlay_draw = ImageDraw.Draw(canvas)
    draw_pill(
        overlay_draw,
        pad_x + left_cx,
        y0 + zone_cy,
        ["◀ TOCAR", "foto ant."],
        bg=ACCENT,
        font=pill_font,
    )
    draw_pill(
        overlay_draw,
        pad_x + right_cx,
        y0 + zone_cy,
        ["TOCAR ▶", "foto sig."],
        bg=ACCENT,
        font=pill_font,
    )
    draw_pill(
        overlay_draw,
        pad_x + cx,
        y0 + zone_cy,
        ["DESLIZAR", "↑ ↓ exhib."],
        bg=PURPLE,
        font=pill_font,
    )

    ly = y0 + sh + 28
    draw.text((pad_x, ly), "Referencia rápida", fill=ACCENT_DARK, font=item_title)
    ly += 28

    items = [
        ("↑ ↓", ACCENT, "Deslizar arriba / abajo", "Cambia de exhibición (otro PDV o vendedor en cola)."),
        ("◀ ▶", ACCENT, "Tocar borde izquierdo o derecho", "Foto anterior / siguiente del mismo PDV (si hay 2+ fotos)."),
        ("🤏", PURPLE, "Pellizcar con 2 dedos", "Acercá o alejá la foto. Con zoom, arrastrá para mover."),
        ("2×", PURPLE, "Doble tap en el centro", "Alterná zoom como antes. Con zoom, arrastrá para mover."),
    ]

    row_w = canvas_w - pad_x * 2
    for badge, badge_bg, title, desc in items:
        ly += draw_legend_item(
            draw,
            pad_x,
            ly,
            row_w,
            badge=badge,
            badge_bg=badge_bg,
            title=title,
            desc=desc,
            badge_font=badge_font,
            title_font=item_title,
            body_font=body_font,
        )

    draw.text(
        (pad_x, canvas_h - pad_bottom + 6),
        "Captura: Real Distribución · /visor · Shelfy Evaluar",
        fill="#64748b",
        font=small_font,
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, "JPEG", quality=93, optimize=True)
    print(f"OK → {OUT}")


if __name__ == "__main__":
    main()
