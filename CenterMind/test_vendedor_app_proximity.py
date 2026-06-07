"""Tests para CenterMind/core/pdv_proximity.py.

Verifica:
- Solo se retornan PDVs de la cartera del vendedor
- Radio de 100m filtra correctamente
- PDVs sin coordenadas se excluyen
- Resultado ordenado por distancia
"""
import math
import pytest
from unittest.mock import MagicMock


def haversine_metros(lat1, lon1, lat2, lon2):
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ─── Fixtures ────────────────────────────────────────────────────────────────

LAT_REF = -34.6037  # Referencia: Buenos Aires centro
LNG_REF = -58.3816

def _offset_coord(lat, lng, delta_m_lat=0.0, delta_m_lng=0.0):
    """Desplaza coordenadas por metros aproximados."""
    lat_new = lat + (delta_m_lat / 111_111)
    lng_new = lng + (delta_m_lng / (111_111 * math.cos(math.radians(lat))))
    return lat_new, lng_new


def _make_sb_mock(rutas, pdvs):
    """Construye mock de Supabase con rutas y PDVs.

    Maneja la cadena: .select().eq().in_().not_.is_().not_.is_().range().execute()
    El truco es que `.not_` es acceso de atributo (no llamada), así que
    `mock_table.not_` debe devolver `mock_table` via asignación directa.
    """
    sb = MagicMock()

    def table_side_effect(table_name):
        mock_table = MagicMock()
        mock_result = MagicMock()

        if "rutas_v2" in table_name:
            mock_result.data = rutas
        elif "clientes_pdv" in table_name:
            mock_result.data = pdvs
        else:
            mock_result.data = []

        # Configurar todos los métodos de chaining para devolver mock_table
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.in_.return_value = mock_table
        mock_table.range.return_value = mock_table
        mock_table.is_.return_value = mock_table  # para .not_.is_(...)
        mock_table.execute.return_value = mock_result

        # `.not_` es acceso de atributo, no llamada — asignar directamente
        mock_table.not_ = mock_table

        return mock_table

    sb.table.side_effect = table_side_effect
    return sb


# ─── Tests ────────────────────────────────────────────────────────────────────


def test_haversine_same_point():
    """Distancia de un punto a sí mismo es 0."""
    d = haversine_metros(LAT_REF, LNG_REF, LAT_REF, LNG_REF)
    assert d == pytest.approx(0.0, abs=1e-6)


def test_haversine_known_distance():
    """~111 km entre latitudes separadas 1 grado."""
    d = haversine_metros(0.0, 0.0, 1.0, 0.0)
    assert d == pytest.approx(111_195, abs=100)


def test_only_vendor_cartera_pdvs():
    """Solo se retornan PDVs que pertenecen a rutas del vendedor."""
    from CenterMind.core.pdv_proximity import pdvs_cercanos_cartera

    rutas = [{"id_ruta": 7, "dia_semana": "Lunes"}]

    lat_close, lng_close = _offset_coord(LAT_REF, LNG_REF, delta_m_lat=30)
    pdvs = [
        # PDV en ruta del vendedor — dentro de 100m
        {
            "id_cliente_erp": "111",
            "nombre_fantasia": "Kiosco A",
            "nombre_razon_social": None,
            "latitud": lat_close,
            "longitud": lng_close,
            "id_ruta": 7,
        },
        # PDV en ruta DIFERENTE — no debe aparecer aunque esté cerca
        {
            "id_cliente_erp": "222",
            "nombre_fantasia": "Kiosco B",
            "nombre_razon_social": None,
            "latitud": lat_close,
            "longitud": lng_close,
            "id_ruta": 99,  # ruta no asignada al vendedor
        },
    ]

    # La query filtra por id_ruta IN [7], así que el PDV ruta 99 no aparece
    sb = _make_sb_mock(rutas=rutas, pdvs=[pdvs[0]])  # solo devuelve el de ruta 7

    result = pdvs_cercanos_cartera(sb, dist_id=1, id_vendedor=42, lat=LAT_REF, lng=LNG_REF)
    erps = [r["id_cliente_erp"] for r in result]
    assert "111" in erps
    assert "222" not in erps


def test_radius_100m_filter():
    """PDVs a más de 100m no se incluyen en el resultado."""
    from CenterMind.core.pdv_proximity import pdvs_cercanos_cartera

    rutas = [{"id_ruta": 7}]

    lat_in, lng_in = _offset_coord(LAT_REF, LNG_REF, delta_m_lat=50)   # ~50m
    lat_out, lng_out = _offset_coord(LAT_REF, LNG_REF, delta_m_lat=200)  # ~200m

    pdvs = [
        {"id_cliente_erp": "CERCA", "nombre_fantasia": "Cerca", "nombre_razon_social": None,
         "latitud": lat_in, "longitud": lng_in, "id_ruta": 7},
        {"id_cliente_erp": "LEJOS", "nombre_fantasia": "Lejos", "nombre_razon_social": None,
         "latitud": lat_out, "longitud": lng_out, "id_ruta": 7},
    ]

    sb = _make_sb_mock(rutas=rutas, pdvs=pdvs)
    result = pdvs_cercanos_cartera(sb, dist_id=1, id_vendedor=42, lat=LAT_REF, lng=LNG_REF, radio_m=100)

    erps = [r["id_cliente_erp"] for r in result]
    assert "CERCA" in erps
    assert "LEJOS" not in erps


