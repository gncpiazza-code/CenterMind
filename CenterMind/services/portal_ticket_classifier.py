# -*- coding: utf-8 -*-
"""Clasificador automático (reglas) para tickets del portal — sin LLM, versionable."""
from __future__ import annotations

import re
import unicodedata
from typing import Any

REGLAS_VERSION = "2026-05-05-v1"


def _normalize(text: str) -> str:
    if not text:
        return ""
    nk = unicodedata.normalize("NFD", text)
    nk = "".join(c for c in nk if unicodedata.category(c) != "Mn")
    nk = nk.lower().replace("_", " ")
    nk = re.sub(r"\s+", " ", nk)
    return nk.strip()


CAPAS: dict[str, str] = {
    "frontend_portal_supervision_mapa": "Front — supervisión mapa rutas PDV",
    "frontend_portal_cc_difusion": "Front — guía CC / difusión y flujos asociados",
    "frontend_portal_reporteria": "Front — reportería / dashboards / informes Excel",
    "frontend_portal_generico": "Front — otros módulos del portal",
    "api_fastapi_backend": "API Shelfy (Railway)",
    "ingesta_padron_consolido": "Ingesta padrón (RPA Consolido)",
    "ingesta_cuentas_chess": "Ingesta cuentas corrientes (RPA CHESS)",
    "bot_telegram_exhibiciones": "Bot Telegram / exhibiciones / evaluación",
    "storage_supabase_adjuntos": "Supabase Storage (adjuntos / fotos)",
    "datos_cliente_rutas_v2": "Datos — clientes_pdv / rutas_v2 / matching ERP",
    "desconocido": "Capa no determinada (triage manual)",
}


def _capa_entry(cid: str) -> dict[str, str]:
    return {"id": cid, "etiqueta": CAPAS.get(cid, cid)}


def _parse_campos_ticket(contenido: str) -> dict[str, str | None]:
    """Parsea bloque estándar generado por CCDifusionGuiaDialog."""
    out: dict[str, str | None] = {"destinatario": None, "prioridad": None, "asunto": None}
    if not contenido:
        return out
    for line in contenido.splitlines():
        s = line.strip()
        m = re.match(r"^Destinatario:\s*(.+)$", s, re.I)
        if m:
            out["destinatario"] = m.group(1).strip()
            continue
        m = re.match(r"^Prioridad:\s*(.+)$", s, re.I)
        if m:
            out["prioridad"] = m.group(1).strip()
            continue
        m = re.match(r"^Asunto:\s*(.+)$", s, re.I)
        if m:
            out["asunto"] = m.group(1).strip()
    return out


def _capas_por_palabras(t: str) -> list[str]:
    """Heurística secundaria: dónde puede estar el problema (multi-capa)."""
    found: list[str] = []
    if any(
        x in t
        for x in (
            "mapa",
            " pin",
            "pins",
            "coordenada",
            "google map",
            "pdv",
            "ruta",
            "vendedor",
            "cliente",
        )
    ):
        found.extend(["frontend_portal_supervision_mapa", "datos_cliente_rutas_v2"])
    if any(x in t for x in ("padron", "padrón", "consolido", "erp", "excel padrón", "subir archivo")):
        found.append("ingesta_padron_consolido")
    if any(x in t for x in ("cuenta corriente", "cc ", " cc", "chess", "deuda", "deudore", "difusion", "difusión")):
        found.extend(["frontend_portal_cc_difusion", "ingesta_cuentas_chess"])
    if any(x in t for x in ("telegram", "foto", "exhibicion", "exhibición", "evaluacion", "evaluación", "bot")):
        found.append("bot_telegram_exhibiciones")
    if any(x in t for x in ("reporteria", "reportería", "comprobante", "dashboard ranking")):
        found.append("frontend_portal_reporteria")
    if any(x in t for x in ("502", "500", "api", "railway", "timeout", "servidor")):
        found.append("api_fastapi_backend")
    if any(x in t for x in ("adjunto", "imagen", "captura", "storage", "no se ve la imagen")):
        found.append("storage_supabase_adjuntos")
    if not found:
        found.append("desconocido")
    # orden estable, sin duplicados
    seen: set[str] = set()
    out: list[str] = []
    for c in found:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


Rule = tuple[str, str, tuple[str, ...], tuple[str, ...], str, str]


