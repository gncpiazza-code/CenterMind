from __future__ import annotations

import sys
from pathlib import Path

# motores/chess_cuentas_v2/paths.py → raíz ShelfMind-RPA
RPA_ROOT: Path = Path(__file__).resolve().parents[2]
CAPTURE_DIR: Path = RPA_ROOT / "logs" / "cuentas_v2_capture"


def ensure_rpa_on_syspath() -> Path:
    r = str(RPA_ROOT)
    if r not in sys.path:
        sys.path.insert(0, r)
    return RPA_ROOT
