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


_GROUP_NAME_NOISE = frozenset({
    "exhibidor", "exhibidores", "exhibicion", "exhibiciones",
    "grupo", "group", "team", "equipo", "ventas", "shelf", "shelfy",
    "ruta", "canal", "pdv", "oficial", "test", "prueba", "chat",
})


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


def _group_name_tokens(group_name: str) -> list[str]:
    gn = _normalize(group_name)
    return [t for t in gn.split() if len(t) > 2 and t not in _GROUP_NAME_NOISE]


def _group_name_vendor_score(vendor_name: str, group_name: str) -> tuple[float, list[str]]:
    """
    Score bidireccional nombre ERP ↔ título del grupo Telegram.
    Prioriza tokens del título (ej. «Exhibidores Marcela» → «marcela»).
    """
    vn = _normalize(vendor_name)
    gn = _normalize(group_name)
    if not vn or not gn:
        return 0.0, []

    reasons: list[str] = []
    v_tokens = [t for t in vn.split() if len(t) > 2]
    g_tokens = _group_name_tokens(group_name)

    fwd = sum(1 for t in v_tokens if t in gn) / len(v_tokens) if v_tokens else 0.0
    rev = sum(1 for t in g_tokens if t in vn) / len(g_tokens) if g_tokens else 0.0

    raw = max(fwd, rev)
    if g_tokens and rev >= 1.0 and len(g_tokens) <= 2:
        raw = max(raw, 0.90)
        reasons.append("group_title_token_match")
    elif rev > 0:
        reasons.append(f"group_name_match:{rev:.2f}")
    elif fwd > 0:
        reasons.append(f"name_coverage:{fwd:.2f}")

    if raw >= 0.90:
        return round(raw, 4), reasons
    return round(raw * 0.95, 4), reasons


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
    known: set[int] = set()
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
                # Señal 2: nombre ERP ↔ título del grupo (bidireccional)
                if grupo_nombre and v_nombre:
                    cov = _name_coverage(v_nombre, grupo_nombre)
                    legacy_score = round(cov * 0.95, 4) if cov > 0 else 0.0
                    gn_score, gn_reasons = _group_name_vendor_score(v_nombre, grupo_nombre)
                    name_score = max(legacy_score, gn_score)
                    if name_score > score:
                        score = name_score
                        if gn_score >= legacy_score:
                            reasons.extend(gn_reasons)
                        elif cov > 0:
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

        # Señal 4: multi-candidato ambiguo — capear salvo ganador claro por título
        candidates.sort(key=lambda x: x["score"], reverse=True)
        above_half = [c for c in candidates if c["score"] > 0.5]
        clear_title_winner = False
        if len(candidates) >= 2:
            top, second = candidates[0], candidates[1]
            title_reasons = {
                "erp_id_exact_match",
                "group_title_token_match",
            }
            top_from_title = any(r in title_reasons for r in top.get("reasons", [])) or any(
                r.startswith("group_name_match:") for r in top.get("reasons", [])
            )
            clear_title_winner = top_from_title and (
                top["score"] >= 0.85 or top["score"] - second["score"] >= 0.12
            )
        if len(above_half) >= 2 and not clear_title_winner:
            for c in candidates:
                if c["score"] > 0.5:
                    c["score"] = 0.49
                    if "multi_candidate_capped" not in c["reasons"]:
                        c["reasons"].append("multi_candidate_capped")

        # Señal 5: integrantes del grupo ya mapeados a este vendedor
        integrante_counts = _integrante_vendor_counts(dist_id, telegram_chat_id)
        for c in candidates:
            cnt = integrante_counts.get(c["id_vendedor"], 0)
            if cnt > 0:
                bonus = min(0.40, 0.22 + 0.06 * (cnt - 1))
                if c["score"] < bonus:
                    c["score"] = round(bonus, 4)
                    c["reasons"].append(f"integrantes_grupo:{cnt}")
                else:
                    c["score"] = round(min(1.0, c["score"] + 0.08), 4)
                    c["reasons"].append(f"integrantes_grupo_bonus:{cnt}")

        candidates.sort(key=lambda x: x["score"], reverse=True)
        return candidates
    except Exception as exc:
        logger.warning(
            "score_group_vendor_candidates dist=%s chat=%s err=%s",
            dist_id, telegram_chat_id, exc,
        )
        return []