# id, etiqueta, frases (cualquier match suma puntos), capas sugeridas, hipótesis, confianza base si match fuerte
_PRIMARIAS: list[Rule] = [
    (
        "bot_exhibiciones",
        "Exhibiciones / Telegram",
        ("telegram", "exhibicion", "exhibición", "evaluacion", "evaluación", "mensaje telegram"),
        ("bot_telegram_exhibiciones", "frontend_portal_generico"),
        "El problema apunta al flujo de fotos desde Telegram, evaluaciones en portal o mensajes automáticos al bot.",
        "alta",
    ),
    (
        "cuentas_difusion",
        "Cuentas corrientes y difusión",
        ("cuenta corriente", "cuentas corrientes", "difusion ", "difusión ", "deuda cliente", "cc detalle"),
        ("frontend_portal_cc_difusion", "ingesta_cuentas_chess", "bot_telegram_exhibiciones"),
        "Incidente relacionado con CC (CHESS), la guía de difusión o envíos Telegram con datos de cobranza.",
        "alta",
    ),
    (
        "mapa_supervision_rutas",
        "Mapa / rutas / PDV supervisión",
        ("mapa", "no actualiza", "actualiza mapa", "no se actualizo", "marcador"),
        ("frontend_portal_supervision_mapa", "datos_cliente_rutas_v2", "ingesta_padron_consolido"),
        "Cambios de clientes u orden de rutas pueden depender del padrón diario Consolido + ingesta rutas/clientes PDV "
        "(también errores visibles sólo en el mapa React). Si el usuario cambió algo en CHESS sólo sobre ventas/CC, "
        "el mapa no lo refleja hasta que llegue la info de rutas desde padrón.",
        "alta",
    ),
    (
        "ingesta_padron_erp",
        "Padrón / jerarquía ERP",
        ("padron", "padrón", "jerarquia", "jerarquía", "consolido", "sucursal erp"),
        ("ingesta_padron_consolido", "datos_cliente_rutas_v2"),
        "Señales de inconsistencia entre ERP Consolido exportado vs tablas rutas/clientes Shelfy tras la ingesta RPA.",
        "media",
    ),
    (
        "acceso_usuarios",
        "Login / roles / permisos",
        ("login", "contraseña", "password", "no entra", "sesion cerrada", "sesión cerrada", "permiso"),
        ("frontend_portal_generico", "api_fastapi_backend"),
        "Posible problema de JWT, tabla usuarios_portal, permisos o contexto distribuidor en el frontend.",
        "media",
    ),
    (
        "reporteria_informes",
        "Reportería / Excel procesado",
        ("reporteria", "reportería", "comprobante", "importar excel reporteria"),
        ("frontend_portal_reporteria", "api_fastapi_backend"),
        "Procesamiento de reportes subidos desde el portal o APIs de reportería v2.",
        "media",
    ),
    (
        "rendimiento_errores",
        "Errores o lentitud genérica",
        ("lento", "no carga", " pantalla blanca", "error", "crash", "500", "504"),
        ("frontend_portal_generico", "api_fastapi_backend"),
        "Síntoma transversal — conviene corroborar redeploy, errores Railway y logs de consola navegador.",
        "media",
    ),
]


def clasificar_portal_ticket(contenido: str) -> dict[str, Any]:
    """
    Devuelve un dict JSON-serializable para `clasificacion_agent` en API y front.
    """
    raw = (contenido or "").strip()
    t = _normalize(raw)
    campos = _parse_campos_ticket(raw)
    asunto_n = _normalize((campos.get("asunto") or ""))
    dest_n = _normalize((campos.get("destinatario") or ""))
    prioridad_n = _normalize((campos.get("prioridad") or ""))

    señales: list[str] = []
    categoria_id = "soporte_general"
    categoria_etiqueta = "Soporte general / triage"
    hipotesis = (
        "No hubo coincidencia fuerte con categorías Shelfy. Revisar texto completo, distribuidor y adjuntos; "
        "posible pedido de producto o caso único."
    )
    confianza = "baja"
    capas_ids: list[str] = []

    scoreboard: list[tuple[int, Rule]] = []
    for rule in _PRIMARIAS:
        rid, rlabel, frases, capas_rule, hip, conf = rule
        score = 0
        matched: list[str] = []
        for fr in frases:
            f = fr.strip().lower()
            if f and f in t:
                score += 3
                matched.append(fr.strip())
            elif f and f in asunto_n:
                score += 2
                matched.append(f"{fr.strip()} (asunto)")
        if score > 0:
            scoreboard.append((score, rule))
            señales.extend(matched)

    if scoreboard:
        scoreboard.sort(key=lambda x: (-x[0], x[1][0]))
        best = scoreboard[0][1]
        categoria_id = best[0]
        categoria_etiqueta = best[1]
        hipotesis = best[4]
        confianza = best[5] if scoreboard[0][0] >= 4 else "media"
        capas_ids.extend(best[3])

    # Incorpora detección por capas ( ensancha el “dónde” )
    capas_ids.extend(_capas_por_palabras(t + " " + asunto_n + " " + dest_n + " " + prioridad_n))

    # Producto vs soporte — refina hipótesis liviana
    if "producto" in dest_n and categoria_id == "soporte_general":
        hipotesis = "El usuario etiquetó destino Producto: probable feedback de UX o roadmap, no bug operativo."
        confianza = "media"
    if "idea" in dest_n or "roadmap" in dest_n:
        señales.append("destinatario: ideas/roadmap")

    seen: set[str] = set()
    capas_final: list[dict[str, str]] = []
    for cid in capas_ids:
        if cid in seen:
            continue
        seen.add(cid)
        capas_final.append(_capa_entry(cid))

    return {
        "categoria_id": categoria_id,
        "categoria_etiqueta": categoria_etiqueta,
        "hipotesis_falla": hipotesis,
        "confianza": confianza,
        "capas_afectadas": capas_final,
        "campos_ticket": campos,
        "señales_detectadas": sorted(set(señales))[:24],
        "reglas_version": REGLAS_VERSION,
    }
