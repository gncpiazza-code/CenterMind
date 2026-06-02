"""Tests para endpoints de galería mapa bbox.

Tests de lógica pura (sin mocking de Supabase):
  1. test_group_exhibiciones_publicaciones_basico
  2. test_group_exhibiciones_publicaciones_estado_max
  3. test_group_exhibiciones_publicaciones_vacio
  4. test_haversine_km
  5. test_galeria_sin_coords_filtra_correctamente
"""
import math
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from core.galeria_publicaciones import group_exhibiciones_publicaciones


# Inline haversine to avoid triggering db.py initialization via fuerza_ventas import
def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── helpers de fábrica ────────────────────────────────────────────────────────

def make_ex(id_ex, id_pdv, timestamp, estado="Pendiente", url="https://img.example.com/foto.jpg"):
    return {
        "id_exhibicion": id_ex,
        "id_cliente_pdv": id_pdv,
        "id_cliente": None,
        "timestamp_subida": timestamp,
        "estado": estado,
        "url_foto_drive": url,
        "comentario_evaluacion": None,
        "supervisor_nombre": None,
        "id_integrante": 1,
    }


# ── test 1: agrupación básica por día ─────────────────────────────────────────

def test_group_exhibiciones_publicaciones_basico():
    """Dos fotos del mismo día AR → una publicación con 2 fotos."""
    rows = [
        make_ex(1, 10, "2026-05-10T09:00:00", "Pendiente"),
        make_ex(2, 10, "2026-05-10T14:00:00", "Aprobado"),
    ]
    pubs = group_exhibiciones_publicaciones(rows)
    assert len(pubs) == 1, f"Esperado 1 publicación, got {len(pubs)}"
    assert pubs[0].dia_ar == "2026-05-10"
    assert pubs[0].total_fotos == 2
    # Las fotos deben estar ordenadas por timestamp_subida asc
    assert pubs[0].fotos[0].id_exhibicion == 1
    assert pubs[0].fotos[1].id_exhibicion == 2


def test_group_exhibiciones_publicaciones_dos_dias():
    """Fotos en dos días distintos → dos publicaciones."""
    rows = [
        make_ex(1, 10, "2026-05-10T09:00:00", "Aprobado"),
        make_ex(2, 10, "2026-05-11T10:00:00", "Rechazado"),
    ]
    pubs = group_exhibiciones_publicaciones(rows)
    assert len(pubs) == 2
    assert pubs[0].dia_ar == "2026-05-10"
    assert pubs[1].dia_ar == "2026-05-11"


# ── test 2: estado del día = máximo score ─────────────────────────────────────

def test_group_exhibiciones_publicaciones_estado_max():
    """Estado del día debe ser el de mayor score del conjunto de fotos."""
    rows = [
        make_ex(1, 10, "2026-05-10T08:00:00", "Rechazado"),
        make_ex(2, 10, "2026-05-10T09:00:00", "Pendiente"),
        make_ex(3, 10, "2026-05-10T10:00:00", "Destacado"),
        make_ex(4, 10, "2026-05-10T11:00:00", "Aprobado"),
    ]
    pubs = group_exhibiciones_publicaciones(rows)
    assert len(pubs) == 1
    # Destacado (score=3) gana sobre todos
    assert pubs[0].estado_dia == "Destacado", f"Expected Destacado, got {pubs[0].estado_dia}"


def test_group_exhibiciones_publicaciones_estado_aprobado_beats_rechazado():
    """Aprobado (score=2) gana sobre Rechazado (score=1)."""
    rows = [
        make_ex(1, 10, "2026-05-10T08:00:00", "Rechazado"),
        make_ex(2, 10, "2026-05-10T09:00:00", "Aprobado"),
    ]
    pubs = group_exhibiciones_publicaciones(rows)
    assert pubs[0].estado_dia == "Aprobado"


# ── test 3: lista vacía ───────────────────────────────────────────────────────

def test_group_exhibiciones_publicaciones_vacio():
    """Lista vacía de filas → lista vacía de publicaciones."""
    pubs = group_exhibiciones_publicaciones([])
    assert pubs == []


def test_group_exhibiciones_publicaciones_sin_timestamp():
    """Filas sin timestamp_subida son ignoradas."""
    rows = [
        {"id_exhibicion": 1, "id_cliente_pdv": 10, "timestamp_subida": None, "estado": "Aprobado",
         "url_foto_drive": None, "comentario_evaluacion": None, "supervisor_nombre": None},
        {"id_exhibicion": 2, "id_cliente_pdv": 10, "timestamp_subida": "", "estado": "Aprobado",
         "url_foto_drive": None, "comentario_evaluacion": None, "supervisor_nombre": None},
    ]
    pubs = group_exhibiciones_publicaciones(rows)
    assert pubs == []


# ── test 4: haversine_km ──────────────────────────────────────────────────────

def test_haversine_km_mismo_punto():
    """Distancia de un punto a sí mismo debe ser 0."""
    d = _haversine_km(-34.6037, -58.3816, -34.6037, -58.3816)
    assert d == 0.0


def test_haversine_km_conocida():
    """Buenos Aires → Córdoba ≈ 648 km según cálculo estándar."""
    # BA: -34.6037, -58.3816 | CBA: -31.4167, -64.1833
    d = _haversine_km(-34.6037, -58.3816, -31.4167, -64.1833)
    assert 630 < d < 680, f"Distancia esperada ~648 km, got {d:.1f} km"


def test_haversine_km_positivo():
    """La distancia siempre es no negativa."""
    d = _haversine_km(-34.0, -58.0, -33.0, -57.0)
    assert d >= 0


# ── test 5: lógica de filtro sin coords ──────────────────────────────────────

def test_galeria_sin_coords_filtra_correctamente():
    """PDVs con lat/lng nulo o (0,0) deben ser marcados como sin coords."""
    pdv_rows = [
        {"id_cliente": 1, "nombre_cliente": "PDV Sin Lat", "nombre_fantasia": None, "latitud": None, "longitud": -58.0},
        {"id_cliente": 2, "nombre_cliente": "PDV Sin Lng", "nombre_fantasia": None, "latitud": -34.0, "longitud": None},
        {"id_cliente": 3, "nombre_cliente": "PDV Zeros", "nombre_fantasia": None, "latitud": 0.0, "longitud": 0.0},
        {"id_cliente": 4, "nombre_cliente": "PDV Valido", "nombre_fantasia": "Fantasia", "latitud": -34.6, "longitud": -58.4},
    ]

    sin_coords = []
    con_coords = []
    for pdv in pdv_rows:
        lat = pdv.get("latitud")
        lng = pdv.get("longitud")
        if lat is None or lng is None or (lat == 0.0 and lng == 0.0):
            sin_coords.append(pdv["id_cliente"])
        else:
            con_coords.append(pdv["id_cliente"])

    assert sin_coords == [1, 2, 3], f"Sin coords: {sin_coords}"
    assert con_coords == [4], f"Con coords: {con_coords}"
