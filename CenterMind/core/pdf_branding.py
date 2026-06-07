# -*- coding: utf-8 -*-
"""Logo y encabezado común para PDFs Shelfy (reportlab)."""
from __future__ import annotations

from pathlib import Path

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
LOGO_PNG_PATH = _ASSETS_DIR / "shelfy_logo.png"
LOGO_SVG_PATH = _ASSETS_DIR / "shelfy_logo.svg"


def shelfy_logo_flowable(*, max_width: float = 110, max_height: float = 32):
    """
    Retorna reportlab Image con el logo Shelfy escalado, o None si no hay asset.
    """
    path = LOGO_PNG_PATH if LOGO_PNG_PATH.is_file() else None
    if path is None:
        return None

    try:
        from reportlab.platypus import Image
    except ImportError:
        return None

    img = Image(str(path))
    iw, ih = float(img.drawWidth), float(img.drawHeight)
    if iw <= 0 or ih <= 0:
        return None
    scale = min(max_width / iw, max_height / ih)
    img.drawWidth = iw * scale
    img.drawHeight = ih * scale
    img.hAlign = "LEFT"
    return img


def prepend_pdf_logo(story: list, *, spacer_after: float = 8) -> list:
    """Inserta logo + spacer al inicio de un story reportlab."""
    from reportlab.platypus import Spacer

    logo = shelfy_logo_flowable()
    if logo is None:
        return story
    return [logo, Spacer(1, spacer_after), *story]
