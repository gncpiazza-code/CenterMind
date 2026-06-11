"""
Prorrateo de objetivos para mobile/portal — lun–sáb, misma semántica que objetivo-utils.ts.
La app solo renderiza el JSON devuelto por build_prorrateo_grid().
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any


def _parse_date(iso: str | None) -> date | None:
    if not iso or len(iso) < 10:
        return None
    try:
        return date.fromisoformat(iso[:10])
    except ValueError:
        return None


def _hoy_ar() -> date:
    from core.objetivos_filters import hoy_ar
    return hoy_ar()


def _is_business_day(d: date) -> bool:
    # Python weekday: Mon=0 … Sat=5, Sun=6 — prorrateo lun–sáb
    return d.weekday() <= 5


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def _month_end(d: date) -> date:
    if d.month == 12:
        return date(d.year, 12, 31)
    return date(d.year, d.month + 1, 1) - timedelta(days=1)


def _inicio_efectivo_no_retro(obj: dict, month_start_date: date) -> date:
    for key in ("fecha_inicio", "lanzado_at", "created_at", "fecha_objetivo", "mes_referencia"):
        raw = obj.get(key)
        d = _parse_date(str(raw) if raw else None)
        if d:
            start = d if d >= month_start_date else month_start_date
            return start
    return month_start_date


def _periodo_prorrateo(obj: dict) -> dict | None:
    today = _hoy_ar()
    origen = (obj.get("origen") or "").strip()

    if origen == "compania":
        mes_ref = (obj.get("mes_referencia") or "")[:7]
        if not mes_ref or len(mes_ref) != 7 or obj.get("valor_objetivo") is None:
            return None
        try:
            y, m = mes_ref.split("-")
            mes_ref_date = date(int(y), int(m), 1)
        except ValueError:
            return None
        start = _month_start(mes_ref_date)
        end = _month_end(mes_ref_date)
        tipo = (obj.get("tipo") or "").strip()
        is_no_retro = tipo in ("ruteo_alteo", "conversion_estado")
        start_effective = _inicio_efectivo_no_retro(obj, start) if is_no_retro else start
    else:
        fecha_fin = _parse_date(obj.get("fecha_objetivo"))
        if not fecha_fin:
            return None
        candidatos: list[date] = []
        for key in ("fecha_inicio", "lanzado_at", "created_at"):
            d = _parse_date(str(obj.get(key) or ""))
            if d:
                candidatos.append(d)
        start_effective = max(candidatos) if candidatos else fecha_fin
        end = fecha_fin
        start = start_effective

    todos_dias: list[dict] = []
    dias_validos: list[dict] = []
    start_eff_iso = start_effective.isoformat()
    cur = start
    while cur <= end:
        if _is_business_day(cur):
            iso = cur.isoformat()
            is_pre = iso < start_eff_iso
            is_past = cur < today
            is_today = iso == today.isoformat()
            is_future = cur > today
            dia = {
                "iso": iso,
                "day": cur.day,
                "is_past": is_past,
                "is_today": is_today,
                "is_future": is_future,
                "is_pre_start": is_pre,
            }
            todos_dias.append(dia)
            if not is_pre:
                dias_validos.append(dia)
        cur += timedelta(days=1)

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "start_effective": start_effective.isoformat(),
        "dias_validos": dias_validos,
        "todos_dias": todos_dias,
        "today": today.isoformat(),
    }


def _lunes_semana(d: date) -> date:
    wd = d.weekday()  # Mon=0
    return d - timedelta(days=wd)


def _compute_metas_rolling(
    dias_validos: list[dict],
    meta: float,
    actual: float,
    has_real: bool,
    progreso_diario: dict[str, float],
    avg_pasado: float,
) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    remaining = meta
    for dia in dias_validos:
        iso = dia["iso"]
        if dia["is_past"] or dia["is_today"]:
            futuros_restantes = sum(
                1 for d in dias_validos if d["iso"] >= iso and (d["is_today"] or d["is_future"])
            )
            meta_dia = remaining / futuros_restantes if futuros_restantes > 0 else 0
        else:
            futuros = sum(1 for d in dias_validos if d["is_future"])
            meta_dia = remaining / futuros if futuros > 0 else 0

        if dia["is_pre_start"]:
            avance_dia = 0.0
        elif not dia["is_past"] and not dia["is_today"]:
            avance_dia = 0.0
        elif has_real:
            avance_dia = float(progreso_diario.get(iso, 0))
        elif dia["is_past"] and not dia["is_today"]:
            avance_dia = 0.0
        elif dia["is_today"] and not any(d["is_past"] and not d["is_today"] for d in dias_validos):
            avance_dia = actual
        else:
            avance_dia = float(progreso_diario.get(iso, 0))

        out[iso] = {"meta_dia": meta_dia, "avance_dia": avance_dia}
        if dia["is_past"] or dia["is_today"]:
            remaining = max(0.0, remaining - avance_dia)
    return out


def build_prorrateo_grid(obj: dict, visual_actual: float | None = None) -> dict | None:
    """
    Grilla semanal JSON-serializable para la app móvil.
    Paridad con buildProrrateoGrid() en shelfy-frontend/src/lib/objetivo-utils.ts
    """
    periodo = _periodo_prorrateo(obj)
    if not periodo:
        return None

    meta = float(obj.get("valor_objetivo") or 0)
    if meta <= 0:
        return None

    actual = max(float(obj.get("valor_actual") or 0), float(visual_actual or 0))
    valor_actual_db = float(obj.get("valor_actual") or 0)

    desglose = obj.get("desglose_cache") or obj.get("desglose") or {}
    if isinstance(desglose, str):
        import json
        try:
            desglose = json.loads(desglose)
        except Exception:
            desglose = {}
    if not isinstance(desglose, dict):
        desglose = {}

    progreso_diario_raw = desglose.get("progreso_diario") or {}
    progreso_diario = {str(k): float(v) for k, v in progreso_diario_raw.items()}
    has_real = len(progreso_diario) > 0

    dias_validos = periodo["dias_validos"]
    todos_dias = periodo["todos_dias"]
    pasados = [d for d in dias_validos if d["is_past"] and not d["is_today"]]
    dias_futuros = [d for d in dias_validos if d["is_future"]]

    restante = max(0.0, meta - actual)
    avg_pasado = actual / len(pasados) if pasados else 0.0
    rolling = _compute_metas_rolling(
        dias_validos, meta, actual, has_real, progreso_diario, avg_pasado
    )

    dias_restantes_incl_hoy = sum(1 for d in dias_validos if d["is_today"] or d["is_future"])
    if restante > 0 and dias_restantes_incl_hoy > 0:
        meta_diaria_futura = restante / dias_restantes_incl_hoy
    elif dias_futuros:
        meta_diaria_futura = rolling.get(dias_futuros[0]["iso"], {}).get("meta_dia", 0)
    else:
        hoy_dia = next((d for d in dias_validos if d["is_today"]), None)
        meta_diaria_futura = rolling.get(hoy_dia["iso"], {}).get("meta_dia", 0) if hoy_dia else 0

    semanas_map: dict[str, list[dict]] = {}
    for dia in todos_dias:
        d = date.fromisoformat(dia["iso"])
        key = _lunes_semana(d).isoformat()
        semanas_map.setdefault(key, []).append(dia)

    semanas_out: list[dict] = []
    for key in sorted(semanas_map.keys()):
        dias = semanas_map[key]
        celdas: list[Any] = [None] * 6
        for dia in dias:
            d = date.fromisoformat(dia["iso"])
            col = d.weekday()
            if col > 5:
                continue
            if dia["is_pre_start"]:
                celdas[col] = "pre"
                continue
            is_past_or_today = dia["is_past"] or dia["is_today"]
            cell = rolling.get(dia["iso"], {})
            meta_dia = cell.get("meta_dia", 0)
            avance_dia = cell.get("avance_dia", 0) if is_past_or_today else 0
            pct = min(100, round((avance_dia / meta_dia) * 100)) if meta_dia > 0 else (100 if avance_dia > 0 else 0)
            celdas[col] = {
                "iso": dia["iso"],
                "day": dia["day"],
                "is_today": dia["is_today"],
                "is_past_or_today": is_past_or_today,
                "meta_dia": round(meta_dia, 2),
                "avance_dia": round(avance_dia, 2),
                "pct": pct,
            }

        week_meta = sum(
            c["meta_dia"] for c in celdas if isinstance(c, dict)
        )
        week_avance = sum(
            c["avance_dia"] for c in celdas if isinstance(c, dict)
        )
        week_pct = min(100, round((week_avance / week_meta) * 100)) if week_meta > 0 else 0

        en_semana = [d for d in dias if not d["is_pre_start"]]
        if en_semana:
            first = date.fromisoformat(en_semana[0]["iso"])
            last = date.fromisoformat(en_semana[-1]["iso"])
            label = f"{first.day}/{first.month}" if first == last else f"{first.day}/{first.month} – {last.day}/{last.month}"
        else:
            label = "Semana"

        semanas_out.append({
            "key": key,
            "label": label,
            "celdas": celdas,
            "week_meta": round(week_meta, 2),
            "week_avance": round(week_avance, 2),
            "week_pct": week_pct,
            "aplicable": len(en_semana) > 0,
        })

    suma_progreso = sum(progreso_diario.values())
    tipo = (obj.get("tipo") or "").strip()
    invariante_ok = (
        not has_real
        or valor_actual_db == 0
        or abs(suma_progreso - valor_actual_db) <= 0.01
        or (tipo == "exhibicion" and suma_progreso > 0 and suma_progreso <= valor_actual_db)
    )
    needs_sync = (
        has_real
        and not invariante_ok
        and valor_actual_db > 0
        and tipo != "exhibicion"
    )

    total_dias_validos = len(dias_validos)
    dias_hasta_hoy = sum(1 for d in dias_validos if d["is_past"] and not d["is_today"])
    meta_acumulada = (
        round((dias_hasta_hoy / total_dias_validos) * meta) if total_dias_validos > 0 else 0
    )
    avance_vs_meta = actual - meta_acumulada

    origen = (obj.get("origen") or "").strip()
    label = (
        "Prorrateo mensual (lun–sáb)"
        if origen == "compania"
        else "Prorrateo por período (lun–sáb)"
    )

    return {
        "semanas": semanas_out,
        "meta_diaria_futura": round(meta_diaria_futura, 2),
        "restante": round(restante, 2),
        "futuros": len(dias_futuros),
        "dias_validos": total_dias_validos,
        "label": label,
        "invariante_ok": invariante_ok,
        "needs_progreso_diario_sync": needs_sync,
        "avance_vs_meta": round(avance_vs_meta, 2),
        "meta_acumulada": meta_acumulada,
    }