def test_pdvs_sin_coordenadas_excluidos():
    """PDVs con latitud/longitud NULL se excluyen silenciosamente."""
    from CenterMind.core.pdv_proximity import pdvs_cercanos_cartera

    rutas = [{"id_ruta": 7}]
    pdvs = [
        {"id_cliente_erp": "SIN_COORDS", "nombre_fantasia": "Sin coords", "nombre_razon_social": None,
         "latitud": None, "longitud": None, "id_ruta": 7},
        {"id_cliente_erp": "CON_COORDS", "nombre_fantasia": "Con coords", "nombre_razon_social": None,
         "latitud": LAT_REF, "longitud": LNG_REF, "id_ruta": 7},
    ]

    sb = _make_sb_mock(rutas=rutas, pdvs=pdvs)
    result = pdvs_cercanos_cartera(sb, dist_id=1, id_vendedor=42, lat=LAT_REF, lng=LNG_REF)

    erps = [r["id_cliente_erp"] for r in result]
    assert "SIN_COORDS" not in erps
    assert "CON_COORDS" in erps


def test_resultado_ordenado_por_distancia():
    """Los PDVs se retornan ordenados de más cercano a más lejano."""
    from CenterMind.core.pdv_proximity import pdvs_cercanos_cartera

    rutas = [{"id_ruta": 7}]

    lat_10, lng_10 = _offset_coord(LAT_REF, LNG_REF, delta_m_lat=10)
    lat_80, lng_80 = _offset_coord(LAT_REF, LNG_REF, delta_m_lat=80)
    lat_50, lng_50 = _offset_coord(LAT_REF, LNG_REF, delta_m_lat=50)

    pdvs = [
        {"id_cliente_erp": "A_80m", "nombre_fantasia": "A", "nombre_razon_social": None,
         "latitud": lat_80, "longitud": lng_80, "id_ruta": 7},
        {"id_cliente_erp": "B_10m", "nombre_fantasia": "B", "nombre_razon_social": None,
         "latitud": lat_10, "longitud": lng_10, "id_ruta": 7},
        {"id_cliente_erp": "C_50m", "nombre_fantasia": "C", "nombre_razon_social": None,
         "latitud": lat_50, "longitud": lng_50, "id_ruta": 7},
    ]

    sb = _make_sb_mock(rutas=rutas, pdvs=pdvs)
    result = pdvs_cercanos_cartera(sb, dist_id=1, id_vendedor=42, lat=LAT_REF, lng=LNG_REF)

    assert len(result) == 3
    erps = [r["id_cliente_erp"] for r in result]
    assert erps == ["B_10m", "C_50m", "A_80m"]
    # Verificar que distancia_m está presente y es creciente
    dists = [r["distancia_m"] for r in result]
    assert dists == sorted(dists)


def test_sin_rutas_retorna_vacio():
    """Si el vendedor no tiene rutas asignadas, retorna lista vacía."""
    from CenterMind.core.pdv_proximity import pdvs_cercanos_cartera

    sb = _make_sb_mock(rutas=[], pdvs=[])
    result = pdvs_cercanos_cartera(sb, dist_id=1, id_vendedor=42, lat=LAT_REF, lng=LNG_REF)
    assert result == []


def test_radio_personalizado():
    """Radio de 500m incluye PDVs que 100m excluiría."""
    from CenterMind.core.pdv_proximity import pdvs_cercanos_cartera

    rutas = [{"id_ruta": 7}]
    lat_300, lng_300 = _offset_coord(LAT_REF, LNG_REF, delta_m_lat=300)

    pdvs = [
        {"id_cliente_erp": "PDV_300m", "nombre_fantasia": "Lejos", "nombre_razon_social": None,
         "latitud": lat_300, "longitud": lng_300, "id_ruta": 7},
    ]

    sb = _make_sb_mock(rutas=rutas, pdvs=pdvs)

    # Con radio 100m: excluido
    result_100 = pdvs_cercanos_cartera(sb, dist_id=1, id_vendedor=42, lat=LAT_REF, lng=LNG_REF, radio_m=100)
    assert result_100 == []

    # Con radio 500m: incluido
    result_500 = pdvs_cercanos_cartera(sb, dist_id=1, id_vendedor=42, lat=LAT_REF, lng=LNG_REF, radio_m=500)
    assert any(r["id_cliente_erp"] == "PDV_300m" for r in result_500)
