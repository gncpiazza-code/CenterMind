# -*- coding: utf-8 -*-
"""
Re-evaluación de exhibiciones por Compañía (superadmin / directorio).

Rutas:
  POST /api/compania/reevaluar
  GET  /api/compania/reevaluaciones/{id_exhibicion}
  GET  /api/compania/reevaluaciones-batch/{dist_id}
"""
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query

from core.security import verify_auth, require_compania_role
from db import sb
from models.schemas import (
    ReevaluarCompaniaRequest,
    ReevaluacionCompaniaOut,
    GaleriaReevaluacionItem,
)

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()

_ESTADOS_VALIDOS = {"Aprobada", "Rechazada", "Destacada"}
_TABLE = "exhibicion_reevaluacion_compania"


def fetch_latest_reevaluaciones_for_dist(
    dist_id: int, ex_ids: list[int]
) -> dict[int, str]:
    """
    Devuelve {id_exhibicion -> estado_nuevo} con la última re-evaluación por
    exhibición. Batch query por lista de IDs para uso en ranking / timeline.
    """
    if not ex_ids:
        return {}

    PAGE = 1000
    rows: list[dict] = []
    offset = 0
    while True:
        chunk = (
            sb.table(_TABLE)
            .select("id_exhibicion,estado_nuevo,created_at")
            .eq("id_distribuidor", dist_id)
            .in_("id_exhibicion", ex_ids)
            .order("created_at", desc=True)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        rows.extend(chunk)
        if len(chunk) < PAGE:
            break
        offset += PAGE

    latest: dict[int, str] = {}
    for r in rows:
        ex_id = r.get("id_exhibicion")
        if ex_id is None:
            continue
        ex_id = int(ex_id)
        if ex_id not in latest:
            latest[ex_id] = r["estado_nuevo"]
    return latest


@router.post("/api/compania/reevaluar", tags=["Revisión Compañía"])
def reevaluar_exhibicion_compania(
    body: ReevaluarCompaniaRequest,
    payload=Depends(verify_auth),
):
    """Re-evalúa una exhibición ya evaluada. Solo roles Compañía."""
    require_compania_role(payload)

    # Verificar existencia y obtener contexto
    ex_r = (
        sb.table("exhibiciones")
        .select("id_exhibicion,id_distribuidor,estado")
        .eq("id_exhibicion", body.id_exhibicion)
        .limit(1)
        .execute()
    )
    if not ex_r.data:
        raise HTTPException(status_code=404, detail="Exhibición no encontrada")

    ex = ex_r.data[0]
    dist_id = int(ex["id_distribuidor"])
    estado_actual = ex.get("estado") or ""

    if estado_actual.lower() in ("pendiente", ""):
        raise HTTPException(
            status_code=422,
            detail="No se puede re-evaluar una exhibición Pendiente",
        )

    if body.estado_nuevo not in _ESTADOS_VALIDOS:
        raise HTTPException(
            status_code=422,
            detail=f"Estado inválido. Permitidos: {', '.join(sorted(_ESTADOS_VALIDOS))}",
        )

    nombre_usuario = (
        payload.get("usuario")
        or payload.get("nombre_usuario")
        or payload.get("sub")
        or "Compañía"
    )
    id_usuario = payload.get("id_usuario") or payload.get("sub_int")
    rol_usuario = payload.get("rol")

    insert_data = {
        "id_exhibicion": body.id_exhibicion,
        "id_distribuidor": dist_id,
        "estado_anterior": estado_actual,
        "estado_nuevo": body.estado_nuevo,
        "motivo": body.motivo,
        "nombre_usuario": str(nombre_usuario),
        "rol_usuario": str(rol_usuario) if rol_usuario else None,
    }
    if id_usuario is not None:
        try:
            insert_data["id_usuario"] = int(id_usuario)
        except (TypeError, ValueError):
            pass

    ins_r = sb.table(_TABLE).insert(insert_data).execute()
    if not ins_r.data:
        raise HTTPException(status_code=500, detail="Error al registrar re-evaluación")

    row = ins_r.data[0]
    return ReevaluacionCompaniaOut(
        id=str(row["id"]),
        id_exhibicion=int(row["id_exhibicion"]),
        id_distribuidor=int(row["id_distribuidor"]),
        estado_anterior=row["estado_anterior"],
        estado_nuevo=row["estado_nuevo"],
        motivo=row["motivo"],
        id_usuario=row.get("id_usuario"),
        nombre_usuario=row["nombre_usuario"],
        rol_usuario=row.get("rol_usuario"),
        created_at=str(row["created_at"]),
    )


@router.get(
    "/api/compania/reevaluaciones/{id_exhibicion}",
    response_model=List[GaleriaReevaluacionItem],
    tags=["Revisión Compañía"],
)
def list_reevaluaciones_exhibicion(
    id_exhibicion: int,
    payload=Depends(verify_auth),
):
    """Historial de re-evaluaciones de compañía para una exhibición. Solo roles Compañía."""
    require_compania_role(payload)

    rows = (
        sb.table(_TABLE)
        .select(
            "id,estado_anterior,estado_nuevo,motivo,nombre_usuario,rol_usuario,created_at"
        )
        .eq("id_exhibicion", id_exhibicion)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [
        GaleriaReevaluacionItem(
            id=str(r["id"]),
            estado_anterior=r["estado_anterior"],
            estado_nuevo=r["estado_nuevo"],
            motivo=r["motivo"],
            nombre_usuario=r["nombre_usuario"],
            rol_usuario=r.get("rol_usuario"),
            created_at=str(r["created_at"]),
        )
        for r in rows
    ]


@router.get(
    "/api/compania/reevaluaciones-batch/{dist_id}",
    tags=["Revisión Compañía"],
)
def batch_latest_reevaluaciones(
    dist_id: int,
    ex_ids: str = Query(..., description="IDs de exhibición separados por coma"),
    payload=Depends(verify_auth),
):
    """
    Últimas re-evaluaciones para una lista de exhibiciones.
    Retorna {id_exhibicion: estado_nuevo}. Solo roles Compañía.
    """
    require_compania_role(payload)

    try:
        ids = [int(x.strip()) for x in ex_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=422, detail="ex_ids debe ser lista de enteros")

    return fetch_latest_reevaluaciones_for_dist(dist_id, ids)
