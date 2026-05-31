# -*- coding: utf-8 -*-
"""
Generación de conclusiones formales para el Repaso Comercial.

Lógica 100% determinística — sin IA, sin I/O.
"""
from __future__ import annotations

from typing import Any


_KPI_LABELS: dict[str, str] = {
    "pdvs": "Cartera PDV",
    "altas": "Altas",
    "exhibiciones": "Exhibiciones",
    "compradores": "Compradores",
    "bultos": "Venta en bultos",
    "score": "Score FIFA",
}


def _safe_float(val: Any, fallback: float = 0.0) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return fallback


def _raw_kpis(carta: dict | None) -> dict:
    if not carta:
        return {}
    return carta.get("raw_kpis") or {}


def _fmt_val(kpi: str, val: float) -> str:
    if kpi == "bultos":
        return f"{val:.2f}".rstrip("0").rstrip(".")
    if kpi == "score":
        return str(int(round(val)))
    if val == int(val):
        return str(int(val))
    return f"{val:g}"


def _pct_change(actual: float, anterior: float) -> float | None:
    if anterior == 0:
        return None
    return round((actual - anterior) / abs(anterior) * 100, 1)


def _tono(delta: float | None) -> str:
    if delta is None:
        return "neutro"
    if delta > 0:
        return "positivo"
    if delta < 0:
        return "alerta"
    return "neutro"


def _conclusion_text(
    kpi: str,
    label: str,
    actual: float,
    anterior: float | None,
    delta: float | None,
) -> tuple[str, str]:
    """Retorna (titulo, mensaje narrativo)."""
    act_s = _fmt_val(kpi, actual)

    if delta is None or anterior is None:
        return (
            f"{label}: sin referencia previa",
            f"Cierra el período con {act_s} en {label.lower()}. No hay snapshot de la quincena anterior para contrastar evolución.",
        )

    ant_s = _fmt_val(kpi, anterior)
    d = delta
    sign = "+" if d > 0 else ""
    pct = _pct_change(actual, anterior)

    if kpi == "score":
        if d > 0:
            return (
                f"Score en ascenso ({sign}{int(d)} pts)",
                f"Subió de {ant_s} a {act_s} puntos. La carta FIFA refleja mejor desempeño global respecto a la quincena previa.",
            )
        if d < 0:
            return (
                f"Score en descenso ({int(d)} pts)",
                f"Bajó de {ant_s} a {act_s} puntos. Conviene revisar qué ejes empujaron la caída (exhibiciones, compradores o cobertura).",
            )
        return (
            "Score estable",
            f"Se mantiene en {act_s} pts, alineado con el período anterior.",
        )

    if kpi == "exhibiciones":
        if d > 0:
            extra = f" (+{pct}%)" if pct is not None else ""
            return (
                f"Más exhibiciones enviadas ({sign}{int(d)}{extra})",
                f"Pasó de {ant_s} a {act_s} visitas con foto. Buena señal de presencia en góndola; sostener el ritmo de carga.",
            )
        if d < 0:
            extra = f" ({pct}%)" if pct is not None else ""
            return (
                f"Caída en exhibiciones ({int(d)}{extra})",
                f"De {ant_s} bajó a {act_s} envíos. Riesgo de perder visibilidad en PDV; priorizar clientes sin foto en la quincena.",
            )
        return (
            "Exhibiciones estables",
            f"Mantiene {act_s} envíos, sin variación relevante vs. la quincena anterior.",
        )

    if kpi == "compradores":
        if d > 0:
            if anterior == 0:
                return (
                    "Despegue comercial",
                    f"Pasó de ningún comprador registrado a {act_s} PDVs con venta. Arranque fuerte de facturación en cartera.",
                )
            return (
                f"Más PDVs compradores ({sign}{int(d)})",
                f"Amplió de {ant_s} a {act_s} clientes con compra. La base activa de facturación crece.",
            )
        if d < 0:
            return (
                f"Menos compradores ({int(d)})",
                f"Contrajo de {ant_s} a {act_s} PDVs con venta. Revisar clientes que dejaron de comprar en el período.",
            )
        return (
            "Compradores sin cambio",
            f"Sostiene {act_s} PDVs compradores respecto al período previo.",
        )

    if kpi == "bultos":
        if d > 0:
            return (
                f"Volumen al alza ({sign}{_fmt_val(kpi, d)} bultos)",
                f"De {ant_s} a {act_s} bultos facturados. El ticket por volumen acompaña la gestión comercial.",
            )
        if d < 0:
            return (
                f"Volumen a la baja ({_fmt_val(kpi, d)} bultos)",
                f"De {ant_s} a {act_s} bultos. Evaluar mix de productos y frecuencia de reposición en clientes clave.",
            )
        return (
            "Volumen estable",
            f"Facturación en {act_s} bultos, sin variación material vs. la quincena anterior.",
        )

    if kpi == "altas":
        if d > 0:
            return (
                f"Más altas de padrón ({sign}{int(d)})",
                f"Incorporó {act_s} altas vs. {ant_s} en la quincena previa. La cartera gana nuevos puntos de venta.",
            )
        if d < 0:
            return (
                f"Menos altas ({int(d)})",
                f"Solo {act_s} altas frente a {ant_s} anteriores. Si el objetivo es crecer cartera, intensificar prospección.",
            )
        return (
            "Altas estables",
            f"Registra {act_s} altas, igual que en el período anterior.",
        )

    if kpi == "pdvs":
        if d != 0:
            return (
                f"Cartera {'creció' if d > 0 else 'se redujo'} ({sign}{int(d)} PDVs)",
                f"De {ant_s} a {act_s} PDVs activos en gestión.",
            )
        return (
            "Cartera estable",
            f"Mantiene {act_s} PDVs activos sin cambios vs. la quincena anterior.",
        )

    # fallback genérico
    if d > 0:
        return (f"{label} mejoró", f"De {ant_s} a {act_s} ({sign}{_fmt_val(kpi, d)}).")
    if d < 0:
        return (f"{label} retrocedió", f"De {ant_s} a {act_s} ({_fmt_val(kpi, d)}).")
    return (f"{label} sin cambio", f"Permanece en {act_s}.")


