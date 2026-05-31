#!/usr/bin/env python3
"""
Bench orientativo bundle vs endpoints legacy (requiere API local + JWT o X-Api-Key).

Uso:
  cd CenterMind && PYTHONPATH=. python scripts/bench_bundle_vs_legacy.py --dist 3 --base http://127.0.0.1:8000
"""
from __future__ import annotations

import argparse
import os
import statistics
import time

import httpx


def _timed(client: httpx.Client, method: str, url: str, **kwargs) -> tuple[float, int]:
    t0 = time.perf_counter()
    r = client.request(method, url, **kwargs)
    ms = (time.perf_counter() - t0) * 1000
    return ms, r.status_code


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--dist", type=int, default=3)
    p.add_argument("--base", default=os.environ.get("CENTERMIND_API", "http://127.0.0.1:8000"))
    p.add_argument("--runs", type=int, default=3)
    args = p.parse_args()

    headers = {}
    api_key = os.environ.get("X_API_KEY") or os.environ.get("CENTERMIND_API_KEY")
    if api_key:
        headers["X-Api-Key"] = api_key

    dist = args.dist
    pairs = [
        ("bundle_dashboard", "GET", f"{args.base}/api/bundle/dashboard/{dist}?periodo=mes"),
        ("bundle_supervision", "GET", f"{args.base}/api/bundle/supervision/{dist}"),
        ("bundle_estadisticas", "GET", f"{args.base}/api/bundle/estadisticas/{dist}"),
        ("legacy_cuentas", "GET", f"{args.base}/api/supervision/cuentas/{dist}"),
    ]

    with httpx.Client(headers=headers, timeout=120.0) as client:
        for label, method, url in pairs:
            samples: list[float] = []
            status = 0
            for _ in range(args.runs):
                ms, status = _timed(client, method, url)
                samples.append(ms)
            p50 = statistics.median(samples)
            p95 = sorted(samples)[min(len(samples) - 1, int(len(samples) * 0.95))]
            print(f"{label:22} status={status} p50={p50:.0f}ms p95={p95:.0f}ms samples={samples}")


if __name__ == "__main__":
    main()
