# -*- coding: utf-8 -*-
"""Tests unitarios de lib.playwright_nav (sin browser real)."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

from lib.playwright_nav import goto_dom, wait_dom_ready


def test_goto_dom_uses_domcontentloaded_first():
    page = MagicMock()
    page.goto = AsyncMock()

    async def _run():
        await goto_dom(page, "https://consolido.nextbyn.com", timeout_ms=30_000)

    asyncio.run(_run())
    page.goto.assert_awaited_once_with(
        "https://consolido.nextbyn.com",
        wait_until="domcontentloaded",
        timeout=30_000,
    )


def test_goto_dom_fallback_commit_on_dom_failure():
    page = MagicMock()

    async def _goto(url, wait_until, timeout):
        if wait_until == "domcontentloaded":
            raise TimeoutError("dom slow")
        return None

    page.goto = AsyncMock(side_effect=_goto)

    async def _run():
        await goto_dom(page, "https://example.com/")

    asyncio.run(_run())
    assert page.goto.await_count == 2
    calls = [c.kwargs["wait_until"] for c in page.goto.await_args_list]
    assert calls == ["domcontentloaded", "commit"]


def test_wait_dom_ready_swallows_timeout():
    page = MagicMock()
    page.wait_for_load_state = AsyncMock(side_effect=TimeoutError("x"))

    async def _run():
        await wait_dom_ready(page, timeout_ms=1000)

    asyncio.run(_run())
    page.wait_for_load_state.assert_awaited_once_with(
        "domcontentloaded", timeout=1000
    )
