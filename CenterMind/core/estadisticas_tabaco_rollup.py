"""
Rollup de equipos — Tabaco & Hnos (dist_id=3) para módulo Estadísticas.

- Ivan Soto: carta única con KPIs de Monchi Ayala + Jorge Coronel (+ propios).
- Matias Wutrich: carta única con KPIs de Ivan Wutrich (+ propios); oculta fila Ivan Wutrich.
"""
from __future__ import annotations

import logging
import unicodedata
from dataclasses import dataclass

from core.helpers import build_integrante_to_erp_name

logger = logging.getLogger("estadisticas_tabaco_rollup")

TABACO_DIST_ID = 3
IVAN_SOTO_V2_ID = 30


def _norm_name(s: str) -> str:
    t = (s or "").strip().lower()
    return "".join(
        c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn"
    )


def _tokens(s: str) -> str:
    return _norm_name(s)


def _is_ivan_soto(nombre: str) -> bool:
    t = _tokens(nombre)
    return "ivan" in t and "soto" in t


def _is_soto_helper_vendor(nombre: str) -> bool:
    """Vendedor ERP auxiliar del equipo Soto (no el líder)."""
    t = _tokens(nombre)
    if _is_ivan_soto(nombre):
        return False
    return "monchi" in t or "jorge" in t or "coronel" in t


def _is_matias_wutrich(nombre: str) -> bool:
    t = _tokens(nombre)
    return "matias" in t and ("wutrich" in t or "wuthrich" in t)


def _is_ivan_wutrich(nombre: str) -> bool:
    t = _tokens(nombre)
    return "ivan" in t and ("wutrich" in t or "wuthrich" in t) and "matias" not in t


@dataclass(frozen=True)
class TabacoRollupGroup:
    leader_vid: int
    member_vids: tuple[int, ...]


def resolve_tabaco_rollup_groups(vend_rows: list[dict]) -> list[TabacoRollupGroup]:
    """Resuelve líderes y miembros por nombre_erp en vendedores_v2."""
    by_name: list[tuple[str, int]] = []
    for v in vend_rows or []:
        try:
            vid = int(v["id_vendedor"])
        except (TypeError, ValueError):
            continue
        nom = (v.get("nombre_erp") or "").strip()
        if nom:
            by_name.append((nom, vid))

    groups: list[TabacoRollupGroup] = []

    ivan_vid: int | None = None
    soto_helpers: list[int] = []
    matias_vid: int | None = None
    ivan_w_vid: int | None = None

    for nom, vid in by_name:
        if _is_ivan_soto(nom):
            ivan_vid = vid
        elif _is_soto_helper_vendor(nom):
            soto_helpers.append(vid)
        elif _is_matias_wutrich(nom):
            matias_vid = vid
        elif _is_ivan_wutrich(nom):
            ivan_w_vid = vid

    if ivan_vid is not None:
        members = tuple(v for v in soto_helpers if v != ivan_vid)
        groups.append(TabacoRollupGroup(leader_vid=ivan_vid, member_vids=members))

    if matias_vid is not None:
        members: list[int] = []
        if ivan_w_vid is not None and ivan_w_vid != matias_vid:
            members.append(ivan_w_vid)
        groups.append(TabacoRollupGroup(leader_vid=matias_vid, member_vids=tuple(members)))

    return groups


def merge_raw_kpis(parts: list[dict], leader_pdvs: int) -> dict:
    """Suma KPIs de miembros; PDVs del líder (rutas); recalcula cobertura y objetivos."""
    if not parts:
        return {
            "pdvs": 0,
            "altas": 0,
            "exhibiciones": 0,
            "compradores": 0,
            "bultos": 0,
            "cobertura_pct": 0.0,
            "objetivos_pct": 0.0,
        }

    altas = sum(int(p.get("altas") or 0) for p in parts)
    exhibiciones = sum(int(p.get("exhibiciones") or 0) for p in parts)
    compradores = sum(int(p.get("compradores") or 0) for p in parts)
    bultos = sum(int(p.get("bultos") or 0) for p in parts)

    pdvs = leader_pdvs if leader_pdvs > 0 else max(int(p.get("pdvs") or 0) for p in parts)

    cob_vals = [float(p.get("cobertura_pct") or 0) for p in parts if p.get("pdvs")]
    if pdvs > 0 and exhibiciones > 0:
        cobertura_pct = min(100.0, exhibiciones / pdvs * 100)
    elif cob_vals:
        cobertura_pct = max(cob_vals)
    else:
        cobertura_pct = 0.0

    obj_pcts = [float(p.get("objetivos_pct") or 0) for p in parts]
    objetivos_pct = max(obj_pcts) if obj_pcts else 0.0

    return {
        "pdvs": pdvs,
        "altas": altas,
        "exhibiciones": exhibiciones,
        "compradores": compradores,
        "bultos": bultos,
        "cobertura_pct": round(cobertura_pct, 1),
        "objetivos_pct": round(objetivos_pct, 1),
    }


