# Motores deprecados

## `ventas_chess_comprobantes.py` (ex `motores/ventas.py`)

**Retirado 2026-05-30.** Descargaba comprobantes resumido/detallado desde CHESS (`ventas_v2` / analytics).

**Fuente oficial de ventas para KPIs y bultos:** Consolido → `motores/informe_ventas.py` → `ventas_enriched_v2`.

No usar `python runner.py ventas`. Usar `python runner.py informe_ventas`.
