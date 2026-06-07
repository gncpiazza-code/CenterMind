"""
Tests para los servicios de la app móvil de vendedores (SHELFYAPP).

Cubre:
- Idempotencia de subida por client_upload_id
- Validación de cartera (PDV desconocido rechazado)
- Stats usando aggregate_exhibicion_counts_vendor_scope (vendor scope)
- Filtro de objetivos activos (lanzado_at=None → excluido)

Nota: Los módulos que importan db.py (que requiere supabase + env vars) se parchean
con sys.modules stubs para poder ejecutar en CI sin credenciales.
"""
from __future__ import annotations

import sys
import types
from datetime import date, timezone, timedelta
from unittest.mock import MagicMock, patch
import pytest

AR_TZ = timezone(timedelta(hours=-3))


# ─── Stubs para aislar dependencias de DB ─────────────────────────────────────

def _install_db_stubs():
    """
    Instala módulos stub en sys.modules para que los servicios puedan importarse
    sin necesitar las credenciales de Supabase ni la librería real.
    """
    if "db" not in sys.modules:
        db_stub = types.ModuleType("db")
        db_stub.sb = MagicMock()
        sys.modules["db"] = db_stub

    for mod_name in ["supabase", "supabase._sync.client", "supabase._sync"]:
        if mod_name not in sys.modules:
            stub = types.ModuleType(mod_name)
            stub.Client = object
            stub.create_client = MagicMock
            sys.modules[mod_name] = stub

    if "dotenv" not in sys.modules:
        dotenv_stub = types.ModuleType("dotenv")
        dotenv_stub.load_dotenv = lambda *a, **kw: None
        sys.modules["dotenv"] = dotenv_stub

    # core.config para JWT
    if "core.config" not in sys.modules:
        config_stub = types.ModuleType("core.config")
        config_stub.JWT_SECRET = "test-secret"
        config_stub.JWT_ALGORITHM = "HS256"
        config_stub.JWT_AVAILABLE = False
        config_stub.JWTError = Exception
        config_stub._jwt = None
        sys.modules["core.config"] = config_stub


_install_db_stubs()


# ─── Test 1: Idempotencia ─────────────────────────────────────────────────────


def test_idempotency_duplicate_upload():
    """
    Segunda llamada con el mismo client_upload_id retorna caché sin llamar al RPC.
    """
    from services.vendedor_upload_service import process_exhibicion_upload

    client_upload_id = "test-upload-uuid-001"
    cached_exhibicion_ids = [101, 102]

    sb = MagicMock()

    # upload_queue retorna fila en estado='done' (idempotency hit)
    cached_row = MagicMock()
    cached_row.data = [{"id": 1, "estado": "done", "exhibicion_ids": cached_exhibicion_ids}]

    # Cadena: sb.table("vendedor_app_upload_queue").select(...).eq(...).eq(...).limit(...).execute()
    (
        sb.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .limit.return_value
        .execute.return_value
    ) = cached_row

    result = process_exhibicion_upload(
        sb=sb,
        dist_id=1,
        id_vendedor_v2=42,
        device_id="device-abc",
        nro_cliente="12345",
        tipo_pdv="super",
        photo_urls=["https://storage.example.com/photo1.jpg"],
        client_upload_id=client_upload_id,
        capture_lat=-34.6,
        capture_lng=-58.4,
    )

    assert result["idempotent"] is True
    assert result["exhibicion_ids"] == cached_exhibicion_ids

    # El RPC fn_bot_registrar_exhibicion NO debe haber sido llamado
    sb.rpc.assert_not_called()


# ─── Test 2: Validación de cartera rechaza PDV desconocido ───────────────────


def test_cartera_validation_rejects_unknown_pdv():
    """
    PDV no en cartera del vendedor → validate_nro_cliente_en_cartera retorna False.
    """
    from services.vendedor_upload_service import validate_nro_cliente_en_cartera

    sb = MagicMock()

    # Rutas del vendedor: hay una ruta id=99
    rutas_result = MagicMock()
    rutas_result.data = [{"id_ruta": 99}]

    # PDV no encontrado en esa ruta (respuestas vacías)
    empty_result = MagicMock()
    empty_result.data = []

    # La primera llamada a execute() retorna las rutas; las demás retornan vacío
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = rutas_result
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value = empty_result
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.in_.return_value.execute.return_value = empty_result

    result = validate_nro_cliente_en_cartera(
        sb=sb,
        dist_id=1,
        id_vendedor=42,
        nro_cliente="PDV_UNKNOWN_9999",
    )

    assert result is False


