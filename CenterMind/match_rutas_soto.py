# -*- coding: utf-8 -*-
"""
match_rutas_soto.py
═══════════════════
Pre-pobla `matcheo_rutas_excepciones` para el grupo franquiciado de Ivan Soto.

Contexto real (Dist 3 – Tabaco):
  • Los uploads los hacen MONCHI AYALA y JORGE CORONEL en el grupo de Soto.
  • Los clientes (ERP) están asignados al vendor_v2 vinculado a ambos (id=30).
  • Soto (UID=9000042) puede eventualmente subir exhibiciones directamente;
    cuando lo haga, el interceptor redirigirá al vendedor real según el cliente.
  • Ambos integrantes comparten id_vendedor_v2=30 → dividimos sus rutas por día
    de la semana de forma alternada (Lunes/Miércoles/Viernes → Monchi,
    Martes/Jueves → Jorge). Ajustable post-inserción en Supabase.

Lógica:
  1. Localizar Soto (franquiciado), Monchi Ayala y Jorge Coronel en integrantes_grupo.
  2. Obtener las rutas de vendor_v2=30.
  3. Para cada ruta, obtener todos los clientes (id_cliente_erp).
  4. Asignar ruta → vendedor real según dia_semana (alternado).
  5. Crear registros en matcheo_rutas_excepciones con
     telegram_user_id_franquiciado = soto_tuid.
  6. (Opcional) Desactivar a Soto como estado_mapeo='franquiciado_inactivo'.

Correr: python match_rutas_soto.py [--dry-run] [--deactivate-soto]
"""

import os
import sys
import argparse
import logging
from dotenv import load_dotenv

_env_local = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_env_local):
    load_dotenv(_env_local)
else:
    load_dotenv()

from supabase import create_client, Client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("MatchRutasSoto")

DIST_ID = 3  # Tabaco & Hnos S.R.L.

# Día de semana → Monchi (True) o Jorge (False)
# Ajustar si se determina la distribución real desde operaciones.
DIA_ASIGNACION: dict[str, bool] = {
    "Lunes":     True,   # Monchi
    "Martes":    False,  # Jorge
    "Miércoles": True,   # Monchi
    "Miercoles": True,   # sin tilde
    "Jueves":    False,  # Jorge
    "Viernes":   True,   # Monchi
    "Sábado":    True,
    "Sabado":    True,
    "Domingo":   False,
}


def get_sb() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY no encontradas en el entorno.")
    return create_client(url, key)


def find_integrante(sb: Client, nombre_parcial: str) -> dict | None:
    res = sb.table("integrantes_grupo") \
        .select("id_integrante, telegram_user_id, nombre_integrante, estado_mapeo, id_vendedor_v2") \
        .eq("id_distribuidor", DIST_ID) \
        .ilike("nombre_integrante", f"%{nombre_parcial}%") \
        .execute()
    rows = res.data or []
    if not rows:
        log.warning(f"No se encontró integrante '%{nombre_parcial}%'")
        return None
    if len(rows) > 1:
        log.info(f"  Múltiples matches '{nombre_parcial}': {[r['nombre_integrante'] for r in rows]}")
        rows = sorted(rows, key=lambda r: (0 if r.get("estado_mapeo") == "OK" else 1, r["id_integrante"]))
    log.info(f"Seleccionado para '{nombre_parcial}': id={rows[0]['id_integrante']} "
             f"uid={rows[0]['telegram_user_id']} nombre='{rows[0]['nombre_integrante']}'")
    return rows[0]


def get_rutas_vendor(sb: Client, id_vendedor_v2: int) -> list[dict]:
    res = sb.table("rutas_v2") \
        .select("id_ruta, id_vendedor, dia_semana") \
        .eq("id_vendedor", id_vendedor_v2) \
        .execute()
    return res.data or []


def get_clientes_en_rutas(sb: Client, ruta_ids: list[int]) -> list[dict]:
    """Obtiene todos los clientes (con id_cliente_erp) en un conjunto de rutas."""
    if not ruta_ids:
        return []
    BATCH = 1000
    offset = 0
    all_rows: list[dict] = []
    while True:
        res = sb.table("clientes_pdv_v2") \
            .select("id_cliente, id_cliente_erp, id_ruta, nombre_fantasia") \
            .eq("id_distribuidor", DIST_ID) \
            .in_("id_ruta", ruta_ids) \
            .range(offset, offset + BATCH - 1) \
            .execute()
        batch = res.data or []
        all_rows.extend(batch)
        if len(batch) < BATCH:
            break
        offset += BATCH
    return all_rows


