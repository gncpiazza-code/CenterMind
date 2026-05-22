# -*- coding: utf-8 -*-
"""
cron_lanzar_objetivos.py
========================
Script standalone para lanzar objetivos planificados cuya fecha_inicio ya llegó.
Se ejecuta diariamente a las 08:00 AR desde el scheduler o Railway cron.

Uso:
  python scripts/cron_lanzar_objetivos.py              # todos los distribuidores
  python scripts/cron_lanzar_objetivos.py --dist 42    # solo distribuidor 42
"""

import argparse
import logging
import sys
import os

# Agregar el root del proyecto al path para importar módulos del backend
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-20s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("cron_lanzar_objetivos")


def main():
    parser = argparse.ArgumentParser(description="Lanzar objetivos planificados")
    parser.add_argument("--dist", type=int, default=None, help="ID de distribuidora (opcional)")
    args = parser.parse_args()

    logger.info(f"▶ Iniciando lanzamiento de objetivos planificados (dist={args.dist or 'todos'})")

    from services.objetivos_launch_service import lanzar_programados_fecha
    result = lanzar_programados_fecha(dist_id=args.dist)

    logger.info(
        f"✅ Lanzamiento completado — fecha={result['fecha']} "
        f"lanzados={result['lanzados']} errores={result['errores']} "
        f"total={result['total']}"
    )
    if result.get("error"):
        logger.error(f"Error global: {result['error']}")
        sys.exit(1)


if __name__ == "__main__":
    main()
