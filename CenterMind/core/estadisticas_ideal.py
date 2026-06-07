from __future__ import annotations
from typing import Any

KPI_KEYS = ("pdvs", "altas", "exhibiciones", "compradores", "bultos", "cobertura", "objetivos")
RADAR_OUTPUT_KEYS = KPI_KEYS + ("pdvs_exhibidos",)


def validate_pesos(pesos: dict) -> tuple[bool, str]:
    """Returns (ok, error_message). Checks all keys present, all > 0, sum == 100."""
    for k in KPI_KEYS:
        if k not in pesos:
            return False, f"Falta clave '{k}'"
        if not isinstance(pesos[k], (int, float)) or pesos[k] <= 0:
            return False, f"Peso '{k}' debe ser > 0"
    total = sum(pesos[k] for k in KPI_KEYS)
    if round(total) != 100:
        return False, f"La suma de pesos debe ser 100 (actual: {total})"
    return True, ""


def repartir_pesos(pesos: dict, bloqueados: list[str] | None = None) -> dict:
    """
    Distributes remainder (100 - current_sum) equally among unlocked KPIs.
    Fractional +1 is assigned to the first KPIs until remainder is exact.
    All pesos >= 1 always.
    """
    bloqueados = bloqueados or []
    libres = [k for k in KPI_KEYS if k not in bloqueados]
    if not libres:
        return pesos

    suma_bloq = sum(pesos.get(k, 0) for k in bloqueados)
    restante = 100 - suma_bloq
    base = max(1, restante // len(libres))
    sobra = restante - base * len(libres)

    result = dict(pesos)
    for i, k in enumerate(libres):
        result[k] = base + (1 if i < sobra else 0)
    return result


def meta_periodo_kpi(ideal: dict, kpi_name: str, n_meses: int) -> float:
    """
    Calculate total meta for a KPI over n_meses.
    - pdvs: uses meta_pdvs_total (fixed, not multiplied)
    - altas: computed separately (opción B), not here
    - others: kpis_mensuales[kpi_name] * n_meses
    """
    if kpi_name == "pdvs":
        return float(ideal.get("meta_pdvs_total", 0))
    km = ideal.get("kpis_mensuales", {})
    mensual = float(km.get(kpi_name, 0))
    return mensual * n_meses


def normalize_kpi(real: float, meta: float) -> int:
    """Returns 0-100 normalized value. If meta == 0, returns 0."""
    if meta <= 0:
        return 0
    return min(100, round(real / meta * 100))


def cobertura_exhibicion_pct_from_raw(real_kpis: dict) -> float:
    """% cartera exhibida: cobertura_pct o fallback pdvs_exhibidos ÷ pdvs."""
    direct = float(real_kpis.get("cobertura_pct") or 0)
    if direct > 0:
        return min(100.0, direct)
    pdvs = float(real_kpis.get("pdvs") or 0)
    exh = float(real_kpis.get("pdvs_exhibidos") or 0)
    if pdvs > 0 and exh > 0:
        return min(100.0, exh / pdvs * 100)
    return 0.0


def score_vendedor(radar: dict, pesos: dict) -> int:
    """
    Weighted score from radar (0-100 values) and pesos (sum=100).
    Returns integer 0-100.
    """
    total = sum(float(radar.get(k, 0)) * float(pesos.get(k, 0)) for k in KPI_KEYS)
    return min(100, round(total / 100))


def radar_ideal_target() -> dict:
    """Polígono de referencia del ideal (100 % en cada eje, incl. CEX)."""
    out = {k: 100 for k in KPI_KEYS}
    out["pdvs_exhibidos"] = 100
    return out


def ideal_meta_display_values(
    ideal: dict,
    n_meses: int,
    real_kpis: dict | None = None,
) -> dict[str, float]:
    """
    Metas absolutas del ideal para tooltips/UI (no porcentajes 0–100).
    Altas: faltante de PDVs vs meta_pdvs_total, igual que build_radar_normalized.
    """
    km = ideal.get("kpis_mensuales") or {}
    n = max(1, n_meses)
    meta_pdvs = float(ideal.get("meta_pdvs_total", 0))
    altas_meta = meta_pdvs
    if real_kpis is not None and meta_pdvs > 0:
        altas_meta = max(1.0, meta_pdvs - float(real_kpis.get("pdvs", 0)))

    return {
        "pdvs": meta_pdvs,
        "altas": altas_meta,
        "exhibiciones": float(km.get("exhibiciones", 0)) * n,
        "pdvs_exhibidos": float(km.get("cobertura_exhibicion_pct", 0)),
        "compradores": float(km.get("pdvs_compradores", 0)) * n,
        "bultos": float(km.get("bultos", 0)) * n,
        "cobertura": float(km.get("cobertura_pct", 0)),
        "objetivos": float(km.get("objetivos_pct", 0)),
    }


def resolve_scoring_ideal(ideal_dist: dict | None, ideal_comp: dict | None) -> tuple[dict | None, dict]:
    """Meta y pesos: prioriza ideal distribuidora; si no hay, compañía."""
    default_pesos = {
        "pdvs": 15, "altas": 15, "exhibiciones": 15, "compradores": 15,
        "bultos": 15, "cobertura": 15, "objetivos": 10,
    }
    if ideal_dist:
        return ideal_dist, ideal_dist.get("pesos") or default_pesos
    if ideal_comp:
        return ideal_comp, ideal_comp.get("pesos") or default_pesos
    return None, default_pesos


def _display_meta(meta_kpis: dict, batch_caps: dict | None) -> dict:
    """Si meta del ideal es 0 en un eje, usa techo del batch para poder dibujar el radar."""
    caps = batch_caps or {}
    out: dict[str, float] = {}
    for k in KPI_KEYS:
        m = float(meta_kpis.get(k, 0))
        if m <= 0:
            cap = float(caps.get(k, 0))
            m = max(cap * 1.05, 1.0) if cap > 0 else 1.0
        out[k] = m
    return out


def build_radar_scoring_normalized(
    real_kpis: dict,
    meta_kpis: dict,
    ideal: dict | None = None,
    batch_caps: dict | None = None,
) -> dict:
    """
    Radar 0–100: cumplimiento vs meta del ideal (score ponderado).
    real_kpis usa cobertura_pct / objetivos_pct; meta_kpis usa cobertura / objetivos.
    """
    dm = _display_meta(meta_kpis, batch_caps)
    altas_meta = float(dm.get("altas", 0))
    if ideal and float(ideal.get("meta_pdvs_total") or 0) > 0:
        faltante = max(1.0, float(ideal["meta_pdvs_total"]) - float(real_kpis.get("pdvs", 0)))
        altas_meta = faltante

    pdvs_exhibidos_meta = float(meta_kpis.get("pdvs_exhibidos", 0))
    if pdvs_exhibidos_meta <= 0 and batch_caps:
        pdvs_exhibidos_meta = float(batch_caps.get("pdvs_exhibidos", 0))
    if pdvs_exhibidos_meta <= 0:
        pdvs_exhibidos_meta = 100.0

    real_cobertura_exhibicion = cobertura_exhibicion_pct_from_raw(real_kpis)

    return {
        "pdvs": normalize_kpi(real_kpis.get("pdvs", 0), dm.get("pdvs", 0)),
        "altas": normalize_kpi(real_kpis.get("altas", 0), altas_meta),
        "exhibiciones": normalize_kpi(real_kpis.get("exhibiciones", 0), dm.get("exhibiciones", 0)),
        "pdvs_exhibidos": normalize_kpi(real_cobertura_exhibicion, pdvs_exhibidos_meta),
        "compradores": normalize_kpi(real_kpis.get("compradores", 0), dm.get("compradores", 0)),
        "bultos": normalize_kpi(real_kpis.get("bultos", 0), dm.get("bultos", 0)),
        "cobertura": normalize_kpi(
            real_kpis.get("cobertura_compra_pct", real_kpis.get("cobertura_pct", 0)),
            dm.get("cobertura", 0),
        ),
        "objetivos": normalize_kpi(real_kpis.get("objetivos_pct", 0), dm.get("objetivos", 0)),
    }


def build_radar_normalized(
    real_kpis: dict,
    meta_kpis: dict,
    ideal: dict | None = None,
    batch_caps: dict | None = None,
) -> dict:
    """
    Radar 0–100: cumplimiento vs meta del ideal (UI y score).
    CEX: cobertura_pct real ÷ meta cobertura_exhibicion_pct.
    COB: cobertura_compra_pct real ÷ meta cobertura_pct del ideal.
    """
    return build_radar_scoring_normalized(
        real_kpis, meta_kpis, ideal=ideal, batch_caps=batch_caps
    )


def diff_ideal(old: dict | None, new: dict) -> dict:
    """Compute diff between old and new ideal config for historial."""
    if not old:
        return {"tipo": "creacion", "nuevo": new}
    changes: dict[str, Any] = {}
    for k in ("meta_pdvs_total", "kpis_mensuales", "pesos"):
        v_old = old.get(k)
        v_new = new.get(k)
        if v_old != v_new:
            changes[k] = {"anterior": v_old, "nuevo": v_new}
    return changes
