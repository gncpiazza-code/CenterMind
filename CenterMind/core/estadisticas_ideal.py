from __future__ import annotations
from typing import Any

KPI_KEYS = ("pdvs", "altas", "exhibiciones", "compradores", "bultos", "cobertura", "objetivos")


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


def score_vendedor(radar: dict, pesos: dict) -> int:
    """
    Weighted score from radar (0-100 values) and pesos (sum=100).
    Returns integer 0-100.
    """
    total = sum(float(radar.get(k, 0)) * float(pesos.get(k, 0)) for k in KPI_KEYS)
    return min(100, round(total / 100))


def build_radar_normalized(real_kpis: dict, meta_kpis: dict) -> dict:
    """
    Build normalized radar dict (keys = KPI_KEYS, values 0-100).
    real_kpis: {pdvs, altas, exhibiciones, compradores, bultos, cobertura_pct, objetivos_pct}
    meta_kpis: {pdvs, altas, exhibiciones, compradores, bultos, cobertura, objetivos} — period totals
    """
    return {
        "pdvs":         normalize_kpi(real_kpis.get("pdvs", 0),         meta_kpis.get("pdvs", 0)),
        "altas":        normalize_kpi(real_kpis.get("altas", 0),        meta_kpis.get("altas", 0)),
        "exhibiciones": normalize_kpi(real_kpis.get("exhibiciones", 0), meta_kpis.get("exhibiciones", 0)),
        "compradores":  normalize_kpi(real_kpis.get("compradores", 0),  meta_kpis.get("compradores", 0)),
        "bultos":       normalize_kpi(real_kpis.get("bultos", 0),       meta_kpis.get("bultos", 0)),
        "cobertura":    normalize_kpi(real_kpis.get("cobertura_pct", 0), meta_kpis.get("cobertura", 0)),
        "objetivos":    normalize_kpi(real_kpis.get("objetivos_pct", 0), meta_kpis.get("objetivos", 0)),
    }


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
