"""
test_objetivos_kanban_phase.py
Casos de planificado vs lanzado legacy para la lógica de _compute_kanban_phase.

La función solo devuelve 'planificado' cuando:
  - lanzado_at IS NULL  AND
  - fecha_inicio > hoy_AR  AND
  - not cumplido
"""
from datetime import datetime, timezone, timedelta


def _compute_kanban_phase(obj: dict) -> str:
    """Copia exacta del backend para tests unitarios sin dependencias de FastAPI."""
    # Planificado solo si: sin lanzar AND fecha_inicio aún en futuro AR AND no cumplido
    if not obj.get("lanzado_at") and not obj.get("cumplido"):
        from datetime import datetime, timezone, timedelta
        _tz_ar = timezone(timedelta(hours=-3))
        hoy_ar = datetime.now(_tz_ar).date().isoformat()
        fecha_inicio = obj.get("fecha_inicio")
        if fecha_inicio:
            fecha_inicio_str = str(fecha_inicio)[:10]
            if fecha_inicio_str > hoy_ar:
                return "planificado"
        else:
            # sin fecha_inicio → legacy, tratar como ya activo
            pass
        # lanzado_at NULL pero fecha_inicio <= hoy: tratar como activo (caen al bloque siguiente)

    if obj.get("cumplido"):
        return "terminado"

    tipo = obj.get("tipo")
    obj_items = obj.get("items", [])
    items_count = obj.get("items_count", 0)
    items_cumplidos = obj.get("items_cumplidos", 0)

    if tipo == "exhibicion":
        items_con_foto = sum(
            1 for it in obj_items
            if it.get("estado_item") in ("foto_subida", "cumplido")
        )
        if items_count > 0:
            resolved = sum(
                1
                for it in obj_items
                if it.get("estado_item") in ("cumplido", "falla")
            )
            if resolved >= items_count:
                return "terminado"
            if items_con_foto > 0:
                return "en_progreso"
            return "pendiente"
        if obj.get("tiene_exhibicion_pendiente"):
            return "en_progreso"
        if (obj.get("valor_actual") or 0) > 0:
            return "en_progreso"
        return "pendiente"

    valor_actual = obj.get("valor_actual") or 0
    valor_objetivo = obj.get("valor_objetivo")

    if items_count > 0:
        if items_count == 1:
            return "terminado" if items_cumplidos >= 1 else "pendiente"
        if items_cumplidos >= items_count:
            return "terminado"
        if items_cumplidos > 0:
            return "en_progreso"
        return "pendiente"

    if valor_actual > 0:
        if valor_objetivo and valor_actual >= float(valor_objetivo):
            return "terminado"
        return "en_progreso"
    return "pendiente"


TZ_AR = timezone(timedelta(hours=-3))
HOY_AR = datetime.now(TZ_AR).date().isoformat()
# Una fecha pasada
FECHA_PASADA = "2026-01-01"
# Una fecha futura
FECHA_FUTURA = "2099-01-01"


def test_planificado_cuando_fecha_futura_y_sin_lanzar():
    """lanzado_at NULL + fecha_inicio en futuro → planificado."""
    obj = {"lanzado_at": None, "cumplido": False, "fecha_inicio": FECHA_FUTURA, "tipo": "ruteo_alteo"}
    assert _compute_kanban_phase(obj) == "planificado"


def test_no_planificado_cuando_fecha_inicio_pasada_y_sin_lanzar():
    """Bug fix: lanzado_at NULL + fecha_inicio pasada → NO planificado (pendiente)."""
    obj = {
        "lanzado_at": None, "cumplido": False,
        "fecha_inicio": FECHA_PASADA, "tipo": "ruteo_alteo",
        "valor_actual": 0, "items_count": 0
    }
    assert _compute_kanban_phase(obj) != "planificado"


def test_no_planificado_cuando_sin_fecha_inicio():
    """Legacy sin fecha_inicio → trata como activo, nunca planificado."""
    obj = {
        "lanzado_at": None, "cumplido": False,
        "fecha_inicio": None, "tipo": "ruteo_alteo",
        "valor_actual": 0, "items_count": 0
    }
    result = _compute_kanban_phase(obj)
    assert result != "planificado", f"Esperaba no-planificado, obtuvo {result}"


def test_terminado_cuando_cumplido():
    """cumplido=True → terminado siempre."""
    obj = {"cumplido": True, "lanzado_at": None, "tipo": "ruteo_alteo"}
    assert _compute_kanban_phase(obj) == "terminado"


def test_pendiente_cuando_lanzado_sin_progreso():
    """lanzado_at set + sin progreso → pendiente."""
    obj = {
        "lanzado_at": "2026-04-01T00:00:00Z", "cumplido": False,
        "tipo": "ruteo_alteo", "valor_actual": 0, "items_count": 0,
        "fecha_inicio": FECHA_PASADA
    }
    assert _compute_kanban_phase(obj) == "pendiente"


def test_en_progreso_cuando_valor_actual_positivo():
    """lanzado_at set + valor_actual > 0 + no cumplido → en_progreso."""
    obj = {
        "lanzado_at": "2026-04-01T00:00:00Z", "cumplido": False,
        "tipo": "cobranza", "valor_actual": 5, "valor_objetivo": 10,
        "items_count": 0
    }
    assert _compute_kanban_phase(obj) == "en_progreso"


def test_terminado_cuando_objetivo_alcanzado():
    """valor_actual >= valor_objetivo → terminado."""
    obj = {
        "lanzado_at": "2026-04-01T00:00:00Z", "cumplido": False,
        "tipo": "cobranza", "valor_actual": 10, "valor_objetivo": 10,
        "items_count": 0
    }
    assert _compute_kanban_phase(obj) == "terminado"


def test_exhibicion_en_progreso_con_foto():
    """Exhibición con item foto_subida → en_progreso."""
    obj = {
        "lanzado_at": "2026-04-01T00:00:00Z", "cumplido": False,
        "tipo": "exhibicion", "items_count": 1, "items_cumplidos": 0,
        "items": [{"estado_item": "foto_subida"}]
    }
    assert _compute_kanban_phase(obj) == "en_progreso"


if __name__ == "__main__":
    tests = [
        test_planificado_cuando_fecha_futura_y_sin_lanzar,
        test_no_planificado_cuando_fecha_inicio_pasada_y_sin_lanzar,
        test_no_planificado_cuando_sin_fecha_inicio,
        test_terminado_cuando_cumplido,
        test_pendiente_cuando_lanzado_sin_progreso,
        test_en_progreso_cuando_valor_actual_positivo,
        test_terminado_cuando_objetivo_alcanzado,
        test_exhibicion_en_progreso_con_foto,
    ]
    passed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS {t.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL {t.__name__}: {e}")
    print(f"\n{passed}/{len(tests)} tests passed")
