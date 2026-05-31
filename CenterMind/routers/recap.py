from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from core.security import verify_auth, check_dist_permission
from services.recap_snapshot_service import (
    read_recap,
    list_recaps_historial,
    mark_visto,
    get_pendientes_visto,
    resolve_sample_vendedor,
    list_recap_carrusel,
    list_recap_periodos_dist,
)
from services.recap_export_service import export_recap_dist_mes_xlsx
from services.recap_service import enrich_story_payload_for_read, build_recap_evolucion_mes

logger = logging.getLogger("recap")
router = APIRouter()


class RecapVistoIn(BaseModel):
    periodo_key: str = Field(..., min_length=7)


def _user_id(user_payload: dict) -> int:
    uid = user_payload.get("id_usuario")
    if uid is None:
        raise HTTPException(status_code=401, detail="Usuario no identificado en el token")
    try:
        return int(uid)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="id_usuario inválido en el token")


def _enrich_story_payload(payload: dict, dist_id: int, id_vendedor: str, periodo_key: str) -> dict:
    return enrich_story_payload_for_read(payload, dist_id, id_vendedor, periodo_key)


@router.get("/api/recap/story/{dist_id}/{id_vendedor}", tags=["Repaso Comercial"])
def recap_story(
    dist_id: int,
    id_vendedor: str,
    periodo_key: str = Query(..., description="Ej: 2026-05-Q1"),
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    row = read_recap(dist_id, id_vendedor, periodo_key)
    if not row:
        raise HTTPException(status_code=404, detail="Repaso no encontrado para este período")
    payload = row.get("payload") or {}
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="Snapshot corrupto")
    payload.setdefault("periodo_key", periodo_key)
    payload.setdefault("status", row.get("status") or "ok")
    payload.setdefault("generated_at", row.get("generated_at") or "")
    payload = _enrich_story_payload(payload, dist_id, id_vendedor, periodo_key)
    if not payload.get("carta"):
        raise HTTPException(status_code=422, detail="Snapshot sin carta recuperable")
    return payload


@router.get("/api/recap/session/{dist_id}/{id_vendedor}", tags=["Repaso Comercial"])
def recap_session(
    dist_id: int,
    id_vendedor: str,
    periodo_key: str = Query(..., description="Ej: 2026-05-Q1"),
    user_payload=Depends(verify_auth),
):
    """Carrusel + story en una sola ida (menos latencia al abrir repaso)."""
    check_dist_permission(user_payload, dist_id)
    pk = periodo_key.strip()
    try:
        carrusel = list_recap_carrusel(dist_id, pk)
    except Exception as e:
        logger.error("recap session carrusel dist=%s periodo=%s: %s", dist_id, pk, e)
        raise HTTPException(status_code=500, detail=str(e))
    if not carrusel.get("vendedores"):
        raise HTTPException(status_code=404, detail="Sin repasos para este período")

    row = read_recap(dist_id, id_vendedor, pk)
    if not row:
        raise HTTPException(status_code=404, detail="Repaso no encontrado para este período")
    payload = row.get("payload") or {}
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="Snapshot corrupto")
    payload.setdefault("periodo_key", pk)
    payload.setdefault("status", row.get("status") or "ok")
    payload.setdefault("generated_at", row.get("generated_at") or "")
    payload = _enrich_story_payload(payload, dist_id, id_vendedor, pk)
    if not payload.get("carta"):
        raise HTTPException(status_code=422, detail="Snapshot sin carta recuperable")
    return {"carrusel": carrusel, "story": payload}


@router.get("/api/recap/carrusel/{dist_id}", tags=["Repaso Comercial"])
def recap_carrusel(
    dist_id: int,
    periodo_key: str = Query(..., description="Ej: 2026-05-Q1"),
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    try:
        data = list_recap_carrusel(dist_id, periodo_key.strip())
        if not data.get("vendedores"):
            raise HTTPException(status_code=404, detail="Sin repasos para este período")
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error("recap carrusel dist=%s periodo=%s: %s", dist_id, periodo_key, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/recap/historial/{dist_id}/{id_vendedor}", tags=["Repaso Comercial"])
def recap_historial(
    dist_id: int,
    id_vendedor: str,
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    try:
        return list_recaps_historial(dist_id, id_vendedor)
    except Exception as e:
        logger.error("recap historial dist=%s vendedor=%s: %s", dist_id, id_vendedor, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/recap/periodos/{dist_id}", tags=["Repaso Comercial"])
def recap_periodos(dist_id: int, user_payload=Depends(verify_auth)):
    """Lista repasos disponibles de la distribuidora (revisados y pendientes)."""
    check_dist_permission(user_payload, dist_id)
    try:
        return list_recap_periodos_dist(_user_id(user_payload), dist_id)
    except Exception as e:
        logger.error("recap periodos dist=%s: %s", dist_id, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/recap/pendientes/{dist_id}", tags=["Repaso Comercial"])
def recap_pendientes(dist_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    if user_payload.get("method") == "api_key":
        return []
    try:
        return get_pendientes_visto(_user_id(user_payload), dist_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("recap pendientes dist=%s: %s", dist_id, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/recap/sample-vendedor/{dist_id}", tags=["Repaso Comercial"])
def recap_sample_vendedor(
    dist_id: int,
    periodo_key: str = Query(..., description="Ej: 2026-05-Q1"),
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    vid = resolve_sample_vendedor(dist_id, periodo_key.strip())
    if not vid:
        raise HTTPException(status_code=404, detail="Sin snapshot para este período")
    return {"id_vendedor": vid}


@router.get("/api/recap/evolucion/{dist_id}/{id_vendedor}", tags=["Repaso Comercial"])
def recap_evolucion(
    dist_id: int,
    id_vendedor: str,
    mes: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="Ej: 2026-05"),
    user_payload=Depends(verify_auth),
):
    """Línea de tiempo Q1 → Q2 → C del mes para un vendedor."""
    check_dist_permission(user_payload, dist_id)
    try:
        data = build_recap_evolucion_mes(dist_id, id_vendedor, mes.strip())
    except Exception as e:
        logger.error("recap evolucion dist=%s vendedor=%s mes=%s: %s", dist_id, id_vendedor, mes, e)
        raise HTTPException(status_code=500, detail=str(e))
    if not data.get("nombre") and not any(s.get("available") for s in data.get("steps") or []):
        raise HTTPException(status_code=404, detail="Vendedor sin datos para este mes")
    return data


@router.post("/api/recap/visto/{dist_id}", tags=["Repaso Comercial"])
def recap_marcar_visto(
    dist_id: int,
    body: RecapVistoIn,
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    if user_payload.get("method") == "api_key":
        raise HTTPException(status_code=403, detail="Solo usuarios del portal")
    try:
        mark_visto(_user_id(user_payload), dist_id, body.periodo_key.strip())
        return {"ok": True}
    except Exception as e:
        logger.error("recap visto dist=%s periodo=%s: %s", dist_id, body.periodo_key, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/recap/export/{dist_id}", tags=["Repaso Comercial"])
def recap_export(
    dist_id: int,
    mes: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    try:
        xlsx_bytes = export_recap_dist_mes_xlsx(dist_id, mes)
    except Exception as e:
        logger.error("recap export dist=%s mes=%s: %s", dist_id, mes, e)
        raise HTTPException(status_code=500, detail=str(e))
    filename = f"repaso_comercial_{dist_id}_{mes}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
