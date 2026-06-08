"""Tests CRUD capas planificación mapa supervisión."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from services import mapa_capas_service as svc

_SAMPLE_GEOJSON = {
    "type": "Feature",
    "geometry": {
        "type": "Polygon",
        "coordinates": [[[ -58.4, -34.6], [-58.3, -34.6], [-58.3, -34.5], [-58.4, -34.5], [-58.4, -34.6]]],
    },
    "properties": {},
}


def test_validate_geojson_rejects_non_polygon():
    with pytest.raises(HTTPException) as exc:
        svc._validate_geojson_polygon({"geometry": {"type": "Point", "coordinates": [0, 0]}})
    assert exc.value.status_code == 400


def test_point_in_polygon_simple_square():
    ring = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]
    assert svc._point_in_polygon(1, 1, ring)
    assert not svc._point_in_polygon(5, 5, ring)


def test_anclar_ruta_rejects_foreign_vendedor():
    sb = MagicMock()
    capa_chain = MagicMock()
    capa_chain.select.return_value = capa_chain
    capa_chain.eq.return_value = capa_chain
    capa_chain.limit.return_value = capa_chain
    capa_chain.execute.return_value.data = [{
        "id": 1,
        "id_distribuidor": 2,
        "id_vendedor": 10,
        "id_ruta_anclada": None,
    }]

    ruta_chain = MagicMock()
    ruta_chain.select.return_value = ruta_chain
    ruta_chain.eq.return_value = ruta_chain
    ruta_chain.limit.return_value = ruta_chain
    ruta_chain.execute.return_value.data = [{"id_ruta": 99, "id_vendedor": 20}]

    def table_side(name):
        if name == svc._TABLE:
            return capa_chain
        return ruta_chain

    sb.table.side_effect = table_side

    with patch("services.mapa_capas_service.sb", sb):
        with patch(
            "services.mapa_capas_service.tenant_table_name",
            return_value="real_rutas_v2",
        ):
            with pytest.raises(HTTPException) as exc:
                svc.anclar_ruta(1, 2, 99, "tester")
    assert exc.value.status_code == 400


def test_create_capa_inserts_row():
    insert_chain = MagicMock()
    insert_chain.insert.return_value = insert_chain
    insert_chain.execute.return_value.data = [{
        "id": 7,
        "id_distribuidor": 2,
        "id_vendedor": 10,
        "nombre": "Zona A",
        "geojson": _SAMPLE_GEOJSON,
        "pdv_ids": [1, 2],
        "estado": "activo",
    }]

    sb = MagicMock()
    sb.table.return_value = insert_chain

    with patch("services.mapa_capas_service.sb", sb):
        with patch(
            "services.mapa_capas_service.resolve_pdv_ids_in_polygon",
            return_value=[1, 2],
        ):
            row = svc.create_capa({
                "id_distribuidor": 2,
                "id_vendedor": 10,
                "nombre": "Zona A",
                "geojson": _SAMPLE_GEOJSON,
            }, "u1")
    assert row["id"] == 7
    insert_chain.insert.assert_called_once()


def test_list_capas_paginated():
    list_chain = MagicMock()
    list_chain.select.return_value = list_chain
    list_chain.eq.return_value = list_chain
    list_chain.order.return_value = list_chain
    list_chain.range.return_value = list_chain
    list_chain.execute.return_value.data = [{"id": 1}]
    list_chain.execute.return_value.count = 1

    sb = MagicMock()
    sb.table.return_value = list_chain

    with patch("services.mapa_capas_service.sb", sb):
        items, total = svc.list_capas(2, offset=0, limit=50)
    assert len(items) == 1
    assert total == 1
