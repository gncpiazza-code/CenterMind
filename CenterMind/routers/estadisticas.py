from __future__ import annotations
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel

from core.security import verify_auth, check_dist_permission
from core.estadisticas_ideal import validate_pesos, repartir_pesos, KPI_KEYS
from services.estadisticas_service import (
    fetch_meses_disponibles,
    build_carta_resumen,
    build_detalle_vendedor,
    get_ideal,
    upsert_ideal,
    get_historial,
)

logger = logging.getLogger("estadisticas")
router = APIRouter()


class KpisMensualesInput(BaseModel):
    exhibiciones: float = 0
    pdvs_compradores: float = 0
    bultos: float = 0
    cobertura_pct: float = 0
    objetivos_pct: float = 0


class PesosInput(BaseModel):
    pdvs: int = 15
    altas: int = 15
    exhibiciones: int = 15
    compradores: int = 15
    bultos: int = 15
    cobertura: int = 15
    objetivos: int = 10


class IdealInput(BaseModel):
    meta_pdvs_total: int = 0
    kpis_mensuales: KpisMensualesInput
    pesos: PesosInput


@router.get("/api/estadisticas/meses/{dist_id}", tags=["Estadísticas"])
def estadisticas_meses(dist_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        return {"meses": fetch_meses_disponibles(dist_id)}
    except Exception as e:
        logger.error(f"Error meses {dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/estadisticas/cartas/{dist_id}", tags=["Estadísticas"])
def estadisticas_cartas(
    dist_id: int,
    meses: str = Query(..., description="Comma-separated YYYY-MM list"),
    sucursal: Optional[str] = Query(None),
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    meses_list = [m.strip() for m in meses.split(",") if m.strip()]
    if not meses_list:
        raise HTTPException(status_code=400, detail="Debe especificar al menos un mes")
    try:
        cards = build_carta_resumen(dist_id, meses_list, sucursal)
        return {"cartas": cards, "total": len(cards)}
    except Exception as e:
        logger.error(f"Error cartas {dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/estadisticas/vendedor/{dist_id}/{id_vendedor}/detalle", tags=["Estadísticas"])
def estadisticas_vendedor_detalle(
    dist_id: int,
    id_vendedor: str,
    meses: str = Query(...),
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)
    meses_list = [m.strip() for m in meses.split(",") if m.strip()]
    try:
        return build_detalle_vendedor(dist_id, id_vendedor, meses_list)
    except Exception as e:
        logger.error(f"Error detalle {dist_id}/{id_vendedor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/estadisticas/ideal/compania", tags=["Estadísticas"])
def estadisticas_ideal_compania_get(user_payload=Depends(verify_auth)):
    return {"ideal": get_ideal(None, "compania")}


@router.put("/api/estadisticas/ideal/compania", tags=["Estadísticas"])
def estadisticas_ideal_compania_put(body: IdealInput, user_payload=Depends(verify_auth)):
    rol = user_payload.get("rol", "")
    if rol not in ("superadmin", "directorio") and not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo superadmin o directorio puede editar el ideal compañía")
    ok, err = validate_pesos(body.pesos.model_dump())
    if not ok:
        raise HTTPException(status_code=400, detail=err)
    try:
        result = upsert_ideal(None, "compania", body.model_dump(), user_payload)
        return {"ideal": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/estadisticas/ideal/{dist_id}", tags=["Estadísticas"])
def estadisticas_ideal_dist_get(dist_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    return {"ideal": get_ideal(dist_id, "distribuidora")}


@router.put("/api/estadisticas/ideal/{dist_id}", tags=["Estadísticas"])
def estadisticas_ideal_dist_put(dist_id: int, body: IdealInput, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    rol = user_payload.get("rol", "")
    allowed = {"superadmin", "admin", "supervisor"}
    if rol not in allowed and not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Rol no autorizado para editar ideal distribuidora")
    ok, err = validate_pesos(body.pesos.model_dump())
    if not ok:
        raise HTTPException(status_code=400, detail=err)
    try:
        result = upsert_ideal(dist_id, "distribuidora", body.model_dump(), user_payload)
        return {"ideal": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/estadisticas/ideal/historial/{config_id}", tags=["Estadísticas"])
def estadisticas_ideal_historial(config_id: str, user_payload=Depends(verify_auth)):
    try:
        return {"historial": get_historial(config_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/estadisticas/pesos/repartir", tags=["Estadísticas"])
def estadisticas_repartir_pesos(
    body: dict,
    user_payload=Depends(verify_auth),
):
    """UI helper: distribute remaining weight among unlocked KPIs."""
    pesos = body.get("pesos", {})
    bloqueados = body.get("bloqueados", [])
    result = repartir_pesos(pesos, bloqueados)
    return {"pesos": result}
