# -*- coding: utf-8 -*-
"""Clasificador automático (reglas) para tickets del portal — sin LLM, versionable."""
from __future__ import annotations

import json
import os
import re
import unicodedata
import requests
from typing import Any

REGLAS_VERSION = "2026-05-08-v3"


# ── Condensado técnico embebido en prompts Gemini — NO inventar módulos fuera de esta lista.
SHELFY_TRIAGE_KB = """
Shelfy stack:
- Frontend Next.js 16 React 19 TS: rutas supervisor/mapa en `shelfy-frontend/src/` (Tabs supervisión `TabSupervision.tsx`, mapa rutas PDV `MapaRutas.tsx`, modo operativo modo-mapa).
- Backend FastAPI Python en `CenterMind/`: `routers/supervision.py`, `routers/portal_feedback.py`, `services/padron_ingestion_service.py`, `services/objetivos_watcher_service.py`, `bot_worker.py`.
- DB Supabase PostgreSQL multi-tenant: tablas base + por tenant `clientes_pdv_v2`, `rutas_v2`, `vendedores_v2` vía `tenant_table_name()`. No hardcodear sufijos de tablas.
- Mapa y rutas leen padrón ya ingerido; ingesta diaria RPA ~07:00 AR `ShelfMind-RPA/motores/padron.py` → normaliza jerarquía PDV/vendedor/ruta.
- CHESS / portal proveedor: cambios de baja o reasignación en CHESS NO actualizan el mapa hasta que el **padrón Consolido** traiga la misma jerarquía y corra la ingesta. NO decir "bug de CHESS" si es expectable desfase padrón.
- Cuentas corrientes: fuente `cc_detalle`; ingesta separada de mapa.
- Tickets portal: tabla `portal_feedback_messages`; clasificador reglas `portal_ticket_classifier.py`.

Reglas de negocio útiles en triage:
- Ticket “baja vendedor en CHESS y sigue en mapa” → revisar última ingesta padrón, fila Excel vendedor–cliente, `integrantes_grupo` / matching Telegram, y que `id_distribuidor` sea el del ticket.
- PostgREST pagina 1000 filas: scripts deben usar `.range()` en loops.
"""

_REVISION_MAPA_PDV: list[str] = [
    "En el padrón Consolido (Excel del RPA): confirmar que el id de cliente quede bajo el vendedor nuevo y la ruta/código correctos.",
    "El mapa refleja clientes_pdv_v2 después de ingesta (~07:00 AR). Cambios sólo en CHESS no mueven rutas hasta que el padrón traiga esa jerarquía.",
    "Si no ingirió bien: revisar logs de padrón por skip_no_ruta (mezcla código/nombre de vendedor entre filas).",
    "Validar número de cliente que cita el usuario vs id_cliente_erp exacto del Excel.",
]


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
        (
            "mapa",
            "chess",
            "dada de baja",
            "dadas de baja",
            "no actualiza",
            "actualiza mapa",
            "no se actualizo",
            "marcador",
        ),
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


def _infer_criticidad(
    raw: str,
    t: str,
    campos: dict[str, str | None],
    categoria_id: str,
    confianza: str,
    dest_n: str,
) -> tuple[str, str]:
    prio = _normalize(campos.get("prioridad") or "")
    low = (raw or "").lower()
    if any(x in prio for x in ("critica", "urgente", "inmediat", "bloqueante")):
        return ("critica", "Prioridad explícita alta en el formulario del ticket.")
    if any(
        x in low
        for x in (
            "caida total",
            "caída total",
            "perdida de datos",
            "pérdida de datos",
            "borrado masivo",
        )
    ):
        return ("critica", "Lenguaje asociado a incidente mayor.")

    if "chess" in t and any(x in t for x in ("mapa", "vendedor", "ruta", "sigue", "aparece", "baja")):
        return ("alta", "CHESS vs datos en supervisión / mapa (riesgo operativo).")
    if categoria_id == "mapa_supervision_rutas" and confianza == "alta":
        return ("alta", "Mapa / rutas con categoría confiable.")
    if categoria_id in {"cuentas_difusion", "rendimiento_errores"} and confianza in {"alta", "media"}:
        if any(x in t for x in ("deuda", "cc", "difusion", "difusión", "envio", "envío", "telegram")):
            return ("alta", "Cuentas corrientes o difusión con señal clara.")
    if "500" in t or "502" in t or "no carga" in t:
        return ("alta", "Error de plataforma o disponibilidad.")

    if any(x in dest_n for x in ("idea", "roadmap", "producto")) and categoria_id == "soporte_general":
        return ("baja", "Feedback de producto / idea sin síntoma bloqueante.")
    if confianza == "baja" and categoria_id == "soporte_general":
        return ("baja", "Triage general — revisar manualmente.")

    return ("media", "Impacto operativo estándar.")


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

    checklist: list[str] | None = None
    if categoria_id == "mapa_supervision_rutas":
        checklist = list(_REVISION_MAPA_PDV)
        if "sin subida todavía" in raw.lower() or "(sin subida todavía)" in raw.lower():
            checklist.append(
                "Este ticket menciona archivo **sin subir**: pedir nueva captura o reenvío desde portal ya deployado "
                "(adjuntos van a Storage; entradas viejas sólo tenían el nombre del archivo).",
            )

    out: dict[str, Any] = {
        "categoria_id": categoria_id,
        "categoria_etiqueta": categoria_etiqueta,
        "hipotesis_falla": hipotesis,
        "confianza": confianza,
        "capas_afectadas": capas_final,
        "campos_ticket": campos,
        "señales_detectadas": sorted(set(señales))[:24],
        "reglas_version": REGLAS_VERSION,
    }
    if checklist:
        out["revision_checklist"] = checklist

    cr, cr_mot = _infer_criticidad(raw, t, campos, categoria_id, confianza, dest_n)
    out["criticidad"] = cr
    out["criticidad_motivo"] = cr_mot
    return out


