# -*- coding: utf-8 -*-
"""
ShelfMind — Panel Maestro v4 (tkinter)
========================================
Reescrito desde Flet a tkinter: estable, sin breaking API changes, live-tail trivial.

Auth:    Requiere _token.json en BASE_DIR (creado por setup__token.py).
Uso:     python panel_maestro.py
"""

from __future__ import annotations

import tkinter as tk
from tkinter import ttk, messagebox
import queue
import socket
import sqlite3
import subprocess
import sys
import os
import time
import threading
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
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
BG         = "#2A1E18"
PANEL      = "#321F16"
CARD       = "#3B2318"
BORDER     = "#5C3A28"
TEXT       = "#F0E6D8"
MUTED      = "#A68B72"
AMBER      = "#D9A76A"
SAND       = "#D9BD9C"
GREEN      = "#7DAF6B"
RED        = "#C0584A"
SIDEBAR_BG = "#211510"
SEL        = "#4A2E1E"
HOVER_BG   = "#3A2215"
CONSOLE_BG = "#180F0A"
CONSOLE_T  = "#C8B89A"

REFRESH_MS    = 2000
MAX_LOG_LINES = 1000

# ── Helpers de lógica ─────────────────────────────────────────────────────
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

def _get_local_ip() -> str:
    """Devuelve la IP de la red local (LAN/WiFi).
    Usa un UDP connect dummy a 8.8.8.8 — no envía datos reales,
    solo fuerza al OS a elegir la interfaz correcta."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


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
                    " id_carpeta_drive drive, admin_telegram_id _id, estado"
                    " FROM distribuidores ORDER BY nombre_empresa"
                ).fetchall()
            return [dict(r) for r in rows]
        except Exception as e:
            print(f"[ERROR DB] get_distribuidoras: {e}")
            return []

    @classmethod
    def upsert(cls, d: Dict) -> None:
        with cls._conn() as c:
            if d.get("id"):
                c.execute(
                    "UPDATE distribuidores SET nombre_empresa=?,token_bot=?,"
                    "id_carpeta_drive=?,admin_telegram_id=?,estado=? WHERE id_distribuidor=?",
                    (d["nombre"], d["token"], d["drive"], d["_id"], d["estado"], d["id"])
                )
            else:
                c.execute(
                    "INSERT INTO distribuidores(nombre_empresa,token_bot,"
                    "id_carpeta_drive,admin_telegram_id,estado) VALUES(?,?,?,?,?)",
                    (d["nombre"], d["token"], d["drive"], d["_id"], d["estado"])
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
                    " FROM exhibiciones WHERE id_distribuidor=?", (did,)
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
            "cwd":    str(BASE_DIR),
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

    def kill_all_bot_processes(self) -> int:
        """Detiene bots rastreados y mata procesos zombie de bot_worker."""
        self.stop_all()
        killed = 0
        try:
            import psutil
            for proc in psutil.process_iter(["pid", "name", "cmdline"]):
                try:
                    cmdline = " ".join(proc.info.get("cmdline") or []).lower()
                    name    = (proc.info.get("name") or "").lower()
                    if "bot_worker" in cmdline or "bot_worker" in name:
                        proc.kill(); killed += 1
                except Exception: pass
        except ImportError:
            if sys.platform == "win32":
                try:
                    r = subprocess.run(
                        ["wmic", "process", "where",
                         "CommandLine like '%bot_worker%'", "call", "terminate"],
                        capture_output=True, text=True, timeout=10)
                    killed = r.stdout.lower().count("successful")
                except Exception: pass
            else:
                try:
                    r = subprocess.run(["pkill", "-f", "bot_worker"],
                                       capture_output=True, timeout=5)
                    killed = 1 if r.returncode == 0 else 0
                except Exception: pass
        return killed


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
    def network_url(self) -> str:
        """URL accesible desde otros dispositivos en la misma red (móvil, etc.)."""
        return f"http://{_get_local_ip()}:{self._port}"

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
                 "--server.port", str(self._port), "--server.headless", "true",
                 "--server.address", "0.0.0.0", "--browser.gatherUsageStats", "false"],
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

    def open_browser(self) -> None:
        webbrowser.open(self.url)

    def set_port(self, p: int) -> None:
        self._port = int(p)


# ══════════════════════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════════════════════
def _check_auth() -> None:
    # Check for authorization token file; exit with error dialog if missing.
    token = BASE_DIR / "_token.json"
    if not token.exists():
        root = tk.Tk(); root.withdraw()
        messagebox.showerror(
            "ShelfMind — Acceso denegado",
            f"No se encontró el archivo de autorización:\n\n"
            f"  {token}\n\n"
            f"Para crear el acceso, ejecutá:\n"
            f"  python setup__token.py"
        )
        root.destroy(); sys.exit(1)



# ══════════════════════════════════════════════════════════════════════════════
# UI HELPERS
# ══════════════════════════════════════════════════════════════════════════════

class ScrollableFrame(tk.Frame):
    """Frame con canvas + scrollbar vertical — reemplaza la necesidad de scroll nativo."""
    def __init__(self, parent, bg_color: str = BG, **kw):
        super().__init__(parent, bg=bg_color, **kw)
        self._canvas = tk.Canvas(self, bg=bg_color, highlightthickness=0, bd=0)
        vsb = ttk.Scrollbar(self, orient="vertical", command=self._canvas.yview)
        self.inner = tk.Frame(self._canvas, bg=bg_color)
        self.inner.bind(
            "<Configure>",
            lambda e: self._canvas.configure(scrollregion=self._canvas.bbox("all"))
        )
        self._canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self._canvas.configure(yscrollcommand=vsb.set)
        vsb.pack(side="right", fill="y")
        self._canvas.pack(side="left", fill="both", expand=True)
        self._canvas.bind("<Enter>", self._bind_wheel)
        self._canvas.bind("<Leave>", self._unbind_wheel)

    def _bind_wheel(self, _):
        self._canvas.bind_all("<MouseWheel>", self._on_wheel)

    def _unbind_wheel(self, _):
        self._canvas.unbind_all("<MouseWheel>")

    def _on_wheel(self, e):
        self._canvas.yview_scroll(-1 * (e.delta // 120), "units")


def _btn(parent, text: str, cmd, fg: str = AMBER, bg: str = PANEL) -> tk.Button:
    b = tk.Button(
        parent, text=text, command=cmd,
        bg=bg, fg=fg,
        activebackground=HOVER_BG, activeforeground=TEXT,
        relief="flat", bd=0, padx=12, pady=6,
        font=("Segoe UI", 9), cursor="hand2",
    )
    b.bind("<Enter>", lambda e: b.config(bg=HOVER_BG))
    b.bind("<Leave>", lambda e: b.config(bg=bg))
    return b


def _lbl(parent, text: str, color: str = MUTED, size: int = 9,
         bold: bool = False, mono: bool = False, bg: str = BG) -> tk.Label:
    weight = "bold" if bold else "normal"
    fam    = "Courier New" if mono else "Segoe UI"
    return tk.Label(parent, text=text, fg=color, bg=bg, font=(fam, size, weight))


def _sep(parent, bg: str = BORDER) -> tk.Frame:
    """Separador horizontal delgado."""
    return tk.Frame(parent, bg=bg, height=1)


# ══════════════════════════════════════════════════════════════════════════════
# PANEL MAESTRO — CLASE PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════

class ShelfMindPanel:

    def __init__(self, root: tk.Tk):
        self.root  = root
        self.bm    = BotManager()
        self.sm    = StreamlitManager()
        self.bm.load()

        self._running         = True
        self._log_queue:  queue.Queue = queue.Queue()
        self._console_paused  = False
        self._console_filter  = "TODOS"
        self._console_search  = ""
        self._bot_row_refs:   Dict[int, Dict] = {}

        # Referencias a widgets de streamlit status
        self._sm_lbl_status:      Optional[tk.Label] = None
        self._sm_lbl_uptime:      Optional[tk.Label] = None
        self._sm_lbl_pid:         Optional[tk.Label] = None
        self._sm_lbl_url:         Optional[tk.Label] = None
        self._sm_lbl_network_url: Optional[tk.Label] = None
        self._sm_log_txt:         Optional[tk.Text]  = None

        # Console widget ref
        self._console_txt: Optional[tk.Text] = None
        self._console_count_lbl: Optional[tk.Label] = None

        self._setup_window()
        self._setup_style()
        self._build_layout()

        threading.Thread(target=self._tail_logs, daemon=True).start()
        self._after_refresh()
        self._drain_log_queue()

    # ─────────────────────────────────────────────────────────────────────
    # SETUP
    # ─────────────────────────────────────────────────────────────────────

    def _setup_window(self) -> None:
        self.root.title("ShelfMind · Panel Maestro")
        self.root.geometry("1340x860")
        self.root.minsize(1000, 640)
        self.root.configure(bg=BG)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _setup_style(self) -> None:
        s = ttk.Style()
        s.theme_use("clam")

        # Notebook
        s.configure("TNotebook",     background=SIDEBAR_BG, borderwidth=0, tabmargins=[2, 4, 0, 0])
        s.configure("TNotebook.Tab", background=PANEL, foreground=MUTED,
                    padding=[16, 8], font=("Segoe UI", 9))
        s.map("TNotebook.Tab",
              background=[("selected", SEL), ("active", HOVER_BG)],
              foreground=[("selected", AMBER), ("active", TEXT)])

        # Frames / Labels (ttk versions)
        s.configure("TFrame",  background=BG)
        s.configure("TLabel",  background=BG, foreground=TEXT, font=("Segoe UI", 9))

        # Treeview
        s.configure("Treeview",
                    background=CARD, foreground=TEXT, fieldbackground=CARD,
                    borderwidth=0, rowheight=26, font=("Segoe UI", 9))
        s.configure("Treeview.Heading",
                    background=PANEL, foreground=MUTED,
                    font=("Segoe UI", 8, "bold"), borderwidth=0, relief="flat")
        s.map("Treeview",
              background=[("selected", SEL)],
              foreground=[("selected", AMBER)])

        # Entry
        s.configure("TEntry", fieldbackground=PANEL, foreground=TEXT,
                    insertcolor=TEXT, borderwidth=1, relief="flat",
                    font=("Segoe UI", 9))

        # Combobox
        s.configure("TCombobox", fieldbackground=PANEL, foreground=TEXT,
                    background=PANEL, selectbackground=SEL, selectforeground=AMBER,
                    borderwidth=1, font=("Segoe UI", 9))
        s.map("TCombobox", fieldbackground=[("readonly", PANEL)])

        # Scrollbar
        s.configure("TScrollbar", background=PANEL, troughcolor=BG,
                    borderwidth=0, arrowcolor=MUTED)
        s.map("TScrollbar", background=[("active", HOVER_BG)])

        # Separator
        s.configure("TSeparator", background=BORDER)

    # ─────────────────────────────────────────────────────────────────────
    # LAYOUT
    # ─────────────────────────────────────────────────────────────────────

    def _build_layout(self) -> None:
        # Topbar
        topbar = tk.Frame(self.root, bg=SIDEBAR_BG, height=46)
        topbar.pack(side="top", fill="x")
        topbar.pack_propagate(False)

        tk.Label(topbar, text="SHELFMIND", fg=AMBER, bg=SIDEBAR_BG,
                 font=("Segoe UI", 13, "bold")).pack(side="left", padx=(20, 4))
        tk.Label(topbar, text="·  Panel Maestro", fg=MUTED, bg=SIDEBAR_BG,
                 font=("Segoe UI", 10)).pack(side="left")
        self._clock_lbl = tk.Label(topbar, text="", fg=MUTED, bg=SIDEBAR_BG,
                                   font=("Segoe UI", 8))
        self._clock_lbl.pack(side="right", padx=20)
        tk.Frame(topbar, bg=BORDER, height=1).pack(side="bottom", fill="x")

        # Notebook
        nb = ttk.Notebook(self.root)
        nb.pack(side="top", fill="both", expand=True)

        tabs = [
            ("🤖  Bots",          self._build_tab_bots),
            ("🌐  Streamlit",     self._build_tab_streamlit),
            ("📋  Consola",       self._build_tab_console),
            ("📁  Logs",          self._build_tab_logs),
            ("👥  Distribuidoras",self._build_tab_distribuidoras),
            ("💾  Backups",       self._build_tab_backups),
        ]
        for label, builder in tabs:
            frame = tk.Frame(nb, bg=BG)
            nb.add(frame, text=f"  {label}  ")
            builder(frame)

        self._update_clock()

    def _update_clock(self) -> None:
        self._clock_lbl.config(
            text=datetime.now(AR_TZ).strftime("%d/%m/%Y  %H:%M:%S  ARG"))
        self.root.after(1000, self._update_clock)

    # ══════════════════════════════════════════════════════════════════════
    # TAB: BOTS
    # ══════════════════════════════════════════════════════════════════════

    def _build_tab_bots(self, parent: tk.Frame) -> None:
        parent.configure(bg=BG)

        # ── Sección superior: header + toolbar ─────────────────────────
        top = tk.Frame(parent, bg=BG)
        top.pack(fill="x", padx=24, pady=(18, 0))

        tk.Label(top, text="Gestión de Bots", fg=AMBER, bg=BG,
                 font=("Segoe UI", 16, "bold")).pack(anchor="w")
        tk.Label(top, text="Estado en tiempo real · control individual de cada bot",
                 fg=MUTED, bg=BG, font=("Segoe UI", 8)).pack(anchor="w")
        _sep(parent).pack(fill="x", padx=24, pady=(6, 0))

        toolbar = tk.Frame(parent, bg=BG)
        toolbar.pack(fill="x", padx=24, pady=10)

        _btn(toolbar, "▶  INICIAR TODOS",
             lambda: threading.Thread(target=self.bm.start_all, daemon=True).start(),
             fg=GREEN).pack(side="left", padx=(0, 6))
        _btn(toolbar, "■  DETENER TODOS",
             self._confirm_stop_all, fg=RED).pack(side="left", padx=(0, 6))
        _btn(toolbar, "🔴  MATAR PROCESOS",
             self._confirm_kill_all, fg="#FF5555").pack(side="left", padx=(0, 6))
        _btn(toolbar, "↺  REFRESH DB",
             self._refresh_db_bots, fg=SAND).pack(side="left", padx=(0, 6))

        # ── Cabecera de columnas ────────────────────────────────────────
        header = tk.Frame(parent, bg=PANEL)
        header.pack(fill="x", padx=24, pady=(0, 2))
        for col, w in [("ID", 40), ("Nombre", 200), ("Estado", 110),
                        ("Uptime", 90), ("PID", 70), ("Reinic.", 60), ("Control", 120)]:
            tk.Label(header, text=col, fg=MUTED, bg=PANEL,
                     font=("Segoe UI", 8, "bold"), width=w//7,
                     anchor="w").pack(side="left", padx=(8, 0), pady=4)

        # ── Lista scrollable de bots ────────────────────────────────────
        sf = ScrollableFrame(parent, bg_color=BG)
        sf.pack(fill="both", expand=True, padx=24, pady=(0, 10))
        self._bots_inner = sf.inner

        self._rebuild_bot_rows()

    def _rebuild_bot_rows(self) -> None:
        """Reconstruye las filas de bots desde cero."""
        for w in self._bots_inner.winfo_children():
            w.destroy()
        self._bot_row_refs.clear()

        bots = self.bm.all()
        if not bots:
            tk.Label(self._bots_inner,
                     text="No hay distribuidoras en la base de datos.",
                     fg=MUTED, bg=BG, font=("Segoe UI", 10)).pack(pady=20)
            return

        for bp in bots:
            self._add_bot_row(bp)

    def _add_bot_row(self, bp: BotProcess) -> None:
        row = tk.Frame(self._bots_inner, bg=CARD, bd=0)
        row.pack(fill="x", pady=2)
        # Left border accent (color = status)
        accent = tk.Frame(row, bg=_sc(bp.status), width=3)
        accent.pack(side="left", fill="y")
        inner  = tk.Frame(row, bg=CARD)
        inner.pack(side="left", fill="x", expand=True, padx=(6, 0))

        # ID
        tk.Label(inner, text=str(bp.dist_id), fg=MUTED, bg=CARD,
                 font=("Segoe UI", 8), width=4, anchor="w").pack(side="left", padx=(0, 4))

        # Nombre
        tk.Label(inner, text=bp.nombre, fg=TEXT, bg=CARD,
                 font=("Segoe UI", 9, "bold"), width=22, anchor="w").pack(side="left", padx=(0, 4))

        # Status
        st_lbl = tk.Label(inner,
                          text=f"{_si(bp.status)} {bp.status.upper()}",
                          fg=_sc(bp.status), bg=CARD,
                          font=("Segoe UI", 9, "bold"), width=13, anchor="w")
        st_lbl.pack(side="left", padx=(0, 4))

        # Uptime
        up_lbl = tk.Label(inner, text=bp.uptime, fg=TEXT, bg=CARD,
                          font=("Courier New", 8), width=10, anchor="w")
        up_lbl.pack(side="left", padx=(0, 4))

        # PID
        pi_lbl = tk.Label(inner, text=bp.pid, fg=MUTED, bg=CARD,
                          font=("Courier New", 8), width=8, anchor="w")
        pi_lbl.pack(side="left", padx=(0, 4))

        # Reinic
        rs_lbl = tk.Label(inner, text=str(bp.restarts), fg=MUTED, bg=CARD,
                          font=("Segoe UI", 8), width=6, anchor="w")
        rs_lbl.pack(side="left", padx=(0, 4))

        # Botones de control
        ctrl = tk.Frame(inner, bg=CARD)
        ctrl.pack(side="left", pady=4)
        _btn(ctrl, "▶", lambda b=bp: threading.Thread(target=b.start, daemon=True).start(),
             fg=GREEN, bg=CARD).pack(side="left", padx=2)
        _btn(ctrl, "■", lambda b=bp: b.stop(),
             fg=RED, bg=CARD).pack(side="left", padx=2)
        _btn(ctrl, "↺", lambda b=bp: threading.Thread(target=b.restart, daemon=True).start(),
             fg=AMBER, bg=CARD).pack(side="left", padx=2)

        self._bot_row_refs[bp.dist_id] = {
            "status":   st_lbl,
            "uptime":   up_lbl,
            "pid":      pi_lbl,
            "restarts": rs_lbl,
            "accent":   accent,
        }

    def _refresh_db_bots(self) -> None:
        self.bm.refresh()
        self._rebuild_bot_rows()

    def _confirm_stop_all(self) -> None:
        if messagebox.askyesno("Confirmar", "¿Detener TODOS los bots?",
                               icon="warning", parent=self.root):
            threading.Thread(target=self.bm.stop_all, daemon=True).start()

    def _confirm_kill_all(self) -> None:
        if messagebox.askyesno(
            "⚠️  Matar todos los procesos",
            "Esto detendrá los bots rastreados Y terminará cualquier proceso zombie "
            "de bot_worker (Python o EXE) colgado en el sistema.\n\n¿Continuar?",
            icon="warning", parent=self.root
        ):
            def _run():
                killed = self.bm.kill_all_bot_processes()
                msg = (f"✅ {killed} proceso(s) terminado(s) a la fuerza."
                       if killed > 0 else
                       "✅ Todos los bots detenidos (sin zombies detectados).")
                self.root.after(0, lambda: messagebox.showinfo("Resultado", msg, parent=self.root))
            threading.Thread(target=_run, daemon=True).start()

    # ══════════════════════════════════════════════════════════════════════
    # TAB: STREAMLIT
    # ══════════════════════════════════════════════════════════════════════

    def _build_tab_streamlit(self, parent: tk.Frame) -> None:
        parent.configure(bg=BG)
        pad = dict(padx=24)

        tk.Frame(parent, bg=BG, height=18).pack()
        tk.Label(parent, text="Servidor Streamlit", fg=AMBER, bg=BG,
                 font=("Segoe UI", 16, "bold"), **pad).pack(anchor="w")
        tk.Label(parent, text="App web accesible por los distribuidores desde el navegador",
                 fg=MUTED, bg=BG, font=("Segoe UI", 8), **pad).pack(anchor="w")
        _sep(parent).pack(fill="x", padx=24, pady=(6, 10))

        # Status card
        sc = tk.Frame(parent, bg=CARD, bd=0)
        sc.pack(fill="x", padx=24, pady=(0, 10))
        tk.Frame(sc, bg=BORDER, height=1).pack(fill="x", side="bottom")

        row1 = tk.Frame(sc, bg=CARD)
        row1.pack(fill="x", padx=14, pady=(10, 4))

        self._sm_lbl_status = tk.Label(row1, text="○ DETENIDO", fg=MUTED, bg=CARD,
                                       font=("Segoe UI", 14, "bold"))
        self._sm_lbl_status.pack(side="left", padx=(0, 16))
        self._sm_lbl_url = tk.Label(row1, text=self.sm.url, fg=AMBER, bg=CARD,
                                    font=("Segoe UI", 9), cursor="hand2")
        self._sm_lbl_url.bind("<Button-1>", lambda e: self.sm.open_browser())
        self._sm_lbl_url.pack(side="left")

        # ── Fila red local (acceso desde móvil / otros dispositivos) ────
        row_net = tk.Frame(sc, bg=CARD)
        row_net.pack(fill="x", padx=14, pady=(0, 6))

        tk.Label(row_net, text="📱  Red local:", fg=MUTED, bg=CARD,
                 font=("Segoe UI", 8)).pack(side="left", padx=(0, 8))

        self._sm_lbl_network_url = tk.Label(
            row_net, text=self.sm.network_url,
            fg=SAND, bg=CARD, font=("Courier New", 9, "bold"), cursor="hand2"
        )
        self._sm_lbl_network_url.bind(
            "<Button-1>", lambda e: webbrowser.open(self.sm.network_url)
        )
        self._sm_lbl_network_url.pack(side="left", padx=(0, 12))

        def _copy_network_url() -> None:
            self.root.clipboard_clear()
            self.root.clipboard_append(self.sm.network_url)
            self._sm_log(f"📋 Copiado: {self.sm.network_url}")

        _btn(row_net, "📋 Copiar", _copy_network_url,
             fg=MUTED, bg=CARD).pack(side="left")

        tk.Label(row_net,
                 text="  ← compartí este link con tu móvil (misma red WiFi)",
                 fg=MUTED, bg=CARD, font=("Segoe UI", 7, "italic")
                 ).pack(side="left")

        row2 = tk.Frame(sc, bg=CARD)
        row2.pack(fill="x", padx=14, pady=(0, 10))
        for label_text, attr in [("Uptime", "_sm_lbl_uptime"), ("PID", "_sm_lbl_pid")]:
            tk.Label(row2, text=f"{label_text}:", fg=MUTED, bg=CARD,
                     font=("Segoe UI", 8)).pack(side="left", padx=(0, 4))
            lbl = tk.Label(row2, text="—", fg=TEXT, bg=CARD,
                           font=("Segoe UI", 8, "bold"))
            lbl.pack(side="left", padx=(0, 20))
            setattr(self, attr, lbl)

        # Botones
        btns = tk.Frame(parent, bg=BG)
        btns.pack(fill="x", padx=24, pady=(0, 10))
        _btn(btns, "▶  INICIAR",
             lambda: threading.Thread(
                 target=lambda: self._sm_log(self.sm.start()), daemon=True).start(),
             fg=GREEN).pack(side="left", padx=(0, 6))
        _btn(btns, "■  DETENER",
             lambda: self._sm_log(self.sm.stop()),
             fg=RED).pack(side="left", padx=(0, 6))
        _btn(btns, "↺  REINICIAR",
             lambda: threading.Thread(
                 target=lambda: self._sm_log(self.sm.restart()), daemon=True).start(),
             fg=AMBER).pack(side="left", padx=(0, 6))
        _btn(btns, "🌐  ABRIR NAVEGADOR",
             self.sm.open_browser, fg=SAND).pack(side="left", padx=(0, 6))

        # Config de puerto
        pc = tk.Frame(parent, bg=CARD)
        pc.pack(fill="x", padx=24, pady=(0, 10))
        inner_pc = tk.Frame(pc, bg=CARD)
        inner_pc.pack(padx=14, pady=10, anchor="w")
        tk.Label(inner_pc, text="Puerto:", fg=MUTED, bg=CARD,
                 font=("Segoe UI", 9)).pack(side="left", padx=(0, 8))
        self._port_var = tk.StringVar(value=str(self.sm._port))
        port_e = ttk.Entry(inner_pc, textvariable=self._port_var, width=8)
        port_e.pack(side="left", padx=(0, 8))
        _btn(inner_pc, "Aplicar", self._apply_port, fg=AMBER, bg=CARD).pack(side="left")
        tk.Label(inner_pc, text="  Reiniciá Streamlit para aplicar.",
                 fg=MUTED, bg=CARD, font=("Segoe UI", 8)).pack(side="left")

        # Log de acciones
        tk.Label(parent, text="REGISTRO DE ACCIONES", fg=AMBER, bg=BG,
                 font=("Segoe UI", 8, "bold"), padx=24).pack(anchor="w")
        log_fr = tk.Frame(parent, bg=CONSOLE_BG, bd=1, relief="flat")
        log_fr.pack(fill="x", padx=24, pady=(4, 0))
        self._sm_log_txt = tk.Text(log_fr, bg=CONSOLE_BG, fg=CONSOLE_T, height=7,
                                   font=("Courier New", 8), state="disabled",
                                   wrap="word", relief="flat", bd=0,
                                   insertbackground=CONSOLE_T)
        vsb = ttk.Scrollbar(log_fr, command=self._sm_log_txt.yview)
        self._sm_log_txt.config(yscrollcommand=vsb.set)
        vsb.pack(side="right", fill="y")
        self._sm_log_txt.pack(fill="x", padx=4, pady=4)

    def _apply_port(self) -> None:
        try:
            p = int(self._port_var.get())
            if not (1024 <= p <= 65535): raise ValueError()
            self.sm.set_port(p)
            if self._sm_lbl_url:         self._sm_lbl_url.config(text=self.sm.url)
            if self._sm_lbl_network_url: self._sm_lbl_network_url.config(text=self.sm.network_url)
            self._sm_log(f"Puerto actualizado a {p}.")
        except ValueError:
            self._sm_log("❌ Puerto inválido (1024-65535).")

    def _sm_log(self, msg: str) -> None:
        if not self._sm_log_txt: return
        ts = _now()
        self._sm_log_txt.config(state="normal")
        self._sm_log_txt.insert("end", f"[{ts}]  {msg}\n")
        self._sm_log_txt.see("end")
        self._sm_log_txt.config(state="disabled")

    # ══════════════════════════════════════════════════════════════════════
    # TAB: CONSOLA EN VIVO
    # ══════════════════════════════════════════════════════════════════════

    def _build_tab_console(self, parent: tk.Frame) -> None:
        parent.configure(bg=BG)

        tk.Frame(parent, bg=BG, height=18).pack()
        tk.Label(parent, text="Consola en Vivo", fg=AMBER, bg=BG,
                 font=("Segoe UI", 16, "bold"), padx=24).pack(anchor="w")
        tk.Label(parent, text="Tail del archivo .log en tiempo real",
                 fg=MUTED, bg=BG, font=("Segoe UI", 8), padx=24).pack(anchor="w")
        _sep(parent).pack(fill="x", padx=24, pady=(6, 10))

        # Toolbar
        ctrl = tk.Frame(parent, bg=BG)
        ctrl.pack(fill="x", padx=24, pady=(0, 8))

        self._pause_btn = _btn(ctrl, "⏸  PAUSAR", self._toggle_pause, fg=MUTED)
        self._pause_btn.pack(side="left", padx=(0, 6))
        _btn(ctrl, "🗑  LIMPIAR", self._clear_console, fg=RED).pack(side="left", padx=(0, 16))

        tk.Label(ctrl, text="Nivel:", fg=MUTED, bg=BG,
                 font=("Segoe UI", 9)).pack(side="left", padx=(0, 4))
        self._filter_var = tk.StringVar(value="TODOS")
        f_cb = ttk.Combobox(ctrl, textvariable=self._filter_var, width=10,
                            values=["TODOS", "INFO", "WARNING", "ERROR"],
                            state="readonly")
        f_cb.pack(side="left", padx=(0, 12))
        f_cb.bind("<<ComboboxSelected>>",
                  lambda e: setattr(self, "_console_filter", self._filter_var.get()))

        tk.Label(ctrl, text="Buscar:", fg=MUTED, bg=BG,
                 font=("Segoe UI", 9)).pack(side="left", padx=(0, 4))
        self._search_var = tk.StringVar()
        self._search_var.trace_add("write",
            lambda *a: setattr(self, "_console_search", self._search_var.get()))
        ttk.Entry(ctrl, textvariable=self._search_var, width=20).pack(side="left")

        self._console_count_lbl = tk.Label(ctrl, text="0 líneas", fg=MUTED, bg=BG,
                                           font=("Segoe UI", 8))
        self._console_count_lbl.pack(side="right")

        # Consola
        con_fr = tk.Frame(parent, bg=CONSOLE_BG)
        con_fr.pack(fill="both", expand=True, padx=24, pady=(0, 10))
        self._console_txt = tk.Text(
            con_fr, bg=CONSOLE_BG, fg=CONSOLE_T, wrap="none",
            font=("Courier New", 8), state="disabled", relief="flat", bd=0,
            insertbackground=CONSOLE_T
        )
        hsb = ttk.Scrollbar(con_fr, orient="horizontal",
                            command=self._console_txt.xview)
        vsb = ttk.Scrollbar(con_fr, orient="vertical",
                            command=self._console_txt.yview)
        self._console_txt.config(xscrollcommand=hsb.set, yscrollcommand=vsb.set)
        hsb.pack(side="bottom", fill="x")
        vsb.pack(side="right",  fill="y")
        self._console_txt.pack(fill="both", expand=True, padx=4, pady=4)

        # Tags de color
        self._console_txt.tag_config("ERROR",   foreground=RED)
        self._console_txt.tag_config("WARNING", foreground=AMBER)
        self._console_txt.tag_config("DEBUG",   foreground=MUTED)
        self._console_txt.tag_config("NORMAL",  foreground=CONSOLE_T)

    def _toggle_pause(self) -> None:
        self._console_paused = not self._console_paused
        if self._console_paused:
            self._pause_btn.config(text="▶  REANUDAR", fg=AMBER)
        else:
            self._pause_btn.config(text="⏸  PAUSAR", fg=MUTED)

    def _clear_console(self) -> None:
        if not self._console_txt: return
        self._console_txt.config(state="normal")
        self._console_txt.delete("1.0", "end")
        self._console_txt.config(state="disabled")
        if self._console_count_lbl:
            self._console_count_lbl.config(text="0 líneas")

    # ══════════════════════════════════════════════════════════════════════
    # TAB: HISTORIAL DE LOGS
    # ══════════════════════════════════════════════════════════════════════

    def _build_tab_logs(self, parent: tk.Frame) -> None:
        parent.configure(bg=BG)

        tk.Frame(parent, bg=BG, height=18).pack()
        tk.Label(parent, text="Historial de Logs", fg=AMBER, bg=BG,
                 font=("Segoe UI", 16, "bold"), padx=24).pack(anchor="w")
        tk.Label(parent, text=f"Archivos en: {LOGS_DIR}",
                 fg=MUTED, bg=BG, font=("Segoe UI", 8), padx=24).pack(anchor="w")
        _sep(parent).pack(fill="x", padx=24, pady=(6, 10))

        content = tk.Frame(parent, bg=BG)
        content.pack(fill="both", expand=True, padx=24, pady=(0, 10))

        # ── Panel izquierdo: lista de archivos ──────────────────────────
        left = tk.Frame(content, bg=CARD, width=220)
        left.pack(side="left", fill="y", padx=(0, 8))
        left.pack_propagate(False)

        tk.Label(left, text="ARCHIVOS .LOG", fg=AMBER, bg=CARD,
                 font=("Segoe UI", 8, "bold")).pack(anchor="w", padx=10, pady=(8, 0))
        tk.Frame(left, bg=BORDER, height=1).pack(fill="x", padx=10, pady=4)

        lb_fr = tk.Frame(left, bg=CARD)
        lb_fr.pack(fill="both", expand=True, padx=6)
        self._log_listbox = tk.Listbox(
            lb_fr, bg=CARD, fg=TEXT, selectbackground=SEL, selectforeground=AMBER,
            font=("Courier New", 8), relief="flat", bd=0, activestyle="none",
            highlightthickness=0
        )
        vsb_lb = ttk.Scrollbar(lb_fr, command=self._log_listbox.yview)
        self._log_listbox.config(yscrollcommand=vsb_lb.set)
        vsb_lb.pack(side="right", fill="y")
        self._log_listbox.pack(fill="both", expand=True)
        self._log_listbox.bind("<<ListboxSelect>>", self._on_log_file_select)
        self._log_files: List[Path] = []

        _btn(left, "↺ Actualizar", self._load_log_files,
             fg=SAND, bg=CARD).pack(pady=8, padx=10, fill="x")

        # ── Panel derecho: contenido del archivo ─────────────────────────
        right = tk.Frame(content, bg=BG)
        right.pack(side="left", fill="both", expand=True)

        top_r = tk.Frame(right, bg=BG)
        top_r.pack(fill="x", pady=(0, 4))
        self._log_file_lbl = tk.Label(top_r, text="Seleccioná un archivo",
                                      fg=MUTED, bg=BG, font=("Segoe UI", 8))
        self._log_file_lbl.pack(side="left")
        tk.Label(top_r, text="Buscar:", fg=MUTED, bg=BG,
                 font=("Segoe UI", 9)).pack(side="right", padx=(8, 0))
        self._log_search_var = tk.StringVar()
        self._log_raw_lines: List[str] = []
        search_e = ttk.Entry(top_r, textvariable=self._log_search_var, width=22)
        search_e.pack(side="right")
        self._log_search_var.trace_add("write", lambda *a: self._render_log_lines(
            [l for l in self._log_raw_lines
             if self._log_search_var.get().lower() in l.lower()]
            if self._log_search_var.get() else self._log_raw_lines
        ))

        txt_fr = tk.Frame(right, bg=CONSOLE_BG)
        txt_fr.pack(fill="both", expand=True)
        self._log_content_txt = tk.Text(
            txt_fr, bg=CONSOLE_BG, fg=CONSOLE_T, wrap="none",
            font=("Courier New", 8), state="disabled", relief="flat", bd=0
        )
        hsb_r = ttk.Scrollbar(txt_fr, orient="horizontal",
                               command=self._log_content_txt.xview)
        vsb_r = ttk.Scrollbar(txt_fr, orient="vertical",
                               command=self._log_content_txt.yview)
        self._log_content_txt.config(xscrollcommand=hsb_r.set, yscrollcommand=vsb_r.set)
        hsb_r.pack(side="bottom", fill="x")
        vsb_r.pack(side="right",  fill="y")
        self._log_content_txt.pack(fill="both", expand=True, padx=4, pady=4)
        self._log_content_txt.tag_config("ERROR",   foreground=RED)
        self._log_content_txt.tag_config("WARNING", foreground=AMBER)

        self._load_log_files()

    def _load_log_files(self) -> None:
        self._log_listbox.delete(0, "end")
        LOGS_DIR.mkdir(exist_ok=True)
        self._log_files = sorted(LOGS_DIR.glob("*.log"), reverse=True)
        for f in self._log_files:
            size = _fmt_size(f.stat().st_size)
            self._log_listbox.insert("end", f"  {f.name}  ({size})")
        if not self._log_files:
            self._log_listbox.insert("end", "  (sin archivos de log)")

    def _on_log_file_select(self, _) -> None:
        sel = self._log_listbox.curselection()
        if not sel or sel[0] >= len(self._log_files): return
        fp = self._log_files[sel[0]]
        self._log_file_lbl.config(text=str(fp))
        try:
            self._log_raw_lines = fp.read_text(encoding="utf-8",
                                               errors="replace").splitlines()
        except Exception as ex:
            self._log_raw_lines = [f"Error: {ex}"]
        self._render_log_lines(self._log_raw_lines)

    def _render_log_lines(self, lines: List[str]) -> None:
        t = self._log_content_txt
        t.config(state="normal")
        t.delete("1.0", "end")
        for line in lines:
            tag = "ERROR" if "ERROR" in line else "WARNING" if "WARNING" in line else ""
            t.insert("end", line + "\n", tag)
        t.see("end")
        t.config(state="disabled")

    # ══════════════════════════════════════════════════════════════════════
    # TAB: DISTRIBUIDORAS
    # ══════════════════════════════════════════════════════════════════════

    def _build_tab_distribuidoras(self, parent: tk.Frame) -> None:
        parent.configure(bg=BG)

        tk.Frame(parent, bg=BG, height=18).pack()
        tk.Label(parent, text="Distribuidoras", fg=AMBER, bg=BG,
                 font=("Segoe UI", 16, "bold"), padx=24).pack(anchor="w")
        tk.Label(parent, text="Alta, baja y modificación en la base de datos",
                 fg=MUTED, bg=BG, font=("Segoe UI", 8), padx=24).pack(anchor="w")
        _sep(parent).pack(fill="x", padx=24, pady=(6, 8))

        # ── Treeview ───────────────────────────────────────────────────
        tv_fr = tk.Frame(parent, bg=BG)
        tv_fr.pack(fill="x", padx=24, pady=(0, 8))

        cols = ("id", "nombre", "estado", "_id", "drive")
        self._dist_tv = ttk.Treeview(tv_fr, columns=cols, show="headings", height=8)
        for col, w, label in [
            ("id", 40, "ID"), ("nombre", 200, "Nombre"),
            ("estado", 80, "Estado"), ("_id", 120, " ID"),
            ("drive", 260, "Carpeta Drive")
        ]:
            self._dist_tv.heading(col, text=label)
            self._dist_tv.column(col, width=w, stretch=(col == "drive"))

        vsb_tv = ttk.Scrollbar(tv_fr, command=self._dist_tv.yview)
        self._dist_tv.config(yscrollcommand=vsb_tv.set)
        vsb_tv.pack(side="right", fill="y")
        self._dist_tv.pack(fill="x")
        self._dist_tv.bind("<<TreeviewSelect>>", self._on_dist_select)
        self._dist_tv.bind("<Double-1>", self._on_dist_dblclick)

        # Botones de tabla
        tv_btns = tk.Frame(parent, bg=BG)
        tv_btns.pack(fill="x", padx=24, pady=(0, 8))
        _btn(tv_btns, "↺ Actualizar tabla",
             self._load_dist_table, fg=SAND).pack(side="left", padx=(0, 6))
        self._toggle_btn = _btn(tv_btns, "Activar / Desactivar",
                                self._toggle_dist_estado, fg=MUTED)
        self._toggle_btn.pack(side="left", padx=(0, 6))

        # ── Formulario ─────────────────────────────────────────────────
        form = tk.Frame(parent, bg=CARD)
        form.pack(fill="x", padx=24, pady=(0, 10))
        inner_f = tk.Frame(form, bg=CARD)
        inner_f.pack(fill="x", padx=14, pady=12)

        self._dist_form_title = tk.Label(inner_f, text="NUEVA DISTRIBUIDORA",
                                         fg=AMBER, bg=CARD,
                                         font=("Segoe UI", 9, "bold"))
        self._dist_form_title.pack(anchor="w")
        tk.Frame(inner_f, bg=BORDER, height=1).pack(fill="x", pady=6)

        row1 = tk.Frame(inner_f, bg=CARD); row1.pack(fill="x", pady=2)
        row2 = tk.Frame(inner_f, bg=CARD); row2.pack(fill="x", pady=2)
        row3 = tk.Frame(inner_f, bg=CARD); row3.pack(fill="x", pady=2)

        self._dist_fields: Dict[str, ttk.Entry] = {}
        self._dist_edit_id: Optional[int] = None

        for field, label, row in [
            ("nombre",   "Nombre empresa *", row1),
            ("token",    "Token bot *",       row1),
            ("drive",    "ID carpeta Drive *", row2),
            ("_id", " Telegram ID",  row2),
        ]:
            tk.Label(row, text=label, fg=MUTED, bg=CARD,
                     font=("Segoe UI", 8)).pack(side="left", padx=(0, 4))
            e = ttk.Entry(row, width=28)
            e.pack(side="left", padx=(0, 14))
            self._dist_fields[field] = e

        # Estado + botones
        tk.Label(row3, text="Estado:", fg=MUTED, bg=CARD,
                 font=("Segoe UI", 8)).pack(side="left", padx=(0, 4))
        self._estado_var = tk.StringVar(value="activo")
        ttk.Combobox(row3, textvariable=self._estado_var,
                     values=["activo", "inactivo"], state="readonly",
                     width=14).pack(side="left", padx=(0, 14))
        _btn(row3, "✕  Limpiar", self._clear_dist_form,
             fg=MUTED, bg=CARD).pack(side="right", padx=(6, 0))
        _btn(row3, "✓  GUARDAR", self._save_dist,
             fg=TEXT, bg=GREEN).pack(side="right")

        self._load_dist_table()

    def _load_dist_table(self) -> None:
        for item in self._dist_tv.get_children():
            self._dist_tv.delete(item)
        for d in DB.get_distribuidoras():
            color = "green" if d["estado"] == "activo" else "muted"
            self._dist_tv.insert("", "end", iid=str(d["id"]),
                                 values=(d["id"], d["nombre"], d["estado"],
                                         d.get("_id") or "—",
                                         d.get("drive") or "—"))

    def _on_dist_select(self, _) -> None: pass
    def _on_dist_dblclick(self, _) -> None:
        sel = self._dist_tv.selection()
        if not sel: return
        did = int(sel[0])
        rows = [d for d in DB.get_distribuidoras() if d["id"] == did]
        if not rows: return
        d = rows[0]
        self._dist_fields["nombre"].delete(0, "end");   self._dist_fields["nombre"].insert(0, d["nombre"] or "")
        self._dist_fields["token"].delete(0, "end");    self._dist_fields["token"].insert(0, d["token_bot"] or "")
        self._dist_fields["drive"].delete(0, "end");    self._dist_fields["drive"].insert(0, d.get("drive") or "")
        self._dist_fields["_id"].delete(0, "end"); self._dist_fields["_id"].insert(0, str(d.get("_id") or ""))
        self._estado_var.set(d["estado"] or "activo")
        self._dist_edit_id = did
        self._dist_form_title.config(text=f"EDITANDO: {d['nombre']} (ID {did})")

    def _toggle_dist_estado(self) -> None:
        sel = self._dist_tv.selection()
        if not sel:
            messagebox.showwarning("Aviso", "Seleccioná una distribuidora primero.",
                                   parent=self.root); return
        did   = int(sel[0])
        rows  = [d for d in DB.get_distribuidoras() if d["id"] == did]
        if not rows: return
        nuevo = "inactivo" if rows[0]["estado"] == "activo" else "activo"
        DB.toggle_estado(did, nuevo)
        self.bm.refresh()
        self._load_dist_table()

    def _save_dist(self) -> None:
        n  = self._dist_fields["nombre"].get().strip()
        t  = self._dist_fields["token"].get().strip()
        dr = self._dist_fields["drive"].get().strip()
        if not n or not t or not dr:
            messagebox.showwarning("Validación",
                                   "Nombre, token y carpeta Drive son obligatorios.",
                                   parent=self.root); return
        try:
            DB.upsert({
                "id":       self._dist_edit_id,
                "nombre":   n, "token": t, "drive": dr,
                "_id": self._dist_fields["_id"].get().strip() or None,
                "estado":   self._estado_var.get(),
            })
            messagebox.showinfo("✅ Guardado",
                                f"'{n}' guardada correctamente.", parent=self.root)
            self._clear_dist_form()
            self.bm.refresh()
            self._load_dist_table()
        except Exception as ex:
            messagebox.showerror("Error", str(ex), parent=self.root)

    def _clear_dist_form(self) -> None:
        for e in self._dist_fields.values(): e.delete(0, "end")
        self._estado_var.set("activo")
        self._dist_edit_id = None
        self._dist_form_title.config(text="NUEVA DISTRIBUIDORA")

    # ══════════════════════════════════════════════════════════════════════
    # TAB: BACKUPS
    # ══════════════════════════════════════════════════════════════════════

    def _build_tab_backups(self, parent: tk.Frame) -> None:
        parent.configure(bg=BG)

        tk.Frame(parent, bg=BG, height=18).pack()
        tk.Label(parent, text="Gestión de Backups", fg=AMBER, bg=BG,
                 font=("Segoe UI", 16, "bold"), padx=24).pack(anchor="w")
        self._bak_stats_lbl = tk.Label(parent, text="", fg=MUTED, bg=BG,
                                       font=("Segoe UI", 8), padx=24)
        self._bak_stats_lbl.pack(anchor="w")
        _sep(parent).pack(fill="x", padx=24, pady=(6, 8))

        # Toolbar
        btns = tk.Frame(parent, bg=BG)
        btns.pack(fill="x", padx=24, pady=(0, 8))
        _btn(btns, "💾  BACKUP AHORA", self._do_backup, fg=TEXT, bg=GREEN).pack(side="left", padx=(0, 6))
        _btn(btns, "↺  Actualizar",   self._load_bak_table, fg=SAND).pack(side="left", padx=(0, 6))
        _btn(btns, "📂  Abrir carpeta",self._open_bak_folder, fg=MUTED).pack(side="left", padx=(0, 6))
        _btn(btns, "🗑  Borrar seleccionado",
             self._delete_bak, fg=RED).pack(side="right")

        # Treeview
        tv_fr = tk.Frame(parent, bg=BG)
        tv_fr.pack(fill="both", expand=True, padx=24, pady=(0, 10))
        cols = ("archivo", "tamano", "fecha", "tipo")
        self._bak_tv = ttk.Treeview(tv_fr, columns=cols, show="headings")
        for col, w, label in [("archivo", 300, "Archivo"), ("tamano", 80, "Tamaño"),
                               ("fecha", 140, "Fecha"), ("tipo", 80, "Tipo")]:
            self._bak_tv.heading(col, text=label)
            self._bak_tv.column(col, width=w, stretch=(col == "archivo"))
        vsb_bak = ttk.Scrollbar(tv_fr, command=self._bak_tv.yview)
        self._bak_tv.config(yscrollcommand=vsb_bak.set)
        vsb_bak.pack(side="right", fill="y")
        self._bak_tv.pack(fill="both", expand=True)

        self._load_bak_table()

    def _load_bak_table(self) -> None:
        for item in self._bak_tv.get_children():
            self._bak_tv.delete(item)
        BAK_DIR.mkdir(exist_ok=True)
        files = sorted(BAK_DIR.iterdir(), reverse=True)
        baks  = [f for f in files if f.suffix in (".db", ".zip")]
        total = sum(f.stat().st_size for f in baks)
        self._bak_stats_lbl.config(
            text=f"Carpeta: {BAK_DIR}  ·  {len(baks)} archivos  ·  {_fmt_size(total)}")
        from datetime import timezone
        for f in baks:
            mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=AR_TZ)
            tipo  = "ZIP pack" if f.suffix == ".zip" else "DB copia"
            self._bak_tv.insert("", "end", iid=str(f),
                                values=(f.name, _fmt_size(f.stat().st_size),
                                        mtime.strftime("%d/%m/%Y %H:%M"), tipo))
        if not baks:
            self._bak_tv.insert("", "end", values=("(sin backups)", "", "", ""))

    def _do_backup(self) -> None:
        try:
            BAK_DIR.mkdir(exist_ok=True)
            ts  = datetime.now(AR_TZ).strftime("%Y-%m-%d_%H-%M")
            dst = BAK_DIR / f"centermind_{ts}.db"
            import sqlite3 as _sl
            conn = _sl.connect(str(DB_PATH))
            conn.execute(f"VACUUM INTO '{dst}'")
            conn.close()
            messagebox.showinfo("✅ Backup",
                                f"Backup creado:\n{dst.name}  ({_fmt_size(dst.stat().st_size)})",
                                parent=self.root)
            self._load_bak_table()
        except Exception as ex:
            messagebox.showerror("Error", str(ex), parent=self.root)

    def _delete_bak(self) -> None:
        sel = self._bak_tv.selection()
        if not sel:
            messagebox.showwarning("Aviso", "Seleccioná un archivo primero.",
                                   parent=self.root); return
        fp = Path(sel[0])
        if not messagebox.askyesno("Confirmar",
                                   f"¿Eliminar '{fp.name}'?",
                                   icon="warning", parent=self.root): return
        try:
            fp.unlink()
            self._load_bak_table()
        except Exception as ex:
            messagebox.showerror("Error", str(ex), parent=self.root)

    def _open_bak_folder(self) -> None:
        BAK_DIR.mkdir(exist_ok=True)
        if sys.platform == "win32":
            os.startfile(str(BAK_DIR))
        elif sys.platform == "darwin":
            subprocess.run(["open", str(BAK_DIR)])
        else:
            subprocess.run(["xdg-open", str(BAK_DIR)])

    # ══════════════════════════════════════════════════════════════════════
    # LIVE REFRESH (after loops — solo en el hilo principal de tk)
    # ══════════════════════════════════════════════════════════════════════

    def _after_refresh(self) -> None:
        """Actualiza status de bots y Streamlit cada REFRESH_MS ms."""
        if not self._running: return
        self._refresh_bot_rows()
        self._refresh_sm_status()
        self.root.after(REFRESH_MS, self._after_refresh)

    def _refresh_bot_rows(self) -> None:
        for bp in self.bm.all():
            refs = self._bot_row_refs.get(bp.dist_id)
            if not refs: continue
            color = _sc(bp.status)
            refs["status"].config(text=f"{_si(bp.status)} {bp.status.upper()}", fg=color)
            refs["uptime"].config(text=bp.uptime)
            refs["pid"].config(text=bp.pid)
            refs["restarts"].config(text=str(bp.restarts))
            refs["accent"].config(bg=color)

    def _refresh_sm_status(self) -> None:
        st = self.sm.status
        if self._sm_lbl_status:
            self._sm_lbl_status.config(text=f"{_si(st)} {st.upper()}", fg=_sc(st))
        if self._sm_lbl_uptime:
            self._sm_lbl_uptime.config(text=self.sm.uptime)
        if self._sm_lbl_pid:
            self._sm_lbl_pid.config(text=self.sm.pid)

    # ══════════════════════════════════════════════════════════════════════
    # LOG TAIL (background thread → queue → main thread)
    # ══════════════════════════════════════════════════════════════════════

    def _tail_logs(self) -> None:
        while self._running:
            LOGS_DIR.mkdir(exist_ok=True)
            log_files = sorted(LOGS_DIR.glob("*.log"), reverse=True)
            if not log_files:
                time.sleep(1); continue
            log_file = log_files[0]
            try:
                with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                    content   = f.read()
                    last_100  = content.splitlines()[-100:]
                    for line in last_100:
                        if line.strip(): self._log_queue.put(line)
                    while self._running:
                        line = f.readline()
                        if line:
                            self._log_queue.put(line.rstrip())
                        else:
                            time.sleep(0.15)
                            new_files = sorted(LOGS_DIR.glob("*.log"), reverse=True)
                            if new_files and new_files[0] != log_file: break
            except Exception:
                time.sleep(2)

    def _drain_log_queue(self) -> None:
        """Drena hasta 50 líneas por tick desde la cola y las agrega a la consola."""
        if not self._running: return
        count = 0
        while not self._log_queue.empty() and count < 50:
            try:
                line = self._log_queue.get_nowait()
                self._append_console(line)
                count += 1
            except queue.Empty:
                break
        self.root.after(100, self._drain_log_queue)

    def _append_console(self, line: str) -> None:
        if not line or self._console_paused or not self._console_txt: return
        f = self._console_filter
        if f != "TODOS" and f not in line: return
        s = self._console_search.strip().lower()
        if s and s not in line.lower(): return

        tag = "NORMAL"
        if "ERROR"   in line: tag = "ERROR"
        elif "WARNING" in line: tag = "WARNING"
        elif "DEBUG"   in line: tag = "DEBUG"

        t = self._console_txt
        t.config(state="normal")
        t.insert("end", line + "\n", tag)
        # Limitar líneas
        lines = int(t.index("end-1c").split(".")[0])
        if lines > MAX_LOG_LINES:
            t.delete("1.0", f"{lines - MAX_LOG_LINES}.0")
        t.see("end")
        t.config(state="disabled")

        if self._console_count_lbl:
            n = int(self._console_txt.index("end-1c").split(".")[0])
            self._console_count_lbl.config(text=f"{n} líneas")

    # ─────────────────────────────────────────────────────────────────────
    # CIERRE
    # ─────────────────────────────────────────────────────────────────────

    def _on_close(self) -> None:
        self._running = False
        threading.Thread(target=self._shutdown, daemon=True).start()

    def _shutdown(self) -> None:
        self.bm.stop_all()
        self.sm.stop()
        self.root.after(500, self.root.destroy)


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except AttributeError:
            pass

    _check_auth()

    root = tk.Tk()
    app  = ShelfMindPanel(root)
    root.mainloop()


if __name__ == "__main__":
    main()


