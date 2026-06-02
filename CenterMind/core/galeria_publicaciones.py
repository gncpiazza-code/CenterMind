# -*- coding: utf-8 -*-
"""Agrupación de exhibiciones en publicaciones lógicas (1 por PDV+día AR)."""
from collections import defaultdict

from models.schemas import GaleriaFotoPublicacion, GaleriaPublicacion

_ESTADO_SCORE = {"Destacado": 3, "Aprobado": 2, "Rechazado": 1, "Pendiente": 0}


def group_exhibiciones_publicaciones(rows: list[dict]) -> list[GaleriaPublicacion]:
    """Agrupa filas de exhibiciones en publicaciones por día AR.

    Una publicación = mismo calendar_day_AR (primeros 10 chars de timestamp_subida).
    Estado del día = foto con mayor score.
    Fotos dentro de publicación ordenadas por timestamp_subida asc.
    """
    groups: dict[str, list[dict]] = defaultdict(list)

    for ex in rows:
        dia_ar = (ex.get("timestamp_subida") or "")[:10]
        if not dia_ar:
            continue
        groups[dia_ar].append(ex)

    publicaciones = []
    for dia_ar in sorted(groups.keys()):
        day_rows = sorted(groups[dia_ar], key=lambda r: r.get("timestamp_subida") or "")
        estado_dia = max(
            (r.get("estado") or "Pendiente" for r in day_rows),
            key=lambda e: _ESTADO_SCORE.get(e, 0),
            default="Pendiente",
        )
        fotos = [
            GaleriaFotoPublicacion(
                id_exhibicion=int(r["id_exhibicion"]),
                url_foto=r.get("url_foto_drive") or "",
                estado=r.get("estado") or "Pendiente",
                timestamp_subida=r.get("timestamp_subida") or "",
                comentario=r.get("comentario_evaluacion"),
                supervisor=r.get("supervisor_nombre"),
            )
            for r in day_rows
            if r.get("id_exhibicion") is not None
        ]
        if fotos:
            publicaciones.append(GaleriaPublicacion(
                dia_ar=dia_ar,
                fotos=fotos,
                estado_dia=estado_dia,
                total_fotos=len(fotos),
            ))

    return publicaciones
