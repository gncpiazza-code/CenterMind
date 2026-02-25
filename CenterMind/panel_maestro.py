# -*- coding: utf-8 -*-
"""
ShelfMind — Panel Maestro v3 (Flet)
=====================================
Reescrito desde tkinter a Flet para mejor performance y estética.

Instalación: pip install flet
Uso:         python panel_maestro_flet.py

Secciones:
  ◉ Vista General   — cards en tiempo real, pill Streamlit
  🌐 Streamlit      — iniciar/detener/configurar servidor web
  ▶ Consola en Vivo — tail del .log en tiempo real (FIX: ahora sí muestra logs)
  ≡ Historial Logs  — leer archivos .log guardados
  ⚙ Gestión Bots   — tabla de bots + control individual
  ◈ Distribuidoras  — alta, baja, edición
  ⊡ Backups         — historial, backup manual, tamaños
"""

from __future__ import annotations

import flet as ft
import sqlite3
import subprocess
import sys
import os
import time
import threading
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

# ── Paths ──────────────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).resolve().parent
DB_PATH       = BASE_DIR / "base_datos" / "centermind.db"
LOGS_DIR      = BASE_DIR / "logs"
BAK_DIR       = BASE_DIR / "backups"
STREAMLIT_APP = BASE_DIR / "StreamLitApp" / "app.py"
AR_TZ         = ZoneInfo("America/Argentina/Buenos_Aires")
sys.path.insert(0, str(BASE_DIR))

# ── Paleta ShelfMind Tobacco ───────────────────────────────────────────────
# Extraída de closeup_dried_tobacco.jpeg (Adobe Color)
BG         = "#2A1E18"   # fondo — marrón muy oscuro
PANEL      = "#321F16"   # paneles
CARD       = "#3B2318"   # cards
BORDER     = "#5C3A28"   # bordes
TEXT       = "#F0E6D8"   # texto principal — crema cálido
MUTED      = "#A68B72"   # texto secundario — sand apagado
AMBER      = "#D9A76A"   # acento principal — warm gold
SAND       = "#D9BD9C"   # acento secundario
GREEN      = "#7DAF6B"   # éxito / activo
RED        = "#C0584A"   # error / detenido
SIDEBAR_BG = "#211510"   # sidebar
SEL        = "#4A2E1E"   # selección activa
HOVER_BG   = "#3A2215"   # hover
CONSOLE_BG = "#180F0A"   # fondo consola
CONSOLE_T  = "#C8B89A"   # texto consola

REFRESH_S     = 2
MAX_LOG_LINES = 1000

# ── Helpers de color ───────────────────────────────────────────────────────
def _sc(status: str) -> str:
    return {"running": GREEN, "stopped": MUTED, "crashed": RED}.get(status, MUTED)

def _si(status: str) -> str:
    return {"running": "●", "stopped": "○", "crashed": "✕"}.get(status, "?")

def _now() -> str:
    return datetime.now(AR_TZ).strftime("%H:%M:%S")

def _fmt_size(b: int) -> str:
    if b < 1024:     return f"{b} B"
    if b < 1024**2:  return f"{b/1024:.1f} KB"
    return f"{b/1024**2:.2f} MB"


# ══════════════════════════════════════════════════════════════════════════════
# BASE DE DATOS
# ══════════════════════════════════════════════════════════════════════════════

class DB:
    @staticmethod
    def _conn() -> sqlite3.Connection:
        c = sqlite3.connect(str(DB_PATH))
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        return c

    @classmethod
    def get_distribuidoras(cls) -> List[Dict]:
        try:
            with cls._conn() as c:
                rows = c.execute(
                    "SELECT id_distribuidor id, nombre_empresa nombre, token_bot,"
                    " id_carpeta_drive drive, admin_telegram_id admin_id, estado"
                    " FROM distribuidores ORDER BY nombre_empresa"
                ).fetchall()
            return [dict(r) for r in rows]
        except Exception:
            return []

    @classmethod
    def upsert(cls, d: Dict) -> None:
        with cls._conn() as c:
            if d.get("id"):
                c.execute(
                    "UPDATE distribuidores SET nombre_empresa=?,token_bot=?,"
                    "id_carpeta_drive=?,admin_telegram_id=?,estado=? WHERE id_distribuidor=?",
                    (d["nombre"], d["token"], d["drive"], d["admin_id"], d["estado"], d["id"])
                )
            else:
                c.execute(
                    "INSERT INTO distribuidores(nombre_empresa,token_bot,"
                    "id_carpeta_drive,admin_telegram_id,estado) VALUES(?,?,?,?,?)",
                    (d["nombre"], d["token"], d["drive"], d["admin_id"], d["estado"])
                )
            c.commit()

    @classmethod
    def toggle_estado(cls, did: int, estado: str) -> None:
        with cls._conn() as c:
            c.execute("UPDATE distribuidores SET estado=? WHERE id_distribuidor=?", (estado, did))
            c.commit()

    @classmethod
    def stats(cls, did: int) -> Dict:
        try:
            with cls._conn() as c:
                r = c.execute(
                    "SELECT COUNT(*) total,"
                    " SUM(CASE WHEN estado='Pendiente' THEN 1 ELSE 0 END) pendientes"
                    " FROM exhibiciones WHERE id_distribuidor=?",
                    (did,)
                ).fetchone()
            return dict(r) if r else {"total": 0, "pendientes": 0}
        except Exception:
            return {"total": 0, "pendientes": 0}


# ══════════════════════════════════════════════════════════════════════════════
# BOT MANAGER
# ══════════════════════════════════════════════════════════════════════════════

class BotProcess:
    def __init__(self, dist_id: int, nombre: str):
        self.dist_id  = dist_id
        self.nombre   = nombre
        self._proc: Optional[subprocess.Popen] = None
        self._start_t = 0.0
        self.restarts = 0

    @property
    def status(self) -> str:
        if self._proc is None:        return "stopped"
        if self._proc.poll() is None: return "running"
        return "crashed"

    @property
    def uptime(self) -> str:
        if self.status != "running": return "—"
        s = int(time.time() - self._start_t)
        return f"{s//3600:02d}:{(s%3600)//60:02d}:{s%60:02d}"

    @property
    def pid(self) -> str:
        return str(self._proc.pid) if self._proc and self._proc.poll() is None else "—"

    def start(self) -> None:
        if self.status == "running": return
        script = BASE_DIR / "bot_worker.py"
        LOGS_DIR.mkdir(exist_ok=True)
        log_file = LOGS_DIR / f"bot_{self.dist_id}.log"
        kwargs: dict = {
            "cwd":   str(BASE_DIR),
            "stdout": subprocess.DEVNULL,
            "stderr": open(log_file, "a", encoding="utf-8"),
            "stdin":  subprocess.DEVNULL,
        }
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        self._proc = subprocess.Popen(
            [sys.executable, str(script), "--distribuidor-id", str(self.dist_id)],
            **kwargs
        )
        self._start_t = time.time()

    def stop(self) -> None:
        if self._proc:
            try: self._proc.terminate(); self._proc.wait(timeout=5)
            except Exception:
                try: self._proc.kill()
                except Exception: pass
        self._proc = None; self._start_t = 0.0

    def restart(self) -> None:
        self.stop(); time.sleep(1); self.start(); self.restarts += 1