def apply_tabaco_rollups(
    dist_id: int,
    all_raw: dict[str, dict],
    vend_rows: list[dict],
) -> tuple[dict[str, dict], set[str]]:
    """
    Fusiona KPIs de miembros en el líder y devuelve ids de vendedor a ocultar en cartas.
    """
    if dist_id != TABACO_DIST_ID:
        return all_raw, set()

    hidden: set[str] = set()
    out = dict(all_raw)

    for group in resolve_tabaco_rollup_groups(vend_rows):
        leader_key = str(group.leader_vid)
        leader_raw = dict(out.get(leader_key) or {})
        leader_pdvs = int(leader_raw.get("pdvs") or 0)

        parts = [leader_raw]
        for mid in group.member_vids:
            mkey = str(mid)
            mraw = out.get(mkey)
            if mraw:
                parts.append(mraw)
            hidden.add(mkey)

        merged = merge_raw_kpis(parts, leader_pdvs)
        if merged.get("pdvs", 0) > 0:
            out[leader_key] = merged
        elif leader_key in out:
            del out[leader_key]

    return out, hidden


def build_integrante_to_erp_name_estadisticas(dist_id: int) -> dict[int, str]:
    """
    Mapeo integrante → ERP para agregación en estadísticas.
    En Tabaco, helpers de Ivan Soto y cuentas Wutrich se atribuyen al ERP del líder.
    """
    if dist_id != TABACO_DIST_ID:
        return build_integrante_to_erp_name(dist_id)

    from db import sb
    from core.tenant_tables import tenant_table_name

    base = build_integrante_to_erp_name(dist_id)

    t_vend = tenant_table_name("vendedores_v2", dist_id)
    vend_res = (
        sb.table(t_vend)
        .select("id_vendedor,nombre_erp")
        .eq("id_distribuidor", dist_id)
        .execute()
    )
    ivan_soto_erp = ""
    matias_wutrich_erp = ""
    for v in vend_res.data or []:
        nom = (v.get("nombre_erp") or "").strip()
        if not nom:
            continue
        if _is_ivan_soto(nom):
            ivan_soto_erp = nom.upper()
        if _is_matias_wutrich(nom):
            matias_wutrich_erp = nom.upper()

    ig_res = (
        sb.table("integrantes_grupo")
        .select("id_integrante,nombre_integrante,id_vendedor_v2")
        .eq("id_distribuidor", dist_id)
        .execute()
    )

    for ig in ig_res.data or []:
        try:
            iid = int(ig["id_integrante"])
        except (TypeError, ValueError):
            continue
        tg = _tokens(ig.get("nombre_integrante") or "")
        try:
            v2 = int(ig["id_vendedor_v2"]) if ig.get("id_vendedor_v2") is not None else None
        except (TypeError, ValueError):
            v2 = None

        if v2 == IVAN_SOTO_V2_ID and ivan_soto_erp:
            base[iid] = ivan_soto_erp
            continue

        if matias_wutrich_erp and ("wutrich" in tg or "wuthrich" in tg):
            if "matias" in tg or "ivan" in tg:
                base[iid] = matias_wutrich_erp
                continue

        if ivan_soto_erp and (_is_soto_helper_vendor(tg) or "monchi" in tg or "jorge" in tg):
            base[iid] = ivan_soto_erp

    return base


def tabaco_rollup_integrante_ids(dist_id: int, leader_nombre_erp: str) -> list[int]:
    """Integrantes adicionales para detalle de carta (equipo bajo el líder)."""
    if dist_id != TABACO_DIST_ID:
        return []

    from db import sb

    leader = (leader_nombre_erp or "").strip()
    ids: list[int] = []
    ig_res = (
        sb.table("integrantes_grupo")
        .select("id_integrante,nombre_integrante,id_vendedor_v2")
        .eq("id_distribuidor", dist_id)
        .execute()
    )
    for ig in ig_res.data or []:
        try:
            iid = int(ig["id_integrante"])
        except (TypeError, ValueError):
            continue
        tg = _tokens(ig.get("nombre_integrante") or "")
        try:
            v2 = int(ig["id_vendedor_v2"]) if ig.get("id_vendedor_v2") is not None else None
        except (TypeError, ValueError):
            v2 = None

        if _is_ivan_soto(leader):
            if v2 == IVAN_SOTO_V2_ID:
                ids.append(iid)
            elif "monchi" in tg or "jorge" in tg or "coronel" in tg:
                ids.append(iid)
        elif _is_matias_wutrich(leader):
            if "wutrich" in tg or "wuthrich" in tg:
                ids.append(iid)

    return ids
