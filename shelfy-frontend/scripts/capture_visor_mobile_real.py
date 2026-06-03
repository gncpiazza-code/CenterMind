#!/usr/bin/env python3
"""Captura screenshot mobile del visor Evaluar con datos reales (sin /visor/demo)."""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from jose import jwt
from playwright.sync_api import sync_playwright
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
CENTERMIND = ROOT.parent / "CenterMind"
OUT = ROOT / "public/docs/visor-mobile-raw.png"

BASE_URL = os.environ.get("VISOR_CAPTURE_URL", "http://localhost:3000")
DIST_ID = int(os.environ.get("VISOR_CAPTURE_DIST_ID", "3"))
VIEWPORT = {"width": 390, "height": 844}


def mint_token() -> str:
    load_dotenv(CENTERMIND / ".env")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise SystemExit("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en CenterMind/.env")

    sb = create_client(url, key)
    user = (
        sb.table("usuarios_portal")
        .select("*")
        .eq("usuario_login", "NachoPiazza")
        .single()
        .execute()
        .data
    )
    dist = (
        sb.table("distribuidores")
        .select("nombre_empresa,feature_flags")
        .eq("id_distribuidor", DIST_ID)
        .single()
        .execute()
        .data
    )
    permisos = {
        row["permiso_key"]: row["valor"]
        for row in (
            sb.table("roles_permisos")
            .select("permiso_key, valor")
            .eq("rol", "superadmin")
            .execute()
            .data
            or []
        )
    }
    flags = dist.get("feature_flags") or {}
    secret = os.environ.get("SHELFY_JWT_SECRET", "shelfy-jwt-secret-dev-2025")
    payload = {
        "sub": user["usuario_login"],
        "id_usuario": user["id_usuario"],
        "rol": "superadmin",
        "id_distribuidor": DIST_ID,
        "nombre_empresa": dist.get("nombre_empresa"),
        "is_superadmin": True,
        "usa_quarentena": flags.get("usa_quarentena", False),
        "usa_contexto_erp": flags.get("usa_contexto_erp", False),
        "usa_mapeo_vendedores": flags.get("usa_mapeo_vendedores", False),
        "show_tutorial": False,
        "permisos": permisos,
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def main() -> None:
    token = mint_token()
    active_dist = json.dumps({"id": DIST_ID, "nombre": "Real Distribucion - T&H"})

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            locale="es-AR",
        )
        context.add_init_script(
            f"""
            localStorage.setItem("shelfy_token", {json.dumps(token)});
            localStorage.setItem("shelfy_active_dist", {json.dumps(active_dist)});
            localStorage.setItem("shelfy_tutorial_v2_seen", "true");
            document.cookie = "shelfy_token={token}; path=/; max-age=28800; SameSite=Lax";
            """
        )
        page = context.new_page()
        page.goto(f"{BASE_URL}/visor?glassTune=0", wait_until="networkidle", timeout=120_000)

        # Esperar foto real (Storage Supabase), no mock SVG del demo.
        page.wait_for_selector('[data-foto-shell] img[src*="supabase.co"]', timeout=90_000)
        page.wait_for_timeout(1200)

        OUT.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(OUT), full_page=False)
        browser.close()

    print(f"OK → {OUT}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
