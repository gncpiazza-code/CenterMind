# -*- coding: utf-8 -*-
from core.pdf_branding import LOGO_PNG_PATH, shelfy_logo_flowable


def test_shelfy_logo_asset_exists():
    assert LOGO_PNG_PATH.is_file()


def test_shelfy_logo_flowable():
    img = shelfy_logo_flowable()
    assert img is not None
    assert img.drawWidth > 0
    assert img.drawHeight > 0
