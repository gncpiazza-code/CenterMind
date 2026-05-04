# -*- coding: utf-8 -*-
"""
Router Supervisores — gestión de supervisores de tenant y asignación a vendedores.

Tablas requeridas (ejecutar SQL en Supabase antes de usar):
  supervisores_tenant (id, id_distribuidor, nombre_display, id_usuario_portal, activo, created_at)
  supervisor_vendedores (id, id_supervisor, id_vendedor, id_distribuidor, created_at)

Endpoints:
  GET    /api/supervisores/{dist_id}                           — listar supervisores activos
  POST   /api/supervisores/{dist_id}                          — crear supervisor
  PUT    /api/supervisores/{dist_id}/{id_supervisor}          — editar supervisor
  DELETE /api/supervisores/{dist_id}/{id_supervisor}          — desactivar (soft-delete)
  GET    /api/supervisores/{dist_id}/{id_supervisor}/vendedores — vendedores asignados
  PUT    /api/supervisores/{dist_id}/{id_supervisor}/vendedores — reemplazar asignación completa
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.security import verify_auth, check_dist_permission
from core.tenant_tables import tenant_table_name
from db import sb

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()

ROLES_SUPERVISORES = {"superadmin", "admin", "directorio"}


def _require_role(user_payload: dict, dist_id: int):
    if user_payload.get("rol") not in ROLES_SUPERVISORES and not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Permiso insuficiente")
    check_dist_permission(user_payload, dist_id)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SupervisorCreate(BaseModel):
    nombre_display: str
    id_usuario_portal: Optional[int] = None


class SupervisorUpdate(BaseModel):
    nombre_display: Optional[str] = None
    id_usuario_portal: Optional[int] = None
    activo: Optional[bool] = None


class VendedoresAsignacion(BaseModel):
    id_vendedores: list[int]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _enrich_supervisores(rows: list[dict], dist_id: int) -> list[dict]:
    """Agrega nombre de usuario portal y conteo de vendedores a cada supervisor."""
    if not rows:
        return rows

    sup_ids = [r["id"] for r in rows]

    # Conteo de vendedores asignados por supervisor
    asig = (
        sb.table("supervisor_vendedores")
        .select("id_supervisor")
        .in_("id_supervisor", sup_ids)
        .eq("id_distribuidor", dist_id)
        .execute()
        .data or []
    )
    conteo: dict[int, int] = {}
    for a in asig:
        sid = a["id_supervisor"]
        conteo[sid] = conteo.get(sid, 0) + 1

    # Nombres de usuarios portal (si tienen vinculación)
    portal_ids = [r["id_usuario_portal"] for r in rows if r.get("id_usuario_portal")]
    portal_map: dict[int, str] = {}
    if portal_ids:
        p_rows = (
            sb.table("usuarios_portal")
            .select("id_usuario, usuario")
            .in_("id_usuario", portal_ids)
            .execute()
            .data or []
        )
        portal_map = {p["id_usuario"]: p["usuario"] for p in p_rows}

    for r in rows:
        r["cantidad_vendedores"] = conteo.get(r["id"], 0)
        r["usuario_portal"] = portal_map.get(r.get("id_usuario_portal") or -1)

    return rows


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/api/supervisores/{dist_id}", tags=["Supervisores"])
def list_supervisores(dist_id: int, include_inactive: bool = False, user_payload=Depends(verify_auth)):
    """Lista supervisores del distribuidor."""
    _require_role(user_payload, dist_id)
    try:
        q = sb.table("supervisores_tenant").select("*").eq("id_distribuidor", dist_id)
        if not include_inactive:
            q = q.eq("activo", True)
        rows = q.order("nombre_display").execute().data or []
        return _enrich_supervisores(rows, dist_id)
    except Exception as e:
        logger.error(f"[supervisores] list dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/supervisores/{dist_id}", tags=["Supervisores"])
def create_supervisor(dist_id: int, body: SupervisorCreate, user_payload=Depends(verify_auth)):
    """Crea un supervisor para el distribuidor."""
    _require_role(user_payload, dist_id)
    if not body.nombre_display.strip():
        raise HTTPException(status_code=400, detail="nombre_display no puede estar vacío")
    try:
        row = (
            sb.table("supervisores_tenant")
            .insert({
                "id_distribuidor": dist_id,
                "nombre_display": body.nombre_display.strip(),
                "id_usuario_portal": body.id_usuario_portal,
                "activo": True,
            })
            .execute()
            .data or []
        )
        return (row or [{}])[0]
    except Exception as e:
        logger.error(f"[supervisores] create dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/supervisores/{dist_id}/{id_supervisor}", tags=["Supervisores"])
def update_supervisor(dist_id: int, id_supervisor: int, body: SupervisorUpdate, user_payload=Depends(verify_auth)):
    """Actualiza nombre, usuario portal o estado activo de un supervisor."""
    _require_role(user_payload, dist_id)
    patch: dict = {}
    if body.nombre_display is not None:
        patch["nombre_display"] = body.nombre_display.strip()
    if body.id_usuario_portal is not None:
        patch["id_usuario_portal"] = body.id_usuario_portal
    if body.activo is not None:
        patch["activo"] = body.activo
    if not patch:
        raise HTTPException(status_code=400, detail="Sin campos para actualizar")
    try:
        row = (
            sb.table("supervisores_tenant")
            .update(patch)
            .eq("id", id_supervisor)
            .eq("id_distribuidor", dist_id)
            .execute()
            .data or []
        )
        if not row:
            raise HTTPException(status_code=404, detail="Supervisor no encontrado")
        return row[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[supervisores] update sup={id_supervisor} dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/supervisores/{dist_id}/{id_supervisor}", tags=["Supervisores"])
def deactivate_supervisor(dist_id: int, id_supervisor: int, user_payload=Depends(verify_auth)):
    """Desactiva (soft-delete) un supervisor."""
    _require_role(user_payload, dist_id)
    try:
        sb.table("supervisores_tenant").update({"activo": False}).eq("id", id_supervisor).eq("id_distribuidor", dist_id).execute()
        return {"ok": True}
    except Exception as e:
        logger.error(f"[supervisores] deactivate sup={id_supervisor} dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/supervisores/{dist_id}/{id_supervisor}/vendedores", tags=["Supervisores"])
def get_vendedores_supervisor(dist_id: int, id_supervisor: int, user_payload=Depends(verify_auth)):
    """Vendedores asignados al supervisor con datos de sucursal."""
    _require_role(user_payload, dist_id)
    try:
        asig = (
            sb.table("supervisor_vendedores")
            .select("id_vendedor")
            .eq("id_supervisor", id_supervisor)
            .eq("id_distribuidor", dist_id)
            .execute()
            .data or []
        )
        assigned_ids = [a["id_vendedor"] for a in asig]

        t_vend = tenant_table_name("vendedores_v2", dist_id)
        t_suc = tenant_table_name("sucursales_v2", dist_id)

        vend_rows = (
            sb.table(t_vend)
            .select("id_vendedor, nombre_erp, id_sucursal")
            .eq("id_distribuidor", dist_id)
            .order("nombre_erp")
            .execute()
            .data or []
        )
        suc_rows = (
            sb.table(t_suc)
            .select("id_sucursal, nombre_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
            .data or []
        )
        suc_map = {s["id_sucursal"]: s["nombre_erp"] for s in suc_rows}

        return [
            {
                "id_vendedor": v["id_vendedor"],
                "nombre_erp": v["nombre_erp"],
                "sucursal_nombre": suc_map.get(v.get("id_sucursal")),
                "asignado": v["id_vendedor"] in assigned_ids,
            }
            for v in vend_rows
        ]
    except Exception as e:
        logger.error(f"[supervisores] get_vendedores sup={id_supervisor} dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/supervisores/{dist_id}/{id_supervisor}/vendedores", tags=["Supervisores"])
def set_vendedores_supervisor(dist_id: int, id_supervisor: int, body: VendedoresAsignacion, user_payload=Depends(verify_auth)):
    """Reemplaza la asignación completa de vendedores para el supervisor."""
    _require_role(user_payload, dist_id)
    try:
        # Verificar que el supervisor existe y pertenece al dist
        sup = (
            sb.table("supervisores_tenant")
            .select("id")
            .eq("id", id_supervisor)
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
            .data or []
        )
        if not sup:
            raise HTTPException(status_code=404, detail="Supervisor no encontrado")

        # Borrar asignaciones actuales y reinsertar
        sb.table("supervisor_vendedores").delete().eq("id_supervisor", id_supervisor).eq("id_distribuidor", dist_id).execute()

        if body.id_vendedores:
            rows = [
                {"id_supervisor": id_supervisor, "id_vendedor": vid, "id_distribuidor": dist_id}
                for vid in body.id_vendedores
            ]
            sb.table("supervisor_vendedores").insert(rows).execute()

        return {"ok": True, "asignados": len(body.id_vendedores)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[supervisores] set_vendedores sup={id_supervisor} dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