def test_cartera_validation_accepts_known_pdv():
    """
    PDV en cartera del vendedor → validate_nro_cliente_en_cartera retorna True.
    """
    from services.vendedor_upload_service import validate_nro_cliente_en_cartera

    sb = MagicMock()

    # Rutas del vendedor
    rutas_result = MagicMock()
    rutas_result.data = [{"id_ruta": 99}]

    # PDV encontrado
    pdv_result = MagicMock()
    pdv_result.data = [{"id_cliente_erp": "12345"}]

    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = rutas_result
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value = pdv_result

    result = validate_nro_cliente_en_cartera(
        sb=sb,
        dist_id=1,
        id_vendedor=42,
        nro_cliente="12345",
    )

    assert result is True


# ─── Test 3: Stats usan vendor scope ─────────────────────────────────────────


def test_stats_vendor_scope():
    """
    get_stats_vendedor_app usa aggregate_exhibicion_counts_vendor_scope.
    Con 2 filas del mismo cliente+día: 1 lógica (Destacado gana sobre Aprobado).
    """
    from services.vendedor_stats_service import get_stats_vendedor_app

    sb = MagicMock()

    # Integrantes del vendedor
    integrantes_result = MagicMock()
    integrantes_result.data = [{"id": 10, "nombre_integrante": "Juan Perez"}]
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = integrantes_result

    # 2 filas del mismo cliente + mismo día (debe contar 1 lógica, gana Destacado)
    exhibiciones_rows = [
        {
            "id_exhibicion": 1,
            "id_integrante": 10,
            "estado": "Aprobado",
            "timestamp_subida": "2026-06-07T10:00:00-03:00",
            "id_cliente_pdv": "CLI001",
            "id_cliente": None,
            "cliente_sombra_codigo": None,
            "url_foto_drive": "https://storage/a.jpg",
            "telegram_msg_id": 0,
            "telegram_chat_id": -1,
        },
        {
            "id_exhibicion": 2,
            "id_integrante": 10,
            "estado": "Destacado",
            "timestamp_subida": "2026-06-07T11:00:00-03:00",
            "id_cliente_pdv": "CLI001",  # mismo cliente
            "id_cliente": None,
            "cliente_sombra_codigo": None,
            "url_foto_drive": "https://storage/b.jpg",
            "telegram_msg_id": 0,
            "telegram_chat_id": -1,
        },
    ]
    paginacion_result = MagicMock()
    paginacion_result.data = exhibiciones_rows

    empty_result = MagicMock()
    empty_result.data = []

    # Para queries con .in_().gte().lte().range().execute() — exhibiciones paginadas
    sb.table.return_value.select.return_value.eq.return_value.in_.return_value.gte.return_value.lte.return_value.range.return_value.execute.return_value = paginacion_result

    with patch("services.vendedor_stats_service._fetch_all_exhibiciones_for_dist", return_value=[]):
        with patch("services.vendedor_stats_service._build_iid_to_erp_map", return_value={10: "Juan Perez"}):
            stats = get_stats_vendedor_app(sb, dist_id=1, id_vendedor_v2=42)

    mes = stats["mes_actual"]
    # vendor scope dedup: mismo cliente + mismo día → 1 lógica, gana Destacado
    assert mes["exhibiciones_logicas"] == 1
    assert mes["destacadas"] == 1
    assert mes["aprobadas"] == 0
    assert mes["puntos"] == 2  # Destacado = 2 puntos


# ─── Test 4: Filtro objetivos excluye no-lanzados ────────────────────────────


