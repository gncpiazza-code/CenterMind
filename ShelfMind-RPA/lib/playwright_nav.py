# -*- coding: utf-8 -*-
"""
Navegación Playwright tolerante a SPAs (Consolido, CHESS).

`networkidle` suele no alcanzarse nunca (websockets, polling Angular) y dispara
timeouts de 120s en Railway. Preferir domcontentloaded + wait de selectores UI.
"""
from __future__ import annotations

from playwright.async_api import Page

DEFAULT_GOTO_TIMEOUT_MS = 60_000


async def goto_dom(
    page: Page,
    url: str,
    *,
    timeout_ms: int | None = None,
) -> None:
    """goto con domcontentloaded; fallback a commit si el DOM ya cargó parcialmente."""
    timeout = timeout_ms or DEFAULT_GOTO_TIMEOUT_MS
    last_err: Exception | None = None
    for wait_until in ("domcontentloaded", "commit"):
        try:
            await page.goto(url, wait_until=wait_until, timeout=timeout)
            return
        except Exception as e:
            last_err = e
    if last_err is not None:
        raise last_err
    raise RuntimeError(f"goto_dom falló sin excepción: {url}")


async def wait_dom_ready(page: Page, *, timeout_ms: int = 15_000) -> None:
    """Espera liviana post-navegación; no usa networkidle."""
    try:
        await page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
    except Exception:
        pass
