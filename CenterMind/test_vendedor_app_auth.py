# -*- coding: utf-8 -*-
"""
Tests para la autenticación de la app móvil de vendedores (SHELFYAPP).

Ejecutar:
  cd CenterMind && python -m pytest test_vendedor_app_auth.py -v
"""
from __future__ import annotations

import time
from unittest.mock import MagicMock, patch, call
import pytest

# ─── Importaciones del módulo bajo test ──────────────────────────────────────
from core.vendedor_app_auth import (
    build_full_key,
    generate_random_token,
    hash_key,
    issue_session_jwt,
    parse_key,
    verify_key,
    ensure_mobile_integrante,
    _mobile_telegram_user_id,
)
from services.vendedor_app_auth_service import (
    activate_key,
    create_vendor_key,
    list_vendor_keys,
    revoke_key,
)


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def mock_sb():
    """Mock del cliente Supabase."""
    return MagicMock()


def _make_key_row(
    key_id: int = 1,
    id_distribuidor: int = 10,
    id_vendedor: int = 42,
    activo: bool = True,
    revoked_at=None,
    key_hash: str = "",
) -> dict:
    """Helper para construir una fila de vendedor_app_keys."""
    return {
        "id": key_id,
        "id_distribuidor": id_distribuidor,
        "id_vendedor": id_vendedor,
        "activo": activo,
        "revoked_at": revoked_at,
        "key_hash": key_hash,
        "label": "Test Key",
        "created_by": "test",
    }


# ─── test_generate_key_format ─────────────────────────────────────────────────


def test_generate_key_format():
    """La key completa debe comenzar con 'sapp_'."""
    token = generate_random_token()
    full_key = build_full_key(key_id=1, random_token=token)
    assert full_key.startswith("sapp_"), f"Key no comienza con 'sapp_': {full_key}"
    assert "_" in full_key[5:], "Key debe tener al menos un '_' después del prefijo"


def test_generate_key_format_various_ids():
    """Verificar formato con diferentes key_ids."""
    for key_id in [1, 99, 1000, 999999]:
        token = generate_random_token()
        full_key = build_full_key(key_id=key_id, random_token=token)
        assert full_key.startswith("sapp_")
        parsed_id, parsed_token = parse_key(full_key)
        assert parsed_id == key_id
        assert parsed_token == token


def test_generate_key_uniqueness():
    """Dos tokens generados deben ser distintos."""
    t1 = generate_random_token()
    t2 = generate_random_token()
    assert t1 != t2


# ─── test_hash_and_verify ─────────────────────────────────────────────────────


def test_hash_and_verify():
    """hash_key + verify_key deben ser consistentes."""
    token = generate_random_token()
    hashed = hash_key(token)
    assert verify_key(token, hashed) is True


def test_hash_different_salts():
    """El mismo token debe producir hashes distintos (salt aleatorio)."""
    token = generate_random_token()
    h1 = hash_key(token)
    h2 = hash_key(token)
    assert h1 != h2, "Hashes deben diferir (salts distintos)"
    # Pero ambos deben verificar correctamente
    assert verify_key(token, h1) is True
    assert verify_key(token, h2) is True


def test_verify_wrong_token():
    """Token incorrecto debe retornar False."""
    token = generate_random_token()
    hashed = hash_key(token)
    wrong = generate_random_token()
    assert verify_key(wrong, hashed) is False


def test_verify_tampered_hash():
    """Hash manipulado debe retornar False sin excepción."""
    token = generate_random_token()
    hashed = hash_key(token)
    tampered = hashed[:-4] + "XXXX"
    result = verify_key(token, tampered)
    assert result is False


def test_verify_invalid_format():
    """Formato de hash inválido no debe lanzar excepción."""
    assert verify_key("sometoken", "notahash") is False
    assert verify_key("sometoken", "") is False
    assert verify_key("sometoken", "scrypt$bad$format") is False


# ─── test_activate_key_success ────────────────────────────────────────────────


