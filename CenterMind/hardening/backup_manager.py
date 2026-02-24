# -*- coding: utf-8 -*-
"""
CenterMind / hardening / backup_manager.py
==========================================
Backup automático de centermind.db.

Comportamiento:
  - Copia diaria a medianoche en CenterMind/backups/centermind_YYYY-MM-DD.db
  - Conserva los últimos KEEP_DAYS backups locales (default: 7)
  - Cuando acumula PACK_AFTER_DAYS días (default: 30), empaqueta todo en un
    .zip fechado y lo sube a Google Drive (carpeta "CenterMind_Backups")
  - Backup manual disponible en cualquier momento

Uso desde centermind_core.py:
    from hardening import BackupManager
    bm = BackupManager()
    bm.start()          # inicia el job automático
    bm.backup_now()     # backup manual
    bm.stop()           # detener el job
"""

from __future__ import annotations

import shutil
import sqlite3
import threading
import time
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional
from zoneinfo import ZoneInfo

AR_TZ    = ZoneInfo("America/Argentina/Buenos_Aires")
BASE_DIR = Path(__file__).resolve().parent.parent   # CenterMind/
DB_PATH  = BASE_DIR / "base_datos" / "centermind.db"
BAK_DIR  = BASE_DIR / "backups"

# ── Configuración ──────────────────────────────────────────────────────────────
KEEP_DAYS      = 7     # Días de backups individuales a conservar localmente
PACK_AFTER_DAYS= 30    # Empaquetar y subir a Drive cuando hay ≥ X backups
DRIVE_FOLDER   = "CenterMind_Backups"   # Nombre de carpeta raíz en Drive


