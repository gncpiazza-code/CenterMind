from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

logger = logging.getLogger("motores.chess_cuentas_v2.network")


@dataclass
class CapturedResponse:
    ts: str
    url: str
    status: int
    content_type: str
    body_text: str
    body_json: Any | None = None


class ChessNetworkCapture:
    """Acumula respuestas JSON/XHR del host CHESS para extracción de grilla."""

    def __init__(self, host_substring: str = "chesserp") -> None:
        self._host = host_substring.lower()
        self.items: list[CapturedResponse] = []
        self._lock = asyncio.Lock()
        self._handler: Callable[..., Awaitable[None]] | None = None

    def attach(self, page) -> None:
        async def _on_response(response) -> None:
            try:
                url = response.url or ""
                if self._host not in url.lower():
                    return
                ct = (response.headers or {}).get("content-type", "").lower()
                status = response.status
                text = await response.text()
                if not text or len(text) > 25_000_000:
                    return
                j: Any | None = None
                if "json" in ct or text.strip().startswith(("{", "[")):
                    try:
                        j = json.loads(text)
                    except json.JSONDecodeError:
                        j = None
                rec = CapturedResponse(
                    ts=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    url=url,
                    status=status,
                    content_type=ct,
                    body_text=text if j is None else text[:500] + "…",
                    body_json=j,
                )
                async with self._lock:
                    self.items.append(rec)
            except Exception as e:
                logger.debug("capture skip: %s", e)

        self._handler = _on_response
        page.on("response", _on_response)

    async def dump_jsonl(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        async with self._lock:
            copy = list(self.items)
        with path.open("w", encoding="utf-8") as f:
            for it in copy:
                line = {
                    "ts": it.ts,
                    "url": it.url,
                    "status": it.status,
                    "content_type": it.content_type,
                    "json": it.body_json,
                }
                f.write(json.dumps(line, ensure_ascii=False) + "\n")
        logger.info("Volcado %s respuestas en %s", len(copy), path)
