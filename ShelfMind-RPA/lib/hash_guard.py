import hashlib
import json
import os
from pathlib import Path

# Directorio de datos del RPA: raíz del paquete ShelfMind-RPA/ o RPA_DATA_DIR en Docker
_RPA_ROOT = Path(__file__).resolve().parent.parent
_DATA = Path(os.environ.get("RPA_DATA_DIR", str(_RPA_ROOT / "downloads")))
HASHES_FILE = _DATA / ".hashes.json"


def _cargar_hashes() -> dict:
    if not HASHES_FILE.exists():
        return {}
    try:
        return json.loads(HASHES_FILE.read_text())
    except Exception:
        return {}


def _guardar_hashes(data: dict) -> None:
    HASHES_FILE.parent.mkdir(parents=True, exist_ok=True)
    HASHES_FILE.write_text(json.dumps(data, indent=2))


def _coerce_to_bytes(content: bytes | str) -> bytes:
    if isinstance(content, bytes):
        return content
    p = Path(content)
    if p.exists():
        return p.read_bytes()
    return content.encode("utf-8")


def es_duplicado(clave: str, content: bytes | str) -> bool:
    nuevo_hash = hashlib.md5(_coerce_to_bytes(content)).hexdigest()
    hm = _cargar_hashes()
    return hm.get(clave) == nuevo_hash


def guardar_hash(clave: str, content: bytes | str) -> None:
    nuevo_hash = hashlib.md5(_coerce_to_bytes(content)).hexdigest()
    hm = _cargar_hashes()
    hm[clave] = nuevo_hash
    _guardar_hashes(hm)