class BackupManager:
    """
    Gestiona backups automáticos y manuales de la base de datos.
    Thread-safe. Puede correr como daemon junto al orquestador.
    """

    def __init__(
        self,
        db_path:        Path = DB_PATH,
        backup_dir:     Path = BAK_DIR,
        keep_days:      int  = KEEP_DAYS,
        pack_after_days:int  = PACK_AFTER_DAYS,
    ):
        self.db_path         = db_path
        self.backup_dir      = backup_dir
        self.keep_days       = keep_days
        self.pack_after_days = pack_after_days

        self._thread:  Optional[threading.Thread] = None
        self._stop_ev: threading.Event            = threading.Event()
        self._lock:    threading.Lock             = threading.Lock()

        self.backup_dir.mkdir(exist_ok=True)

        from hardening.logger import get_logger
        self.logger = get_logger("BackupManager")

    # ── Públicos ───────────────────────────────────────────────────────────────

    def start(self) -> None:
        """Arranca el job de backup en un hilo daemon."""
        if self._thread and self._thread.is_alive():
            return
        self._stop_ev.clear()
        self._thread = threading.Thread(
            target=self._run_loop,
            name="BackupManager",
            daemon=True,
        )
        self._thread.start()
        self.logger.info("BackupManager iniciado — backup diario a medianoche (ARG)")

    def stop(self) -> None:
        """Detiene el job de backup."""
        self._stop_ev.set()
        if self._thread:
            self._thread.join(timeout=5)
        self.logger.info("BackupManager detenido")

    def backup_now(self) -> Optional[Path]:
        """
        Ejecuta un backup inmediato.
        Devuelve la ruta al archivo de backup creado, o None si falló.
        """
        with self._lock:
            return self._do_backup()

    def list_backups(self) -> List[Path]:
        """Lista todos los backups locales ordenados por fecha (más reciente primero)."""
        files = sorted(
            self.backup_dir.glob("centermind_*.db"),
            reverse=True
        )
        return files

    def get_status(self) -> dict:
        """Estado actual del manager (para el Panel Maestro)."""
        backups = self.list_backups()
        latest  = backups[0] if backups else None
        return {
            "running":       self._thread is not None and self._thread.is_alive(),
            "total_backups": len(backups),
            "latest":        str(latest) if latest else "Sin backups",
            "latest_size_mb": round(latest.stat().st_size / 1024**2, 2) if latest else 0,
            "backup_dir":    str(self.backup_dir),
        }

    # ── Privados ───────────────────────────────────────────────────────────────

    def _run_loop(self) -> None:
        """Bucle principal: espera hasta la próxima medianoche y hace backup."""
        self.logger.info("Bucle de backup iniciado")

        while not self._stop_ev.is_set():
            now        = datetime.now(AR_TZ)
            tomorrow   = (now + timedelta(days=1)).replace(
                hour=0, minute=0, second=5, microsecond=0
            )
            secs_to_midnight = (tomorrow - now).total_seconds()

            self.logger.info(
                f"Próximo backup automático en {secs_to_midnight/3600:.1f}h "
                f"({tomorrow.strftime('%d/%m %H:%M')})"
            )

            # Esperar hasta medianoche en intervalos de 60s para poder interrumpir
            waited = 0
            while waited < secs_to_midnight and not self._stop_ev.is_set():
                sleep_chunk = min(60, secs_to_midnight - waited)
                time.sleep(sleep_chunk)
                waited += sleep_chunk

            if self._stop_ev.is_set():
                break

            with self._lock:
                self._do_backup()
                self._prune_old_backups()
                self._maybe_pack_and_upload()

    def _do_backup(self) -> Optional[Path]:
        """
        Copia la DB con VACUUM INTO para garantizar consistencia.
        Fallback a shutil.copy2 si la versión de SQLite es antigua.
        """
        if not self.db_path.exists():
            self.logger.error(f"DB no encontrada: {self.db_path}")
            return None

        ts      = datetime.now(AR_TZ).strftime("%Y-%m-%d_%H-%M")
        dst     = self.backup_dir / f"centermind_{ts}.db"

        try:
            # VACUUM INTO crea una copia limpia y compacta (SQLite 3.27+)
            conn = sqlite3.connect(str(self.db_path))
            conn.execute(f"VACUUM INTO '{dst}'")
            conn.close()
            method = "VACUUM INTO"
        except Exception:
            # Fallback: copia binaria
            try:
                shutil.copy2(self.db_path, dst)
                method = "shutil.copy2"
            except Exception as e:
                self.logger.error(f"Backup fallido: {e}")
                return None

        size_mb = round(dst.stat().st_size / 1024**2, 2)
        self.logger.info(f"✅ Backup creado: {dst.name} ({size_mb} MB) via {method}")
        return dst

    def _prune_old_backups(self) -> None:
        """Elimina backups locales más viejos que keep_days días."""
        cutoff = datetime.now(AR_TZ) - timedelta(days=self.keep_days)
        pruned = 0
        for f in self.list_backups():
            try:
                # Parsear fecha del nombre: centermind_YYYY-MM-DD_HH-MM.db
                parts    = f.stem.split("_")   # ['centermind', 'YYYY-MM-DD', 'HH-MM']
                date_str = parts[1]            # 'YYYY-MM-DD'
                file_dt  = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=AR_TZ)
                if file_dt < cutoff:
                    f.unlink()
                    pruned += 1
            except Exception:
                continue
        if pruned:
            self.logger.info(f"🗑️  {pruned} backup(s) antiguo(s) eliminados (>{self.keep_days} días)")

    def _maybe_pack_and_upload(self) -> None:
        """
        Si hay ≥ pack_after_days backups, los empaqueta en un .zip y sube a Drive.
        """
        backups = self.list_backups()
        if len(backups) < self.pack_after_days:
            return

        ts       = datetime.now(AR_TZ).strftime("%Y-%m-%d")
        zip_name = f"centermind_backup_pack_{ts}.zip"
        zip_path = self.backup_dir / zip_name

        self.logger.info(f"Empaquetando {len(backups)} backups → {zip_name}")

        try:
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for f in backups:
                    zf.write(f, arcname=f.name)
        except Exception as e:
            self.logger.error(f"Error creando ZIP: {e}")
            return

        size_mb = round(zip_path.stat().st_size / 1024**2, 2)
        self.logger.info(f"ZIP creado: {zip_name} ({size_mb} MB)")

        # Subir a Drive
        uploaded = self._upload_to_drive(zip_path)
        if uploaded:
            # Eliminar backups individuales que ya están en el ZIP
            for f in backups:
                try:
                    f.unlink()
                except Exception:
                    pass
            self.logger.info(f"✅ Pack subido a Drive y backups locales limpiados")
        else:
            self.logger.warning("⚠️ No se pudo subir el ZIP a Drive — se conserva localmente")

    def _upload_to_drive(self, zip_path: Path) -> bool:
        """Sube el ZIP a la carpeta CenterMind_Backups en Google Drive."""
        try:
            from google.oauth2.credentials import Credentials
            from google.auth.transport.requests import Request
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaFileUpload
            import io as _io

            token_path = BASE_DIR / "token_drive.json"
            cred_path  = BASE_DIR / "credencial_oauth.json"

            if not token_path.exists():
                self.logger.warning("token_drive.json no encontrado — omitiendo subida a Drive")
                return False

            SCOPES = ["https://www.googleapis.com/auth/drive"]
            creds  = Credentials.from_authorized_user_file(str(token_path), SCOPES)

            if creds.expired and creds.refresh_token:
                creds.refresh(Request())
                token_path.write_text(creds.to_json())

            service = build("drive", "v3", credentials=creds, cache_discovery=False)

            # Buscar o crear carpeta CenterMind_Backups
            q   = f"mimeType='application/vnd.google-apps.folder' and name='{DRIVE_FOLDER}' and trashed=false"
            res = service.files().list(q=q, fields="files(id)", pageSize=1).execute()
            files = res.get("files", [])

            if files:
                folder_id = files[0]["id"]
            else:
                meta = {
                    "name":     DRIVE_FOLDER,
                    "mimeType": "application/vnd.google-apps.folder",
                }
                folder_id = service.files().create(body=meta, fields="id").execute()["id"]
                self.logger.info(f"Carpeta '{DRIVE_FOLDER}' creada en Drive")

            # Subir ZIP
            meta  = {"name": zip_path.name, "parents": [folder_id]}
            media = MediaFileUpload(str(zip_path), mimetype="application/zip", resumable=True)
            service.files().create(body=meta, media_body=media, fields="id").execute()

            self.logger.info(f"✅ ZIP subido a Drive: {zip_path.name}")
            return True

        except Exception as e:
            self.logger.error(f"Error subiendo a Drive: {e}")
            return False