def test_objetivos_filters_applied():
    """
    Solo se retornan objetivos con lanzado_at != None y fecha_objetivo >= hoy.
    Un objetivo con lanzado_at=None no debe aparecer.
    """
    from services.vendedor_objetivos_service import list_objetivos_vendedor
    from core.objetivos_filters import objetivo_activo_para_vendedor

    hoy = date(2026, 6, 7)

    # Objetivo planificado (sin lanzar) — NO debe aparecer
    obj_no_lanzado = {
        "id": 1, "tipo": "exhibicion", "fecha_objetivo": "2026-06-30",
        "lanzado_at": None, "cumplido": False, "descripcion": "Planificado",
        "valor_objetivo": 10, "valor_actual": 0, "nombre_vendedor": "Juan",
        "origen": "distribuidor", "mes_referencia": None, "fecha_inicio": None,
        "id_vendedor": 42, "created_at": "2026-06-01T00:00:00", "id_target_pdv": None,
    }

    # Objetivo lanzado y activo — SÍ debe aparecer
    obj_activo = {
        "id": 2, "tipo": "exhibicion", "fecha_objetivo": "2026-06-30",
        "lanzado_at": "2026-06-05T10:00:00-03:00", "cumplido": False, "descripcion": "Activo",
        "valor_objetivo": 10, "valor_actual": 3, "nombre_vendedor": "Juan",
        "origen": "distribuidor", "mes_referencia": None, "fecha_inicio": None,
        "id_vendedor": 42, "created_at": "2026-06-01T00:00:00", "id_target_pdv": None,
    }

    # Objetivo vencido — NO debe aparecer
    obj_vencido = {
        "id": 3, "tipo": "exhibicion", "fecha_objetivo": "2026-06-01",
        "lanzado_at": "2026-05-01T10:00:00-03:00", "cumplido": True, "descripcion": "Vencido",
        "valor_objetivo": 5, "valor_actual": 5, "nombre_vendedor": "Juan",
        "origen": "distribuidor", "mes_referencia": None, "fecha_inicio": None,
        "id_vendedor": 42, "created_at": "2026-05-01T00:00:00", "id_target_pdv": None,
    }

    # Objetivo tipo 'ruteo' — NO debe aparecer
    obj_ruteo = {
        "id": 4, "tipo": "ruteo", "fecha_objetivo": "2026-06-30",
        "lanzado_at": "2026-06-01T10:00:00-03:00", "cumplido": False, "descripcion": "Ruta",
        "valor_objetivo": 1, "valor_actual": 0, "nombre_vendedor": "Juan",
        "origen": "distribuidor", "mes_referencia": None, "fecha_inicio": None,
        "id_vendedor": 42, "created_at": "2026-06-01T00:00:00", "id_target_pdv": None,
    }

    # Verificar filtro unitario (función pura, sin mocks)
    assert objetivo_activo_para_vendedor(obj_no_lanzado, hoy) is False
    assert objetivo_activo_para_vendedor(obj_activo, hoy) is True
    assert objetivo_activo_para_vendedor(obj_vencido, hoy) is False
    assert objetivo_activo_para_vendedor(obj_ruteo, hoy) is False

    # Verificar integración con list_objetivos_vendedor
    sb = MagicMock()
    todos = [obj_no_lanzado, obj_activo, obj_vencido, obj_ruteo]

    paginacion_result = MagicMock()
    paginacion_result.data = todos

    empty_page = MagicMock()
    empty_page.data = []

    # Primera página devuelve datos, segunda retorna vacío (fin de paginación)
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.range.return_value.execute.side_effect = [
        paginacion_result,
        empty_page,
    ]

    with patch("services.vendedor_objetivos_service.hoy_ar", return_value=hoy):
        result = list_objetivos_vendedor(sb, dist_id=1, id_vendedor_v2=42)

    # Solo el objetivo activo (id=2) debe retornarse
    assert len(result) == 1
    assert result[0]["id"] == 2
    assert result[0]["tipo"] == "exhibicion"


# ─── Test 5: Stats vendor scope - dos integrantes mismo vendedor ──────────────


def test_stats_vendor_scope_two_integrantes_same_day():
    """
    Dos integrantes del mismo vendedor ERP que visitan el mismo cliente el mismo
    día deben contar como 1 exhibición lógica (vendor scope dedup).
    """
    from core.exhibicion_aggregate import aggregate_exhibicion_counts_vendor_scope

    # Integrante 10 y 11 son del mismo vendedor ERP
    # Ambos visitan CLI001 el mismo día
    rows = [
        {
            "id_exhibicion": 1, "id_integrante": 10, "estado": "Aprobado",
            "timestamp_subida": "2026-06-07T09:00:00-03:00",
            "id_cliente_pdv": "CLI001", "id_cliente": None, "cliente_sombra_codigo": None,
            "url_foto_drive": "https://storage/a.jpg", "telegram_msg_id": 1001, "telegram_chat_id": -111,
        },
        {
            "id_exhibicion": 2, "id_integrante": 11, "estado": "Aprobado",
            "timestamp_subida": "2026-06-07T10:00:00-03:00",
            "id_cliente_pdv": "CLI001", "id_cliente": None, "cliente_sombra_codigo": None,
            "url_foto_drive": "https://storage/b.jpg", "telegram_msg_id": 1002, "telegram_chat_id": -222,
        },
    ]

    counts = aggregate_exhibicion_counts_vendor_scope(rows)

    # Vendor scope: mismo cliente + mismo día = 1 lógica, sin importar el integrante
    assert counts["total_logicas"] == 1
    assert counts["aprobadas"] == 1
    assert counts["puntos"] == 1
