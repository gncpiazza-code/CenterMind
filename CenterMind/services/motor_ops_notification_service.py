# -*- coding: utf-8 -*-
"""
Resúmenes operativos de motores (padrón, cuentas corrientes, informe ventas) al admin vía Telegram.

- Digest consolidado tras corridas RPA (scheduler → POST /api/v1/ops/motor-digest)
- Alerta inmediata solo en errores de ingesta
- Delta numérico vs la última corrida OK del mismo motor/dist
"""
from __future__ import annotations

import html
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import requests

from db import sb

logger = logging.getLogger("MotorOpsNotification")

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")
TELEGRAM_SEND = "https://api.telegram.org/bot{token}/sendMessage"

# Claves de registros padron con delta útil
_PADRON_DELTA_KEYS = (
    "sucursales",
    "vendedores",
    "rutas",
    "clientes",
    "clientes_inactivos_padron",
    "rutas_obsoletas_borradas",
    "exhib_vinculadas",
)

_CC_DELTA_KEYS = (
    ("registros_cc", "filas"),
    ("vendedores", "vendedores"),
    ("clientes", "clientes"),
    ("alertas_credito", "alertas"),
    ("deuda_total", "deuda"),
)

_VENTAS_DELTA_KEYS = (
    ("upserted", "filas"),
    ("rows", "líneas"),
    ("actualizados", "FUC"),
)


def _fmt_deuda(value: Any) -> str:
    try:
        n = float(value or 0)
    except (TypeError, ValueError):
        return "?"
    if n >= 1_000_000:
        return f"${n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"${n / 1_000:.0f}k"
    return f"${n:,.0f}".replace(",", ".")


