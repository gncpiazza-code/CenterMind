import hashlib
import json
from pathlib import Path

HASHES_FILE = Path("C:/Users/cigar/OneDrive/Desktop/BOT-SQL/antigravity/CenterMind/ShelfMind-RPA/downloads/.hashes.json")

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

def es_duplicado(clave: str, content: bytes) -> bool:
    nuevo_hash = hashlib.md5(content).hexdigest()
    hm = _cargar_hashes()
    return hm.get(clave) == nuevo_hash

def guardar_hash(clave: str, content: bytes) -> None:
    nuevo_hash = hashlib.md5(content).hexdigest()
    hm = _cargar_hashes()
    hm[clave] = nuevo_hash
    _guardar_hashes(hm)