def _fetch_integrantes_grupo(dist_id: int, telegram_chat_id: int) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    PAGE = 1000
    try:
        while True:
            batch = (
                sb.table("integrantes_grupo")
                .select(
                    "id_integrante,nombre_integrante,telegram_user_id,"
                    "id_vendedor_v2,id_vendedor_erp"
                )
                .eq("id_distribuidor", dist_id)
                .eq("telegram_group_id", telegram_chat_id)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            rows.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE
    except Exception as exc:
        logger.warning(
            "_fetch_integrantes_grupo dist=%s chat=%s err=%s",
            dist_id, telegram_chat_id, exc,
        )
    return rows


def _integrante_vendor_counts(dist_id: int, telegram_chat_id: int) -> dict[int, int]:
    counts: dict[int, int] = {}
    for ig in _fetch_integrantes_grupo(dist_id, telegram_chat_id):
        vid = ig.get("id_vendedor_v2")
        if vid is not None:
            counts[int(vid)] = counts.get(int(vid), 0) + 1
    return counts


def _fetch_vendor_row(dist_id: int, id_vendedor_v2: int) -> dict | None:
    t = tenant_table_name("vendedores_v2", dist_id)
    try:
        res = (
            sb.table(t)
            .select("id_vendedor,id_vendedor_erp,nombre_erp")
            .eq("id_distribuidor", dist_id)
            .eq("id_vendedor", id_vendedor_v2)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        return rows[0] if rows else None
    except Exception as exc:
        logger.warning(
            "_fetch_vendor_row dist=%s vid=%s err=%s", dist_id, id_vendedor_v2, exc
        )
        return None


def _fetch_binding_uid_for_vendor(
    dist_id: int, id_vendedor_v2: int, telegram_chat_id: int
) -> int | None:
    try:
        res = (
            sb.table("vendedores_telegram_binding")
            .select("telegram_user_id,telegram_group_id")
            .eq("id_distribuidor", dist_id)
            .eq("id_vendedor_v2", id_vendedor_v2)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return None
        row = rows[0]
        gid = row.get("telegram_group_id")
        if gid is not None and int(gid) != int(telegram_chat_id):
            return None
        uid = row.get("telegram_user_id")
        return int(uid) if uid is not None else None
    except Exception as exc:
        logger.warning(
            "_fetch_binding_uid dist=%s vid=%s err=%s", dist_id, id_vendedor_v2, exc
        )
        return None


def score_uid_candidates_for_group(
    dist_id: int,
    telegram_chat_id: int,
    id_vendedor_v2: int | None = None,
) -> list[dict]:
    """
    Puntúa integrantes / UIDs del grupo contra un vendedor (opcional).

    Señales:
    1. integrante.id_vendedor_v2 == vendedor           → 1.0
    2. id_vendedor_erp coincide                          → 0.95
    3. Cobertura de nombre ERP ↔ nombre integrante     → [0.0, 0.85]
    4. vendedores_telegram_binding para ese par          → 0.92
    5. Uploader dominante en exhibiciones recientes      → 0.72 (con vendor) / 0.65
    """
    try:
        integrantes = _fetch_integrantes_grupo(dist_id, telegram_chat_id)
        vendor = (
            _fetch_vendor_row(dist_id, id_vendedor_v2) if id_vendedor_v2 else None
        )
        binding_uid = (
            _fetch_binding_uid_for_vendor(dist_id, id_vendedor_v2, telegram_chat_id)
            if id_vendedor_v2
            else None
        )
        dominant = _fetch_dominant_uploader(dist_id, telegram_chat_id)

        v_nombre = str(vendor.get("nombre_erp") or "") if vendor else ""
        v_erp_id = str(vendor.get("id_vendedor_erp") or "").strip() if vendor else ""

        candidates: list[dict] = []
        seen: set[int] = set()

        for ig in integrantes:
            uid_raw = ig.get("telegram_user_id")
            if uid_raw is None:
                continue
            uid = int(uid_raw)
            score = 0.0
            reasons: list[str] = []

            if id_vendedor_v2 is not None:
                ig_v2 = ig.get("id_vendedor_v2")
                if ig_v2 is not None and int(ig_v2) == int(id_vendedor_v2):
                    score = 1.0
                    reasons.append("integrante_id_vendedor_v2")
                else:
                    ig_erp = str(ig.get("id_vendedor_erp") or "").strip()
                    if v_erp_id and ig_erp and v_erp_id == ig_erp:
                        score = 0.95
                        reasons.append("integrante_erp_id_match")
                    elif v_nombre:
                        ig_nombre = str(ig.get("nombre_integrante") or "")
                        cov = _name_coverage(v_nombre, ig_nombre)
                        if cov > 0:
                            name_score = round(cov * 0.85, 4)
                            if name_score > score:
                                score = name_score
                                reasons.append(f"name_match:{cov:.2f}")

            if binding_uid is not None and uid == binding_uid:
                score = max(score, 0.92)
                reasons.append("binding_table")

            if dominant is not None and uid == dominant:
                floor = 0.72 if id_vendedor_v2 else 0.65
                score = max(score, floor)
                reasons.append("dominant_uploader")

            if score > 0 or (dominant is not None and uid == dominant):
                if score <= 0 and dominant is not None and uid == dominant:
                    score = 0.65
                    reasons.append("dominant_uploader")
                candidates.append({
                    "telegram_user_id": uid,
                    "nombre_integrante": ig.get("nombre_integrante"),
                    "score": round(score, 4),
                    "reasons": reasons,
                })
                seen.add(uid)

        if dominant is not None and dominant not in seen:
            candidates.append({
                "telegram_user_id": dominant,
                "nombre_integrante": None,
                "score": 0.55,
                "reasons": ["dominant_uploader_only"],
            })

        candidates.sort(key=lambda x: x["score"], reverse=True)
        return candidates
    except Exception as exc:
        logger.warning(
            "score_uid_candidates dist=%s chat=%s err=%s",
            dist_id, telegram_chat_id, exc,
        )
        return []


AUTO_FILL_THRESHOLD = 0.45
PREFETCH_UID_THRESHOLD = 0.30


def _has_group_name_signal(reasons: list[str]) -> bool:
    if "erp_id_exact_match" in reasons or "group_title_token_match" in reasons:
        return True
    if any(r.startswith("group_name_match:") for r in reasons):
        return True
    for r in reasons:
        if r.startswith("name_coverage:"):
            try:
                if float(r.split(":", 1)[1]) >= 0.5:
                    return True
            except ValueError:
                pass
    return False


def _eval_prefetch_from_group_name(vendor_cands: list[dict]) -> tuple[bool, str]:
    """True cuando el título del grupo apunta a un único vendedor con confianza."""
    if not vendor_cands:
        return False, ""
    top = vendor_cands[0]
    reasons = top.get("reasons") or []
    if not _has_group_name_signal(reasons):
        return False, ""

    second_score = float(vendor_cands[1]["score"]) if len(vendor_cands) > 1 else 0.0
    rivals = [c for c in vendor_cands if float(c.get("score") or 0) >= 0.45]
    clear_winner = (
        float(top.get("score") or 0) >= 0.85
        or float(top.get("score") or 0) - second_score >= 0.12
        or len(rivals) == 1
    )
    if not clear_winner:
        return False, ""

    nombre = top.get("nombre_erp") or "vendedor"
    return True, f"El nombre del grupo sugiere «{nombre}»"


def suggest_group_binding_fields(
    dist_id: int,
    telegram_chat_id: int,
    *,
    id_vendedor_v2: int | None = None,
    telegram_user_id: int | None = None,
) -> dict:
    """
    Sugerencias bidireccionales para el panel de vinculación por grupo.

    - Solo chat_id → mejor vendedor + UID coherente
    - chat_id + vendedor → mejor UID para ese vendedor en el grupo
    - chat_id + UID → mejor vendedor para ese integrante
    """
    grupo = _fetch_grupo(dist_id, telegram_chat_id)
    vendor_cands = score_group_vendor_candidates(dist_id, telegram_chat_id)

    def _vendor_candidate(vid: int) -> dict | None:
        for c in vendor_cands:
            if c["id_vendedor"] == vid:
                return c
        row = _fetch_vendor_row(dist_id, vid)
        if row:
            return {
                "id_vendedor": int(row["id_vendedor"]),
                "nombre_erp": row.get("nombre_erp") or "",
                "score": 0.0,
                "reasons": ["manual_selection"],
            }
        return None

    def _pack_vendor(c: dict | None) -> dict | None:
        if c is None:
            return None
        return {
            **c,
            "auto_fill": float(c.get("score") or 0) >= AUTO_FILL_THRESHOLD,
        }

    def _pack_uid(c: dict | None) -> dict | None:
        if c is None:
            return None
        return {
            **c,
            "auto_fill": float(c.get("score") or 0) >= AUTO_FILL_THRESHOLD,
        }

    suggested_vendor: dict | None = None
    suggested_uid: dict | None = None
    integrantes = _fetch_integrantes_grupo(dist_id, telegram_chat_id)

    if telegram_user_id is not None and id_vendedor_v2 is None:
        ig_match = next(
            (
                ig
                for ig in integrantes
                if ig.get("telegram_user_id") is not None
                and int(ig["telegram_user_id"]) == int(telegram_user_id)
            ),
            None,
        )
        suggested_uid = _pack_uid({
            "telegram_user_id": int(telegram_user_id),
            "nombre_integrante": ig_match.get("nombre_integrante") if ig_match else None,
            "score": 1.0,
            "reasons": ["selected_uid"],
        })
        if ig_match and ig_match.get("id_vendedor_v2") is not None:
            vid = int(ig_match["id_vendedor_v2"])
            vc = _vendor_candidate(vid)
            if vc:
                vc = dict(vc)
                vc["score"] = max(float(vc.get("score") or 0), 0.88)
                if "integrante_id_vendedor_v2" not in vc.get("reasons", []):
                    vc.setdefault("reasons", []).append("integrante_id_vendedor_v2")
                suggested_vendor = _pack_vendor(vc)
        if suggested_vendor is None and vendor_cands:
            suggested_vendor = _pack_vendor(vendor_cands[0])

    elif id_vendedor_v2 is not None and telegram_user_id is None:
        suggested_vendor = _pack_vendor(_vendor_candidate(id_vendedor_v2))
        uid_cands = score_uid_candidates_for_group(
            dist_id, telegram_chat_id, id_vendedor_v2
        )
        suggested_uid = _pack_uid(uid_cands[0] if uid_cands else None)

    else:
        if id_vendedor_v2 is not None:
            suggested_vendor = _pack_vendor(_vendor_candidate(id_vendedor_v2))
        elif vendor_cands:
            suggested_vendor = _pack_vendor(vendor_cands[0])

        vid_for_uid = id_vendedor_v2
        if vid_for_uid is None and suggested_vendor:
            vid_for_uid = suggested_vendor.get("id_vendedor")

        uid_cands = score_uid_candidates_for_group(
            dist_id, telegram_chat_id, vid_for_uid
        )

        if telegram_user_id is not None:
            uid_row = next(
                (u for u in uid_cands if u["telegram_user_id"] == int(telegram_user_id)),
                None,
            )
            if uid_row is None:
                ig_match = next(
                    (
                        ig
                        for ig in integrantes
                        if ig.get("telegram_user_id") is not None
                        and int(ig["telegram_user_id"]) == int(telegram_user_id)
                    ),
                    None,
                )
                uid_row = {
                    "telegram_user_id": int(telegram_user_id),
                    "nombre_integrante": ig_match.get("nombre_integrante") if ig_match else None,
                    "score": 1.0,
                    "reasons": ["selected_uid"],
                }
            suggested_uid = _pack_uid(uid_row)
        else:
            suggested_uid = _pack_uid(uid_cands[0] if uid_cands else None)

    uid_cands_full = score_uid_candidates_for_group(
        dist_id,
        telegram_chat_id,
        id_vendedor_v2
        or (suggested_vendor.get("id_vendedor") if suggested_vendor else None),
    )

    prefetch_ready = False
    prefetch_reason = ""
    is_initial_suggest = id_vendedor_v2 is None and telegram_user_id is None
    if is_initial_suggest:
        prefetch_ready, prefetch_reason = _eval_prefetch_from_group_name(vendor_cands)

    if prefetch_ready:
        if vendor_cands:
            top = dict(vendor_cands[0])
            top["auto_fill"] = True
            suggested_vendor = top
        vid_pf = (
            id_vendedor_v2
            or (suggested_vendor.get("id_vendedor") if suggested_vendor else None)
        )
        if vid_pf is not None:
            uid_pf = score_uid_candidates_for_group(dist_id, telegram_chat_id, vid_pf)
            uid_cands_full = uid_pf
            if uid_pf:
                uid_row = dict(uid_pf[0])
                uid_row["auto_fill"] = float(uid_row.get("score") or 0) >= PREFETCH_UID_THRESHOLD
                suggested_uid = uid_row
            elif suggested_uid is None:
                dominant = _fetch_dominant_uploader(dist_id, telegram_chat_id)
                if dominant is not None:
                    suggested_uid = {
                        "telegram_user_id": dominant,
                        "nombre_integrante": None,
                        "score": 0.55,
                        "reasons": ["dominant_uploader_prefetch"],
                        "auto_fill": True,
                    }

    def _pack_vendor_list(items: list[dict]) -> list[dict]:
        return [
            {
                **c,
                "auto_fill": float(c.get("score") or 0) >= AUTO_FILL_THRESHOLD
                or (prefetch_ready and items and c.get("id_vendedor") == items[0].get("id_vendedor")),
            }
            for c in items
        ]

    def _pack_uid_list(items: list[dict]) -> list[dict]:
        threshold = PREFETCH_UID_THRESHOLD if prefetch_ready else AUTO_FILL_THRESHOLD
        return [
            {**c, "auto_fill": float(c.get("score") or 0) >= threshold}
            for c in items
        ]

    return {
        "telegram_chat_id": telegram_chat_id,
        "nombre_grupo": grupo.get("nombre_grupo") if grupo else None,
        "vendedor_sugerido": suggested_vendor,
        "uid_sugerido": suggested_uid,
        "prefetch_ready": prefetch_ready,
        "prefetch_reason": prefetch_reason or None,
        "vendedor_candidates": _pack_vendor_list(vendor_cands[:8]),
        "uid_candidates": _pack_uid_list(uid_cands_full[:8]),
    }


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
    telegram_user_id_secondary: int | None = None,
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

        # Actualizar o crear fila en grupos (FV puede vincular antes de que el bot registre el chat)
        grupo_update: dict = {
            "id_distribuidor": dist_id,
            "telegram_chat_id": telegram_chat_id,
            "id_vendedor_v2": id_vendedor_v2,
            "binding_status": "linked",
            "bound_at": now_iso,
            "bound_by": performed_by,
            "nombre_grupo_prev": grupo.get("nombre_grupo") if grupo else None,
        }
        if telegram_user_id is not None:
            grupo_update["dominant_uploader_uid"] = int(telegram_user_id)
        if grupo is None:
            grupo_update.setdefault(
                "nombre_grupo",
                f"Grupo {telegram_chat_id}",
            )
            sb.table("grupos").upsert(
                grupo_update,
                on_conflict="telegram_chat_id",
            ).execute()
        else:
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

        tg_uids: list[int] = []
        if telegram_user_id is not None:
            tg_uids.append(int(telegram_user_id))
        if telegram_user_id_secondary is not None:
            sec = int(telegram_user_id_secondary)
            if sec not in tg_uids:
                tg_uids.append(sec)

        if telegram_user_id is not None or telegram_user_id_secondary is not None:
            binding_row: dict = {
                "id_distribuidor": dist_id,
                "id_vendedor_v2": id_vendedor_v2,
                "telegram_group_id": telegram_chat_id,
                "updated_by": performed_by,
            }
            if telegram_user_id is not None:
                binding_row["telegram_user_id"] = int(telegram_user_id)
            if telegram_user_id_secondary is not None:
                binding_row["telegram_user_id_secondary"] = int(telegram_user_id_secondary)
            sb.table("vendedores_telegram_binding").upsert(
                binding_row,
                on_conflict="id_distribuidor,id_vendedor_v2",
            ).execute()

        if tg_uids:
            from core.fv_telegram_binding import propagate_telegram_users_to_vendedor

            vendedor_erp = None
            try:
                from core.tenant_tables import tenant_table_name

                t_v = tenant_table_name("vendedores_v2", dist_id)
                v_r = (
                    sb.table(t_v)
                    .select("id_vendedor_erp")
                    .eq("id_vendedor", id_vendedor_v2)
                    .limit(1)
                    .execute()
                )
                if v_r.data:
                    vendedor_erp = str(v_r.data[0].get("id_vendedor_erp") or "") or None
            except Exception:
                pass
            propagate_telegram_users_to_vendedor(
                dist_id,
                id_vendedor_v2,
                vendedor_erp,
                tg_uids,
                telegram_chat_id,
            )

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
) -> str:
    """
    Inserta o actualiza en telegram_binding_suggestions si no existe una sugerencia
    pending idéntica (mismo dist, chat y vendedor).

    Returns: 'created' | 'updated' | 'skipped'
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
            sb.table("telegram_binding_suggestions").update({
                "score": score,
                "reasons": reasons,
                "source": source,
            }).eq("id", existing[0]["id"]).execute()
            return "updated"

        sb.table("telegram_binding_suggestions").insert({
            "id_distribuidor": dist_id,
            "telegram_chat_id": telegram_chat_id,
            "id_vendedor_v2": id_vendedor_v2,
            "score": score,
            "reasons": reasons,
            "status": "pending",
            "source": source,
        }).execute()
        return "created"

    except Exception as exc:
        logger.warning(
            "create_suggestion dist=%s chat=%s vendedor=%s err=%s",
            dist_id, telegram_chat_id, id_vendedor_v2, exc,
        )
        return "skipped"