def motor_ops_telegram_enabled() -> bool:
    raw = (os.getenv("MOTOR_OPS_TELEGRAM_ENABLED") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _admin_chat_id() -> int | None:
    raw = (
        os.getenv("OPS_ADMIN_TELEGRAM_CHAT_ID")
        or os.getenv("SUPERADMIN_TELEGRAM_CHAT_ID")
        or "2037005531"
    ).strip()
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _ops_bot_token() -> str | None:
    explicit = (os.getenv("OPS_TELEGRAM_BOT_TOKEN") or "").strip()
    if explicit:
        return explicit
    dist_raw = (os.getenv("OPS_TELEGRAM_DIST_ID") or "3").strip()
    try:
        dist_id = int(dist_raw)
    except ValueError:
        dist_id = 3
    try:
        res = (
            sb.table("distribuidores")
            .select("token_bot, admin_telegram_id")
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        row = (res.data or [{}])[0]
        return (row.get("token_bot") or "").strip() or None
    except Exception as e:
        logger.warning("[MotorOps] token_bot dist=%s: %s", dist_id, e)
        return None


def _parse_registros(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (int, float)):
        return {"registros_cc": int(raw)}
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
            if isinstance(parsed, (int, float)):
                return {"registros_cc": int(parsed)}
        except Exception:
            pass
    return {}


def _num(v: Any) -> int | None:
    try:
        if v is None or v == "":
            return None
        return int(v)
    except (TypeError, ValueError):
        return None


def _dist_name(dist_id: int) -> str:
    if dist_id == 0:
        return "Global"
    try:
        res = (
            sb.table("distribuidores")
            .select("nombre_empresa")
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        return (res.data or [{}])[0].get("nombre_empresa") or f"dist {dist_id}"
    except Exception:
        return f"dist {dist_id}"


def _fmt_ts_ar(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        s = str(iso).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(AR_TZ).strftime("%d/%m %H:%M")
    except Exception:
        return str(iso)[:16]


def _send_telegram_html(text: str) -> bool:
    if not motor_ops_telegram_enabled():
        return False
    token = _ops_bot_token()
    chat_id = _admin_chat_id()
    if not token or not chat_id:
        logger.warning("[MotorOps] Sin token o chat_id — no se envía digest")
        return False
    chunks: list[str] = []
    body = text
    while len(body) > 3900:
        cut = body.rfind("\n", 0, 3900)
        if cut < 200:
            cut = 3900
        chunks.append(body[:cut])
        body = body[cut:].lstrip("\n")
    chunks.append(body)
    ok_all = True
    for i, chunk in enumerate(chunks):
        prefix = f"<i>({i + 1}/{len(chunks)})</i>\n" if len(chunks) > 1 else ""
        try:
            resp = requests.post(
                TELEGRAM_SEND.format(token=token),
                json={
                    "chat_id": chat_id,
                    "text": prefix + chunk,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                },
                timeout=12,
            )
            if not resp.ok:
                ok_all = False
                logger.warning(
                    "[MotorOps] sendMessage HTTP %s: %s",
                    resp.status_code,
                    (resp.text or "")[:200],
                )
        except Exception as e:
            ok_all = False
            logger.warning("[MotorOps] sendMessage exc: %s", e)
    return ok_all


def _fetch_previous_ok_run(motor: str, dist_id: int, before_iso: str | None) -> dict | None:
    try:
        q = (
            sb.table("motor_runs")
            .select("id, estado, iniciado_en, finalizado_en, registros, error_msg")
            .eq("motor", motor)
            .eq("dist_id", dist_id)
            .eq("estado", "ok")
            .order("finalizado_en", desc=True)
            .limit(5)
        )
        rows = q.execute().data or []
        for row in rows:
            fin = row.get("finalizado_en") or row.get("iniciado_en")
            if before_iso and fin and str(fin) >= str(before_iso):
                continue
            regs = _parse_registros(row.get("registros"))
            if regs.get("sin_cambios"):
                continue
            return row
        return None
    except Exception as e:
        logger.debug("[MotorOps] previous run %s dist=%s: %s", motor, dist_id, e)
        return None


def _delta_line(prev: dict[str, Any], curr: dict[str, Any], *, motor: str = "") -> str:
    if curr.get("sin_cambios"):
        reason = curr.get("reason") or "hash_guard"
        return f"sin cambios ({html.escape(str(reason))})"

    parts: list[str] = []
    is_cc = motor == "cuentas_corrientes" or "registros_cc" in curr or "registros_cc" in prev
    is_ventas = motor == "ventas_enriched" or "upserted" in curr or "rows" in curr

    if is_ventas:
        for key, label in _VENTAS_DELTA_KEYS:
            p = _num(prev.get(key))
            c = _num(curr.get(key))
            if c is None:
                continue
            if p is None:
                if c:
                    parts.append(f"{label} {c}")
            elif c != p:
                sign = "+" if c > p else ""
                parts.append(f"{label} {sign}{c - p}")
    elif is_cc:
        for key, label in _CC_DELTA_KEYS:
            if key == "deuda_total":
                p_raw = prev.get(key)
                c_raw = curr.get(key)
                if c_raw is None and p_raw is None:
                    continue
                if p_raw is None:
                    parts.append(f"{label} {_fmt_deuda(c_raw)}")
                else:
                    try:
                        p, c = float(p_raw or 0), float(c_raw or 0)
                        if abs(c - p) > 1:
                            sign = "+" if c > p else ""
                            parts.append(f"{label} {sign}{_fmt_deuda(c - p)}")
                        else:
                            parts.append(f"{label} {_fmt_deuda(c)}")
                    except (TypeError, ValueError):
                        parts.append(f"{label} {_fmt_deuda(c_raw)}")
                continue
            p = _num(prev.get(key))
            c = _num(curr.get(key))
            if c is None:
                continue
            if p is None:
                if c:
                    parts.append(f"{label} {c}")
            elif c != p:
                sign = "+" if c > p else ""
                parts.append(f"{label} {sign}{c - p}")
        fs = curr.get("fecha_snapshot")
        if fs and not parts:
            parts.append(f"snap {fs}")
    else:
        for key in _PADRON_DELTA_KEYS:
            p = _num(prev.get(key))
            c = _num(curr.get(key))
            if c is None:
                continue
            if p is None:
                if c:
                    parts.append(f"{key} {c}")
            elif c != p:
                sign = "+" if c > p else ""
                parts.append(f"{key} {sign}{c - p}")

    return " · ".join(parts[:7]) if parts else "sin métricas delta"


def _estado_icon(estado: str | None, registros: dict[str, Any]) -> str:
    est = (estado or "").lower()
    if est == "error":
        return "❌"
    if registros.get("sin_cambios"):
        return "ℹ️"
    if est in ("ok", "completado", "parcial"):
        return "✅"
    if est == "en_curso":
        return "⏳"
    return "❓"


def notify_run_error(motor: str, dist_id: int, error_msg: str, run_id: int | None = None) -> None:
    """Alerta inmediata al admin solo cuando falla una corrida."""
    if not motor_ops_telegram_enabled():
        return
    name = html.escape(_dist_name(dist_id))
    motor_l = html.escape(motor)
    err = html.escape((error_msg or "error desconocido")[:500])
    rid = f" #{run_id}" if run_id else ""
    text = (
        f"🚨 <b>Motor {motor_l} — ERROR</b>\n"
        f"🏢 {name} (dist {dist_id}){rid}\n"
        f"🕐 {datetime.now(AR_TZ).strftime('%d/%m/%Y %H:%M')} AR\n\n"
        f"<code>{err}</code>"
    )
    _send_telegram_html(text)


def _load_runs_since(motors: list[str], since_utc: datetime, limit: int = 80) -> list[dict]:
    try:
        iso = since_utc.isoformat()
        rows: list[dict] = []
        for motor in motors:
            res = (
                sb.table("motor_runs")
                .select("id, motor, dist_id, estado, iniciado_en, finalizado_en, registros, error_msg")
                .eq("motor", motor)
                .gte("iniciado_en", iso)
                .order("iniciado_en", desc=True)
                .limit(limit)
                .execute()
            )
            rows.extend(res.data or [])
        rows.sort(key=lambda r: r.get("iniciado_en") or "", reverse=True)
        return rows
    except Exception as e:
        logger.warning("[MotorOps] load runs: %s", e)
        return []


def _zombie_padron_runs() -> list[dict]:
    try:
        two_h = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        res = (
            sb.table("motor_runs")
            .select("id, dist_id, iniciado_en")
            .eq("motor", "padron")
            .eq("estado", "en_curso")
            .lt("iniciado_en", two_h)
            .order("iniciado_en", desc=True)
            .limit(5)
            .execute()
        )
        return res.data or []
    except Exception:
        return []


def _load_latest_cc_run_per_dist() -> list[dict]:
    """Última corrida CC por distribuidor activo (sin límite de ventana temporal)."""
    try:
        dists = (
            sb.table("distribuidores")
            .select("id_distribuidor")
            .eq("estado", "activo")
            .execute()
        ).data or []
    except Exception:
        return []
    out: list[dict] = []
    for d in dists:
        did = int(d["id_distribuidor"])
        try:
            res = (
                sb.table("motor_runs")
                .select("id, motor, dist_id, estado, iniciado_en, finalizado_en, registros, error_msg")
                .eq("motor", "cuentas_corrientes")
                .eq("dist_id", did)
                .order("finalizado_en", desc=True)
                .limit(1)
                .execute()
            )
            if res.data:
                out.append(res.data[0])
        except Exception:
            pass
    out.sort(key=lambda r: r.get("finalizado_en") or r.get("iniciado_en") or "", reverse=True)
    return out


def _load_latest_motor_runs(motor: str, limit: int = 30) -> list[dict]:
    """Últimas corridas sin filtro de ventana (fallback CC sin motor_runs recientes)."""
    try:
        res = (
            sb.table("motor_runs")
            .select("id, motor, dist_id, estado, iniciado_en, finalizado_en, registros, error_msg")
            .eq("motor", motor)
            .order("iniciado_en", desc=True)
            .limit(limit)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.warning("[MotorOps] latest runs %s: %s", motor, e)
        return []


def _load_cc_detalle_snapshots(since_hours: float) -> list[dict]:
    """
    Estado actual en cc_detalle por distribuidor activo.
    cc_detalle es snapshot único (no historial); sirve cuando motor_runs CC no se registró.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    out: list[dict] = []
    try:
        dists = (
            sb.table("distribuidores")
            .select("id_distribuidor, nombre_empresa")
            .eq("estado", "activo")
            .execute()
        ).data or []
    except Exception as e:
        logger.warning("[MotorOps] distribuidores CC: %s", e)
        return out

    for d in dists:
        dist_id = int(d["id_distribuidor"])
        try:
            last = (
                sb.table("cc_detalle")
                .select("created_at, fecha_snapshot")
                .eq("id_distribuidor", dist_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if not last.data:
                continue
            row = last.data[0]
            created = row.get("created_at")
            cnt = (
                sb.table("cc_detalle")
                .select("id", count="exact")
                .eq("id_distribuidor", dist_id)
                .execute()
            ).count or 0
            stale = False
            if created:
                try:
                    s = str(created).replace("Z", "+00:00")
                    dt = datetime.fromisoformat(s)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    stale = dt < since
                except Exception:
                    pass
            from services.cc_motor_tracking import build_cc_registros_from_detalle
            regs = build_cc_registros_from_detalle(dist_id) or {
                "registros_cc": cnt,
                "fecha_snapshot": row.get("fecha_snapshot"),
            }
            out.append({
                "dist_id": dist_id,
                "nombre": d.get("nombre_empresa") or f"dist {dist_id}",
                "created_at": created,
                "fecha_snapshot": row.get("fecha_snapshot"),
                "count": cnt,
                "stale": stale,
                "registros": regs,
            })
        except Exception as e:
            logger.debug("[MotorOps] cc_detalle dist=%s: %s", dist_id, e)
    out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return out


def _append_run_lines(
    runs: list[dict],
    lines: list[str],
    seen_dist: set[tuple[str, int]],
    *,
    counters: list[int],
) -> None:
    """Agrega líneas desde motor_runs; counters = [ok, sc, err] mutables."""
    ok, sc, err = counters[0], counters[1], counters[2]
    for run in runs:
        dist_id = int(run.get("dist_id") or 0)
        motor = str(run.get("motor") or "")
        key = (motor, dist_id)
        if key in seen_dist:
            continue
        seen_dist.add(key)

        regs = _parse_registros(run.get("registros"))
        est = (run.get("estado") or "").lower()
        if est == "error":
            err += 1
        elif regs.get("sin_cambios"):
            sc += 1
        elif est in ("ok", "completado", "parcial"):
            ok += 1

        prev = _fetch_previous_ok_run(motor, dist_id, run.get("iniciado_en"))
        prev_regs = _parse_registros((prev or {}).get("registros"))
        delta = _delta_line(prev_regs, regs, motor=motor)
        icon = _estado_icon(est, regs)
        ts = _fmt_ts_ar(run.get("finalizado_en") or run.get("iniciado_en"))
        name = html.escape(_dist_name(dist_id))
        err_snip = ""
        if est == "error" and run.get("error_msg"):
            err_snip = f"\n   ⚠️ <code>{html.escape(str(run['error_msg'])[:120])}</code>"
        source = ""
        if (run.get("iniciado_en") or "") < (
            datetime.now(timezone.utc) - timedelta(hours=72)
        ).isoformat():
            source = " · <i>último run registrado</i>"
        stale_cc = ""
        if motor == "cuentas_corrientes" and est == "ok":
            try:
                fin = run.get("finalizado_en") or run.get("iniciado_en")
                if fin:
                    s = str(fin).replace("Z", "+00:00")
                    dt = datetime.fromisoformat(s)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    age_h = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
                    if age_h > 48:
                        stale_cc = f" · <b>⚠️ desactualizado {int(age_h // 24)}d</b>"
            except Exception:
                pass
        lines.append(f"{icon} <b>{name}</b> · {ts}\n   {delta}{err_snip}{stale_cc}{source}")
    counters[0], counters[1], counters[2] = ok, sc, err


def build_motor_digest_text(
    motor_label: str,
    *,
    since_hours: float = 6,
    rpa_resumen: dict[str, Any] | None = None,
    rpa_detalle: list[dict[str, Any]] | None = None,
) -> str:
    """Arma mensaje HTML con corridas recientes en DB + resumen RPA opcional."""
    now_ar = datetime.now(AR_TZ)
    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    motor_lower = motor_label.lower()
    is_padron = motor_lower.startswith("pad")
    is_ventas = "venta" in motor_lower
    if is_padron:
        motors_db = ["padron", "padron_global"]
    elif is_ventas:
        motors_db = ["ventas_enriched"]
    else:
        motors_db = ["cuentas_corrientes"]
    runs = _load_runs_since(motors_db, since)

    ok = err = sc = 0
    lines: list[str] = []
    seen_dist: set[tuple[str, int]] = set()
    cc_fallback_note = ""

    counters = [ok, sc, err]
    if is_padron or is_ventas:
        _append_run_lines(runs, lines, seen_dist, counters=counters)
    else:
        # CC: una línea por dist = última corrida (sin depender solo de la ventana)
        latest_cc = _load_latest_cc_run_per_dist()
        _append_run_lines(latest_cc, lines, seen_dist, counters=counters)
    ok, sc, err = counters

    # CC: fallback cc_detalle solo para dist sin motor_run
    if not is_padron and not is_ventas:
        snapshots = _load_cc_detalle_snapshots(since_hours)
        fresh = [s for s in snapshots if not s.get("stale")]
        stale_n = len(snapshots) - len(fresh)
        for snap in snapshots[:12]:
            dist_id = snap["dist_id"]
            if ("cuentas_corrientes", dist_id) in seen_dist:
                continue
            seen_dist.add(("cc_detalle", dist_id))
            regs = snap.get("registros") or {}
            prev = _fetch_previous_ok_run("cuentas_corrientes", dist_id, snap.get("created_at"))
            prev_regs = _parse_registros((prev or {}).get("registros"))
            delta = _delta_line(prev_regs, regs, motor="cuentas_corrientes")
            icon = "⏳" if snap.get("stale") else "✅"
            ts = _fmt_ts_ar(snap.get("created_at"))
            name = html.escape(str(snap.get("nombre") or _dist_name(dist_id)))
            warn = " · <b>⚠️ revisar RPA</b>" if snap.get("stale") else ""
            lines.append(f"{icon} <b>{name}</b> · {ts}\n   {delta}{warn}")
            if not snap.get("stale"):
                ok += 1
            else:
                sc += 1
        if stale_n:
            cc_fallback_note = (
                f"\n⚠️ <b>{stale_n} dist(s) CC sin refresh reciente</b> — revisar RPA/credenciales\n"
            )

    header_motor = html.escape(motor_label.upper())
    rpa_block = ""
    if rpa_resumen:
        ro = _num(rpa_resumen.get("ok")) or 0
        re = _num(rpa_resumen.get("errores")) or 0
        rsc = _num(rpa_resumen.get("sin_cambios")) or 0
        dur = rpa_resumen.get("duracion_min")
        dur_s = f" · {dur} min" if dur is not None else ""
        rpa_block = (
            f"\n🤖 <b>RPA Railway</b>: ✅ {ro} · ℹ️ {rsc} · ❌ {re}{dur_s}\n"
        )
        if rpa_detalle:
            for item in rpa_detalle[:12]:
                tid = html.escape(str(item.get("tenant") or item.get("id") or "?"))
                est = html.escape(str(item.get("estado") or item.get("status") or "?"))
                extra = ""
                if item.get("error"):
                    extra = f" — <code>{html.escape(str(item['error'])[:80])}</code>"
                elif item.get("registros") is not None:
                    extra = f" — {item.get('registros')} reg"
                rpa_block += f"   · {tid}: {est}{extra}\n"

    zombie_line = ""
    if is_padron:
        zombies = _zombie_padron_runs()
        if zombies:
            parts = []
            for z in zombies[:3]:
                did = z.get("dist_id")
                parts.append(
                    f"run #{z.get('id')} dist {did} ({_dist_name(int(did) if did else 0)}) "
                    f"desde {_fmt_ts_ar(z.get('iniciado_en'))}"
                )
            zombie_line = (
                f"\n⚠️ <b>{len(zombies)} padrón zombie</b> (&gt;2h en_curso): "
                f"{html.escape('; '.join(parts))}\n"
            )

    if not lines and not rpa_block:
        return (
            f"📭 <b>{header_motor}</b> — sin corridas en últimas {since_hours:g}h\n"
            f"🕐 {now_ar.strftime('%d/%m/%Y %H:%M')} AR"
        )

    summary = f"✅ {ok} · ℹ️ {sc} · ❌ {err}"
    body = "\n".join(lines[:15])
    if len(lines) > 15:
        body += f"\n<i>… y {len(lines) - 15} más</i>"

    return (
        f"📊 <b>{header_motor}</b> — resumen operativo\n"
        f"🕐 {now_ar.strftime('%d/%m/%Y %H:%M')} AR · ventana {since_hours:g}h\n"
        f"{summary}{rpa_block}{zombie_line}{cc_fallback_note}\n"
        f"{body}"
    )


def send_motor_digest(
    motor_label: str,
    *,
    since_hours: float = 6,
    rpa_resumen: dict[str, Any] | None = None,
    rpa_detalle: list[dict[str, Any]] | None = None,
) -> bool:
    text = build_motor_digest_text(
        motor_label,
        since_hours=since_hours,
        rpa_resumen=rpa_resumen,
        rpa_detalle=rpa_detalle,
    )
    return _send_telegram_html(text)


def notify_padron_global_finished(resultados: list[dict], estado: str, error_msg: str | None = None) -> None:
    """Un solo mensaje tras padron_global multi-tenant."""
    if not motor_ops_telegram_enabled():
        return
    if estado == "error" and error_msg:
        notify_run_error("padron_global", 0, error_msg)
        return
    ok = sum(1 for r in resultados if r.get("clientes") is not None)
    lines = []
    for r in resultados[:12]:
        did = r.get("dist_id")
        name = html.escape(_dist_name(int(did) if did is not None else 0))
        cli = _num(r.get("clientes")) or 0
        inact = _num(r.get("clientes_inactivos_padron")) or 0
        lines.append(f"✅ {name}: +{cli} cli procesados, {inact} inactivos padrón")
    extra = f"\n<i>… {len(resultados) - 12} dist más</i>" if len(resultados) > 12 else ""
    text = (
        f"📋 <b>PADRÓN GLOBAL OK</b>\n"
        f"🕐 {datetime.now(AR_TZ).strftime('%d/%m/%Y %H:%M')} AR\n"
        f"Tenants: {len(resultados)}\n\n"
        + "\n".join(lines)
        + extra
    )
    _send_telegram_html(text)


def on_padron_run_finished(
    dist_id: int,
    run_id: int,
    estado: str,
    registros: dict | None,
    error_msg: str | None = None,
) -> None:
    if estado == "error":
        notify_run_error("padron", dist_id, error_msg or "error", run_id)


def on_cc_run_finished(
    dist_id: int,
    run_id: int | None,
    estado: str,
    registros_count: int,
    error_msg: str | None = None,
) -> None:
    if estado == "error":
        notify_run_error("cuentas_corrientes", dist_id, error_msg or "error", run_id)
