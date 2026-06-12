# -*- coding: utf-8 -*-
"""Publicación y consulta de releases APK SHELFYAPP (distribución interna)."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from supabase import Client

logger = logging.getLogger("ShelfyAPI")

RELEASES_TABLE = "vendedor_app_releases"
RELEASES_BUCKET = "shelfy-app-releases"
SIGNED_URL_TTL_S = 3600
_FLAVOR_RE = re.compile(r"^[a-z0-9_]{2,32}$")


def _normalize_flavor(flavor: str) -> str:
    clean = (flavor or "tabaco").strip().lower()
    if not _FLAVOR_RE.match(clean):
        raise HTTPException(status_code=400, detail=f"Flavor inválido: {flavor}")
    return clean


def get_latest_release(
    sb: Client,
    *,
    flavor: str,
    build_number: int,
) -> dict[str, Any]:
    """Compara build instalado vs último release activo del flavor."""
    flavor_clean = _normalize_flavor(flavor)
    try:
        build_current = int(build_number)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="build_number inválido")

    res = (
        sb.table(RELEASES_TABLE)
        .select(
            "id,flavor,version_name,build_number,storage_path,changelog,mandatory,"
            "min_supported_build,published_at"
        )
        .eq("flavor", flavor_clean)
        .eq("active", True)
        .order("build_number", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return {
            "update_available": False,
            "flavor": flavor_clean,
            "current_build": build_current,
        }

    latest = rows[0]
    latest_build = int(latest["build_number"])
    base = {
        "flavor": flavor_clean,
        "current_build": build_current,
        "latest_build": latest_build,
        "latest_version_name": latest.get("version_name"),
        "published_at": latest.get("published_at"),
        "changelog": latest.get("changelog") or "",
        "mandatory": bool(latest.get("mandatory")),
        "min_supported_build": latest.get("min_supported_build"),
    }
    if latest_build <= build_current:
        return {"update_available": False, **base}

    storage_path = str(latest.get("storage_path") or "").strip()
    if not storage_path:
        raise HTTPException(status_code=500, detail="Release sin storage_path")

    try:
        signed = sb.storage.from_(RELEASES_BUCKET).create_signed_url(
            storage_path,
            SIGNED_URL_TTL_S,
        )
    except Exception as e:
        logger.error(f"signed_url release flavor={flavor_clean} path={storage_path}: {e}")
        raise HTTPException(status_code=500, detail="No se pudo generar URL de descarga")

    download_url = signed.get("signedURL") or signed.get("signedUrl") or signed.get("signed_url")
    if not download_url:
        raise HTTPException(status_code=500, detail="URL de descarga vacía")

    return {
        "update_available": True,
        **base,
        "version_name": latest.get("version_name"),
        "build_number": latest_build,
        "download_url": download_url,
        "download_expires_in_s": SIGNED_URL_TTL_S,
    }


def publish_release_apk(
    sb: Client,
    *,
    flavor: str,
    version_name: str,
    build_number: int,
    apk_bytes: bytes,
    changelog: str | None = None,
    mandatory: bool = False,
    min_supported_build: int | None = None,
    published_by: str | None = None,
) -> dict[str, Any]:
    """Sube APK a Storage y registra fila activa (desactiva builds anteriores del flavor)."""
    flavor_clean = _normalize_flavor(flavor)
    version_clean = (version_name or "").strip()
    if not version_clean:
        raise HTTPException(status_code=400, detail="version_name requerido")
    try:
        build_int = int(build_number)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="build_number inválido")
    if build_int < 1:
        raise HTTPException(status_code=400, detail="build_number debe ser >= 1")
    if not apk_bytes:
        raise HTTPException(status_code=400, detail="APK vacío")

    storage_path = f"{flavor_clean}/shelfy-{flavor_clean}-b{build_int}.apk"
    try:
        sb.storage.from_(RELEASES_BUCKET).upload(
            storage_path,
            apk_bytes,
            file_options={
                "content-type": "application/vnd.android.package-archive",
                "upsert": "true",
            },
        )
    except Exception as e:
        logger.error(f"upload release flavor={flavor_clean} build={build_int}: {e}")
        raise HTTPException(
            status_code=500,
            detail=(
                f"Error subiendo APK a bucket '{RELEASES_BUCKET}'. "
                "Verificá que el bucket exista en Supabase Storage."
            ),
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        sb.table(RELEASES_TABLE).update({"active": False}).eq("flavor", flavor_clean).execute()
        ins = (
            sb.table(RELEASES_TABLE)
            .insert(
                {
                    "flavor": flavor_clean,
                    "version_name": version_clean,
                    "build_number": build_int,
                    "storage_path": storage_path,
                    "changelog": (changelog or "").strip() or None,
                    "mandatory": mandatory,
                    "min_supported_build": min_supported_build,
                    "published_at": now_iso,
                    "published_by": published_by,
                    "active": True,
                }
            )
            .execute()
        )
    except Exception as e:
        logger.error(f"insert release flavor={flavor_clean} build={build_int}: {e}")
        raise HTTPException(status_code=500, detail="Error registrando release en DB")

    row = (ins.data or [{}])[0]
    return {
        "ok": True,
        "id": row.get("id"),
        "flavor": flavor_clean,
        "version_name": version_clean,
        "build_number": build_int,
        "storage_path": storage_path,
        "published_at": now_iso,
    }
