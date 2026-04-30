#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Análisis de los cuatro Excel de Rendimiento en calle (Nextbyn SIGO):
  PDV/clientes día, Dispositivos, Rutas (progreso), Ventas fuera de ruta.

Métricas de tiempo (`time_to_sell`, tiempo en PDV hasta desenlace) son aproximaciones
basadas sólo en marcas de hora visita / venta / motivo exportadas por la plataforma;
no equivalen a tracking GPS ni tiempos de detención continuos entre visitas parciales.

Ejemplo:
  python scripts/analizar_rendimiento_calle.py \\
    --clientes downloads/2026-4-29--Clientes.xlsx \\
    --dispositivos downloads/gvVendedores.xlsx \\
    --rutas downloads/gvdRuta.xlsx \\
    --fuera downloads/gvxVentasFueraRuta.xlsx \\
    --tenant-id tabaco --fecha-operativa 2026-04-29 \\
    --json-out salida.json
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
import unicodedata
from dataclasses import dataclass
from datetime import datetime, time
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TENANT_TO_DIST_DEFAULT = {"tabaco": 3, "aloma": 4, "liver": 5, "real": 2, "extra": 6, "gyg": 6}

MATUTINO_13 = time(13, 0)


def _norm_col_raw(s: Any) -> str:
    x = unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().lower().strip()
    return x.replace("_", " ").replace("-", " ")


def _col_map(df: pd.DataFrame) -> dict[str, str]:
    return {_norm_col_raw(c): c for c in df.columns}


def _pick_col(cmap: dict[str, str], *candidates: str) -> str | None:
    for c in candidates:
        nc = _norm_col_raw(c)
        if nc in cmap:
            return cmap[nc]
    return None


def _read_sheet(path: Path) -> pd.DataFrame:
    """
    Primera hoja del archivo; tolera `.xls` con xlrd si está instalado.
    """
    suf = path.suffix.lower()
    if suf == ".xls":
        try:
            return pd.read_excel(path, sheet_name=0, header=0, engine="xlrd")
        except ImportError as e:
            raise RuntimeError(
                "Archivo .xls requiere `pip install xlrd` para este script."
            ) from e
    try:
        return pd.read_excel(path, sheet_name=0, header=0, engine="openpyxl")
    except Exception:
        return pd.read_excel(path, sheet_name=0, header=0)


def _visitado_truthy(val: Any) -> bool:
    if pd.isna(val):
        return False
    t = _norm_txt(val)
    if not t:
        return False
    if t in {"SI", "SÍ", "S", "1", "TRUE", "YES", "VISITADO"}:
        return True
    return False


def _norm_txt(v: Any) -> str:
    if pd.isna(v):
        return ""
    x = unicodedata.normalize("NFD", str(v)).encode("ascii", "ignore").decode().upper().strip()
    return " ".join(x.split())


def _to_time(v: Any) -> time | None:
    if pd.isna(v):
        return None
    if isinstance(v, time) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.time()
    ts = pd.to_datetime(v, errors="coerce")
    if pd.isna(ts):
        s = str(v).strip()
        try:
            if len(s) <= 12 and ":" in s:
                parts = s.replace(".", ":").replace(";", ":").split(":")
                h = int(float(parts[0]))
                mi = int(float(parts[1])) if len(parts) > 1 else 0
                se = int(float(parts[2])) if len(parts) > 2 else 0
                return time(h % 24, mi % 60, se % 60)
        except (IndexError, ValueError):
            return None
        return None
    return ts.to_pydatetime().time()


def _minutes_between(t_ini: time, t_fin: time) -> float | None:
    base = datetime(2000, 1, 1, t_ini.hour, t_ini.minute, t_ini.second)
    end = datetime(2000, 1, 1, t_fin.hour, t_fin.minute, t_fin.second)
    d = (end - base).total_seconds() / 60.0
    if d < -60:
        d += 24 * 60
    if -120 <= d < 0:
        d = 0.0
    if d < -0.001:
        return None
    return float(d)


def _dist_basic(vals: list[float]) -> dict[str, Any]:
    if not vals:
        return {}
    vals = sorted(vals)
    xs = vals

    def _p(q: float) -> float | None:
        if not xs:
            return None
        if len(xs) == 1:
            return float(xs[0])
        idx = (len(xs) - 1) * q
        lo = math.floor(idx)
        hi = min(lo + 1, len(xs) - 1)
        return float(xs[lo] + (idx - lo) * (xs[hi] - xs[lo]))

    return {
        "n": len(vals),
        "min": xs[0],
        "promedio": float(statistics.mean(xs)),
        "mediana": float(statistics.median(xs)),
        "p75": _p(0.75),
        "p90": _p(0.90),
        "max": xs[-1],
    }


@dataclass
class PathsIn:
    clientes: Path
    dispositivos: Path | None
    rutas: Path | None
    fuera_ruta: Path | None


