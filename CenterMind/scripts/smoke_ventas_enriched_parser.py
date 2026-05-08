#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from services.ventas_enriched_parser import parse_informe_ventas_enriched


def main() -> None:
    if len(sys.argv) < 2:
        print("uso: python scripts/smoke_ventas_enriched_parser.py <archivo.xlsx>")
        raise SystemExit(1)
    p = Path(sys.argv[1])
    rows = parse_informe_ventas_enriched(p.read_bytes())
    print("rows:", len(rows))
    if rows:
        sample = rows[0]
        keys = [
            "id_empresa", "nombre_vendedor", "fecha_factura", "id_cliente_erp",
            "cod_articulo", "bultos_total", "unidades_total", "importe_final",
        ]
        print({k: sample.get(k) for k in keys})


if __name__ == "__main__":
    main()