def test_activate_key_success(mock_sb):
    """Activación exitosa: mock retorna key row válida → JWT + branding."""
    key_id = 7
    id_dist = 10
    id_vend = 42
    device_id = "device-abc-123"

    random_token = generate_random_token()
    full_key = build_full_key(key_id, random_token)
    hashed = hash_key(random_token)

    key_row = _make_key_row(
        key_id=key_id,
        id_distribuidor=id_dist,
        id_vendedor=id_vend,
        activo=True,
        key_hash=hashed,
    )

    # Mock: select key → row
    mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [key_row]

    # Mock: upsert device
    device_mock = MagicMock()
    device_mock.data = [{"id": 1, "device_id": device_id}]

    # Mock: branding
    branding_mock = MagicMock()
    branding_mock.data = [{"mobile_branding": {"primary_color": "#FF0000"}}]

    # Encadenar los mocks de table() correctamente
    def table_side_effect(table_name):
        m = MagicMock()
        if table_name == "vendedor_app_keys":
            # select chain
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [key_row]
            # upsert chain (para register_device)
            m.upsert.return_value.execute.return_value.data = [{"id": 1}]
        elif table_name == "vendedor_app_devices":
            m.upsert.return_value.execute.return_value.data = [{"id": 1}]
        elif table_name == "distribuidores":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"mobile_branding": {"primary_color": "#FF0000"}}
            ]
        return m

    mock_sb.table.side_effect = table_side_effect

    result = activate_key(mock_sb, full_key, device_id, "android", "1.0.0")

    assert "session_token" in result
    assert result["id_vendedor"] == id_vend
    assert result["id_distribuidor"] == id_dist
    assert "branding" in result
    assert result["branding"]["primary_color"] == "#FF0000"


# ─── test_activate_key_invalid ────────────────────────────────────────────────


def test_activate_key_invalid(mock_sb):
    """Token con hash incorrecto → 401."""
    from fastapi import HTTPException

    key_id = 3
    random_token = generate_random_token()
    full_key = build_full_key(key_id, random_token)
    # Hashear un token DIFERENTE
    wrong_token = generate_random_token()
    wrong_hash = hash_key(wrong_token)

    key_row = _make_key_row(key_id=key_id, activo=True, key_hash=wrong_hash)

    def table_side_effect(table_name):
        m = MagicMock()
        if table_name == "vendedor_app_keys":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [key_row]
        return m

    mock_sb.table.side_effect = table_side_effect

    with pytest.raises(HTTPException) as exc_info:
        activate_key(mock_sb, full_key, "device-xyz", "ios", None)
    assert exc_info.value.status_code == 401


# ─── test_activate_key_inactive ──────────────────────────────────────────────


def test_activate_key_inactive(mock_sb):
    """Clave con activo=False → 401."""
    from fastapi import HTTPException

    key_id = 5
    random_token = generate_random_token()
    full_key = build_full_key(key_id, random_token)
    hashed = hash_key(random_token)

    key_row = _make_key_row(key_id=key_id, activo=False, key_hash=hashed)

    def table_side_effect(table_name):
        m = MagicMock()
        if table_name == "vendedor_app_keys":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [key_row]
        return m

    mock_sb.table.side_effect = table_side_effect

    with pytest.raises(HTTPException) as exc_info:
        activate_key(mock_sb, full_key, "device-xyz", "ios", None)
    assert exc_info.value.status_code == 401
    assert "desactivada" in exc_info.value.detail.lower() or "revocada" in exc_info.value.detail.lower()


# ─── test_multi_device_same_key ──────────────────────────────────────────────


def test_multi_device_same_key():
    """
    El mismo random_token verificado contra el mismo hash debe funcionar
    independientemente del device_id (la clave es por vendedor, no por device).
    """
    token = generate_random_token()
    hashed = hash_key(token)

    # device_id no afecta la verificación del hash
    assert verify_key(token, hashed) is True   # device A
    assert verify_key(token, hashed) is True   # device B