def construir_payload(
    paths: PathsIn,
    *,
    tenant_id: str,
    fecha_operativa: str,
    id_distribuidor: int | None = None,
    sucursal_nombre: str | None = None,
) -> dict[str, Any]:
    did = id_distribuidor if id_distribuidor is not None else TENANT_TO_DIST_DEFAULT.get(tenant_id.lower())
    if did is None:
        raise ValueError("Defina id_distribuidor o tenant_id conocido.")

    cli = _read_sheet(paths.clientes)
    cmap = _col_map(cli)
    cv = _pick_col(cmap, "Visitado")
    hv = _pick_col(cmap, "Hora visita")
    hvta = _pick_col(cmap, "Hora venta")
    hm = _pick_col(cmap, "Hora motivo")
    mot = _pick_col(cmap, "Motivo")
    ruta = _pick_col(cmap, "Ruta")
    fecha_c = _pick_col(cmap, "Fecha")

    n = len(cli)
    cli["_visit"] = cli[cv].map(_visitado_truthy) if cv else pd.Series(True, index=cli.index)
    cli["_hv"] = cli[hv].map(_to_time) if hv else pd.Series([None] * n, dtype=object, index=cli.index)
    if hvta:
        cli["_hventa"] = cli[hvta].map(_to_time)
    else:
        cli["_hventa"] = pd.Series([None] * n, dtype=object, index=cli.index)

    visitados_si = int(cli["_visit"].sum())
    n_grilla = n
    if hvta:
        con_venta = int((cli["_visit"] & cli["_hventa"].notna()).sum())
    else:
        con_venta = 0

    sin_venta_motivo = 0
    if mot:
        nm = cli[cli["_visit"]]
        if hvta:
            nm = nm[nm["_hventa"].isna()]
        nm = nm[nm[mot].astype(str).str.strip().astype(bool)]
        sin_venta_motivo = int(len(nm))

    time_to_sell: list[float] = []
    tiempo_desenlace: list[float] = []

    for idx in cli.index:
        r = cli.loc[idx]
        if not bool(r["_visit"]):
            continue
        ti = r["_hv"] if hv else None
        if hv and ti is None:
            ti = _to_time(r.get(hv))
        tt_venta = None
        if hvta:
            tt_venta = r["_hventa"]
            if tt_venta is None:
                tt_venta = _to_time(r.get(hvta))
        tt_mot = _to_time(r.get(hm)) if hm else None
        if ti and tt_venta:
            mins = _minutes_between(ti, tt_venta)
            if mins is not None and mins <= 12 * 60:
                time_to_sell.append(mins)
                tiempo_desenlace.append(mins)
        elif ti and tt_mot and tt_venta is None:
            mins = _minutes_between(ti, tt_mot)
            if mins is not None and mins <= 12 * 60:
                tiempo_desenlace.append(mins)

    antes_13 = 0
    if hv:
        vsub = cli[cli["_visit"]]
        for idx in vsub.index:
            t = vsub.loc[idx, "_hv"] if "_hv" in vsub.columns else _to_time(vsub.loc[idx, hv])
            tm = _to_time(t) if not isinstance(t, time) else t
            if tm and tm <= MATUTINO_13:
                antes_13 += 1

    share_mat = (antes_13 / visitados_si) if visitados_si else None

    ts_stats = _dist_basic(time_to_sell)
    de_stats = _dist_basic(tiempo_desenlace)

    primera_visita = None
    if hv:
        cand: list[time] = []
        vs = cli[cli["_visit"]]
        for i in vs.index:
            t = vs.loc[i, "_hv"]
            if isinstance(t, time):
                cand.append(t)
            else:
                xt = _to_time(vs.loc[i, hv])
                if xt:
                    cand.append(xt)
        if cand:
            primera_visita = min(cand).strftime("%H:%M")

    primera_venta = None
    if hvta:
        vs = cli[cli["_visit"] & cli["_hventa"].notna()]
        if len(vs):
            cand = []
            for i in vs.index:
                xt = vs.loc[i, "_hventa"]
                if isinstance(xt, time):
                    cand.append(xt)
                elif pd.notna(xt):
                    t2 = _to_time(vs.loc[i, hvta])
                    if t2:
                        cand.append(t2)
            if cand:
                primera_venta = min(cand).strftime("%H:%M")

    tg: dict[str, Any] = {
        "time_to_sell_min": ts_stats if ts_stats else {"n": 0},
        "tiempo_en_pdv_hasta_desenlace_min": de_stats if de_stats else {"n": 0},
        "primera_visita_global_hh_mm": primera_visita,
        "primera_venta_global_hh_mm": primera_venta,
        "time_to_sell_min_mediana": ts_stats.get("mediana") if ts_stats else None,
        "tiempo_en_pdv_hasta_desenlace_mediana_min": de_stats.get("mediana") if de_stats else None,
        "interpretacion_detencion": (
            '"Detención" o tiempo en PDV sólo donde SIGO registra visita más desenlace (venta o motivo '
            'sin venta): diferencia entre horarios exportados; no es permanencia física GPS ni segunda visitas.'
        ),
    }

    def _pct(a: float, b: float) -> float | None:
        return (100.0 * a / b) if b else None

    fin = {
        "visitados_si": visitados_si,
        "pct_visitados_sobre_pdvs_grilla": _pct(float(visitados_si), float(n_grilla)),
    }
    rc13 = {
        "visitados_con_contacto_hasta_13": antes_13,
        "share_visita_contacto_hasta_13_sobre_visitados": share_mat,
        "hora_corte_reference": str(MATUTINO_13),
    }

    motive_counts: dict[str, int] = {}
    if mot:
        mv = cli[cli["_visit"]]
        if hvta:
            mv = mv[mv["_hventa"].isna()]
        mv = mv[mv[mot].astype(str).str.strip().astype(bool)]
        for txt in mv[mot].astype(str).str.strip():
            if txt and txt.upper() != "NAN":
                motive_counts[txt] = motive_counts.get(txt, 0) + 1

    routes_out: list[dict[str, Any]] = []

    def _agg_route(route_name: str, sub: pd.DataFrame) -> dict[str, Any]:
        nt = len(sub)
        vv = 0
        cvent = 0
        for i in sub.index:
            r = sub.loc[i]
            if cv:
                visited = _visitado_truthy(r[cv])
            else:
                visited = True
            if visited:
                vv += 1
                if hvta and pd.notna(r.get(hvta)) and _to_time(r.get(hvta)):
                    cvent += 1
        tts: list[float] = []
        td: list[float] = []
        for i in sub.index:
            r = sub.loc[i]
            if cv and not _visitado_truthy(r[cv]):
                continue
            ti = _to_time(r.get(hv)) if hv else None
            tv = _to_time(r.get(hvta)) if hvta else None
            tm = _to_time(r.get(hm)) if hm else None
            if ti and tv:
                m = _minutes_between(ti, tv)
                if m is not None and m <= 12 * 60:
                    tts.append(m)
                    td.append(m)
            elif ti and tm and not tv:
                m = _minutes_between(ti, tm)
                if m is not None and m <= 12 * 60:
                    td.append(m)
        return {
            "ruta": route_name,
            "pdvs_en_grilla": nt,
            "visitados_si": vv,
            "pct_visitados_sobre_grilla": _pct(float(vv), float(nt)),
            "con_venta": cvent,
            "time_to_sell_min": _dist_basic(tts),
            "tiempo_desenlace_min": _dist_basic(td),
        }

    if ruta:
        rcol = cli[ruta].fillna("(Sin ruta)").astype(str).str.strip()
        rcol = rcol.replace({"": "(Sin ruta)", "(Sin nombre)": "(Sin ruta)"})
        for rn, grp in cli.groupby(rcol):
            routes_out.append(_agg_route(str(rn), grp))
    else:
        routes_out.append(_agg_route("(Todas)", cli))

    routes_out.sort(key=lambda x: str(x["ruta"]).lower())

    fuera_paths = paths.fuera_ruta
    if fuera_paths and fuera_paths.exists():
        fdf = _read_sheet(fuera_paths)
        cc = _col_map(fdf)
        col_cli = _pick_col(cc, "Cliente")
        n_distinct = (
            int(fdf[col_cli].astype(str).str.strip().dropna().nunique()) if col_cli else int(len(fdf))
        )
        fuera_block: dict[str, Any] = {
            "archivo": fuera_paths.name,
            "clientes_distintos": {"con_registro_fuera": n_distinct},
            "nota": (
                "Cada fila del export agrupa cliente con comportamiento fuera de ruta; "
                '"con_registro_fuera" es conteo único por columna Cliente.'
            ),
        }
    else:
        fuera_block = {"clientes_distintos": {"con_registro_fuera": None}, "archivo": None}

    meta_arch: dict[str, Any] = {"clientes": paths.clientes.name}

    rutas_filas = None
    dispositivos_resumen: dict[str, Any]
    rutas_extra_err: str | None = None
    if paths.dispositivos and paths.dispositivos.exists():
        meta_arch["dispositivos"] = paths.dispositivos.name
        try:
            ddf = _read_sheet(paths.dispositivos)
            dispositivos_resumen = {
                "filas": int(len(ddf)),
                "columnas": [_norm_col_raw(x) for x in list(ddf.columns)[:14]],
            }
        except Exception as e:
            dispositivos_resumen = {"error": str(e)[:160]}
    else:
        meta_arch["dispositivos"] = None
        dispositivos_resumen = {"filas": 0, "mensaje": "sin archivo"}

    if paths.rutas and paths.rutas.exists():
        meta_arch["rutas"] = paths.rutas.name
        try:
            rr = _read_sheet(paths.rutas)
            rutas_filas = int(len(rr))
        except Exception as e:
            rutas_filas = None
            rutas_extra_err = str(e)[:160]
    else:
        meta_arch["rutas"] = None

    meta_arch["ventas_fuera_ruta"] = fuera_paths.name if fuera_paths else None
    if rutas_extra_err:
        dispositivos_resumen["ruta_archivo_err"] = rutas_extra_err

    fecha_src = ""
    if fecha_c:
        uniq = cli[fecha_c].dropna().astype(str).unique().tolist()
        fecha_src = uniq[0][:32] if uniq else ""

    return {
        "schema_version": 1,
        "metodologia": {
            "timezone_referencia": "America/Argentina/Buenos_Aires",
            "time_to_sell": (
                "Minutos entre Hora visita y Hora venta cuando la visita figura realizada y ambas horas existen."
            ),
            "tiempo_hasta_desenlace": (
                "Con venta: igual a time_to_sell; sin venta con motivo: Hora motivo menos Hora visita. "
                "Se ignoran deltas >12h dentro del mismo registro como datos probablemente inconsistentes."
            ),
            "cumplimiento_ruta": (
                "% visitados sobre filas de la grilla exportada del día por sucursal; "
                "no garantiza igualdad con planificado ERP."
            ),
            "corte_matutino_reference": str(MATUTINO_13),
            "fecha_operativa_inferida_fuente": fecha_src if fecha_src else fecha_operativa,
        },
        "meta": {
            "tenant_id": tenant_id.lower(),
            "id_distribuidor": did,
            "fecha_operativa": fecha_operativa,
            "sucursal_nombre": sucursal_nombre,
            "archivos": meta_arch,
            "fecha_columna_pdvs_primera_observacion": fecha_src or None,
        },
        "global": {
            "pdvs_en_grilla": n_grilla,
            "visitados_si": visitados_si,
            "con_venta": con_venta,
            "sin_venta_con_motivo_registrado": sin_venta_motivo,
            "pct_visitados_sobre_pdvs_grilla": _pct(float(visitados_si), float(n_grilla)),
            "fin_jornada_2359": fin,
            "recorte_matutino_hasta_13": rc13,
            "timing_metricas_aprox": tg,
            "fuera_sync": {"clientes_fuera_export": fuera_block["clientes_distintos"].get("con_registro_fuera")},
        },
        "motivos_sin_venta_agrupados": dict(
            sorted(motive_counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))
        ),
        "por_ruta": routes_out,
        "fuera_de_ruta": fuera_block,
        "dispositivos": dispositivos_resumen,
        "ruta_progreso_export": {"filas": rutas_filas},
    }