def generar_pre_resolucion_ticket(
    *,
    ticket: dict[str, Any],
    clasificacion: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Genera una pre-resolución para triage técnico.
    - Si hay GEMINI_API_KEY, usa Gemini para un análisis asistido.
    - Si no hay credencial/disponibilidad, usa fallback determinístico por reglas.
    """
    clf = clasificacion or clasificar_portal_ticket(str(ticket.get("contenido") or ""))
    fallback = {
        "fuente": "reglas_locales",
        "modelo": None,
        "resumen": (
            "Pre-triage basado en reglas internas. No se ejecutó Gemini "
            "(faltó credencial o hubo error en el proveedor)."
        ),
        "hipotesis": clf.get("hipotesis_falla"),
        "capas_sospechadas": clf.get("capas_afectadas") or [],
        "checks_sugeridos": (clf.get("revision_checklist") or [])[:8],
        "proxima_accion": "Corroborar hipótesis con logs y datos del tenant afectado.",
    }

    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key:
        return fallback

    model = (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash").strip()
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    prompt = {
        "rol": "shelfy_ticket_triage_expert",
        "contexto_proyecto_shelfy": SHELFY_TRIAGE_KB.strip(),
        "instrucciones": [
            "Sos ingeniero senior del monorepo Shelfy. El ticket lo envió un usuario del portal.",
            "Respondé SOLO un único objeto JSON UTF-8 válido, sin markdown ni texto adicional.",
            "Cada bloque debe ser accionable: módulo + dato + verificación (no generalidades).",
            "Si el ticket trae JSON con pathname o id_distribuidor, usalos en el razonamiento.",
            "Desalineación CHESS vs mapa: explicá cadena padrón Consolido → ingesta RPA → tablas tenant → UI mapa.",
        ],
        "schema_objetivo": {
            "resumen_ticket": "string 1-2 oraciones",
            "hipotesis_principal": "string",
            "archivos_o_modulos_sospechosos": ["ruta relativa repo p.ej. CenterMind/routers/supervision.py"],
            "checks_ordenados": ["paso concreto 1", "paso 2"],
            "categoria_etiqueta_corta_es": "string",
            "criticidad_ia": "baja|media|alta|critica",
            "justificacion_criticidad_ia": "string",
            "riesgo_si_no_se_corrige": "bajo|medio|alto",
            "suposiciones": ["string"],
            "mensaje_supervisor_si_aplica": "string opcional para copiar",
        },
        "ticket": {
            "id": ticket.get("id"),
            "id_distribuidor": ticket.get("id_distribuidor"),
            "usuario_snapshot": ticket.get("usuario_snapshot"),
            "rol_snapshot": ticket.get("rol_snapshot"),
            "contenido": ticket.get("contenido"),
            "respuesta_actual": ticket.get("respuesta"),
        },
        "clasificacion_reglas": clf,
    }
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": json.dumps(prompt, ensure_ascii=False)}],
            }
        ],
        "generationConfig": {
            "temperature": 0.15,
            "responseMimeType": "application/json",
        },
    }

    try:
        resp = requests.post(url, json=body, timeout=55)
        if not resp.ok:
            return fallback | {
                "fuente": "reglas_locales",
                "error_proveedor": f"Gemini {resp.status_code}",
            }
        payload = resp.json() or {}
        text = (
            ((payload.get("candidates") or [{}])[0].get("content") or {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
        parsed = json.loads(text) if text else {}
        if not isinstance(parsed, dict):
            return fallback
        # Alias legacy para frontend que ya consume resumen / checks_sugeridos
        out = {
            "fuente": "gemini",
            "modelo": model,
            **parsed,
        }
        if parsed.get("resumen_ticket") and not parsed.get("resumen"):
            out["resumen"] = parsed.get("resumen_ticket")
        if parsed.get("checks_ordenados") and not parsed.get("checks_sugeridos"):
            out["checks_sugeridos"] = parsed["checks_ordenados"]
        if parsed.get("hipotesis_principal") and not parsed.get("hipotesis"):
            out["hipotesis"] = parsed["hipotesis_principal"]
        if parsed.get("archivos_o_modulos_sospechosos") and not parsed.get("codigo_posible"):
            out["codigo_posible"] = parsed["archivos_o_modulos_sospechosos"]
        if parsed.get("riesgo_si_no_se_corrige"):
            out["riesgo_regresion"] = parsed["riesgo_si_no_se_corrige"]
        return out
    except Exception:
        return fallback