def test_multi_device_activate_integration(mock_sb):
    """Dos device_ids distintos con la misma key → ambos activan correctamente."""
    from fastapi import HTTPException

    key_id = 9
    id_dist = 10
    id_vend = 42
    random_token = generate_random_token()
    full_key = build_full_key(key_id, random_token)
    hashed = hash_key(random_token)
    key_row = _make_key_row(key_id=key_id, id_distribuidor=id_dist, id_vendedor=id_vend, activo=True, key_hash=hashed)

    def table_side_effect(table_name):
        m = MagicMock()
        if table_name == "vendedor_app_keys":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [key_row]
        elif table_name == "vendedor_app_devices":
            m.upsert.return_value.execute.return_value.data = [{"id": 1}]
        elif table_name == "distribuidores":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"mobile_branding": None}]
        return m

    mock_sb.table.side_effect = table_side_effect

    result_a = activate_key(mock_sb, full_key, "device-A", "android", "1.0")
    result_b = activate_key(mock_sb, full_key, "device-B", "ios", "1.0")

    assert "session_token" in result_a
    assert "session_token" in result_b
    # Los JWTs son diferentes (device distinto)
    assert result_a["session_token"] != result_b["session_token"]


# ─── test_revoke_key ─────────────────────────────────────────────────────────


def test_revoke_key(mock_sb):
    """
    Clave revocada (revoked_at no null) → 401 al intentar activar.
    """
    from fastapi import HTTPException

    key_id = 11
    random_token = generate_random_token()
    full_key = build_full_key(key_id, random_token)
    hashed = hash_key(random_token)
    key_row = _make_key_row(
        key_id=key_id,
        activo=False,
        key_hash=hashed,
        revoked_at="2026-06-07T00:00:00Z",
    )

    def table_side_effect(table_name):
        m = MagicMock()
        if table_name == "vendedor_app_keys":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [key_row]
        return m

    mock_sb.table.side_effect = table_side_effect

    with pytest.raises(HTTPException) as exc_info:
        activate_key(mock_sb, full_key, "device-xyz", "android", None)
    assert exc_info.value.status_code == 401


def test_revoke_key_service(mock_sb):
    """revoke_key() debe llamar update con activo=False y revoked_at."""
    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

    revoke_key(mock_sb, key_id=5, revoked_by="admin@test.com")

    # Verificar que se llamó update
    mock_sb.table.assert_called_with("vendedor_app_keys")
    update_call = mock_sb.table.return_value.update.call_args
    update_data = update_call[0][0]
    assert update_data["activo"] is False
    assert "revoked_at" in update_data
    assert update_data["revoked_by"] == "admin@test.com"


# ─── test_jwt_fields ─────────────────────────────────────────────────────────


def test_jwt_fields():
    """El JWT emitido debe tener todos los campos requeridos en el payload."""
    from core.config import JWT_SECRET, JWT_ALGORITHM, _jwt, JWT_AVAILABLE

    if not JWT_AVAILABLE or _jwt is None:
        pytest.skip("python-jose no disponible")

    token = issue_session_jwt(
        id_distribuidor=10,
        id_vendedor=42,
        key_id=7,
        device_id="test-device-001",
    )

    payload = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

    assert payload["dist"] == 10
    assert payload["vendor"] == 42
    assert payload["device"] == "test-device-001"
    assert payload["type"] == "vendedor_app"
    assert payload["sub"] == "7"
    assert "exp" in payload
    assert "iat" in payload

    # Expiración debe ser ~7 días en el futuro (±60s de tolerancia)
    import time
    now = int(time.time())
    delta = payload["exp"] - now
    assert 7 * 24 * 3600 - 60 <= delta <= 7 * 24 * 3600 + 60, f"Expiración inesperada: {delta}s"


