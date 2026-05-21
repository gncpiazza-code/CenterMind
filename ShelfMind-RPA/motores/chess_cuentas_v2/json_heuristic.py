from __future__ import annotations

import json
import logging
import re
import tempfile
import unicodedata
from pathlib import Path
from typing import Any, Iterator

import pandas as pd

from .paths import ensure_rpa_on_syspath

logger = logging.getLogger("motores.chess_cuentas_v2.json")

CHESS_SALDO_TOTAL_DEUDORES_PATH = "/web/api/saldoTotalDeudores/ObtenerSaldoTotalDeudores"


def _url_es_saldo_total_deudores(url: str) -> bool:
    """
    Solo aceptamos JSON del reporte explícito de CHESS para CC (deudores).
    Otros endpoints (ej. empresas/obtener) tienen grillas parecidas y pocas filas — rompen guardrails API.
    """
    if not url:
        return False
    u = url.lower()
    return "obtenersaldototaldeudores" in u or "/saldototaldeudores/" in u


def _captura_http_ok(it: Any) -> bool:
    st = getattr(it, "status", None)
    if st is None:
        return True
    return int(st) < 400

EXCEL_HEADERS = (
    "Sucursal",
    "Vendedor",
    "Cliente",
    "Cod Cliente",
    "Cant Cbte",
    "Saldo Total",
    "Antiguedad",
    "A 7 Dias",
    "A 15 Dias",
    "A 30 Dias",
    "A 60 Dias",
    "+60 Dias",
)


def _norm(s: str) -> str:
    s = "".join(
        ch for ch in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(ch)
    )
    s = s.lower().strip()
    # Conservar '+' (bucket +60); el resto de no-alfanumérico pasa a espacio.
    s = re.sub(r"[^\w\s+]+", " ", s, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip()


def _iter_nested_lists(obj: Any, depth: int = 0) -> Iterator[list[Any]]:
    if depth > 12:
        return
    if isinstance(obj, list):
        if obj and all(isinstance(x, dict) for x in obj):
            yield obj
        for x in obj:
            yield from _iter_nested_lists(x, depth + 1)
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _iter_nested_lists(v, depth + 1)


def _score_row_keys(row: dict) -> float:
    if not row:
        return 0.0
    keys = " ".join(_norm(k) for k in row)
    score = 0.0
    for token in (
        "vendedor",
        "vendor",
        "seller",
        "cliente",
        "customer",
        "razon",
        "saldo",
        "balance",
        "deuda",
        "sucursal",
        "branch",
        "antiguedad",
        "days",
        "dias",
        "comprobante",
        "invoice",
        "cod",
        "nro",
    ):
        if token in keys:
            score += 1.0
    return score


def pick_best_grid_json(capture_items: list[Any]) -> tuple[list[dict] | None, str | None]:
    best: tuple[float, list[dict], str] | None = None
    for it in capture_items:
        if not _captura_http_ok(it):
            continue
        url = getattr(it, "url", "") or ""
        if not _url_es_saldo_total_deudores(url):
            continue
        j = getattr(it, "body_json", None)
        if j is None:
            continue
        for lst in _iter_nested_lists(j):
            if len(lst) < 3:
                continue
            sample = lst[0] if isinstance(lst[0], dict) else {}
            row_score = _score_row_keys(sample)
            if row_score < 3:
                continue
            size = float(len(lst))
            total = size * row_score
            if best is None or total > best[0]:
                best = (total, lst, url)
    if not best:
        return None, None
    return best[1], best[2]


def _map_row_to_excel_dict(row: dict) -> dict[str, Any]:
    if "saltot" in row and "nombre" in row and ("dsperso" in row or "dssector" in row):
        return {
            "Sucursal": str(row.get("idSucur") or "").strip(),
            "Vendedor": str(row.get("dsperso") or row.get("dssector") or "").strip(),
            "Cliente": str(row.get("nombre") or "").strip(),
            "Cod Cliente": row.get("idcliente"),
            "Cant Cbte": row.get("cntcbte"),
            "Saldo Total": row.get("saltot"),
            "Antiguedad": row.get("diasdeu"),
            "A 7 Dias": row.get("saldo7"),
            "A 15 Dias": row.get("saldo15"),
            "A 30 Dias": row.get("saldo30"),
            "A 60 Dias": row.get("saldo60"),
            "+60 Dias": row.get("saldomas"),
        }

    nk = {_norm(k): v for k, v in row.items()}

    def pick(*candidates: str) -> Any:
        for c in candidates:
            cn = _norm(c)
            if cn in nk:
                return nk[cn]
        for key, val in nk.items():
            for c in candidates:
                if _norm(c) in key:
                    return val
        return None

    suc = pick("sucursal", "desc sucursal", "dssucur", "branch", "idsucur")
    ven = pick("vendedor", "desc vendedor", "vendor", "seller", "fuerza", "vendedor nombre")
    cli = pick("cliente", "razon social", "nombre", "customer", "nomcli", "fantacli")
    cod = pick("cod cliente", "codigo cliente", "nro cliente", "id cliente", "codcli", "idcliente")
    cant = pick("cant cbte", "cantidad comprobantes", "comprobantes", "cantidad")
    saldo = pick("saldo total", "saldo", "deuda", "balance", "importe")
    anti = pick("diasdeu", "dias deu", "antiguedad deuda", "antiguedad", "antigüedad", "aging")
    s7 = pick("saldo7", "saldo 7", "a 7 dias", "7 dias")
    s15 = pick("saldo15", "saldo 15", "a 15 dias", "15 dias")
    s30 = pick("saldo30", "saldo 30", "a 30 dias", "30 dias")
    s60 = pick("saldo60", "saldo 60", "a 60 dias", "60 dias")
    smas = pick("saldomas", "saldo mas", "+60 dias", "a mas de 60")

    return {
        "Sucursal": "" if suc is None else str(suc).strip(),
        "Vendedor": "" if ven is None else str(ven).strip(),
        "Cliente": "" if cli is None else str(cli).strip(),
        "Cod Cliente": cod,
        "Cant Cbte": cant,
        "Saldo Total": saldo,
        "Antiguedad": anti,
        "A 7 Dias": s7,
        "A 15 Dias": s15,
        "A 30 Dias": s30,
        "A 60 Dias": s60,
        "+60 Dias": smas,
    }


def api_rows_to_datos(rows: list[dict]) -> dict | None:
    if not rows:
        return None
    ensure_rpa_on_syspath()
    from lib.cuentas_parser import procesar_excel_cuentas

    mapped = [_map_row_to_excel_dict(r) for r in rows]
    df = pd.DataFrame(mapped, columns=list(EXCEL_HEADERS))
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        p = Path(tmp.name)
    try:
        df.to_excel(p, index=False)
        return procesar_excel_cuentas(str(p))
    except Exception as e:
        logger.error("api_rows_to_datos: %s", e)
        return None
    finally:
        p.unlink(missing_ok=True)


def try_build_datos_from_capture(capture_items: list[Any]) -> tuple[dict | None, str | None]:
    """Solo usa respuestas cuya URL sea ObtenerSaldoTotalDeudores (evita falsos positivos tipo empresas/obtener)."""
    rows, url = pick_best_grid_json(capture_items)
    if not rows:
        return None, None
    datos = api_rows_to_datos(rows)
    return datos, url
