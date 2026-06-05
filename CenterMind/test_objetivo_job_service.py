# -*- coding: utf-8 -*-
"""
test_objetivo_job_service.py
============================
Tests de ciclo de vida del job async de creación de objetivos.
Requiere variable de entorno SUPABASE_URL + SUPABASE_KEY para la tabla objetivo_jobs.
"""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch, call


# ---------------------------------------------------------------------------
# Helpers y fixtures
# ---------------------------------------------------------------------------

def _make_job_row(job_id: str, estado: str = "pending", paso: int = 1, pct: int = 10) -> dict:
    return {
        "id": job_id,
        "id_objetivo": "obj-001",
        "id_distribuidor": 99,
        "estado": estado,
        "paso": paso,
        "pct": pct,
        "mensaje": "Guardando objetivo…",
        "error": None,
        "created_at": "2026-06-05T00:00:00Z",
        "updated_at": "2026-06-05T00:00:00Z",
    }


def _make_objetivo_row(tipo: str = "exhibicion", origen: str = "compania") -> dict:
    return {
        "id": "obj-001",
        "id_distribuidor": 99,
        "tipo": tipo,
        "origen": origen,
        "lanzado_at": "2026-06-04T08:00:00Z",
        "fecha_objetivo": "2026-06-30",
    }


# ---------------------------------------------------------------------------
# Tests de estados y transiciones
# ---------------------------------------------------------------------------

class TestJobLifecycle:
    """Tests de transición de estados: pending → running → done/error."""

    def test_enqueue_inserts_pending_job(self):
        """enqueue_create_objetivo inserta un job en estado pending."""
        mock_sb = MagicMock()
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [
            _make_job_row("job-001")
        ]
        with patch("services.objetivos_job_service.sb", mock_sb):
            from services.objetivos_job_service import enqueue_create_objetivo
            job_id = enqueue_create_objetivo("obj-001", 99)
        assert job_id == "job-001"
        mock_sb.table.assert_called_with("objetivo_jobs")

    def test_enqueue_raises_if_no_data(self):
        """enqueue_create_objetivo lanza RuntimeError si insert no retorna filas."""
        mock_sb = MagicMock()
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = []
        with patch("services.objetivos_job_service.sb", mock_sb):
            from services.objetivos_job_service import enqueue_create_objetivo
            with pytest.raises(RuntimeError, match="No se pudo crear job"):
                enqueue_create_objetivo("obj-001", 99)

    def test_get_job_status_returns_none_if_not_found(self):
        """get_job_status retorna None si el job no existe."""
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        with patch("services.objetivos_job_service.sb", mock_sb):
            from services.objetivos_job_service import get_job_status
            result = get_job_status("nonexistent-job", 99)
        assert result is None

    def test_get_job_status_returns_dict_if_found(self):
        """get_job_status retorna dict con campos correctos."""
        mock_sb = MagicMock()
        row = _make_job_row("job-001", estado="running", paso=2, pct=30)
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [row]
        with patch("services.objetivos_job_service.sb", mock_sb):
            from services.objetivos_job_service import get_job_status
            result = get_job_status("job-001", 99)
        assert result is not None
        assert result["estado"] == "running"
        assert result["paso"] == 2
        assert result["pct"] == 30
        assert result["id_objetivo"] == "obj-001"


