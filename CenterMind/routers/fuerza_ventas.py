# -*- coding: utf-8 -*-
"""
Fuerza de Ventas y Galería de Exhibiciones.

Rutas:
  GET  /api/fuerza-ventas/vendedores/{dist_id}
  GET  /api/fuerza-ventas/vendedor/{id_vendedor}
  PUT  /api/fuerza-ventas/vendedor/{id_vendedor}
  GET  /api/fuerza-ventas/telegram/grupos/{dist_id}
  GET  /api/fuerza-ventas/telegram/usuarios/{dist_id}?group_id=...
  POST /api/fuerza-ventas/vendedor/{id_vendedor}/autocompletar
  GET  /api/fuerza-ventas/locations/{dist_id}

  GET  /api/galeria/vendedores/{dist_id}
  GET  /api/galeria/vendedor/{id_vendedor}/clientes
  GET  /api/galeria/cliente/{id_cliente_pdv}/timeline
"""
import logging
import unicodedata
from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File

from core.security import verify_auth, check_dist_permission
from core.helpers import (
    should_apply_exhibicion_qa_filter,
    build_qa_exhibicion_integrante_ids,
    is_exhibicion_qa_display_for_dist,
)
from db import sb
from models.schemas import (
    VendedorPerfilUpdateRequest,
    VendedorTelegramBindingRequest,
    AutocompletarVendedorResponse,
    GaleriaVendedorStats,
    GaleriaClienteCard,
    GaleriaTimelineItem,
    GaleriaTimelineResponse,
)

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _normalize(s: str) -> str:
    """Normaliza texto: minúsculas, sin acentos."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s.lower())
        if unicodedata.category(c) != "Mn"
    )


def _get_vendedor_dist(id_vendedor: int) -> Optional[int]:
    """Devuelve id_distribuidor del vendedor o None si no existe."""
    r = (
        sb.table("vendedores_v2")
        .select("id_distribuidor")
        .eq("id_vendedor", id_vendedor)
        .limit(1)
        .execute()
    )
    return r.data[0]["id_distribuidor"] if r.data else None


def _safe_text(value) -> str:
    """Convierte cualquier valor a string seguro para operaciones de texto."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


