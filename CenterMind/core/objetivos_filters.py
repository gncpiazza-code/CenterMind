"""
Filtros reutilizables para objetivos de vendedor.
Usado en bot_worker.cmd_objetivos y recordatorio diario (fase 2).
"""
from datetime import datetime, timezone, timedelta, date


_AR = timezone(timedelta(hours=-3))


def hoy_ar() -> date:
    """Fecha actual en zona AR (UTC-3)."""
    return datetime.now(_AR).date()


def objetivo_activo_para_vendedor(obj: dict, hoy: date | None = None) -> bool:
    """
    Retorna True si el objetivo debe mostrarse al vendedor en /objetivos.

    Reglas:
    - tipo != 'ruteo'
    - fecha_objetivo presente y >= hoy_AR (vence hoy = activo)
    - lanzado_at not null (excluye planificados que el vendedor aún no recibió)
    - cumplido NO excluye (mostrar progreso real, ej 125/100)
    """
    if hoy is None:
        hoy = hoy_ar()

    if str(obj.get("tipo") or "").strip().lower() == "ruteo":
        return False

    fecha_raw = str(obj.get("fecha_objetivo") or "")[:10]
    if not fecha_raw or len(fecha_raw) != 10:
        return False
    try:
        fecha_limite = date.fromisoformat(fecha_raw)
    except ValueError:
        return False

    if fecha_limite < hoy:
        return False

    if not obj.get("lanzado_at"):
        return False

    return True