def _build_insight(
    kpi: str,
    label: str,
    valor_actual: float,
    valor_anterior: float | None,
) -> dict:
    delta: float | None = None
    if valor_anterior is not None:
        delta = round(valor_actual - valor_anterior, 2)

    titulo, mensaje = _conclusion_text(kpi, label, valor_actual, valor_anterior, delta)

    return {
        "kpi": kpi,
        "delta": delta,
        "titulo": titulo,
        "mensaje_formal": mensaje,
        "tono": _tono(delta),
        "accion_numerica": None,
    }


def build_insights_formal(
    carta_actual: dict,
    carta_anterior: dict | None,
    carta_cierre_anterior: dict | None,
) -> list[dict]:
    raw_act = _raw_kpis(carta_actual)
    raw_ant = _raw_kpis(carta_anterior)
    raw_cierre = _raw_kpis(carta_cierre_anterior) if carta_cierre_anterior else {}

    insights: list[dict] = []

    for kpi, label in _KPI_LABELS.items():
        if kpi == "score":
            valor_actual = _safe_float(carta_actual.get("score") if carta_actual else None)
            if raw_cierre:
                valor_anterior_raw: float | None = _safe_float(
                    (carta_cierre_anterior or {}).get("score")
                )
            elif raw_ant:
                valor_anterior_raw = _safe_float((carta_anterior or {}).get("score"))
            else:
                valor_anterior_raw = None
        else:
            valor_actual = _safe_float(raw_act.get(kpi))
            valor_anterior_raw = _safe_float(raw_ant[kpi]) if kpi in raw_ant else None

        insights.append(_build_insight(kpi, label, valor_actual, valor_anterior_raw))

    return insights


def delta_radar_axes(actual: dict, anterior: dict) -> dict:
    radar_act: dict = actual.get("radar") or {}
    radar_ant: dict = anterior.get("radar") or {}
    deltas: dict[str, float | None] = {}
    all_axes = set(radar_act) | set(radar_ant)
    for axis in all_axes:
        v_act = _safe_float(radar_act.get(axis))
        if axis in radar_ant:
            v_ant = _safe_float(radar_ant[axis])
            deltas[axis] = round(v_act - v_ant, 4)
        else:
            deltas[axis] = None
    return deltas