class TestJobRun:
    """Tests del worker run_job."""

    def test_run_job_exitoso_llama_watcher(self):
        """run_job llama al watcher con el objetivo correcto."""
        mock_sb = MagicMock()
        # Objetivo encontrado
        mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            _make_objetivo_row(tipo="exhibicion", origen="compania")
        ]
        # update del job (para _update_job)
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

        mock_watcher = MagicMock()
        mock_watcher.return_value.run_watcher.return_value = {"actualizados": 1}

        with patch("services.objetivos_job_service.sb", mock_sb), \
             patch("services.objetivos_job_service.ObjetivosWatcherService", mock_watcher):
            from services.objetivos_job_service import run_job
            run_job("job-001", "obj-001", 99)

        mock_watcher.return_value.run_watcher.assert_called_once_with(99, obj_id="obj-001")

    def test_run_job_compradores_pasa_por_paso_3(self):
        """Para tipo=compradores, el job actualiza paso 3 (Sumando compradores)."""
        updated_pasos: list[int] = []

        def _capture_update(data):
            if "paso" in data:
                updated_pasos.append(data["paso"])
            m = MagicMock()
            m.eq.return_value.execute.return_value = MagicMock()
            return m

        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            _make_objetivo_row(tipo="compradores", origen="compania")
        ]
        mock_sb.table.return_value.update.side_effect = _capture_update

        mock_watcher = MagicMock()
        mock_watcher.return_value.run_watcher.return_value = {"actualizados": 1}

        with patch("services.objetivos_job_service.sb", mock_sb), \
             patch("services.objetivos_job_service.ObjetivosWatcherService", mock_watcher):
            from services.objetivos_job_service import run_job, PASO_COMPRADORES
            run_job("job-001", "obj-001", 99)

        assert PASO_COMPRADORES in updated_pasos, "Paso 3 (compradores) no fue registrado"

    def test_run_job_error_en_watcher_marca_job_error(self):
        """Si el watcher falla, el job queda en estado error."""
        estados_escritos: list[str] = []

        def _capture_update(data):
            if "estado" in data:
                estados_escritos.append(data["estado"])
            m = MagicMock()
            m.eq.return_value.execute.return_value = MagicMock()
            return m

        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            _make_objetivo_row(tipo="exhibicion", origen="compania")
        ]
        mock_sb.table.return_value.update.side_effect = _capture_update

        mock_watcher = MagicMock()
        mock_watcher.return_value.run_watcher.side_effect = RuntimeError("DB timeout")

        with patch("services.objetivos_job_service.sb", mock_sb), \
             patch("services.objetivos_job_service.ObjetivosWatcherService", mock_watcher):
            from services.objetivos_job_service import run_job
            run_job("job-001", "obj-001", 99)

        assert "error" in estados_escritos, "Job no fue marcado como error tras fallo watcher"

    def test_run_job_objetivo_no_encontrado(self):
        """Si el objetivo no existe, el job termina en error."""
        estados_escritos: list[str] = []

        def _capture_update(data):
            if "estado" in data:
                estados_escritos.append(data["estado"])
            m = MagicMock()
            m.eq.return_value.execute.return_value = MagicMock()
            return m

        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        mock_sb.table.return_value.update.side_effect = _capture_update

        with patch("services.objetivos_job_service.sb", mock_sb):
            from services.objetivos_job_service import run_job
            run_job("job-001", "obj-not-found", 99)

        assert "error" in estados_escritos


# ---------------------------------------------------------------------------
# Tests de pasos y mensajes
# ---------------------------------------------------------------------------

class TestJobMensajes:
    def test_mensajes_tienen_contenido(self):
        """Todos los pasos tienen mensaje no vacío."""
        from services.objetivos_job_service import _MENSAJES, PASO_GUARDANDO, PASO_LISTO
        for paso in range(PASO_GUARDANDO, PASO_LISTO + 1):
            msg = _MENSAJES.get(paso, "")
            assert msg, f"Paso {paso} no tiene mensaje"

    def test_pct_creciente(self):
        """Los porcentajes son estrictamente crecientes entre pasos."""
        from services.objetivos_job_service import _PCT, PASO_GUARDANDO, PASO_LISTO
        prev = -1
        for paso in range(PASO_GUARDANDO, PASO_LISTO + 1):
            pct = _PCT.get(paso, -1)
            assert pct > prev, f"Paso {paso}: pct={pct} no es mayor que {prev}"
            prev = pct

    def test_pct_listo_es_100(self):
        """El último paso debe tener pct=100."""
        from services.objetivos_job_service import _PCT, PASO_LISTO
        assert _PCT[PASO_LISTO] == 100
