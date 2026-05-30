# -*- coding: utf-8 -*-
"""
Núcleo de matcheo Telegram-grupo ↔ Vendedor ERP.

Invariantes:
- `grupos` es dist-agnostic: filtrar siempre por id_distribuidor.
- `vendedores_v2` es tenant-particionada: usar tenant_table_name().
- `integrantes_grupo` es dist-agnostic con columna id_distribuidor.
- Scoring multi-candidato: si >=2 candidatos tienen score >0.5, ambos se capean a 0.49.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from datetime import datetime, timezone

from db import sb
from core.tenant_tables import tenant_table_name

logger = logging.getLogger("ShelfyAPI")

# ── helpers de normalización ──────────────────────────────────────────────────

def _normalize(text: str) -> str:
    """Quita tildes, lowercase, strip, colapsa espacios múltiples."""
    nfd = unicodedata.normalize("NFD", text or "")
    stripped = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", stripped.lower()).strip()


def _name_coverage(vendor_name: str, group_name: str) -> float:
    """
    Fracción de tokens del nombre ERP del vendedor presentes en el nombre del grupo.
    Retorna 0.0 si el nombre ERP está vacío.
    """
    vn = _normalize(vendor_name)
    gn = _normalize(group_name)
    if not vn:
        return 0.0
    tokens = [t for t in vn.split() if len(t) > 2]
    if not tokens:
        return 0.0
    hits = sum(1 for t in tokens if t in gn)
    return hits / len(tokens)


def _levenshtein_norm(a: str, b: str) -> float:
    """Distancia de Levenshtein normalizada entre 0 (igual) y 1 (completamente distintos)."""
    if not a and not b:
        return 0.0
    la, lb = len(a), len(b)
    if la == 0:
        return 1.0
    if lb == 0:
        return 1.0
    prev = list(range(lb + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            curr.append(min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = curr
    return prev[lb] / max(la, lb)


# ── consultas DB auxiliares ───────────────────────────────────────────────────

def _fetch_grupo(dist_id: int, telegram_chat_id: int) -> dict | None:
    try:
        res = (
            sb.table("grupos")
            .select(
                "telegram_chat_id,nombre_grupo,nombre_grupo_prev,"
                "id_vendedor_erp,id_vendedor_v2,binding_status,"
                "bound_at,bound_by,dominant_uploader_uid,id_distribuidor"
            )
            .eq("id_distribuidor", dist_id)
            .eq("telegram_chat_id", telegram_chat_id)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        return rows[0] if rows else None
    except Exception as exc:
        logger.warning("_fetch_grupo dist=%s chat=%s err=%s", dist_id, telegram_chat_id, exc)
        return None


def _fetch_vendedores(dist_id: int) -> list[dict]:
    """Todos los vendedores del tenant (activos e inactivos; el caller filtra)."""
    t = tenant_table_name("vendedores_v2", dist_id)
    rows: list[dict] = []
    offset = 0
    PAGE = 1000
    try:
        while True:
            batch = (
                sb.table(t)
                .select("id_vendedor,id_vendedor_erp,nombre_erp,id_sucursal,activo")
                .eq("id_distribuidor", dist_id)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            rows.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE
    except Exception as exc:
        logger.warning("_fetch_vendedores dist=%s err=%s", dist_id, exc)
    return rows


def _fetch_binding_history(dist_id: int, telegram_chat_id: int) -> set[int]:
    """Conjunto de id_vendedor_v2 que alguna vez estuvieron vinculados a este chat."""
    known: set[int] = []
    try:
        rows = (
            sb.table("vendedores_telegram_binding")
            .select("id_vendedor_v2")
            .eq("id_distribuidor", dist_id)
            .eq("telegram_group_id", telegram_chat_id)
            .execute()
            .data or []
        )
        known = {int(r["id_vendedor_v2"]) for r in rows if r.get("id_vendedor_v2")}
    except Exception as exc:
        logger.warning("_fetch_binding_history dist=%s chat=%s err=%s", dist_id, telegram_chat_id, exc)
    return known


def _fetch_dominant_uploader(dist_id: int, telegram_chat_id: int) -> int | None:
    """
    UID de Telegram que más fotos subió en las últimas 30 exhibiciones del grupo.
    Retorna None si no hay actividad.
    """
    try:
        res = (
            sb.table("exhibiciones")
            .select("telegram_user_id")
            .eq("id_distribuidor", dist_id)
            .eq("telegram_chat_id", telegram_chat_id)
            .not_.is_("telegram_user_id", "null")
            .order("timestamp_subida", desc=True)
            .limit(30)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return None
        counts: dict[int, int] = {}
        for r in rows:
            uid = r.get("telegram_user_id")
            if uid:
                counts[int(uid)] = counts.get(int(uid), 0) + 1
        return max(counts, key=counts.__getitem__)
    except Exception as exc:
        logger.warning("_dominant_uploader dist=%s chat=%s err=%s", dist_id, telegram_chat_id, exc)
        return None


# ── API pública ───────────────────────────────────────────────────────────────

def score_group_vendor_candidates(
    dist_id: int, telegram_chat_id: int
) -> list[dict]:
    """
    Puntúa todos los vendedores activos del tenant contra el grupo dado.

    Señales:
    1. id_vendedor_erp exacto en grupo.id_vendedor_erp  → 1.0
    2. Cobertura de nombre ERP en nombre_grupo          → [0.0, 0.95]
    3. Historial en vendedores_telegram_binding         → +0.05 (bonus)
    4. Multi-candidato con score>0.5: ambos capados a 0.49
    """
    try:
        grupo = _fetch_grupo(dist_id, telegram_chat_id)
        if grupo is None:
            return []

        vendedores = _fetch_vendedores(dist_id)
        activos = [v for v in vendedores if v.get("activo", True)]
        if not activos:
            return []

        binding_hist = _fetch_binding_history(dist_id, telegram_chat_id)
        grupo_nombre = grupo.get("nombre_grupo") or ""
        grupo_erp_id = (grupo.get("id_vendedor_erp") or "").strip()

        candidates: list[dict] = []

        for v in activos:
            score = 0.0
            reasons: list[str] = []

            v_erp_id = str(v.get("id_vendedor_erp") or "").strip()
            v_nombre = str(v.get("nombre_erp") or "")
            v_id = int(v["id_vendedor"])

            # Señal 1: coincidencia exacta de id_vendedor_erp
            if grupo_erp_id and v_erp_id and grupo_erp_id == v_erp_id:
                score = 1.0
                reasons.append("erp_id_exact_match")
            else:
                # Señal 2: cobertura de nombre
                if grupo_nombre and v_nombre:
                    cov = _name_coverage(v_nombre, grupo_nombre)
                    if cov > 0:
                        # Escala lineal: cobertura 100% → 0.95, cobertura ~50% → ~0.47
                        name_score = round(cov * 0.95, 4)
                        if name_score > score:
                            score = name_score
                            reasons.append(f"name_coverage:{cov:.2f}")

            # Señal 3: historial de binding (bonus)
            if v_id in binding_hist:
                score = min(1.0, score + 0.05)
                reasons.append("binding_history")

            if score > 0:
                candidates.append({
                    "id_vendedor": v_id,
                    "nombre_erp": v_nombre,
                    "score": round(score, 4),
                    "reasons": reasons,
                })

        # Señal 4: multi-candidato — si >=2 con score>0.5, capear ambos a 0.49
        above_half = [c for c in candidates if c["score"] > 0.5]
        if len(above_half) >= 2:
            for c in candidates:
                if c["score"] > 0.5:
                    c["score"] = 0.49
                    if "multi_candidate_capped" not in c["reasons"]:
                        c["reasons"].append("multi_candidate_capped")

        candidates.sort(key=lambda x: x["score"], reverse=True)
        return candidates
    except Exception as exc:
        logger.warning(
            "score_group_vendor_candidates dist=%s chat=%s err=%s",
            dist_id, telegram_chat_id, exc,
        )
        return []


def detect_group_drift(dist_id: int, telegram_chat_id: int) -> dict | None:
    """
    Detecta cambios que invalidan el binding actual.

    Tipos:
    - title_changed: nombre_grupo cambió >40% vs nombre_grupo_prev (Levenshtein norm)
    - uploader_changed: el uploader dominante actual difiere del guardado
    - vendor_inactive: vendedor vinculado tiene activo=False en vendedores_v2
    """
    try:
        grupo = _fetch_grupo(dist_id, telegram_chat_id)
        if grupo is None:
            return None

        current_name = _normalize(grupo.get("nombre_grupo") or "")
        prev_name = _normalize(grupo.get("nombre_grupo_prev") or "")

        # Drift por título (solo si había nombre previo)
        if prev_name and current_name:
            dist = _levenshtein_norm(current_name, prev_name)
            if dist > 0.40:
                return {
                    "drift_type": "title_changed",
                    "details": f"nombre_grupo cambió {dist:.0%} respecto al previo",
                }

        # Drift por uploader dominante
        stored_uid = grupo.get("dominant_uploader_uid")
        if stored_uid is not None:
            current_uid = _fetch_dominant_uploader(dist_id, telegram_chat_id)
            if current_uid is not None and int(current_uid) != int(stored_uid):
                return {
                    "drift_type": "uploader_changed",
                    "details": (
                        f"uploader dominante cambió de {stored_uid} a {current_uid}"
                    ),
                }

        # Drift por vendedor inactivo
        id_vendedor_v2 = grupo.get("id_vendedor_v2")
        if id_vendedor_v2 is not None:
            t = tenant_table_name("vendedores_v2", dist_id)
            try:
                res = (
                    sb.table(t)
                    .select("activo")
                    .eq("id_distribuidor", dist_id)
                    .eq("id_vendedor", id_vendedor_v2)
                    .limit(1)
                    .execute()
                )
                rows = res.data or []
                if rows and rows[0].get("activo") is False:
                    return {
                        "drift_type": "vendor_inactive",
                        "details": f"vendedor {id_vendedor_v2} tiene activo=false",
                    }
            except Exception as exc:
                logger.warning(
                    "detect_group_drift vendor_check dist=%s err=%s", dist_id, exc
                )

        return None
    except Exception as exc:
        logger.warning(
            "detect_group_drift dist=%s chat=%s err=%s", dist_id, telegram_chat_id, exc
        )
        return None


def apply_group_binding(
    dist_id: int,
    telegram_chat_id: int,
    id_vendedor_v2: int,
    source: str = "manual",
    performed_by: str = "system",
    telegram_user_id: int | None = None,
) -> None:
    """
    Vincula el grupo con el vendedor:
    1. Actualiza grupos con el nuevo vendedor y binding_status='linked'.
    2. Propaga id_vendedor_v2 a los integrantes_grupo del mismo chat.
    3. Registra la operación en telegram_binding_audit.
    """
    try:
        grupo = _fetch_grupo(dist_id, telegram_chat_id)
        prev_v2 = grupo.get("id_vendedor_v2") if grupo else None

        now_iso = datetime.now(timezone.utc).isoformat()

        # Actualizar grupos
        grupo_update: dict = {
            "id_vendedor_v2": id_vendedor_v2,
            "binding_status": "linked",
            "bound_at": now_iso,
            "bound_by": performed_by,
            "nombre_grupo_prev": grupo.get("nombre_grupo") if grupo else None,
        }
        if telegram_user_id is not None:
            grupo_update["dominant_uploader_uid"] = int(telegram_user_id)
        sb.table("grupos").update(grupo_update).eq("id_distribuidor", dist_id).eq(
            "telegram_chat_id", telegram_chat_id
        ).execute()

        # Propagar a integrantes_grupo (paginado)
        offset = 0
        PAGE = 1000
        while True:
            batch = (
                sb.table("integrantes_grupo")
                .select("id_integrante")
                .eq("id_distribuidor", dist_id)
                .eq("telegram_group_id", telegram_chat_id)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            if batch:
                ids = [r["id_integrante"] for r in batch]
                sb.table("integrantes_grupo").update({
                    "id_vendedor_v2": id_vendedor_v2,
                }).eq("id_distribuidor", dist_id).eq("telegram_group_id", telegram_chat_id).in_("id_integrante", ids).execute()
            if len(batch) < PAGE:
                break
            offset += PAGE

        if telegram_user_id is not None:
            sb.table("vendedores_telegram_binding").upsert(
                {
                    "id_distribuidor": dist_id,
                    "id_vendedor_v2": id_vendedor_v2,
                    "telegram_user_id": int(telegram_user_id),
                    "telegram_group_id": telegram_chat_id,
                    "updated_by": performed_by,
                },
                on_conflict="id_distribuidor,id_vendedor_v2",
            ).execute()

        # Auditoría
        sb.table("telegram_binding_audit").insert({
            "id_distribuidor": dist_id,
            "telegram_chat_id": telegram_chat_id,
            "id_vendedor_v2_prev": prev_v2,
            "id_vendedor_v2_new": id_vendedor_v2,
            "action": "linked",
            "source": source,
            "performed_by": performed_by,
            "created_at": now_iso,
        }).execute()

    except Exception as exc:
        logger.warning(
            "apply_group_binding dist=%s chat=%s vendedor=%s err=%s",
            dist_id, telegram_chat_id, id_vendedor_v2, exc,
        )
        raise


def unlink_group(
    dist_id: int,
    telegram_chat_id: int,
    reason: str = "",
    performed_by: str = "system",
) -> None:
    """
    Desvincula el grupo: limpia id_vendedor_v2 y setea binding_status='unlinked'.
    Registra en telegram_binding_audit.
    """
    try:
        grupo = _fetch_grupo(dist_id, telegram_chat_id)
        prev_v2 = grupo.get("id_vendedor_v2") if grupo else None

        now_iso = datetime.now(timezone.utc).isoformat()

        sb.table("grupos").update({
            "id_vendedor_v2": None,
            "binding_status": "unlinked",
            "bound_at": None,
            "bound_by": None,
        }).eq("id_distribuidor", dist_id).eq("telegram_chat_id", telegram_chat_id).execute()

        sb.table("telegram_binding_audit").insert({
            "id_distribuidor": dist_id,
            "telegram_chat_id": telegram_chat_id,
            "id_vendedor_v2_prev": prev_v2,
            "id_vendedor_v2_new": None,
            "action": "unlinked",
            "source": reason or "manual",
            "performed_by": performed_by,
            "created_at": now_iso,
        }).execute()

    except Exception as exc:
        logger.warning(
            "unlink_group dist=%s chat=%s err=%s", dist_id, telegram_chat_id, exc
        )
        raise


def get_group_binding(dist_id: int, telegram_chat_id: int) -> dict | None:
    """
    Retorna el binding actual del grupo enriquecido con nombre_erp.
    None si el grupo no existe o no está vinculado.
    """
    try:
        grupo = _fetch_grupo(dist_id, telegram_chat_id)
        if grupo is None:
            return None

        id_vendedor_v2 = grupo.get("id_vendedor_v2")
        nombre_erp = None

        if id_vendedor_v2 is not None:
            t = tenant_table_name("vendedores_v2", dist_id)
            try:
                res = (
                    sb.table(t)
                    .select("nombre_erp")
                    .eq("id_distribuidor", dist_id)
                    .eq("id_vendedor", id_vendedor_v2)
                    .limit(1)
                    .execute()
                )
                rows = res.data or []
                if rows:
                    nombre_erp = rows[0].get("nombre_erp")
            except Exception as exc:
                logger.warning(
                    "get_group_binding nombre_erp dist=%s err=%s", dist_id, exc
                )

        return {
            "telegram_chat_id": telegram_chat_id,
            "nombre_grupo": grupo.get("nombre_grupo"),
            "id_vendedor_v2": id_vendedor_v2,
            "nombre_erp": nombre_erp,
            "binding_status": grupo.get("binding_status", "unlinked"),
            "bound_at": grupo.get("bound_at"),
            "bound_by": grupo.get("bound_by"),
            "dominant_uploader_uid": grupo.get("dominant_uploader_uid"),
        }
    except Exception as exc:
        logger.warning(
            "get_group_binding dist=%s chat=%s err=%s", dist_id, telegram_chat_id, exc
        )
        return None


def create_suggestion(
    dist_id: int,
    telegram_chat_id: int,
    id_vendedor_v2: int,
    score: float,
    reasons: list[str],
    source: str,
) -> None:
    """
    Inserta en telegram_binding_suggestions solo si no existe una sugerencia
    pending idéntica (mismo dist, chat y vendedor).
    """
    try:
        existing = (
            sb.table("telegram_binding_suggestions")
            .select("id")
            .eq("id_distribuidor", dist_id)
            .eq("telegram_chat_id", telegram_chat_id)
            .eq("id_vendedor_v2", id_vendedor_v2)
            .eq("status", "pending")
            .limit(1)
            .execute()
            .data or []
        )
        if existing:
            return

        sb.table("telegram_binding_suggestions").insert({
            "id_distribuidor": dist_id,
            "telegram_chat_id": telegram_chat_id,
            "id_vendedor_v2": id_vendedor_v2,
            "score": score,
            "reasons": reasons,
            "status": "pending",
            "source": source,
        }).execute()

    except Exception as exc:
        logger.warning(
            "create_suggestion dist=%s chat=%s vendedor=%s err=%s",
            dist_id, telegram_chat_id, id_vendedor_v2, exc,
        )