def construir_payload_from_args(ns: argparse.Namespace) -> dict[str, Any]:
    pth = PathsIn(
        clientes=Path(ns.clientes),
        dispositivos=Path(ns.dispositivos) if getattr(ns, "dispositivos", None) else None,
        rutas=Path(ns.rutas) if getattr(ns, "rutas", None) else None,
        fuera_ruta=Path(ns.fuera) if getattr(ns, "fuera", None) else None,
    )
    did = getattr(ns, "id_distribuidor", None)
    if did is None and ns.tenant_id:
        did = TENANT_TO_DIST_DEFAULT.get(ns.tenant_id.strip().lower())
    return construir_payload(
        pth,
        tenant_id=ns.tenant_id.strip().lower(),
        fecha_operativa=ns.fecha_operativa.strip(),
        id_distribuidor=did if did is not None else None,
        sucursal_nombre=ns.sucursal,
    )


def _main() -> int:
    ap = argparse.ArgumentParser(description="Analytics rendimiento calle → JSON")
    ap.add_argument("--clientes", required=True, help="Excel PDV día (*--Clientes*)")
    ap.add_argument("--dispositivos")
    ap.add_argument("--rutas")
    ap.add_argument("--fuera", help="gvxVentasFueraRuta")
    ap.add_argument("--tenant-id", required=True)
    ap.add_argument("--fecha-operativa", required=True, help="YYYY-MM-DD")
    ap.add_argument("--id-distribuidor", dest="id_distribuidor", type=int, default=None)
    ap.add_argument("--sucursal", default=None)
    ap.add_argument("--json-out", default="-")
    ns = ap.parse_args()
    out = construir_payload_from_args(ns)

    fh = sys.stdout if ns.json_out.strip() == "-" else open(Path(ns.json_out), "w", encoding="utf-8")
    try:
        json.dump(out, fh, indent=2, ensure_ascii=False, default=str)
    finally:
        if fh is not sys.stdout:
            fh.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