class BotManager:
    def __init__(self): self._bots: Dict[int, BotProcess] = {}

    def load(self) -> None:
        for d in DB.get_distribuidoras():
            if d["id"] not in self._bots:
                self._bots[d["id"]] = BotProcess(d["id"], d["nombre"])

    def refresh(self) -> None:
        dists = DB.get_distribuidoras()
        ids   = {d["id"] for d in dists}
        for d in dists:
            if d["id"] not in self._bots:
                self._bots[d["id"]] = BotProcess(d["id"], d["nombre"])
        for k in list(self._bots):
            if k not in ids:
                self._bots[k].stop(); del self._bots[k]

    def all(self) -> List[BotProcess]: return list(self._bots.values())
    def get(self, did: int) -> Optional[BotProcess]: return self._bots.get(did)

    def start_all(self) -> None:
        for b in self.all(): threading.Thread(target=b.start, daemon=True).start()

    def stop_all(self) -> None:
        for b in self.all(): b.stop()


# ══════════════════════════════════════════════════════════════════════════════
# STREAMLIT MANAGER
# ══════════════════════════════════════════════════════════════════════════════

class StreamlitManager:
    def __init__(self):
        self._proc: Optional[subprocess.Popen] = None
        self._port  = 8501
        self._start_t = 0.0

    @property
    def status(self) -> str:
        if self._proc is None:        return "stopped"
        if self._proc.poll() is None: return "running"
        return "crashed"

    @property
    def url(self) -> str: return f"http://localhost:{self._port}"

    @property
    def uptime(self) -> str:
        if self.status != "running": return "—"
        s = int(time.time() - self._start_t)
        return f"{s//3600:02d}:{(s%3600)//60:02d}:{s%60:02d}"

    @property
    def pid(self) -> str:
        return str(self._proc.pid) if self._proc and self._proc.poll() is None else "—"

    def start(self) -> str:
        if self.status == "running": return f"Ya corriendo en :{self._port}"
        if not STREAMLIT_APP.exists(): return f"❌ No encontrado: {STREAMLIT_APP}"
        try:
            self._proc = subprocess.Popen(
                [sys.executable, "-m", "streamlit", "run", str(STREAMLIT_APP),
                 "--server.port", str(self._port),
                 "--server.headless", "true",
                 "--server.address", "0.0.0.0",
                 "--browser.gatherUsageStats", "false"],
                cwd=str(BASE_DIR), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            self._start_t = time.time()
            return f"✅ Streamlit iniciado → {self.url}"
        except Exception as e:
            return f"❌ Error: {e}"

    def stop(self) -> str:
        if self._proc:
            try: self._proc.terminate(); self._proc.wait(timeout=5)
            except Exception:
                try: self._proc.kill()
                except Exception: pass
        self._proc = None; self._start_t = 0.0
        return "⏹ Streamlit detenido."

    def restart(self) -> str:
        self.stop(); time.sleep(1); return self.start()

    def open_browser(self) -> None: webbrowser.open(self.url)
    def set_port(self, p: int) -> None: self._port = int(p)


# ══════════════════════════════════════════════════════════════════════════════
# UI HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _card(*controls, padding: int = 14, mb: int = 10) -> ft.Container:
    return ft.Container(
        content=ft.Column(list(controls), spacing=6, tight=True),
        bgcolor=CARD,
        border=ft.border.all(1, BORDER),
        border_radius=8,
        padding=padding,
        margin=ft.margin.only(bottom=mb),
    )

def _lbl(text: str, color: str = MUTED, size: int = 9,
         bold: bool = False, mono: bool = False) -> ft.Text:
    return ft.Text(
        text, color=color, size=size,
        weight=ft.FontWeight.BOLD if bold else ft.FontWeight.NORMAL,
        font_family="Courier New" if mono else None,
    )

def _section_header(title: str, subtitle: str = "") -> ft.Column:
    return ft.Column([
        ft.Text(title, color=AMBER, size=16, weight=ft.FontWeight.BOLD),
        ft.Text(subtitle, color=MUTED, size=9) if subtitle else ft.Container(height=0),
        ft.Divider(color=BORDER, height=1, thickness=1),
    ], spacing=4)

def _btn(text: str, on_click, color: str = AMBER,
         bgcolor: str = PANEL, width: Optional[int] = None) -> ft.Button:
    return ft.Button(
        content=ft.Text(text, color=color, size=10),
        on_click=on_click, width=width,
        style=ft.ButtonStyle(
            bgcolor={ft.ControlState.DEFAULT: bgcolor,
                     ft.ControlState.HOVERED: HOVER_BG},
            shape=ft.RoundedRectangleBorder(radius=6),
            side=ft.BorderSide(1, BORDER),
            padding=ft.Padding.symmetric(horizontal=14, vertical=8),
        )
    )

def _wrap_section(content: ft.Column) -> ft.Container:
    """Wrapper scrollable para cada sección."""
    return ft.Container(
        content=ft.Column(
            [content],
            scroll=ft.ScrollMode.ADAPTIVE,
            expand=True,
        ),
        expand=True,
        bgcolor=BG,
        visible=False,
        padding=ft.padding.only(left=24, right=24, top=20, bottom=20),
    )


# ══════════════════════════════════════════════════════════════════════════════
# PANEL MAESTRO — CLASE PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════

class ShelfMindPanel:

    NAV = [
        ("overview",       "◉  Vista General"),
        ("streamlit",      "🌐  Streamlit"),
        ("console",        "▶  Consola en Vivo"),
        ("logs",           "≡  Historial Logs"),
        ("bots",           "⚙  Gestión de Bots"),
        ("distribuidoras", "◈  Distribuidoras"),
        ("backups",        "⊡  Backups"),
    ]

    def __init__(self, page: ft.Page):
        self.page = page
        self.bm   = BotManager()
        self.sm   = StreamlitManager()
        self.bm.load()

        # ── Referencias a controles que se actualizan en background ────────────
        self._bot_refs:  Dict[int, Dict[str, ft.Text]] = {}
        self._sm_refs:   Dict[str, ft.Text]            = {}
        self._sm_pill:   Optional[ft.Text]             = None
        self._sm_url_pill: Optional[ft.Text]           = None
        self._console_lv:   Optional[ft.ListView]      = None
        self._console_count: Optional[ft.Text]         = None
        self._sm_log_lv:    Optional[ft.ListView]      = None
        self._console_paused = False
        self._console_filter = "TODOS"
        self._console_search = ""

        # ── Secciones y nav ────────────────────────────────────────────────────
        self._sections: Dict[str, ft.Container] = {}
        self._nav_btns: Dict[str, ft.Container] = {}
        self._active: Optional[str] = None

        # ── Background threads ─────────────────────────────────────────────────
        self._running = True

        self._setup_page()
        self._build_all()
        self._build_layout()
        self.show("overview")

        threading.Thread(target=self._refresh_loop, daemon=True).start()
        threading.Thread(target=self._tail_logs,    daemon=True).start()

    # ─────────────────────────────────────────────────────────────────────────
    # SETUP
    # ─────────────────────────────────────────────────────────────────────────

    def _setup_page(self) -> None:
        self.page.title   = "ShelfMind · Panel Maestro"
        self.page.bgcolor = BG
        self.page.padding = 0
        self.page.fonts   = {"Courier New": "https://fonts.gstatic.com/s/courierprime/v8/u-450q2lgwslOqpF_6gQ8kELaw9pWt.woff2"}
        try:
            self.page.window.width      = 1340
            self.page.window.height     = 860
            self.page.window.min_width  = 1000
            self.page.window.min_height = 640
        except AttributeError:
            self.page.window_width      = 1340
            self.page.window_height     = 860
            self.page.window_min_width  = 1000
            self.page.window_min_height = 640
        self.page.on_window_event = self._on_window_event

    # ─────────────────────────────────────────────────────────────────────────
    # LAYOUT PRINCIPAL
    # ─────────────────────────────────────────────────────────────────────────

    def _build_layout(self) -> None:
        # ── Topbar ─────────────────────────────────────────────────────────────
        self._clock = ft.Text("", color=MUTED, size=9)
        topbar = ft.Container(
            content=ft.Row([
                ft.Text("SHELFMIND", color=AMBER, size=14,
                        weight=ft.FontWeight.BOLD),
                ft.Text("  ·  Panel Maestro", color=MUTED, size=10),
                ft.Container(expand=True),
                self._clock,
            ], vertical_alignment=ft.CrossAxisAlignment.CENTER),
            bgcolor=SIDEBAR_BG, height=46, padding=ft.padding.symmetric(horizontal=20),
            border=ft.border.only(bottom=ft.BorderSide(1, BORDER)),
        )

        # ── Sidebar ────────────────────────────────────────────────────────────
        nav_items = []
        for key, label in self.NAV:
            lbl = ft.Text(label, color=TEXT, size=10)
            btn = ft.Container(
                content=lbl,
                bgcolor=None,
                border_radius=6,
                padding=ft.padding.symmetric(horizontal=14, vertical=10),
                on_click=lambda e, k=key: self.show(k),
                on_hover=lambda e, k=key, l=lbl: self._on_nav_hover(e, k, l),
                width=200,
            )
            self._nav_btns[key] = btn
            nav_items.append(btn)

        sidebar = ft.Container(
            content=ft.Column([
                ft.Container(height=10),
                ft.Text("NAVEGACIÓN", color=MUTED, size=7,
                        weight=ft.FontWeight.BOLD,
                        padding=ft.padding.only(left=14, bottom=4)),
                *nav_items,
                ft.Container(expand=True),
                ft.Text("v3.0 · Flet · Febrero 2026", color=MUTED, size=7,
                        padding=ft.padding.only(left=14, bottom=10)),
            ], spacing=0, expand=True),
            bgcolor=SIDEBAR_BG, width=204,
            border=ft.border.only(right=ft.BorderSide(1, BORDER)),
        )

        # ── Content stack ─────────────────────────────────────────────────────
        content = ft.Stack(list(self._sections.values()), expand=True)

        # ── Page layout ────────────────────────────────────────────────────────
        self.page.add(
            ft.Column([
                topbar,
                ft.Row([
                    sidebar,
                    ft.Container(content=content, expand=True, bgcolor=BG),
                ], expand=True, spacing=0),
            ], spacing=0, expand=True),
        )
        self._update_clock()

    def _update_clock(self) -> None:
        self._clock.value = datetime.now(AR_TZ).strftime("%d/%m/%Y  %H:%M:%S  ARG")
        try: self._clock.update()
        except Exception: pass
        threading.Timer(1.0, self._update_clock).start()

    # ─────────────────────────────────────────────────────────────────────────
    # NAVEGACIÓN
    # ─────────────────────────────────────────────────────────────────────────

    def show(self, key: str) -> None:
        if self._active:
            self._sections[self._active].visible = False
            btn = self._nav_btns.get(self._active)
            if btn:
                btn.bgcolor = None
                try: btn.content.color = TEXT; btn.update()
                except: pass

        self._sections[key].visible = True
        btn = self._nav_btns.get(key)
        if btn:
            btn.bgcolor = SEL
            try: btn.content.color = AMBER; btn.update()
            except: pass

        self._active = key
        try: self.page.update()
        except: pass

    def _on_nav_hover(self, e, key: str, lbl: ft.Text) -> None:
        if key == self._active: return
        btn = self._nav_btns[key]
        if e.data == "true":
            btn.bgcolor = HOVER_BG
        else:
            btn.bgcolor = None
        try: btn.update()
        except: pass

    # ─────────────────────────────────────────────────────────────────────────
    # CONSTRUIR TODAS LAS SECCIONES
    # ─────────────────────────────────────────────────────────────────────────

    def _build_all(self) -> None:
        self._sections["overview"]       = self._build_overview()
        self._sections["streamlit"]      = self._build_streamlit()
        self._sections["console"]        = self._build_console()
        self._sections["logs"]           = self._build_log_history()
        self._sections["bots"]           = self._build_bots()
        self._sections["distribuidoras"] = self._build_distribuidoras()
        self._sections["backups"]        = self._build_backups()

    # ══════════════════════════════════════════════════════════════════════════
    # SECCIÓN: VISTA GENERAL
    # ══════════════════════════════════════════════════════════════════════════

    def _build_overview(self) -> ft.Container:
        # ── Streamlit pill ──────────────────────────────────────────────────────
        self._sm_pill     = ft.Text("DETENIDO", color=MUTED, size=9,
                                    weight=ft.FontWeight.BOLD)
        self._sm_url_pill = ft.Text("", color=AMBER, size=9)
        sm_pill_row = ft.Container(
            content=ft.Row([
                ft.Text("🌐 Streamlit:", color=MUTED, size=9),
                self._sm_pill,
                self._sm_url_pill,
                ft.Container(
                    content=ft.Text("▶", color=GREEN, size=10,
                                    weight=ft.FontWeight.BOLD),
                    on_click=lambda e: threading.Thread(
                        target=self.sm.start, daemon=True).start(),
                    tooltip="Iniciar Streamlit",
                    bgcolor=PANEL, border_radius=4,
                    padding=ft.padding.symmetric(horizontal=8, vertical=3),
                ),
                ft.Container(
                    content=ft.Text("■", color=RED, size=10,
                                    weight=ft.FontWeight.BOLD),
                    on_click=lambda e: self.sm.stop(),
                    tooltip="Detener Streamlit",
                    bgcolor=PANEL, border_radius=4,
                    padding=ft.padding.symmetric(horizontal=8, vertical=3),
                ),
            ], spacing=8, vertical_alignment=ft.CrossAxisAlignment.CENTER),
            bgcolor=PANEL,
            border=ft.border.all(1, BORDER),
            border_radius=6,
            padding=ft.padding.symmetric(horizontal=12, vertical=6),
            margin=ft.margin.only(bottom=6),
        )

        # ── Toolbar ─────────────────────────────────────────────────────────────
        toolbar = ft.Row([
            _btn("▶  INICIAR TODOS",
                 lambda e: threading.Thread(target=self.bm.start_all, daemon=True).start(),
                 color=GREEN),
            _btn("■  DETENER TODOS",
                 lambda e: self._confirm_stop_all(),
                 color=RED),
            _btn("↺  REFRESH DB",
                 lambda e: self._refresh_db_overview(),
                 color=SAND),
        ], spacing=8, wrap=True)

        # ── Bot cards ────────────────────────────────────────────────────────────
        self._overview_cards = ft.Column(
            self._build_bot_cards(),
            wrap=True,
            spacing=10,
        )

        content = ft.Column([
            _section_header("Vista General", "Estado en tiempo real de todos los procesos"),
            sm_pill_row,
            toolbar,
            ft.Container(height=8),
            self._overview_cards,
        ], spacing=10, expand=True)

        return _wrap_section(content)

    def _build_bot_cards(self) -> List[ft.Container]:
        cards = []
        self._bot_refs.clear()
        for bp in self.bm.all():
            st = ft.Text(f"{_si(bp.status)} {bp.status.upper()}",
                         color=_sc(bp.status), size=11,
                         weight=ft.FontWeight.BOLD)
            up = ft.Text(bp.uptime, color=TEXT, size=9)
            pi = ft.Text(bp.pid,    color=TEXT, size=9)
            rs = ft.Text(str(bp.restarts), color=TEXT, size=9)
            self._bot_refs[bp.dist_id] = {"status": st, "uptime": up,
                                           "pid": pi, "restarts": rs}

            try:
                s = DB.stats(bp.dist_id)
                stats_row = ft.Text(
                    f"📦 Fotos: {s.get('total',0)}  ·  ⏳ Pendientes: {s.get('pendientes',0)}",
                    color=MUTED, size=8
                )
            except Exception:
                stats_row = ft.Container()

            card = ft.Container(
                content=ft.Column([
                    ft.Row([
                        ft.Container(
                            content=st, expand=True,
                        ),
                    ]),
                    ft.Text(bp.nombre, color=TEXT, size=12,
                            weight=ft.FontWeight.BOLD),
                    ft.Text(f"ID distribuidora: {bp.dist_id}",
                            color=MUTED, size=8),
                    ft.Divider(color=BORDER, height=1),
                    ft.Row([
                        ft.Column([_lbl("Uptime"), up], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Column([_lbl("PID"),    pi], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Column([_lbl("Reinic"), rs], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    ], spacing=20),
                    ft.Divider(color=BORDER, height=1),
                    ft.Row([
                        ft.IconButton(ft.icons.PLAY_ARROW, icon_color=GREEN,
                                      tooltip="Iniciar",
                                      on_click=lambda e, b=bp: threading.Thread(
                                          target=b.start, daemon=True).start()),
                        ft.IconButton(ft.icons.STOP, icon_color=RED,
                                      tooltip="Detener",
                                      on_click=lambda e, b=bp: b.stop()),
                        ft.IconButton(ft.icons.REFRESH, icon_color=AMBER,
                                      tooltip="Reiniciar",
                                      on_click=lambda e, b=bp: threading.Thread(
                                          target=b.restart, daemon=True).start()),
                    ], spacing=4),
                    stats_row,
                ], spacing=6, tight=True),
                bgcolor=CARD,
                border=ft.border.all(1, BORDER),
                border_radius=10,
                padding=14,
                width=280,
            )
            cards.append(card)
        if not cards:
            cards.append(ft.Container(
                content=ft.Text("No hay distribuidoras en la base de datos.",
                                color=MUTED, size=10),
                padding=20,
            ))
        return cards

    def _confirm_stop_all(self) -> None:
        def _do(e):
            dlg.open = False
            self.page.update()
            self.bm.stop_all()
        dlg = ft.AlertDialog(
            modal=True,
            title=ft.Text("Confirmar", color=AMBER),
            content=ft.Text("¿Detener TODOS los bots?", color=TEXT),
            actions=[
                ft.TextButton("Cancelar",
                              on_click=lambda e: (setattr(dlg, "open", False),
                                                  self.page.update()),
                              style=ft.ButtonStyle(color=MUTED)),
                ft.TextButton("DETENER",
                              on_click=_do,
                              style=ft.ButtonStyle(color=RED)),
            ],
        )
        self.page.dialog = dlg
        dlg.open = True
        self.page.update()

    def _refresh_db_overview(self) -> None:
        self.bm.refresh()
        self._overview_cards.controls = self._build_bot_cards()
        try: self._overview_cards.update()
        except: self.page.update()

    # ══════════════════════════════════════════════════════════════════════════
    # SECCIÓN: STREAMLIT
    # ══════════════════════════════════════════════════════════════════════════

    def _build_streamlit(self) -> ft.Container:
        # Controles de estado
        s_icon   = ft.Text(_si("stopped"), color=MUTED, size=28)
        s_status = ft.Text("DETENIDO",    color=MUTED, size=14,
                            weight=ft.FontWeight.BOLD)
        s_url    = ft.Text(self.sm.url,   color=AMBER, size=10)
        s_up     = ft.Text("—", color=TEXT, size=10, weight=ft.FontWeight.BOLD)
        s_pid    = ft.Text("—", color=TEXT, size=10, weight=ft.FontWeight.BOLD)
        s_port   = ft.Text(str(self.sm._port), color=TEXT, size=10,
                           weight=ft.FontWeight.BOLD)
        self._sm_refs = {"icon": s_icon, "status": s_status, "url": s_url,
                         "uptime": s_up, "pid": s_pid, "port_lbl": s_port}

        # Log de acciones
        self._sm_log_lv = ft.ListView(
            auto_scroll=True, expand=True, spacing=0,
            item_extent=16,
        )

        # Config de puerto
        port_field = ft.TextField(
            value=str(self.sm._port), width=90,
            bgcolor=PANEL, color=TEXT,
            border_color=BORDER, focused_border_color=AMBER,
            text_style=ft.TextStyle(font_family="Courier New", size=11),
            keyboard_type=ft.KeyboardType.NUMBER,
        )

        def _apply_port(e):
            try:
                p = int(port_field.value or "8501")
                if not (1024 <= p <= 65535):
                    raise ValueError()
                self.sm.set_port(p)
                s_port.value = str(p)
                s_url.value  = self.sm.url
                self._sm_log(f"Puerto actualizado a {p}. Reiniciá Streamlit para aplicar.")
                try: s_port.update(); s_url.update()
                except: pass
            except ValueError:
                self._sm_log("❌ Puerto inválido — debe ser un número entre 1024 y 65535.")

        def _start_st(e):
            threading.Thread(target=lambda: self._sm_log(self.sm.start()),
                             daemon=True).start()

        def _stop_st(e):
            self._sm_log(self.sm.stop())

        def _restart_st(e):
            threading.Thread(target=lambda: self._sm_log(self.sm.restart()),
                             daemon=True).start()

        def _open_st(e):
            self.sm.open_browser()

        content = ft.Column([
            _section_header("Servidor Streamlit",
                            "App web accesible por los distribuidores desde el navegador"),

            # Status card
            _card(
                ft.Row([
                    s_icon,
                    ft.Container(width=10),
                    ft.Column([s_status, s_url], spacing=4),
                ], vertical_alignment=ft.CrossAxisAlignment.CENTER),
                ft.Divider(color=BORDER, height=1),
                ft.Row([
                    ft.Column([_lbl("Uptime"), s_up],   spacing=2,
                              horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    ft.Column([_lbl("PID"),    s_pid],  spacing=2,
                              horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    ft.Column([_lbl("Puerto"), s_port], spacing=2,
                              horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                ], spacing=30),
            ),

            # Botones de control
            ft.Row([
                _btn("▶  INICIAR",              _start_st,   color=GREEN),
                _btn("■  DETENER",              _stop_st,    color=RED),
                _btn("↺  REINICIAR",            _restart_st, color=AMBER),
                _btn("🌐  ABRIR EN NAVEGADOR",  _open_st,    color=SAND),
            ], spacing=8, wrap=True),

            # Config de puerto
            _card(
                _lbl("CONFIGURACIÓN", color=AMBER, size=9, bold=True),
                ft.Divider(color=BORDER, height=1),
                ft.Row([
                    ft.Text("Puerto:", color=MUTED, size=9),
                    port_field,
                    _btn("Aplicar", _apply_port, color=AMBER),
                    ft.Text("  Reiniciá Streamlit para que tome el nuevo puerto.",
                            color=MUTED, size=8),
                ], spacing=8, vertical_alignment=ft.CrossAxisAlignment.CENTER),
            ),

            # Cómo acceden los distribuidores
            _card(
                _lbl("CÓMO ACCEDEN LOS DISTRIBUIDORES", color=AMBER, size=9, bold=True),
                ft.Divider(color=BORDER, height=1),
                *[ft.Row([
                    ft.Text(lbl, color=SAND, size=8,
                            weight=ft.FontWeight.BOLD, width=170),
                    ft.Text(det, color=TEXT, size=8, expand=True),
                ], spacing=8)
                  for lbl, det in [
                    ("Red local (LAN):",
                     "Los distribuidores abren http://IP_DEL_SERVIDOR:8501 en su navegador."),
                    ("VPS / internet pública:",
                     "Igual que LAN pero con la IP pública del VPS."),
                    ("server.address 0.0.0.0:",
                     "Streamlit acepta conexiones desde cualquier IP, no solo localhost."),
                    ("Sin servidor aún:",
                     "Durante desarrollo: todo en localhost. "
                     "Para clientes reales: VPS Ubuntu ~5 USD/mes (Contabo, DigitalOcean)."),
                    ("HTTPS (avanzado):",
                     "Configurar nginx como proxy inverso (Fase de producción)."),
                  ]],
            ),

            # Log de acciones
            ft.Text("REGISTRO", color=AMBER, size=9, weight=ft.FontWeight.BOLD),
            ft.Container(
                content=self._sm_log_lv,
                bgcolor=CONSOLE_BG,
                border=ft.border.all(1, BORDER),
                border_radius=6,
                padding=8,
                height=160,
            ),
        ], spacing=10, expand=True)

        return _wrap_section(content)

    def _sm_log(self, msg: str) -> None:
        if self._sm_log_lv is None: return
        ts   = _now()
        ctrl = ft.Text(f"[{ts}]  {msg}", color=CONSOLE_T, size=8,
                       font_family="Courier New", selectable=True)
        self._sm_log_lv.controls.append(ctrl)
        try: self._sm_log_lv.update()
        except: pass

    # ══════════════════════════════════════════════════════════════════════════
    # SECCIÓN: CONSOLA EN VIVO
    # ══════════════════════════════════════════════════════════════════════════

    def _build_console(self) -> ft.Container:
        self._console_lv = ft.ListView(
            auto_scroll=True, expand=True, spacing=0, item_extent=15,
        )
        self._console_count = ft.Text("0 líneas", color=MUTED, size=8)

        def _toggle_pause(e):
            self._console_paused = not self._console_paused
            e.control.text = "▶  REANUDAR" if self._console_paused else "⏸  PAUSAR"
            e.control.style.color = {
                ft.ControlState.DEFAULT: AMBER if self._console_paused else MUTED
            }
            try: e.control.update()
            except: pass

        def _clear(e):
            self._console_lv.controls.clear()
            self._console_count.value = "0 líneas"
            try: self._console_lv.update(); self._console_count.update()
            except: pass

        def _set_filter(e):
            self._console_filter = e.control.value or "TODOS"

        def _set_search(e):
            self._console_search = e.control.value or ""

        dd_filter = ft.Dropdown(
            options=[ft.dropdown.Option(v) for v in
                     ["TODOS", "INFO", "WARNING", "ERROR"]],
            value="TODOS", on_change=_set_filter,
            bgcolor=PANEL, color=TEXT,
            border_color=BORDER, focused_border_color=AMBER,
            width=130, text_size=9,
        )
        search_field = ft.TextField(
            hint_text="Buscar...",
            on_change=_set_search,
            bgcolor=PANEL, color=TEXT,
            border_color=BORDER, focused_border_color=AMBER,
            width=180,
            text_style=ft.TextStyle(size=9),
        )

        content = ft.Column([
            _section_header("Consola en Vivo",
                            "Tail del archivo .log en tiempo real — todas las distribuidoras"),
            ft.Row([
                _btn("⏸  PAUSAR",  _toggle_pause, color=MUTED),
                _btn("🗑  LIMPIAR", _clear,        color=RED),
                ft.Container(width=10),
                ft.Text("Nivel:", color=MUTED, size=9),
                dd_filter,
                ft.Container(width=6),
                ft.Text("Buscar:", color=MUTED, size=9),
                search_field,
                ft.Container(expand=True),
                self._console_count,
            ], spacing=6, vertical_alignment=ft.CrossAxisAlignment.CENTER),
            ft.Container(
                content=self._console_lv,
                bgcolor=CONSOLE_BG,
                border=ft.border.all(1, BORDER),
                border_radius=8,
                padding=8,
                expand=True,
            ),
        ], spacing=10, expand=True)

        # No usar _wrap_section aquí — necesitamos que la lista expanda
        return ft.Container(
            content=content,
            expand=True, bgcolor=BG, visible=False,
            padding=ft.padding.only(left=24, right=24, top=20, bottom=20),
        )

    def _append_console(self, line: str) -> None:
        """Agrega una línea a la consola. Llamado desde el thread de tail."""
        if not line or self._console_paused:
            return
        f = self._console_filter
        if f != "TODOS" and f not in line:
            return
        s = self._console_search.strip().lower()
        if s and s not in line.lower():
            return

        color = CONSOLE_T
        if "ERROR"   in line: color = RED
        elif "WARNING" in line: color = AMBER
        elif "DEBUG"   in line: color = MUTED

        ctrl = ft.Text(line, color=color, size=8,
                       font_family="Courier New", selectable=True)

        lv = self._console_lv
        lv.controls.append(ctrl)
        if len(lv.controls) > MAX_LOG_LINES:
            lv.controls.pop(0)

        # Actualizar count
        n = len(lv.controls)
        if self._console_count:
            self._console_count.value = f"{n} líneas"

        try:
            lv.update()
            if self._console_count: self._console_count.update()
        except Exception:
            pass

    # ══════════════════════════════════════════════════════════════════════════
    # SECCIÓN: HISTORIAL DE LOGS
    # ══════════════════════════════════════════════════════════════════════════

    def _build_log_history(self) -> ft.Container:
        file_list = ft.ListView(expand=True, spacing=0)
        content_lv = ft.ListView(expand=True, spacing=0, item_extent=14)
        file_label = ft.Text("Seleccioná un archivo", color=MUTED, size=9)
        search_var: Dict = {"val": ""}
        raw_lines: List  = []

        def load_files():
            file_list.controls.clear()
            LOGS_DIR.mkdir(exist_ok=True)
            files = sorted(LOGS_DIR.glob("*.log"), reverse=True)
            for f in files:
                size = f.stat().st_size
                item = ft.Container(
                    content=ft.Row([
                        ft.Text(f.name, color=TEXT, size=8,
                                font_family="Courier New", expand=True),
                        ft.Text(_fmt_size(size), color=MUTED, size=8),
                    ]),
                    bgcolor=PANEL, border_radius=4,
                    padding=ft.padding.symmetric(horizontal=10, vertical=6),
                    on_click=lambda e, fp=f: open_file(fp),
                    on_hover=lambda e, c=None: None,
                    margin=ft.margin.only(bottom=2),
                )
                file_list.controls.append(item)
            if not files:
                file_list.controls.append(
                    ft.Text("(sin archivos de log)", color=MUTED, size=9,
                            italic=True))
            try: file_list.update()
            except: pass

        def render_lines(lines):
            content_lv.controls.clear()
            term = search_var["val"].lower()
            for line in lines:
                color = CONSOLE_T
                if "ERROR" in line:   color = RED
                elif "WARNING" in line: color = AMBER
                if term and term in line.lower():
                    color = AMBER
                content_lv.controls.append(
                    ft.Text(line, color=color, size=8,
                            font_family="Courier New", selectable=True))
            try: content_lv.update()
            except: pass

        def open_file(fp: Path):
            nonlocal raw_lines
            file_label.value = str(fp)
            try:
                raw_lines = fp.read_text(encoding="utf-8",
                                         errors="replace").splitlines()
            except Exception as ex:
                raw_lines = [f"Error al leer: {ex}"]
            render_lines(raw_lines)
            try: file_label.update()
            except: pass

        def on_search(e):
            search_var["val"] = e.control.value or ""
            s = search_var["val"].lower()
            filtered = [l for l in raw_lines if s in l.lower()] if s else raw_lines
            render_lines(filtered)

        load_files()  # Cargar al construir

        left_panel = ft.Container(
            content=ft.Column([
                _lbl("ARCHIVOS .LOG", color=AMBER, size=9, bold=True),
                ft.Divider(color=BORDER, height=1),
                ft.Container(content=file_list, expand=True),
                _btn("↺ Actualizar", lambda e: load_files(), color=SAND),
            ], spacing=6, expand=True, tight=True),
            bgcolor=CARD, border=ft.border.all(1, BORDER),
            border_radius=8, padding=10, width=260,
        )

        search_field = ft.TextField(
            hint_text="Buscar en archivo...",
            on_change=on_search,
            bgcolor=PANEL, color=TEXT,
            border_color=BORDER, focused_border_color=AMBER,
            width=220, text_style=ft.TextStyle(size=9),
        )
        right_panel = ft.Container(
            content=ft.Column([
                ft.Row([
                    file_label,
                    ft.Container(expand=True),
                    ft.Text("Buscar:", color=MUTED, size=9),
                    search_field,
                ], vertical_alignment=ft.CrossAxisAlignment.CENTER),
                ft.Divider(color=BORDER, height=1),
                ft.Container(
                    content=content_lv,
                    bgcolor=CONSOLE_BG,
                    border=ft.border.all(1, BORDER),
                    border_radius=6,
                    padding=8,
                    expand=True,
                ),
            ], spacing=6, expand=True),
            expand=True,
        )

        content = ft.Column([
            _section_header("Historial de Logs", f"Archivos en: {LOGS_DIR}"),
            ft.Row([left_panel, right_panel],
                   spacing=12, expand=True,
                   vertical_alignment=ft.CrossAxisAlignment.START),
        ], spacing=10, expand=True)

        return ft.Container(
            content=content, expand=True, bgcolor=BG, visible=False,
            padding=ft.padding.only(left=24, right=24, top=20, bottom=20),
        )

    # ══════════════════════════════════════════════════════════════════════════
    # SECCIÓN: GESTIÓN DE BOTS
    # ══════════════════════════════════════════════════════════════════════════

    def _build_bots(self) -> ft.Container:
        rows_col = ft.Column(spacing=6)

        def build_rows():
            rows_col.controls.clear()
            for bp in self.bm.all():
                # Guardar refs para update en vivo
                st = ft.Text(f"{_si(bp.status)} {bp.status.upper()}",
                             color=_sc(bp.status), size=9,
                             weight=ft.FontWeight.BOLD, width=100)
                up = ft.Text(bp.uptime, color=TEXT, size=9, width=80)
                pi = ft.Text(bp.pid,    color=MUTED, size=9, width=70)
                rs = ft.Text(str(bp.restarts), color=MUTED, size=9, width=60)

                if bp.dist_id not in self._bot_refs:
                    self._bot_refs[bp.dist_id] = {}
                self._bot_refs[bp.dist_id].update(
                    {"status": st, "uptime": up, "pid": pi, "restarts": rs})

                row = ft.Container(
                    content=ft.Row([
                        ft.Text(str(bp.dist_id), color=MUTED, size=9, width=30),
                        ft.Text(bp.nombre, color=TEXT, size=9,
                                weight=ft.FontWeight.BOLD, width=180),
                        st, up, pi, rs,
                        ft.Row([
                            ft.IconButton(ft.icons.PLAY_ARROW,
                                          icon_color=GREEN, icon_size=16,
                                          tooltip="Iniciar",
                                          on_click=lambda e, b=bp: threading.Thread(
                                              target=b.start, daemon=True).start()),
                            ft.IconButton(ft.icons.STOP,
                                          icon_color=RED, icon_size=16,
                                          tooltip="Detener",
                                          on_click=lambda e, b=bp: b.stop()),
                            ft.IconButton(ft.icons.REFRESH,
                                          icon_color=AMBER, icon_size=16,
                                          tooltip="Reiniciar",
                                          on_click=lambda e, b=bp: threading.Thread(
                                              target=b.restart, daemon=True).start()),
                        ], spacing=0),
                    ], spacing=8, vertical_alignment=ft.CrossAxisAlignment.CENTER),
                    bgcolor=CARD,
                    border=ft.border.all(1, BORDER),
                    border_radius=6,
                    padding=ft.padding.symmetric(horizontal=12, vertical=8),
                )
                rows_col.controls.append(row)

            if not rows_col.controls:
                rows_col.controls.append(
                    ft.Text("Sin bots — agregá distribuidoras primero.",
                            color=MUTED, size=10, italic=True))
            try: rows_col.update()
            except: pass

        build_rows()

        # Header de tabla
        header = ft.Container(
            content=ft.Row([
                ft.Text("ID",       color=MUTED, size=8, width=30),
                ft.Text("Nombre",   color=MUTED, size=8, width=180),
                ft.Text("Estado",   color=MUTED, size=8, width=100),
                ft.Text("Uptime",   color=MUTED, size=8, width=80),
                ft.Text("PID",      color=MUTED, size=8, width=70),
                ft.Text("Reinic.",  color=MUTED, size=8, width=60),
                ft.Text("Control",  color=MUTED, size=8),
            ], spacing=8),
            bgcolor=PANEL, border_radius=6,
            padding=ft.padding.symmetric(horizontal=12, vertical=6),
        )

        content = ft.Column([
            _section_header("Gestión de Bots",
                            "Control individual de cada bot de Telegram"),
            ft.Row([
                _btn("▶  INICIAR TODOS",
                     lambda e: threading.Thread(
                         target=self.bm.start_all, daemon=True).start(),
                     color=GREEN),
                _btn("■  DETENER TODOS",
                     lambda e: self._confirm_stop_all(),
                     color=RED),
                _btn("↺  REFRESH DB",
                     lambda e: (self.bm.refresh(), build_rows()),
                     color=SAND),
            ], spacing=8),
            header,
            rows_col,
        ], spacing=10, expand=True)

        return _wrap_section(content)

    # ══════════════════════════════════════════════════════════════════════════
    # SECCIÓN: DISTRIBUIDORAS
    # ══════════════════════════════════════════════════════════════════════════

    def _build_distribuidoras(self) -> ft.Container:
        table_col = ft.Column(spacing=4)

        fields = {
            "nombre": ft.TextField(label="Nombre empresa *", bgcolor=PANEL,
                                   color=TEXT, border_color=BORDER,
                                   focused_border_color=AMBER,
                                   text_style=ft.TextStyle(size=10)),
            "token":  ft.TextField(label="Token bot *", bgcolor=PANEL,
                                   color=TEXT, border_color=BORDER,
                                   focused_border_color=AMBER,
                                   text_style=ft.TextStyle(size=10)),
            "drive":  ft.TextField(label="ID carpeta Drive *", bgcolor=PANEL,
                                   color=TEXT, border_color=BORDER,
                                   focused_border_color=AMBER,
                                   text_style=ft.TextStyle(size=10)),
            "admin_id": ft.TextField(label="Admin Telegram ID", bgcolor=PANEL,
                                     color=TEXT, border_color=BORDER,
                                     focused_border_color=AMBER,
                                     text_style=ft.TextStyle(size=10)),
        }
        estado_dd = ft.Dropdown(
            options=[ft.dropdown.Option("activo"), ft.dropdown.Option("inactivo")],
            value="activo",
            bgcolor=PANEL, color=TEXT,
            border_color=BORDER, focused_border_color=AMBER,
            width=160, text_size=10,
        )
        form_title = ft.Text("NUEVA DISTRIBUIDORA", color=AMBER, size=10,
                             weight=ft.FontWeight.BOLD)
        edit_id: Dict = {"val": None}

        def load_table():
            table_col.controls.clear()
            # Header
            table_col.controls.append(ft.Container(
                content=ft.Row([
                    ft.Text("ID",       color=MUTED, size=8, width=40),
                    ft.Text("Nombre",   color=MUTED, size=8, width=180),
                    ft.Text("Estado",   color=MUTED, size=8, width=80),
                    ft.Text("Admin ID", color=MUTED, size=8, width=120),
                    ft.Text("Carpeta Drive", color=MUTED, size=8, expand=True),
                    ft.Text("Acciones", color=MUTED, size=8, width=140),
                ], spacing=8),
                bgcolor=PANEL, border_radius=6,
                padding=ft.padding.symmetric(horizontal=12, vertical=6),
            ))
            for d in DB.get_distribuidoras():
                c = GREEN if d["estado"] == "activo" else MUTED
                row = ft.Container(
                    content=ft.Row([
                        ft.Text(str(d["id"]), color=MUTED, size=9, width=40),
                        ft.Text(d["nombre"], color=TEXT, size=9,
                                weight=ft.FontWeight.BOLD, width=180),
                        ft.Text(d["estado"], color=c, size=9, width=80),
                        ft.Text(str(d.get("admin_id") or "—"),
                                color=MUTED, size=9, width=120),
                        ft.Text(str(d.get("drive") or "—"),
                                color=MUTED, size=8, expand=True, overflow=ft.TextOverflow.ELLIPSIS),
                        ft.Row([
                            ft.TextButton("Editar",
                                on_click=lambda e, dd=d: load_edit(dd),
                                style=ft.ButtonStyle(color=SAND)),
                            ft.TextButton(
                                "Desactivar" if d["estado"] == "activo" else "Activar",
                                on_click=lambda e, dd=d: toggle(dd),
                                style=ft.ButtonStyle(
                                    color=RED if d["estado"] == "activo" else GREEN)),
                        ], spacing=0, width=140),
                    ], spacing=8, vertical_alignment=ft.CrossAxisAlignment.CENTER),
                    bgcolor=CARD, border=ft.border.all(1, BORDER),
                    border_radius=6,
                    padding=ft.padding.symmetric(horizontal=12, vertical=8),
                )
                table_col.controls.append(row)
            try: table_col.update()
            except: pass

        def clear_form():
            for f in fields.values(): f.value = ""
            estado_dd.value = "activo"
            edit_id["val"]  = None
            form_title.value = "NUEVA DISTRIBUIDORA"
            try:
                for f in fields.values(): f.update()
                estado_dd.update(); form_title.update()
            except: pass

        def load_edit(d: Dict):
            fields["nombre"].value   = d["nombre"] or ""
            fields["token"].value    = d["token_bot"] or ""
            fields["drive"].value    = d.get("drive") or ""
            fields["admin_id"].value = str(d.get("admin_id") or "")
            estado_dd.value          = d["estado"] or "activo"
            edit_id["val"]           = d["id"]
            form_title.value         = f"EDITANDO: {d['nombre']} (ID {d['id']})"
            try:
                for f in fields.values(): f.update()
                estado_dd.update(); form_title.update()
            except: pass

        def toggle(d: Dict):
            nuevo = "inactivo" if d["estado"] == "activo" else "activo"
            DB.toggle_estado(d["id"], nuevo)
            self.bm.refresh()
            load_table()

        def save(e):
            n = fields["nombre"].value.strip()
            t = fields["token"].value.strip()
            dr = fields["drive"].value.strip()
            if not n or not t or not dr:
                show_snack("⚠️ Nombre, token y carpeta Drive son obligatorios.", RED)
                return
            try:
                DB.upsert({
                    "id":      edit_id["val"],
                    "nombre":  n,
                    "token":   t,
                    "drive":   dr,
                    "admin_id": fields["admin_id"].value.strip() or None,
                    "estado":  estado_dd.value,
                })
                show_snack(f"✅ '{n}' guardada correctamente.", GREEN)
                clear_form()
                self.bm.refresh()
                load_table()
            except Exception as ex:
                show_snack(f"❌ Error: {ex}", RED)

        def show_snack(msg: str, color: str):
            self.page.snack_bar = ft.SnackBar(
                ft.Text(msg, color=TEXT), bgcolor=CARD, open=True)
            try: self.page.update()
            except: pass

        load_table()

        form_card = _card(
            form_title,
            ft.Divider(color=BORDER, height=1),
            ft.Row([fields["nombre"], fields["token"]], spacing=10),
            ft.Row([fields["drive"], fields["admin_id"]], spacing=10),
            ft.Row([
                ft.Text("Estado:", color=MUTED, size=9),
                estado_dd,
                ft.Container(expand=True),
                _btn("✕  Limpiar", lambda e: clear_form(), color=MUTED),
                _btn("✓  GUARDAR", save, color=TEXT, bgcolor=GREEN),
            ], spacing=8, vertical_alignment=ft.CrossAxisAlignment.CENTER),
        )

        content = ft.Column([
            _section_header("Distribuidoras",
                            "Alta, baja y modificación en la base de datos"),
            table_col,
            ft.Container(height=4),
            form_card,
        ], spacing=10, expand=True)

        return _wrap_section(content)

    # ══════════════════════════════════════════════════════════════════════════
    # SECCIÓN: BACKUPS
    # ══════════════════════════════════════════════════════════════════════════

    def _build_backups(self) -> ft.Container:
        bak_col   = ft.Column(spacing=4)
        stats_lbl = ft.Text("", color=MUTED, size=9)
        db_lbl    = ft.Text("", color=SAND, size=9)

        def _db_size() -> str:
            if not DB_PATH.exists(): return "no encontrada"
            return _fmt_size(DB_PATH.stat().st_size)

        def load_list():
            bak_col.controls.clear()
            BAK_DIR.mkdir(exist_ok=True)
            files = sorted(BAK_DIR.iterdir(), reverse=True)
            bak_files = [f for f in files if f.suffix in (".db", ".zip")]
            total = sum(f.stat().st_size for f in bak_files)
            stats_lbl.value = (
                f"{len(bak_files)} archivos  ·  Total: {_fmt_size(total)}"
            )
            db_lbl.value = f"DB actual: {_db_size()}"

            # Header
            bak_col.controls.append(ft.Container(
                content=ft.Row([
                    ft.Text("Archivo",    color=MUTED, size=8, expand=True),
                    ft.Text("Tamaño",     color=MUTED, size=8, width=80),
                    ft.Text("Fecha",      color=MUTED, size=8, width=140),
                    ft.Text("Tipo",       color=MUTED, size=8, width=70),
                    ft.Text("Acción",     color=MUTED, size=8, width=80),
                ], spacing=8),
                bgcolor=PANEL, border_radius=6,
                padding=ft.padding.symmetric(horizontal=12, vertical=6),
            ))

            for f in bak_files:
                mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=AR_TZ)
                tipo  = "ZIP pack" if f.suffix == ".zip" else "DB copia"
                color = SAND if f.suffix == ".zip" else CONSOLE_T
                row   = ft.Container(
                    content=ft.Row([
                        ft.Text(f.name, color=color, size=8,
                                font_family="Courier New", expand=True,
                                overflow=ft.TextOverflow.ELLIPSIS),
                        ft.Text(_fmt_size(f.stat().st_size),
                                color=MUTED, size=8, width=80),
                        ft.Text(mtime.strftime("%d/%m/%Y %H:%M"),
                                color=MUTED, size=8, width=140),
                        ft.Text(tipo, color=MUTED, size=8, width=70),
                        ft.TextButton(
                            "Borrar",
                            on_click=lambda e, fp=f: delete_bak(fp),
                            style=ft.ButtonStyle(color=RED),
                        ),
                    ], spacing=8, vertical_alignment=ft.CrossAxisAlignment.CENTER),
                    bgcolor=CARD, border=ft.border.all(1, BORDER),
                    border_radius=6,
                    padding=ft.padding.symmetric(horizontal=12, vertical=7),
                )
                bak_col.controls.append(row)

            if len(bak_files) == 0:
                bak_col.controls.append(
                    ft.Text("Sin backups — hacé uno ahora.", color=MUTED,
                            size=10, italic=True))

            try: bak_col.update(); stats_lbl.update(); db_lbl.update()
            except: pass

        def do_backup(e):
            try:
                BAK_DIR.mkdir(exist_ok=True)
                ts  = datetime.now(AR_TZ).strftime("%Y-%m-%d_%H-%M")
                dst = BAK_DIR / f"centermind_{ts}.db"
                import sqlite3 as _sl
                conn = _sl.connect(str(DB_PATH))
                conn.execute(f"VACUUM INTO '{dst}'")
                conn.close()
                self.page.snack_bar = ft.SnackBar(
                    ft.Text(f"✅ Backup creado: {dst.name}  ({_fmt_size(dst.stat().st_size)})",
                            color=TEXT),
                    bgcolor=CARD, open=True)
                self.page.update()
                load_list()
            except Exception as ex:
                self.page.snack_bar = ft.SnackBar(
                    ft.Text(f"❌ Error: {ex}", color=RED), bgcolor=CARD, open=True)
                self.page.update()

        def delete_bak(fp: Path):
            try:
                fp.unlink()
                load_list()
            except Exception as ex:
                self.page.snack_bar = ft.SnackBar(
                    ft.Text(f"❌ Error: {ex}", color=RED), bgcolor=CARD, open=True)
                self.page.update()

        def open_folder(e):
            BAK_DIR.mkdir(exist_ok=True)
            if sys.platform == "win32":
                os.startfile(str(BAK_DIR))
            elif sys.platform == "darwin":
                subprocess.run(["open", str(BAK_DIR)])
            else:
                subprocess.run(["xdg-open", str(BAK_DIR)])

        load_list()

        content = ft.Column([
            _section_header("Gestión de Backups", f"Carpeta: {BAK_DIR}"),
            ft.Row([
                _btn("💾  BACKUP AHORA",  do_backup,    color=TEXT,  bgcolor=GREEN),
                _btn("↺  Actualizar",     lambda e: load_list(), color=SAND),
                _btn("📂  Abrir carpeta", open_folder,  color=MUTED),
                ft.Container(expand=True),
                ft.Column([stats_lbl, db_lbl], spacing=2,
                          horizontal_alignment=ft.CrossAxisAlignment.END),
            ], spacing=8, vertical_alignment=ft.CrossAxisAlignment.CENTER),
            bak_col,
        ], spacing=10, expand=True)

        return _wrap_section(content)

    # ══════════════════════════════════════════════════════════════════════════
    # BACKGROUND THREADS
    # ══════════════════════════════════════════════════════════════════════════

    def _refresh_loop(self) -> None:
        """Actualiza status de bots y Streamlit cada REFRESH_S segundos."""
        while self._running:
            time.sleep(REFRESH_S)
            if not self._running: break
            self._refresh_bot_statuses()
            self._refresh_sm_status()

    def _refresh_bot_statuses(self) -> None:
        changed = False
        for bp in self.bm.all():
            refs = self._bot_refs.get(bp.dist_id)
            if not refs: continue
            new_st = f"{_si(bp.status)} {bp.status.upper()}"
            if refs["status"].value != new_st:
                refs["status"].value = new_st
                refs["status"].color = _sc(bp.status)
                changed = True
            refs["uptime"].value   = bp.uptime
            refs["restarts"].value = str(bp.restarts)
        if changed:
            try: self.page.update()
            except: pass
        else:
            # Solo actualizar uptimes (no fuerza re-render completo)
            try:
                for refs in self._bot_refs.values():
                    refs["uptime"].update()
            except: pass

    def _refresh_sm_status(self) -> None:
        st = self.sm.status
        if not self._sm_refs: return
        self._sm_refs["icon"].value   = _si(st)
        self._sm_refs["icon"].color   = _sc(st)
        self._sm_refs["status"].value = st.upper()
        self._sm_refs["status"].color = _sc(st)
        self._sm_refs["uptime"].value = self.sm.uptime
        self._sm_refs["pid"].value    = self.sm.pid

        if self._sm_pill:
            self._sm_pill.value = st.upper()
            self._sm_pill.color = _sc(st)
        if self._sm_url_pill:
            self._sm_url_pill.value = self.sm.url if st == "running" else ""

        try:
            for c in self._sm_refs.values(): c.update()
            if self._sm_pill: self._sm_pill.update()
            if self._sm_url_pill: self._sm_url_pill.update()
        except: pass

    def _tail_logs(self) -> None:
        """
        FIX: La consola en vivo toma los logs directamente del archivo .log
        en lugar de interceptar el proceso Python — así funciona con cualquier
        subproceso (bot_worker, centermind_core, etc.).
        """
        while self._running:
            LOGS_DIR.mkdir(exist_ok=True)
            log_files = sorted(LOGS_DIR.glob("*.log"), reverse=True)
            if not log_files:
                time.sleep(1)
                continue

            log_file = log_files[0]
            try:
                with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                    # Cargar últimas 100 líneas al abrir
                    content = f.read()
                    last_lines = content.splitlines()[-100:]
                    for line in last_lines:
                        if line.strip():
                            self._append_console(line)

                    # Tail desde el final
                    while self._running:
                        line = f.readline()
                        if line:
                            self._append_console(line.rstrip())
                        else:
                            time.sleep(0.15)
                            # Verificar si hay un archivo más nuevo (rotación diaria)
                            new_files = sorted(LOGS_DIR.glob("*.log"), reverse=True)
                            if new_files and new_files[0] != log_file:
                                break  # Salir del inner loop, reabrir el nuevo archivo
            except Exception:
                time.sleep(2)

    # ─────────────────────────────────────────────────────────────────────────
    # CIERRE
    # ─────────────────────────────────────────────────────────────────────────

    def _on_window_event(self, e) -> None:
        if getattr(e, "data", None) == "close":
            self._running = False
            threading.Thread(target=self._shutdown, daemon=True).start()

    def _shutdown(self) -> None:
        self.bm.stop_all()
        self.sm.stop()
        try: self.page.window_close()
        except: pass


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def main(page: ft.Page) -> None:
    ShelfMindPanel(page)


if __name__ == "__main__":
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except AttributeError:
            pass

    ft.app(target=main)