def _safe_int(value) -> Optional[int]:
    """Convierte a int de forma segura; devuelve None si no puede parsear."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _build_integrante_vendedor_map(dist_id: int, vendedores: list[dict]) -> dict[int, int]:
    """
    Construye un map robusto id_integrante -> id_vendedor usando:
    1) id_vendedor_v2 directo
    2) id_vendedor_erp exacto
    3) nombre normalizado (solo si el match es único)
    """
    vend_ids = {
        _safe_int(v.get("id_vendedor"))
        for v in vendedores
        if _safe_int(v.get("id_vendedor")) is not None
    }
    vend_erp_to_id: dict[str, int] = {}
    vend_name_to_id: dict[str, int] = {}
    vend_name_ambiguous: set[str] = set()

    for v in vendedores:
        vid = _safe_int(v.get("id_vendedor"))
        if vid is None:
            continue

        id_erp = _safe_text(v.get("id_vendedor_erp")).strip()
        if id_erp and id_erp not in vend_erp_to_id:
            vend_erp_to_id[id_erp] = vid

        name_norm = _normalize(_safe_text(v.get("nombre_erp")).strip())
        if not name_norm:
            continue
        if name_norm in vend_name_to_id and vend_name_to_id[name_norm] != vid:
            vend_name_ambiguous.add(name_norm)
        else:
            vend_name_to_id[name_norm] = vid

    integ_r = (
        sb.table("integrantes_grupo")
        .select("id_integrante, id_vendedor_v2, id_vendedor_erp, nombre_integrante")
        .eq("id_distribuidor", dist_id)
        .execute()
    )

    integ_vend_map: dict[int, int] = {}
    for ig in (integ_r.data or []):
        iid = _safe_int(ig.get("id_integrante"))
        if iid is None:
            continue

        # 1) vínculo directo
        direct_vid = _safe_int(ig.get("id_vendedor_v2"))
        if direct_vid is not None and direct_vid in vend_ids:
            integ_vend_map[iid] = direct_vid
            continue

        # 2) fallback por ERP
        ig_erp = _safe_text(ig.get("id_vendedor_erp")).strip()
        if ig_erp and ig_erp in vend_erp_to_id:
            integ_vend_map[iid] = vend_erp_to_id[ig_erp]
            continue

        # 3) fallback por nombre único
        ig_name_norm = _normalize(_safe_text(ig.get("nombre_integrante")).strip())
        if ig_name_norm and ig_name_norm not in vend_name_ambiguous and ig_name_norm in vend_name_to_id:
            integ_vend_map[iid] = vend_name_to_id[ig_name_norm]

    return integ_vend_map


def _resolve_binding_progressive(dist_id: int, id_vendedor: int) -> dict:
    """
    Prioriza vínculo nuevo (vendedores_telegram_binding).
    Si no existe, cae al mapping legacy de integrantes_grupo (/admin).
    """
    # 1) Nuevo módulo Fuerza de Ventas
    try:
        b = (
            sb.table("vendedores_telegram_binding")
            .select("telegram_group_id, telegram_user_id, updated_by, updated_at")
            .eq("id_distribuidor", dist_id)
            .eq("id_vendedor_v2", id_vendedor)
            .limit(1)
            .execute()
        )
        if b.data:
            row = b.data[0]
            if row.get("telegram_user_id") or row.get("telegram_group_id"):
                return {
                    "telegram_group_id": row.get("telegram_group_id"),
                    "telegram_user_id": row.get("telegram_user_id"),
                    "binding_source": "fuerza_ventas",
                    "binding_updated_by": row.get("updated_by"),
                    "binding_updated_at": row.get("updated_at"),
                }
    except Exception:
        pass

    # 2) Legacy admin mapping
    try:
        ig = (
            sb.table("integrantes_grupo")
            .select("telegram_group_id, telegram_user_id")
            .eq("id_distribuidor", dist_id)
            .eq("id_vendedor_v2", id_vendedor)
            .limit(1)
            .execute()
        )
        if ig.data:
            row = ig.data[0]
            if row.get("telegram_user_id") or row.get("telegram_group_id"):
                return {
                    "telegram_group_id": row.get("telegram_group_id"),
                    "telegram_user_id": row.get("telegram_user_id"),
                    "binding_source": "legacy_admin",
                    "binding_updated_by": None,
                    "binding_updated_at": None,
                }
    except Exception:
        pass

    return {
        "telegram_group_id": None,
        "telegram_user_id": None,
        "binding_source": "none",
        "binding_updated_by": None,
        "binding_updated_at": None,
    }


# ── Fuerza de Ventas — Catálogo ───────────────────────────────────────────────

@router.get("/api/fuerza-ventas/vendedores/{dist_id}", tags=["Fuerza de Ventas"])
def fuerza_ventas_list_vendedores(dist_id: int, payload=Depends(verify_auth)):
    check_dist_permission(payload, dist_id)
    try:
        vend_r = (
            sb.table("vendedores_v2")
            .select("id_vendedor, nombre_erp, id_sucursal, id_vendedor_erp")
            .eq("id_distribuidor", dist_id)
            .order("nombre_erp")
            .execute()
        )
        vendedores = vend_r.data or []
        id_vendedor_list = [v["id_vendedor"] for v in vendedores]
        if not id_vendedor_list:
            return []

        # Sucursales
        suc_r = (
            sb.table("sucursales_v2")
            .select("id_sucursal, nombre_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        suc_map = {
            _safe_int(s.get("id_sucursal")): _safe_text(s.get("nombre_erp"))
            for s in (suc_r.data or [])
            if _safe_int(s.get("id_sucursal")) is not None
        }

        # Perfiles
        perfil_r = (
            sb.table("vendedores_perfil")
            .select("id_vendedor_v2, foto_url, ciudad, localidad, fecha_ingreso, activo")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        perfil_map = {p["id_vendedor_v2"]: p for p in (perfil_r.data or [])}

        result = []
        for v in vendedores:
            vid = v["id_vendedor"]
            perfil = perfil_map.get(vid, {})
            binding = _resolve_binding_progressive(dist_id, vid)
            result.append({
                "id_vendedor": vid,
                "nombre_erp": v["nombre_erp"],
                "sucursal_nombre": suc_map.get(v["id_sucursal"]),
                "foto_url": perfil.get("foto_url"),
                "ciudad": perfil.get("ciudad"),
                "localidad": perfil.get("localidad"),
                "fecha_ingreso": perfil.get("fecha_ingreso"),
                "activo": perfil.get("activo", True),
                "telegram_group_id": binding.get("telegram_group_id"),
                "telegram_user_id": binding.get("telegram_user_id"),
                "tiene_binding": bool(binding.get("telegram_user_id")),
                "binding_source": binding.get("binding_source"),
            })
        return result
    except Exception as e:
        logger.error(f"[fuerza_ventas] list_vendedores dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/fuerza-ventas/vendedor/{id_vendedor}", tags=["Fuerza de Ventas"])
def fuerza_ventas_get_vendedor(id_vendedor: int, payload=Depends(verify_auth)):
    dist_id = _get_vendedor_dist(id_vendedor)
    if dist_id is None:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")
    check_dist_permission(payload, dist_id)
    try:
        v_r = (
            sb.table("vendedores_v2")
            .select("id_vendedor, nombre_erp, id_sucursal, id_distribuidor")
            .eq("id_vendedor", id_vendedor)
            .limit(1)
            .execute()
        )
        if not v_r.data:
            raise HTTPException(status_code=404, detail="Vendedor no encontrado")
        v = v_r.data[0]

        suc_r = (
            sb.table("sucursales_v2")
            .select("nombre_erp")
            .eq("id_sucursal", v["id_sucursal"])
            .limit(1)
            .execute()
        )
        sucursal_nombre = suc_r.data[0]["nombre_erp"] if suc_r.data else None

        perfil_r = (
            sb.table("vendedores_perfil")
            .select("foto_url, ciudad, localidad, fecha_ingreso, activo")
            .eq("id_vendedor_v2", id_vendedor)
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        perfil = perfil_r.data[0] if perfil_r.data else {}

        binding = _resolve_binding_progressive(dist_id, id_vendedor)

        return {
            "id_vendedor": id_vendedor,
            "nombre_erp": v["nombre_erp"],
            "id_sucursal": v["id_sucursal"],
            "sucursal_nombre": sucursal_nombre,
            "id_distribuidor": dist_id,
            "foto_url": perfil.get("foto_url"),
            "ciudad": perfil.get("ciudad"),
            "localidad": perfil.get("localidad"),
            "fecha_ingreso": perfil.get("fecha_ingreso"),
            "activo": perfil.get("activo", True),
            "telegram_group_id": binding.get("telegram_group_id"),
            "telegram_user_id": binding.get("telegram_user_id"),
            "binding_updated_by": binding.get("binding_updated_by"),
            "binding_updated_at": binding.get("binding_updated_at"),
            "binding_source": binding.get("binding_source"),
            "tiene_binding": bool(binding.get("telegram_user_id")),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[fuerza_ventas] get_vendedor vid={id_vendedor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/fuerza-ventas/vendedor/{id_vendedor}", tags=["Fuerza de Ventas"])
def fuerza_ventas_update_vendedor(
    id_vendedor: int,
    body: dict,
    payload=Depends(verify_auth),
):
    """Actualiza perfil y/o binding Telegram de un vendedor."""
    dist_id = _get_vendedor_dist(id_vendedor)
    if dist_id is None:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")
    check_dist_permission(payload, dist_id)

    # No bloquear flujo por permisos finos mientras convive con mapping legacy.
    # Se mantiene check_dist_permission como guardia principal tenant-aware.
    perfil_req = VendedorPerfilUpdateRequest(**(body.get("perfil_req") or body.get("perfil") or {}))
    binding_payload = body.get("binding_req") or body.get("binding")
    binding_req = VendedorTelegramBindingRequest(**binding_payload) if binding_payload else None

    try:
        # Upsert perfil
        perfil_data = perfil_req.model_dump(exclude_none=True)
        if perfil_data:
            sb.table("vendedores_perfil").upsert({
                "id_distribuidor": dist_id,
                "id_vendedor_v2": id_vendedor,
                **perfil_data,
            }, on_conflict="id_distribuidor,id_vendedor_v2").execute()

        # Upsert binding
        if binding_req is not None:
            binding_data = binding_req.model_dump(exclude_none=True)
            if binding_data:
                sb.table("vendedores_telegram_binding").upsert({
                    "id_distribuidor": dist_id,
                    "id_vendedor_v2": id_vendedor,
                    "updated_by": payload.get("usuario", "portal"),
                    **binding_data,
                }, on_conflict="id_distribuidor,id_vendedor_v2").execute()

        return {"ok": True, "id_vendedor": id_vendedor}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[fuerza_ventas] update_vendedor vid={id_vendedor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/fuerza-ventas/vendedor/{id_vendedor}/adoptar-legacy", tags=["Fuerza de Ventas"])
def fuerza_ventas_adoptar_legacy(id_vendedor: int, payload=Depends(verify_auth)):
    """
    Copia el mapping legacy (/admin via integrantes_grupo) al binding nuevo
    para ese vendedor. Útil en migración progresiva.
    """
    dist_id = _get_vendedor_dist(id_vendedor)
    if dist_id is None:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")
    check_dist_permission(payload, dist_id)
    try:
        legacy = (
            sb.table("integrantes_grupo")
            .select("telegram_group_id, telegram_user_id")
            .eq("id_distribuidor", dist_id)
            .eq("id_vendedor_v2", id_vendedor)
            .limit(1)
            .execute()
        )
        if not legacy.data:
            raise HTTPException(status_code=404, detail="No hay mapping legacy para este vendedor")
        row = legacy.data[0]
        group_id = row.get("telegram_group_id")
        user_id = row.get("telegram_user_id")
        if group_id is None and user_id is None:
            raise HTTPException(status_code=400, detail="El mapping legacy no tiene datos de Telegram")

        sb.table("vendedores_telegram_binding").upsert(
            {
                "id_distribuidor": dist_id,
                "id_vendedor_v2": id_vendedor,
                "telegram_group_id": group_id,
                "telegram_user_id": user_id,
                "updated_by": payload.get("sub") or payload.get("usuario") or "portal",
            },
            on_conflict="id_distribuidor,id_vendedor_v2",
        ).execute()

        return {
            "ok": True,
            "id_vendedor": id_vendedor,
            "telegram_group_id": group_id,
            "telegram_user_id": user_id,
            "binding_source": "fuerza_ventas",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[fuerza_ventas] adoptar_legacy vid={id_vendedor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/fuerza-ventas/vendedor/{id_vendedor}/foto", tags=["Fuerza de Ventas"])
async def fuerza_ventas_upload_foto(
    id_vendedor: int,
    file: UploadFile = File(...),
    payload=Depends(verify_auth),
):
    """Sube una foto local del vendedor y devuelve URL pública."""
    dist_id = _get_vendedor_dist(id_vendedor)
    if dist_id is None:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")
    check_dist_permission(payload, dist_id)
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Archivo inválido")
        content_type = (file.content_type or "").lower()
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Solo se permiten imágenes")

        ext = ".jpg"
        if "png" in content_type:
            ext = ".png"
        elif "webp" in content_type:
            ext = ".webp"
        elif "gif" in content_type:
            ext = ".gif"

        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Archivo vacío")

        stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        safe_name = f"vendedor_{id_vendedor}_{stamp}_{uuid4().hex[:8]}{ext}"
        path = f"vendedores-perfil/{dist_id}/{safe_name}"
        bucket = "Exhibiciones-PDV"

        sb.storage.from_(bucket).upload(
            path,
            data,
            file_options={"content-type": content_type or "image/jpeg", "upsert": "true"},
        )
        foto_url = sb.storage.from_(bucket).get_public_url(path)

        sb.table("vendedores_perfil").upsert(
            {
                "id_distribuidor": dist_id,
                "id_vendedor_v2": id_vendedor,
                "foto_url": foto_url,
            },
            on_conflict="id_distribuidor,id_vendedor_v2",
        ).execute()

        return {"ok": True, "foto_url": foto_url}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[fuerza_ventas] upload_foto vid={id_vendedor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Telegram — grupos y usuarios ─────────────────────────────────────────────

@router.get("/api/fuerza-ventas/telegram/grupos/{dist_id}", tags=["Fuerza de Ventas"])
def fuerza_ventas_list_grupos_telegram(dist_id: int, payload=Depends(verify_auth)):
    check_dist_permission(payload, dist_id)
    try:
        out: dict[int, dict] = {}

        # 1) Fuente principal: tabla grupos (telegram_chat_id)
        try:
            r = (
                sb.table("grupos")
                .select("telegram_chat_id, nombre_grupo")
                .eq("id_distribuidor", dist_id)
                .order("nombre_grupo")
                .execute()
            )
            for g in (r.data or []):
                gid = g.get("telegram_chat_id")
                if gid is None:
                    continue
                out[int(gid)] = {
                    "id": int(gid),
                    "nombre_grupo": g.get("nombre_grupo") or f"Grupo {gid}",
                    "telegram_group_id": int(gid),
                }
        except Exception:
            pass

        # 2) Fallback: grupos detectados en integrantes_grupo
        try:
            ig = (
                sb.table("integrantes_grupo")
                .select("telegram_group_id, nombre_grupo")
                .eq("id_distribuidor", dist_id)
                .execute()
            )
            for row in (ig.data or []):
                gid = row.get("telegram_group_id")
                if gid is None:
                    continue
                gid_int = int(gid)
                if gid_int not in out:
                    out[gid_int] = {
                        "id": gid_int,
                        "nombre_grupo": row.get("nombre_grupo") or f"Grupo {gid_int}",
                        "telegram_group_id": gid_int,
                    }
        except Exception:
            pass

        return sorted(out.values(), key=lambda x: (x.get("nombre_grupo") or "").lower())
    except Exception as e:
        logger.error(f"[fuerza_ventas] list_grupos dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/fuerza-ventas/telegram/usuarios/{dist_id}", tags=["Fuerza de Ventas"])
def fuerza_ventas_list_usuarios_grupo(
    dist_id: int,
    group_id: Optional[int] = Query(None),
    payload=Depends(verify_auth),
):
    check_dist_permission(payload, dist_id)
    try:
        q = (
            sb.table("integrantes_grupo")
            .select("id_integrante, nombre_integrante, telegram_user_id, rol_telegram, telegram_group_id")
            .eq("id_distribuidor", dist_id)
        )
        if group_id is not None:
            q = q.eq("telegram_group_id", group_id)
        q = q.order("nombre_integrante")
        r = q.execute()
        integrantes = r.data or []
        id_integrantes = [
            iid for iid in (_safe_int(row.get("id_integrante")) for row in integrantes)
            if iid is not None
        ]

        exhib_stats: dict[int, dict] = {}
        if id_integrantes:
            exhibiciones: list[dict] = []
            batch, offset_e = 1000, 0
            while True:
                ex_r = (
                    sb.table("exhibiciones")
                    .select("id_integrante, timestamp_subida")
                    .eq("id_distribuidor", dist_id)
                    .in_("id_integrante", id_integrantes)
                    .order("timestamp_subida", desc=True)
                    .range(offset_e, offset_e + batch - 1)
                    .execute()
                )
                chunk = ex_r.data or []
                exhibiciones.extend(chunk)
                if len(chunk) < batch:
                    break
                offset_e += batch

            for ex in exhibiciones:
                iid = _safe_int(ex.get("id_integrante"))
                if iid is None:
                    continue
                timestamp = _safe_text(ex.get("timestamp_subida")) or None
                if iid not in exhib_stats:
                    exhib_stats[iid] = {
                        "total_exhibiciones": 0,
                        "ultima_exhibicion": timestamp,
                    }
                exhib_stats[iid]["total_exhibiciones"] += 1

        return [
            {
                "id": row.get("id_integrante"),
                "nombre_integrante": row.get("nombre_integrante"),
                "telegram_user_id": row.get("telegram_user_id"),
                "rol_telegram": row.get("rol_telegram"),
                "id_grupo": row.get("telegram_group_id"),
                "total_exhibiciones": exhib_stats.get(_safe_int(row.get("id_integrante")) or -1, {}).get("total_exhibiciones", 0),
                "ultima_exhibicion": exhib_stats.get(_safe_int(row.get("id_integrante")) or -1, {}).get("ultima_exhibicion"),
            }
            for row in integrantes
        ]
    except Exception as e:
        logger.error(f"[fuerza_ventas] list_usuarios_grupo dist={dist_id} group={group_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Autocompletar con heurística ─────────────────────────────────────────────

@router.post("/api/fuerza-ventas/vendedor/{id_vendedor}/autocompletar", tags=["Fuerza de Ventas"])
def fuerza_ventas_autocompletar(id_vendedor: int, payload=Depends(verify_auth)):
    """
    Heurística determinista para sugerir binding Telegram.
    Estrategia:
    1. Si ya existe binding en integrantes_grupo con mismo id_vendedor_erp → score 1.0
    2. Match de nombre normalizado entre nombre_erp del vendedor e integrantes → score 0.6-0.9
    3. Historial de exhibiciones (telegram_user_id del último upload) → score 0.5
    """
    dist_id = _get_vendedor_dist(id_vendedor)
    if dist_id is None:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")
    check_dist_permission(payload, dist_id)

    try:
        # Obtener datos del vendedor
        v_r = (
            sb.table("vendedores_v2")
            .select("nombre_erp, id_vendedor_erp")
            .eq("id_vendedor", id_vendedor)
            .limit(1)
            .execute()
        )
        if not v_r.data:
            raise HTTPException(status_code=404, detail="Vendedor no encontrado")
        vendedor = v_r.data[0]
        nombre_erp_norm = _normalize(vendedor["nombre_erp"] or "")
        id_erp = str(vendedor.get("id_vendedor_erp") or "")

        # Todos los integrantes del distribuidor
        integrantes_r = (
            sb.table("integrantes_grupo")
            .select("id_integrante, nombre_integrante, telegram_user_id, telegram_group_id, id_vendedor_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        integrantes = integrantes_r.data or []

        best_score = 0.0
        best_integrante = None

        for ig in integrantes:
            score = 0.0
            # Estrategia 1: match por id_vendedor_erp exacto
            if id_erp and str(ig.get("id_vendedor_erp") or "") == id_erp:
                score = 1.0
            else:
                # Estrategia 2: match de nombre
                nombre_ig_norm = _normalize(ig.get("nombre_integrante") or "")
                if nombre_erp_norm and nombre_ig_norm:
                    words_erp = set(nombre_erp_norm.split())
                    words_ig = set(nombre_ig_norm.split())
                    if words_erp and words_ig:
                        overlap = len(words_erp & words_ig) / max(len(words_erp), len(words_ig))
                        score = round(overlap * 0.9, 3)

            if score > best_score:
                best_score = score
                best_integrante = ig

        if best_score < 0.3 or best_integrante is None:
            return AutocompletarVendedorResponse(
                id_vendedor_v2=id_vendedor,
                score=0.0,
                confianza="baja",
                campos_sugeridos={},
            )

        # Obtener grupo del integrante
        grupo_id = best_integrante.get("telegram_group_id")
        grupo_nombre = None
        if grupo_id:
            telegram_group_id = int(grupo_id)
            try:
                g_r = (
                    sb.table("grupos")
                    .select("nombre_grupo")
                    .eq("id_distribuidor", dist_id)
                    .eq("telegram_chat_id", telegram_group_id)
                    .limit(1)
                    .execute()
                )
                if g_r.data:
                    grupo_nombre = g_r.data[0].get("nombre_grupo")
            except Exception:
                pass
        else:
            telegram_group_id = None

        confianza = "alta" if best_score >= 0.8 else "media" if best_score >= 0.5 else "baja"

        return AutocompletarVendedorResponse(
            id_vendedor_v2=id_vendedor,
            sugerencia_telegram_group_id=telegram_group_id,
            sugerencia_telegram_user_id=best_integrante.get("telegram_user_id"),
            nombre_grupo_sugerido=grupo_nombre,
            nombre_usuario_sugerido=best_integrante.get("nombre_integrante"),
            score=best_score,
            confianza=confianza,
            campos_sugeridos={
                "telegram_group_id": telegram_group_id,
                "telegram_user_id": best_integrante.get("telegram_user_id"),
                "nombre_integrante": best_integrante.get("nombre_integrante"),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[fuerza_ventas] autocompletar vid={id_vendedor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Catálogo de ubicaciones del tenant ───────────────────────────────────────

@router.get("/api/fuerza-ventas/locations/{dist_id}", tags=["Fuerza de Ventas"])
def fuerza_ventas_locations(dist_id: int, payload=Depends(verify_auth)):
    """Pares únicos (ciudad, localidad) de los vendedores del distribuidor.
    Alimenta los Select de ciudad/localidad en VendedorEditSheet."""
    check_dist_permission(payload, dist_id)
    try:
        r = (
            sb.table("vendedores_perfil")
            .select("ciudad, localidad")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        seen: set[tuple] = set()
        result = []
        for row in (r.data or []):
            ciudad = (row.get("ciudad") or "").strip()
            localidad = (row.get("localidad") or "").strip()
            if not ciudad:
                continue
            key = (ciudad, localidad)
            if key not in seen:
                seen.add(key)
                result.append({
                    "location_id": f"{ciudad}__{localidad}",
                    "label": localidad or ciudad,
                    "ciudad": ciudad,
                    "localidad": localidad,
                })
        result.sort(key=lambda x: (x["ciudad"], x["label"]))
        return result
    except Exception as e:
        logger.error(f"[fuerza_ventas] locations dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Galería de Exhibiciones ───────────────────────────────────────────────────

@router.get("/api/galeria/vendedores/{dist_id}", tags=["Galería"])
def galeria_list_vendedores(
    dist_id: int,
    sucursal: Optional[str] = Query(None),
    desde: Optional[str] = Query(None),
    hasta: Optional[str] = Query(None),
    payload=Depends(verify_auth),
):
    """Métricas de exhibiciones agrupadas por vendedor."""
    check_dist_permission(payload, dist_id)
    qa_filter = should_apply_exhibicion_qa_filter(dist_id, payload)
    qa_iids = build_qa_exhibicion_integrante_ids(dist_id) if qa_filter else frozenset()
    try:
        # Vendedores
        vend_r = (
            sb.table("vendedores_v2")
            .select("id_vendedor, nombre_erp, id_sucursal")
            .eq("id_distribuidor", dist_id)
            .order("nombre_erp")
            .execute()
        )
        vendedores = vend_r.data or []
        if qa_filter:
            vendedores = [
                v for v in vendedores
                if not is_exhibicion_qa_display_for_dist(dist_id, _safe_text(v.get("nombre_erp")))
            ]
        if not vendedores:
            return []

        # Sucursales
        suc_r = (
            sb.table("sucursales_v2")
            .select("id_sucursal, nombre_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        suc_map = {s["id_sucursal"]: s["nombre_erp"] for s in (suc_r.data or [])}

        # Fotos de perfil
        perfil_r = (
            sb.table("vendedores_perfil")
            .select("id_vendedor_v2, foto_url")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        foto_map = {
            _safe_int(p.get("id_vendedor_v2")): p.get("foto_url")
            for p in (perfil_r.data or [])
            if _safe_int(p.get("id_vendedor_v2")) is not None
        }

        # Excluir vendedores marcados inactivos en galería
        perfil_activo_r = (
            sb.table("vendedores_perfil")
            .select("id_vendedor_v2")
            .eq("id_distribuidor", dist_id)
            .eq("activo", False)
            .execute()
        )
        galeria_inactive_ids = {
            _safe_int(p.get("id_vendedor_v2"))
            for p in (perfil_activo_r.data or [])
            if _safe_int(p.get("id_vendedor_v2")) is not None
        }
        if galeria_inactive_ids:
            vendedores = [
                v for v in vendedores
                if _safe_int(v.get("id_vendedor")) not in galeria_inactive_ids
            ]

        # Mapping robusto integrante → vendedor para cruzar exhibiciones.
        integ_vend_map = _build_integrante_vendedor_map(dist_id, vendedores)

        # Exhibiciones del distribuidor (paginado)
        exhibiciones: list[dict] = []
        batch, offset_e = 1000, 0
        while True:
            ex_q = (
                sb.table("exhibiciones")
                .select("id_exhibicion, id_integrante, id_cliente_pdv, estado, timestamp_subida")
                .eq("id_distribuidor", dist_id)
            )
            if desde:
                ex_q = ex_q.gte("timestamp_subida", f"{desde}T00:00:00")
            if hasta:
                ex_q = ex_q.lte("timestamp_subida", f"{hasta}T23:59:59")
            ex_r = ex_q.range(offset_e, offset_e + batch - 1).execute()
            chunk = ex_r.data or []
            exhibiciones.extend(chunk)
            if len(chunk) < batch:
                break
            offset_e += batch

        # Filtro por sucursal (opcional)
        if sucursal:
            suc_norm = _normalize(sucursal)
            vendedores = [
                v for v in vendedores
                if _normalize(suc_map.get(_safe_int(v.get("id_sucursal")), "")) == suc_norm
            ]
            if not vendedores:
                return []

        # Agregar por vendedor
        stats: dict[int, dict] = {}
        for v in vendedores:
            vid = _safe_int(v.get("id_vendedor"))
            if vid is None:
                continue
            stats[vid] = {
                "id_vendedor": vid,
                "nombre_erp": _safe_text(v.get("nombre_erp")),
                "sucursal_nombre": suc_map.get(_safe_int(v.get("id_sucursal"))),
                "foto_url": foto_map.get(vid),
                "total_exhibiciones": 0,
                "aprobadas": 0,
                "rechazadas": 0,
                "destacadas": 0,
                "pendientes": 0,
            }

        for ex in exhibiciones:
            ts = _safe_text(ex.get("timestamp_subida")).strip()
            fecha = ts[:10] if ts else ""
            if desde and fecha and fecha < desde:
                continue
            if hasta and fecha and fecha > hasta:
                continue
            # Solo datos reales para galería/stats: exhibiciones vinculadas a PDV.
            if _safe_int(ex.get("id_cliente_pdv")) is None:
                continue
            ig_id = _safe_int(ex.get("id_integrante"))
            if qa_filter and ig_id is not None and ig_id in qa_iids:
                continue
            vid = integ_vend_map.get(ig_id) if ig_id is not None else None
            if vid is None or vid not in stats:
                continue
            estado = _safe_text(ex.get("estado")).lower()
            stats[vid]["total_exhibiciones"] += 1
            if "aprobad" in estado:
                stats[vid]["aprobadas"] += 1
            elif "rechaz" in estado:
                stats[vid]["rechazadas"] += 1
            elif "destacad" in estado:
                stats[vid]["destacadas"] += 1
            else:
                stats[vid]["pendientes"] += 1

        return [row for row in stats.values() if row["total_exhibiciones"] > 0 or not (desde or hasta)]
    except Exception as e:
        logger.exception(
            "[galeria] list_vendedores failed dist=%s sucursal=%s desde=%s hasta=%s",
            dist_id,
            sucursal,
            desde,
            hasta,
        )
        raise HTTPException(
            status_code=500,
            detail=f"galeria_vendedores_error: {type(e).__name__}: {e}",
        )


@router.get("/api/galeria/vendedor/{id_vendedor}/clientes", tags=["Galería"])
def galeria_list_clientes_por_vendedor(
    id_vendedor: int,
    desde: Optional[str] = Query(None),
    hasta: Optional[str] = Query(None),
    payload=Depends(verify_auth),
):
    """Última exhibición por cliente para un vendedor."""
    dist_id = _get_vendedor_dist(id_vendedor)
    if dist_id is None:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")
    check_dist_permission(payload, dist_id)
    qa_filter = should_apply_exhibicion_qa_filter(dist_id, payload)
    qa_iids = build_qa_exhibicion_integrante_ids(dist_id) if qa_filter else frozenset()

    try:
        if qa_filter:
            vend_meta = (
                sb.table("vendedores_v2")
                .select("nombre_erp")
                .eq("id_vendedor", id_vendedor)
                .limit(1)
                .execute()
            )
            vend_name = _safe_text((vend_meta.data or [{}])[0].get("nombre_erp"))
            if is_exhibicion_qa_display_for_dist(dist_id, vend_name):
                return []

        # 1) Base de clientes del vendedor (rutas actuales).
        rutas_r = (
            sb.table("rutas_v2")
            .select("id_ruta")
            .eq("id_vendedor", id_vendedor)
            .execute()
        )
        ruta_ids = [
            rid for rid in (_safe_int(r.get("id_ruta")) for r in (rutas_r.data or []))
            if rid is not None
        ]

        clientes_pdv: list[dict] = []
        if ruta_ids:
            for i in range(0, len(ruta_ids), 50):
                chunk_ids = ruta_ids[i:i+50]
                row_chunk: list[dict] = []
                # Preferimos siempre traer fecha_ultima_compra + nombres.
                select_attempts = [
                    "id_cliente, id_cliente_erp, nombre_fantasia, nombre_cliente, fecha_ultima_compra",
                    "id_cliente, id_cliente_erp, nombre_fantasia, fecha_ultima_compra",
                    "id_cliente, id_cliente_erp, nombre_cliente, fecha_ultima_compra",
                    "id_cliente, id_cliente_erp, nombre_fantasia, nombre_cliente",
                    "id_cliente, id_cliente_erp",
                ]
                for cols in select_attempts:
                    try:
                        cpv_r = (
                            sb.table("clientes_pdv_v2")
                            .select(cols)
                            .eq("id_distribuidor", dist_id)
                            .in_("id_ruta", chunk_ids)
                            .execute()
                        )
                        row_chunk = cpv_r.data or []
                        break
                    except Exception:
                        continue
                clientes_pdv.extend(row_chunk)

        # Base map de clientes de ruta (incluye clientes sin exhibición).
        base_clientes: dict[int, dict] = {}
        for c in clientes_pdv:
            cid = _safe_int(c.get("id_cliente"))
            if cid is None:
                continue
            if cid not in base_clientes:
                base_clientes[cid] = c

        # 2) Universo de exhibiciones del vendedor (igual que card de vendedor).
        vend_r = (
            sb.table("vendedores_v2")
            .select("id_vendedor, nombre_erp, id_vendedor_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        vendedores = vend_r.data or []
        integ_vend_map = _build_integrante_vendedor_map(dist_id, vendedores)
        integrante_ids = [
            iid for iid, vid in integ_vend_map.items()
            if vid == id_vendedor
        ]
        if not integrante_ids:
            return []

        exhibiciones: list[dict] = []
        ex_select_attempts = [
            "id_exhibicion, id_cliente_pdv, id_cliente, nro_cliente, cliente_sombra_codigo, url_foto_drive, estado, timestamp_subida",
            "id_exhibicion, id_cliente_pdv, id_cliente, cliente_sombra_codigo, url_foto_drive, estado, timestamp_subida",
            "id_exhibicion, id_cliente_pdv, id_cliente, url_foto_drive, estado, timestamp_subida",
        ]
        ex_select = ex_select_attempts[-1]
        for cols in ex_select_attempts:
            try:
                probe_q = (
                    sb.table("exhibiciones")
                    .select(cols)
                    .eq("id_distribuidor", dist_id)
                    .in_("id_integrante", integrante_ids)
                    .limit(1)
                )
                if desde:
                    probe_q = probe_q.gte("timestamp_subida", f"{desde}T00:00:00")
                if hasta:
                    probe_q = probe_q.lte("timestamp_subida", f"{hasta}T23:59:59")
                probe_q.execute()
                ex_select = cols
                break
            except Exception:
                continue

        batch, offset_e = 1000, 0
        while True:
            ex_q = (
                sb.table("exhibiciones")
                .select(ex_select)
                .eq("id_distribuidor", dist_id)
                .in_("id_integrante", integrante_ids)
                .order("timestamp_subida", desc=True)
            )
            if desde:
                ex_q = ex_q.gte("timestamp_subida", f"{desde}T00:00:00")
            if hasta:
                ex_q = ex_q.lte("timestamp_subida", f"{hasta}T23:59:59")
            ex_r = ex_q.range(offset_e, offset_e + batch - 1).execute()
            raw_chunk = ex_r.data or []
            chunk = raw_chunk
            if qa_filter and qa_iids:
                chunk = [
                    r for r in chunk
                    if _safe_int(r.get("id_integrante")) not in qa_iids
                ]
            exhibiciones.extend(chunk)
            if len(raw_chunk) < batch:
                break
            offset_e += batch

        if not exhibiciones:
            return []

        # Agrupar exhibiciones por cliente lógico.
        # 1) id_cliente_pdv
        # Solo se incluyen exhibiciones con referencia real a PDV.
        ultima_por_cliente: dict[str, dict] = {}
        total_por_cliente: dict[str, int] = {}
        id_pdv_por_key: dict[str, int] = {}

        for ex in exhibiciones:
            id_pdv = _safe_int(ex.get("id_cliente_pdv"))
            if id_pdv is None:
                continue
            key = f"pdv:{id_pdv}"
            id_pdv_por_key[key] = id_pdv

            if key not in ultima_por_cliente:
                # Orden desc => primera fila es la más reciente.
                ultima_por_cliente[key] = ex
            total_por_cliente[key] = total_por_cliente.get(key, 0) + 1

        # Enriquecer metadata de clientes_pdv_v2 para keys con id_cliente_pdv.
        pdv_ids = list(sorted(set(id_pdv_por_key.values())))
        pdv_meta: dict[int, dict] = {}
        if pdv_ids:
            select_attempts = [
                "id_cliente, id_cliente_erp, nombre_fantasia, fecha_ultima_compra",
                "id_cliente, id_cliente_erp, nombre_cliente, fecha_ultima_compra",
                "id_cliente, id_cliente_erp, nombre_fantasia, nombre_cliente",
                "id_cliente, id_cliente_erp",
            ]
            for i in range(0, len(pdv_ids), 200):
                chunk = pdv_ids[i:i+200]
                rows: list[dict] = []
                for cols in select_attempts:
                    try:
                        cpv_r = (
                            sb.table("clientes_pdv_v2")
                            .select(cols)
                            .eq("id_distribuidor", dist_id)
                            .in_("id_cliente", chunk)
                            .execute()
                        )
                        rows = cpv_r.data or []
                        break
                    except Exception:
                        continue
                for row in rows:
                    rid = _safe_int(row.get("id_cliente"))
                    if rid is not None:
                        pdv_meta[rid] = row

        # Primero agregamos todos los clientes base (total=0 por defecto)
        result_by_key: dict[str, GaleriaClienteCard] = {}
        for cid, meta in base_clientes.items():
            nombre_fantasia = _safe_text(meta.get("nombre_fantasia")).strip()
            nombre_cliente = _safe_text(meta.get("nombre_cliente")).strip()
            id_cliente_erp = meta.get("id_cliente_erp")
            nombre_final = nombre_fantasia or nombre_cliente or f"Cliente {id_cliente_erp or cid}"
            key = f"pdv:{cid}"
            result_by_key[key] = GaleriaClienteCard(
                id_cliente=cid,
                id_cliente_erp=id_cliente_erp,
                nombre_cliente=nombre_final,
                nombre_fantasia=nombre_fantasia or None,
                ultima_exhibicion_url=None,
                ultima_exhibicion_fecha=None,
                ultimo_estado=None,
                fecha_ultima_compra=meta.get("fecha_ultima_compra"),
                total_exhibiciones=0,
                es_sin_referencia=False,
                motivo_no_referencia=None,
                exhibiciones_directas=[],
            )

        result: list[GaleriaClienteCard] = []
        for key, ultima in ultima_por_cliente.items():
            total = total_por_cliente.get(key, 0)
            if total <= 0:
                continue

            id_pdv = id_pdv_por_key.get(key)
            meta = pdv_meta.get(id_pdv) if id_pdv is not None else None

            nombre_fantasia = _safe_text(meta.get("nombre_fantasia")).strip() if meta else ""
            nombre_cliente = _safe_text(meta.get("nombre_cliente")).strip() if meta else ""
            id_cliente_erp = meta.get("id_cliente_erp") if meta else None

            nombre_final = nombre_fantasia or nombre_cliente
            if not nombre_final:
                if id_cliente_erp:
                    nombre_final = f"Cliente {id_cliente_erp}"
                elif id_pdv is not None:
                    nombre_final = f"Cliente {id_pdv}"
                else:
                    nombre_final = "Cliente sin identificar"

            # Timeline usa id_cliente_pdv; para legacy sin FK se usa id_exhibicion como fallback estable.
            card_id = id_pdv if id_pdv is not None else (_safe_int(ultima.get("id_exhibicion")) or 0)
            row = GaleriaClienteCard(
                id_cliente=card_id,
                id_cliente_erp=id_cliente_erp,
                nombre_cliente=nombre_final,
                nombre_fantasia=nombre_fantasia or None,
                ultima_exhibicion_url=ultima.get("url_foto_drive"),
                ultima_exhibicion_fecha=ultima.get("timestamp_subida"),
                ultimo_estado=ultima.get("estado"),
                fecha_ultima_compra=meta.get("fecha_ultima_compra") if meta else None,
                total_exhibiciones=total,
                es_sin_referencia=False,
                motivo_no_referencia=None,
                exhibiciones_directas=[],
            )
            # Si logró resolverse a PDV, pisa/actualiza la fila base para conservar coherencia.
            result_by_key[key] = row

        result = list(result_by_key.values())

        logger.info(
            "[galeria] clientes_por_vendedor vid=%s dist=%s desde=%s hasta=%s "
            "integrantes=%d exhibiciones=%d clientes=%d base_clientes=%d",
            id_vendedor, dist_id, desde, hasta,
            len(integrante_ids), len(exhibiciones), len(result), len(base_clientes),
        )
        return result
    except Exception as e:
        logger.exception(
            "[galeria] clientes_por_vendedor failed vid=%s dist=%s desde=%s hasta=%s",
            id_vendedor,
            dist_id,
            desde,
            hasta,
        )
        # No bloquear la vista si el esquema del tenant difiere.
        return []


@router.get("/api/galeria/cliente/{id_cliente_pdv}/timeline", tags=["Galería"])
def galeria_timeline_cliente(
    id_cliente_pdv: int,
    dist_id: int = Query(...),
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=120),
    payload=Depends(verify_auth),
):
    """Timeline completo de exhibiciones de un PDV."""
    check_dist_permission(payload, dist_id)
    qa_filter = should_apply_exhibicion_qa_filter(dist_id, payload)
    qa_iids = build_qa_exhibicion_integrante_ids(dist_id) if qa_filter else frozenset()
    try:
        # Verificar que el PDV pertenece al distribuidor
        cpv_r = (
            sb.table("clientes_pdv_v2")
            .select("id_cliente")
            .eq("id_cliente", id_cliente_pdv)
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        if not cpv_r.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        # Exhibiciones del cliente por FK id_cliente_pdv (igual que galeria_list_clientes_por_vendedor)
        ex_r = (
            sb.table("exhibiciones")
            .select(
                "id_exhibicion, url_foto_drive, estado, timestamp_subida, "
                "evaluated_at, supervisor_nombre, comentario_evaluacion, tipo_pdv, id_integrante"
            )
            .eq("id_distribuidor", dist_id)
            .eq("id_cliente_pdv", id_cliente_pdv)
            .order("timestamp_subida", desc=True)
            .range(offset, offset + limit)
            .execute()
        )
        rows = ex_r.data or []
        if qa_filter and qa_iids:
            rows = [
                r for r in rows
                if _safe_int(r.get("id_integrante")) not in qa_iids
            ]
        has_more = len(rows) > limit
        page_rows = rows[:limit]

        return GaleriaTimelineResponse(
            items=[
                GaleriaTimelineItem(
                    id_exhibicion=ex["id_exhibicion"],
                    url_foto=ex.get("url_foto_drive", ""),
                    estado=ex.get("estado", "Pendiente"),
                    timestamp_subida=ex.get("timestamp_subida", ""),
                    fecha_evaluacion=ex.get("evaluated_at"),
                    supervisor=ex.get("supervisor_nombre"),
                    comentario=ex.get("comentario_evaluacion"),
                    tipo_pdv=ex.get("tipo_pdv"),
                )
                for ex in page_rows
            ],
            offset=offset,
            limit=limit,
            has_more=has_more,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "[galeria] timeline failed cliente=%s dist=%s",
            id_cliente_pdv,
            dist_id,
        )
        raise HTTPException(
            status_code=500,
            detail=f"galeria_timeline_error: {type(e).__name__}: {e}",
        )