def run(dry_run: bool = False, deactivate_soto: bool = False) -> None:
    sb = get_sb()

    # ── 1. Localizar integrantes ───────────────────────────────────────────
    soto_row   = find_integrante(sb, "Soto")
    monchi_row = find_integrante(sb, "Monchi Ayala")
    jorge_row  = find_integrante(sb, "Jorge Coronel")

    if not soto_row:
        log.error("Ivan Soto no encontrado. Abortando.")
        sys.exit(1)
    if not monchi_row and not jorge_row:
        log.error("No se encontró ni Monchi ni Jorge. Abortando.")
        sys.exit(1)

    soto_tuid  = soto_row["telegram_user_id"]
    monchi_tuid = monchi_row["telegram_user_id"] if monchi_row else None
    jorge_tuid  = jorge_row["telegram_user_id"]  if jorge_row  else None

    # Si solo hay uno de los dos, todos los clientes van a él
    fallback_tuid  = monchi_tuid or jorge_tuid
    fallback_nombre = (monchi_row or jorge_row)["nombre_integrante"]

    # ── 2. Rutas del vendor_v2 compartido (id=30) ─────────────────────────
    id_vend_v2 = (monchi_row or jorge_row).get("id_vendedor_v2")
    if not id_vend_v2:
        log.error("Monchi/Jorge no tienen id_vendedor_v2 asignado. Abortando.")
        sys.exit(1)

    rutas = get_rutas_vendor(sb, id_vend_v2)
    if not rutas:
        log.warning(f"vendor_v2={id_vend_v2} no tiene rutas en rutas_v2.")
        sys.exit(0)

    log.info(f"Rutas de vendor_v2={id_vend_v2}: {len(rutas)}")
    for r in rutas:
        log.info(f"  ruta_id={r['id_ruta']} dia={r['dia_semana']}")

    ruta_ids = [r["id_ruta"] for r in rutas]

    # ── 3. Clientes en esas rutas ─────────────────────────────────────────
    clientes = get_clientes_en_rutas(sb, ruta_ids)
    log.info(f"Total clientes en rutas de vendor_v2={id_vend_v2}: {len(clientes)}")

    # Mapa ruta_id → dia_semana
    ruta_dia = {r["id_ruta"]: r["dia_semana"] for r in rutas}

    # ── 4. Armar mappings ─────────────────────────────────────────────────
    mappings: list[dict] = []
    stats = {"monchi": 0, "jorge": 0, "fallback": 0, "sin_erp": 0}

    seen_erp: set[str] = set()

    for cli in clientes:
        erp_code = cli.get("id_cliente_erp")
        if not erp_code:
            stats["sin_erp"] += 1
            continue

        # Evitar duplicados (un cliente puede aparecer en múltiples rutas)
        if erp_code in seen_erp:
            continue
        seen_erp.add(erp_code)

        dia = ruta_dia.get(cli["id_ruta"], "")
        es_monchi = DIA_ASIGNACION.get(dia, True)  # default Monchi si día desconocido

        if es_monchi and monchi_tuid:
            real_tuid  = monchi_tuid
            real_nombre = monchi_row["nombre_integrante"]
            stats["monchi"] += 1
        elif not es_monchi and jorge_tuid:
            real_tuid  = jorge_tuid
            real_nombre = jorge_row["nombre_integrante"]
            stats["jorge"] += 1
        else:
            real_tuid  = fallback_tuid
            real_nombre = fallback_nombre
            stats["fallback"] += 1

        mappings.append({
            "id_distribuidor":               DIST_ID,
            "telegram_user_id_franquiciado": soto_tuid,
            "id_cliente_erp":                erp_code,
            "telegram_user_id_real":         real_tuid,
            "nombre_vendedor_real":          real_nombre,
            "ruta_inferida":                 f"ruta_{cli['id_ruta']}_{dia}",
            "confianza":                     "media",
        })

    log.info(f"Mappings generados: {len(mappings)} | "
             f"Monchi: {stats['monchi']} | Jorge: {stats['jorge']} | "
             f"Fallback: {stats['fallback']} | Sin ERP code: {stats['sin_erp']}")

    if not mappings:
        log.warning("Sin mappings para insertar.")
        return

    if dry_run:
        log.info("[DRY-RUN] Primeros 10 mappings:")
        for m in mappings[:10]:
            log.info(f"  erp={m['id_cliente_erp']} → {m['nombre_vendedor_real']} "
                     f"({m['ruta_inferida']})")
        log.info(f"[DRY-RUN] Total: {len(mappings)}. Nada persistido.")
        return

    # ── 5. Upsert en matcheo_rutas_excepciones ────────────────────────────
    log.info("Upserteando en matcheo_rutas_excepciones...")
    BATCH = 200
    for i in range(0, len(mappings), BATCH):
        chunk = mappings[i:i + BATCH]
        sb.table("matcheo_rutas_excepciones") \
            .upsert(chunk,
                    on_conflict="id_distribuidor,telegram_user_id_franquiciado,id_cliente_erp") \
            .execute()
        log.info(f"  Insertados {min(i + BATCH, len(mappings))}/{len(mappings)}")

    log.info("✅ matcheo_rutas_excepciones actualizada.")

    # ── 6. Desactivar Soto si se solicita ─────────────────────────────────
    if deactivate_soto:
        log.info(f"Marcando Ivan Soto (id={soto_row['id_integrante']}) como "
                 f"estado_mapeo='franquiciado_inactivo'...")
        sb.table("integrantes_grupo") \
            .update({"estado_mapeo": "franquiciado_inactivo"}) \
            .eq("id_integrante", soto_row["id_integrante"]) \
            .execute()
        log.info("  OK.")

    log.info("✅ match_rutas_soto completado.")
    log.info("  → Ajustar DIA_ASIGNACION en el script si la distribución Monchi/Jorge "
             "no es correcta, luego re-ejecutar para actualizar.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Pre-pobla matcheo_rutas_excepciones para Soto → Monchi/Jorge (Dist 3)"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Muestra mappings sin escribir en la DB")
    parser.add_argument("--deactivate-soto", action="store_true",
                        help="Marca la cuenta de Ivan Soto como estado_mapeo='franquiciado_inactivo'")
    args = parser.parse_args()
    run(dry_run=args.dry_run, deactivate_soto=args.deactivate_soto)