def test_jwt_type_rejection():
    """JWT con type != 'vendedor_app' debe ser rechazado por decode_session_jwt."""
    from fastapi import HTTPException
    from core.config import JWT_SECRET, JWT_ALGORITHM, _jwt, JWT_AVAILABLE
    from core.vendedor_app_auth import decode_session_jwt

    if not JWT_AVAILABLE or _jwt is None:
        pytest.skip("python-jose no disponible")

    # Emitir JWT de tipo portal (sin campo type=vendedor_app)
    import time as _time
    payload = {
        "sub": "user_123",
        "rol": "admin",
        "exp": int(_time.time()) + 3600,
    }
    portal_token = _jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    with pytest.raises(HTTPException) as exc_info:
        decode_session_jwt(portal_token)
    assert exc_info.value.status_code == 401


# ─── test_mobile_integrante_hash ─────────────────────────────────────────────


def test_mobile_integrante_hash_stability():
    """El telegram_user_id sintético debe ser estable y positivo."""
    uid1 = _mobile_telegram_user_id("device-abc", 42)
    uid2 = _mobile_telegram_user_id("device-abc", 42)
    assert uid1 == uid2, "Hash debe ser determinístico"
    assert uid1 > 0
    assert uid1 < 2**31 - 1


def test_mobile_integrante_hash_different_devices():
    """Device IDs distintos → hashes distintos."""
    uid_a = _mobile_telegram_user_id("device-A", 42)
    uid_b = _mobile_telegram_user_id("device-B", 42)
    assert uid_a != uid_b


def test_mobile_integrante_hash_different_vendors():
    """Vendor IDs distintos → hashes distintos."""
    uid_1 = _mobile_telegram_user_id("same-device", 42)
    uid_2 = _mobile_telegram_user_id("same-device", 99)
    assert uid_1 != uid_2


def test_ensure_mobile_integrante_get_existing(mock_sb):
    """Si ya existe fila, retornar su id sin insertar."""
    tg_uid = _mobile_telegram_user_id("device-x", 42)

    def table_side_effect(table_name):
        m = MagicMock()
        if table_name == "integrantes_grupo":
            # Simular fila existente
            m.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"id": 55}
            ]
        return m

    mock_sb.table.side_effect = table_side_effect

    result = ensure_mobile_integrante(mock_sb, id_distribuidor=10, id_vendedor_v2=42, device_id="device-x")
    assert result == 55

    # No debe haberse llamado insert
    mock_sb.table.return_value.insert.assert_not_called()


def test_ensure_mobile_integrante_create_new(mock_sb):
    """Si no existe fila, insertar y retornar el nuevo id."""
    call_count = [0]

    def table_side_effect(table_name):
        m = MagicMock()
        if table_name == "integrantes_grupo":
            call_count[0] += 1
            # Primera llamada (select) → sin datos; segunda llamada (insert) → retorna id
            sel = MagicMock()
            sel.execute.return_value.data = []
            m.select.return_value.eq.return_value.eq.return_value.limit.return_value = sel
            ins = MagicMock()
            ins.execute.return_value.data = [{"id": 77}]
            m.insert.return_value = ins
        return m

    mock_sb.table.side_effect = table_side_effect

    result = ensure_mobile_integrante(mock_sb, id_distribuidor=10, id_vendedor_v2=42, device_id="new-device")
    assert result == 77


# ─── test_parse_key ──────────────────────────────────────────────────────────


def test_parse_key_valid():
    """parse_key debe extraer correctamente key_id y token."""
    token = "abc123xyz"
    full_key = f"sapp_42_{token}"
    key_id, parsed_token = parse_key(full_key)
    assert key_id == 42
    assert parsed_token == token


def test_parse_key_invalid_prefix():
    """Clave sin prefijo 'sapp_' debe lanzar ValueError."""
    with pytest.raises(ValueError):
        parse_key("invalid_key_format")


def test_parse_key_non_integer_id():
    """ID no entero debe lanzar ValueError."""
    with pytest.raises(ValueError):
        parse_key("sapp_abc_token123")


def test_parse_key_real_token():
    """parse_key con un token URL-safe real."""
    token = generate_random_token()
    full_key = build_full_key(999, token)
    kid, tok = parse_key(full_key)
    assert kid == 999
    assert tok == token
